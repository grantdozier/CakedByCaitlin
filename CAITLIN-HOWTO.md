# How to run your shop

Everything here works on your phone. You never need a computer.

You run the shop from one page: **your website address with `/admin` on the end.**

> `https://grantdozier.github.io/CakedByCaitlin/admin/`

Save it to your home screen so it's one tap away — I can set that up for you.

### Before your very first login

Two things have to happen once, and they're both on me:

1. I send you a **GitHub invite** — accept it from your email. That's the login you'll use forever.
2. I finish connecting the editor to it.

**Until I tell you it's ready, the login button won't work.** That's expected, it's not you, and it's not broken. After that, you tap "Login with GitHub" and that's the whole experience — no other password.

---

## Adding a product

This is the one you'll do most. It takes about a minute.

1. Open **/admin** on your phone.
2. Tap **Products**.
3. Tap **+** to add a new one.
4. Paste the product link into **"Paste the product link"**.
5. Pick **"Which category?"** — the same sections as on your site (Getting Ready Prep, Lipstick, Lip Gloss, Powders, Blushes, End of the Night, Tools, Accessories, Getting Ready Outfits).
6. Write **"Your note"**. This one is required.
7. Tap **Publish**.

Everything else on that screen says *"filled in automatically, don't edit"* — the name, the brand, the price, the photo, your commission link, the status. Ignore all of it. It fills itself in.

Give it a few minutes, then check the shop. If it's still not there after ten, look at its status in /admin (see below) — that will tell you why.

### Always paste the link. Not a screenshot.

This is the single most important thing in this whole document.

**A screenshot has no link inside it. It cannot earn you anything.** It's a picture. Nobody can tap it, nobody can buy from it, and you get paid nothing.

If you paste the link, the site works out the rest — it finds the product name, the brand, the picture, the price, and swaps in your affiliate link so the sale is credited to you.

If you can't get the link and you only have a screenshot, we can still try to guess what the product is from the name. **But it's a guess and it can be wrong** — wrong shade, wrong size, wrong brand. And even when it guesses right, it still can't pay you unless there's a real link behind it.

**If you can copy the link, copy the link.** Every time.

How to get the link on your phone: in the shop's app or website, tap **Share** → **Copy Link**. Then paste it in.

### The "Your note" field — don't skip this

One sentence. Why you like it, or what you used it for.

> "This is the powder I use on every bride with oily skin — it doesn't go patchy in photos."

> "I put this on my brides the night before. It's the reason their skin looks like that."

Two reasons this matters:

1. **It's what makes people trust you.** A photo of a lipstick is a photo of a lipstick. *You* saying you use it on real brides is the reason they buy it.
2. **Amazon requires it.** A page that's just a wall of products with no words is against their rules. Your note is what makes it yours instead of a catalogue.

You don't have to be clever. Just say the true thing you'd say to a client.

---

## What the little flags mean

Next to each product in /admin you'll see a status. **Only "Live" products appear on your shop.** Everything else is hidden — on purpose. A product that looks perfect but earns you nothing is worse than no product at all.

**Live on the shop ✓** — It's up, it's earning. Nothing to do.

**Needs a link (hidden from shop)** — I typed the product in from your notes, but there's no link yet. Paste the link and it'll go live by itself.

**Working on it… (hidden from shop)** — You pasted the link and the site is fetching the details right now. Give it a couple of minutes. It turns to **Live** on its own.

**⚠️ Not earning — needs attention (hidden from shop)** — Read this one carefully:

> **Something went wrong, so the product is being kept OFF your shop.**

It means one of three things: we couldn't get the product's photo or name from that link, *or* we don't have an affiliate deal with that particular shop yet, *or* your Amazon/ShopMy account isn't plugged in yet.

The site deliberately does **not** publish it. I'd rather show a bride nothing than show her a link that pays you $0.

**If you see "needs attention": message me.** Usually it's a five-minute fix on my end, and then it goes live. Don't ignore it — that's free money sitting on the floor.

---

## Sending a bride her list

After you do a bride's makeup, send her what you used. This is where the money actually comes from.

Right now the way to do that is: **send her your shop link.**

> `https://grantdozier.github.io/CakedByCaitlin/`

You can also send her straight to one section of it by adding the section on the end — handy when she only asked about your powders:

> `https://grantdozier.github.io/CakedByCaitlin/#powders`
>
> `https://grantdozier.github.io/CakedByCaitlin/#lipstick`
>
> `https://grantdozier.github.io/CakedByCaitlin/#getting-ready-prep`

(If you want a proper "here's *your* exact look, Sarah" page with just her products on it — tell me. It's a real thing I can build you; it doesn't exist yet, and I'm not going to pretend it does.)

### Same day. Seriously.

Amazon only pays you if she buys **within 24 hours of clicking your link.** If you send it Monday and she buys Thursday, you earn nothing.

So: finish her face, send the link before you leave. That's the habit. It takes ten seconds and it's the difference between getting paid and not.

Bonus — it's a lovely thing to send a bride anyway. It looks like you thought about her.

---

## Adding something you actually sell (merch)

This is different from affiliate products. These are the things that are **yours** — the robes, the pyjamas, the slippers, the monogrammed tote. You take the money, not a commission.

Checkout runs on **Stripe**. It costs **$0 a month**. Stripe only takes a small cut when something actually sells. There's no subscription and no bill sitting there when nothing's selling.

Making the Stripe link is the one part that's easier on a laptop. It does work in your phone's browser — just go to stripe.com in Safari, not the Stripe app.

### Step 1 — Make the Payment Link in Stripe

1. Go to **stripe.com** and log in (make a free account if you don't have one).
2. In the menu, tap **Payment Links**.
3. Tap **+ New**.
4. Tap **+ Add a new product**.
5. Type the **name** ("Bride Robe") and the **price**.
6. Add a **photo** of it.

### Step 2 — Add the "Initials" box (personalised items only)

This is the bit that makes monogramming work. Skip it for the slippers or anything not personalised.

7. Scroll down to **Options** (sometimes called "Advanced options").
8. Find **Custom fields** and tap **Add custom field**.
9. Choose type: **Text**.
10. Label it: **Initials**
11. Turn on **Required** so nobody checks out without telling you what to embroider.
12. Tap **Create link**.
13. **Copy the link.**

Now, when a bride buys, she types her initials right at checkout and they land in your order. You never have to chase her for them.

### Step 3 — Put it on your site

14. Open **/admin** → **Merch**.
15. Tap the item (Bride Robe, Bride Pyjamas, Bridesmaid Pyjamas, Bridesmaid Slippers, Tote Bag with Initials).
16. Paste the Stripe link into **"Stripe Payment Link"**.
17. Fill in **"Price"**, add a **"Photo"**, and write **"Your note"** — one sentence, same as products.
18. If it's personalised, switch on **"Can it be personalised?"** and set **"What do we ask the buyer for?"** to the same wording you used in Stripe ("Initials"). **Make these two match** — that's the whole trick.
19. Set **"Status"** to **Live — buyable ✓**.
20. Tap **Publish**.

The item now has a real **Buy** button.

Until you paste a Stripe link, the item shows a greyed-out **"Coming Soon"** instead. It's never a dead button that pretends to work and doesn't.

---

## The short version

- **Paste links, never screenshots.** A screenshot can't earn you a penny.
- **Always write your one-sentence note.** It's what makes people trust you, and Amazon requires it.
- **Only "Live" shows on the shop.** "Needs attention" means it's hidden AND not paying you — message me.
- **Send your shop link the same day.** Amazon's window is 24 hours.
- **Stripe costs you nothing a month.** Only when something sells.
