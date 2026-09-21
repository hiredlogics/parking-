# DigitalOcean deployment

This application is prepared for container deployment (Droplet, App
Platform, or any Docker host).

## Artefacts

| Item | Path |
|------|------|
| Production image | `Dockerfile` |
| Build context exclusions | `.dockerignore` |
| Schema + KB migrate | `npm run migrate` (`scripts/migrate.mts`) |
| Health probe | `GET /api/health` |
| Production config guard | `lib/config/production.ts` + `instrumentation.ts` |
| Spaces (file storage) | `docs/operations/SPACES_STORAGE.md` |

## Two separate DigitalOcean pieces

| Piece | What it is | Env |
|-------|------------|-----|
| **App host** | Droplet / App Platform running Next.js | `APP_URL`, DB, Stripe, OpenAI, … |
| **Spaces** | Private object storage for PDFs/images | `STORAGE_PROVIDER=spaces` + `SPACES_*` |

You can still use **Cloudflare R2** for storage while hosting the app on
DigitalOcean — set `STORAGE_PROVIDER=r2` and the R2 vars instead.

## Required environment (production)

See `lib/config/production.ts` for the authoritative fail-fast list. At minimum:

- `APP_ENV=production`
- `POSTGRES_URL` or `DATABASE_URL` (managed Postgres)
- `SESSION_PASSWORD` (≥32 chars, not the repo default)
- `ADMIN_PASSWORD` (≥12 chars, not `changeme`)
- `PAYMENT_PROVIDER=stripe` + Stripe secrets
- `STORAGE_PROVIDER=spaces` + Spaces credentials (see SPACES_STORAGE.md)
  — or `STORAGE_PROVIDER=r2` if keeping Cloudflare
- `OPENAI_API_KEY` + production AI provider settings
- `APP_URL` / `NEXT_PUBLIC_APP_URL` = public origin (e.g. `https://client.example`)

### Spaces example (on the DO host)

```
STORAGE_PROVIDER=spaces
SPACES_ENDPOINT=https://lon1.digitaloceanspaces.com
SPACES_REGION=lon1
SPACES_BUCKET=parking-appeals
SPACES_KEY=…
SPACES_SECRET=…
```

## Deploy sequence

### Option A — Docker on a Droplet

1. Create a Droplet (Ubuntu) with Docker installed
2. Copy the repo (or pull from git) onto the server
3. Build: `docker build -t parking-appeals:prod .`
4. Create a production `.env` (or DO App Platform env) with the vars above
5. Run migrate once against the target DB: `npm run migrate`
6. Start: `docker run -d --env-file .env -p 3000:3000 parking-appeals:prod`
7. Point health checks at `/api/health`
8. Put Nginx / Caddy / Mojo in front with TLS (see `MOJO_REVERSE_PROXY.md`)

### Option B — App Platform

1. Create App from GitHub repo
2. Build command / Dockerfile as in this repo
3. Add the same production env vars in the App Platform UI
4. Attach a managed Postgres (or external `POSTGRES_URL`)
5. Run `npm run migrate` once (Job component or one-off)
6. Health check path: `/api/health`

## Staging

Use a separate Postgres / Spaces bucket / Stripe test mode:

```
APP_ENV=staging   # treated as production-strict by config guards
PAYMENT_PROVIDER=stripe
STRIPE_*_TEST keys
STORAGE_PROVIDER=spaces
SPACES_BUCKET=…-staging
APP_URL=https://staging.client.example
```
