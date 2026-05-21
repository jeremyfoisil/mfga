-- Run this in the Supabase SQL editor

-- Add score column to pronostics
ALTER TABLE pronostics ADD COLUMN IF NOT EXISTS score INTEGER;

-- Allow authenticated users to update the score column
-- (needed so admin client can write scores on behalf of all participants)
CREATE POLICY IF NOT EXISTS "pronostics_update_score" ON pronostics
  FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
