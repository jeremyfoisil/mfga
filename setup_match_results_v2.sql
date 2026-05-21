-- Run this in the Supabase SQL editor

-- Add metadata columns to match_results
ALTER TABLE match_results ADD COLUMN IF NOT EXISTS match_date DATE;
ALTER TABLE match_results ADD COLUMN IF NOT EXISTS match_time TEXT;
ALTER TABLE match_results ADD COLUMN IF NOT EXISTS venue TEXT;
ALTER TABLE match_results ADD COLUMN IF NOT EXISTS round TEXT;

-- Allow authenticated users to upsert (admin import JSON)
-- INSERT policy
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'match_results' AND policyname = 'match_results_insert_auth'
  ) THEN
    CREATE POLICY "match_results_insert_auth" ON match_results
      FOR INSERT TO authenticated WITH CHECK (true);
  END IF;
END $$;

-- UPDATE policy
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'match_results' AND policyname = 'match_results_update_auth'
  ) THEN
    CREATE POLICY "match_results_update_auth" ON match_results
      FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
  END IF;
END $$;
