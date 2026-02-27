-- Add AI-extracted community signal and editorial fields to items table
ALTER TABLE items ADD COLUMN IF NOT EXISTS headline text;
ALTER TABLE items ADD COLUMN IF NOT EXISTS key_stats jsonb DEFAULT '[]'::jsonb;
ALTER TABLE items ADD COLUMN IF NOT EXISTS community_signal jsonb;
ALTER TABLE items ADD COLUMN IF NOT EXISTS topic_label text;
