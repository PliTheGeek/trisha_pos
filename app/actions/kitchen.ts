'use server';

import { createSupabaseServerClient } from '@/lib/supabase/server';

async function authenticatedClient() {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Authentication required');
  return supabase;
}

export async function listKitchenOrders() {
  const supabase = await authenticatedClient();
  const { data, error } = await supabase
    .from('kitchen_orders')
    .select('*')
    .eq('status', 'queued')
    .order('created_at', { ascending: true });
  if (error) throw new Error(error.message);
  return data;
}

export async function finishKitchenOrder(kitchenOrderId: string) {
  const supabase = await authenticatedClient();
  const { data, error } = await supabase
    .from('kitchen_orders')
    .update({ status: 'finished', finished_at: new Date().toISOString() })
    .eq('kitchen_order_id', kitchenOrderId)
    .eq('status', 'queued')
    .select()
    .single();
  if (error) throw new Error(error.message);
  return data;
}
