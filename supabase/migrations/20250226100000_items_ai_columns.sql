-- Add is_significant and metadata for AI pipeline output
ALTER TABLE items ADD COLUMN IF NOT EXISTS is_significant boolean DEFAULT false;
ALTER TABLE items ADD COLUMN IF NOT EXISTS metadata jsonb DEFAULT '{}';
