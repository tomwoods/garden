/*
# Plot Activity Images Table

## Summary
Creates a new table to store encrypted images associated with plot activity logs
in shared gardens. Unlike shared_garden_images (one image per plant), plot activity
images allow up to 4 images per plot activity entry. Images are encrypted with the
garden's shared RSA public key, same as plant images.

## New Tables

### plot_activity_images
Stores E2EE images for plot activity logs in shared gardens. Multiple images per
plot activity (up to 4), identified by image_index 0-3.

- `id` (uuid PK)
- `shared_garden_id` (uuid, FK -> shared_gardens.id ON DELETE CASCADE)
- `plot_activity_id` (text, not null) — local plot activity identifier
- `image_id` (text, not null) — UUID assigned by the uploader
- `image_index` (int, not null, 0-3) — which slot (0-3) this image occupies
- `image_data_large` (text, not null) — encrypted large image (<=720px) JSON
- `image_data_small` (text, not null) — encrypted thumbnail (<=100px) JSON
- `uploaded_by` (uuid) — which gardener uploaded the image
- `created_at` (timestamptz)

## Security
- RLS enabled on `plot_activity_images`.
- SELECT open to anyone (ciphertext is meaningless without the garden private key).
- All writes and deletes go through edge functions using the service role key only.
- Edge functions verify the caller is a member of the garden's `authorized_users`
  array before allowing any operation.

## Notes
1. Images are encrypted with the garden's RSA public key, not the uploader's
   personal key. Any gardener with the garden private key can decrypt them.
2. Up to 4 images per plot activity (unique constraint on shared_garden_id +
   plot_activity_id + image_index).
3. The garden private key is stored in localStorage as `shared_garden_key_<gardenId>`
   and is never sent to the server.
*/

CREATE TABLE IF NOT EXISTS plot_activity_images (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  shared_garden_id uuid NOT NULL REFERENCES shared_gardens(id) ON DELETE CASCADE,
  plot_activity_id text NOT NULL,
  image_id text NOT NULL,
  image_index int NOT NULL CHECK (image_index >= 0 AND image_index <= 3),
  image_data_large text NOT NULL,
  image_data_small text NOT NULL,
  uploaded_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS plot_activity_images_garden_activity_idx_idx
  ON plot_activity_images (shared_garden_id, plot_activity_id, image_index);

ALTER TABLE plot_activity_images ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'plot_activity_images' AND policyname = 'Anyone can read plot activity images'
  ) THEN
    EXECUTE 'CREATE POLICY "Anyone can read plot activity images" ON plot_activity_images FOR SELECT USING (true)';
  END IF;
END $$;
