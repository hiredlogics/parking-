# Production storage — DigitalOcean Spaces

Customer evidence and released PDFs must use **private** object storage
through `StorageProvider` (`services/storage`).

## Configuration

```
STORAGE_PROVIDER=spaces
SPACES_ENDPOINT=https://<region>.digitaloceanspaces.com
SPACES_REGION=<region>
SPACES_BUCKET=<private-bucket>
SPACES_KEY=…
SPACES_SECRET=…
# Optional CDN host — never make the bucket permanently public
```

The Spaces provider reuses the S3-compatible client in
`services/storage/r2Storage.ts` (endpoint/region/checksum settings).

## Hard rules

- No `STORAGE_PROVIDER=memory` in production (startup refuses).
- No ephemeral local disk as the system of record.
- No public bucket / permanent public URLs for customer files.
- Document and evidence delivery must verify case ownership first
  (`requireCaseAccess` / document access helpers).

## Local / CI

`STORAGE_PROVIDER=memory` is allowed only for Playwright and unit tests
(`APP_ENV=test`).
