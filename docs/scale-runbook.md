# LezzFlow scale-out runbook (scaling cycle-3)

How to grow past a single t3.small without guessing. Docs only — no
infrastructure is created by this file.

## 1. Database connection pooling (PgBouncer)

Node opens one pg Pool per worker (currently `max: 10` per process in
`db/index.js`). Without pooling, connections grow linearly with workers.

### Transaction pooling example

```ini
# /etc/pgbouncer/pgbouncer.ini
[databases]
lezzflow = host=127.0.0.1 port=5432 dbname=lezzflow

[pgbouncer]
listen_port = 6439
listen_addr = 127.0.0.1
pool_mode = transaction
max_client_conn = 200
default_pool_size = 15
min_pool_size = 5
reserve_pool_size = 5
server_idle_timeout = 30
```

Point the app at PgBouncer by changing `DB_PORT=6439` (or the connection
string port) in the api container env. Prepared statements must stay OFF
in transaction mode — the app uses simple parameterized queries, which is
compatible.

### Hard rule

> **total workers × pool.max < 50**

Count every Node worker (cluster workers on the EC2 host) plus any other
service hitting Postgres directly. Example: 4 cluster workers × pool.max 10
= 40 < 50 ✓. If you raise `CLUSTER_WORKERS`, lower `pool.max` first.

## 2. CloudWatch alarms

| Alarm | Threshold | Action |
|---|---|---|
| CPU credit balance low | `CPUCreditBalance < 100` (t3.small) | Warn in ops channel; prep degraded mode |
| CPU credit exhausted | `CPUCreditBalance < 20` | Enable `DEGRADED_MODE=1` immediately |
| API 5xx spike | `HTTPCode_Target_5XX` > 1% for 5 min | Check api container logs, consider scale |

**Why CPUCreditBalance matters:** t3.small earns CPU credits while idle and
spends them under load. Sustained traffic without credits = throttled CPU =
slow responses that look like an app bug. If the balance trends down for
hours, either scale up (t3.medium) or shed load (degraded mode) — don't wait
for zero.

## 3. Degraded-mode playbook

Enable: set `DEGRADED_MODE=1` in the api container env and restart
(`docker compose up -d api`). Disable: unset and restart.

While degraded mode is on, the API automatically:

1. **Discovery** — serves stale cached shop-discovery results (`X-Cache: STALE`)
   where a cached copy exists, instead of querying Postgres.
2. **AI advisory** — `GET /api/advisory/feasibility` returns
   `503 { code: "DEGRADED_MODE", retryable: true }` with `Retry-After: 60`.
   No fake advice is ever generated.
3. **Scan jobs** — new `POST /api/v1/scan/jobs` are stored with
   `status = 'parked'`; the worker skips them.
4. **Nudges** — nonessential `scheme_offer` / `promo` notifications are
   rejected with 503; order updates and system alerts still flow.

### Recovery

1. Confirm `CPUCreditBalance` recovering and 5xx rate back to ~0.
2. Unset `DEGRADED_MODE` and restart the api container.
3. Re-queue parked scan jobs:
   ```sql
   UPDATE scan_jobs SET status = 'queued', updated_at = NOW()
   WHERE status = 'parked';
   ```
   (or call `requeueParkedJobs()` from `services/scanQueue.js`).
4. Verify `/health` on all subdomains and spot-check discovery + advisory.

## 4. What NOT to do

- Don't raise cluster workers without re-checking the `workers × pool.max < 50` rule.
- Don't "fix" degraded mode by deleting the flag's checks — the 503s are
  the load-shedding mechanism.
- Don't store image bytes in `scan_jobs.payload` — S3 key references only.
