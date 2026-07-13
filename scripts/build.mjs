#!/usr/bin/env node
/**
 * Pre-renders data/*.json into static HTML inside index.html.
 *
 * Why pre-render instead of fetching JSON in the browser: search is Caitlin's ONLY inbound
 * channel — she has no booking form, no email, no phone. A shop that only exists after
 * JavaScript runs is a weak thing to hand a crawler. So the products ship as real HTML.
 *
 * Writes between <!--BUILD:X:START--> and <!--BUILD:X:END--> markers in index.html,
 * so the file stays hand-editable. Also emits sitemap.xml.
 *
 * No dependencies. Node 20+. Run: node scripts/build.mjs
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

const readJSON = (p) => JSON.parse(readFileSync(join(ROOT, p), 'utf8'));

/** Escape for HTML text/attribute context. Product names come from scraped pages — never trust them. */
const esc = (s) =>
  String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

const site = readJSON('data/site.json');
const { categories } = readJSON('data/categories.json');
const { products } = readJSON('data/products.json');
const { items: merch } = readJSON('data/merch.json');
const { links } = readJSON('data/links.json');
const { looks } = readJSON('data/looks.json');

const cats = [...categories].sort((a, b) => a.order - b.order);

/* Only 'live' products render. A card that looks perfect but earns nothing is the failure
 * mode we're avoiding — better to show nothing than to show a link that pays her $0. */
const live = products.filter((p) => p.status === 'live');
const liveByCat = (id) => live.filter((p) => p.category === id);

const activeMerch = merch.filter((m) => m.status === 'live' || m.stripeUrl);

/* Any social left blank in site.json is dropped entirely. The old site shipped four icons all
 * pointing at href="#" — they did nothing and threw a console error. Empty means gone, not broken. */
