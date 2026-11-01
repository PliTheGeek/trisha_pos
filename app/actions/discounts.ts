'use server';

import { revalidatePath } from 'next/cache';
import { createSupabaseServerClient } from '@/lib/supabase/server';

type DiscountInput = {
  discount_id: string;
  discount_name: string;
  discount_value: number;
  discount_type?: 'percentage' | 'flat';
  minimum_subtotal?: number;
  starts_at?: string | null;
  ends_at?: string | null;
  is_active?: boolean;
};

async function adminClient() {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Authentication required');
  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single();
  if (profile?.role !== 'admin') throw new Error('Admin role required');
  return supabase;
}

export async function listDiscounts() {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.from('discounts').select('*').order('created_at', { ascending: false });
  if (error) throw new Error(error.message);
  return data;
}

export async function createDiscount(input: DiscountInput) {
  const supabase = await adminClient();
  const { data, error } = await supabase.from('discounts').insert(input).select().single();
  if (error) throw new Error(error.message);
  revalidatePath('/');
  revalidatePath('/manage');
  return data;
}

export async function updateDiscount(id: string, input: Partial<DiscountInput>) {
  const supabase = await adminClient();
  const { data, error } = await supabase.from('discounts').update(input).eq('discount_id', id).select().single();
  if (error) throw new Error(error.message);
  revalidatePath('/');
  revalidatePath('/manage');
  return data;
}

export async function deleteDiscount(id: string) {
  const supabase = await adminClient();
  const { error } = await supabase.from('discounts').update({ is_active: false }).eq('discount_id', id);
  if (error) throw new Error(error.message);
  revalidatePath('/manage');
}
