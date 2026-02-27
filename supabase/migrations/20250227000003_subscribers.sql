-- Email subscribers for weekly digest
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE subscribers (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  email text UNIQUE NOT NULL,
  confirmed boolean DEFAULT false,
  confirmation_token text DEFAULT encode(gen_random_bytes(16), 'hex'),
  unsubscribe_token text DEFAULT encode(gen_random_bytes(16), 'hex'),
  municipality_filter text[],   -- null = all municipalities
  category_filter text[],       -- null = all categories
  created_at timestamptz DEFAULT now()
);

CREATE INDEX idx_subscribers_email ON subscribers(email);
CREATE INDEX idx_subscribers_confirmation_token ON subscribers(confirmation_token);
CREATE INDEX idx_subscribers_unsubscribe_token ON subscribers(unsubscribe_token);

ALTER TABLE subscribers ENABLE ROW LEVEL SECURITY;

-- No public read — service role only (subscriber data is private)
CREATE POLICY "Service role manages subscribers"
  ON subscribers FOR ALL USING (false);
