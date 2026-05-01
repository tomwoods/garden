/*
  # Plant Sharing Infrastructure

  ## Summary
  Sets up the full E2EE plant sharing system:

  ## Modified Tables
  - `shared_plants` — adds `viewing_users`, `plant_public_key`, `share_mode`, `snapshot_at`

  ## New Tables
  - `share_claims` — temporary one-time-use claim records for the QR handshake flow
    - `id` (uuid PK)
    - `short_code` (text, unique) — the short code included in the QR/share URL
    - `encrypted_plant_key` (text) — plant RSA private key encrypted with the ephemeral public key
    - `shared_plant_id` (uuid FK → shared_plants.id) — which shared plant this claim is for
    - `claim_mode` (text) — 'view' or 'co-edit'
    - `created_at` (timestamptz)
    - `expires_at` (timestamptz) — 7 days after creation; cleaned by pg_cron

  ## Security
  - `shared_plants`: RLS enabled. Reads open (ciphertext reveals nothing). Writes restricted to service role only.
  - `share_claims`: RLS enabled. No direct client reads or writes — all access via edge functions using service role.

  ## Notes
  1. The `viewing_users` and `authorized_users` columns are jsonb arrays of user UUIDs.
  2. `authorized_users[0]` is always the owner and the only user who may perform log compaction.
  3. The `plant_public_key` is intentionally public (stored in plaintext) so any authorized user
     can encrypt updates back to the shared record without needing the plant private key.
  4. `share_claims` records are deleted immediately upon successful claim (one-time use).
     The `expires_at` column handles garbage collection of unclaimed codes via a scheduled job.
*/

-- Add new columns to shared_plants if they don't already exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'shared_plants' AND column_name = 'viewing_users'
  ) THEN
    ALTER TABLE shared_plants ADD COLUMN viewing_users jsonb NOT NULL DEFAULT '[]';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'shared_plants' AND column_name = 'plant_public_key'
  ) THEN
    ALTER TABLE shared_plants ADD COLUMN plant_public_key text;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'shared_plants' AND column_name = 'share_mode'
  ) THEN
    ALTER TABLE shared_plants ADD COLUMN share_mode text NOT NULL DEFAULT 'view';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'shared_plants' AND column_name = 'snapshot_at'
  ) THEN
    ALTER TABLE shared_plants ADD COLUMN snapshot_at timestamptz;
  END IF;
END $$;

-- Ensure authorized_users exists as jsonb
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'shared_plants' AND column_name = 'authorized_users'
  ) THEN
    ALTER TABLE shared_plants ADD COLUMN authorized_users jsonb NOT NULL DEFAULT '[]';
  END IF;
END $$;

-- Enable RLS on shared_plants
ALTER TABLE shared_plants ENABLE ROW LEVEL SECURITY;

-- Anyone can read shared_plants (ciphertext is safe without the plant private key)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'shared_plants' AND policyname = 'Anyone can read shared plants'
  ) THEN
    EXECUTE 'CREATE POLICY "Anyone can read shared plants" ON shared_plants FOR SELECT USING (true)';
  END IF;
END $$;

-- Create share_claims table
CREATE TABLE IF NOT EXISTS share_claims (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  short_code text NOT NULL,
  encrypted_plant_key text NOT NULL,
  shared_plant_id uuid NOT NULL REFERENCES shared_plants(id) ON DELETE CASCADE,
  claim_mode text NOT NULL DEFAULT 'view',
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '7 days')
);

-- Unique index for fast short_code lookup
CREATE UNIQUE INDEX IF NOT EXISTS share_claims_short_code_idx ON share_claims (short_code);

-- Index for the cleanup job
CREATE INDEX IF NOT EXISTS share_claims_expires_at_idx ON share_claims (expires_at);

-- Enable RLS on share_claims (all access is via service role in edge functions)
ALTER TABLE share_claims ENABLE ROW LEVEL SECURITY;
