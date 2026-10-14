import { createClient } from '@supabase/supabase-js';
import { clearScaffoldingImageCache } from '../features/mistakes/scaffoldingImages';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || '';
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || '';

const isValid = !!(supabaseUrl && supabaseAnonKey);

// Fallback to placeholder strings to prevent createClient from throwing "supabaseUrl is required" at boot time
const actualUrl = isValid ? supabaseUrl : 'https://placeholder.supabase.co';
const actualKey = isValid ? supabaseAnonKey : 'placeholder-key';

export const supabase = createClient(actualUrl, actualKey);
// 계정 전환 시 이전 사용자의 이미지 주소를 재사용하지 않는다.
supabase.auth.onAuthStateChange(() => clearScaffoldingImageCache(supabase));
export const isSupabaseConfigured = isValid;
