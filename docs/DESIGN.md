# Design system — Caked by Caitlin

Why the site looks the way it does. Read this before changing anything visual, because
several of these choices look arbitrary and are not.

---

## The palette

| Token | Value | Where |
|---|---|---|
| `--bg` | `#0A0A0A` | The page. Near-black, **not** `#000` |
| `--surface` | `#FFFFFF` | Product cards |
| `--ink` | `#F4F4F4` | Body text on black |
| `--ink-soft` | `rgba(255,255,255,.58)` | Secondary text on black |
| `--line` | `rgba(255,255,255,.14)` | Hairlines on black |
| Grey block | `#D6D1C8` | The SHOP MY FAVS band |

**Why `#0A0A0A` and not true black.** The hero photo has its own deep blacks (the hat, the
blazer, the boots). On a pure `#000` page those blacks merge into the background and the
subject dissolves at the edges. A hair of lift keeps the photo sitting *on* the page.

**Why the grey block is warm.** `#D6D1C8` is Rhode's greige, which is the reference Caitlin
gave. It's the only soft, warm surface on the site — everything else is black, white, or a
photograph — so it does a lot of work. Don't add a second one.

**Why product cards stay white.** Retailer product cutouts are shot on white. A dark card
would just be a frame around a white box. White tiles on black also keep the page reading as
black-and-white, which is the whole idea.

---

## Type

**One family: Jost.** No display serif anywhere.

This is not a taste call. Look at the hero photo: her real business cards are scattered
across the floor, and they read **CAKEDBYCAITLIN** in a plain uppercase sans. That *is* her
brand typography. We match the cards.

The site previously used Bodoni Moda for headings. Caitlin's exact words were that it looked
"girly." She was right, and the cards on her own floor were the evidence.

Headings are uppercase, letterspaced (`0.22–0.24em`), and **small**. They are labels, not
statements. The photography is the statement.

---

## THE SIGNATURE: click a face and it turns to colour

**Every photo of Caitlin or her work is black and white until you click it. Then that one —
and only that one — turns to colour.** Click again and it goes back.

It's the before/after she does for a living, handed to the visitor.

Three things about this are deliberate and were each arrived at the hard way:

**It is not on hover.** Hover would give it away for free on desktop and does nothing at all
on a phone — and nearly all of this traffic arrives from Instagram, on a phone. Click is the
only trigger that works everywhere and is the only one that makes it an *interaction* rather
than a filter.

**It is not on scroll.** An earlier build auto-revealed each photo as it scrolled into view.
It looked nice and it was wrong: the photos must sit grey until someone reaches out.

**Product photos are exempt.** You cannot shop a colour you can't see. A greyscale lipstick
is useless. Only Caitlin and her work go grey.

### The easing is measured, not guessed

`--reveal: 1200ms cubic-bezier(0.65, 0.05, 0.36, 1)` — ease-in-**out**.

The first version used an ease-out curve. Measured in the browser, it was **67% decolourised
within 60ms** — the bloom *snapped* instead of revealing. The whole point is that you watch
it happen. Slow start, visible middle.

### Failure modes are covered

- **`prefers-reduced-motion`** → kills the movement but **keeps the colour**. Someone who
  asked for less motion still wants to see what shade the lipstick is, so we hold the
  reveal's *endpoint*, not its start.
- **No JavaScript** → `@media (scripting: none)` plus a `<noscript>` block ship the photos in
  **full colour**. The reveal is JS-driven, so without this a crawler or a JS-blocked visitor
  would be stranded on a permanently grey page.

---

## The hero

Full bleed. The photo owns the entire first screen; the site begins beneath it.

**`height: 100svh`, with `100vh` as the fallback.** On iOS Safari, `100vh` resolves to the
*large* viewport — the one without the browser toolbars — so a "full screen" hero actually
overflows by ~100px on first paint and the bottom of the frame sits below the fold. `svh` is
the small viewport: it fits *with* the toolbars showing, which is the state the page loads in.

**The hat and the boots are never cropped. Which way the crop falls depends on the shape of
the screen — that's the whole trick.**

The source is 1080×1920: a 9:16 frame, ratio 0.5625.

**Phones are TALLER than that.** An iPhone is 19.5:9 — ratio ~0.46. So `object-fit: cover`
scales the photo to fill the height, and the overflow spills off the **left and right**,
trimming ~9% of empty concrete from each side. The hat and the boots are untouched, and the
photo fills the screen edge to edge, top to bottom. Which is what Caitlin asked for.

