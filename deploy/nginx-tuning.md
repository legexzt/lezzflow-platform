# nginx tuning for LezzFlow API (scaling cycle-3)

> Docs only. Do NOT apply automatically — review on the EC2 host
> (`/etc/nginx/sites-available/`) during a maintenance window and
> `nginx -t && systemctl reload nginx` afterwards.

## Why

- The Express app now runs response compression (1 KB threshold) and an
  async scan queue; AI scans no longer block workers, but a slow Bedrock
  call can still hold a proxied connection. A 40s proxy timeout keeps
  nginx from killing legitimate slow responses while still bounding hangs.
- Upstream keepalive reuses connections to Node, cutting TLS/TCP handshake
  cost under burst traffic.

## Recommended `location` block (api.legezt.in)

```nginx
upstream lezzflow_api {
    server 127.0.0.1:3000;
    keepalive 32;              # idle keepalive connections to Node
    keepalive_timeout 60s;
}

server {
    listen 443 ssl;
    server_name api.legezt.in;

    # Let Express handle compression; don't double-gzip here.
    gzip off;

    location / {
        proxy_pass http://lezzflow_api;
        proxy_http_version 1.1;
        proxy_set_header Connection "";          # required for keepalive
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;

        # 40s proxy timeout: covers slow AI scan polling without
        # hanging forever on a dead upstream.
        proxy_connect_timeout 10s;
        proxy_send_timeout 40s;
        proxy_read_timeout 40s;

        # Buffering: keep on for normal JSON, the API streams nothing large.
        proxy_buffering on;
        proxy_buffer_size 16k;
        proxy_buffers 8 32k;
    }
}
```

## Checklist before reload

1. `sudo nginx -t` must pass.
2. Confirm Express `trust proxy` is set (app.js: `trust proxy, 2`) so
   rate-limiting still sees real client IPs through keepalive connections.
3. After reload: `curl -I https://api.legezt.in/health` should return 200
   with no extra `Content-Encoding` added by nginx (Express compresses).

## Rollback

Previous known-good site config is the one deployed before this change;
keep a timestamped copy under `/etc/nginx/sites-available.bak/` before
editing.
