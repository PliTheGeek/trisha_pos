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

export async function listMenuCategories() {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.from('menu_categories').select('category_name').order('category_name');
  if (error) throw new Error(error.message);
  return data.map(category => category.category_name);
}

async function requireMenuCategory(supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>, categoryName: string) {
  const { data, error } = await supabase
    .from('menu_categories')
    .select('category_name')
    .eq('category_name', categoryName)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error('Select a category from the managed category list.');
}

export async function createMenuCategory(categoryName: string) {
  const supabase = await requireAdmin();
  const { error } = await supabase.rpc('manage_menu_category', {
    p_action: 'create',
    p_category_name: categoryName,
    p_new_name: null,
  });
  if (error) throw new Error(error.message);
  revalidatePath('/');
  revalidatePath('/manage');
}

export async function renameMenuCategory(categoryName: string, newName: string) {
  const supabase = await requireAdmin();
  const { error } = await supabase.rpc('manage_menu_category', {
    p_action: 'rename',
    p_category_name: categoryName,
    p_new_name: newName,
  });
  if (error) throw new Error(error.message);
  revalidatePath('/');
  revalidatePath('/manage');
}

export async function deleteMenuCategory(categoryName: string) {
  const supabase = await requireAdmin();
  const { error } = await supabase.rpc('manage_menu_category', {
    p_action: 'delete',
    p_category_name: categoryName,
    p_new_name: null,
  });
  if (error) throw new Error(error.message);
  revalidatePath('/');
  revalidatePath('/manage');
}

export async function createMenu(input: MenuInput) {
  const supabase = await requireAdmin();
  await requireMenuCategory(supabase, input.category);
  const { data, error } = await supabase.from('menu_items').insert(input).select().single();
  if (error) throw new Error(error.message);
  revalidatePath('/');
  revalidatePath('/manage');
  return data;
}

export async function updateMenu(id: string, input: Partial<MenuInput>) {
  const supabase = await requireAdmin();
  if (input.category) await requireMenuCategory(supabase, input.category);
  const { data, error } = await supabase.from('menu_items').update(input).eq('product_id', id).select().single();
  if (error) throw new Error(error.message);
  revalidatePath('/');
  revalidatePath('/manage');
  return data;
}

export async function deleteMenu(id: string) {
  const supabase = await requireAdmin();
  const { error } = await supabase.from('menu_items').update({ is_active: false }).eq('product_id', id);
  if (error) throw new Error(error.message);
  revalidatePath('/');
  revalidatePath('/manage');
}
