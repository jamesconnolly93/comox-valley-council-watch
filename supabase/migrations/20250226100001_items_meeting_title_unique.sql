-- Allow upsert on (meeting_id, title) for deduplication
CREATE UNIQUE INDEX IF NOT EXISTS idx_items_meeting_title_unique ON items(meeting_id, title);
