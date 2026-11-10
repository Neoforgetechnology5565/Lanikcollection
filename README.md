# LANIK COLLECTIONS: e-commerce site

Next.js 16 (App Router) · TypeScript · Tailwind 4 · PostgreSQL (Drizzle ORM) · Flutterwave payments.

## Run locally
```bash
cp .env.example .env        # fill in values (quote any value containing "#")
npm install
npm run db:push             # create tables
npm run db:seed             # demo products, categories, admin user from ADMIN_EMAIL / ADMIN_PASSWORD
npm run dev                 # http://localhost:3000   admin: /admin
npm test                    # 19 tests; needs TEST_DATABASE_URL (a separate DB) and uses a local fake Flutterwave
```

## Payments (Flutterwave)
| Customer choice | How it works |
|---|---|
| Bank transfer | `POST /v3/charges?type=bank_transfer` creates a **unique virtual account per order**. Shown with bank, number, exact amount and a countdown. |
| Card (Visa/Mastercard/Verve), USSD, OPay, QR, Internet banking | Flutterwave hosted checkout restricted to that one channel. |
| Manual transfer (optional) | Customer uploads a receipt. **An admin must approve it**: upload alone never marks anything paid. |

**An order becomes PAID only when** our server asks Flutterwave (`verify_by_reference`) and gets `successful`, NGN, amount ≥ order total. This is triggered by the signed webhook, by the pay page's status poll, by the redirect-return page, and by a final check right before expiry. Webhook bodies, redirect query strings and screenshots are never trusted.

Edge cases handled (all covered in `tests/payments.test.ts`): bad webhook signature, replayed/concurrent webhooks, forged "success" for an unpaid order, underpayment (→ `REVIEW`), overpayment (noted), duplicate payment (→ `REVIEW`), delayed notification (caught before expiry), late transfer after expiry (stock re-reserved → `PAID`, or `REVIEW` if sold out), provider outage during expiry (order left open), channel not enabled on the merchant account (attempt recorded as FAILED, customer offered another method).

### Go-live checklist
1. Flutterwave Dashboard → Settings → API: copy keys into `FLW_PUBLIC_KEY` / `FLW_SECRET_KEY`. Sandbox uses `FLWSECK_TEST-…` keys with `FLW_MODE=sandbox`. Live uses live keys with `FLW_MODE=live`. The app refuses mismatches.
2. Settings → Webhooks: URL `https://YOUR-DOMAIN/api/webhooks/flutterwave`, secret hash = `FLW_SECRET_HASH`.
3. Schedule `GET /api/cron/expire` every 5 min with `Authorization: Bearer $CRON_SECRET`. It expires unpaid orders and releases stock.
4. Admin → Settings: enable only the channels your merchant account actually has, set the transfer expiry (1–3 h), shipping fee, WhatsApp number.
5. **Run a sandbox transaction per channel before going live.** See "Not verified" below.

## Not verified against the real Flutterwave API
I had no Flutterwave credentials, so everything above was tested against `scripts/mock-flutterwave.ts`, a local stand-in written from Flutterwave's v3 documentation. Confirm these with sandbox keys:
- The exact fields of the bank-transfer charge response (`meta.authorization.*`) and whether it returns the account name. The app falls back to the business name.
- **Whether the dynamic account's expiry can be set per request.** The app doesn't send a duration; it applies *your* 1–3 h limit itself and shows the *shorter* of that and the expiry Flutterwave returns. Late transfers are still matched (see above).
- Channel codes sent to hosted checkout: `card, ussd, opay, nqr, account`.
- Which channels your merchant account has enabled.

## What's in the box
**Storefront:** rotating hero, category tiles, best sellers / new arrivals, promo band, wholesale section, newsletter, product pages (gallery, size/colour, wholesale tiers, accordion, verified-buyer reviews, wishlist), search with live suggestions, cart, checkout with server-computed totals (discount code, shipping by state), order tracking (guest or account), customer accounts with saved addresses, FAQ / shipping / privacy / terms pages, WhatsApp button, SEO metadata + product JSON-LD.

**Admin (`/admin`):** dashboard, orders (+ detail and fulfilment with customer emails), payments (all transactions, VA details, report, CSV), receipt review, customers, review moderation, products (image upload), inventory, categories, discount codes, shipping fees by state, website content (banners, announcement, promo, contact, socials), payment settings, email outbox.

**Email:** order received, payment confirmed and status updates are recorded in Admin → Emails and delivered when `SMTP_URL` / `MAIL_FROM` are set.

**Product art:** until real photos are uploaded, products show gold line-art illustrations by category.

## Deploy to the web (no desktop needed)

