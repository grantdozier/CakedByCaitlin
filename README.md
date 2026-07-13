# Caked by Caitlin

An affiliate storefront and link hub for a working wedding hair & makeup artist.

**Live:** https://grantdozier.github.io/CakedByCaitlin/
**Admin:** https://grantdozier.github.io/CakedByCaitlin/admin/

---

## What this is

A ShopMy-style product storefront plus a Linktree-style link hub. That's the entire scope.

There is **no booking form, no contact form, no email address and no phone number**. That is deliberate — Caitlin does not want inbound contact. The only route to her is Instagram. If you find yourself reintroducing a contact channel, you have misread the brief.

Because there's no booking funnel, **organic search is the only inbound channel**, and it has to land on the shop and monetise there. SEO is a first-class requirement, not a nice-to-have.

## Constraints that drive every decision

1. **Caitlin is not technical.** She adds a product from her phone, possibly at a wedding, by pasting a link. Every design decision bends to that.
2. **$0/month.** Static hosting, free CMS, free CI. Stripe is per-transaction only. No servers, no database, no subscriptions.
3. **No framework.** Vanilla HTML/CSS/JS. No `node_modules` in the repo.

---

## Architecture

```
data/*.json  ──►  scripts/build.mjs  ──►  static HTML  ──►  GitHub Pages
     ▲                    ▲
     │                    │
  Sveltia CMS      enrich Action
   (/admin)     (fills in product data,
                 applies affiliate rules)
```

**Static site, no runtime.** Everything is generated at build time and served as plain files. Nothing executes on a server.

**`data/*.json` is the source of truth.** Not the HTML. If you want to change what's on the site, change the JSON. The HTML is an artifact.

**Sveltia CMS at `/admin`** is a git-backed CMS — a single-page app that authenticates against GitHub and commits directly to `data/*.json`. Caitlin's "Publish" button is a git commit. Mobile-first, which is the whole reason it was chosen.

**The enrichment Action** (`.github/workflows/enrich.yml`) runs on push. When it sees a product with a URL and `status` of `needs-link`/`needs-enrichment`, it fetches the page, pulls out name/brand/image/price, applies the matching affiliate rule from `data/affiliates.json`, and writes `affiliateUrl`.

The status gate is strict: **`live` requires `name` + `image` + a real `affiliateUrl`.** Anything short of all three → `status: "needs-attention"`, which is **hidden from the shop** and flagged in `/admin`. The raw `url` is retained on the record so it's a five-minute fix, not a re-do — but the card does not ship until it earns.

**Deploy** is `.github/workflows/deploy.yml`. It runs on push to `main` *and* on `enrich.yml` completing — that second trigger is load-bearing. Enrich's commit is made with `GITHUB_TOKEN` and tagged `[skip ci]`, so it can never fire a `push` event; without the `workflow_run` trigger the enriched (i.e. the only `live`) product would sit on `main` and never reach Pages.

