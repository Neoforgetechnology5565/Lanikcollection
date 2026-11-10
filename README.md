# LANIK COLLECTIONS: e-commerce site

Next.js 16 (App Router) · TypeScript · Tailwind 4 · PostgreSQL (Drizzle ORM) · Flutterwave payments.

## Run locally
```bash
cp .env.example .env        # fill in values (quote any value containing "#")
npm install
npm run db:push             # create tables
npm run db:seed             # demo products, categories, admin user from ADMIN_EMAIL / ADMIN_PASSWORD
npm run dev                 # http://localhost:3000   admin: /admin
npm test                    # payment-flow tests (uses a local fake Flutterwave, see below)
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

## Still to build
Customer accounts/login, wishlist, reviews, emails and notifications, Cloudinary/Supabase image upload (admin currently takes image URLs), categories and discounts admin UI, inline variant-level stock (stock is per product), rate limiting beyond the admin-login throttle, real product photography.
