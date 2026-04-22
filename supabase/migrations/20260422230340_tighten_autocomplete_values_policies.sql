/*
  # Tighten autocomplete_values INSERT and UPDATE policies

  ## Summary
  Replaces the always-true INSERT and UPDATE policies on autocomplete_values with
  constrained equivalents that reject garbage writes while allowing everything the
  app currently sends.

  ## Changes

  ### autocomplete_values table
  - DROP "Anyone can insert autocomplete values" (WITH CHECK: true — accepts anything)
  - ADD replacement INSERT policy: requires non-empty trimmed text and a known type value
  - DROP "Anyone can update learning source counts" (USING: true, WITH CHECK: true)
  - ADD replacement UPDATE policy: same type constraint, plus count must be non-negative
  - ADD CHECK constraint on count column: count >= 0

  ## Notes
  - The app only ever inserts values with type 'learning_source' or 'proven_capacity'.
    Any other type is rejected at the database level.
  - The app only ever increments count by 1. The constraint ensures count cannot be
    set to a negative value by a direct API call.
  - SELECT policy ("Anyone can read autocomplete values") is intentionally left as-is —
    this table contains community suggestion text and is designed to be publicly readable.
*/

-- Drop the always-true INSERT policy
DROP POLICY IF EXISTS "Anyone can insert autocomplete values" ON public.autocomplete_values;

-- Drop the always-true UPDATE policy
DROP POLICY IF EXISTS "Anyone can update learning source counts" ON public.autocomplete_values;

-- Add constrained INSERT policy: non-empty text, known type only
CREATE POLICY "Anyone can insert valid autocomplete values"
  ON public.autocomplete_values
  FOR INSERT
  WITH CHECK (
    length(trim(text)) > 0
    AND type IN ('learning_source', 'proven_capacity')
  );

-- Add constrained UPDATE policy: same type restriction, count must stay non-negative
CREATE POLICY "Anyone can update autocomplete value counts"
  ON public.autocomplete_values
  FOR UPDATE
  TO anon, authenticated
  USING (
    type IN ('learning_source', 'proven_capacity')
  )
  WITH CHECK (
    length(trim(text)) > 0
    AND type IN ('learning_source', 'proven_capacity')
    AND count >= 0
  );

-- Add CHECK constraint on count to enforce non-negative at the column level
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE table_name = 'autocomplete_values'
      AND constraint_name = 'autocomplete_values_count_non_negative'
  ) THEN
    ALTER TABLE public.autocomplete_values
      ADD CONSTRAINT autocomplete_values_count_non_negative CHECK (count >= 0);
  END IF;
END $$;
