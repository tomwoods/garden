/**
 * Supabase Service for secure cloud backup operations
 * Handles encrypted backup storage with signature verification
 */

import { supabase } from './supabase';
import { signData, importSigningKey } from './signatureService';
import { importCryptoKey } from './cryptoService';

export interface BackupSyncResult {
  success: boolean;
  message: string;
  timestamp?: string;
  error?: string;
}

export class SupabaseService {
  /**
   * Register a new user with their public keys
   */
  static async registerUser(
    userId: string, 
    encryptionPublicKey: string,
    signingPublicKey: string
  ): Promise<BackupSyncResult> {
    try {
      // Call the register-user Edge Function
      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/register-user`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`
          },
          body: JSON.stringify({
            userId,
            encryptionPublicKey,
            signingPublicKey,
            clientTimestamp: new Date().toISOString()
          })
        }
      );

      const result = await response.json();

      if (!response.ok) {
        console.error('Failed to register user:', result.error);
        return {
          success: false,
          message: 'Failed to register user',
          error: result.error
        };
      }

      return {
        success: true,
        message: result.message || 'User registered successfully',
        timestamp: result.timestamp
      };
    } catch (error) {
      console.error('Registration error:', error);
      return {
        success: false,
        message: 'Registration failed',
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  /**
   * Upload encrypted backup to Supabase with signature verification
   */
  static async uploadBackup(
    userId: string,
    encryptedBackup: string,
    signingPrivateKey: string
  ): Promise<BackupSyncResult> {
    try {
      // Import signing private key
      const privateKey = await importSigningKey(signingPrivateKey, 'pkcs8', ['sign']);
      
      // Sign the encrypted backup data
      const signature = await signData(encryptedBackup, privateKey);
      
      // Call the Edge Function
      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/update-backup`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
            'x-user-id': userId
          },
          body: JSON.stringify({
            encryptedBackup,
            signature,
            userId,
            clientTimestamp: new Date().toISOString()
          })
        }
      );

      const result = await response.json();

      if (!response.ok) {
        return {
          success: false,
          message: result.error || 'Failed to upload backup',
          error: result.error
        };
      }

      return {
        success: true,
        message: 'Backup uploaded successfully',
        timestamp: result.timestamp
      };
    } catch (error) {
      console.error('Backup upload error:', error);
      return {
        success: false,
        message: 'Failed to upload backup',
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  /**
   * Download encrypted backup from Supabase
   */
  static async downloadBackup(userId: string): Promise<{
    success: boolean;
    encryptedBackup?: string;
    lastModified?: string;
    error?: string;
  }> {
    try {
      const { data, error } = await supabase
        .from('users')
        .select('encrypted_backup, last_modified')
        .eq('id', userId)
        .single();

      if (error) {
        console.error('Failed to download backup:', error);
        return {
          success: false,
          error: error.message
        };
      }

      if (!data.encrypted_backup) {
        return {
          success: false,
          error: 'No backup found for this user'
        };
      }

      return {
        success: true,
        encryptedBackup: data.encrypted_backup,
        lastModified: data.last_modified
      };
    } catch (error) {
      console.error('Backup download error:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  /**
   * Fetch the top 200 most-used autocomplete values of a given type.
   * Returns an empty array on any failure (network down, timeout, etc.).
   */
  static async fetchTop200AutocompleteValues(
    type: string
  ): Promise<Array<{ id: string; text: string; count: number }>> {
    try {
      const { data, error } = await supabase
        .from('autocomplete_values')
        .select('id, text, count')
        .eq('type', type)
        .order('count', { ascending: false })
        .limit(200);

      if (error || !data) return [];
      return data;
    } catch {
      return [];
    }
  }

  /** Convenience wrapper for learning source autocomplete. */
  static async fetchTop200LearningSources(): Promise<Array<{ id: string; text: string; count: number }>> {
    return this.fetchTop200AutocompleteValues('learning_source');
  }

  /** Convenience wrapper for proven capacity autocomplete. */
  static async fetchTop200ProvenCapacities(): Promise<Array<{ id: string; text: string; count: number }>> {
    return this.fetchTop200AutocompleteValues('proven_capacity');
  }

  /**
   * Upsert an autocomplete value — insert if new, increment count if it exists
   * and was last updated by a different user. Fire-and-forget; never throws.
   */
  static async upsertAutocompleteValue(text: string, userId: string, type: string): Promise<void> {
    try {
      const trimmed = text.trim();
      if (!trimmed) return;

      const { data: existing } = await supabase
        .from('autocomplete_values')
        .select('id, count, last_updated_by')
        .eq('text', trimmed)
        .eq('type', type)
        .maybeSingle();

      if (!existing) {
        await supabase.from('autocomplete_values').insert({
          text: trimmed,
          count: 1,
          last_updated_by: userId,
          type,
          language: 'en_US'
        });
      } else if (existing.last_updated_by !== userId) {
        await supabase
          .from('autocomplete_values')
          .update({ count: existing.count + 1, last_updated_by: userId })
          .eq('id', existing.id);
      }
    } catch {
      // Silently swallow — this must never block a save operation
    }
  }

  /** Convenience wrapper — upsert a learning source. */
  static async upsertLearningSource(text: string, userId: string): Promise<void> {
    return this.upsertAutocompleteValue(text, userId, 'learning_source');
  }

  /** Convenience wrapper — upsert a proven capacity. */
  static async upsertProvenCapacity(text: string, userId: string): Promise<void> {
    return this.upsertAutocompleteValue(text, userId, 'proven_capacity');
  }

  /**
   * Check if user exists in Supabase
   */
  static async checkUserExists(userId: string): Promise<boolean> {
    try {
      const { data, error } = await supabase
        .from('users')
        .select('id')
        .eq('id', userId)
        .single();

      return !error && !!data;
    } catch (error) {
      console.error('Error checking user existence:', error);
      return false;
    }
  }
}