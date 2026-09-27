# LezzFlow Seller (apps/seller)

Mobile-first seller app for the LezzFlow platform: Google login, shop
management (GPS + open/close), product add via AI camera scan / barcode /
manual entry, and order management (Accept → Pack).

## Quick start

    bash setup.sh        # copies logos, creates .env, installs deps
    npm run dev          # http://localhost:5173

Then edit .env and fill in the Firebase web config values (apiKey, appId,
messagingSenderId) from the project firebase config. Auth domain and project
id are already defaulted to lezzflow-63a5a.

## Manual setup

1. Backend API running (default http://localhost:3000) — see lezzflow-platform.
2. Logo assets copied into public/:

    cp /home/hatch/workspace/lezzflow-logos/lezzflow-horizontal-dark.png public/logo-dark.png
    cp /home/hatch/workspace/lezzflow-logos/lezzflow-icon.png           public/logo-icon.png
    cp /home/hatch/workspace/lezzflow-logos/favicon.png                 public/favicon.png

3. Env config: cp .env.example .env  (then fill in Firebase values)
4. npm install

## Build

    npm run build      # outputs static site to dist/
    npm run preview    # preview the production build

## Environment variables

    VITE_API_URL                      Backend base URL (default http://localhost:3000)
    VITE_FIREBASE_API_KEY             Firebase web API key
    VITE_FIREBASE_AUTH_DOMAIN         Default: lezzflow-63a5a.firebaseapp.com
    VITE_FIREBASE_PROJECT_ID          Default: lezzflow-63a5a
    VITE_FIREBASE_STORAGE_BUCKET      Default: lezzflow-63a5a.appspot.com
    VITE_FIREBASE_MESSAGING_SENDER_ID Firebase sender id
    VITE_FIREBASE_APP_ID              Firebase web app id

## Auth flow

1. Firebase Google sign-in (popup) → ID token
2. POST /api/auth/verify { idToken } → { user, role }
3. Fresh ID token sent as Authorization: Bearer <token> on every API call
   (handled by the axios interceptor in src/api.js).

## Screens

    /login              Google sign-in
    /                   Dashboard — shop status, open/close toggle, quick stats
    /shop               Create / manage shop (name, address, GPS, open/close)
    /products           Product list, edit, delete
    /products/new       Add product — AI Scan / Barcode / Manual tabs
    /products/:id/edit  Edit product
    /orders             Orders — Accept → Pack flow, delivery/pickup badges
