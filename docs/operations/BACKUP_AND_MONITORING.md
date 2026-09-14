# Backup, restore, and monitoring

## Database (Neon)

- Use Neon’s built-in PITR / branch snapshots for Lakebase Postgres.
- Before risky deploys: create a Neon branch from production.
- After schema changes: run `npm run migrate` on the target branch.
- Restore drill: branch from a point-in-time, point a staging app at it,
  run `/api/health` + a dry portal login.

## Object storage (Spaces)

- Enable Spaces versioning on the private bucket.
- Lifecycle: retain deleted object versions ≥ 30 days.
- Restore: copy versioned keys back; never “fix” by re-rendering a
  released PDF from scratch if the artefact exists.

## Application monitoring plan

| Signal | Source | Alert |
|--------|--------|-------|
| Process up | `/api/health` | 2+ consecutive 503 |
| DB | health `db` field | unavailable |
| 5xx rate | reverse-proxy / app logs | >1% over 5m |
| Stripe webhooks | Stripe dashboard + app logs | signature failures |
| AI spend | `ai_usage` table | daily budget breach |
| Queue depth N/A | — | generation is request-time |

Structured logs: `lib/logging/logger.ts` (JSON lines). Ship container
stdout to DO Monitoring / Loki / equivalent. **Never** log raw notice
images, session secrets, or full PCN payloads.
