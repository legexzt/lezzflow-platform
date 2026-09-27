#!/usr/bin/env bash
# LezzFlow Seller — one-time setup: copy brand assets, create .env, install deps.
set -e

cd "$(dirname "$0")"

LOGO_DIR="/home/hatch/workspace/lezzflow-logos"

echo "Copying logo assets..."
cp "$LOGO_DIR/lezzflow-horizontal-dark.png" public/logo-dark.png
cp "$LOGO_DIR/lezzflow-icon.png"            public/logo-icon.png
cp "$LOGO_DIR/favicon.png"                  public/favicon.png

if [ ! -f .env ]; then
  echo "Creating .env from .env.example (fill in Firebase values)..."
  cp .env.example .env
fi

echo "Installing dependencies..."
npm install

echo ""
echo "Done. Next steps:"
echo "  1. Edit .env and set VITE_FIREBASE_API_KEY / VITE_FIREBASE_APP_ID / VITE_FIREBASE_MESSAGING_SENDER_ID"
echo "  2. npm run dev    # dev server on http://localhost:5173"
echo "  3. npm run build  # production build to dist/"
