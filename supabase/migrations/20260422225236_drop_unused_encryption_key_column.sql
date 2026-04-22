/*
  # Drop unused encryption_key column from users table

  ## Summary
  The `encryption_key` column was added in an earlier migration but is never read
  or written by any application code or Edge Function. Removing it reduces the
  attack surface — it appeared in every row that was previously readable under the
  open SELECT policy.

  ## Changes
  - users: DROP COLUMN encryption_key (nullable text, never used)
*/

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'users' AND column_name = 'encryption_key'
  ) THEN
    ALTER TABLE public.users DROP COLUMN encryption_key;
  END IF;
END $$;
