-- Add display_name column to user_profiles
ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS display_name text;