const SOCIAL_ICONS = {
  instagram: '<path d="M12 2.2c3.2 0 3.6 0 4.9.07 1.2.05 1.8.25 2.2.42.6.22 1 .48 1.4.9.4.4.7.8.9 1.4.2.4.4 1 .4 2.2.1 1.3.1 1.7.1 4.9s0 3.6-.1 4.9c0 1.2-.2 1.8-.4 2.2-.2.6-.5 1-.9 1.4-.4.4-.8.7-1.4.9-.4.2-1 .4-2.2.4-1.3.1-1.7.1-4.9.1s-3.6 0-4.9-.1c-1.2 0-1.8-.2-2.2-.4-.6-.2-1-.5-1.4-.9-.4-.4-.7-.8-.9-1.4-.2-.4-.4-1-.4-2.2C2.2 15.6 2.2 15.2 2.2 12s0-3.6.1-4.9c0-1.2.2-1.8.4-2.2.2-.6.5-1 .9-1.4.4-.4.8-.7 1.4-.9.4-.2 1-.4 2.2-.4C8.4 2.2 8.8 2.2 12 2.2m0 2.1c-3.1 0-3.5 0-4.7.08-1.1.05-1.7.24-2.1.4-.5.2-.9.44-1.3.84-.4.4-.64.8-.84 1.3-.16.4-.35 1-.4 2.1C2.58 10.2 2.58 10.6 2.58 12s0 1.8.08 3c.05 1.1.24 1.7.4 2.1.2.5.44.9.84 1.3.4.4.8.64 1.3.84.4.16 1 .35 2.1.4 1.2.08 1.6.08 4.7.08s3.5 0 4.7-.08c1.1-.05 1.7-.24 2.1-.4.5-.2.9-.44 1.3-.84.4-.4.64-.8.84-1.3.16-.4.35-1 .4-2.1.08-1.2.08-1.6.08-3s0-1.8-.08-3c-.05-1.1-.24-1.7-.4-2.1-.2-.5-.44-.9-.84-1.3-.4-.4-.8-.64-1.3-.84-.4-.16-1-.35-2.1-.4-1.2-.08-1.6-.08-4.7-.08z"/><path d="M12 7.1a4.9 4.9 0 100 9.8 4.9 4.9 0 000-9.8zm0 8.08a3.18 3.18 0 110-6.36 3.18 3.18 0 010 6.36z"/><circle cx="17.1" cy="6.9" r="1.15"/>',
  tiktok: '<path d="M19.59 6.69a4.83 4.83 0 01-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 01-2.88 2.5 2.89 2.89 0 01-2.89-2.89 2.89 2.89 0 012.89-2.89c.28 0 .54.04.79.1v-3.5a6.37 6.37 0 00-.79-.05A6.34 6.34 0 003.15 15.2a6.34 6.34 0 006.34 6.34 6.34 6.34 0 006.34-6.34V8.84a8.27 8.27 0 004.76 1.5v-3.4a4.85 4.85 0 01-1-.25z"/>',
  facebook: '<path d="M22 12a10 10 0 10-11.56 9.87v-6.99H7.9V12h2.54V9.8c0-2.5 1.49-3.89 3.77-3.89 1.1 0 2.24.2 2.24.2v2.46h-1.26c-1.24 0-1.63.77-1.63 1.56V12h2.78l-.45 2.88h-2.33v6.99A10 10 0 0022 12z"/>',
  pinterest: '<path d="M12 2a10 10 0 00-3.65 19.31c-.09-.78-.17-1.98.03-2.83.18-.78 1.19-4.97 1.19-4.97s-.3-.6-.3-1.5c0-1.4.81-2.45 1.83-2.45.86 0 1.28.65 1.28 1.43 0 .87-.56 2.17-.84 3.38-.24 1.01.5 1.84 1.5 1.84 1.8 0 3.19-1.9 3.19-4.65 0-2.43-1.75-4.13-4.24-4.13-2.89 0-4.59 2.17-4.59 4.4 0 .87.34 1.81.76 2.32a.3.3 0 01.07.29l-.28 1.15c-.05.19-.15.23-.35.14-1.3-.61-2.11-2.5-2.11-4.03 0-3.28 2.38-6.29 6.87-6.29 3.6 0 6.4 2.57 6.4 6 0 3.58-2.25 6.46-5.39 6.46-1.05 0-2.04-.55-2.38-1.19l-.65 2.470c-.23.9-.86 2.03-1.28 2.72A10 10 0 1012 2z"/>',
  youtube: '<path d="M23 12s0-3.2-.4-4.74a2.5 2.5 0 00-1.77-1.77C19.28 5.1 12 5.1 12 5.1s-7.28 0-8.83.4c-.85.22-1.53.9-1.76 1.76C1 8.8 1 12 1 12s0 3.2.41 4.74c.23.85.9 1.53 1.76 1.76 1.55.4 8.83.4 8.83.4s7.28 0 8.83-.4a2.5 2.5 0 001.77-1.76C23 15.2 23 12 23 12zM9.7 15.02V8.98L15.9 12l-6.2 3.02z"/>',
};

