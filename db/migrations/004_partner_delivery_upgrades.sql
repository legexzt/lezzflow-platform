-- Migration: 004_partner_delivery_upgrades.sql
-- Add duty toggle, training status, OTP handoff, and delivery fee/distance columns

ALTER TABLE users ADD COLUMN IF NOT EXISTS is_online BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE users ADD COLUMN IF NOT EXISTS training_completed BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE delivery_requests ADD COLUMN IF NOT EXISTS pickup_otp VARCHAR(4);
ALTER TABLE delivery_requests ADD COLUMN IF NOT EXISTS delivery_otp VARCHAR(4);
ALTER TABLE delivery_requests ADD COLUMN IF NOT EXISTS delivery_fee NUMERIC(10,2);
ALTER TABLE delivery_requests ADD COLUMN IF NOT EXISTS distance_km NUMERIC(8,2);
