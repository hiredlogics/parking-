# Mojo reverse-proxy handoff (`/appeal`)

## Target

Public URL: `https://CLIENT-DOMAIN/appeal`

The Next.js app already serves product routes under `/appeal/...`
(`app/appeal/upload`, etc.). Prefer **path-preserving** proxying over
Next `basePath` unless the route tree is flattened.

## Recommended Mojo / nginx mapping

```
https://CLIENT-DOMAIN/appeal/*  →  http://appeals-app:3000/appeal/*
https://CLIENT-DOMAIN/api/*     →  http://appeals-app:3000/api/*
https://CLIENT-DOMAIN/portal/*  →  http://appeals-app:3000/portal/*
https://CLIENT-DOMAIN/checkout/*→  http://appeals-app:3000/checkout/*
https://CLIENT-DOMAIN/signin    →  http://appeals-app:3000/signin
… (auth, admin, static /_next as required)
```

Alternatively proxy the whole host to the app if Mojo is dedicated.

## App configuration

- `APP_URL=https://CLIENT-DOMAIN` (no trailing `/appeal` suffix if paths
  already include `/appeal`)
- Absolute links use `lib/config/publicUrl.ts` (`publicUrl()`, `paths`)
- Optional `NEXT_PUBLIC_BASE_PATH` only if you intentionally enable Next
  `basePath` (avoid doubling `/appeal/appeal`)

## Verify after cutover

- [ ] Pages under `/appeal/*`
- [ ] `/_next` assets load
- [ ] Auth redirects + session cookies (`Secure`, `SameSite`, path)
- [ ] PDF view + download
- [ ] Stripe success `/checkout/[id]/success` and cancel `/appeal/review`
- [ ] Email links resolve via `publicUrl()`
- [ ] Portal navigation
- [ ] `/api/health` from Mojo health check
