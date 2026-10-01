#!/usr/bin/env python3
"""
scripts/build_seed_image_map.py

One-off helper for the TEST catalog cleanup (2026-10-01).

For every product in scripts/seed_data/products.json (all is_seed rows share
these 899 barcodes), fetch the OpenFoodFacts product page and pick the
cleanest white-background front packshot:
  - collect every front-type image (keys starting with "front" in product.images)
  - download each at size 400 + the currently-seeded image URL
  - score = fraction of near-white pixels (R,G,B > 240) in the outer 12% border band
  - require min dimension >= 250px
  - keep the highest scorer; if none beats the current URL's score, keep current

Politeness: ~1 req/sec to world.openfoodfacts.org, identifying User-Agent,
backoff (60s) and retry on 429/403.

Outputs:
  - scripts/seed_data/image_fix_map.json   {barcode: best_image_url} (changed only)
  - <full_report_path>                      per-barcode detail incl. scores
"""
import json
import os
import sys
import time
import urllib.request
import urllib.error
from io import BytesIO

from PIL import Image, ImageChops, ImageStat

HERE = os.path.dirname(os.path.abspath(__file__))
PRODUCTS_JSON = os.path.join(HERE, "seed_data", "products.json")
MAP_JSON = os.path.join(HERE, "seed_data", "image_fix_map.json")

UA = "LezzFlowMartTestData/1.0 (test catalog cleanup; contact via github.com/legexzt/lezzflow-platform)"
API_SLEEP = 1.05
DL_GAP = 0.25
MIN_DIM = 250
BORDER_FRac = 0.12
WHITE_T = 240


def http_get(url, timeout=25):
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return r.read()


def fetch_with_backoff(url, timeout=25, tries=4):
    for attempt in range(tries):
        try:
            return http_get(url, timeout)
        except urllib.error.HTTPError as e:
            if e.code in (429, 403) and attempt < tries - 1:
                wait = 60 * (attempt + 1)
                print(f"    HTTP {e.code} -> backing off {wait}s (attempt {attempt+1})", flush=True)
                time.sleep(wait)
                continue
            raise
    raise RuntimeError("unreachable")


def barcode_path(barcode):
    bc = str(barcode).strip()
    bc = bc.zfill(13)
    return f"{bc[0:3]}/{bc[3:6]}/{bc[6:9]}/{bc[9:]}"


def front_url(barcode, key, imgid, rev, size=400):
    # Canonical OFF pattern (no imgid in path):
    #   /images/products/<barcode-path>/front_<lang>.<rev>.<size>.jpg
    lang = ""
    if "_" in key:
        lang = "_" + key.split("_", 1)[1]
    return (
        f"https://images.openfoodfacts.org/images/products/"
        f"{barcode_path(barcode)}/front{lang}.{rev}.{size}.jpg"
    )


def border_whiteness(img):
    """Fraction of near-white pixels in the outer BORDER_FRac band."""
    img = img.convert("RGB")
    w, h = img.size
    if min(w, h) < MIN_DIM:
        return None
    bx = int(w * BORDER_FRac)
    by = int(h * BORDER_FRac)

    def thresh(ch):
        return ch.point(lambda v: 255 if v > WHITE_T else 0)

    r, g, b = img.split()
    mask = ImageChops.multiply(ImageChops.multiply(thresh(r), thresh(g)), thresh(b))

    # border = full minus inner
    inner = mask.crop((bx, by, w - bx, h - by))
    full_mean = ImageStat.Stat(mask).mean[0] / 255.0
    inner_mean = ImageStat.Stat(inner).mean[0] / 255.0
    full_n = w * h
    inner_n = (w - 2 * bx) * (h - 2 * by)
    border_n = full_n - inner_n
    if border_n <= 0:
        return None
    border_white = (full_mean * full_n - inner_mean * inner_n) / border_n
    return max(0.0, min(1.0, border_white))


