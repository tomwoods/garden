/*
  # Add basic_activity to autocomplete_values RLS policies

  ## Problem
  The INSERT and UPDATE RLS policies on autocomplete_values have a hardcoded
  type allowlist of ['learning_source', 'proven_capacity']. The 'basic_activity'
  type was added to application code but never added to the database policies,
  causing every INSERT and UPDATE for basic_activity rows to be silently
  rejected by Postgres RLS.

  ## Changes
  - DROP and recreate the INSERT policy to include 'basic_activity' in WITH CHECK
  - DROP and recreate the UPDATE policy to include 'basic_activity' in USING and WITH CHECK
*/

DROP POLICY IF EXISTS "Anyone can insert valid autocomplete values" ON autocomplete_values;
DROP POLICY IF EXISTS "Anyone can update autocomplete value counts" ON autocomplete_values;

CREATE POLICY "Anyone can insert valid autocomplete values"
  ON autocomplete_values
  FOR INSERT
  WITH CHECK (
    length(trim(text)) > 0
    AND type = ANY (ARRAY['learning_source', 'proven_capacity', 'basic_activity'])
  );

CREATE POLICY "Anyone can update autocomplete value counts"
  ON autocomplete_values
  FOR UPDATE
  TO anon, authenticated
  USING (type = ANY (ARRAY['learning_source', 'proven_capacity', 'basic_activity']))
  WITH CHECK (
    length(trim(text)) > 0
    AND type = ANY (ARRAY['learning_source', 'proven_capacity', 'basic_activity'])
    AND count >= 0
  );
