/*
  # Update users table schema
  
  1. Changes to `users` table
    - Add `created` column (timestamptz) with default value of now() AT TIME ZONE 'utc'
    - Add `encryption_key` column (text, nullable)
    - Remove `signature_public_key` column
  
  2. Notes
    - The `created` column will track when the user was created in UTC
    - The `encryption_key` column allows storing an encryption key if needed
    - Removing `signature_public_key` as it's not part of the target schema
*/

-- Add created column if it doesn't exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'users' AND column_name = 'created'
  ) THEN
    ALTER TABLE users ADD COLUMN created timestamptz DEFAULT (now() AT TIME ZONE 'utc');
  END IF;
END $$;

-- Add encryption_key column if it doesn't exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'users' AND column_name = 'encryption_key'
  ) THEN
    ALTER TABLE users ADD COLUMN encryption_key text;
  END IF;
END $$;

-- Remove signature_public_key column if it exists
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'users' AND column_name = 'signature_public_key'
  ) THEN
    ALTER TABLE users DROP COLUMN signature_public_key;
  END IF;
END $$;
