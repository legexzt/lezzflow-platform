# LezzFlow Admin (`admin.legezt.in`)

Desktop-friendly admin console for the LezzFlow platform. Simple, clean, and
wired entirely to the real backend API — no mock data anywhere.

## Stack

- Vite + React 18
- React Router v6
- Axios
- Firebase Auth (Google sign-in)

## Setup

1. Copy brand assets into `public/` (one-time):

   cp /home/hatch/workspace/lezzflow-logos/lezzflow-icon.png public/
   cp /home/hatch/workspace/lezzflow-logos/favicon.png public/
   cp /home/hatch/workspace/lezzflow-logos/lezzflow-horizontal-dark.png public/

2. Create your env file and fill in the Firebase web config values
   (apiKey, appId, messagingSenderId) from
   /home/hatch/workspace/goals/lezzflow-working-platform-beta/hidden_files/firebase.json:

   cp .env.example .env

   Set VITE_API_URL if the backend is not running on http://localhost:3000.

3. Install and run:

   npm install
   npm run dev

## Ports

| App              | Dev port |
| ---------------- | -------- |
| admin (this app) | 5174     |

## Build

   npm run build

Outputs a static site to dist/.

## Features

- Google sign-in -> POST /api/auth/verify { idToken, role: 'admin' }
- Hard role gate: any signed-in user whose role is not `admin` gets an
  in-place access-denied screen with sign-out. No redirects; every route is
  protected by the same gate.
- Dashboard — GET /api/admin/stats (platform overview cards)
- Shops — GET /api/admin/shops?search=
- Orders — GET /api/admin/orders?status=
- Users — GET /api/admin/users?role=
- Products — GET /api/admin/products?shopId=
- KYC review — GET /api/admin/kyc/pending,
  POST /api/admin/kyc/:id/approve, POST /api/admin/kyc/:id/reject
  - Document files and ID numbers are never displayed; only
    "Document on file" labels.

## Auth

Every API request attaches a fresh Firebase ID token as
Authorization: Bearer <token> (see src/api.js), so expired tokens are
renewed automatically by the Firebase SDK.
