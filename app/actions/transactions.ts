'use server';

import { createSupabaseServerClient } from '@/lib/supabase/server';

type TransactionItemInput = {
  product_id: string;
  quantity: number;
  order_note?: string;
};

export async function createTransaction(input: {
  payment_method: 'cash' | 'qris' | 'card' | 'open_bill';
  items: TransactionItemInput[];
  discount_ids?: string[];
  cash_received?: number;
  status?: 'pending' | 'paid' | 'voided';
  notes?: string;
  contact_id?: string | null;
}) {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Authentication required');

  const rpcParams: Record<string, unknown> = {
    p_payment_method: input.payment_method,
    p_items: input.items,
    p_discount_ids: input.discount_ids ?? [],
    p_cash_received: input.cash_received ?? 0,
    p_status: input.status ?? 'paid',
    p_notes: input.notes ?? '',
  };
  if (input.contact_id) rpcParams.p_contact_id = input.contact_id;
  const { data, error } = await supabase.rpc('create_pos_transaction', rpcParams);
  if (error) throw new Error(error.message);

  const productIds = input.items.map(item => item.product_id);
  const { data: menuItems, error: menuError } = await supabase
    .from('menu_items')
    .select('product_id, product_name, price')
    .in('product_id', productIds);
  if (menuError) throw new Error(menuError.message);

  const kitchenItems = input.items.map(item => {
    const menuItem = menuItems.find(menu => menu.product_id === item.product_id);
    if (!menuItem) throw new Error(`Menu item ${item.product_id} was not found`);
    return {
      product_id: item.product_id,
      product_name: menuItem.product_name,
      quantity: item.quantity,
      price: menuItem.price,
      order_note: item.order_note ?? '',
    };
  });

  const { error: kitchenError } = await supabase
    .from('kitchen_orders')
    .insert({
      order_number: `ORD-${String(data).slice(0, 8).toUpperCase()}`,
      items: kitchenItems,
      notes: input.notes ?? '',
    });
  if (kitchenError) throw new Error(kitchenError.message);

  return data as string;
}

export async function listTransactions(options?: {
  limit?: number;
  from?: string;
  to?: string;
}) {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Authentication required');
  let query = supabase
    .from('transactions')
    .select('*, transaction_items(*), transaction_discounts(*), contacts(name, phone)')
    .order('created_at', { ascending: false })
    .limit(options?.limit ?? 1000);
  if (options?.from) query = query.gte('created_at', options.from);
  if (options?.to) query = query.lt('created_at', options.to);
  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return data;
}

export async function closeOpenBill(transactionId: string, paymentMethod?: string) {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Authentication required');

  const updatePayload: Record<string, string> = { status: 'paid' };
  if (paymentMethod && paymentMethod !== 'open_bill') {
    updatePayload.payment_method = paymentMethod;
  }

  const { data, error } = await supabase
    .from('transactions')
    .update(updatePayload)
    .eq('transaction_id', transactionId)
    .eq('cashier_id', user.id)
    .eq('payment_method', 'open_bill')
    .eq('status', 'pending')
    .select('*, transaction_items(*), transaction_discounts(*), contacts(name, phone)')
    .single();

  if (error) throw new Error(error.message);
  return data;
}

export async function getTransactionReceipt(transactionId: string) {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Authentication required');

  const { data, error } = await supabase
    .from('transactions')
    .select('*, transaction_items(*), transaction_discounts(*), contacts(name, phone)')
    .eq('transaction_id', transactionId)
    .single();

  if (error) throw new Error(error.message);
  return data;
}
