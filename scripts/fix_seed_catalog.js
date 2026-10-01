#!/usr/bin/env node
/**
 * scripts/fix_seed_catalog.js
 *
 * TEST-DATA-ONLY cleanup (2026-10-01). Runs INSIDE the backend docker
 * container on EC2, same DB connection pattern as scripts/seed_test_shops.js.
 *
 * Fixes two problems on seed rows ONLY (is_seed = true):
 *   PROBLEM 1 - absurd prices (seed used random Rs.20-800 bands, e.g. Kinley
 *               500ml water = Rs.639). Rewrites prices with a realistic
 *               Indian-grocery price engine: pack size parsed from the name,
 *               per-unit MRP table per product type, clamped to sane min/max.
 *   PROBLEM 2 - "normal photo" images (user-taken OFF front photos). Applies
 *               scripts/seed_data/image_fix_map.json built by
 *               scripts/build_seed_image_map.py (cleanest white-background
 *               front packshot per barcode, scored by border whiteness).
 *
 * TOUCHES ONLY rows with is_seed = true. One UPDATE per barcode.
 * Does NOT run scripts/REMOVE_test_seed.sql (removal is a separate decision).
 */

'use strict';

const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');

const pool = new Pool(
  process.env.DATABASE_URL
    ? { connectionString: process.env.DATABASE_URL }
    : {
        host: process.env.PGHOST || process.env.DB_HOST || 'localhost',
        port: parseInt(process.env.PGPORT || process.env.DB_PORT || '5432', 10),
        user: process.env.PGUSER || process.env.DB_USER || 'postgres',
        password: process.env.PGPASSWORD || process.env.DB_PASSWORD || 'postgres',
        database: process.env.PGDATABASE || process.env.DB_NAME || 'lezzflow',
      }
);

// ---------------------------------------------------------------------------
// Price engine
// ---------------------------------------------------------------------------

const UNIT_RE = '(ml|ltr|lit(?:re|er)?|l|kg|gm?s?|grams?)';

function toBaseQty(value, unitRaw) {
  const u = unitRaw.toLowerCase();
  if (u === 'ml') return { qty: value, unit: 'ml' };
  if (u === 'kg') return { qty: value * 1000, unit: 'g' };
  if (u[0] === 'l') return { qty: value * 1000, unit: 'ml' }; // l, ltr, litre, liter
  return { qty: value, unit: 'g' }; // g, gm, gram(s)
}

// Returns {qty, unit} normalized to ml/g, or null when no size parses.
function parseSize(name) {
  const s = String(name || '');
  // multipack: "4 x 200ml", "2X1L"
  let m = s.match(new RegExp(`(\\d+)\\s*[x×]\\s*(\\d+(?:\\.\\d+)?)\\s*${UNIT_RE}\\b`, 'i'));
  if (m) {
    const base = toBaseQty(parseFloat(m[2]), m[3]);
    return { qty: base.qty * parseInt(m[1], 10), unit: base.unit };
  }
  m = s.match(new RegExp(`(\\d+(?:\\.\\d+)?)\\s*${UNIT_RE}\\b`, 'i'));
  if (m) return toBaseQty(parseFloat(m[1]), m[2]);
  return null;
}

