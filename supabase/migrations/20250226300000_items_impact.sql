-- Add impact column for "Why should I care?" resident-facing callout
ALTER TABLE items ADD COLUMN IF NOT EXISTS impact text;
