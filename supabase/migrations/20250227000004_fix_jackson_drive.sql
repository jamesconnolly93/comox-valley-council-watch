-- Fix lowercase "jackson" in CVRD item titles
UPDATE items
SET title = REPLACE(title, '"jackson', '"Jackson')
WHERE title LIKE '%"jackson%';
