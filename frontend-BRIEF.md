# LezzFlow Frontend Build Brief (for Kimi K3 via aider)

## Goal
Build 4 mobile-first web apps for the LezzFlow platform, all talking to the same backend API.

## Backend (already built, DO NOT rebuild)
- Location: `/home/hatch/workspace/lezzflow-platform/` (Express API)
- Base URL configurable via env: `VITE_API_URL` (default `http://localhost:3000`)
- Full API contract: see `README.md` in backend repo + endpoints below
- Firebase web config (public, safe for frontend):
  - projectId: `lezzflow-63a5a`, authDomain: `lezzflow-63a5a.firebaseapp.com`
  - (full config in `/home/hatch/workspace/goals/lezzflow-working-platform-beta/hidden_files/firebase.json`)

## Apps to build (Vite + React, mobile-first, in `frontend/apps/`)
1. **seller** → `seller.legezt.in` — LezzFlow Seller
   - Google login (Firebase) → role seller
   - Create/manage shop (name, address, GPS location, open/close)
   - Add products: 3 methods —
     a) AI camera scanner: photo upload → POST /api/scan/ai → auto-filled fields
     b) Barcode: enter/scan code → POST /api/scan/barcode → auto-filled fields
     c) Manual entry form
   - Orders list: placed → Accept → Pack (PATCH /api/orders/:id/status)
2. **mart** → `mart.legezt.in` — LezzFlow Mart (customers)
   - Google login → role customer
   - GPS-based shop discovery: GET /api/discover?lat=&lng= → grouped within5km / within10km / within20km
   - Browse products, place order with fulfillment choice: **delivery** or **pickup**
   - If delivery chosen → POST /api/orders/:id/assign-delivery
   - Payment screen shows "Payment coming soon" (GET /api/payment)
3. **partner** → `partner.legezt.in` — LezzFlow Partner (delivery)
   - Google login → role partner
   - KYC onboarding: upload Aadhaar, PAN, driving licence → POST /api/upload + partner_kyc
   - Wait for admin approval; status screen (pending/approved/rejected)
   - After approval: delivery requests list → Accept → Picked → Delivered
4. **admin** → `admin.legezt.in` — LezzFlow Admin (simple, desktop-friendly)
   - Google login → role admin
   - KYC queue: view documents, Approve / Reject
   - Overview: shops, products, orders, users lists + basic counts

## Key API endpoints (base `/api`)
- POST /api/auth/verify {idToken} → {user, role}
- GET/POST /api/shops, GET/PUT/DELETE /api/shops/:id
- GET/POST /api/products, PUT/DELETE /api/products/:id
- GET /api/discover?lat=&lng= → {within5km:[], within10km:[], within20km:[]}
- POST /api/orders {shop_id, items, fulfillment} (fulfillment: delivery|pickup)
- PATCH /api/orders/:id/status {status} (placed→accepted→packed; seller only)
- POST /api/orders/:id/assign-delivery (delivery only; 400 for pickup)
- GET /api/delivery/requests (approved partners only)
- PATCH /api/delivery/requests/:id {status} (requested→accepted→picked→delivered)
- GET /api/admin/kyc/pending, POST /api/admin/kyc/:id/approve, POST /api/admin/kyc/:id/reject
- POST /api/scan/ai (multipart image) → {name, category, description}
- POST /api/scan/barcode {code} → {found, name, brands, image}
- POST /api/upload (multipart) → {url}
- GET /api/payment → {status:'coming_soon', message:'Payment coming soon'}
- GET /health

## Auth flow (all apps)
1. Firebase Google sign-in on frontend → get ID token
2. POST /api/auth/verify {idToken} → backend upserts user, returns role
3. Store token; send as `Authorization: Bearer <idToken>` on every API call

## Design rules
- Mobile-first responsive (most users on phones)
- Brand: LezzFlow — fresh green identity. Logo assets: `/home/hatch/workspace/lezzflow-logos/`
  (use `lezzflow-horizontal-dark.png` on light bg, `lezzflow-horizontal-light.png` on dark bg, `lezzflow-icon.png` as app icon, `favicon.png` as favicon)
- Clean, modern, professional — kirana stores shown as aspirational entrepreneurs
- Each app keeps the same LezzFlow branding; headings/product roles differ per app
- No lorem ipsum, no fake data — every screen wired to real API

## Build rules
- Monorepo: `frontend/apps/{seller,mart,partner,admin}` — each independently buildable (`npm run build` → static `dist/`)
- Shared API client + auth hook duplicated or in `frontend/shared/` (keep simple)
- `npm run dev` per app for local dev; document ports in README
- Handle API errors gracefully (toasts/messages, no blank screens)
- Request camera/GPS permissions properly with fallbacks