This is a Node.js + PostgreSQL app, so it needs a host that runs Node and offers Postgres. Ordinary PHP/cPanel shared hosting and WordPress-style plans **cannot** run it.

**Easiest route (all in the browser):** GitHub repo → **Vercel** (the website) + **Neon** (database) + **Cloudinary** (product photos) + **Resend** (email).

1. **Neon** (neon.tech): create a project; copy the *pooled* connection string.
2. **Vercel** (vercel.com): *Add New → Project* → import this GitHub repo, branch `claude/confident-dirac-h4rnzd` (or merge it to `main` and use that).
   - *Build Command* override: `npm run vercel-build`
   - *Environment Variables*: `DATABASE_URL` (Neon), `DB_POOL_MAX=3`, `APP_URL` (https://yourdomain.com, or the vercel.app URL first), `SESSION_SECRET`, `CRON_SECRET`, `ADMIN_EMAIL`, `ADMIN_PASSWORD`, `FLW_MODE`, `FLW_PUBLIC_KEY`, `FLW_SECRET_KEY`, `FLW_SECRET_HASH`, `CLOUDINARY_URL`, `RESEND_API_KEY`, `MAIL_FROM`.
   - Deploy. `vercel-build` creates/updates the tables, and on the very first deploy creates demo data and your admin account (it never resets an existing admin).
3. **Domain:** Vercel → project → Settings → Domains → add your domain and follow its DNS instructions; then set `APP_URL` to the domain and redeploy.
4. **Webhook:** Flutterwave Dashboard → Settings → Webhooks → URL `https://yourdomain.com/api/webhooks/flutterwave`, secret hash = your `FLW_SECRET_HASH`.
5. **Scheduler (every 5 min):** Vercel's free plan only allows daily cron, so use the included GitHub Action: repo → Settings → Secrets and variables → Actions → add `SITE_URL` and `CRON_SECRET` (same value as in Vercel). It starts running automatically.

Notes: Vercel's free (Hobby) plan is for non-commercial use, so a shop should use a paid plan. Receipt uploads (manual bank transfer, off by default) need S3-compatible private storage (e.g. Cloudflare R2); the file system on Vercel is read-only, so the `local` storage driver will not work there. `vercel-build` runs `drizzle-kit push --force`; it applies additive changes safely, but review any future schema change that removes columns before deploying it.

**Alternative:** any VPS (Hetzner, DigitalOcean, etc.) with Node 22 + Postgres: `npm install && npm run db:push && npm run setup && npm run build && npm run start` behind Nginx/Caddy with HTTPS, plus a cron entry for `/api/cron/expire`. Local disk storage works there.

## Operations

**Scheduler (every 5 minutes):** `GET /api/cron/expire` with `Authorization: Bearer $CRON_SECRET`. It expires unpaid orders, releases stock, retries queued/failed emails, and purges old rate-limit rows.

**Stock** is tracked per size/colour (`product_variants`); `products.stock` is a cached total. Databases created before this change: run `npx tsx --env-file=.env scripts/backfill-variants.ts` once.

**Storage:** product images and private receipts go through `src/lib/storage.ts`: `local` (default, single server only), any S3-compatible bucket (AWS S3, Cloudflare R2, Supabase, MinIO), or Cloudinary for product images. See `.env.example`. Receipts are never public.

**Email:** set `RESEND_API_KEY` or `SMTP_URL` (+ `MAIL_FROM`). Order emails use templates editable in Admin → Email templates. Admin → Emails shows every message, lets you preview and resend, and failed mail is retried automatically (max 5 attempts).

**Customer accounts:** email verification is required before guest orders placed with the same email appear in an account (prevents someone registering your address to read your orders). Password reset links are single-use and last 1 hour; a reset or password change signs out all other devices.

**Rate limiting** is stored in Postgres, so it holds across multiple servers. Limits are per account (email) and per IP. Behind a proxy, make sure it overwrites `X-Forwarded-For`.

**Refunds:** Admin → order → Refunds. "Refund via Flutterwave" calls the provider; "manual" records a refund you made yourself. Amounts are capped at what was paid, under a row lock, so the same money can't be refunded twice. A full refund cancels an unshipped order and releases its stock.

**Reports:** Admin → Reports (by day/week/month, top products, categories, payment methods, states, refunds, CSV export). Days are Lagos days.

## Not verified against real services
Flutterwave (see above, including the refund endpoint shape), Resend, S3-compatible providers and Cloudinary have been exercised only against local stand-ins that follow their public docs. Send one real test of each before launch.

## Known gaps
- No admin tool to edit/delete customers or send marketing email to subscribers.
- No in-app image cropping or reordering of product images.
- Privacy / terms / shipping pages are templates: review them before launch.
