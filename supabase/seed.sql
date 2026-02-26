-- Seed municipalities with Courtenay, Comox, and CVRD
-- Run with: supabase db reset (includes seed) or psql -f supabase/seed.sql

INSERT INTO municipalities (id, name, short_name, website_url, scrape_config) VALUES
(
  'a1b2c3d4-e5f6-4a5b-8c9d-0e1f2a3b4c5d',
  'City of Courtenay',
  'Courtenay',
  'https://www.courtenay.ca',
  '{
    "highlights": {
      "listing_url": "https://www.courtenay.ca/news",
      "base_url": "https://www.courtenay.ca",
      "url_pattern": "/news/{publish_date}/courtenay-council-meeting-highlights-{month}-{day}-{year}",
      "listing_selector": "a[href*=\"council-meeting-highlights\"]",
      "item_selectors": {
        "heading": "h2, h3",
        "paragraph": "p",
        "list": "ul li, ol li"
      }
    },
    "agendas": {
      "base_url": "https://www.courtenay.ca/councilmeetings"
    }
  }'::jsonb
),
(
  'b2c3d4e5-f6a7-5b6c-9d0e-1f2a3b4c5d6e',
  'Town of Comox',
  'Comox',
  'https://www.comox.ca',
  '{
    "meetings": {
      "base_url": "https://www.comox.ca/government-bylaws/council/meetings",
      "listing_url": "https://www.comox.ca/government-bylaws/council/meetings",
      "pdf_pattern": "YYYY-MMMonth-DD_Regular Council Meeting Agenda.pdf"
    }
  }'::jsonb
),
(
  'c3d4e5f6-a7b8-6c7d-0e1f-2a3b4c5d6e7f',
  'Comox Valley Regional District',
  'CVRD',
  'https://www.comoxvalleyrd.ca',
  '{
    "minutes_agendas": {
      "portal_url": "https://www.comoxvalleyrd.ca/minutes-agendas",
      "focus": "Board"
    }
  }'::jsonb
)
ON CONFLICT (short_name) DO UPDATE SET
  name = EXCLUDED.name,
  website_url = EXCLUDED.website_url,
  scrape_config = EXCLUDED.scrape_config,
  updated_at = now();