// Ordered specific -> general. rate = Rs per ml (unit 'ml') or per g (unit 'g').
const RULES = [
  // beverages
  { re: /sting|red bull|energy drink|monster energy/i, unit: 'ml', rate: 0.08, min: 20, max: 150, fb: 60 },
  { re: /water|bisleri|kinley|aquafina|mineral water/i, unit: 'ml', rate: 0.02, min: 10, max: 120, fb: 20 },
  { re: /juice|maaza|frooti|tropicana|paper ?boat|pomegranate|\breal\b|b natural|\bslice\b/i, unit: 'ml', rate: 0.12, min: 20, max: 200, fb: 120 },
  { re: /cola|thums ?up|coca|pepsi|sprite|fanta|mirinda|limca|\bsoda\b|soft drink|cold drink/i, unit: 'ml', rate: 0.05, min: 15, max: 150, fb: 40 },
  { re: /syrup|rooh ?afza|squash/i, unit: 'ml', rate: 0.25, min: 50, max: 300, fb: 130 },
  { re: /bournvita|horlicks|\bmalt\b|protein/i, unit: 'g', rate: 0.5, min: 100, max: 600, fb: 250 },
  // dairy (chocolate before milk: "dairy milk" is chocolate)
  { re: /buttermilk|chach|lassi/i, unit: 'ml', rate: 0.04, min: 10, max: 60, fb: 20 },
  { re: /ghee/i, unit: 'g', rate: 0.65, min: 80, max: 700, fb: 330 },
  { re: /paneer/i, unit: 'g', rate: 0.35, min: 40, max: 200, fb: 90 },
  { re: /butter(?!milk)/i, unit: 'g', rate: 0.45, min: 25, max: 300, fb: 55 },
  { re: /cheese/i, unit: 'g', rate: 0.8, min: 60, max: 400, fb: 120 },
  { re: /curd|dahi|yogurt/i, unit: 'g', rate: 0.10, min: 20, max: 150, fb: 40 },
  { re: /dairy milk|choco|kitkat|\bperk\b|munch|5 ?star|\bsilk\b|bournville|eclair|milkybar|cocoa/i, unit: 'g', rate: 0.9, min: 10, max: 300, fb: 45 },
  { re: /\bmilk\b/i, unit: 'ml', rate: 0.06, min: 15, max: 80, fb: 30 },
  // staples
  { re: /atta|wheat flour|maida/i, unit: 'g', rate: 0.055, min: 30, max: 400, fb: 290 },
  { re: /besan|sooji|rava|\bsuji\b|\bdal\b|moong|chana|\btoor\b|urad|masoor|rajma|kabuli/i, unit: 'g', rate: 0.12, min: 30, max: 300, fb: 130 },
  { re: /\brice\b|basmati/i, unit: 'g', rate: 0.10, min: 60, max: 900, fb: 450 },
  { re: /peanuts?|salted/i, unit: 'g', rate: 0.30, min: 10, max: 200, fb: 35 },
  { re: /salt/i, unit: 'g', rate: 0.028, min: 10, max: 60, fb: 28 },
  { re: /sugar|jaggery|\bgur\b/i, unit: 'g', rate: 0.048, min: 20, max: 120, fb: 48 },
  { re: /pickle|chutney|\bpaste\b|schezwan|thecha|pravin/i, unit: 'g', rate: 0.25, min: 20, max: 200, fb: 60 },
  { re: /kissan|del monte|\bjam\b|ketchup|sauce\b|mayo/i, unit: 'g', rate: 0.25, min: 30, max: 250, fb: 110 },
  // snacks
  { re: /yippee/i, unit: 'g', rate: 0.18, min: 10, max: 100, fb: 14 },
  { re: /wafers?|\bchips\b|lays|kurkure|balaji|bingo|namkeen|\bsev\b|bhujia|mixture|murmura|chivda|nachos|popcorn|puffcorn|fryums|papad|makhana|bakarwadi|chevdo|farsan|\bbhel\b|soya sticks|soy snack/i, unit: 'g', rate: 0.30, min: 10, max: 200, fb: 35 },
  { re: /biscuit|cookie|parle|bourbon|oreo|marie|good ?day|jim ?jam|hide ?& ?seek|50-50|monaco|krack ?jack|bikis|sunfeast|mom'?s magic/i, unit: 'g', rate: 0.18, min: 10, max: 120, fb: 30 },
  { re: /noodle|maggi|yippee|ramen|\bpasta\b/i, unit: 'g', rate: 0.18, min: 10, max: 100, fb: 14 },
  { re: /bread|\bbun\b|\bpav\b/i, unit: 'g', rate: 0.10, min: 15, max: 100, fb: 40 },
  { re: /cake/i, unit: 'g', rate: 0.35, min: 20, max: 300, fb: 60 },
  // tea / coffee / breakfast
  { re: /tea\b|chai|wagh ?bakri|red ?label|tata tea/i, unit: 'g', rate: 0.55, min: 30, max: 600, fb: 140 },
  { re: /coffee|\bbru\b|nescafe/i, unit: 'g', rate: 1.2, min: 40, max: 700, fb: 145 },
  { re: /\boats\b|corn ?flakes|muesli|porridge/i, unit: 'g', rate: 0.25, min: 80, max: 400, fb: 180 },
  // health / ayurveda
  { re: /chyawanprash|chawanprash/i, unit: 'g', rate: 0.42, min: 100, max: 800, fb: 420 },
  { re: /honey/i, unit: 'g', rate: 0.5, min: 50, max: 600, fb: 250 },
  { re: /isabgol|laxative|ayurvedic|triphala|churna|hajmola/i, unit: 'g', rate: 0.5, min: 40, max: 300, fb: 60 },
  // personal care (before cooking oil: "hair oil" must not match cooking oil)
  { re: /shampoo/i, unit: 'ml', rate: 0.8, min: 50, max: 600, fb: 199 },
  { re: /hair oil/i, unit: 'ml', rate: 0.7, min: 50, max: 400, fb: 150 },
  { re: /toothpaste|colgate|close ?up/i, unit: 'g', rate: 0.7, min: 30, max: 250, fb: 95 },
  { re: /soap/i, unit: 'g', rate: 0.35, min: 15, max: 150, fb: 42 },
  { re: /detergent|\bsurf\b|\bwheel\b|\btide\b|\bvim\b|dishwash/i, unit: 'g', rate: 0.12, min: 30, max: 400, fb: 120 },
  // cooking oil
  { re: /dettol|antiseptic/i, unit: 'ml', rate: 0.5, min: 30, max: 300, fb: 85 },
  { re: /oil|saffola|fortune|sundrop/i, unit: 'ml', rate: 0.14, min: 60, max: 800, fb: 140 },
  // spices (after maggi/noodles: "maggi masala" is noodles)
  { re: /masala|haldi|turmeric|mirchi|chilli|jeera|cumin|garam|spice|elaichi|cardamom|clove|hing|pepper|dhaniya|coriander|peri peri/i, unit: 'g', rate: 1.5, min: 20, max: 400, fb: 120 },
  // misc food
  { re: /knorr|soup/i, unit: 'g', rate: 0.8, min: 30, max: 150, fb: 55 },
  { re: /glucose/i, unit: 'g', rate: 0.25, min: 50, max: 250, fb: 110 },
  // misc food
  { re: /batter|\bidli\b/i, unit: 'g', rate: 0.08, min: 20, max: 100, fb: 40 },
  { re: /mouth ?freshener|saunf/i, unit: 'g', rate: 0.5, min: 20, max: 150, fb: 50 },
  { re: /sweetener|sugar ?free/i, unit: 'g', rate: 1.0, min: 50, max: 400, fb: 150 },
  { re: /ice ?cream|kulfi/i, unit: 'ml', rate: 0.15, min: 40, max: 300, fb: 100 },
  { re: /fish|prawn|tuna|salmon|chicken|meat|\begg\b/i, unit: 'g', rate: 0.4, min: 50, max: 500, fb: 150 },
];

const CAT_RULES = [
  { re: /snack|namkeen|sev|chips|wafers/i, unit: 'g', rate: 0.30, min: 10, max: 200, fb: 35 },
  { re: /beverage/i, unit: 'ml', rate: 0.06, min: 15, max: 150, fb: 60 },
  { re: /dair/i, unit: 'ml', rate: 0.06, min: 15, max: 150, fb: 40 },
  { re: /condiment|chutney/i, unit: 'g', rate: 0.25, min: 20, max: 200, fb: 60 },
  { re: /pickle/i, unit: 'g', rate: 0.25, min: 20, max: 200, fb: 60 },
  { re: /mouth ?freshener/i, unit: 'g', rate: 0.5, min: 20, max: 150, fb: 50 },
  { re: /breakfast/i, unit: 'g', rate: 0.25, min: 80, max: 400, fb: 180 },
  { re: /dessert/i, unit: 'ml', rate: 0.15, min: 40, max: 300, fb: 100 },
  { re: /sweetener/i, unit: 'g', rate: 1.0, min: 50, max: 400, fb: 150 },
  { re: /supplement/i, unit: 'g', rate: 0.5, min: 50, max: 300, fb: 200 },
  { re: /meal/i, unit: 'g', rate: 0.2, min: 20, max: 300, fb: 80 },
];

const GENERIC = { unit: 'g', rate: 0.2, min: 10, max: 500, fb: 60 };

// Returns {price, rule: 'name'|'category'|'generic', matched}
function priceFor(name, category) {
  const nm = String(name || '');
  let rule = RULES.find((r) => r.re.test(nm));
  let kind = 'name';
  if (!rule) {
    rule = CAT_RULES.find((r) => r.re.test(String(category || '')));
    kind = 'category';
  }
  if (!rule) {
    rule = GENERIC;
    kind = 'generic';
  }
  const size = parseSize(nm);
  let price;
  let matched = rule.re ? String(rule.re) : 'generic';
  if (size && size.unit === rule.unit) {
    price = Math.round(size.qty * rule.rate);
  } else {
    price = rule.fb; // no parseable size, or unit mismatch -> category default
    if (size && size.unit !== rule.unit) matched += ' (unit-mismatch->fb)';
    else if (!size) matched += ' (no-size->fb)';
  }
  price = Math.max(rule.min, Math.min(rule.max, price));
  return { price, kind, matched };
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  // Safety: refuse to run unless the seed marker exists.
  const marker = await pool.query(
    'SELECT COUNT(*)::int AS c FROM products WHERE is_seed = true'
  );
  console.log(`seed rows present: ${marker.rows[0].c}`);
  if (marker.rows[0].c === 0) {
    console.log('No seed rows found - nothing to do. Exiting.');
    await pool.end();
    return;
  }

  // Image map (optional but expected).
  const mapPath = path.join(__dirname, 'seed_data', 'image_fix_map.json');
  let imageMap = {};
  try {
    imageMap = JSON.parse(fs.readFileSync(mapPath, 'utf8'));
    console.log(`image map loaded: ${Object.keys(imageMap).length} upgrades`);
  } catch (e) {
    console.log(`image map not found at ${mapPath} - prices only (${e.message})`);
  }

  const { rows } = await pool.query(`
    SELECT DISTINCT ON (barcode) barcode, name, category, price AS old_price, image_url AS old_image
    FROM products
    WHERE is_seed = true AND barcode IS NOT NULL
    ORDER BY barcode, id
  `);
  console.log(`distinct seed barcodes: ${rows.length}`);

  const sample = [];
  const genericFallback = [];
  const errors = [];
  let pricesChanged = 0;
  let imagesUpgraded = 0;
  let rowsTouched = 0;

  for (const r of rows) {
    const { price: newPrice, kind, matched } = priceFor(r.name, r.category);
    const newImage = imageMap[r.barcode]; // undefined -> keep existing
    if (kind === 'generic') genericFallback.push(`${r.barcode} ${r.name}`);
    try {
      const sets = ['price = $1'];
      const params = [newPrice];
      if (newImage) {
        sets.push('image_url = $2');
        params.push(newImage);
      }
      params.push(r.barcode);
      const res = await pool.query(
        `UPDATE products SET ${sets.join(', ')} WHERE barcode = $${params.length} AND is_seed = true`,
        params
      );
      rowsTouched += res.rowCount;
      if (Number(r.old_price) !== newPrice) pricesChanged++;
      if (newImage && newImage !== r.old_image) imagesUpgraded++;
      if (sample.length < 15) {
        sample.push({
          name: String(r.name).slice(0, 42),
          old: Number(r.old_price),
          now: newPrice,
          img: newImage ? (newImage !== r.old_image ? 'y' : 'same') : 'n',
        });
      }
    } catch (e) {
      errors.push(`${r.barcode}: ${e.message}`);
    }
  }

  console.log('\n== SAMPLE (name | old -> new | img upgraded) ==');
  for (const s of sample) {
    console.log(`- ${s.name} | Rs.${s.old} -> Rs.${s.now} | img:${s.img}`);
  }
  console.log('\n== SUMMARY ==');
  console.log(JSON.stringify({
    barcodes_processed: rows.length,
    rows_updated: rowsTouched,
    prices_changed: pricesChanged,
    images_upgraded: imagesUpgraded,
    generic_fallback_count: genericFallback.length,
    errors: errors.length,
  }, null, 1));
  if (genericFallback.length) {
    console.log('\nbarcodes that fell back to generic default (name/category unmatched):');
    genericFallback.slice(0, 40).forEach((g) => console.log('  * ' + g));
  }
  if (errors.length) {
    console.log('\nERRORS:');
    errors.slice(0, 20).forEach((e) => console.log('  ! ' + e));
  }

  await pool.end();
}

if (require.main === module) {
  main().catch((e) => {
    console.error('FATAL:', e);
    process.exit(1);
  });
}

module.exports = { priceFor, parseSize, RULES, CAT_RULES };
