/*
  # Shared Gardens Infrastructure

  ## Summary
  Creates the full E2EE shared gardens system, allowing teams of gardeners to
  maintain a shared garden with collaborative plant and activity records.

  ## New Tables

  ### shared_gardens
  Stores the encrypted snapshot + delta log for an entire shared garden.
  Mirrors the structure of shared_plants but covers a full garden database.

  - `id` (uuid PK)
  - `encrypted_data` (text) — full SharedGardenObject encrypted with garden public key
  - `authorized_users` (jsonb) — array of member UUIDs; all have equal write access
  - `garden_public_key` (text) — plaintext RSA public key so any member can encrypt updates
  - `last_modified` (timestamptz)
  - `user_last_modified` (uuid) — which user last pushed
  - `snapshot_at` (timestamptz) — when the embedded snapshot was taken

  ### garden_share_claims
  One-time-use claim records for the QR/link invitation handshake.
  Each invite is per-person (unique link per invitee).

  - `id` (uuid PK)
  - `short_code` (text, unique) — embedded in the invite URL
  - `encrypted_garden_key` (text) — garden RSA private key encrypted with ephemeral public key
  - `shared_garden_id` (uuid FK → shared_gardens.id CASCADE) — which garden this invite is for
  - `invited_by_uuid` (uuid) — which member generated this invite
  - `invitee_display_name` (text) — the display name chosen for the invitee
  - `created_at` (timestamptz)
  - `expires_at` (timestamptz) — 7 days after creation

  ## Security
  - `shared_gardens`: RLS enabled. Reads open (ciphertext is meaningless without garden private key).
    All writes via service role in edge functions only.
  - `garden_share_claims`: RLS enabled. All access via service role in edge functions only.

  ## Notes
  1. `authorized_users` is a flat jsonb array — all members have equal co-gardener access.
  2. The `garden_public_key` is intentionally plaintext so any member can encrypt an update.
  3. `garden_share_claims` records are deleted on successful claim (one-time use).
     `expires_at` handles garbage collection of unclaimed invites.
*/

CREATE TABLE IF NOT EXISTS shared_gardens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  encrypted_data text NOT NULL,
  authorized_users jsonb NOT NULL DEFAULT '[]',
  garden_public_key text NOT NULL,
  last_modified timestamptz NOT NULL DEFAULT now(),
  user_last_modified uuid,
  snapshot_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE shared_gardens ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'shared_gardens' AND policyname = 'Anyone can read shared gardens'
  ) THEN
    EXECUTE 'CREATE POLICY "Anyone can read shared gardens" ON shared_gardens FOR SELECT USING (true)';
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS garden_share_claims (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  short_code text NOT NULL,
  encrypted_garden_key text NOT NULL,
  shared_garden_id uuid NOT NULL REFERENCES shared_gardens(id) ON DELETE CASCADE,
  invited_by_uuid uuid NOT NULL,
  invitee_display_name text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '7 days')
);

CREATE UNIQUE INDEX IF NOT EXISTS garden_share_claims_short_code_idx ON garden_share_claims (short_code);
CREATE INDEX IF NOT EXISTS garden_share_claims_expires_at_idx ON garden_share_claims (expires_at);

ALTER TABLE garden_share_claims ENABLE ROW LEVEL SECURITY;
