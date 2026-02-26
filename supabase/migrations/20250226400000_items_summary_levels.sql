-- Add three-tier summary columns for complexity slider (ELI5 → Expert)
-- Existing summary becomes the "standard" middle level
ALTER TABLE items ADD COLUMN IF NOT EXISTS summary_simple text;
ALTER TABLE items ADD COLUMN IF NOT EXISTS summary_expert text;
