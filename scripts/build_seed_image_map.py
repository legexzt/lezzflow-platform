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
DL_GAP = 0.6
MIN_DIM = 100
BORDER_FRac = 0.12
WHITE_T = 240
# packaging_* only wins over front_* when clearly cleaner (avoids swapping a
# decent front label for a back-panel shot)
PACK_MIN_SCORE = 0.40
PACK_MARGIN_OVER_FRONT = 0.25


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


def selected_url(barcode, key, rev, size=400):
    # Canonical OFF pattern (no imgid in path):
    #   /images/products/<barcode-path>/{front,packaging}[_<lang>].<rev>.<size>.jpg
    lang = ""
    if "_" in key:
        lang = "_" + key.split("_", 1)[1]
    kind = key.split("_", 1)[0]  # front | packaging
    return (
        f"https://images.openfoodfacts.org/images/products/"
        f"{barcode_path(barcode)}/{kind}{lang}.{rev}.{size}.jpg"
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


def score_url(url, tries=3):
    for attempt in range(tries):
        try:
            data = http_get(url, timeout=25)
            img = Image.open(BytesIO(data))
            return border_whiteness(img)
        except Exception as e:
            if attempt < tries - 1:
                time.sleep(1.5 * (attempt + 1))
                continue
            print(f"    download/score failed for {url[:70]}: {type(e).__name__} (after {tries} tries)", flush=True)
            return None


def main():
    # argv: [input_products_json] [output_map_json] [full_report_path]
    # Defaults preserve the original one-arg behaviour (arg1 = report path).
    args = sys.argv[1:]
    if len(args) >= 3:
        in_path, map_path, full_report_path = args[0], args[1], args[2]
    elif len(args) == 2:
        in_path, map_path, full_report_path = PRODUCTS_JSON, MAP_JSON, args[1]
    else:
        in_path, map_path = PRODUCTS_JSON, MAP_JSON
        full_report_path = args[0] if args else "/tmp/image_fix_full.json"
    with open(in_path) as f:
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
        packs = {}
        for k, v in images.items():
            if isinstance(k, str) and isinstance(v, dict):
                imgid = v.get("imgid")
                rev = v.get("rev")
                if not (imgid and rev):
                    continue
                if k.startswith("front"):
                    fronts[str(imgid)] = (k, str(imgid), str(rev))
                elif k.startswith("packaging"):
                    packs[str(imgid)] = (k, str(imgid), str(rev))
        if not fronts and not packs:
            stats["api_miss"] += 1
            full[code] = {"name": name, "status": "no_front_images", "kept": current}
            print("    no front/packaging images -> keep current", flush=True)
            continue
        stats["api_ok"] += 1

        # 2) score current + candidates
        print(f"    scoring current + {len(fronts)} front + {len(packs)} packaging candidate(s)", flush=True)
        s_cur = score_url(current) if current else None
        time.sleep(DL_GAP)

        def best_of(cands):
            best_url, best_score, best_key = None, None, None
            for _imgid, (key, imgid, rev) in cands.items():
                url = selected_url(code, key, rev, 400)
                if url == current:
                    s = s_cur
                else:
                    s = score_url(url)
                    time.sleep(DL_GAP)
                print(f"    candidate {key} imgid={imgid} rev={rev} score={s}", flush=True)
                if s is not None and (best_score is None or s > best_score):
                    best_url, best_score, best_key = url, s, key
            return best_url, best_score, best_key

        f_url, f_score, f_key = best_of(fronts)
        p_url, p_score, p_key = best_of(packs)

        # packaging wins only when clearly cleaner than any front
        if (p_url and p_score is not None and p_score >= PACK_MIN_SCORE
                and (f_score is None or p_score > f_score + PACK_MARGIN_OVER_FRONT)):
            winner_url, winner_score, winner_kind = p_url, p_score, "packaging:" + str(p_key)
        else:
            winner_url, winner_score, winner_kind = f_url, f_score, "front:" + str(f_key)

        # 3) decide
        if winner_url and (s_cur is None or winner_score >= s_cur):
            if winner_url != current:
                changed_map[code] = winner_url
                stats["upgraded"] += 1
                full[code] = {"name": name, "status": "upgraded",
                              "kind": winner_kind,
                              "old": current, "new": winner_url,
                              "old_score": s_cur, "new_score": winner_score}
                print(f"    UPGRADED [{winner_kind}] {s_cur} -> {winner_score}", flush=True)
            else:
                stats["kept"] += 1
                full[code] = {"name": name, "status": "kept_best_is_current",
                              "kept": current, "score": s_cur}
                print("    best == current, no change", flush=True)
        else:
            stats["kept"] += 1
            full[code] = {"name": name, "status": "kept_current_wins",
                          "kept": current, "old_score": s_cur,
                          "best_score": winner_score, "best_kind": winner_kind}
            print(f"    current wins ({s_cur} vs {winner_score}), no change", flush=True)

    with open(map_path, "w") as f:
        json.dump(changed_map, f, indent=1)
    with open(full_report_path, "w") as f:
        json.dump({"stats": stats, "products": full}, f, indent=1)
    print("STATS:", json.dumps(stats), flush=True)
    print(f"map -> {map_path} ({len(changed_map)} upgrades)", flush=True)
    print(f"full report -> {full_report_path}", flush=True)


if __name__ == "__main__":
    main()
