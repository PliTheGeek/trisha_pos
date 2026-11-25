'use server';

import { revalidatePath } from 'next/cache';
import { createSupabaseServerClient } from '@/lib/supabase/server';

export type Contact = {
  contact_id: string;
  name: string;
  phone: string;
  created_at: string;
};

type ContactInput = {
  name: string;
  phone: string;
};

export async function listContacts() {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Authentication required');
  const { data, error } = await supabase
    .from('contacts')
    .select('*')
    .order('name');
  if (error) throw new Error(error.message);
  return data as Contact[];
}

export async function createContact(input: ContactInput) {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Authentication required');
  const { data, error } = await supabase
    .from('contacts')
    .insert({ name: input.name.trim(), phone: input.phone.trim() })
    .select()
    .single();
  if (error) throw new Error(error.message);
  revalidatePath('/');
  revalidatePath('/history');
  return data as Contact;
}

export async function updateContact(id: string, input: ContactInput) {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Authentication required');
  const { data, error } = await supabase
    .from('contacts')
    .update({ name: input.name.trim(), phone: input.phone.trim() })
    .eq('contact_id', id)
    .select()
    .single();
  if (error) throw new Error(error.message);
  revalidatePath('/');
  revalidatePath('/history');
  return data as Contact;
}

export async function deleteContact(id: string) {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Authentication required');
  const { error } = await supabase
    .from('contacts')
    .delete()
    .eq('contact_id', id);
  if (error) throw new Error(error.message);
  revalidatePath('/');
  revalidatePath('/history');
}
