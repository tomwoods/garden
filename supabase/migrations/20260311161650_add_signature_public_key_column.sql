/*
  # Add signature_public_key column to users table

  ## Changes
  1. Schema Updates
    - Add `signature_public_key` column to `users` table to store RSA-PSS public key for signature verification
    - This separates the encryption public key from the signing public key, following cryptographic best practices
  
  ## Security Notes
    - Maintains proper separation between encryption keys (RSA-OAEP) and signing keys (RSA-PSS)
    - Each key serves a single purpose, improving security posture
    - Existing users will need to re-register to populate this field
*/

-- Add signature_public_key column for storing RSA-PSS public keys
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'users' AND column_name = 'signature_public_key'
  ) THEN
    ALTER TABLE users ADD COLUMN signature_public_key TEXT;
  END IF;
END $$;
