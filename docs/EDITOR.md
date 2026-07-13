# The in-place photo editor

**Caitlin taps a photo on her own website, picks a new one, watches it swap in, and hits
Save. About a minute later it's live.**

That's the whole feature. It's separate from `/admin` (the CMS) on purpose: `/admin` is a
form with a preview pane, and she asked for something different — to change the picture
*where the picture is*. There isn't much for her to change, so the little there is has to
feel effortless.

---

## How she uses it

1. Open **`cakedbycaitlin.com/?edit=1`** — bookmark it on her phone as "Edit my site"
2. Tap **Sign in with GitHub** (once; the session sticks)
3. Every changeable photo gets a dashed outline and a **CHANGE PHOTO** badge
4. Tap one → pick a photo from her camera roll
5. **It swaps in immediately, right there on the page.** That's the preview — it's the real
   site, not a mock-up of it
6. A bar appears: *"2 changes — not saved yet"* with **Discard** and **Save changes**
7. Tap **Save changes** → *"Saved. Your photos will be live in about a minute."*

She can change several photos and save them all at once.

## What's editable

| | Count | Maps to |
|---|---|---|
| The hero photo | 1 | `data/site.json → headshot` |
| The wall ("The Work") | 6 | `data/work.json → photos[]` |
| Product photos | all | `data/products.json → products[].image` |

**Product photos matter more than they look.** Four retailers (MAC, Charlotte Tilbury,
Maybelline, Caudalie) block our scraper, so those products ship a typographic tile instead of
a photo. Caitlin can tap that tile and drop in a screenshot. That's the fix for the one
genuine hole in the automation.

---

## For whoever maintains this

### It is inert for visitors

`js/edit.js` returns on line 1 unless the URL carries `?edit=1`. No bar, no badges, no
listeners, no cost. **Verified in a browser: a normal page load has zero editor DOM.**

A stranger who guesses `?edit=1` gets a sign-in button and nothing else. **Write access is
enforced by GitHub, not by us** — there is no client-side `isAdmin` flag to flip. The token
is useless without repo write permission.

### One atomic commit, not N

Saving goes through the **Git Data API** (blobs → tree → commit → ref), not the Contents API.

Two reasons that's not gold-plating:
- Five photo changes become **one deploy**, not five. The Contents API would fire the deploy
  Action five times.
- A **half-applied save is impossible.** Either every photo lands or none do.

### Photos are processed in the browser

Resized to a 1600px long edge and converted to WebP on a `<canvas>` before upload.

A modern phone photo is 3–6 MB and gets displayed at ~600px. Uploading it raw would be slow
on wedding-venue wifi and would live in the git history **forever** — you cannot un-commit a
6 MB file that's already been pushed.

### Cache-busting is load-bearing, not a nicety

A replaced photo usually lands at the **same path** (`images/hero.webp`). GitHub Pages serves
images with a ~10-minute cache. Without cache-busting, Caitlin would hit Save, watch the
deploy go green, refresh — **and still see the old photo.** That looks exactly like the
feature is broken.

So `build.mjs` appends `?v=<hash of the file's bytes>` to every image URL. New bytes → new
URL → the photo appears the instant the deploy lands. Identical bytes keep their URL and stay
cached.

**Don't remove the `v()` calls in `build.mjs` to "clean up the URLs."**

### It never lies about success

If the save fails, it says so, with the error. It does not show a success message and hope.

The site this replaced had a booking form that displayed *"Sent! I'll be in touch soon ✨"*
while silently throwing every inquiry away. That pattern doesn't get to come back.

### Setup

The editor uses the **same Cloudflare Worker and the same GitHub OAuth app as `/admin`**.
One setup covers both. See **[LOGINS.md](LOGINS.md)**.

Until it's configured, `data/site.json → authBase` is blank and the editor says *"Editing is
not set up yet"* rather than failing with an opaque DNS error.

```json
// data/site.json
"authBase": "https://sveltia-cms-auth.<your-subdomain>.workers.dev"
```

### The wall count is enforced

`data/work.json` must hold a **multiple of 6** photos. The grid is 3 across on mobile and 6 on
desktop, so any other count leaves a hole in the last row — which is exactly the gap Caitlin
asked us to remove.

**`build.mjs` exits non-zero rather than ship a broken wall.** That's deliberate: a silent
gap would be found by her, in front of a client, not by us.
