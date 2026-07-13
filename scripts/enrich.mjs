#!/usr/bin/env node
/**
 * enrich.mjs — the "paste a link and it just works" engine.
 * Plain Node 20 ESM. ZERO npm dependencies (built-in fetch + regex parsing only).
 *
 * WHAT IT DOES, per product with a URL and status needs-enrichment | needs-link:
 *   1. Fetch the page (browser User-Agent — many retailers 403 a bare node fetch), follow redirects.
 *   2. Extract name/brand/price/image from JSON-LD (preferred) -> OpenGraph -> <title> (last resort).
 *   3. Fill ONLY empty fields. Caitlin is the source of truth; the scraper is a convenience.
 *   4. Download the product image to images/products/<id>.<ext>.
 *   5. Affiliate-ize via data/affiliates.json.
 *   6. status = "live" ONLY with name + image + a REAL affiliateUrl. Otherwise "needs-attention".
 *   7. Never throw. A scrape failure must never block her.
 *
 * COMPLIANCE (do not "optimise" these away):
 *   - NO CLOAKING. We never emit a /go/<id> redirect or a shortener. Amazon's Operating
 *     Agreement forbids obscuring the referring site. The affiliateUrl written here is the
 *     literal href that will appear on the page.
 *   - Amazon is NEVER wrapped in ShopMy (ShopMy does not monetise Amazon at all, and wrapping
 *     would make the referrer ambiguous to Amazon). Two separate rails. Asserted in code below.
 *   - If the account ID is empty (not yet approved) we do NOT fabricate a link. Raw URL +
 *     needs-attention. Never silently pretend a link is monetised.
 *
 * USAGE:
 *   node scripts/enrich.mjs                  # enrich + write data/products.json
 *   node scripts/enrich.mjs --dry-run        # do everything except write JSON / save images
 *   node scripts/enrich.mjs --url=<url>      # self-test: scrape one URL, print what was extracted
 */

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PRODUCTS_JSON = path.join(ROOT, 'data', 'products.json');
const AFFILIATES_JSON = path.join(ROOT, 'data', 'affiliates.json');
const IMAGE_DIR = path.join(ROOT, 'images', 'products');
const IMAGE_DIR_REL = 'images/products';

const ARGS = process.argv.slice(2);
const DRY_RUN = ARGS.includes('--dry-run');
const ONE_URL = (ARGS.find((a) => a.startsWith('--url=')) || '').slice('--url='.length);

// A real browser UA. Sephora/Ulta/Amazon return 403 or a bot-wall to node's default UA.
const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) ' +
  'Chrome/124.0.0.0 Safari/537.36';

/* MEASURED IN CI against 14 real product URLs — this is not speculation:
 *
 *   WORKS    the brand's own site — rhodeskin.com, byoma.com, anastasiabeverlyhills.com
 *   BLOCKED  sephora.com, maccosmetics.com, charlottetilbury.com, maybelline.com, caudalie.com
 *
 * Sephora is behind serious bot protection and will NEVER scrape, whatever headers we send.
 * DO NOT keep bolting on headers trying to beat it: that is an arms race we lose, and it
 * shades into circumventing an anti-bot control we have no business circumventing.
 *
 * The real answer is the fallback. A blocked product still publishes with a working link and
 * a typographic tile, and Caitlin can drop a screenshot in /admin. That screenshot path exists
 * precisely because this one has a permanent ceiling. */
const FETCH_HEADERS = {
  'User-Agent': UA,
  Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
  'Accept-Language': 'en-US,en;q=0.9',
  'Upgrade-Insecure-Requests': '1',
  'Sec-Fetch-Dest': 'document',
  'Sec-Fetch-Mode': 'navigate',
  'Sec-Fetch-Site': 'none',
  'Sec-Fetch-User': '?1',
  'Cache-Control': 'no-cache',
};

const TIMEOUT_MS = 20000;

/* ------------------------------------------------------------------ fetching */

async function fetchWithTimeout(url, opts = {}) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    return await fetch(url, {
      redirect: 'follow', // amzn.to / a.co short links resolve here. We follow; we never *create* one.
      headers: FETCH_HEADERS,
      signal: ctrl.signal,
      ...opts,
    });
  } finally {
    clearTimeout(t);
  }
}

