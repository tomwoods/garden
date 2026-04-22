import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Missing Supabase environment variables');
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

// Types for our database schema
export interface DatabaseUser {
  id: string;
  public_key: string;
  encrypted_backup: string;
  last_modified: string;
}

export interface SharedPlant {
  id: string;
  encrypted_data: string;
  authorized_users: string[]; // Array of user UUIDs
  last_modified: string;
  user_last_modified: string;
}