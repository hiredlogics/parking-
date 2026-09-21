# Production storage — DigitalOcean Spaces

Customer evidence and released PDFs must use **private** object storage
through `StorageProvider` (`services/storage`).

Spaces uses the same S3-compatible client as Cloudflare R2
(`services/storage/r2Storage.ts`). Region is derived from the endpoint
(e.g. `lon1` from `https://lon1.digitaloceanspaces.com`).

## 1. Create a Space (DigitalOcean dashboard)

1. **Spaces Object Storage** → Create a Space
2. Choose a region close to your app (e.g. `lon1`, `ams3`, `nyc3`)
3. Name e.g. `parking-appeals` (lowercase)
4. Keep the Space **private** (no CDN public access for customer files)
5. **API** → Generate New Key → copy **Key** and **Secret**

## 2. Environment variables

Prefer the Spaces-named vars:

```
STORAGE_PROVIDER=spaces
SPACES_ENDPOINT=https://lon1.digitaloceanspaces.com
SPACES_REGION=lon1
SPACES_BUCKET=parking-appeals
SPACES_KEY=…
SPACES_SECRET=…
```

Equivalent (also supported):

```
STORAGE_PROVIDER=s3
S3_ENDPOINT=https://lon1.digitaloceanspaces.com
R2_BUCKET=parking-appeals
R2_ACCESS_KEY_ID=…
R2_SECRET_ACCESS_KEY=…
R2_REGION=lon1
```

## 3. Local vs production

| Environment | Typical storage |
|-------------|-----------------|
| Local / CI | `STORAGE_PROVIDER=memory` (tests) or keep Cloudflare R2 |
| DigitalOcean production | `STORAGE_PROVIDER=spaces` + Spaces credentials |

You can keep **R2 for local** and **Spaces on the DO droplet/App Platform** —
set different env on each host. Do not mix both providers in one process.

## Hard rules

- No `STORAGE_PROVIDER=memory` in production (startup refuses).
- No ephemeral local disk as the system of record.
- No public bucket / permanent public URLs for customer files.
- Document and evidence delivery must verify case ownership first
  (`requireCaseAccess` / document access helpers).

## Local / CI

`STORAGE_PROVIDER=memory` is allowed only for Playwright and unit tests
(`APP_ENV=test`).
