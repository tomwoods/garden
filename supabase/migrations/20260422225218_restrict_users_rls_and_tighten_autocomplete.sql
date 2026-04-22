/*
  # Tighten RLS policies — users and autocomplete_values tables

  ## Changes

  ### users table
  - DROP the overly permissive "Anyone can read user data" policy (allowed anon to read all rows)
  - The users table is now fully locked to direct client access; all reads/writes go through
    Edge Functions using the service role key, which bypasses RLS by design.
    No legitimate client-side direct read of users remains (downloadBackup and checkUserExists
    were moved to the get-backup and register-user Edge Functions).

  ### autocomplete_values table
  - DROP the duplicate "Anyone can update autocomplete values" policy (roles: public, no user binding)
  - KEEP "Anyone can update learning source counts" (scoped to anon + authenticated)
  - KEEP "Anyone can read autocomplete values" (intentionally public read)
  - KEEP "Anyone can insert autocomplete values" (intentionally open for community data)
  - The remaining UPDATE policy still allows count increments; the duplicate was redundant
    and had broader role scope (public vs anon+authenticated).
*/

-- Drop the open SELECT policy on users — no direct client reads remain
DROP POLICY IF EXISTS "Anyone can read user data" ON public.users;

-- Drop the duplicate/overly-broad UPDATE policy on autocomplete_values
DROP POLICY IF EXISTS "Anyone can update autocomplete values" ON public.autocomplete_values;
