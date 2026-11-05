import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { config, modeLocal } from '../../config/entreprise';

/** Client Supabase (clé « anon » publique uniquement : la sécurité repose sur les règles RLS de la base). */
export const supabase: SupabaseClient | null = modeLocal
  ? null
  : createClient(config.supabaseUrl, config.supabaseAnonKey, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
    });
