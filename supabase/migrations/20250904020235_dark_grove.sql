/*
  # Create shared_plants table for collaborative plant data

  1. New Tables
    - `shared_plants`
      - `id` (uuid, primary key) - Plant identifier
      - `encrypted_data` (text) - Encrypted plant data
      - `authorized_users` (jsonb) - Array of user UUIDs who can access this plant
      - `last_modified` (timestamptz) - When the plant was last updated
      - `user_last_modified` (uuid) - Which user made the last modification

  2. Security
    - Enable RLS on `shared_plants` table
    - Add policy for anyone to read shared plant data (data is encrypted)
    - Updates will be handled by Edge Functions using service role
*/

CREATE TABLE IF NOT EXISTS shared_plants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  encrypted_data text NOT NULL,
  authorized_users jsonb NOT NULL DEFAULT '[]'::jsonb,
  last_modified timestamptz DEFAULT now(),
  user_last_modified uuid
);

ALTER TABLE shared_plants ENABLE ROW LEVEL SECURITY;

-- Allow anyone to read shared plant data (data is encrypted anyway)
CREATE POLICY "Anyone can read shared plants"
  ON shared_plants
  FOR SELECT
  TO anon, authenticated
  USING (true);

-- Updates will be handled by Edge Functions using service role
-- No direct client update policy needed