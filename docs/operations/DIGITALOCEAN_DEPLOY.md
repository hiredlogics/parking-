# DigitalOcean deployment

This application is prepared for container deployment. **Do not provision
client production infrastructure until explicitly instructed.**

## Artefacts

| Item | Path |
|------|------|
| Production image | `Dockerfile` |
| Build context exclusions | `.dockerignore` |
| Schema + KB migrate | `npm run migrate` (`scripts/migrate.mts`) |
| Health probe | `GET /api/health` |
| Production config guard | `lib/config/production.ts` + `instrumentation.ts` |

## Required environment (production)

See `lib/config/production.ts` for the authoritative fail-fast list. At minimum:

- `APP_ENV=production`
- `DATABASE_URL` (Neon / Lakebase Postgres)
- `SESSION_PASSWORD` (≥32 chars, not the repo default)
- `ADMIN_PASSWORD` (≥12 chars, not `changeme`)
- `PAYMENT_PROVIDER=stripe` + Stripe secrets
- `STORAGE_PROVIDER=spaces` (or compatible S3) + Spaces credentials
- `OPENAI_API_KEY` + production AI provider settings
- `APP_URL` / `NEXT_PUBLIC_APP_URL` = public origin (e.g. `https://client.example`)

## Deploy sequence (when authorised)

1. Build image: `docker build -t parking-appeals:prod .`
2. Run migrate once against the target DB: `npm run migrate`
3. Start container with production env
4. Point health checks at `/api/health`
5. Configure Mojo reverse proxy (see `MOJO_REVERSE_PROXY.md`)

## Staging

Use a separate Neon branch / Spaces bucket / Stripe test mode:

```
APP_ENV=staging   # treated as production-strict by config guards
PAYMENT_PROVIDER=stripe
STRIPE_*_TEST keys
STORAGE_PROVIDER=spaces
SPACES_BUCKET=…-staging
APP_URL=https://staging.client.example
```
