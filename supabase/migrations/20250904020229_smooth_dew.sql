/*
  # Create users table for encrypted backups

  1. New Tables
    - `users`
      - `id` (uuid, primary key) - User identifier
      - `public_key` (text) - User's RSA public key for signature verification
      - `encrypted_backup` (text) - Encrypted backup data
      - `last_modified` (timestamptz) - When the backup was last updated

  2. Security
    - Enable RLS on `users` table
    - Add policy for anyone to read user data (public keys are not sensitive)
    - Updates will be handled by Edge Functions using service role
*/

CREATE TABLE IF NOT EXISTS users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  public_key text NOT NULL,
  encrypted_backup text,
  last_modified timestamptz DEFAULT now()
);

ALTER TABLE users ENABLE ROW LEVEL SECURITY;

-- Allow anyone to read user data (public keys are not sensitive)
CREATE POLICY "Anyone can read user data"
  ON users
  FOR SELECT
  TO anon, authenticated
  USING (true);

-- Updates will be handled by Edge Functions using service role
-- No direct client update policy needed