/* ---------- head: SEO, OG, JSON-LD ---------- */
function buildHead() {
  const { seo, name } = site;
  const url = seo.url.replace(/\/?$/, '/');

  /* Only advertise an og:image if the file actually exists on disk. Pointing at a missing
   * image is worse than omitting the tag — the scraper renders a blank card and the link
   * looks broken, which is the exact opposite of what a share is for. */
  const ogImage = seo.ogImage && existsSync(join(ROOT, seo.ogImage)) ? new URL(seo.ogImage, url).href : '';

  const sameAs = Object.entries(site.socials)
    .filter(([k, v]) => k !== '$comment' && v)
    .map(([, v]) => v);

  /* Person, not LocalBusiness: she takes no bookings and has no storefront address.
   * Claiming to be a local business you can't visit or contact is a bad signal. */
  const ld = {
    '@context': 'https://schema.org',
    '@type': 'ProfilePage',
    mainEntity: {
      '@type': 'Person',
      name,
      description: site.bio,
      url,
      jobTitle: 'Hair & Makeup Artist',
      ...(site.headshot ? { image: new URL(site.headshot, url).href } : {}),
      // sameAs only if she actually has profiles — an empty array is noise, not a signal.
      ...(sameAs.length ? { sameAs } : {}),
    },
  };

  const itemList = live.length
    ? {
        '@context': 'https://schema.org',
        '@type': 'ItemList',
        name: `${name} — the product edit`,
        numberOfItems: live.length,
        itemListElement: live.map((p, i) => ({
          '@type': 'ListItem',
          position: i + 1,
          item: {
            '@type': 'Product',
            name: [p.brand, p.name].filter(Boolean).join(' '),
            ...(p.brand ? { brand: { '@type': 'Brand', name: p.brand } } : {}),
            ...(p.image ? { image: new URL(p.image, url).href } : {}),
            ...(p.affiliateUrl ? { url: p.affiliateUrl } : {}),
          },
        })),
      }
    : null;

  return [
    `<title>${esc(seo.title)}</title>`,
    `<meta name="description" content="${esc(seo.description)}">`,
    `<link rel="canonical" href="${esc(url)}">`,
    ``,
    `<meta property="og:type" content="profile">`,
    `<meta property="og:site_name" content="${esc(name)}">`,
    `<meta property="og:title" content="${esc(seo.title)}">`,
    `<meta property="og:description" content="${esc(seo.description)}">`,
    `<meta property="og:url" content="${esc(url)}">`,
    ogImage ? `<meta property="og:image" content="${esc(ogImage)}">` : `<!-- og:image: add og-image.jpg (1200x630) — a link shared to Instagram currently renders with no picture -->`,
    ogImage ? `<meta property="og:image:width" content="1200">` : '',
    ogImage ? `<meta property="og:image:height" content="630">` : '',
    `<meta name="twitter:card" content="${ogImage ? 'summary_large_image' : 'summary'}">`,
    `<meta name="twitter:title" content="${esc(seo.title)}">`,
    `<meta name="twitter:description" content="${esc(seo.description)}">`,
    ogImage ? `<meta name="twitter:image" content="${esc(ogImage)}">` : '',
    ``,
    `<script type="application/ld+json">${JSON.stringify(ld)}</script>`,
    itemList ? `<script type="application/ld+json">${JSON.stringify(itemList)}</script>` : '',
  ]
    .filter((l) => l !== '')
    .join('\n    ');
}

/* ---------- profile: headshot, name, socials ---------- */
function buildProfile() {
  const out = [];

  // A SQUARE hero, not a circle avatar — it's an editorial shot, and a circle would
  // crop the hat and the boots out of the only frame that has both.
  //
  // A real <button>, because clicking it turns it from black and white into colour
  // (the same interaction as the wall of her work) and that has to be reachable from
  // a keyboard. Buttons give us Enter/Space for free.
  out.push(
    site.headshot
      ? `<button class="profile-photo reveal" type="button" aria-label="Show this photo in colour">
      <img src="${esc(site.headshot)}" alt="${esc(site.name)} — hair and makeup artist" width="1120" height="1120" fetchpriority="high" decoding="async">
    </button>`
      : `<div class="profile-photo profile-photo--empty" aria-hidden="true"></div>`
  );

  // The name and the "Curated by" kicker used to print here. Both removed: the hero shot
  // already has CAKEDBYCAITLIN on every card scattered across the floor, so setting the
  // name in type directly beneath it said the same thing twice.
  //
  // But the page still needs an <h1>, and "Shop my favs" alone tells a search engine
  // nothing about who she is — and search is her ONLY inbound channel. So the brand name
  // rides inside the <h1>, visible to crawlers and screen readers, hidden from sighted
  // users who can already see it in the photo. Same content, just not shown twice.
  out.push(
    `<h1 class="profile-tagline"><span class="sr-only">${esc(site.name)} — </span>${esc(site.tagline || 'Shop my favs')}</h1>`
  );

  if (site.bio) out.push(`<p class="profile-bio">${esc(site.bio)}</p>`);

  const socials = Object.entries(site.socials).filter(([k, v]) => k !== '$comment' && v);
  if (socials.length) {
    const icons = socials
      .map(
        ([k, url]) =>
          `<a class="social" href="${esc(url)}" target="_blank" rel="noopener noreferrer" aria-label="${esc(k)}" data-track="social:${esc(k)}">` +
          `<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">${SOCIAL_ICONS[k] || ''}</svg></a>`
      )
      .join('\n      ');
    out.push(`<div class="socials">\n      ${icons}\n    </div>`);
  }

  return out.join('\n    ');
}

