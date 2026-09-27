# Briefing for leez (second Muse agent) — LezzFlow project

Hi leez! I'm Muse, Jibraan's main AI agent. Jibraan connected us through his home PC so we can collaborate on the LezzFlow project. This file is your full briefing — please read it completely, then reply READY with your environment check results.

## What is LezzFlow

A hyperlocal commerce platform. One shared backend (Node.js + Express + PostgreSQL, Firebase Google login) serving 4 mobile-first React apps:

- **seller.legezt.in** — LezzFlow Seller: shop create/manage, products (AI scan / barcode / manual entry), orders (accept → pack)
- **mart.legezt.in** — LezzFlow Mart: customer app, GPS shop discovery (OpenStreetMap, 5/10/20 km layers), delivery or self-pickup, orders
- **partner.legezt.in** — LezzFlow Partner: delivery partner registration with Aadhaar/PAN/driving-licence KYC upload; cannot work until admin approves
- **admin.legezt.in** — internal admin portal: KYC approval queue, shops/products/orders/users overview

Beta scope: AI product scanner (AWS Bedrock, Kimi K3 model) + barcode lookup (Open Food Facts) + manual entry. Payment = "coming soon" (no real payments in beta). KYC files are highly sensitive — never expose or log them.

## Current state (as of 2026-09-27)

1. **Backend**: fully built and tested (70/70 Jest tests pass). This repo. Local Docker setup included. Firebase Admin service-account key still pending (do NOT invent one).
2. **Frontends**: being built RIGHT NOW by Kimi K3 (via aider) on the main machine — seller app first, then mart, partner, admin. Vite + React, Firebase Google sign-in, wired to the real backend API. You will receive the code for review via this GitHub repo once each app is done.
3. **Firebase**: project `lezzflow-63a5a` exists, Google sign-in enabled. Production domains (seller/mart/partner/admin.legezt.in) still need to be added to Firebase authorized domains.
4. **You are on Jibraan's home PC** (Kali Linux). AWS CLI is already configured there (`~/.aws/credentials`, region `us-east-1`).

## Your 3 jobs

### JOB 1 — Frontend QA / review
When Kimi finishes each app, the code will appear in this repo. Review it for: bugs, broken API wiring (endpoints must match this backend's routes), security issues, missing loading/error states, mock or placeholder data (not allowed — everything must be real). Report every bug clearly with file + line number. Do NOT rewrite whole apps — report first; fix only small, obvious bugs.

### JOB 2 — AWS deploy prep
Prepare the deployment plan. Backend has a Dockerfile + docker-compose.yml. Target: EC2 + PostgreSQL, serving the 4 subdomains (seller/mart/partner/admin.legezt.in). Check what exists on this PC (`docker --version`, `node --version`). Write a step-by-step deploy plan as `DEPLOY_PLAN.md` in this repo. **NEVER create paid AWS resources, enable billing, or change payment settings without explicit owner approval relayed through the main agent.**

### JOB 3 — GitHub
Manage this repo: keep `main`/`master` clean, clear README, sensible commit messages. Future pushes of backend + frontends will come through the main agent.

## Coordination protocol

- You and I collaborate through Jibraan's main Muse agent via this chat bridge. Report findings to the main agent; it relays to Jibraan.
- **Hard boundaries**: never publish or post anything publicly; never deploy to production; never spend money or touch billing; never reply to anyone outside this project — without explicit owner approval relayed through the main agent.
- Never invent credentials, keys, or config values. If something is missing, say so.

## Your first step RIGHT NOW

Verify your environment on the home PC. Run:
```
aws sts get-caller-identity
docker --version
node --version
gh --version
```
Report back what works and what's missing (`gh` can be installed via `apt install gh` if missing; `gh auth login` uses a device flow the owner approves on his phone).

Then stand by for the frontend code. Reply **READY** with your environment check results.
