# Logins — who needs what

There are exactly **two accounts** in this system. Nothing else. No database, no server,
no monthly bill.

| | Account | Why |
|---|---|---|
| **You** | GitHub (have it) + Cloudflare (free, new) | You own the repo and the login proxy |
| **Caitlin** | GitHub (free, new) | It's how `/admin` knows it's her |

Caitlin will never see the word "GitHub" again after the first login. She taps an icon on her
home screen, and she's in.

---

## Why she needs a GitHub account at all

The CMS (Sveltia) has no user system of its own — on purpose. It writes directly to the repo,
and it uses GitHub itself to decide who's allowed to do that. That means:

- **No password for us to store, leak, or reset.**
- **No monthly fee.** This is the entire reason the whole thing is $0/month.
- If she ever leaves, you revoke one collaborator and it's over.

The tradeoff is one awkward signup. That's it. Do it *for* her — don't make her do it.

---

## The three things only YOU can do

I can't do these — they need a browser signed in as you. Together they take about ten minutes.

### 1. Create a GitHub account for Caitlin (2 min)

Go to https://github.com/signup. Use **her** email so password resets reach her.

Suggested username: `cakedbycaitlin`

Write the username and password straight into her password manager (or yours, shared with her).
**She will never need to type them again after step 3.**

Then tell me the username and I'll add her as a collaborator from here — that part I can do:

```
gh api -X PUT repos/grantdozier/CakedByCaitlin/collaborators/<her-username> -f permission=push
```

### 2. Create a GitHub OAuth App (3 min)

This is what lets the "Log in with GitHub" button on `/admin` work.

1. Go to https://github.com/settings/developers → **OAuth Apps** → **New OAuth App**
2. Fill in:
   - **Application name:** `Caked by Caitlin — Shop Admin`
   - **Homepage URL:** `https://grantdozier.github.io/CakedByCaitlin/`
   - **Authorization callback URL:** *leave blank for 60 seconds* — you get it from step 3
3. Click **Register application**
4. Copy the **Client ID**. Then click **Generate a new client secret** and copy that too.
   ⚠️ The secret is shown **once**. Paste it somewhere safe immediately.

### 3. Deploy the login proxy to Cloudflare (5 min)

GitHub's OAuth requires a server-side secret exchange — it can't be done from a static page.
So a tiny worker does the handshake. It's free forever at this volume, and it's ~100 lines
of code that Sveltia's author maintains.

1. Sign up at https://dash.cloudflare.com/sign-up (free — no card)
2. Go to https://github.com/sveltia/sveltia-cms-auth and click the
   **Deploy to Cloudflare Workers** button in the README
3. When it asks for variables, set:
   - `GITHUB_CLIENT_ID` → the Client ID from step 2
   - `GITHUB_CLIENT_SECRET` → the secret from step 2 (mark it **encrypted**)
   - `ALLOWED_DOMAINS` → `grantdozier.github.io`
4. It'll give you a URL like `https://sveltia-cms-auth.<something>.workers.dev`. **Copy it.**
5. Go **back** to the OAuth App from step 2 and set the
   **Authorization callback URL** to `<that-worker-url>/callback`

### 4. Give me the worker URL

Paste it here and I'll drop it into `admin/config.yml`, rebuild, and push. Then `/admin` is live.

---

## What Caitlin actually does (once)

1. You open `https://grantdozier.github.io/CakedByCaitlin/admin/` on **her** phone
2. Tap **Log in with GitHub** → sign in with the account from step 1 → **Authorize**
3. Safari → Share → **Add to Home Screen**. Name it **"My Shop"**.

Done. From then on it's an icon on her home screen that opens straight into a form.
She taps it, pastes a link, picks a category, writes a line, taps Publish.

**Do this with her, in person, once.** Watch her add one product without helping. If she gets
stuck, that's a bug in the setup, not in her.

---

## Security notes, briefly

- The repo is **public**, so treat `data/*.json` as public. It contains no secrets — affiliate
  tags are public by nature (they're visible in every link she posts anyway).
- The **client secret** lives only in Cloudflare's encrypted env vars. It is never in the repo.
- Sveltia offers a "Sign in with Token" (PAT) option. **Don't use it for Caitlin.** It means
  handing a non-technical person a long-lived credential to paste. The OAuth flow above is what
  Sveltia's own docs recommend for exactly this situation.
- Sveltia also offers a QR-code login that **base64-encodes the auth token into the URL**. Treat
  that QR like a password — better to just log her in directly on her phone.

## If she leaves, or the phone is lost

```
gh api -X DELETE repos/grantdozier/CakedByCaitlin/collaborators/<her-username>
```

That's it. She can no longer publish. The site keeps running.
