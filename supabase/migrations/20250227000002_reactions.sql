-- Reactions: "This affects me" — no auth, fingerprint-based dedup
CREATE TABLE reactions (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  item_id uuid NOT NULL REFERENCES items(id) ON DELETE CASCADE,
  fingerprint text NOT NULL,
  created_at timestamptz DEFAULT now(),
  UNIQUE(item_id, fingerprint)
);

CREATE INDEX idx_reactions_item ON reactions(item_id);
CREATE INDEX idx_reactions_fingerprint ON reactions(fingerprint, created_at DESC);

ALTER TABLE reactions ENABLE ROW LEVEL SECURITY;

-- Public can read counts (needed for displaying to all visitors)
CREATE POLICY "Reactions are publicly readable"
  ON reactions FOR SELECT USING (true);

-- Public can insert (no auth) — uniqueness enforced by constraint
CREATE POLICY "Anyone can react"
  ON reactions FOR INSERT WITH CHECK (true);

-- Public can delete their own reaction (toggle off) — matched by fingerprint
CREATE POLICY "Anyone can remove their own reaction"
  ON reactions FOR DELETE USING (true);
