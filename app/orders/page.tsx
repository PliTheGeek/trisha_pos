'use client';

import { useCallback, useEffect, useState } from 'react';
import { ArrowLeft, Check, ClipboardList, RefreshCw, X } from 'lucide-react';
import Link from 'next/link';
import {
  listIncomingScanOrders,
  updateScanOrderStatus,
} from '@/app/actions/scan-orders';

type ScanOrderItem = {
  product_id: string;
  product_name: string;
  quantity: number;
  price: number;
  order_note: string;
};

type ScanOrder = {
  scan_order_id: string;
  order_number: string;
  customer_name: string;
  customer_contact: string;
  order_type: 'dine_in' | 'takeaway' | 'delivery';
  payment_method: 'cash' | 'qris' | 'card' | null;
  payment_status: 'unpaid' | 'paid';
  items: ScanOrderItem[];
  notes: string;
  total: number;
  created_at: string;
};

const formatRp = (value: number) => `Rp ${Number(value).toLocaleString('id-ID')}`;

function orderTypeLabel(type: ScanOrder['order_type']) {
  if (type === 'dine_in') return 'Dine in';
  return type === 'takeaway' ? 'Takeaway / pickup' : 'Delivery';
}

function paymentLabel(method: ScanOrder['payment_method']) {
  if (method === 'card') return 'Other / card';
  return method ? method.toUpperCase() : 'Arrange with customer';
}

export default function IncomingOrdersPage() {
  const [orders, setOrders] = useState<ScanOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busyOrderId, setBusyOrderId] = useState<string | null>(null);

  const refreshOrders = useCallback(async () => {
    try {
      const currentOrders = await listIncomingScanOrders() as ScanOrder[];
      setOrders(currentOrders);
      setError('');
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Unable to load incoming orders.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const initialLoadId = window.setTimeout(() => void refreshOrders(), 0);
    const intervalId = window.setInterval(() => void refreshOrders(), 15000);
    return () => {
      window.clearTimeout(initialLoadId);
      window.clearInterval(intervalId);
    };
  }, [refreshOrders]);

  async function handleOrder(order: ScanOrder, status: 'accepted' | 'cancelled') {
    setBusyOrderId(order.scan_order_id);
    setError('');
    try {
      await updateScanOrderStatus(order.scan_order_id, status);
      setOrders(current => current.filter(item => item.scan_order_id !== order.scan_order_id));
    } catch (updateError) {
      setError(updateError instanceof Error ? updateError.message : 'Unable to update this order.');
    } finally {
      setBusyOrderId(null);
    }
  }

  return (
    <main className="min-h-screen bg-slate-50 p-4 text-slate-800 sm:p-6">
      <header className="mx-auto mb-6 flex max-w-7xl items-center justify-between rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex items-center gap-3">
          <Link href="/" className="rounded-lg bg-slate-100 p-2 hover:bg-slate-200" aria-label="Back to POS"><ArrowLeft size={20} /></Link>
          <div className="flex items-center gap-2"><ClipboardList size={23} /><div><p className="text-xs font-semibold uppercase tracking-widest text-slate-400">Customer orders</p><h1 className="text-xl font-bold">Incoming scan orders</h1></div></div>
        </div>
        <button onClick={() => void refreshOrders()} disabled={loading} className="inline-flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm font-semibold hover:bg-slate-50 disabled:opacity-50"><RefreshCw size={16} className={loading ? 'animate-spin' : ''} /><span className="hidden sm:inline">Refresh</span></button>
      </header>

      <div className="mx-auto max-w-7xl">
        {error && <p role="alert" className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</p>}
        <div className="mb-4 flex items-center justify-between rounded-lg border border-blue-100 bg-blue-50 p-4">
          <span className="font-semibold text-blue-900">Waiting for staff review</span>
          <span className="rounded-full bg-blue-700 px-3 py-1 text-sm font-bold text-white">{orders.length}</span>
        </div>
        {!loading && orders.length === 0 && <div className="rounded-xl border border-slate-200 bg-white p-12 text-center text-slate-500">No incoming scan orders.</div>}

        <div className="grid gap-4 lg:grid-cols-2">
          {orders.map(order => (
            <article key={order.scan_order_id} className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
              <header className="flex flex-wrap items-start justify-between gap-3 border-b bg-slate-50 p-4">
                <div>
                  <h2 className="text-xl font-black">{order.order_number}</h2>
                  <p className="mt-1 text-xs text-slate-500">{new Date(order.created_at).toLocaleString('id-ID')}</p>
                </div>
                <span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-bold uppercase text-amber-800">New</span>
              </header>
              <div className="space-y-4 p-5">
                <div className="grid gap-2 text-sm sm:grid-cols-2">
                  <p><span className="font-semibold">Customer:</span> {order.customer_name}</p>
                  <p><span className="font-semibold">Type:</span> {orderTypeLabel(order.order_type)}</p>
                  <p><span className="font-semibold">WhatsApp:</span> <a className="font-semibold text-emerald-700 underline" href={`https://wa.me/${order.customer_contact}`} target="_blank" rel="noreferrer">{order.customer_contact}</a></p>
                  <p><span className="font-semibold">Payment:</span> {paymentLabel(order.payment_method)}{order.payment_method ? ' (not paid)' : ''}</p>
                </div>

                <ul className="divide-y divide-slate-100 border-y border-slate-100">
                  {order.items.map((item, index) => (
                    <li key={`${item.product_id}-${index}`} className="flex justify-between gap-4 py-3 text-sm">
                      <div><p className="font-semibold">{item.quantity} × {item.product_name}</p>{item.order_note && <p className="mt-1 text-xs text-slate-500">{item.order_note}</p>}</div>
                      <span className="whitespace-nowrap">{formatRp(item.price * item.quantity)}</span>
                    </li>
                  ))}
                </ul>

                {order.notes && <p className="whitespace-pre-wrap rounded-lg bg-amber-50 p-3 text-sm text-amber-900"><span className="font-bold">Notes:</span> {order.notes}</p>}
                <div className="flex items-center justify-between gap-3">
                  <span className="text-lg font-black">{formatRp(order.total)}</span>
                  <div className="flex gap-2">
                    <button disabled={busyOrderId === order.scan_order_id} onClick={() => void handleOrder(order, 'cancelled')} className="inline-flex items-center gap-1 rounded-lg border border-red-200 px-3 py-2 text-sm font-bold text-red-700 hover:bg-red-50 disabled:opacity-50"><X size={16} /> Cancel</button>
                    <button disabled={busyOrderId === order.scan_order_id} onClick={() => void handleOrder(order, 'accepted')} className="inline-flex items-center gap-1 rounded-lg bg-emerald-600 px-3 py-2 text-sm font-bold text-white hover:bg-emerald-700 disabled:opacity-50"><Check size={16} /> {busyOrderId === order.scan_order_id ? 'Saving...' : 'Accept & send to kitchen'}</button>
                  </div>
                </div>
              </div>
            </article>
          ))}
        </div>
      </div>
    </main>
  );
}
