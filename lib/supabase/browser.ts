import { createBrowserClient } from '@supabase/ssr';
import {
  getBrowserSupabaseAnonKey,
  getBrowserSupabaseUrl,
} from '@/lib/supabase/config';

export function createSupabaseBrowserClient() {
  return createBrowserClient(
    getBrowserSupabaseUrl(),
    getBrowserSupabaseAnonKey(),
  );
}
