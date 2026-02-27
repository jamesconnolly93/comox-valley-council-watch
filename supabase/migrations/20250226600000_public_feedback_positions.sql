-- Add positions column for structured resident positions (stance, sentiment, count, detail)
ALTER TABLE public_feedback ADD COLUMN IF NOT EXISTS positions jsonb;
