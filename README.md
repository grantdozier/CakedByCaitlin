# Caked by Caitlin

An affiliate storefront and link hub for a working wedding hair & makeup artist.

**Live:** https://grantdozier.github.io/CakedByCaitlin/
**Admin:** https://grantdozier.github.io/CakedByCaitlin/admin/ — where Caitlin adds products from her phone
**Cost:** $0/month. No server, no database, no SaaS bill.

---

## What this is

Caitlin does hair and makeup for weddings. Clients constantly ask what she's using *while
she's using it*. This site is the answer to that question, and it earns her a commission when
they buy.

**She takes no bookings.** No form, no email, no phone number. That is deliberate.

Which means **organic search is her only inbound channel.** That constraint drives a lot of
the architecture — see "SEO is load-bearing" below.

---

## For Caitlin

- **[CAITLIN-HOWTO.md](CAITLIN-HOWTO.md)** — how to add a product, build a look, add merch
- **[CAITLIN-AFFILIATE-GUIDE.md](CAITLIN-AFFILIATE-GUIDE.md)** — which affiliate programs to
  join, in what order, and what she's legally required to say

## For whoever maintains this

- **[docs/DESIGN.md](docs/DESIGN.md)** — why the site looks the way it does. Several choices
  look arbitrary and are not. Read this before changing anything visual.
- **[docs/LOGINS.md](docs/LOGINS.md)** — the two accounts in the system, and the one-time setup
- **[docs/CMS-SETUP.md](docs/CMS-SETUP.md)** — deploying the auth worker

---

## How it works

```
Caitlin (phone) ──► /admin ──► commits data/products.json
                                        │
                                        ▼
                            .github/workflows/enrich.yml
                            ├─ scrape the product page (OG / JSON-LD)
                            ├─ apply HER affiliate link
                            ├─ download + WebP the image
                            └─ commit the result back
                                        │
                                        ▼
                            .github/workflows/deploy.yml
                            ├─ node scripts/build.mjs   (JSON ──► static HTML)
                            └─ upload to GitHub Pages
                                        │
                                        ▼
                                  live in ~90s
```

She pastes a link. Everything else is automatic.

### The pieces

| Path | What it is |
|---|---|
| `data/*.json` | **The source of truth.** Everything renders from here. |
| `admin/` | Sveltia CMS. One `<script>` tag, no build step. Version **pinned** on purpose (it ships multiple releases per day). |
| `scripts/build.mjs` | Renders `data/*.json` → static HTML + `sitemap.xml` + `looks/*.html` |
| `scripts/enrich.mjs` | Scrapes the product page, applies the affiliate link |
| `scripts/images.mjs` | Converts product images to WebP |
| `index.html` | The page. Content between `<!--BUILD:X:START-->` markers is **generated** — don't hand-edit inside them. |

### The data files

| File | Contents | Caitlin edits it? |
|---|---|---|
| `site.json` | Name, tagline, socials, SEO, disclosure text | ✅ |
| `products.json` | The affiliate products | ✅ |
| `categories.json` | Her 9 categories (a wedding-day timeline) | ✅ |
| `links.json` | Linktree-style link cards | ✅ |
| `merch.json` | Things she actually sells (Stripe Payment Links) | ✅ |
| `looks.json` | Per-client "everything I used on you" kits | ✅ |
| `affiliates.json` | Domain → affiliate rule | ❌ **Developer only** |

---

## Product lifecycle

A product only becomes visible once it can actually earn money.

| `status` | Means | On the shop |
|---|---|---|
| `needs-link` | Seeded from her notes, no URL yet | **Hidden** |
| `needs-enrichment` | She pasted a URL, the Action hasn't run yet | **Hidden** |
| `needs-attention` | Enrichment failed, **or there's no affiliate link** | **Hidden**, flagged in `/admin` |
| `live` | Has a name, an image, AND a real affiliate link | **Visible** |

> **A card that renders beautifully and earns $0 is the failure mode this system exists to
> prevent.** That's why `needs-attention` is hidden rather than shown. We never silently
> pretend a link is monetised.

---

## ⚠️ Compliance is load-bearing. Do not "clean these up."

