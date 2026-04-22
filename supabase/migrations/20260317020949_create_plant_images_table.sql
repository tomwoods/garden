/*
  # Create Plant Images Tracking Table

  1. New Tables
    - `plant_images`
      - `id` (uuid, primary key) - Unique identifier for each image
      - `user_id` (uuid, foreign key) - Owner of the image
      - `plant_id` (text) - ID of the plant this image belongs to
      - `uploadthing_key` (text, unique) - UploadThing file key
      - `url` (text) - Public URL of the image
      - `file_hash` (text) - SHA-256 hash of the file for integrity
      - `size_bytes` (integer) - File size in bytes
      - `created_at` (timestamptz) - Upload timestamp
      - `metadata` (jsonb) - Additional metadata (plant name, etc.)

  2. Security
    - Enable RLS on `plant_images` table
    - Add policy for users to view their own images
    - Add policy for users to insert their own images
    - Add policy for users to delete their own images

  3. Indexes
    - Index on user_id for faster queries
    - Index on plant_id for faster lookups
    - Unique index on uploadthing_key
*/

CREATE TABLE IF NOT EXISTS plant_images (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  plant_id text NOT NULL,
  uploadthing_key text UNIQUE NOT NULL,
  url text NOT NULL,
  file_hash text NOT NULL,
  size_bytes integer NOT NULL DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  metadata jsonb DEFAULT '{}'::jsonb
);

ALTER TABLE plant_images ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own images"
  ON plant_images FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own images"
  ON plant_images FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own images"
  ON plant_images FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS plant_images_user_id_idx ON plant_images(user_id);
CREATE INDEX IF NOT EXISTS plant_images_plant_id_idx ON plant_images(plant_id);
CREATE INDEX IF NOT EXISTS plant_images_uploadthing_key_idx ON plant_images(uploadthing_key);
