/*
  # Rename learning_sources to autocomplete_values

  ## Summary
  Generalizes the learning_sources table into a reusable autocomplete_values table
  that can serve multiple types of autocomplete suggestions across the app.

  ## Changes
  1. Renamed Tables
     - `learning_sources` → `autocomplete_values`

  2. New Columns on autocomplete_values
     - `type` (text, not null, default 'learning_source') — discriminator for which
       autocomplete field this value belongs to (e.g. 'learning_source', 'proven_capacity')
     - `language` (text, not null, default 'en_US') — locale of the value

  3. Constraint Changes
     - Old UNIQUE on `text` alone is replaced by UNIQUE on `(text, type)` so the
       same word can appear in different autocomplete types without collision

  4. Data Migration
     - All existing rows backfilled with type='learning_source' and language='en_US'

  5. Security
     - RLS remains enabled
     - Existing policies dropped and recreated under the new table name
*/

-- Rename the table
ALTER TABLE IF EXISTS learning_sources RENAME TO autocomplete_values;

-- Add new columns with safe defaults
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'autocomplete_values' AND column_name = 'type'
  ) THEN
    ALTER TABLE autocomplete_values ADD COLUMN type text NOT NULL DEFAULT 'learning_source';
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'autocomplete_values' AND column_name = 'language'
  ) THEN
    ALTER TABLE autocomplete_values ADD COLUMN language text NOT NULL DEFAULT 'en_US';
  END IF;
END $$;

-- Backfill existing rows
UPDATE autocomplete_values
SET type = 'learning_source', language = 'en_US'
WHERE type IS NULL OR type = '';

-- Drop old unique constraint on text alone if it exists, add new one on (text, type)
DO $$
BEGIN
  -- Drop any existing unique constraint on text
  IF EXISTS (
    SELECT 1 FROM information_schema.table_constraints tc
    JOIN information_schema.constraint_column_usage ccu
      ON tc.constraint_name = ccu.constraint_name
    WHERE tc.table_name = 'autocomplete_values'
      AND tc.constraint_type = 'UNIQUE'
      AND ccu.column_name = 'text'
  ) THEN
    -- Find and drop the constraint
    EXECUTE (
      SELECT 'ALTER TABLE autocomplete_values DROP CONSTRAINT ' || tc.constraint_name
      FROM information_schema.table_constraints tc
      JOIN information_schema.constraint_column_usage ccu
        ON tc.constraint_name = ccu.constraint_name
      WHERE tc.table_name = 'autocomplete_values'
        AND tc.constraint_type = 'UNIQUE'
        AND ccu.column_name = 'text'
      LIMIT 1
    );
  END IF;
END $$;

-- Add composite unique constraint
ALTER TABLE autocomplete_values
  DROP CONSTRAINT IF EXISTS autocomplete_values_text_type_key;

ALTER TABLE autocomplete_values
  ADD CONSTRAINT autocomplete_values_text_type_key UNIQUE (text, type);

-- RLS is already enabled; recreate policies under new table name
-- (policies on renamed table are retained by Postgres, but we ensure clean state)
ALTER TABLE autocomplete_values ENABLE ROW LEVEL SECURITY;

-- Allow any authenticated or anonymous user to read autocomplete values
DROP POLICY IF EXISTS "Anyone can read learning sources" ON autocomplete_values;
DROP POLICY IF EXISTS "Anyone can read autocomplete values" ON autocomplete_values;
CREATE POLICY "Anyone can read autocomplete values"
  ON autocomplete_values
  FOR SELECT
  USING (true);

-- Allow insert for any request (upsert pattern; no auth required for anonymous contributors)
DROP POLICY IF EXISTS "Anyone can insert learning sources" ON autocomplete_values;
DROP POLICY IF EXISTS "Anyone can insert autocomplete values" ON autocomplete_values;
CREATE POLICY "Anyone can insert autocomplete values"
  ON autocomplete_values
  FOR INSERT
  WITH CHECK (true);

-- Allow update (for incrementing count)
DROP POLICY IF EXISTS "Anyone can update learning sources" ON autocomplete_values;
DROP POLICY IF EXISTS "Anyone can update autocomplete values" ON autocomplete_values;
CREATE POLICY "Anyone can update autocomplete values"
  ON autocomplete_values
  FOR UPDATE
  USING (true)
  WITH CHECK (true);
