# CMS Setup (one-time, developer only)

This wires up `/admin` — the Sveltia CMS editor Caitlin uses to add affiliate products from
her phone. **Caitlin never does any of this.** It is done once, by a developer, and then it
stays done.

Budget: **$0.** Everything below is on a free tier.
Time: about 20 minutes.

---

## What we're building and why it looks like this

Sveltia CMS is a static JavaScript app. It runs entirely in Caitlin's browser and commits
straight to this repo via the GitHub API. There is no server, no database, and no CMS
hosting bill.

But a browser app cannot hold a GitHub OAuth **client secret** — anyone could view-source
and steal it. So the OAuth handshake needs one tiny piece of server-side code to do the
secret-for-token exchange. That is the **only** thing the Cloudflare Worker does. It is
about 100 lines, it is maintained by Sveltia's author, and it costs nothing.

```
  Caitlin's phone                Cloudflare Worker            GitHub
  /admin (Sveltia)  ──login──▶   sveltia-cms-auth   ──────▶   OAuth
        │                        (holds the secret)              │
        │◀──────────────── access token ◀────────────────────────┘
        │
        └──── commits data/products.json directly ────▶ GitHub repo ──▶ Actions ──▶ live site
```

### Why not a Personal Access Token?

Because it would mean asking Caitlin to go into GitHub developer settings, pick the right
scopes, generate a secret string, and keep it somewhere safe forever. She would paste it
into her Notes app, it would eventually expire, and the site would break silently with no
explanation and no one around to fix it. Sveltia's own documentation points non-technical
users at the OAuth authorization-code flow for exactly this reason. She taps
"Login with GitHub" and that is the whole experience.

---

## Step 1 — Prerequisites

- A **Cloudflare account** (free): <https://dash.cloudflare.com/sign-up>
- Admin rights on the `grantdozier/CakedByCaitlin` GitHub repo.
- **A GitHub account for Caitlin.** See the gotcha at the bottom — there is no way around
  this one, so deal with it early.

---

## Step 2 — Deploy the auth Worker

