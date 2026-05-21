-- Run this in the Supabase SQL editor

-- Add goal scorer columns to match_results
ALTER TABLE match_results ADD COLUMN IF NOT EXISTS goals_home JSONB DEFAULT '[]';
ALTER TABLE match_results ADD COLUMN IF NOT EXISTS goals_away JSONB DEFAULT '[]';
