#!/usr/bin/env node
/**
 * scripts/seed_test_shops.js
 *
 * Seeds ~100 clearly-marked TEST shops (is_seed = true) into Postgres.
 * Designed to run INSIDE the backend docker container on EC2.
 * Uses DATABASE_URL env or PG* env vars and require('pg').
 *
 * Reads:
 *   - scripts/seed_data/localities.json (27 Hyderabad localities)
 *   - scripts/seed_data/shop_photos.json (15 verified shop photos)
 *   - scripts/seed_data/products.json (~900 real Indian products)
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

// Helper for random integer in range [min, max] inclusive
function randInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

// Helper to pick n distinct elements from an array
function sampleDistinct(array, n) {
  const result = [];
  const selectedIndices = new Set();
  const target = Math.min(n, array.length);
  while (selectedIndices.size < target) {
    const idx = Math.floor(Math.random() * array.length);
    if (!selectedIndices.has(idx)) {
      selectedIndices.add(idx);
      result.push(array[idx]);
    }
  }
  return result;
}

// Generate 100 unique, plausible Indian grocery shop names
function generate100ShopNames() {
  const prefixes = [
    'Sharma', 'Gupta', 'Reddy', 'Sri Lakshmi', 'Sri Venkateshwara', 'Balaji',
    'Fresh Daily', 'Apna', 'New Hyderabad', 'Royal', 'City', 'Prime',
    'Green Leaf', 'Sai Ram', 'Durga Bhavani', 'Mahalaxmi', 'Krishna', 'Ganesh',
    'Om', 'Star', 'Classic', 'Metro', 'Janatha', 'Anand',
    'Bharat', 'Swagath', 'Vikas', 'Pawan', 'Sagar', 'Surya',
    'A-One', 'Super', 'Heritage', 'Seven Hills', 'Tulasi', 'Kalyani',
    'Radhe', 'Vijaya', 'National', 'Universal', 'Maruti', 'Siva',
    'Bhavani', 'Sri Sai', 'Pooja', 'Shree Ram', 'Saraswati', 'Annapurna',
    'Ambica', 'Vasavi', 'Navrang', 'Vaishnavi', 'Choudhary', 'Rathore',
    'Agarwal', 'Verma', 'Patel', 'Yadav', 'Rao', 'Naidu'
  ];

  const suffixes = [
    'Kirana Store', 'Daily Mart', 'General Store', 'Super Bazaar',
    'Provision Store', 'Supermarket', 'Traders', 'Kirana & General Store',
    'Fresh Mart', 'Groceries', 'Retail Mart', 'Corner Mart', 'Family Store'
  ];

  const names = [];
  const seen = new Set();

  for (const p of prefixes) {
    for (const s of suffixes) {
      const name = `${p} ${s}`;
      if (!seen.has(name)) {
        seen.add(name);
        names.push(name);
        if (names.length === 100) return names;
      }
    }
  }
  return names;
}

async function main() {
  console.log('--- Starting LezzFlow Test Seed Script ---');

  // 1. Read seed data files
  const localitiesPath = path.join(__dirname, 'seed_data', 'localities.json');
  const shopPhotosPath = path.join(__dirname, 'seed_data', 'shop_photos.json');
  const productsPath = path.join(__dirname, 'seed_data', 'products.json');

  if (!fs.existsSync(localitiesPath)) throw new Error(`Missing: ${localitiesPath}`);
  if (!fs.existsSync(shopPhotosPath)) throw new Error(`Missing: ${shopPhotosPath}`);
  if (!fs.existsSync(productsPath)) throw new Error(`Missing: ${productsPath}`);

  const localities = JSON.parse(fs.readFileSync(localitiesPath, 'utf8'));
  const shopPhotos = JSON.parse(fs.readFileSync(shopPhotosPath, 'utf8'));
  const products = JSON.parse(fs.readFileSync(productsPath, 'utf8'));

  console.log(`Loaded ${localities.length} localities, ${shopPhotos.length} shop photos, ${products.length} products.`);

  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // 2. Insert 8 seed sellers: firebase_uid 'seed-seller-0'..'seed-seller-7'
    console.log('Inserting 8 seed sellers...');
    const sellerIds = [];
    for (let i = 0; i < 8; i++) {
      const uid = `seed-seller-${i}`;
      const name = `Seed Seller ${i}`;
      const phone = `900000000${i + 1}`;
      const res = await client.query(
        `INSERT INTO users (firebase_uid, role, name, phone, is_seed)
         VALUES ($1, 'seller', $2, $3, true)
         ON CONFLICT (firebase_uid) DO UPDATE
         SET role = 'seller', name = EXCLUDED.name, phone = EXCLUDED.phone, is_seed = true
         RETURNING id`,
        [uid, name, phone]
      );
      sellerIds.push(res.rows[0].id);
    }
    console.log(`Sellers ready with IDs: ${sellerIds.join(', ')}`);

    // 3. Prepare 100 shops distributed 3-4 per locality (27 localities: 19 with 4, 8 with 3 = 100)
    console.log('Preparing 100 shops...');
    const shopNames = generate100ShopNames();
    const shopsToInsert = [];
    let nameIdx = 0;

    for (let locIdx = 0; locIdx < localities.length; locIdx++) {
      const loc = localities[locIdx];
      const countForLocality = locIdx < 19 ? 4 : 3;

      for (let c = 0; c < countForLocality; c++) {
        const shopIdx = nameIdx;
        const name = shopNames[nameIdx++];
        const houseNo = randInt(1, 40);
        const address = `${houseNo}, ${loc.landmark}, ${loc.name}, Hyderabad, Telangana ${loc.pin}`;
        const lat = parseFloat((loc.lat + (Math.random() - 0.5) * 0.008).toFixed(6));
        const lng = parseFloat((loc.lng + (Math.random() - 0.5) * 0.008).toFixed(6));
        const photoUrl = shopPhotos[shopIdx % shopPhotos.length];
        const sellerId = sellerIds[shopIdx % sellerIds.length];

        shopsToInsert.push({
          seller_id: sellerId,
          name,
          address,
          lat,
          lng,
          photo_url: photoUrl,
          is_open: true,
          is_live: true,
          is_seed: true
        });
      }
    }

    // Batch insert shops in chunks of 50
    const insertedShopIds = [];
    const SHOP_CHUNK = 50;
    for (let i = 0; i < shopsToInsert.length; i += SHOP_CHUNK) {
      const chunk = shopsToInsert.slice(i, i + SHOP_CHUNK);
      const valueRows = [];
      const params = [];
      let pIdx = 1;

      for (const s of chunk) {
        valueRows.push(`($${pIdx}, $${pIdx + 1}, $${pIdx + 2}, $${pIdx + 3}, $${pIdx + 4}, $${pIdx + 5}, $${pIdx + 6}, $${pIdx + 7}, true)`);
        params.push(s.seller_id, s.name, s.address, s.lat, s.lng, s.photo_url, s.is_open, s.is_live);
        pIdx += 8;
      }

      const queryText = `
        INSERT INTO shops (seller_id, name, address, lat, lng, photo_url, is_open, is_live, is_seed)
        VALUES ${valueRows.join(', ')}
        RETURNING id
      `;
      const res = await client.query(queryText, params);
      for (const row of res.rows) {
        insertedShopIds.push(row.id);
      }
    }
    console.log(`Inserted ${insertedShopIds.length} shops.`);

    // 4. Insert 150-200 distinct products per shop
    console.log('Preparing products for all shops...');
    const allProductRows = [];

    for (const shopId of insertedShopIds) {
      const productCount = randInt(150, 200);
      const chosenProducts = sampleDistinct(products, productCount);

      for (const p of chosenProducts) {
        const prodName = (p.name || 'Grocery Item').slice(0, 255);
        let category = 'Grocery';
        if (p.category) {
          category = p.category.replace(/^[a-z]{2}:/, '').slice(0, 100);
        }
        const price = randInt(20, 800);
        const stock = randInt(5, 120);
        const imageUrl = p.image_url || null;
        const barcode = (p.code || '').slice(0, 100) || null;

        allProductRows.push({
          shop_id: shopId,
          name: prodName,
          category,
          price,
          stock,
          image_url: imageUrl,
          barcode,
          is_seed: true
        });
      }
    }

    console.log(`Total product rows to insert: ${allProductRows.length}. Batch inserting in chunks of 500...`);

    const PROD_CHUNK = 500;
    let insertedProductsCount = 0;

    for (let i = 0; i < allProductRows.length; i += PROD_CHUNK) {
      const chunk = allProductRows.slice(i, i + PROD_CHUNK);
      const valueRows = [];
      const params = [];
      let pIdx = 1;

      for (const row of chunk) {
        valueRows.push(`($${pIdx}, $${pIdx + 1}, $${pIdx + 2}, $${pIdx + 3}, $${pIdx + 4}, $${pIdx + 5}, $${pIdx + 6}, true)`);
        params.push(row.shop_id, row.name, row.category, row.price, row.stock, row.image_url, row.barcode);
        pIdx += 7;
      }

      const queryText = `
        INSERT INTO products (shop_id, name, category, price, stock, image_url, barcode, is_seed)
        VALUES ${valueRows.join(', ')}
      `;
      await client.query(queryText, params);
      insertedProductsCount += chunk.length;
      if (insertedProductsCount % 5000 === 0 || insertedProductsCount === allProductRows.length) {
        console.log(`  Inserted ${insertedProductsCount}/${allProductRows.length} products...`);
      }
    }

    await client.query('COMMIT');
    console.log('--- SEED TRANSACTION COMMITTED SUCCESSFULLY ---');

    // 5. Final summary counts
    console.log(`\nFinal Seed Summary:`);
    console.log(`- Inserted/verified sellers : ${sellerIds.length}`);
    console.log(`- Inserted shops            : ${insertedShopIds.length}`);
    console.log(`- Inserted products         : ${insertedProductsCount}`);

  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Error during seeding, rolled back transaction:', err);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

if (require.main === module) {
  main().catch((err) => {
    console.error('Fatal seeding error:', err);
    process.exit(1);
  });
}

module.exports = { main };