**Wide desktops are the exact opposite.** There, `cover` fills the *width*, and the overflow
spills off the **top and bottom** — which is precisely what was slicing her hat off. There is
no good crop of a 9:16 photo in a 16:10 window, so we don't crop: `contain` shows the entire
frame with black at the sides. The page is black and so is the photo's world, so it reads as
the photo floating in the dark rather than as letterboxing.

The breakpoint is the photo's own aspect ratio:

```css
.hero-photo img { object-fit: cover; }        /* narrower than 9:16 → crop the sides */

@media (min-aspect-ratio: 9/16) {
    .hero-photo img { object-fit: contain; }  /* wider → don't crop the hat */
}
```

Verified across iPhone 14 Pro, iPhone SE, Pixel 7, iPad portrait and desktop: **zero
top/bottom crop on every one.**

Two wrong answers were tried first, and both are instructive. A square crop threw the hat and
the boots away outright. Then `cover` with a tuned `object-position` — which just meant
*choosing* what to amputate. **If you find yourself picking a focal point, you are already
solving the wrong problem.**

**The scroll cue is dark, not white.** The bottom of the frame is pale concrete floor. A
white line there is completely invisible. (Confirmed by looking at the render, not by
guessing.) If the hero is ever swapped for a dark-bottomed photo, flip it back.

---

## The wall ("The Work")

A seamless, **gapless** black-and-white wall that bleeds to the screen edges. No gutters, no
rounded corners. The photos butt straight against each other and read as one surface, which
is what makes lighting up a single face feel like something.

**It must contain a multiple of 6 photos.** The grid is 3 across on mobile and 6 across on
desktop. Eight photos would leave a hole in the last row — which is exactly the gap Caitlin
asked us to remove. There are currently six. **Add more in multiples of 6.**

`box-shadow: 0 0 0 0.5px #1A1A1A` on each tile kills the sub-pixel hairlines that otherwise
show as faint seams between grid cells at fractional widths.

---

## The SHOP NOW button is inset, not a full-width bar

ShopMy runs a black SHOP NOW bar edge-to-edge along the bottom of each card. We can't.

Their page is **light**, so a black bar has a hard edge against it. On our black page that
same bar merges straight into the background and the button loses its shape entirely (saw it
in the render). Insetting it by 12px keeps white card on all four sides of the button, so it
reads as a button again.

---

## Instagram keeps its real gradient

The Instagram mark is the actual rainbow gradient (`#FFD600 → #FF7A00 → #FF0069 → #D300C5 →
#7638FA`), not a flat monochrome glyph. It's the only spot of colour on the page that isn't a
product or a revealed photo, and that's fine — it's the one link she most wants clicked.

It's a full `<svg>` override in `build.mjs` rather than a path fragment, because it needs its
own `<defs>`. On hover we light the *ring* rather than flooding the circle, which would wash
the gradient out.

Every other social icon is a monochrome path inheriting `currentColor`.

---

## Things that are gone, and why

| Removed | Why |
|---|---|
| Booking form | She takes no bookings. (It also never sent anywhere — see README.) |
| Services + prices | Prices with no way to book are a dead end. |
| Testimonials | Unattributable placeholder copy. |
| Phone / email / contact | She wants no inbound. Every route to her goes through Instagram. |
| Bio + "About" | She wants it minimal. |
| "Curated by / Caked by Caitlin" under the hero | The hero has CAKEDBYCAITLIN printed on a dozen cards across the floor. Setting the name in type beneath it said the same thing twice. |
| Bodoni Moda | "Girly." Her own business cards are a plain sans. |
| The lightbox | It fought the click-to-colour interaction for the same click. |
| AOS (scroll animation CDN) | An outage used to blank the entire page. See README. |

---

## The one thing you must not break

**The `<h1>` still contains the brand name**, as visually-hidden text:

```html
<h1 class="shop-heading"><span class="sr-only">Caked by Caitlin — </span>Shop my favs</h1>
```

A sighted visitor sees "SHOP MY FAVS". A crawler and a screen reader get "Caked by Caitlin —
Shop my favs".

Caitlin has **no booking form, no email, and no phone**. Organic search is her *only* inbound
channel. An `<h1>` reading just "Shop my favs" tells Google nothing about who she is. Don't
strip the `.sr-only` span "for cleanliness" — it is load-bearing.
