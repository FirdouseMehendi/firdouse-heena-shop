# Firdouse Heena — free online shop

A fast, mobile-first henna store with **real card / UPI payments** and **no monthly cost**.

- **Website:** plain HTML/CSS/JS in `public/` — hosted free on **Cloudflare Pages** (unlimited bandwidth).
- **Payments:** **Razorpay** — free account, no monthly fee, ~2% + GST **per successful payment only**.
- **Server code:** two tiny functions in `functions/api/` that create the Razorpay order and verify the payment. No database, no server to maintain.
- **You manage products** by editing one file: `public/data/products.json`.

There is **no free card processing anywhere** — every processor (including Shopify's) takes a small cut per sale. This setup removes the *fixed* costs: if you sell nothing, you pay nothing.

---

## 1. What's in this project

```
public/                     everything the browser downloads
  index.html                the shop
  about/contact/terms/…     info pages (required by Razorpay — see step 4)
  assets/styles.css, app.js
  images/brand, images/products
  data/site.json            shop name, contact, banner, shipping rules, categories
  data/products.json        YOUR PRODUCTS  ← edit this
functions/api/
  create-order.js           builds the Razorpay order from trusted prices
  verify-payment.js         checks the payment signature
  consult.js                AI henna consultant (chat widget on the site)
.dev.vars.example           template for local secrets
```

---

## 2. Add / edit / remove products

Open **`public/data/products.json`**. It's a list of products. Copy one block, change the values:

```json
{
  "id": "rose-bridal-cone-12",          // unique, lowercase, no spaces — used in the URL
  "title": "Rose Bridal Henna Cones (Pack of 12)",
  "category": "Bride & Cone Essentials", // should match one in site.json > categories
  "price": 249,                          // selling price in ₹ (whole rupees)
  "mrp": 349,                            // struck-through "before" price; set equal to price for no discount
  "stock": 40,                           // 0 = shows "Sold out"
  "badges": ["Sale", "Bestseller"],      // small labels; [] for none. "New" shows gold
  "images": ["images/products/cone.svg"],// one or more; first is the thumbnail
  "description": "Hand-rolled, chemical-free henna paste…"
}
```

- **Remove** a product: delete its block (and the comma before it).
- **Categories** shown in the menu come from `public/data/site.json` → `categories`. Keep product `category` values spelled exactly the same.
- After saving, commit and push — Cloudflare redeploys automatically in ~1 minute (see step 6).

### Product photos

Drop `.jpg`/`.png` files straight into `public/images/products/` and point `images` at them, e.g. `"images/products/rose-cone.jpg"`. Keep each photo under ~300 KB and roughly square.

Optional helper to auto-resize: put originals in `public/images/products/_raw/`, run `npm i sharp` then `npm run images` — it writes optimised `.webp` files.

---

## 3. Create your Razorpay account

1. Sign up at **razorpay.com** with your business email.
2. Go to **Settings → API Keys** and click **Generate Test Key**. Copy the **Key Id** (`rzp_test_…`) and **Key Secret**. You'll use these for local testing.
3. Start **KYC / account activation**: you'll need PAN, a bank account, and your business/website links. Razorpay checks that your site has the info pages in step 4 and visible prices — this project already has all of them.
4. After activation, generate a **Live Key** (`rzp_live_…`) the same way. Live keys replace the test keys in step 7.

---

## 4. Fill in your real business details

Search the project for **`[FILL IN`** and replace every placeholder. Files:

- `public/data/site.json` — email, phone, address, Instagram, banner text, shipping amounts.
- `public/about.html`, `public/contact.html`, `public/terms.html`, `public/privacy.html`, `public/shipping.html`, `public/refund.html` — owner name, address, GSTIN (if any), courier names, dates.

Razorpay will not activate the account until Contact, Terms, Privacy, Shipping and Refund pages have genuine details.

---

## 5. Test it on your computer (optional but recommended)

You need **Node.js 18+** (you have it) and the test keys from step 3.

```bash
cd firdouse-heena-shop
npm install
cp .dev.vars.example .dev.vars      # then edit .dev.vars, paste your rzp_test_ keys
npm run dev                          # opens http://localhost:8788
```

Check:
- products load, category filter + search work, product pop-up works;
- "Add to cart" → cart drawer → "Checkout" → fill the form → **Pay securely**;
- the Razorpay **test** window opens. Pay with test card **4111 1111 1111 1111**, any future expiry, any CVV, OTP **1234** (or use test UPI `success@razorpay`);
- you land on the "Order confirmed" screen and the order appears in your Razorpay **Test Mode** dashboard under **Transactions → Orders**, with the shipping address in the order **Notes**.

`.dev.vars` is git-ignored — it never gets uploaded.

---

## 6. Put it online (free) with Cloudflare Pages

1. Create a free **GitHub** account and a new **empty** repository, e.g. `firdouse-heena-shop`.
2. In this folder:
   ```bash
   git init
   git add .
   git commit -m "Initial shop"
   git branch -M main
   git remote add origin https://github.com/<your-username>/firdouse-heena-shop.git
   git push -u origin main
   ```
3. Create a free account at **dash.cloudflare.com** → **Workers & Pages** → **Create** → **Pages** → **Connect to Git** → pick your repo.
4. Build settings:
   - **Framework preset:** None
   - **Build command:** *(leave empty)*
   - **Build output directory:** `public`
   - Click **Save and Deploy**.
5. You get a URL like `https://firdouse-heena-shop.pages.dev`. To make it `firdouseheena.pages.dev`, rename the project in **Pages → Settings**.

### Add your keys on Cloudflare

**Pages project → Settings → Environment variables → Production** — add:

| Name | Value |
| --- | --- |
| `RAZORPAY_KEY_ID` | your `rzp_test_…` (switch to `rzp_live_…` when ready) |
| `RAZORPAY_KEY_SECRET` | the matching secret |
| `GROQ_API_KEY` | optional — turns on the AI henna consultant, see [section 11](#11-ai-henna-consultant-optional) |

Then **Deployments → Retry deployment** so the new values take effect. (Add the same variables under **Preview** if you want preview builds to take payments / AI chat too.)

---

## 7. Go live

1. Finish Razorpay KYC (step 3).
2. Replace both Cloudflare variables with your **`rzp_live_…`** key + secret, redeploy.
3. Make one real ₹10 purchase on the live site, confirm it in the Razorpay dashboard, then **refund** it from there.
4. Share your link. Done.

---

## 8. Updating the shop later

Edit files → `git add . && git commit -m "…" && git push`. Cloudflare redeploys in about a minute. That's the whole workflow.

---

## 9. Custom domain (optional, ~₹800–1200/year)

Buy a domain (e.g. from Cloudflare Registrar — at cost). In the Pages project → **Custom domains → Set up a domain** → follow the steps. Then update the hard-coded `https://firdouseheena.pages.dev` URLs in `public/index.html` (meta tags), `public/sitemap.xml` and `public/robots.txt` to your new domain.

---

## 10. Good next steps (not built yet)

- **Order email:** add a Razorpay **webhook** (`payment.captured`) → a third function that emails you each order. Until then, every order is in the Razorpay dashboard.
- **Coupon codes**, customer accounts, live courier rates.
- **Separate product pages** for better Google ranking (would add a small build step).

---

## 11. AI henna consultant (optional)

A chat widget ("Ask our Henna Expert", bottom-right on the homepage) that recommends real products from `products.json` and answers care/application questions. It's grounded in your actual catalog server-side (`functions/api/consult.js`) — it can't invent products or prices, and it only ever suggests items + sizes that really exist.

**Turn it on (free, no card needed):**
1. Go to **console.groq.com/keys**, sign in (email or Google), click **Create API Key**. It's free.
2. Add `GROQ_API_KEY` to Cloudflare (see table above) and to your local `.dev.vars`, then redeploy / restart `npm run dev`.

Without a key, the widget still shows but replies with a friendly "not switched on yet" message — the rest of the shop is unaffected. To change what it knows, edit the `CARE_TIPS` text or the product descriptions it reads from `functions/api/consult.js` / `public/data/products.json`.

---

## Notes on how money and safety work here

- Prices are **recalculated on the server** (`functions/api/create-order.js`) from `products.json`. A user editing prices in their browser cannot change what they're charged.
- The browser never sees your **Key Secret**. Only the publishable **Key Id** reaches the page (that's normal and safe).
- Card/UPI details are entered inside **Razorpay's** window, not on your site — so you have no card data to protect.
- The success callback is only trusted after `verify-payment.js` confirms Razorpay's signature.
