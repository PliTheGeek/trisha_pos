'use server';

import { revalidatePath } from 'next/cache';
import { createSupabaseServerClient } from '@/lib/supabase/server';

type MenuInput = {
  product_id: string;
  product_name: string;
  category: string;
  price: number;
  cogs?: number;
  description?: string;
  is_active?: boolean;
};

async function requireAdmin() {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Authentication required');
  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single();
  if (profile?.role !== 'admin') throw new Error('Admin role required');
  return supabase;
}

export async function listMenu() {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.from('menu_items').select('*').order('category').order('product_name');
  if (error) throw new Error(error.message);
  return data;
}

export async function createMenu(input: MenuInput) {
  const supabase = await requireAdmin();
  const { data, error } = await supabase.from('menu_items').insert(input).select().single();
  if (error) throw new Error(error.message);
  revalidatePath('/');
  revalidatePath('/manage');
  return data;
}

export async function updateMenu(id: string, input: Partial<MenuInput>) {
  const supabase = await requireAdmin();
  const { data, error } = await supabase.from('menu_items').update(input).eq('product_id', id).select().single();
  if (error) throw new Error(error.message);
  revalidatePath('/');
  revalidatePath('/manage');
  return data;
}

export async function deleteMenu(id: string) {
  const supabase = await requireAdmin();
  const { error } = await supabase.from('menu_items').delete().eq('product_id', id);
  if (error) {
    // If FK constraint prevents hard delete, fall back to soft-delete
    if (error.code === '23503') {
      const { error: softError } = await supabase.from('menu_items').update({ is_active: false }).eq('product_id', id);
      if (softError) throw new Error(softError.message);
    } else {
      throw new Error(error.message);
    }
  }
  revalidatePath('/');
  revalidatePath('/manage');
}
