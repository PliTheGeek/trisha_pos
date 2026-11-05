'use server';

import { createSupabaseServerClient } from '@/lib/supabase/server';

export type ScanOrderType = 'dine_in' | 'takeaway' | 'delivery';
export type ScanPaymentMethod = 'cash' | 'qris' | 'card';

export type ScanOrderItemInput = {
  product_id: string;
  quantity: number;
  selections: Record<string, string>;
};

export type ScanOrderInput = {
  customer_name: string;
  customer_contact: string;
  order_type: ScanOrderType;
  payment_method: ScanPaymentMethod | null;
  notes: string;
  items: ScanOrderItemInput[];
};

export async function listScanMenu() {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc('get_public_scan_menu');
  if (error) throw new Error(error.message);
  return data as {
    categories: string[];
    items: {
      product_id: string;
      product_name: string;
      category: string;
      price: number;
      description: string | null;
      options: { group: string; choices: { name: string; addPrice: number }[] }[];
    }[];
  };
}

export async function submitScanOrder(input: ScanOrderInput) {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc('submit_scan_order', {
    p_customer_name: input.customer_name,
    p_customer_contact: input.customer_contact,
    p_order_type: input.order_type,
    p_payment_method: input.payment_method,
    p_notes: input.notes,
    p_items: input.items,
  });
  if (error) throw new Error(error.message);
  return data as { order_id: string; order_number: string; total: number };
}

async function authenticatedClient() {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Authentication required');
  return supabase;
}

export async function listIncomingScanOrders() {
  const supabase = await authenticatedClient();
  const { data, error } = await supabase
    .from('scan_orders')
    .select('*')
    .eq('status', 'pending')
    .order('created_at', { ascending: true });
  if (error) throw new Error(error.message);
  return data;
}

export async function getIncomingScanOrderCount() {
  const supabase = await authenticatedClient();
  const { count, error } = await supabase
    .from('scan_orders')
    .select('scan_order_id', { count: 'exact', head: true })
    .eq('status', 'pending');
  if (error) throw new Error(error.message);
  return count ?? 0;
}

export async function updateScanOrderStatus(scanOrderId: string, status: 'accepted' | 'cancelled') {
  const supabase = await authenticatedClient();
  const { error } = await supabase.rpc('update_scan_order_status', {
    p_scan_order_id: scanOrderId,
    p_status: status,
  });
  if (error) throw new Error(error.message);
}
