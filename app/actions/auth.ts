'use server';

import { createSupabaseServerClient } from '@/lib/supabase/server';

export async function signIn(input: { email: string; password: string }) {
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.signInWithPassword(input);
  if (error) return { error: error.message };
  return { success: true };
}

export async function signOut() {
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.signOut();
  if (error) return { error: error.message };
  return { success: true };
}
