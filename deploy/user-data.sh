#!/bin/bash
set -x
exec > /var/log/lezzflow-setup.log 2>&1
export DEBIAN_FRONTEND=noninteractive

# --- base packages ---
apt-get update -qq
apt-get install -y -qq ca-certificates curl gnupg git openssl
# NOTE: docker-compose-plugin is NOT in Ubuntu's repos (breaks the whole
# apt transaction if listed) — use Docker's official repo instead.
install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
chmod a+r /etc/apt/keyrings/docker.asc
echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo "$VERSION_CODENAME") stable" | tee /etc/apt/sources.list.d/docker.list > /dev/null
apt-get update -qq
apt-get install -y -qq docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin nginx certbot python3-certbot-nginx

# --- node 20 ---
curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt-get install -y -qq nodejs

systemctl enable --now docker

# --- repo ---
git clone https://github.com/legexzt/lezzflow-platform.git /opt/lezzflow
cd /opt/lezzflow

# --- production env (secrets generated on the box, never in git) ---
PGPASS=$(openssl rand -hex 16)
JWTSECRET=$(openssl rand -hex 32)
cat > .env <<EOF
PGDATABASE=lezzflow
PGUSER=postgres
PGPASSWORD=$PGPASS
DATABASE_URL=postgres://postgres:$PGPASS@postgres:5432/lezzflow
JWT_SECRET=$JWTSECRET
PORT=3000
NODE_ENV=production
AUTO_MIGRATE=true
FIREBASE_PROJECT_ID=
FIREBASE_CLIENT_EMAIL=
FIREBASE_PRIVATE_KEY=
AWS_REGION=ap-south-1
AWS_ACCESS_KEY_ID=
AWS_SECRET_ACCESS_KEY=
BEDROCK_MODEL_ID=moonshotai.kimi-k3
STORAGE_PROVIDER=local
EOF
chmod 600 .env

# --- backend (docker) ---
docker compose up -d --build

# --- frontends (static builds) ---
build_app() {
  app="$1"
  cd "/opt/lezzflow/frontend/apps/$app"
  npm install --no-audit --no-fund -q
  VITE_API_URL=https://api.legezt.in npm run build
  mkdir -p "/var/www/$app.legezt.in"
  cp -r dist/. "/var/www/$app.legezt.in/"
}
build_app seller
build_app mart

# --- nginx ---
cat > /etc/nginx/sites-available/lezzflow <<'NGINX'
server {
    listen 80;
    server_name api.legezt.in;
    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
server {
    listen 80;
    server_name seller.legezt.in;
    root /var/www/seller.legezt.in;
    index index.html;
    location / { try_files $uri $uri/ /index.html; }
}
server {
    listen 80;
    server_name mart.legezt.in;
    root /var/www/mart.legezt.in;
    index index.html;
    location / { try_files $uri $uri/ /index.html; }
}
NGINX
ln -sf /etc/nginx/sites-available/lezzflow /etc/nginx/sites-enabled/lezzflow
rm -f /etc/nginx/sites-enabled/default
nginx -t && systemctl reload nginx

# --- TLS (DNS already points here) ---
certbot --nginx --non-interactive --agree-tos --register-unsafely-without-email \
  -d api.legezt.in -d seller.legezt.in -d mart.legezt.in

echo "LEZZFLOW_SETUP_DONE $(date -u +%FT%TZ)" >> /var/log/lezzflow-setup.log