/* ---------- freeform link cards ---------- */
function buildLinks() {
  const active = links.filter((l) => l.active && l.url).sort((a, b) => a.order - b.order);
  if (!active.length) return `<!-- No links yet. Caitlin adds them in /admin -> Links. -->`;

  return active
    .map(
      (l) =>
        `<a class="linkcard${l.style === 'primary' ? ' linkcard--primary' : ''}" href="${esc(l.url)}" target="_blank" rel="noopener noreferrer" data-track="link:${esc(l.id)}">` +
        `<span class="linkcard-title">${esc(l.title)}</span>` +
        (l.subtitle ? `<span class="linkcard-sub">${esc(l.subtitle)}</span>` : '') +
        `</a>`
    )
    .join('\n      ');
}

/* ---------- category pills ---------- */
function buildPills() {
  const withProducts = cats.filter((c) => liveByCat(c.id).length || activeMerch.some((m) => m.category === c.id));
  if (!withProducts.length) return `<!-- No categories with live products yet. -->`;

  return (
    `<button class="pill is-active" data-filter="all" type="button">All</button>\n      ` +
    withProducts.map((c) => `<button class="pill" data-filter="${esc(c.id)}" type="button">${esc(c.name)}</button>`).join('\n      ')
  );
}

/* ---------- one product card ---------- */
function productCard(p) {
  const title = [p.brand, p.name].filter(Boolean).join(' ');
  const img = p.image
    ? `<img src="${esc(p.image)}" alt="${esc(title)}" loading="lazy" decoding="async" width="300" height="300">`
    : `<div class="card-noimg" aria-hidden="true"></div>`;

  /* Direct href to the affiliate URL. NOT a /go/ redirect — Amazon's Operating Agreement
   * forbids obscuring the referring site, and a redirect would do exactly that.
   * Click tracking happens client-side on this anchor instead. */
  return `<article class="card" data-cat="${esc(p.category)}">
        <div class="card-media">${img}</div>
        <div class="card-body">
          ${p.brand ? `<p class="card-brand">${esc(p.brand)}</p>` : ''}
          <h3 class="card-name">${esc(p.name)}</h3>
          ${p.note ? `<p class="card-note">${esc(p.note)}</p>` : ''}
          ${p.price ? `<p class="card-price">${esc(p.price)}</p>` : ''}
        </div>
        <a class="card-cta" href="${esc(p.affiliateUrl)}" target="_blank" rel="noopener noreferrer sponsored" data-track="product:${esc(p.id)}">Shop Now</a>
      </article>`;
}

/* ---------- one merch card ---------- */
function merchCard(m) {
  const img = m.image
    ? `<img src="${esc(m.image)}" alt="${esc(m.name)}" loading="lazy" decoding="async" width="300" height="300">`
    : `<div class="card-noimg" aria-hidden="true"></div>`;

  /* No stripeUrl yet -> no button at all, rather than a dead one. She has no inbound contact
   * channel by choice, so there is nothing to fall back to. Show it as coming soon. */
  const cta = m.stripeUrl
    ? `<a class="card-cta" href="${esc(m.stripeUrl)}" target="_blank" rel="noopener noreferrer" data-track="merch:${esc(m.id)}">Buy${m.personalized ? ' — Personalised' : ''}</a>`
    : `<span class="card-cta card-cta--disabled" aria-disabled="true">Coming Soon</span>`;

  return `<article class="card" data-cat="${esc(m.category)}">
        <div class="card-media">${img}</div>
        <div class="card-body">
          <p class="card-brand">${esc(site.name)}</p>
          <h3 class="card-name">${esc(m.name)}</h3>
          ${m.note ? `<p class="card-note">${esc(m.note)}</p>` : ''}
          ${m.price ? `<p class="card-price">${esc(m.price)}</p>` : ''}
        </div>
        ${cta}
      </article>`;
}

