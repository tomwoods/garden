/*
  # Add signature_public_key column to users table

  1. Changes
    - Add `signature_public_key` (text) column to the `users` table
    - This column stores the user's signing public key for signature verification
    - Separate from the `public_key` column which stores encryption public key

  2. Notes
    - Uses IF NOT EXISTS pattern to safely handle column addition
    - Column is nullable to support existing data migration
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'users' AND column_name = 'signature_public_key'
  ) THEN
    ALTER TABLE users ADD COLUMN signature_public_key text;
  END IF;
END $$;
