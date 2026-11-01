'use client';

import { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, Check, Download, Printer, Receipt, X } from 'lucide-react';
import Link from 'next/link';
import { closeOpenBill, listTransactions } from '@/app/actions/transactions';

type Period = 'daily' | 'monthly' | 'annual';
type Transaction = {
  transaction_id: string;
  created_at: string;
  status: string;
  payment_method: string;
  subtotal: number;
  discount_total: number;
  total: number;
  transaction_items: { product_name: string; quantity: number; price: number; order_note: string }[];
};

function periodBounds(period: Period) {
  const now = new Date();
  const start = new Date(now.getFullYear(), period === 'annual' ? 0 : period === 'monthly' ? now.getMonth() : now.getMonth(), period === 'daily' ? now.getDate() : 1);
  const end = period === 'annual'
    ? new Date(now.getFullYear() + 1, 0, 1)
    : period === 'monthly'
      ? new Date(now.getFullYear(), now.getMonth() + 1, 1)
      : new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
  return { from: start.toISOString(), to: end.toISOString() };
}

function csvCell(value: string | number) {
  return `"${String(value).replaceAll('"', '""')}"`;
}

export default function HistoryInterface() {
  const [period, setPeriod] = useState<Period>('daily');
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [selected, setSelected] = useState<Transaction | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [closingId, setClosingId] = useState<string | null>(null);

  async function load(periodToLoad = period) {
    setLoading(true);
    setError('');
    try {
      setTransactions(await listTransactions({ limit: 1000, ...periodBounds(periodToLoad) }) as Transaction[]);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Failed to load transactions.');
    } finally {
      setLoading(false);
    }
  }

  // Loading is intentionally started after the page mounts.
  // eslint-disable-next-line react-hooks/set-state-in-effect, react-hooks/exhaustive-deps
  useEffect(() => { void load(); }, []);

  const total = useMemo(() => transactions.reduce((sum, item) => sum + Number(item.total), 0), [transactions]);
  const openBills = useMemo(() => transactions.filter(item =>
    item.payment_method.toLowerCase() === 'open_bill' && item.status.toLowerCase() === 'pending').length, [transactions]);

  async function closeBill(transaction: Transaction) {
    setClosingId(transaction.transaction_id);
    setError('');
    try {
      const updated = await closeOpenBill(transaction.transaction_id);
      setTransactions(current => current.map(item => item.transaction_id === updated.transaction_id
        ? { ...item, status: updated.status }
        : item));
      setSelected(current => {
        if (!current || current.transaction_id !== updated.transaction_id) return current;
        return { ...current, status: String(updated.status) };
      });
    } catch (closeError) {
      setError(closeError instanceof Error ? closeError.message : 'Failed to close open bill.');
    } finally {
      setClosingId(null);
    }
  }

  function exportCsv() {
    const rows = [
      ['Transaction ID', 'Date', 'Payment', 'Status', 'Subtotal', 'Discount', 'Total', 'Items'],
      ...transactions.map(item => [
        item.transaction_id,
        new Date(item.created_at).toLocaleString('id-ID'),
        item.payment_method.toUpperCase(),
        item.status,
        item.subtotal,
        item.discount_total,
        item.total,
        item.transaction_items.map(line => `${line.quantity}x ${line.product_name}`).join('; '),
      ]),
    ];
    const csv = `\uFEFF${rows.map(row => row.map(csvCell).join(',')).join('\r\n')}`;
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8;' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = `transactions-${period}-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="min-h-screen bg-slate-50 p-4 text-slate-800 sm:p-6">
      <header className="mx-auto mb-6 flex max-w-7xl flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <Link href="/" className="border border-slate-200 bg-white p-2.5 shadow-sm transition hover:bg-slate-100"><ArrowLeft size={20} /></Link>
          <div><p className="text-xs font-semibold uppercase tracking-widest text-slate-400">Reports</p><h1 className="text-xl font-bold">Transaction Logs</h1></div>
        </div>
        <div className="flex flex-wrap gap-2">
          <select value={period} onChange={event => { const next = event.target.value as Period; setPeriod(next); void load(next); }} className="border border-slate-200 bg-white px-3 py-2 text-sm font-medium outline-none shadow-sm focus:border-blue-500">
            <option value="daily">Today</option><option value="monthly">This month</option><option value="annual">This year</option>
          </select>
          <button onClick={exportCsv} disabled={!transactions.length} className="inline-flex items-center gap-2 border border-slate-800 bg-slate-800 px-3 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-slate-700 disabled:opacity-40"><Download size={16} /> CSV</button>
          <button onClick={() => window.print()} className="inline-flex items-center gap-2 border border-slate-200 bg-white px-3 py-2 text-sm font-semibold shadow-sm transition hover:bg-slate-100"><Printer size={16} /> Print</button>
        </div>
      </header>

      <main className="mx-auto max-w-7xl">
        {error && <p className="mb-4 border border-red-200 bg-red-50 p-3 text-sm text-red-700 shadow-sm">{error}</p>}
        <section className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-3">
          <div className="border border-slate-200 bg-white p-4 shadow-sm"><p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Transactions</p><p className="mt-1 text-2xl font-bold">{transactions.length}</p></div>
          <div className="border border-slate-200 bg-white p-4 shadow-sm"><p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Revenue</p><p className="mt-1 text-lg font-bold sm:text-2xl">Rp {total.toLocaleString('id-ID')}</p></div>
          <div className="col-span-2 border border-slate-200 bg-white p-4 shadow-sm sm:col-span-1"><p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Open Bills</p><p className="mt-1 text-2xl font-bold">{openBills}</p></div>
        </section>

        <section className="print-sales-activity overflow-hidden border border-slate-200 bg-white shadow-sm">
          <div className="flex items-center justify-between border-b px-4 py-4 sm:px-5"><div><h2 className="font-bold">Sales activity</h2><p className="text-xs text-slate-400">Showing {period} records</p></div>{loading && <span className="text-sm text-slate-400">Loading...</span>}</div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[700px] text-left text-sm">
              <thead><tr className="border-b bg-slate-50 text-xs uppercase tracking-wide text-slate-500"><th className="px-5 py-3">Date</th><th className="px-5 py-3">Payment</th><th className="px-5 py-3">Status</th><th className="px-5 py-3 text-right">Total</th><th className="px-5 py-3 text-right">Details</th></tr></thead>
              <tbody>
                {!loading && !transactions.length && <tr><td colSpan={5} className="px-5 py-12 text-center text-slate-400">No transactions in this period.</td></tr>}
                {transactions.map(transaction => {
                  const isOpenBill = transaction.payment_method.toLowerCase() === 'open_bill';
                  const isPending = transaction.status.toLowerCase() === 'pending';
                  return <tr key={transaction.transaction_id} className="border-b last:border-0 hover:bg-slate-50">
                    <td className="whitespace-nowrap px-5 py-4">{new Date(transaction.created_at).toLocaleString('id-ID')}</td>
                    <td className="px-5 py-4 font-medium">{transaction.payment_method.replaceAll('_', ' ').toUpperCase()}</td>
                    <td className="px-5 py-4"><span className={`border px-2.5 py-1 text-xs font-semibold ${isPending ? 'border-amber-200 bg-amber-100 text-amber-700' : 'border-emerald-200 bg-emerald-100 text-emerald-700'}`}>{transaction.status}</span></td>
                    <td className="px-5 py-4 text-right font-bold">Rp {Number(transaction.total).toLocaleString('id-ID')}</td>
                    <td className="px-5 py-4 text-right"><div className="flex justify-end gap-2">
                      {isOpenBill && isPending && <button onClick={() => void closeBill(transaction)} disabled={closingId === transaction.transaction_id} className="inline-flex items-center gap-1 border border-emerald-600 bg-emerald-600 px-2.5 py-1.5 text-xs font-bold text-white shadow-sm hover:bg-emerald-700 disabled:opacity-50"><Check size={14} />{closingId === transaction.transaction_id ? 'Closing' : 'Close'}</button>}
                      <button aria-label="View transaction details" onClick={() => setSelected(transaction)} className="border border-blue-100 p-2 text-blue-600 shadow-sm hover:bg-blue-50"><Receipt size={18} /></button>
                    </div></td>
                  </tr>;
                })}
              </tbody>
            </table>
          </div>
        </section>
      </main>

      {selected && <div className="fixed inset-0 z-10 flex items-center justify-center bg-slate-900/50 p-4" onClick={() => setSelected(null)}>
        <div className="w-full max-w-md border border-slate-200 bg-white p-5 shadow-xl" onClick={event => event.stopPropagation()}>
          <div className="mb-5 flex items-start justify-between"><div><p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Transaction</p><h2 className="font-bold">#{selected.transaction_id.slice(0, 8)}</h2></div><button onClick={() => setSelected(null)} className="border border-slate-200 p-1 text-slate-400 shadow-sm hover:bg-slate-100"><X size={20} /></button></div>
          <div className="space-y-3 border-b pb-4">{selected.transaction_items.map((item, index) => <div key={`${item.product_name}-${item.order_note}-${index}`} className="flex justify-between gap-4 text-sm"><span>{item.quantity}x {item.product_name}</span><span className="whitespace-nowrap">Rp {Number(item.price * item.quantity).toLocaleString('id-ID')}</span></div>)}</div>
          <div className="mt-4 flex justify-between text-lg font-bold"><span>Total</span><span>Rp {Number(selected.total).toLocaleString('id-ID')}</span></div>
          {selected.payment_method.toLowerCase() === 'open_bill' && selected.status.toLowerCase() === 'pending' && <button disabled={closingId === selected.transaction_id} onClick={() => void closeBill(selected)} className="mt-5 w-full border border-emerald-600 bg-emerald-600 p-3 font-bold text-white shadow-sm hover:bg-emerald-700 disabled:opacity-50">{closingId === selected.transaction_id ? 'Closing...' : 'Close Open Bill'}</button>}
        </div>
      </div>}
    </div>
  );
}
