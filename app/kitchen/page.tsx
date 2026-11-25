'use client';

import { useCallback, useEffect, useState } from 'react';
import { ArrowLeft, CheckCircle2, Coffee } from 'lucide-react';
import Link from 'next/link';
import { listKitchenOrders, finishKitchenOrder } from '@/app/actions/kitchen';
import { createSupabaseBrowserClient } from '@/lib/supabase/browser';

type KitchenItem = {
  product_id: string;
  product_name: string;
  quantity: number;
  price: number;
  order_note: string;
};

type KitchenOrder = {
  kitchen_order_id: string;
  order_number: string;
  items: KitchenItem[];
  notes: string;
  status: 'queued' | 'finished';
  created_at: string;
};

export default function KitchenInterface() {
  const [orders, setOrders] = useState<KitchenOrder[]>([]);
  const [error, setError] = useState('');
  const [finishingId, setFinishingId] = useState<string | null>(null);

  const loadOrders = useCallback(async () => {
    try {
      setOrders((await listKitchenOrders()) as KitchenOrder[]);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Failed to load ODS queue.');
    }
  }, []);

  // Load the current queue once, then keep it synchronized through Realtime.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => {
    void loadOrders();
  }, [loadOrders]);

  useEffect(() => {
    const supabase = createSupabaseBrowserClient();
    const channel = supabase
      .channel('kitchen-orders')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'kitchen_orders' }, payload => {
        setOrders(current => {
          const incoming = payload.new as KitchenOrder;
          if (incoming.status !== 'queued') return current;
          if (current.some(order => order.kitchen_order_id === incoming.kitchen_order_id)) return current;
          return [...current, incoming];
        });
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'kitchen_orders' }, payload => {
        const updated = payload.new as KitchenOrder;
        if (updated.status === 'finished') {
          setOrders(current => current.filter(order => order.kitchen_order_id !== updated.kitchen_order_id));
        }
      })
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, []);

  async function markFinished(order: KitchenOrder) {
    setFinishingId(order.kitchen_order_id);
    try {
      await finishKitchenOrder(order.kitchen_order_id);
      setOrders(current => current.filter(item => item.kitchen_order_id !== order.kitchen_order_id));
    } catch (finishError) {
      setError(finishError instanceof Error ? finishError.message : 'Failed to finish order.');
    } finally {
      setFinishingId(null);
    }
  }

  return (
    <div className="flex min-h-screen flex-col bg-slate-50 p-6 text-slate-800">
      <header className="mb-6 flex items-center justify-between rounded-xl border bg-white p-4 shadow-sm">
        <div className="flex items-center gap-4">
          <Link href="/" className="rounded-lg bg-slate-100 p-2"><ArrowLeft size={20} /></Link>
          <div className="flex items-center gap-2"><Coffee size={24} /><h1 className="text-xl font-bold">Order Queue</h1></div>
        </div>
        <div className="flex items-center gap-2">
          <span
            className={`rounded-lg px-3 py-2 text-sm font-bold ${
              orders.length > 0 ? 'bg-orange-100 text-orange-700' : 'bg-slate-100 text-slate-600'
            }`}
          >
            {orders.length} in queue
          </span>
          <div className="flex items-center gap-2 rounded-lg bg-blue-50 px-4 py-2 text-sm font-bold text-blue-700">
            <span className="h-2.5 w-2.5 animate-pulse rounded-full bg-blue-500" /> LIVE
          </div>
        </div>
      </header>
      {error && <p className="mb-4 rounded-lg bg-red-50 p-3 text-red-700">{error}</p>}
      {orders.length === 0 && (
        <div className="rounded-xl border bg-white p-10 text-center text-slate-500">No queued orders.</div>
      )}
      <div className="grid flex-1 grid-cols-1 gap-6 md:grid-cols-2 xl:grid-cols-4">
        {orders.map((order, index) => {
          const queueNumber = index + 1;
          return (
            <div key={order.kitchen_order_id} className="flex flex-col rounded-xl border border-slate-200 bg-white shadow-sm">
              <div className="flex items-center justify-between border-b bg-slate-50 p-4">
                <div>
                  <h2 className="text-xl font-bold">{order.order_number}</h2>
                  <p className="text-xs text-slate-500">{new Date(order.created_at).toLocaleTimeString('id-ID')}</p>
                </div>
                <div className="rounded-lg bg-blue-100 px-3 py-1.5 text-lg font-black text-blue-700">#{queueNumber}</div>
              </div>
              <div className="flex-1 p-5">
                <ul className="space-y-4">
                  {order.items.map((item, itemIdx) => (
                    <li key={`${order.kitchen_order_id}-${item.product_id}-${itemIdx}`} className="flex gap-4 border-b pb-4 last:border-0">
                      <span className="rounded-lg bg-slate-800 px-3 py-1.5 text-lg font-bold text-white">{item.quantity}</span>
                      <div>
                        <p className="font-bold">{item.product_name}</p>
                        {item.order_note && <p className="mt-1 text-sm font-semibold text-blue-600">+ {item.order_note}</p>}
                      </div>
                    </li>
                  ))}
                </ul>
                {order.notes && <p className="mt-4 text-sm text-slate-500">{order.notes}</p>}
              </div>
              <div className="rounded-b-xl border-t bg-slate-50 p-4">
                <button
                  disabled={finishingId === order.kitchen_order_id}
                  onClick={() => void markFinished(order)}
                  className="flex w-full items-center justify-center gap-2 rounded-lg bg-slate-800 py-3.5 font-bold text-white disabled:opacity-50"
                >
                  <CheckCircle2 size={20} />
                  {finishingId === order.kitchen_order_id ? 'Finishing...' : 'Mark as Finished'}
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}