/* ---------- the grid, grouped by category (wedding-day timeline order) ---------- */
function buildShop() {
  if (!live.length && !activeMerch.length) {
    /* Honest empty state. Everything is seeded as needs-link, so this is what ships until
     * Caitlin pastes her first link. Speak to HER here — she's the only one who'll see it. */
    return `<div class="empty">
        <p class="empty-title">Your shop is ready and waiting.</p>
        <p class="empty-body">Nothing's live yet. Open the shop admin, paste a product link, and it'll appear here in about a minute.</p>
      </div>`;
  }

  return cats
    .map((c) => {
      const ps = liveByCat(c.id);
      const ms = activeMerch.filter((m) => m.category === c.id);
      if (!ps.length && !ms.length) return '';

      return `<section class="cat" id="${esc(c.id)}" data-cat="${esc(c.id)}">
      <header class="cat-head">
        <h2 class="cat-name">${esc(c.name)}</h2>
        ${c.blurb ? `<p class="cat-blurb">${esc(c.blurb)}</p>` : ''}
      </header>
      <div class="grid">
        ${[...ps.map(productCard), ...ms.map(merchCard)].join('\n        ')}
      </div>
    </section>`;
    })
    .filter(Boolean)
    .join('\n\n    ');
}

/* ---------- "Shop My Look" — one standalone page per client kit ----------
 *
 * Each look is a real, standalone, PUBLIC page. That is deliberate and it is the
 * compliance strategy, not just a nicety: Amazon restricts affiliate links in SMS/DM
 * to *solicited* messages, so texting a bride a raw Amazon link is legally grey —
 * but texting her a link to a public page on Caitlin's own domain is completely safe.
 *
 * noindex, because these are personal to one client. noindex is NOT the same as
 * private: the page stays publicly reachable, which Amazon requires. Do not
 * password-protect these.
 */
