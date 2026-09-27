# LezzFlow Partner — apps/partner

Delivery partner app for the LezzFlow platform (partner.legezt.in).
Vite + React, mobile-first. Talks to the shared LezzFlow Express API.

## Features

- Google sign-in (Firebase) → POST /api/auth/verify → partner session
- KYC onboarding: full name, phone, Aadhaar, PAN, driving licence +
  document photos → POST /api/kyc (multipart)
- KYC status screen: pending / approved / rejected, with masked identity
  details (full Aadhaar/PAN/licence numbers and document URLs are NEVER
  displayed or logged — see src/utils/mask.js)
- Delivery dashboard: available requests → Accept → Picked → Delivered
- Earnings summary (endpoint-driven, with on-device fallback derived from
  delivered orders)
- Auto-refresh of requests every 30s + manual refresh; graceful error
  banners, empty states, no blank screens

## Setup

    cd apps/partner
    npm install
    cp .env.example .env   # then fill in the Firebase web config values

## Logo assets (binary, copy once)

    cp /home/hatch/workspace/lezzflow-logos/lezzflow-icon.png public/
    cp /home/hatch/workspace/lezzflow-logos/lezzflow-horizontal-dark.png public/
    cp /home/hatch/workspace/lezzflow-logos/lezzflow-horizontal-light.png public/
    cp /home/hatch/workspace/lezzflow-logos/favicon.png public/

## Run

    npm run dev       # http://localhost:5173
    npm run build     # static output in dist/
    npm run preview   # preview the production build

## Ports across LezzFlow apps

    seller   5171
    mart     5172
    partner  5173  (this app)
    admin    5174

## API endpoints used (all centralized in src/api.js)

    POST  /api/auth/verify               { idToken } -> { user, role }
    POST  /api/kyc                       multipart form -> kyc record
    GET   /api/kyc/status                optional; falls back to profile
    GET   /api/deliveries/requests       list of delivery requests
    POST  /api/deliveries/:id/accept     accept a request
    PATCH /api/deliveries/:id/status     { status: "picked" | "delivered" }
    GET   /api/deliveries/earnings       optional; falls back to derived

Every request sends `Authorization: Bearer <firebase idToken>`.
