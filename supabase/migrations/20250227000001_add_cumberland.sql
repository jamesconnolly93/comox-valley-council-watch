-- Add Village of Cumberland as the fourth municipality
INSERT INTO municipalities (name, short_name, website_url)
VALUES ('Village of Cumberland', 'Cumberland', 'https://cumberland.ca')
ON CONFLICT (short_name) DO NOTHING;
