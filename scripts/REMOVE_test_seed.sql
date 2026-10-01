-- REMOVE_test_seed.sql
-- Removes ALL test seed data inserted for the Oct 2026 load/realism test.
-- The user reviews the seeded shops in the app FIRST; run this only on his word.
-- Safe: every test row carries is_seed = true.

BEGIN;

DELETE FROM products WHERE is_seed = true;
DELETE FROM shops WHERE is_seed = true;
DELETE FROM users WHERE is_seed = true;

-- Optional verification (run before COMMIT in a manual session):
-- SELECT count(*) AS remaining_seed_products FROM products WHERE is_seed = true;
-- SELECT count(*) AS remaining_seed_shops FROM shops WHERE is_seed = true;
-- SELECT count(*) AS remaining_seed_users FROM users WHERE is_seed = true;

COMMIT;