We are deploying [`sveltia/sveltia-cms-auth`](https://github.com/sveltia/sveltia-cms-auth).

**Easiest path (Cloudflare dashboard, no CLI):**

1. Go to <https://github.com/sveltia/sveltia-cms-auth> and click **Deploy with Workers**
   (or fork it, then in the Cloudflare dashboard: **Workers & Pages → Create → Import a
   repository** and point it at your fork).
2. Accept the default name, `sveltia-cms-auth`.
3. Deploy.

**Or with the CLI:**

```bash
git clone https://github.com/sveltia/sveltia-cms-auth.git
cd sveltia-cms-auth
npm install
npx wrangler deploy
```

When it finishes, Cloudflare gives you a URL like:

```
https://sveltia-cms-auth.<your-subdomain>.workers.dev
```

**Write that URL down. It is the value you need in Step 5.**

The Worker serves two routes you will care about:

| Route       | Purpose                                             |
| ----------- | --------------------------------------------------- |
| `/auth`     | where Sveltia sends Caitlin to start the login      |
| `/callback` | where GitHub sends her back after she approves      |

---

## Step 3 — Create the GitHub OAuth App

1. Go to <https://github.com/settings/developers> → **OAuth Apps** → **New OAuth App**.
   (For a personal repo this lives under your own account. If the repo ever moves into a
   GitHub Organization, create the OAuth App under that org instead.)

2. Fill it in:

   | Field                          | Value                                                        |
   | ------------------------------ | ------------------------------------------------------------ |
   | **Application name**           | `Caked by Caitlin CMS`                                       |
   | **Homepage URL**               | `https://grantdozier.github.io/CakedByCaitlin/`              |
   | **Authorization callback URL** | `https://sveltia-cms-auth.<your-subdomain>.workers.dev/callback` |

   > ⚠️ The callback URL must be the **Worker** URL with `/callback` on the end — *not* the
   > GitHub Pages URL, and not the Worker root. GitHub matches this string exactly. A
   > mismatch is the single most common reason login fails with a redirect_uri error.

3. Click **Register application**.
4. Copy the **Client ID**.
5. Click **Generate a new client secret** and copy it. **GitHub shows the secret exactly
   once.** If you lose it, generate another.

---

## Step 4 — Give the Worker the two secrets

In the Cloudflare dashboard: **Workers & Pages → `sveltia-cms-auth` → Settings →
Variables and Secrets**.

Add these:

| Name                   | Type       | Value                                                        |
| ---------------------- | ---------- | ------------------------------------------------------------ |
| `GITHUB_CLIENT_ID`     | Secret     | the Client ID from Step 3                                    |
| `GITHUB_CLIENT_SECRET` | Secret     | the client secret from Step 3                                |
| `ALLOWED_DOMAINS`      | Plain text | `grantdozier.github.io` *(optional but recommended)*         |

Use **Secret** (encrypted), not plain text, for the two GitHub values — a plaintext
variable is readable from the dashboard by anyone with account access.

`ALLOWED_DOMAINS` stops anyone else's website from using your Worker as a free auth
service. Set it. If you later move the site to a custom domain, add that domain here too
(comma-separated) or login will start failing.

**Deploy the Worker again** after saving the variables — on Cloudflare, secrets only take
effect on the next deployment.

---

## Step 5 — Point the CMS at the Worker

Open [`admin/config.yml`](../admin/config.yml) and replace the placeholder:

```yaml
backend:
  name: github
  repo: grantdozier/CakedByCaitlin
  branch: main
  base_url: https://sveltia-cms-auth.<your-subdomain>.workers.dev   # ← your Worker URL
```

No trailing slash, and **do not** append `/auth` — Sveltia adds that itself.

Commit and push. GitHub Pages will serve `/admin/` within a minute or so.

---

## Step 6 — Add Caitlin as a collaborator

**Settings → Collaborators → Add people** on the repo. She needs **Write** access
(not Read — Read cannot commit, and the CMS will let her edit and then fail on save,
which is the worst UX of all).

She will get an email invitation. **She must click Accept.** Until she accepts, `/admin`
will let her log in with GitHub and then show her an empty or permission-denied CMS,
which looks exactly like "the site is broken."

---

## Step 7 — Verify it, before she ever touches it

Do this yourself first. Do not hand her an untested `/admin`.

1. Open <https://grantdozier.github.io/CakedByCaitlin/admin/>
2. Confirm there is **no red bar** at the bottom of the screen. If there is, Step 5 was not
   done: `config.yml` still has the placeholder Worker URL and login cannot possibly work.
3. Click **Sign in with GitHub**, approve the app.
4. Open **Products**, pick any product, paste a real product URL into
   *"Paste the product link"*, add a note, hit **Publish**.
5. Check the repo: there should be a fresh commit on `main` touching `data/products.json`.
6. **Open the diff and confirm nothing else changed.** Specifically, confirm the `$comment`
   block at the top of the file is still there and that no product lost a field. If fields
   vanished, a key is missing from `config.yml` — see the warning at the top of that file.
7. **Upload a photo on a test product and then look at the live card.** This is the step
   everybody skips. If the photo is a broken image, `public_folder` in `config.yml` is
   wrong — see the gotcha below.
8. Undo your test edit.

`admin/config.yml` carries a `# yaml-language-server: $schema=…` line, so VS Code (with the
YAML extension) will flag an invalid option as you type. It is worth trusting: an option
Sveltia does not recognise is not an error at runtime, it is simply **ignored**, which is
how a `description` you wrote for Caitlin can end up never being displayed to her.

---

## Step 8 — Put it on Caitlin's phone

This is what makes it feel like an app instead of a website, and it is the difference
between her using it and not.

**iPhone (Safari — it must be Safari, not Chrome):**
1. Open <https://grantdozier.github.io/CakedByCaitlin/admin/>
2. Tap the **Share** button (the square with the up-arrow).
3. Scroll down → **Add to Home Screen** → name it **"Caitlin Editor"** → **Add**.
4. **Now open it from the new icon** and sign in with GitHub *there*, with her, while you
   are still together. Do not assume a login you did in the browser carries over.

**Android (Chrome):** open the same URL → **⋮** menu → **Add to Home screen**, then open it
from the icon and sign in.

Now she has an icon. She taps it, she is already logged in, she pastes a link, she taps
Publish. That is the entire workflow, and it works one-handed at a wedding.

> **Do not "improve" this by making it a standalone web app.** It is tempting to add
> `<meta name="apple-mobile-web-app-capable" content="yes">` so the icon opens chrome-free
> like a native app. It breaks login, twice over: an iOS standalone app gets its **own
> storage container** (so the Safari session does not carry over), and `window.open()` from
> standalone mode hands the popup to Safari as a *separate app*, severing `window.opener` —
> which is exactly the channel Sveltia's GitHub sign-in uses to receive the token. She taps
> Sign In, something flashes, and she stays logged out. `admin/index.html` deliberately does
> not set that tag. Leave it that way.

---

## Gotchas — read these

### She MUST have a GitHub account with write access. There is no way around it.
This is the real cost of a free, serverless, no-database CMS: the "database" is the GitHub
repo, so the editor has to be able to write to the repo, so the editor needs a GitHub
identity. Sveltia has no "invite an editor by email" mode, because there is no server to
hold such an account.

So: **create her GitHub account with her, in person or on a call.** Do not email her
instructions and hope. Use an email she actually checks, save the password in her password
manager, turn on 2FA with her, and then have her accept the collaborator invite while you
are still on the call. Ten minutes now, versus a silent failure at a wedding.

### The Sveltia version is pinned on purpose.
`admin/index.html` pins `@sveltia/cms@0.170.8`. Sveltia is 0.x software and ships multiple
releases per day. **Do not change it to `@latest`.** Floating means the editor she opens is
a build nobody has ever run. To upgrade: bump the pin **in `admin/index.html` and in the
`$schema` line at the top of `admin/config.yml`** (they must match), re-run Step 7 in full,
and only then ship it.

Also: that `<script>` tag must **not** carry `type="module"`. `dist/sveltia-cms.js` is the
classic build — Sveltia itself logs a warning telling you to remove the attribute, and it
nulls out `document.currentScript`, which its own auto-init depends on. (The real ES module
is `sveltia-cms.mjs`, if you ever need it.)

### Her uploaded photos 404 → `public_folder`.
Sveltia forces `public_folder` to be root-absolute: it strips any leading slash and re-adds
one. This site is a GitHub **project** page living under `/CakedByCaitlin/`, so a value of
`images/uploads` becomes `/images/uploads`, which resolves to
`grantdozier.github.io/images/uploads/…` — a different repo, and a 404. That is why the
value is `"/CakedByCaitlin/images/uploads"`.

**When the site moves to a custom domain**, the site moves to the domain root and this must
change back to `"/images/uploads"` in the same commit — otherwise every photo she has ever
uploaded breaks at once.

### `/admin` and search engines.
The `<meta name="robots" content="noindex, nofollow">` in `admin/index.html` is what keeps
the editor out of Google, and it is the only thing that does. The `Disallow: /admin/` in
`robots.txt` protects nothing today, because a project page's `robots.txt` is served at
`/CakedByCaitlin/robots.txt` and crawlers only ever read `robots.txt` from the domain root.
Never remove the meta tag.

### Never add `data/affiliates.json` to the CMS.
It holds the Amazon Associates tag, the ShopMy user ID and the domain→network routing
rules. A bad edit there does not look broken — the site keeps working and simply stops
paying her, which is the worst possible failure mode. It is developer-maintained.

### A field missing from `config.yml` is deleted from the JSON on save.
Sveltia writes back only the fields it knows about. If you add a key to any `data/*.json`,
you must add it to `admin/config.yml` in the same commit. This is why every `$comment`
block is declared there as a `hidden` widget.

### Login fails with a `redirect_uri` mismatch.
Ninety percent of the time this is Step 3: the OAuth App's callback URL is not *exactly*
`https://<worker>/callback`. Check for a trailing slash, `http` vs `https`, or the Pages URL
having been pasted in by mistake.

### Login pops open and immediately closes, still logged out.
Either the Worker was not redeployed after the secrets were added (Step 4), or
`ALLOWED_DOMAINS` does not include the domain she is browsing from.