async function fetchHtml(url) {
  const res = await fetchWithTimeout(url);
  if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`);
  const html = await res.text();
  return { html, finalUrl: res.url || url };
}

/* ------------------------------------------------------------------ parsing */

const decodeEntities = (s) =>
  String(s)
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#(\d+);/g, (_, d) => String.fromCharCode(Number(d)))
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCharCode(parseInt(h, 16)))
    .replace(/\s+/g, ' ')
    .trim();

/** Pull a <meta> content by property/name, tolerating either attribute order. */
function metaContent(html, key) {
  const k = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const patterns = [
    new RegExp(`<meta[^>]+(?:property|name)\\s*=\\s*["']${k}["'][^>]*?content\\s*=\\s*["']([^"']*)["']`, 'i'),
    new RegExp(`<meta[^>]+content\\s*=\\s*["']([^"']*)["'][^>]*?(?:property|name)\\s*=\\s*["']${k}["']`, 'i'),
  ];
  for (const re of patterns) {
    const m = html.match(re);
    if (m && m[1] && m[1].trim()) return decodeEntities(m[1]);
  }
  return '';
}

function titleTag(html) {
  const m = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  return m ? decodeEntities(m[1]) : '';
}

/** Every <script type="application/ld+json"> block, parsed, flattened (handles @graph + arrays). */
function jsonLdNodes(html) {
  const out = [];
  const re = /<script[^>]+type\s*=\s*["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let m;
  while ((m = re.exec(html))) {
    let raw = m[1].trim().replace(/^<!--/, '').replace(/-->$/, '');
    let parsed;
    try {
      parsed = JSON.parse(raw);
    } catch {
      continue; // malformed LD-JSON is common in the wild; skip it, don't die.
    }
    const stack = [parsed];
    while (stack.length) {
      const node = stack.pop();
      if (Array.isArray(node)) {
        stack.push(...node);
      } else if (node && typeof node === 'object') {
        out.push(node);
        if (Array.isArray(node['@graph'])) stack.push(...node['@graph']);
      }
    }
  }
  return out;
}

// Schema.org has several Product flavours in the wild: "Product", "ProductGroup" (Shopify
// variants), "IndividualProduct". Matching only the exact string "product" silently missed them.
const PRODUCT_TYPES = new Set(['product', 'productgroup', 'individualproduct', 'productmodel']);

const isProductNode = (node) => {
  const t = node && node['@type'];
  if (!t) return false;
  const list = Array.isArray(t) ? t : [t];
  return list.some((x) => PRODUCT_TYPES.has(String(x).toLowerCase()));
};

/**
 * Coerce a JSON-LD value to a string.
 * `prefer` decides which key wins when the value is an object, and it MATTERS:
 *   - brand is very often { "@type": "Brand", "name": "Rare Beauty", "url": "https://..." }.
 *     Preferring `url` there wrote the brand's HOMEPAGE URL into product.brand — and since we
 *     only ever fill EMPTY fields, that garbage was permanent and rendered on her card.
 *   - image is often { "@type": "ImageObject", "url": "https://..." } and needs the opposite.
 * So: text fields ask for 'name', image asks for 'url'. Never one shared guess.
 */
const asString = (v, prefer = 'name') => {
  if (v === 0 || v) {
    if (typeof v === 'string') return v.trim();
    if (typeof v === 'number') return String(v);
    if (Array.isArray(v)) {
      for (const x of v) {
        const s = asString(x, prefer);
        if (s) return s;
      }
      return '';
    }
    if (typeof v === 'object') {
      const order =
        prefer === 'url' ? [v.url, v.contentUrl, v.name, v['@id']] : [v.name, v.url, v.contentUrl, v['@id']];
      for (const cand of order) {
        const s = asString(cand, prefer);
        if (s) return s;
      }
    }
  }
  return '';
};

function priceFromOffers(offers) {
  if (!offers) return { price: '', currency: '' };
  const list = Array.isArray(offers) ? offers : [offers];
  for (const o of list) {
    if (!o || typeof o !== 'object') continue;
    // AggregateOffer uses lowPrice; Offer uses price; some use priceSpecification.
    const raw =
      o.price ?? o.lowPrice ?? (o.priceSpecification && (o.priceSpecification.price ?? o.priceSpecification.minPrice));
    if (raw !== undefined && raw !== null && String(raw).trim() !== '') {
      return {
        price: String(raw).trim(),
        currency: String(o.priceCurrency || (o.priceSpecification && o.priceSpecification.priceCurrency) || '').trim(),
      };
    }
  }
  return { price: '', currency: '' };
}

function formatPrice(raw, currency) {
  if (!raw) return '';
  const n = Number(String(raw).replace(/[^0-9.]/g, ''));
  if (!Number.isFinite(n) || n <= 0) return '';
  const cur = (currency || 'USD').toUpperCase();
  const symbol = { USD: '$', CAD: '$', AUD: '$', GBP: '£', EUR: '€' }[cur];
  const amount = n.toFixed(2).replace(/\.00$/, '');
  return symbol ? `${symbol}${amount}` : `${amount} ${cur}`;
}

/**
 * Extract product facts from HTML.
 * Precedence: JSON-LD > OpenGraph > <title>.
 */
function extract(html, baseUrl) {
  const found = { name: '', brand: '', price: '', image: '', source: {} };

  // ---- 1. JSON-LD (most reliable, most structured)
  const product = jsonLdNodes(html).find(isProductNode);
  if (product) {
    const name = asString(product.name, 'name');
    const brand = asString(product.brand, 'name'); // 'name', NOT 'url' — see asString().
    const image = asString(product.image, 'url');
    const { price, currency } = priceFromOffers(product.offers);
    if (name) { found.name = decodeEntities(name); found.source.name = 'json-ld'; }
    if (brand) { found.brand = decodeEntities(brand); found.source.brand = 'json-ld'; }
    if (image) { found.image = image; found.source.image = 'json-ld'; }
    const p = formatPrice(price, currency);
    if (p) { found.price = p; found.source.price = 'json-ld'; }
  }

  // ---- 2. OpenGraph fallback
  if (!found.name) {
    const t = metaContent(html, 'og:title');
    if (t) { found.name = t; found.source.name = 'og'; }
  }
  if (!found.brand) {
    const b = metaContent(html, 'og:site_name') || metaContent(html, 'product:brand');
    if (b) { found.brand = b; found.source.brand = 'og'; }
  }
  if (!found.image) {
    const i = metaContent(html, 'og:image:secure_url') || metaContent(html, 'og:image');
    if (i) { found.image = i; found.source.image = 'og'; }
  }
  if (!found.price) {
    const amt = metaContent(html, 'og:price:amount') || metaContent(html, 'product:price:amount');
    const cur = metaContent(html, 'og:price:currency') || metaContent(html, 'product:price:currency');
    const p = formatPrice(amt, cur);
    if (p) { found.price = p; found.source.price = 'og'; }
  }

  // Resolve a protocol-relative or root-relative image URL against the page.
  if (found.image) {
    try {
      found.image = new URL(found.image, baseUrl).href;
    } catch {
      found.image = '';
    }
  }

  // ---- 3. <title> — last resort, and DELIBERATELY the most distrusted source.
  //
  // Retailers serve bot-wall interstitials with a 200 status. Amazon's is a ~5KB page
  // titled just "Amazon.com". Naively taking that <title> writes name:"Amazon.com" into
  // products.json — and because we only ever fill EMPTY fields, that junk would be
  // PERMANENT: a later successful re-scrape would skip the name (it's no longer empty).
  // We'd have silently corrupted Caitlin's data with no way to self-heal.
  //
  // Invariant: a genuine product page essentially always exposes an image (JSON-LD or og:image).
  // So we only trust <title> when we actually found an image. A page with no image is headed
  // for needs-attention anyway, so refusing to persist its title costs us nothing and
  // protects the data. Plus an explicit junk-title filter for walls that DO serve an og:image.
  if (!found.name && found.image) {
    const t = titleTag(html);
    // "Product Name | Retailer" / "Product Name - Retailer" -> keep the meatiest chunk.
    const candidate = t ? t.split(/\s+[|–—-]\s+/)[0].trim() || t : '';
    if (candidate && !isJunkTitle(candidate)) {
      found.name = candidate;
      found.source.name = 'title';
    }
  }

  return found;
}

/** Bot walls, error pages, and bare retailer names — never let these become a product name. */
const JUNK_TITLE = [
  /^amazon(\.com)?$/i,
  /^robot check$/i,
  /^bot check/i,
  /^are you a (human|robot)/i,
  /^access (denied|to this page has been denied)/i,
  /^attention required/i,
  /^just a moment/i,
  /^one more step/i,
  /^security check/i,
  /^(page|product) not found/i,
  /^404\b/,
  /^403\b/,
  /^error\b/i,
  /^sorry[!,. ]/i,
  /^loading\b/i,
  /^untitled/i,
];

function isJunkTitle(t) {
  const s = String(t).trim();
  if (s.length < 3) return true;
  return JUNK_TITLE.some((re) => re.test(s));
}

/* ------------------------------------------------------------------ images */

const EXT_BY_MIME = {
  'image/jpeg': '.jpg',
  'image/jpg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
  'image/avif': '.avif',
  'image/gif': '.gif',
};

/**
 * Download the product image to images/products/<id>.<ext>.
 * Large images are fine — scripts/images.mjs converts to WebP afterwards.
 * Returns the repo-relative path, or '' on failure.
 */
async function downloadImage(id, imageUrl) {
  const res = await fetchWithTimeout(imageUrl, { headers: { ...FETCH_HEADERS, Accept: 'image/*,*/*;q=0.8' } });
  if (!res.ok) throw new Error(`image HTTP ${res.status}`);

  const mime = (res.headers.get('content-type') || '').split(';')[0].trim().toLowerCase();
  let ext = EXT_BY_MIME[mime];
  if (!ext) {
    const guess = path.extname(new URL(imageUrl).pathname).toLowerCase();
    ext = ['.jpg', '.jpeg', '.png', '.webp', '.avif', '.gif'].includes(guess) ? guess : '';
  }
  if (!ext) throw new Error(`unsupported image type "${mime || 'unknown'}"`);
  if (ext === '.jpeg') ext = '.jpg';

  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.length < 1024) throw new Error(`image suspiciously small (${buf.length} bytes)`);

  const rel = `${IMAGE_DIR_REL}/${id}${ext}`;
  if (!DRY_RUN) {
    await mkdir(IMAGE_DIR, { recursive: true });
    await writeFile(path.join(IMAGE_DIR, `${id}${ext}`), buf);
  }
  return rel;
}

/* ------------------------------------------------------- affiliate-ization */

const hostOf = (url) => {
  try {
    return new URL(url).hostname.toLowerCase().replace(/^www\./, '');
  } catch {
    return '';
  }
};

const domainMatches = (host, domain) => {
  const d = String(domain).toLowerCase().replace(/^www\./, '');
  return host === d || host.endsWith(`.${d}`);
};

// Amazon's own short links. A `?tag=` appended to one of these is THROWN AWAY by the
// redirect — the click lands on amazon.com with no tag and earns nothing, while we would
// have happily written network:"amazon" and status:"live". That is exactly the
// "silently pretend a link is monetised" failure the compliance rules forbid.
// We only ever affiliate-ize the RESOLVED url; if it is still a shortener, resolution
// failed and we refuse to fake it.
const SHORTENER_HOSTS = ['amzn.to', 'a.co', 'amzn.eu', 'amzn.asia'];
const isShortener = (host) => SHORTENER_HOSTS.some((d) => domainMatches(host, d));

/**
 * A PLACEHOLDER ACCOUNT ID IS WORSE THAN AN EMPTY ONE.
 *
 * Empty means "not approved yet" and we correctly refuse to build a link. But a dummy value
 * like "123456" or "your-tag-20" sails straight through: we build ?tag=123456, mark the
 * product `live`, and build.mjs renders it with rel="sponsored". Caitlin then has a shop full
 * of links that LOOK monetised, are advertised as sponsored, and pay her nothing — the exact
 * "never silently pretend a link is monetised" failure, and an Amazon Associates violation to
 * boot (you may not operate under a tag you don't own).
 *
 * So: anything that smells like a fill-me-in value is treated as EMPTY. A real tag
 * ("cakedbycaitlin-20") passes; "123456" / "TODO" / "your-id-here" does not.
 */
const PLACEHOLDER_ACCOUNT = [
  /^$/,
  /^\d{1,8}$/,                       // "123456" — no real ShopMy id or Amazon tag is a bare number
  /^(x+|y+|z+|a+|abc\d*)$/i,
  /todo|tbd|fixme|replace|placeholder|example|changeme|dummy|test/i,
  /^your[-_ ]/i,
  /^<.*>$/,                          // "<your tag>"
];

const isPlaceholderAccount = (v) => PLACEHOLDER_ACCOUNT.some((re) => re.test(String(v || '').trim()));

/**
 * Turn a raw retailer URL into Caitlin's commissionable link.
 * Returns { affiliateUrl, network, reason } — reason explains a non-monetised result in plain English.
 */
function affiliatize(rawUrl, affiliates) {
  const host = hostOf(rawUrl);
  const rules = affiliates.rules || {};
  const accounts = affiliates.accounts || {};
  const rawAmazonTag = (accounts.amazonTag || '').trim();
  const rawShopMyUserId = (accounts.shopMyUserId || '').trim();

  // A placeholder is deliberately collapsed to "" so it takes the not-approved-yet path below.
  const amazonTag = isPlaceholderAccount(rawAmazonTag) ? '' : rawAmazonTag;
  const shopMyUserId = isPlaceholderAccount(rawShopMyUserId) ? '' : rawShopMyUserId;
  const placeholderNote = (field, raw) =>
    raw ? ` (the value "${raw}" in data/affiliates.json looks like a placeholder, not a real ${field} — it is being ignored on purpose)` : '';

  const isAmazon = (rules.amazon?.domains || []).some((d) => domainMatches(host, d));
  const isShopMy = (rules.shopmy?.domains || []).some((d) => domainMatches(host, d));

  // ─────────────────────────────────────────────────────────────────────────
  // RAIL 1: AMAZON. Checked FIRST and returned unconditionally.
  // An Amazon URL must NEVER fall through into the ShopMy wrap below.
  // ShopMy does not monetise Amazon at all, and wrapping an Amazon link in a
  // third-party redirect makes the referring site ambiguous to Amazon — a
  // cloaking violation of the Associates Operating Agreement. Two separate rails.
  // ─────────────────────────────────────────────────────────────────────────
  if (isAmazon) {
    if (isShortener(host)) {
      return {
        affiliateUrl: '',
        network: '',
        reason:
          `"${host}" is an Amazon short link we could not resolve to a real amazon.com product URL ` +
          `(Amazon blocked the fetch). A ?tag= on a short link is dropped by the redirect and earns NOTHING, ` +
          `so we refuse to fake it. Open the link in a browser and paste the full amazon.com/... URL instead.`,
      };
    }
    if (!amazonTag) {
      return {
        affiliateUrl: '',
        network: '',
        reason:
          'Amazon link, but affiliates.json accounts.amazonTag is empty (Associates not approved yet). Publishing raw, NOT earning.' +
          placeholderNote('Amazon Associates tag', rawAmazonTag),
      };
    }
    let u;
    try {
      u = new URL(rawUrl);
    } catch {
      return { affiliateUrl: '', network: '', reason: `unparseable URL: ${rawUrl}` };
    }
    // Exactly what Amazon's own SiteStripe does: append/replace ?tag=. No redirect, no shortener.
    u.searchParams.set('tag', amazonTag);
    return { affiliateUrl: u.href, network: 'amazon', reason: '' };
  }

  // ─────────────────────────────────────────────────────────────────────────
  // RAIL 2: SHOPMY. Unreachable for Amazon domains by construction (early return above).
  // ─────────────────────────────────────────────────────────────────────────
  if (isShopMy) {
    if (!shopMyUserId) {
      return {
        affiliateUrl: '',
        network: '',
        reason:
          'ShopMy retailer, but affiliates.json accounts.shopMyUserId is empty (not approved yet). Publishing raw, NOT earning.' +
          placeholderNote('ShopMy user id', rawShopMyUserId),
      };
    }
    const tpl = rules.shopmy.template || 'https://go.shopmy.us/apx/{shopMyUserId}?url={encodedUrl}';
    const affiliateUrl = tpl
      .replace('{shopMyUserId}', encodeURIComponent(shopMyUserId))
      .replace('{encodedUrl}', encodeURIComponent(rawUrl));

    // Belt-and-braces assertion: if this ever wraps an Amazon URL, we have a bug. Fail loud.
    if (/(^|\.)(amazon\.[a-z.]+|amzn\.to|a\.co)$/i.test(host)) {
      throw new Error('COMPLIANCE BUG: attempted to wrap an Amazon URL in ShopMy. Refusing.');
    }
    return { affiliateUrl, network: 'shopmy', reason: '' };
  }

  // ─────────────────────────────────────────────────────────────────────────
  // FALLBACK: unknown domain. Publish the raw link so the card still works,
  // but never pretend it earns. /admin will show it as needs-attention.
  // ─────────────────────────────────────────────────────────────────────────
  return {
    affiliateUrl: '',
    network: '',
    reason: `no affiliate rule for "${host || 'unknown host'}" — link works but is NOT earning. Add the domain to data/affiliates.json if it's in a network.`,
  };
}

/* ------------------------------------------------------------------- ids */

/**
 * MINT AN ID FOR A BRAND-NEW PRODUCT.
 *
 * When Caitlin taps "+ Add product" in /admin, Sveltia hands us an item with `id: ""` —
 * admin/config.yml literally promises her "Leave blank on a new product. It gets created
 * for you." Nothing was creating it. The fallout, verified by running the script:
 *   - the image was saved to `images/products/.png` — a dotfile with NO basename,
 *   - so EVERY new product overwrote the same file and showed the same photo,
 *   - build.mjs emitted data-track="product:" (blank) for click tracking,
 *   - and the product still went `status: live`, so the breakage shipped to the shop.
 * The id must exist BEFORE downloadImage() runs, which is why this is called mid-enrich,
 * after the scrape (so we can use the real product name) and before the image is written.
 */
const COMBINING_MARKS = /[̀-ͯ]/g; // NFKD splits é into "e" + U+0301; drop the mark.
const APOSTROPHES = /['‘’]/g;

const slugify = (s) =>
  String(s)
    .normalize('NFKD')
    .replace(COMBINING_MARKS, '') // Crème -> Creme, L'Oréal -> L'Oreal
    .toLowerCase()
    .replace(APOSTROPHES, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48)
    .replace(/-+$/, '');

/** Best-effort readable slug from a URL: the product path segment, else the host. */
function slugFromUrl(url) {
  try {
    const u = new URL(url);
    const segs = u.pathname.split('/').filter(Boolean);
    // Prefer the last segment that isn't a bare id/"p"/"dp"/"product".
    for (const seg of [...segs].reverse()) {
      const s = slugify(decodeURIComponent(seg));
      if (s && s.length > 3 && !/^(p|dp|gp|ref|product|products|item)$/.test(s) && !/^\d+$/.test(s)) return s;
    }
    return slugify(u.hostname.replace(/^www\./, '').split('.')[0]);
  } catch {
    return '';
  }
}

function mintId(product, usedIds) {
  const base =
    slugify([product.brand, product.name].filter(Boolean).join(' ')) ||
    slugFromUrl(product.url) ||
    'product';
  let id = base;
  let n = 2;
  while (usedIds.has(id)) id = `${base}-${n++}`; // never collide with an existing product
  usedIds.add(id);
  return id;
}

/* ------------------------------------------------------------- serializing */

/**
 * Write products.json back in the SAME hand-authored shape:
 *   - "$comment" preserved verbatim, first
 *   - one product per line (tiny, reviewable diffs)
 *   - original key order per product preserved
 *   - a blank line between category groups, like the seeded file
 */
function serializeProducts(doc) {
  const lines = [];
  lines.push('{');
  if (doc['$comment']) {
    lines.push(`  "$comment": ${JSON.stringify(doc['$comment'], null, 2).split('\n').join('\n  ')},`);
  }
  lines.push('  "products": [');

  const items = doc.products || [];
  let prevCategory = null;
  items.forEach((p, i) => {
    if (prevCategory !== null && p.category !== prevCategory) lines.push('');
    prevCategory = p.category;
    const body = Object.entries(p)
      .map(([k, v]) => `${JSON.stringify(k)}: ${JSON.stringify(v)}`)
      .join(', ');
    lines.push(`    { ${body} }${i === items.length - 1 ? '' : ','}`);
  });

  lines.push('  ]');
  lines.push('}');
  return lines.join('\n') + '\n';
}

/* ------------------------------------------------------------------- report */

function printSummary(rows) {
  const pad = (s, n) => String(s).padEnd(n).slice(0, n);
  const live = rows.filter((r) => r.status === 'live');
  const attention = rows.filter((r) => r.status === 'needs-attention');
  const skipped = rows.filter((r) => r.status === 'skipped');

  console.log('\n' + '='.repeat(96));
  console.log('ENRICHMENT SUMMARY' + (DRY_RUN ? '   (DRY RUN — nothing written)' : ''));
  console.log('='.repeat(96));
  console.log(`${pad('PRODUCT', 30)}${pad('STATUS', 18)}${pad('NETWORK', 10)}WHY`);
  console.log('-'.repeat(96));
  for (const r of [...live, ...attention, ...skipped]) {
    console.log(`${pad(r.id, 30)}${pad(r.status, 18)}${pad(r.network || '—', 10)}${r.why || ''}`);
  }
  console.log('-'.repeat(96));
  console.log(`  LIVE (visible + earning):   ${live.length}`);
  console.log(`  NEEDS ATTENTION (hidden):   ${attention.length}`);
  console.log(`  WAITING (no link pasted):   ${skipped.length}`);
  console.log('='.repeat(96) + '\n');

  if (attention.length) {
    console.log('A product only goes LIVE with name + image + a REAL affiliate link.');
    console.log('Anything above that is "needs-attention" is HIDDEN on the shop — by design.');
    console.log('A card that renders beautifully and earns nothing is the failure we are avoiding.\n');
  }
}

/* --------------------------------------------------------------- self-test */

async function selfTest(url) {
  console.log(`\nSELF-TEST — scraping: ${url}\n`);
  try {
    const { html, finalUrl } = await fetchHtml(url);
    console.log(`  fetched ok      ${html.length.toLocaleString()} bytes`);
    if (finalUrl !== url) console.log(`  redirected to   ${finalUrl}`);
    const f = extract(html, finalUrl);
    console.log(`  name            ${f.name || '(none)'}   [${f.source.name || '—'}]`);
    console.log(`  brand           ${f.brand || '(none)'}  [${f.source.brand || '—'}]`);
    console.log(`  price           ${f.price || '(none)'}  [${f.source.price || '—'}]`);
    console.log(`  image           ${f.image || '(none)'}  [${f.source.image || '—'}]`);

    const affiliates = JSON.parse(await readFile(AFFILIATES_JSON, 'utf8'));
    const aff = affiliatize(finalUrl, affiliates);
    console.log(`  affiliateUrl    ${aff.affiliateUrl || '(none)'}`);
    console.log(`  network         ${aff.network || '(none)'}`);
    if (aff.reason) console.log(`  reason          ${aff.reason}`);

    const ok = Boolean(f.name && f.image);
    console.log(`\n  RESULT: ${ok ? 'PASS — extracted a title and an image.' : 'FAIL — missing title and/or image.'}\n`);
    process.exitCode = ok ? 0 : 1;
  } catch (err) {
    console.log(`  FAIL — ${err.message}\n`);
    process.exitCode = 1;
  }
}

/* -------------------------------------------------------------------- main */

/** Write the affiliate link + network onto the product. Shared by the full and re-link paths. */
function applyAffiliate(product, url, affiliates, problems) {
  try {
    const aff = affiliatize(url, affiliates);
    product.affiliateUrl = aff.affiliateUrl || '';
    product.affiliateNetwork = aff.network || '';
    if (aff.reason) problems.push(aff.reason);
    return aff.network || '';
  } catch (err) {
    // Only the compliance assertion throws here. Fail the product, never the run.
    product.affiliateUrl = '';
    product.affiliateNetwork = '';
    problems.push(err.message);
    return '';
  }
}

async function enrichOne(product, affiliates, rows, usedIds) {
  const url = (product.url || '').trim();

  if (!url) {
    rows.push({ id: product.id, status: 'skipped', network: product.affiliateNetwork, why: 'no url yet — waiting on Caitlin' });
    return;
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // ALREADY LIVE: do NOT re-scrape (that would hammer retailers on every push).
  // But DO recompute the affiliate link, for free, with no network call. Her Amazon
  // tag or ShopMy id can change (or first get filled in) and a live card must never
  // keep serving a stale/dead affiliate href. If the link stops being monetisable,
  // demote it — build.mjs renders href="${p.affiliateUrl}" with rel="sponsored", so a
  // live product with an empty affiliateUrl emits href="" and the deploy workflow's
  // dead-link assertion hard-fails the whole site.
  // ─────────────────────────────────────────────────────────────────────────────
  if (product.status === 'live') {
    const problems = [];
    const before = product.affiliateUrl;
    const network = applyAffiliate(product, url, affiliates, problems);
    if (!product.affiliateUrl) {
      product.status = 'needs-attention';
      rows.push({ id: product.id, status: 'needs-attention', network, why: `was live but is no longer monetisable: ${problems.join('; ')}` });
      return;
    }
    rows.push({
      id: product.id,
      status: 'live',
      network,
      why: before === product.affiliateUrl ? `${product.name} — unchanged` : `${product.name} — affiliate link refreshed`,
    });
    return;
  }

  // Everything else with a URL gets (re)enriched — INCLUDING needs-attention.
  //
  // needs-attention used to be skipped ("nothing to do"), which quietly made the whole
  // recovery story a lie: a product that hit a bot wall, or that failed only because
  // affiliates.json still had an empty amazonTag, was frozen in that state FOREVER. Note
  // enrich.yml deliberately triggers on changes to data/affiliates.json — that trigger
  // existed purely to re-monetise these products the day her Associates account is
  // approved, and it did nothing at all. needs-attention means "retry me", not "give up".
  const problems = [];

  // ---- scrape (never fatal). resolvedUrl matters: see affiliatize()/isShortener().
  let resolvedUrl = url;
  try {
    const { html, finalUrl } = await fetchHtml(url);
    resolvedUrl = finalUrl || url;
    const f = extract(html, resolvedUrl);

    // Fill ONLY where empty. Caitlin's typing always wins.
    if (!product.name && f.name) product.name = f.name;
    if (!product.brand && f.brand) product.brand = f.brand;
    if (!product.price && f.price) product.price = f.price;

    // The id must exist before we can name an image file. New products from /admin arrive
    // with id:"" — mint one now that we (hopefully) know the real product name.
    if (!product.id) product.id = mintId(product, usedIds);

    if (!product.image && f.image) {
      try {
        product.image = await downloadImage(product.id, f.image);
      } catch (err) {
        problems.push(`image download failed (${err.message})`);
      }
    }
    if (!f.name && !f.image) problems.push('page gave us no title and no image (bot wall?)');
  } catch (err) {
    problems.push(`fetch failed (${err.message})`);
  }

  // Fetch failed entirely -> still no id. Fall back to a slug off the pasted URL.
  if (!product.id) product.id = mintId(product, usedIds);

  // ---- affiliate-ize the RESOLVED url (independent of scrape success — the link still matters).
  // Using the raw url here meant an amzn.to / a.co short link got "?tag=..." pinned to the
  // SHORTENER, where the redirect throws it away: a card marked live + network:amazon that
  // earns nothing. affiliatize() now refuses an unresolved shortener outright.
  const network = applyAffiliate(product, resolvedUrl, affiliates, problems);

  // ---- status gate: name + image + REAL affiliate link, or it does not ship.
  if (!product.name) problems.push('no name');
  if (!product.image) problems.push('no image');
  if (!product.affiliateUrl) problems.push('no affiliate link');

  const goLive = Boolean(product.name && product.image && product.affiliateUrl);
  product.status = goLive ? 'live' : 'needs-attention';

  // Amazon's Operating Agreement requires genuine commentary, not a bare product grid.
  // Not a blocker (Sveltia marks the note field required), but say it out loud.
  if (goLive && !String(product.note || '').trim()) {
    problems.push('WARNING: no note. Amazon requires real commentary next to affiliate links.');
  }

  rows.push({
    id: product.id,
    status: product.status,
    network,
    why: goLive
      ? `${product.name}${product.price ? ` — ${product.price}` : ''}${problems.length ? ` [${problems.join('; ')}]` : ''}`
      : problems.join('; '),
  });
}

async function main() {
  if (ONE_URL) return selfTest(ONE_URL);

  if (!existsSync(PRODUCTS_JSON) || !existsSync(AFFILIATES_JSON)) {
    console.error('Missing data/products.json or data/affiliates.json. Nothing to do.');
    process.exitCode = 1;
    return;
  }

  const doc = JSON.parse(await readFile(PRODUCTS_JSON, 'utf8'));
  const affiliates = JSON.parse(await readFile(AFFILIATES_JSON, 'utf8'));

  const tag = affiliates.accounts?.amazonTag;
  const smid = affiliates.accounts?.shopMyUserId;
  for (const [field, val] of [['amazonTag', tag], ['shopMyUserId', smid]]) {
    if (String(val || '').trim() && isPlaceholderAccount(val)) {
      console.log(
        `\n::warning::data/affiliates.json accounts.${field} = "${String(val).trim()}" looks like a PLACEHOLDER.\n` +
          '      It is being treated as empty. Products on that network will stay hidden\n' +
          '      (needs-attention) rather than shipping a link that claims to earn and does not.\n'
      );
    }
  }
  if (isPlaceholderAccount(tag) && isPlaceholderAccount(smid)) {
    console.log(
      '\nNOTE: neither amazonTag nor shopMyUserId in data/affiliates.json holds a real account id.\n' +
        '      Nothing can legitimately go live until at least one is filled in.\n' +
        '      Products will be enriched and flagged needs-attention — this is correct,\n' +
        '      not a bug. We do not fabricate affiliate links.\n'
    );
  }

  // Every id already in the file, so a newly minted one can never collide with (and
  // therefore never overwrite the image of, or be confused with) an existing product.
  const usedIds = new Set((doc.products || []).map((p) => p.id).filter(Boolean));

  const rows = [];
  for (const product of doc.products || []) {
    try {
      await enrichOne(product, affiliates, rows, usedIds);
    } catch (err) {
      // Absolute backstop. One bad product can never take down her whole shop.
      console.error(`[${product.id}] unexpected error: ${err.stack || err.message}`);
      product.status = 'needs-attention';
      rows.push({ id: product.id, status: 'needs-attention', network: '', why: `unexpected error: ${err.message}` });
    }
  }

  if (!DRY_RUN) await writeFile(PRODUCTS_JSON, serializeProducts(doc), 'utf8');
  printSummary(rows);
}

main().catch((err) => {
  console.error('enrich.mjs fatal:', err);
  process.exitCode = 1;
});
