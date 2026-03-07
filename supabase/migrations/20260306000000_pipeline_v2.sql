-- Pipeline V2: PDF-to-Claude processing support
-- Stores per-item PDF extracts for Claude vision processing
-- and tracks correspondence detection

CREATE TABLE IF NOT EXISTS attachments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  item_id uuid REFERENCES items(id) ON DELETE CASCADE,
  meeting_id uuid REFERENCES meetings(id) ON DELETE CASCADE,
  url text,
  filename text,
  attachment_type text NOT NULL DEFAULT 'agenda_extract'
    CHECK (attachment_type IN ('agenda_extract', 'correspondence', 'full_agenda')),
  pdf_base64 text,
  page_start integer,
  page_end integer,
  page_count integer,
  processed boolean NOT NULL DEFAULT false,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX idx_attachments_item ON attachments(item_id);
CREATE INDEX idx_attachments_meeting ON attachments(meeting_id);
CREATE UNIQUE INDEX idx_attachments_item_type ON attachments(item_id, attachment_type);

ALTER TABLE items ADD COLUMN IF NOT EXISTS contains_correspondence boolean DEFAULT false;
ALTER TABLE items ADD COLUMN IF NOT EXISTS processing_method text;
