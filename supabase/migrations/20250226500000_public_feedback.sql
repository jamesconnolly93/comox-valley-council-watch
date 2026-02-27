-- Public feedback (Community Voices) from correspondence/public input sections
-- AI-processed sentiment summaries linked to agenda items

CREATE TABLE public_feedback (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  item_id uuid UNIQUE REFERENCES items(id) ON DELETE CASCADE,
  meeting_id uuid REFERENCES meetings(id) ON DELETE CASCADE,
  feedback_count integer,
  sentiment_summary text,
  themes jsonb,
  support_count integer,
  oppose_count integer,
  neutral_count integer,
  raw_excerpts jsonb,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX idx_public_feedback_item ON public_feedback(item_id);
CREATE INDEX idx_public_feedback_meeting ON public_feedback(meeting_id);

-- Raw correspondence text extracted by scraper, before AI processing
ALTER TABLE meetings ADD COLUMN IF NOT EXISTS raw_feedback text;

ALTER TABLE public_feedback ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public feedback is viewable by everyone"
  ON public_feedback FOR SELECT USING (true);