**The loop guard.** `enrich.yml` commits to `data/products.json` and triggers on pushes to `data/products.json`. Two guards, either sufficient: the `[skip ci]` commit tag, and `if: github.actor != 'github-actions[bot]'`. (Belt and braces: `GITHUB_TOKEN` pushes don't create workflow runs at all.) Verified non-recursive. Don't remove either.

---

## Finish the setup (required — `/admin` does not work until you do)

Two things are unset on a fresh clone, and **the site is inert until both are done**:

1. **`admin/config.yml → base_url`** still says `https://TODO-REPLACE-WITH-YOUR-CLOUDFLARE-WORKER.workers.dev`. Until it's replaced with a real Sveltia auth Worker URL, **Caitlin cannot log in at all** — the login button just fails. Full walkthrough: [`docs/CMS-SETUP.md`](./docs/CMS-SETUP.md). She also needs a repo invite with **write** access.

2. **`data/affiliates.json → accounts`** (`amazonTag`, `shopMyUserId`) are empty. Until they're filled in, every link she pastes enriches to `needs-attention` and stays **off** the shop. That is by design, not a bug — the system refuses to publish a card that earns $0 — but it does mean *nothing will ever appear on the shop* until at least one account is connected. Don't debug it; fill it in.

---

## The data files

| File | Owner | What it holds |
|---|---|---|
| `data/site.json` | dev | Site name, bio, socials, SEO block, FTC/Amazon disclosure text. **Any social left as `""` is hidden entirely** — no dead icons. (`storefronts` is currently read by nothing — see Known gaps.) |
| `data/categories.json` | Caitlin | 9 categories, ordered as a wedding-day timeline. `order` controls display order. |
| `data/products.json` | Caitlin | Affiliate products. `status`: `needs-link` \| `needs-enrichment` \| `needs-attention` \| `live`. **Only `live` renders on the shop.** |
| `data/affiliates.json` | **dev only** | Domain → affiliate rule. `accounts.amazonTag`, `accounts.shopMyUserId`. Caitlin never sees this file. |
| `data/merch.json` | Caitlin | Things she *sells*. Stripe Payment Links. `personalized` + `personalizationLabel` drive the initials field. Items with no `stripeUrl` render a disabled **"Coming Soon"** chip, never a dead Buy button. (Renders when `status: "live"` **or** a `stripeUrl` is present.) |
| `data/links.json` | Caitlin | Freeform Linktree-style cards. `active: false` hides. |

Fill in `affiliates.json → accounts` once Caitlin is approved on ShopMy and Amazon. Until then, products publish unmonetised and get flagged `needs-attention` in `/admin`.

---

## Compliance rules — do not "improve" these

These come from the actual Amazon Associates Operating Agreement and FTC 16 CFR 255. They are not stylistic preferences.

1. **No cloaking. Ever.**
   No `/go/<id>` redirects. No link shorteners. No server-side hop. Amazon's agreement forbids obscuring the referring site. Affiliate links must be direct `<a href>` on a public page.
   Consequence: **click tracking is client-side only.** If you're about to add a redirect to "fix" analytics, don't.

2. **Amazon is never wrapped in ShopMy.**
   ShopMy does not monetise Amazon at all. Wrapping an Amazon URL in a ShopMy redirect earns nothing *and* makes the referrer ambiguous to Amazon. They are two separate rails. Keep them separate.

3. **The FTC disclosure renders above the first affiliate link on every page that has one.**
   Footer-only is legally insufficient. The text lives in `data/site.json → disclosure`. The Amazon line ("As an Amazon Associate I earn from qualifying purchases.") is mandated verbatim — do not reword it.

4. **Never silently pretend a link is monetised.**
   Unknown domain (or missing account credentials, or a failed scrape) → keep the raw `url` on the record, set `status: "needs-attention"`, and **keep it off the shop**. Only `status: "live"` renders. A card that looks perfect and earns $0 is the failure mode this whole system exists to prevent, so the system would rather show nothing.

5. **Amazon and Levanta are mutually exclusive, per product.**
   Since Amazon's **20 Dec 2024** Operating Agreement update, you may not earn from two programs on the same traffic — specifically, **an Associates tag must never be added to a Levanta link.** Dual attribution is dead. If a product is routed to Levanta, strip the Amazon tag; if it isn't, use Associates. Never both. (Older guides on the web still say you can stack them. They will get her account closed.)

---

## Docs for Caitlin

Written for a non-technical reader on a phone. Keep them that way.

- [`CAITLIN-AFFILIATE-GUIDE.md`](./CAITLIN-AFFILIATE-GUIDE.md) — which affiliate programs to join and in what order (ShopMy → Amazon → Levanta → skip LTK), the Amazon 3-sales-in-180-days trap, the Levanta/Associates either-or rule, and what she's legally required to disclose.
- [`CAITLIN-HOWTO.md`](./CAITLIN-HOWTO.md) — how to add a product, what the status flags mean, how to send a bride her list, how to set up a Stripe Payment Link for merch.

**These docs describe only what actually ships.** If you change a field label in `admin/config.yml`, or change what a `status` does in `build.mjs`, the docs are now lying to a non-technical user who has no way to tell. Update them in the same commit.

---

## Local development

The site is static, but `index.html` is **generated** — it must be built before it means anything.

```sh
node scripts/build.mjs   # data/*.json -> index.html + sitemap.xml
npx serve .              # or any static server
```

`scripts/build.mjs` is plain Node, no dependencies. It splices into `<!--BUILD:X:START--> … <!--BUILD:X:END-->` markers in `index.html` and exits non-zero if a marker is missing — don't delete them.

Enrichment can be dry-run against a single URL without touching the data:

```sh
node scripts/enrich.mjs <product-url>   # self-test: does it extract a title + image?
```

## Known gaps

- **⚠️ FTC placement risk in the link hub.** The disclosure renders inside `.shop-head`, above the product grid — correct for the grid. But the **link-hub `<nav>` renders *above* it**, and `data/links.json` ships a seeded card literally called *"My Amazon Storefront"*. It's `active: false` with a blank URL today, so nothing is exposed. The moment Caitlin activates it, an **affiliate link sits above the disclosure**, which is exactly what rule 3 forbids. Fix before that card goes live: either move `<p class="disclosure">` above the link-hub `<nav>` in `index.html`, or emit a disclosure line inside the `BUILD:LINKS` block. (Lives in `index.html` / `build.mjs`.)
- **`data/site.json → storefronts` is dead data.** `amazon` / `shopmy` / `ltk` are read by nothing — `build.mjs` renders socials in `PROFILE` and cards from `links.json`, but never `storefronts`. The file's own comment promises they render "as their own large cards". Either render them (and mind the disclosure-placement bug above — they're affiliate links) or delete the key. Right now filling them in does nothing, silently.
- **`enrich.mjs` does not generate an `id` for a brand-new product.** `id` is `readonly` and empty in `/admin`, and enrichment reads `product.id` without falling back to a slug — so a product Caitlin adds herself gets `id: ""`, and its downloaded image is written to `images/products/.webp`, which every subsequent new product then overwrites. Products *seeded* from her notes have IDs and are unaffected. Fix before she adds her first product from scratch.
- No per-bride "Shop My Look" page exists. `CAITLIN-HOWTO.md` points her at the shop URL and its `#category` anchors instead, and says plainly that look pages aren't built. Don't let a doc promise one until it is.

---

## Cost

| | |
|---|---|
| GitHub Pages | $0 |
| GitHub Actions | $0 (public repo) |
| Sveltia CMS | $0 |
| Stripe | $0/month, per-transaction fee only |
| **Total** | **$0/month** |
