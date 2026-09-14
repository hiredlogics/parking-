# Stripe production readiness

## Mode

- `PAYMENT_PROVIDER=stripe` required in production (demo refused at startup).
- Webhook: `POST /api/webhooks/stripe`
- Raw body + `stripe-signature` verification (`PaymentSignatureError` → 400).
- Idempotency: provider event id claimed in DB before state changes
  (`lib/payments/providers/stripe.ts` + `lib/payments/repo.ts`).
- Re-delivery returns `duplicate: true` without double-entitling.

## Rate limiting

Stripe webhooks are **intentionally exempt** from customer rate-limit
classes (`lib/rateLimit.ts` documents WEBHOOK as absent). Do not put
this route behind AUTH/CHECKOUT budgets.

## Checkout URLs

Built via `publicUrl()` / `paths` in `lib/config/publicUrl.ts`:

- Success: `/checkout/[caseId]/success`
- Cancel: `/appeal/review`

`APP_URL` must be the public origin customers hit through Mojo.
