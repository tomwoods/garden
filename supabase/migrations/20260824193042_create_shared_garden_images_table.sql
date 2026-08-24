/*
# Shared Garden Images Table

## Summary
Creates a new table to store encrypted plant images for shared gardens.
Unlike personal plant images (which are encrypted with each user's personal RSA key
and stored under that user's ID), shared garden images are encrypted with the
garden's shared RSA public key and stored under the shared garden's UUID.
This allows any authorized gardener to decrypt and view images using the garden
private key they already hold.

## New Tables

### shared_garden_images
Stores E2EE plant images for shared gardens. One image row per plant per garden.

- `id` (uuid PK)
- `shared_garden_id` (uuid, FK → shared_gardens.id ON DELETE CASCADE) — which shared garden this image belongs to
- `plant_id` (text, not null) — local plant identifier within the shared garden
- `image_id` (text, not null) — UUID assigned by the uploader
- `image_data_large` (text, not null) — encrypted large image (≤720px) JSON
- `image_data_small` (text, not null) — encrypted thumbnail (≤100px) JSON
- `uploaded_by` (uuid) — which gardener uploaded the image
- `created_at` (timestamptz)

## Security
- RLS enabled on `shared_garden_images`.
- SELECT open to anyone (ciphertext is meaningless without the garden private key).
- All writes and deletes go through edge functions using the service role key only.
- Edge functions verify the caller is a member of the garden's `authorized_users`
  array before allowing any operation.

## Notes
1. Images are encrypted with the garden's RSA public key, not the uploader's
   personal key. Any gardener with the garden private key can decrypt them.
2. One image per plant per garden (unique constraint on shared_garden_id + plant_id).
3. The garden private key is stored in localStorage as `shared_garden_key_<gardenId>`
   and is never sent to the server.
*/

CREATE TABLE IF NOT EXISTS shared_garden_images (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  shared_garden_id uuid NOT NULL REFERENCES shared_gardens(id) ON DELETE CASCADE,
  plant_id text NOT NULL,
  image_id text NOT NULL,
  image_data_large text NOT NULL,
  image_data_small text NOT NULL,
  uploaded_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS shared_garden_images_garden_plant_idx
  ON shared_garden_images (shared_garden_id, plant_id);

ALTER TABLE shared_garden_images ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'shared_garden_images' AND policyname = 'Anyone can read shared garden images'
  ) THEN
    EXECUTE 'CREATE POLICY "Anyone can read shared garden images" ON shared_garden_images FOR SELECT USING (true)';
  END IF;
END $$;
