/*
  # Rebuild plant_images table for E2EE base64 storage

  ## Summary
  Replaces the UploadThing-based plant_images table with a self-contained
  encrypted storage model. Image data is encrypted client-side using AES-GCM
  before being sent to the server, so the database never holds plaintext images.

  ## Changes

  ### plant_images table
  - Remove: uploadthing_key, url, file_hash, size_bytes (UploadThing fields)
  - Add: image_data_large (text) — encrypted base64 of the 720px version
  - Add: image_data_small (text) — encrypted base64 of the 100px thumbnail
  - Add: image_id (text, unique per user) — client-generated UUID used as the
    cross-device synchronization signal stored in plant.additional_info
  - Change uniqueness constraint: one row per (user_id, plant_id) because
    only one image per plant is now allowed
  - metadata column retained for future extensibility

  ### Security
  - RLS remains enabled
  - SELECT: authenticated users may only read their own rows (user_id = auth.uid())
  - INSERT/UPDATE/DELETE: restricted to service role (via Edge Functions only)
    so clients cannot bypass signature verification

  ### Notes
  - The old UploadThing-based edge functions (upload-image, delete-image,
    uploadthing-route) will be replaced by new edge functions.
  - image_count column on the users table is no longer needed; quota is
    determined by counting rows in plant_images for the user.
*/

DROP TABLE IF EXISTS plant_images;

CREATE TABLE IF NOT EXISTS plant_images (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  plant_id text NOT NULL,
  image_id text NOT NULL,
  image_data_large text NOT NULL,
  image_data_small text NOT NULL,
  created_at timestamptz DEFAULT now(),
  metadata jsonb DEFAULT '{}',
  UNIQUE(user_id, plant_id)
);

CREATE INDEX IF NOT EXISTS idx_plant_images_user_id ON plant_images(user_id);
CREATE INDEX IF NOT EXISTS idx_plant_images_plant_id ON plant_images(plant_id);
CREATE INDEX IF NOT EXISTS idx_plant_images_image_id ON plant_images(image_id);

ALTER TABLE plant_images ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own plant images"
  ON plant_images
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);
