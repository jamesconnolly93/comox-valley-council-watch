-- Comox Valley Council Watch - Initial Schema
-- Core tables with RLS policies

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Governing bodies (Courtenay, Comox, CVRD)
CREATE TABLE municipalities (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  name text NOT NULL,
  short_name text NOT NULL,
  website_url text,
  scrape_config jsonb DEFAULT '{}',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(short_name)
);

-- Individual meetings
CREATE TABLE meetings (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  municipality_id uuid NOT NULL REFERENCES municipalities(id) ON DELETE CASCADE,
  meeting_type text NOT NULL DEFAULT 'regular',
  date timestamptz NOT NULL,
  title text,
  status text NOT NULL DEFAULT 'completed' CHECK (status IN ('upcoming', 'completed', 'cancelled')),
  agenda_url text,
  agenda_html_url text,
  minutes_url text,
  highlights_url text,
  video_url text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(municipality_id, date, meeting_type)
);

CREATE INDEX idx_meetings_municipality ON meetings(municipality_id);
CREATE INDEX idx_meetings_date ON meetings(date DESC);
CREATE INDEX idx_meetings_status ON meetings(status);

-- Individual agenda/minutes items within a meeting
CREATE TABLE items (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  meeting_id uuid NOT NULL REFERENCES meetings(id) ON DELETE CASCADE,
  item_number text,
  title text NOT NULL,
  description text,
  summary text,
  category text,
  tags text[] DEFAULT '{}',
  decision text,
  vote_result text,
  source_type text NOT NULL CHECK (source_type IN ('agenda', 'minutes', 'highlights')),
  raw_content text,
  attachments jsonb DEFAULT '[]',
  created_at timestamptz DEFAULT now()
);

CREATE INDEX idx_items_meeting ON items(meeting_id);
CREATE INDEX idx_items_category ON items(category);
CREATE INDEX idx_items_source_type ON items(source_type);
CREATE INDEX idx_items_created ON items(created_at DESC);

-- Full-text search on items
ALTER TABLE items ADD COLUMN search_vector tsvector
  GENERATED ALWAYS AS (
    setweight(to_tsvector('english', coalesce(title, '')), 'A') ||
    setweight(to_tsvector('english', coalesce(description, '')), 'B') ||
    setweight(to_tsvector('english', coalesce(summary, '')), 'A') ||
    setweight(to_tsvector('english', coalesce(raw_content, '')), 'C')
  ) STORED;
CREATE INDEX idx_items_search ON items USING GIN(search_vector);

-- User preferences (extends Supabase auth.users - we store preferences in public schema)
CREATE TABLE user_preferences (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email text,
  display_name text,
  watched_municipalities uuid[] DEFAULT '{}',
  watched_categories text[] DEFAULT '{}',
  keywords text[] DEFAULT '{}',
  digest_frequency text DEFAULT 'weekly' CHECK (digest_frequency IN ('realtime', 'daily', 'weekly')),
  digest_day text DEFAULT 'monday',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Notifications generated for users
CREATE TABLE notifications (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  item_id uuid NOT NULL REFERENCES items(id) ON DELETE CASCADE,
  match_reason text,
  read boolean DEFAULT false,
  emailed boolean DEFAULT false,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX idx_notifications_user ON notifications(user_id);
CREATE INDEX idx_notifications_unread ON notifications(user_id, read) WHERE read = false;

-- Scrape job tracking
CREATE TABLE scrape_runs (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  municipality_id uuid REFERENCES municipalities(id) ON DELETE SET NULL,
  source_type text NOT NULL,
  status text NOT NULL DEFAULT 'running' CHECK (status IN ('running', 'completed', 'failed')),
  items_found integer DEFAULT 0,
  items_new integer DEFAULT 0,
  error_message text,
  started_at timestamptz DEFAULT now(),
  completed_at timestamptz
);

CREATE INDEX idx_scrape_runs_municipality ON scrape_runs(municipality_id);
CREATE INDEX idx_scrape_runs_started ON scrape_runs(started_at DESC);

-- Row Level Security
ALTER TABLE municipalities ENABLE ROW LEVEL SECURITY;
ALTER TABLE meetings ENABLE ROW LEVEL SECURITY;
ALTER TABLE items ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_preferences ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE scrape_runs ENABLE ROW LEVEL SECURITY;

-- Municipalities, meetings, items: public read (government data), no write from anon
CREATE POLICY "Municipalities are viewable by everyone"
  ON municipalities FOR SELECT USING (true);

CREATE POLICY "Meetings are viewable by everyone"
  ON meetings FOR SELECT USING (true);

CREATE POLICY "Items are viewable by everyone"
  ON items FOR SELECT USING (true);

-- Service role can do everything (used by scrapers, cron)
-- RLS still applies but service_role bypasses RLS by default in Supabase

-- User preferences: users can only see/edit their own
CREATE POLICY "Users can view own preferences"
  ON user_preferences FOR SELECT USING (auth.uid() = id);

CREATE POLICY "Users can insert own preferences"
  ON user_preferences FOR INSERT WITH CHECK (auth.uid() = id);

CREATE POLICY "Users can update own preferences"
  ON user_preferences FOR UPDATE USING (auth.uid() = id);

-- Notifications: users can only see their own
CREATE POLICY "Users can view own notifications"
  ON notifications FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can update own notifications"
  ON notifications FOR UPDATE USING (auth.uid() = user_id);

-- Scrape runs: public read (transparency), no user write
CREATE POLICY "Scrape runs are viewable by everyone"
  ON scrape_runs FOR SELECT USING (true);

-- Trigger for updated_at
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER municipalities_updated_at
  BEFORE UPDATE ON municipalities
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER meetings_updated_at
  BEFORE UPDATE ON meetings
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER user_preferences_updated_at
  BEFORE UPDATE ON user_preferences
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
