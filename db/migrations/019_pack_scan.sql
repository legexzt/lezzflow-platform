-- Migration: 019_pack_scan.sql
-- Create pack_scans table for seller Scan & Pack feature

CREATE TABLE IF NOT EXISTS pack_scans (
    id SERIAL PRIMARY KEY,
    order_id INT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    product_id INT NOT NULL REFERENCES products(id),
    qty_scanned INT NOT NULL DEFAULT 0 CHECK (qty_scanned >= 0),
    scanned_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(order_id, product_id)
);

CREATE INDEX IF NOT EXISTS idx_pack_scans_order_id ON pack_scans(order_id);
