import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || '';
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || '';

const isValid = !!(supabaseUrl && supabaseAnonKey);

// Fallback to placeholder strings to prevent createClient from throwing "supabaseUrl is required" at boot time
const actualUrl = isValid ? supabaseUrl : 'https://placeholder.supabase.co';
const actualKey = isValid ? supabaseAnonKey : 'placeholder-key';

export const supabase = createClient(actualUrl, actualKey);
export const isSupabaseConfigured = isValid;
