-- Add categories text[] column for full AI-classified category list
-- category (text) stores primary/first category only for filtering
ALTER TABLE items ADD COLUMN IF NOT EXISTS categories text[] DEFAULT '{}';
