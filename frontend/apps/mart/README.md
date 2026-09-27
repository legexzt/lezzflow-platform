# LezzFlow Mart (customer app)

Mobile-first customer app for LezzFlow. Discover nearby kirana shops via GPS,
browse products, and order for delivery or self-pickup.

## Setup

    cp .env.example .env   # adjust values as needed
    npm install

## Brand assets

Copy the shared LezzFlow logos into public/:

    cp /home/hatch/workspace/lezzflow-logos/lezzflow-icon.png \
       /home/hatch/workspace/lezzflow-logos/lezzflow-horizontal-dark.png \
       /home/hatch/workspace/lezzflow-logos/lezzflow-horizontal-light.png \
       /home/hatch/workspace/lezzflow-logos/favicon.png \
       public/

## Run

    npm run dev      # http://localhost:5174
    npm run build    # outputs static dist/
    npm run preview  # preview the production build

Backend API: see VITE_API_URL (default http://localhost:3000).