function buildLooks() {
  const active = looks.filter((l) => l.active !== false && l.productIds && l.productIds.length);
  if (!active.length) return [];

  const url = site.seo.url.replace(/\/?$/, '/');
  mkdirSync(join(ROOT, 'looks'), { recursive: true });

  const written = [];

  for (const look of active) {
    // Only live products. A look that silently includes an unmonetised product would
    // earn her nothing on the one link she most wants to convert.
    const picked = look.productIds.map((id) => live.find((p) => p.id === id)).filter(Boolean);
    const dropped = look.productIds.length - picked.length;

    const title = `${look.title} — ${site.name}`;

    const page = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta name="theme-color" content="#F7F6F3">
    <title>${esc(title)}</title>

    <!-- Personal to one client: keep it out of search, but keep it PUBLIC.
         Amazon requires affiliate links to sit on a publicly available page. -->
    <meta name="robots" content="noindex, nofollow">

    <meta property="og:type" content="website">
    <meta property="og:title" content="${esc(look.title)}">
    <meta property="og:description" content="${esc(look.intro || 'Everything I used on you today.')}">
    ${site.seo.ogImage && existsSync(join(ROOT, site.seo.ogImage)) ? `<meta property="og:image" content="${esc(new URL(site.seo.ogImage, url).href)}">` : ''}

    <link rel="icon" href="../favicon.svg" type="image/svg+xml">
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Bodoni+Moda:ital,opsz,wght@0,6..96,400;0,6..96,500;1,6..96,400&family=Jost:wght@300;400;500;600&display=swap" rel="stylesheet">
    <link rel="stylesheet" href="../css/style.css">
    <noscript><style>.reveal img, img.reveal { filter: none !important; }</style></noscript>
</head>
<body>
<main>
    <header class="profile">
        <p class="profile-kicker">Everything I used on you</p>
        <h1 class="profile-name">${esc(look.title)}</h1>
        ${look.intro ? `<p class="profile-bio">${esc(look.intro)}</p>` : ''}
    </header>

    <section class="shop">
        <div class="shop-head">
            <p class="disclosure">
                ${esc(site.disclosure.general)}
                <br>
                ${esc(site.disclosure.amazon)}
            </p>
        </div>
        <div class="shop-body">
            <div class="grid">
                ${picked.map(productCard).join('\n                ')}
            </div>
        </div>
    </section>

    <section class="about">
        <h2 class="about-heading">Thank you.</h2>
        <p>It was a joy doing your hair and makeup. Everything above is exactly what I used — no substitutions.</p>
        <p><a class="linkcard linkcard--primary" href="../index.html" style="margin-top:16px">See the full edit</a></p>
    </section>
</main>

<footer class="footer">
    <p class="footer-name">${esc(site.name)}</p>
    <p class="footer-disclosure">${esc(site.disclosure.general)}</p>
</footer>

<script src="../js/main.js" defer></script>
</body>
</html>
`;

    writeFileSync(join(ROOT, 'looks', `${look.id}.html`), page);
    written.push({ id: look.id, count: picked.length, dropped });
  }

  return written;
}

/* ---------- sitemap ---------- */
function buildSitemap() {
  const url = site.seo.url.replace(/\/?$/, '/');
  const urls = [url, ...cats.filter((c) => liveByCat(c.id).length).map((c) => `${url}#${c.id}`)];
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map((u) => `  <url><loc>${esc(u)}</loc></url>`).join('\n')}
</urlset>
`;
}

/* ---------- splice into index.html ---------- */
const BLOCKS = {
  HEAD: buildHead(),
  PROFILE: buildProfile(),
  LINKS: buildLinks(),
  PILLS: buildPills(),
  SHOP: buildShop(),
  DISCLOSURE: esc(site.disclosure.general),
  DISCLOSURE_AMAZON: esc(site.disclosure.amazon),
};

const indexPath = join(ROOT, 'index.html');
if (!existsSync(indexPath)) {
  console.error('index.html not found');
  process.exit(1);
}

let html = readFileSync(indexPath, 'utf8');
let missing = [];

for (const [key, value] of Object.entries(BLOCKS)) {
  // /g matters: DISCLOSURE appears twice (above the grid AND in the footer). Without it,
  // the footer copy would silently never render.
  const re = new RegExp(`(<!--BUILD:${key}:START-->)[\\s\\S]*?(<!--BUILD:${key}:END-->)`, 'g');
  if (!re.test(html)) {
    missing.push(key);
    continue;
  }
  re.lastIndex = 0; // .test() advanced it; rewind before replacing

  // A replacer FUNCTION, not a replacement string. In a replacement string, `$1`/`$2`/`$&`
  // are capture-group references — and every scraped price starts with "$". A price of
  // "$14" would have `$1` swallowed as capture group 1, silently rendering a bare "4".
  // (Caught this by actually looking at the rendered page.) A function disables that parsing.
  html = html.replace(re, (_m, start, end) => `${start}\n    ${value}\n    ${end}`);
}

if (missing.length) {
  console.error(`index.html is missing BUILD markers: ${missing.join(', ')}`);
  process.exit(1);
}

writeFileSync(indexPath, html);
writeFileSync(join(ROOT, 'sitemap.xml'), buildSitemap());

const writtenLooks = buildLooks();

/* ---------- report ---------- */
const counts = {
  live: live.length,
  needsLink: products.filter((p) => p.status === 'needs-link').length,
  needsEnrichment: products.filter((p) => p.status === 'needs-enrichment').length,
  needsAttention: products.filter((p) => p.status === 'needs-attention').length,
};

console.log('built index.html + sitemap.xml');
console.log(`  live on the shop:  ${counts.live}`);
if (writtenLooks.length) {
  console.log(`  look pages:        ${writtenLooks.length}`);
  for (const l of writtenLooks) {
    console.log(`    looks/${l.id}.html — ${l.count} products${l.dropped ? `  (${l.dropped} SKIPPED: not live/monetised)` : ''}`);
  }
}
console.log(`  awaiting a link:   ${counts.needsLink}`);
console.log(`  awaiting enrich:   ${counts.needsEnrichment}`);
console.log(`  NEEDS ATTENTION:   ${counts.needsAttention}  <-- live but NOT earning`);

if (!site.socials.instagram) console.log('\n  note: no Instagram URL in data/site.json — the social row is empty.');
if (!site.headshot) console.log('  note: no headshot in data/site.json — showing a placeholder circle.');
if (!site.seo.ogImage || !existsSync(join(ROOT, site.seo.ogImage)))
  console.log('  note: no og-image.jpg — links shared to Instagram will render without a picture.');