These are not style preferences. Breaking them can get her Amazon account **closed.**

**No cloaking. No redirects. No link shorteners.**
Amazon's Operating Agreement forbids obscuring the referring site. There is no `/go/<id>`
redirect in this codebase and there must never be one — *including "just for click tracking."*
Click tracking is client-side only: we observe the click, we never intercept it.

**Amazon links are NEVER wrapped in ShopMy.**
ShopMy does not monetise Amazon at all (their words: *"we do not offer commissions on Amazon
products directly"*), and wrapping would make the referrer ambiguous to Amazon. They are two
entirely separate rails. `enrich.mjs` asserts this explicitly.

**The FTC disclosure renders above the first affiliate link on every page.**
A footer-only disclosure is **not legally sufficient** (16 CFR 255.5). Amazon separately
mandates its own sentence verbatim — *"As an Amazon Associate I earn from qualifying
purchases."* Don't reword it, and don't move it below the grid.

**Every product needs Caitlin's note.**
Since April 2026 Amazon requires "commentary, analysis or transformation" — a bare grid of
product links is a policy violation. Her one-line note satisfies this. It also happens to be
the entire reason someone buys from her instead of googling the product themselves.

**Look pages are public but `noindex`.**
Never password-protect them: Amazon requires affiliate links to sit on a *publicly available*
page. `noindex` keeps them out of search; it does not make them private.

**Amazon's cookie is 24 hours.** A look page sent the next week earns nothing. Send it the
same day.

**Levanta and Amazon do not stack.** Amazon killed dual attribution in Dec 2024 and bans an
Associates tag on a Levanta link. It's one or the other, per product. (An earlier draft of the
affiliate guide got this wrong and would have put her account at risk.)

---

## SEO is load-bearing too

She has no booking form, no email, and no phone. **Search is the only way a stranger reaches
her.** Two consequences:

1. **The shop is pre-rendered as static HTML**, not fetched as JSON in the browser. A shop
   that only exists after JavaScript runs is a weak thing to hand a crawler.
2. **The `<h1>` carries the brand name as visually-hidden text.** A sighted visitor sees
   "SHOP MY FAVS"; Google and a screen reader read "Caked by Caitlin — Shop my favs". Don't
   strip the `.sr-only` span "for cleanliness" — it is load-bearing.

---

## Local development

```bash
node scripts/build.mjs              # data/*.json -> index.html, sitemap.xml, looks/*.html
npx http-server . -p 8099           # then open http://127.0.0.1:8099

node scripts/enrich.mjs --dry-run   # scrape + affiliate-ize without writing anything
py scripts/optimize-images.py       # PNG -> WebP
py scripts/make-hero.py             # rebuild hero.webp + og-image.jpg from the source shot
```

`build.mjs` is **idempotent** — running it repeatedly does not duplicate content. (Verified;
the deploy Action runs it on every push.)

---

## History worth knowing

The site this replaced had a **booking form that silently destroyed every inquiry.** It called
`preventDefault()`, built a `data` object, never sent it anywhere, and then displayed *"Sent!
I'll be in touch soon ✨"* next to a promise to reply within 24 hours. Every lead it ever
received was thrown away while telling the customer it had succeeded.

It's gone now — deleted rather than repaired, because Caitlin doesn't want inbound. But it's
why this codebase is paranoid about **silent success**: the enrichment pipeline would rather
hide a product than show one that looks perfect and earns nothing.

Other things that were quietly broken, now fixed:

- **The whole page went blank if a CDN hiccuped.** `AOS.init()` was unguarded, and `aos.css`
  set `[data-aos] { opacity: 0 }` on 27 elements — including the booking form. AOS is gone.
- **All four social icons were `href="#"`** — they did nothing and threw a console error. CI
  now **fails the build** on any dead `href`.
- **The deploy published the entire `.git` directory** to GitHub Pages.
- **2.07 MB of images** that were RGBA PNGs with a fully-opaque alpha channel. Now 112 KB.
- **Prices were being corrupted.** `$1`/`$2` in a `String.replace` *replacement string* are
  capture-group references, so a price of `$14` rendered as a bare `4`.