def score_url(url):
    try:
        data = http_get(url, timeout=25)
        img = Image.open(BytesIO(data))
        return border_whiteness(img)
    except Exception as e:
        print(f"    download/score failed for {url[:70]}: {type(e).__name__}", flush=True)
        return None


def main():
    full_report_path = sys.argv[1] if len(sys.argv) > 1 else "/tmp/image_fix_full.json"
    with open(PRODUCTS_JSON) as f:
        products = json.load(f)
    print(f"{len(products)} products to process", flush=True)

    changed_map = {}
    full = {}
    stats = {"processed": 0, "api_ok": 0, "api_miss": 0, "upgraded": 0, "kept": 0}

    for i, p in enumerate(products):
        code = str(p.get("code") or "").strip()
        name = p.get("name") or ""
        current = (p.get("image_url") or "").strip()
        if not code:
            continue
        stats["processed"] += 1
        print(f"[{i+1}/{len(products)}] {code} {name[:40]}", flush=True)

        # 1) OFF product page
        try:
            raw = fetch_with_backoff(
                f"https://world.openfoodfacts.org/api/v2/product/{code}.json?fields=images"
            )
            doc = json.loads(raw)
        except Exception as e:
            print(f"    API error: {type(e).__name__}", flush=True)
            stats["api_miss"] += 1
            full[code] = {"name": name, "status": "api_error", "kept": current}
            time.sleep(API_SLEEP)
            continue
        time.sleep(API_SLEEP)

        product = doc.get("product") or {}
        images = product.get("images") or {}
        fronts = {}
        for k, v in images.items():
            if isinstance(k, str) and k.startswith("front") and isinstance(v, dict):
                imgid = v.get("imgid")
                rev = v.get("rev")
                if imgid and rev:
                    fronts[str(imgid)] = (k, str(imgid), str(rev))
        if not fronts:
            stats["api_miss"] += 1
            full[code] = {"name": name, "status": "no_front_images", "kept": current}
            print("    no front images -> keep current", flush=True)
            continue
        stats["api_ok"] += 1

        # 2) score current + candidates
        print(f"    scoring current + {len(fronts)} front candidate(s)", flush=True)
        s_cur = score_url(current) if current else None
        time.sleep(DL_GAP)
        best_url, best_score = None, -1.0
        for _imgid, (key, imgid, rev) in fronts.items():
            url = front_url(code, key, imgid, rev, 400)
            if url == current:
                s = s_cur
            else:
                s = score_url(url)
                time.sleep(DL_GAP)
            print(f"    candidate {key} imgid={imgid} rev={rev} score={s}", flush=True)
            if s is not None and s > best_score:
                best_score, best_url = s, url

        # 3) decide
        if best_url and (s_cur is None or best_score >= s_cur):
            if best_url != current:
                changed_map[code] = best_url
                stats["upgraded"] += 1
                full[code] = {"name": name, "status": "upgraded",
                              "old": current, "new": best_url,
                              "old_score": s_cur, "new_score": best_score}
                print(f"    UPGRADED {s_cur} -> {best_score}", flush=True)
            else:
                stats["kept"] += 1
                full[code] = {"name": name, "status": "kept_best_is_current",
                              "kept": current, "score": s_cur}
                print("    best == current, no change", flush=True)
        else:
            stats["kept"] += 1
            full[code] = {"name": name, "status": "kept_current_wins",
                          "kept": current, "old_score": s_cur, "best_score": best_score}
            print(f"    current wins ({s_cur} vs {best_score}), no change", flush=True)

    with open(MAP_JSON, "w") as f:
        json.dump(changed_map, f, indent=1)
    with open(full_report_path, "w") as f:
        json.dump({"stats": stats, "products": full}, f, indent=1)
    print("STATS:", json.dumps(stats), flush=True)
    print(f"map -> {MAP_JSON} ({len(changed_map)} upgrades)", flush=True)
    print(f"full report -> {full_report_path}", flush=True)


if __name__ == "__main__":
    main()
