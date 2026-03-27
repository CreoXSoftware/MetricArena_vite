-- Add province and country columns to teams
-- Run in Supabase SQL Editor

ALTER TABLE teams ADD COLUMN IF NOT EXISTS province text DEFAULT NULL;
ALTER TABLE teams ADD COLUMN IF NOT EXISTS country  text DEFAULT NULL;
