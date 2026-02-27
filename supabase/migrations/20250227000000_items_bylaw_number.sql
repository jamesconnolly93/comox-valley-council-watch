-- Add bylaw_number for cross-meeting bylaw tracking
ALTER TABLE items ADD COLUMN bylaw_number text;
CREATE INDEX idx_items_bylaw_number ON items(bylaw_number) WHERE bylaw_number IS NOT NULL;
