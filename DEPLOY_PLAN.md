# LezzFlow — Deploy Plan (Beta)

Date: 2026-09-27
Status: PLAN ONLY — no resources launched, no money spent. EC2 launch needs explicit approval.

## 1. What is ready to deploy

| Component | Status | Notes |
|---|---|---|
| Backend API (Node 20 + Express + PostgreSQL) | ✅ Ready | 104/104 tests green; Dockerfile + docker-compose.yml verified |
| DB migrations (001 + 002 address column) | ✅ Ready | Auto-applied via AUTO_MIGRATE / docker-entrypoint-initdb.d |
| Seller frontend → seller.legezt.in | ✅ Ready | QA'd by leez, 7 bugs fixed, build clean |
| Mart frontend → mart.legezt.in | ✅ Ready | QA'd by leez, 6 bugs fixed, build clean |
| Partner frontend → partner.legezt.in | ⏳ Building | Kimi K3 via aider, in progress |
| Admin frontend → admin.legezt.in | ⏳ Pending | Starts after Partner |

## 2. Target architecture (beta, single box)

```
Cloudflare DNS (legezt.in)
  api.legezt.in ─┐
  seller.legezt.in │
  mart.legezt.in   ├─► EC2 (Ubuntu 24.04, t3.small)
  partner.legezt.in │     ├─ nginx (TLS via Let's Encrypt, subdomain routing)
  admin.legezt.in ─┘     ├─ Docker: lezzflow-api (Node, port 3000)
                         └─ Docker: lezzflow-postgres (PG 15, volume)
```

- Frontend apps are static Vite builds → served by nginx per subdomain (no Node needed).
- Backend + Postgres run in Docker Compose on the same box (beta-simple; split later if needed).
- TLS: certbot + Let's Encrypt, one cert covering all 5 subdomains.

## 3. DNS plan (Cloudflare — legezt.in)

After EC2 launch, create these A records → `<EC2_PUBLIC_IP>` (proxied ON):

| Record | Target |
|---|---|
| api.legezt.in | EC2 IP |
| seller.legezt.in | EC2 IP |
| mart.legezt.in | EC2 IP |
| partner.legezt.in | EC2 IP |
| admin.legezt.in | EC2 IP |

Preparation done: Cloudflare API token to be stored in Secure Vault (DNS-ready).
Do NOT create records before the EC2 IP is known.

## 4. Environment variables (production .env on EC2 — never in git)

| Variable | Source | Status |
|---|---|---|
| PGDATABASE / PGUSER / PGPASSWORD | Generate at deploy | ⏳ At deploy |
| DATABASE_URL | Compose internal | ⏳ At deploy |
| FIREBASE_PROJECT_ID | Firebase console | ❌ Needed from user |
| FIREBASE_CLIENT_EMAIL | Service-account key | ❌ Needed from user |
| FIREBASE_PRIVATE_KEY | Service-account key | ❌ Needed from user |
| AWS_REGION | us-east-1 | ✅ Known |
| AWS_ACCESS_KEY_ID / AWS_SECRET_ACCESS_KEY | IAM user for Bedrock | ❌ Needed (or EC2 instance role) |
| BEDROCK_MODEL_ID | moonshotai.kimi-k3 | ✅ Known |
| JWT_SECRET | Generate at deploy | ⏳ At deploy |

Firebase authorized domains must add: seller/mart/partner/admin.legezt.in.

## 5. Deploy runbook (when approved)

1. Launch EC2 t3.small (Ubuntu 24.04), SG: 22 (restricted), 80, 443 open.
2. `apt update && apt install -y docker.io docker-compose-plugin nginx certbot python3-certbot-nginx`.
3. Clone repo, write production `.env` (values from table above).
4. `docker compose up -d --build` → verify `curl localhost:3000/api/health`.
5. Build the 4 frontends (`npm run build` each), copy `dist/` to `/var/www/<subdomain>`.
6. Nginx server blocks per subdomain (static root + `/api` proxy for api.legezt.in).
7. `certbot --nginx -d api.legezt.in -d seller.legezt.in -d mart.legezt.in -d partner.legezt.in -d admin.legezt.in`.
8. Create Cloudflare A records (section 3).
9. Smoke test: register → create shop → add product → discover → order → deliver (full loop).
10. Done. Announce URLs.

Estimated time: 1–2 hours. Estimated cost: t3.small ≈ $15/month (Mumbai ap-south-1).

## 6. Rollback

- Frontend: keep previous `dist/` as `/var/www/<subdomain>.bak`, swap nginx root back.
- Backend: `docker compose` previous image tag; DB volume `postgres_data` persists (migrations are additive).

## 7. Blockers (need user)

1. ⛔ Explicit approval to launch EC2 (spends money).
2. ⛔ Firebase service-account key (PROJECT_ID, CLIENT_EMAIL, PRIVATE_KEY).
3. ⛔ AWS credentials for Bedrock on the server (or approval to use an EC2 instance role).
4. ⏳ Partner + Admin frontend builds (in progress).
