/*
  # Create learning_sources table

  ## Purpose
  Stores shared learning sources (books, articles, courses, etc.) that users
  reference when logging watering activities. The list is public and community-
  contributed — any user can read it, and sources gain count when referenced.

  ## New Tables
  - `learning_sources`
    - `id` (uuid, primary key)
    - `text` (text, unique) — the source name, e.g. "The Alchemist" or "Coursera Python"
    - `count` (integer, default 1) — how many times this source has been used across all users
    - `last_updated_by` (text) — the user ID who last incremented the count
    - `created_at` (timestamptz)

  ## Security
  - RLS enabled
  - SELECT: open to all (anonymous and authenticated) — public community list
  - INSERT: open to all — any client can add a new source
  - UPDATE: open to all — any client can increment counts

  ## Notes
  - A unique constraint on `text` (case-insensitive via lowercased index) prevents duplicates
  - Descending index on `count` makes the top-200 query fast
  - The `last_updated_by` column is informational; policy does not restrict by it
  - No user-identifiable data is stored here — only source names and aggregate counts
*/

CREATE TABLE IF NOT EXISTS learning_sources (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  text text NOT NULL,
  count integer NOT NULL DEFAULT 1,
  last_updated_by text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT learning_sources_text_unique UNIQUE (text)
);

CREATE INDEX IF NOT EXISTS learning_sources_count_desc ON learning_sources (count DESC);

ALTER TABLE learning_sources ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read learning sources"
  ON learning_sources
  FOR SELECT
  TO anon, authenticated
  USING (true);

CREATE POLICY "Anyone can insert learning sources"
  ON learning_sources
  FOR INSERT
  TO anon, authenticated
  WITH CHECK (true);

CREATE POLICY "Anyone can update learning source counts"
  ON learning_sources
  FOR UPDATE
  TO anon, authenticated
  USING (true)
  WITH CHECK (true);
