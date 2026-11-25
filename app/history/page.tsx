'use client';

import { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, Banknote, Check, CreditCard, Download, MessageCircle, Plus, Printer, QrCode, Receipt, X } from 'lucide-react';
import Link from 'next/link';
import { cancelOpenBill, listTransactions, payOpenBill, type OpenBillPaymentInput } from '@/app/actions/transactions';

type Period = 'daily' | 'monthly' | 'annual' | 'date';
type PresetPeriod = Exclude<Period, 'date'>;
type Transaction = {
  transaction_id: string;
  created_at: string;
  status: string;
  payment_method: string;
  order_type: 'dine_in' | 'takeaway' | 'delivery';
  scan_payment_preference: 'cash' | 'qris' | 'card' | null;
  subtotal: number;
  discount_total: number;
  total: number;
  customer_name: string | null;
  customer_contact: string | null;
  contacts?: { contact_id: string; name: string; phone: string } | null;
  transaction_items: { product_name: string; quantity: number; price: number; order_note: string }[];
  transaction_payments: { method: string; amount: number; cash_received: number }[];
};

type PaymentMethod = OpenBillPaymentInput['method'];

const paymentOptions: { method: PaymentMethod; label: string; Icon: typeof Banknote }[] = [
  { method: 'cash', label: 'Cash', Icon: Banknote },
  { method: 'qris', label: 'QRIS', Icon: QrCode },
  { method: 'card', label: 'Other', Icon: CreditCard },
];

function periodBounds(period: PresetPeriod) {
  const now = new Date();
  const start = new Date(now.getFullYear(), period === 'annual' ? 0 : period === 'monthly' ? now.getMonth() : now.getMonth(), period === 'daily' ? now.getDate() : 1);
  const end = period === 'annual'
    ? new Date(now.getFullYear() + 1, 0, 1)
    : period === 'monthly'
      ? new Date(now.getFullYear(), now.getMonth() + 1, 1)
      : new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
  return { from: start.toISOString(), to: end.toISOString() };
}

function dateBounds(date: string) {
  const [year, month, day] = date.split('-').map(Number);
  const start = new Date(year, month - 1, day);
  const end = new Date(year, month - 1, day + 1);
  return { from: start.toISOString(), to: end.toISOString() };
}

function localDateValue(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function csvCell(value: string | number) {
  return `"${String(value).replaceAll('"', '""')}"`;
}

function formatPaymentMethod(method: string) {
  if (method === 'card') return 'Other';
  return method.replaceAll('_', ' ').toUpperCase();
}

function paymentSummary(transaction: Transaction) {
  if (transaction.transaction_payments?.length) {
    return transaction.transaction_payments
      .map(payment => `${formatPaymentMethod(payment.method)} Rp ${Number(payment.amount).toLocaleString('id-ID')}`)
      .join(' + ');
  }
  if (transaction.payment_method.toLowerCase() === 'open_bill' && transaction.scan_payment_preference) {
    return `OPEN BILL · PREFERS ${formatPaymentMethod(transaction.scan_payment_preference)}`;
  }
  return formatPaymentMethod(transaction.payment_method);
}

function formatOrderType(orderType: Transaction['order_type']) {
  if (orderType === 'delivery') return 'Delivery';
  return orderType === 'takeaway' ? 'Takeaway' : 'Dine in';
}

function formatReceiptText(tx: Transaction) {
  const date = new Date(tx.created_at).toLocaleString('id-ID');
  const contactName = tx.contacts?.name || tx.customer_name;
  const lines: string[] = [
    '================================',
    '       *TRISHA COFFEA*',
    '================================',
    `Tanggal : ${date}`,
    `Bayar   : ${paymentSummary(tx)}`,
    `Status  : ${tx.status.toUpperCase()}`,
  ];
  if (contactName) lines.push(`Pelanggan: ${contactName}`);
  lines.push('--------------------------------');
  tx.transaction_items.forEach(item => {
    lines.push(`${item.quantity}x ${item.product_name}`);
    lines.push(`   Rp ${Number(item.price * item.quantity).toLocaleString('id-ID')}`);
    if (item.order_note) lines.push(`   Note: ${item.order_note}`);
  });
  lines.push('--------------------------------');
  lines.push(`Subtotal : Rp ${Number(tx.subtotal).toLocaleString('id-ID')}`);
  if (Number(tx.discount_total) > 0) {
    lines.push(`Diskon   : -Rp ${Number(tx.discount_total).toLocaleString('id-ID')}`);
  }
  lines.push(`*TOTAL   : Rp ${Number(tx.total).toLocaleString('id-ID')}*`);
  lines.push('================================');
  lines.push('  Terima kasih sudah berkunjung!');
  lines.push('        *Trisha Coffea*');
  lines.push('================================');
  return lines.join('\n');
}

function sendWhatsApp(phone: string, text: string) {
  let normalized = phone.replace(/\D/g, '');
  if (normalized.startsWith('0')) normalized = `62${normalized.slice(1)}`;
  else if (!normalized.startsWith('62')) normalized = `62${normalized}`;
  window.open(`https://wa.me/${normalized}?text=${encodeURIComponent(text)}`, '_blank');
}

export default function HistoryInterface() {
  const [period, setPeriod] = useState<Period>('daily');
  const [selectedDate, setSelectedDate] = useState(() => localDateValue(new Date()));
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [selected, setSelected] = useState<Transaction | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [closingId, setClosingId] = useState<string | null>(null);
  const [paymentTarget, setPaymentTarget] = useState<Transaction | null>(null);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('cash');
  const [cashReceived, setCashReceived] = useState<number | ''>('');
  const [isSplitMode, setIsSplitMode] = useState(false);
  const [splitPayments, setSplitPayments] = useState<OpenBillPaymentInput[]>([]);
  const [splitMethod, setSplitMethod] = useState<PaymentMethod>('cash');
  const [splitAmount, setSplitAmount] = useState<number | ''>('');
  const [splitCashReceived, setSplitCashReceived] = useState<number | ''>('');
  const [settlementError, setSettlementError] = useState('');
  const [settling, setSettling] = useState(false);

  async function load(bounds = period === 'date' ? dateBounds(selectedDate) : periodBounds(period)) {
    setLoading(true);
    setError('');
    try {
      setTransactions(await listTransactions({ limit: 1000, ...bounds }) as Transaction[]);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Failed to load transactions.');
    } finally {
      setLoading(false);
    }
  }

  // Loading is intentionally started after the page mounts.
  // eslint-disable-next-line react-hooks/set-state-in-effect, react-hooks/exhaustive-deps
  useEffect(() => { void load(); }, []);

  const total = useMemo(() => transactions.reduce(
    (sum, item) => item.status.toLowerCase() === 'paid' ? sum + Number(item.total) : sum,
    0
  ), [transactions]);
  const openBills = useMemo(() => transactions.filter(item =>
    item.payment_method.toLowerCase() === 'open_bill' && item.status.toLowerCase() === 'pending').length, [transactions]);

  function startPayment(transaction: Transaction) {
    setPaymentTarget(transaction);
    setPaymentMethod('cash');
    setCashReceived('');
    setIsSplitMode(false);
    setSplitPayments([]);
    setSplitMethod('cash');
    setSplitAmount('');
    setSplitCashReceived('');
    setSettlementError('');
    setSelected(null);
  }

  const splitPaid = splitPayments.reduce((sum, payment) => sum + payment.amount, 0);
  const splitRemaining = Math.max(0, Number(paymentTarget?.total ?? 0) - splitPaid);
  const pendingSplitAmount = splitAmount === '' ? splitRemaining : Number(splitAmount);
  const pendingSplitCashReceived = splitCashReceived === '' ? pendingSplitAmount : Number(splitCashReceived);
  const canAddSplit = pendingSplitAmount > 0
    && pendingSplitAmount <= splitRemaining
    && (splitMethod !== 'cash' || pendingSplitCashReceived >= pendingSplitAmount);

  function addSplitPayment() {
    if (!canAddSplit) return;
    setSplitPayments(current => [...current, {
      method: splitMethod,
      amount: pendingSplitAmount,
      cash_received: splitMethod === 'cash' ? pendingSplitCashReceived : 0,
    }]);
    setSplitAmount('');
    setSplitCashReceived('');
  }

  async function submitOpenBillPayment() {
    if (!paymentTarget) return;
    const payments = isSplitMode
      ? splitPayments
      : [{
          method: paymentMethod,
          amount: Number(paymentTarget.total),
          cash_received: paymentMethod === 'cash' ? Number(cashReceived || 0) : 0,
        }];
    if (isSplitMode && (splitRemaining > 0 || !splitPayments.length)) return;
    if (!isSplitMode && paymentMethod === 'cash' && Number(cashReceived) < Number(paymentTarget.total)) return;

    setSettling(true);
    setSettlementError('');
    try {
      await payOpenBill(paymentTarget.transaction_id, payments);
      const updatedPaymentMethod = payments.length > 1 ? 'split' : payments[0].method;
      const updated = {
        ...paymentTarget,
        payment_method: updatedPaymentMethod,
        status: 'paid',
        transaction_payments: payments,
      };
      setTransactions(current => current.map(item => item.transaction_id === updated.transaction_id ? updated : item));
      setSelected(updated);
      setPaymentTarget(null);
    } catch (paymentError) {
      setSettlementError(paymentError instanceof Error ? paymentError.message : 'Failed to record payment.');
    } finally {
      setSettling(false);
    }
  }

  async function cancelBill(transaction: Transaction) {
    if (!window.confirm(`Cancel open bill #${transaction.transaction_id.slice(0, 8)}?`)) return;
    setClosingId(transaction.transaction_id);
    setError('');
    try {
      const updated = await cancelOpenBill(transaction.transaction_id);
      setTransactions(current => current.map(item => item.transaction_id === updated.transaction_id
        ? { ...item, status: updated.status }
        : item));
      setSelected(current => {
        if (!current || current.transaction_id !== updated.transaction_id) return current;
        return { ...current, status: String(updated.status) };
      });
    } catch (closeError) {
      setError(closeError instanceof Error ? closeError.message : 'Failed to cancel open bill.');
    } finally {
      setClosingId(null);
    }
  }

  function exportCsv() {
    const rows = [
      ['Transaction ID', 'Date', 'Order Name', 'Phone', 'Order Type', 'Payment', 'Payment Preference', 'Status', 'Subtotal', 'Discount', 'Total', 'Items'],
      ...transactions.map(item => [
        item.transaction_id,
        new Date(item.created_at).toLocaleString('id-ID'),
        item.contacts?.name ?? item.customer_name ?? '',
        item.contacts?.phone ?? item.customer_contact ?? '',
        formatOrderType(item.order_type),
        item.transaction_payments?.map(payment =>
          `${formatPaymentMethod(payment.method)} Rp ${Number(payment.amount).toLocaleString('id-ID')}`
        ).join('; ') || formatPaymentMethod(item.payment_method),
        item.scan_payment_preference ? formatPaymentMethod(item.scan_payment_preference) : '',
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
    link.download = `transactions-${period === 'date' ? selectedDate : period}-${localDateValue(new Date())}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }

  function handleSendWhatsApp(tx: Transaction) {
    const phone = tx.contacts?.phone || tx.customer_contact;
    if (!phone) {
      alert('Transaksi ini tidak memiliki nomor kontak. Tambahkan kontak saat membuat order.');
      return;
    }
    sendWhatsApp(phone, formatReceiptText(tx));
  }

  return (
    <div className="min-h-screen bg-slate-50 p-4 text-slate-800 sm:p-6">
      <header className="mx-auto mb-6 flex max-w-7xl flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <Link href="/" className="border border-slate-200 bg-white p-2.5 shadow-sm transition hover:bg-slate-100"><ArrowLeft size={20} /></Link>
          <div><p className="text-xs font-semibold uppercase tracking-widest text-slate-400">Reports</p><h1 className="text-xl font-bold">Transaction Logs</h1></div>
        </div>
        <div className="flex flex-wrap gap-2">
          <select value={period} onChange={event => { const next = event.target.value as Period; setPeriod(next); void load(next === 'date' ? dateBounds(selectedDate) : periodBounds(next)); }} className="border border-slate-200 bg-white px-3 py-2 text-sm font-medium outline-none shadow-sm focus:border-blue-500">
            <option value="daily">Today</option><option value="monthly">This month</option><option value="annual">This year</option><option value="date">Selected date</option>
          </select>
          <label className="flex items-center gap-2 border border-slate-200 bg-white px-3 py-2 text-sm font-medium shadow-sm focus-within:border-blue-500">
            <span className="text-slate-500">Date</span>
            <input
              type="date"
              value={selectedDate}
              onChange={event => {
                if (!event.target.value) return;
                setSelectedDate(event.target.value);
                setPeriod('date');
                void load(dateBounds(event.target.value));
              }}
              className="min-w-0 bg-transparent outline-none"
              aria-label="Filter transaction history by date"
            />
          </label>
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
          <div className="flex items-center justify-between border-b px-4 py-4 sm:px-5"><div><h2 className="font-bold">Sales activity</h2><p className="text-xs text-slate-400">Showing {period === 'date' ? `records for ${selectedDate}` : period} records</p></div>{loading && <span className="text-sm text-slate-400">Loading...</span>}</div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[950px] text-left text-sm">
              <thead><tr className="border-b bg-slate-50 text-xs uppercase tracking-wide text-slate-500"><th className="px-5 py-3">Date</th><th className="px-5 py-3">Order</th><th className="px-5 py-3">Type</th><th className="px-5 py-3">Payment</th><th className="px-5 py-3">Status</th><th className="px-5 py-3 text-right">Total</th><th className="px-5 py-3 text-right">Details</th></tr></thead>
              <tbody>
                {!loading && !transactions.length && <tr><td colSpan={7} className="px-5 py-12 text-center text-slate-400">No transactions in this period.</td></tr>}
                {transactions.map(transaction => {
                  const isOpenBill = transaction.payment_method.toLowerCase() === 'open_bill';
                  const isPending = transaction.status.toLowerCase() === 'pending';
                  const isVoided = transaction.status.toLowerCase() === 'voided';
                  const displayName = transaction.contacts?.name || transaction.customer_name || 'Walk-in';
                  const displayPhone = transaction.contacts?.phone || transaction.customer_contact;
                  return <tr key={transaction.transaction_id} className="border-b last:border-0 hover:bg-slate-50">
                    <td className="whitespace-nowrap px-5 py-4">{new Date(transaction.created_at).toLocaleString('id-ID')}</td>
                    <td className="px-5 py-4"><div className="font-medium">{displayName}</div>{displayPhone && <div className="text-xs text-slate-400">{displayPhone}</div>}</td>
                    <td className="px-5 py-4">{formatOrderType(transaction.order_type)}</td>
                    <td className="px-5 py-4 font-medium">{paymentSummary(transaction)}</td>
                    <td className="px-5 py-4"><span className={`border px-2.5 py-1 text-xs font-semibold ${isPending ? 'border-amber-200 bg-amber-100 text-amber-700' : isVoided ? 'border-red-200 bg-red-100 text-red-700' : 'border-emerald-200 bg-emerald-100 text-emerald-700'}`}>{transaction.status}</span></td>
                    <td className="px-5 py-4 text-right font-bold">Rp {Number(transaction.total).toLocaleString('id-ID')}</td>
                    <td className="px-5 py-4 text-right"><div className="flex justify-end gap-2">
                      {isOpenBill && isPending && <button onClick={() => startPayment(transaction)} className="inline-flex items-center gap-1 border border-emerald-600 bg-emerald-600 px-2.5 py-1.5 text-xs font-bold text-white shadow-sm hover:bg-emerald-700"><Check size={14} />Pay</button>}
                      {isOpenBill && isPending && <button onClick={() => void cancelBill(transaction)} disabled={closingId === transaction.transaction_id} className="inline-flex items-center gap-1 border border-red-200 bg-white px-2.5 py-1.5 text-xs font-bold text-red-600 shadow-sm hover:bg-red-50 disabled:opacity-50">{closingId === transaction.transaction_id ? 'Cancelling' : 'Cancel'}</button>}
                      {displayPhone && <button aria-label="Send WhatsApp receipt" onClick={() => handleSendWhatsApp(transaction)} className="border border-emerald-200 p-2 text-emerald-600 shadow-sm hover:bg-emerald-50"><MessageCircle size={18} /></button>}
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
          <div className="mb-4 border-b pb-4 text-sm">
            <p><span className="font-semibold">Order:</span> {selected.contacts?.name || selected.customer_name || 'Walk-in'}</p>
            {(selected.contacts?.phone || selected.customer_contact) && <p><span className="font-semibold">Phone:</span> {selected.contacts?.phone || selected.customer_contact}</p>}
            <p><span className="font-semibold">Type:</span> {formatOrderType(selected.order_type)}</p>
            {selected.scan_payment_preference && <p><span className="font-semibold">Payment preference (at order):</span> {formatPaymentMethod(selected.scan_payment_preference)}</p>}
          </div>
          <div className="space-y-3 border-b pb-4">{selected.transaction_items.map((item, index) => <div key={`${item.product_name}-${item.order_note}-${index}`} className="flex justify-between gap-4 text-sm"><div><p>{item.quantity}x {item.product_name}</p>{item.order_note && <p className="text-xs text-slate-400">{item.order_note}</p>}</div><span className="whitespace-nowrap">Rp {Number(item.price * item.quantity).toLocaleString('id-ID')}</span></div>)}</div>
          <div className="mt-4 space-y-1 text-sm">
            <div className="flex justify-between"><span>Subtotal</span><span>Rp {Number(selected.subtotal).toLocaleString('id-ID')}</span></div>
            <div className="flex justify-between"><span>Discount</span><span>- Rp {Number(selected.discount_total).toLocaleString('id-ID')}</span></div>
          </div>
          <div className="mt-4 flex justify-between text-lg font-bold"><span>Total</span><span>Rp {Number(selected.total).toLocaleString('id-ID')}</span></div>
          <div className="mt-4 border-t pt-3">
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">Payment</p>
            {selected.transaction_payments?.length
              ? selected.transaction_payments.map((payment, index) => <div key={`${payment.method}-${index}`} className="flex justify-between gap-4 text-sm">
                  <span>{formatPaymentMethod(payment.method)}{payment.method === 'cash' && payment.cash_received > payment.amount ? ` (received Rp ${Number(payment.cash_received).toLocaleString('id-ID')}, change Rp ${Number(payment.cash_received - payment.amount).toLocaleString('id-ID')})` : ''}</span>
                  <span className="whitespace-nowrap">Rp {Number(payment.amount).toLocaleString('id-ID')}</span>
                </div>)
              : <p className="text-sm">{formatPaymentMethod(selected.payment_method)}</p>}
          </div>
          {selected.payment_method.toLowerCase() === 'open_bill' && selected.status.toLowerCase() === 'pending' && (
            <div className="mt-5 grid grid-cols-2 gap-2">
              <button onClick={() => startPayment(selected)} className="border border-emerald-600 bg-emerald-600 p-3 font-bold text-white shadow-sm hover:bg-emerald-700">Pay Open Bill</button>
              <button disabled={closingId === selected.transaction_id} onClick={() => void cancelBill(selected)} className="border border-red-200 bg-white p-3 font-bold text-red-600 shadow-sm hover:bg-red-50 disabled:opacity-50">{closingId === selected.transaction_id ? 'Cancelling...' : 'Cancel Bill'}</button>
            </div>
          )}
        </div>
      </div>}

      {paymentTarget && <div className="fixed inset-0 z-20 flex items-center justify-center bg-slate-900/60 p-4" onClick={() => !settling && setPaymentTarget(null)}>
        <div className="flex max-h-[95vh] w-full max-w-lg flex-col overflow-hidden rounded-xl bg-white shadow-2xl" onClick={event => event.stopPropagation()}>
          <div className="flex items-start justify-between border-b bg-slate-50 p-5">
            <div>
              <p className="text-xs font-bold uppercase tracking-widest text-slate-400">Settle open bill</p>
              <h2 className="mt-1 font-bold">{paymentTarget.contacts?.name || paymentTarget.customer_name || 'Walk-in'} · {formatOrderType(paymentTarget.order_type)}</h2>
              {(paymentTarget.contacts?.phone || paymentTarget.customer_contact) && <p className="text-xs text-slate-500">{paymentTarget.contacts?.phone || paymentTarget.customer_contact}</p>}
            </div>
            <button disabled={settling} onClick={() => setPaymentTarget(null)} className="border border-slate-200 p-1 text-slate-400 hover:bg-slate-100 disabled:opacity-50"><X size={20} /></button>
          </div>
          <div className="overflow-y-auto p-5">
            <p className="mb-4 text-center text-xs font-bold uppercase tracking-widest text-slate-500">Total Amount Due</p>
            <p className="mb-5 text-center text-4xl font-black text-blue-600">Rp {Number(paymentTarget.total).toLocaleString('id-ID')}</p>
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-sm font-bold uppercase tracking-wide text-slate-800">Select Payment Method</h3>
              <button
                type="button"
                disabled={settling}
                onClick={() => {
                  setIsSplitMode(value => !value);
                  setSplitPayments([]);
                  setSplitAmount('');
                  setSplitCashReceived('');
                }}
                className={`rounded-full border px-3 py-1 text-xs font-bold ${isSplitMode ? 'border-slate-800 bg-slate-800 text-white' : 'border-slate-200 text-slate-600 hover:bg-slate-50'}`}
              >
                Split Bill
              </button>
            </div>

            {!isSplitMode ? <>
              <div className="grid grid-cols-3 gap-3">
                {paymentOptions.map(({ method, label, Icon }) => (
                  <button
                    key={method}
                    type="button"
                    disabled={settling}
                    onClick={() => setPaymentMethod(method)}
                    className={`flex flex-col items-center gap-2 rounded-xl border-2 p-4 text-sm font-bold transition-colors disabled:opacity-50 ${paymentMethod === method ? 'border-blue-500 bg-blue-50 text-blue-700' : 'border-slate-200 text-slate-600 hover:border-slate-300'}`}
                  >
                    <Icon size={26} />{label}
                  </button>
                ))}
              </div>
              {paymentMethod === 'cash' && (
                <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-4">
                  <label className="mb-2 block text-xs font-bold uppercase tracking-wide text-slate-500">Cash Received</label>
                  <input
                    type="number"
                    min={Number(paymentTarget.total)}
                    value={cashReceived}
                    placeholder={String(paymentTarget.total)}
                    onChange={event => setCashReceived(event.target.value === '' ? '' : Number(event.target.value))}
                    className="w-full rounded-lg border border-slate-300 bg-white p-3 text-xl font-bold outline-none focus:border-emerald-500"
                  />
                  <p className="mt-2 text-right text-sm font-semibold text-slate-600">Change: Rp {Math.max(0, Number(cashReceived || 0) - Number(paymentTarget.total)).toLocaleString('id-ID')}</p>
                </div>
              )}
            </> : <>
              <div className="grid grid-cols-3 gap-3">
                {paymentOptions.map(({ method, label, Icon }) => (
                  <button
                    key={method}
                    type="button"
                    disabled={settling}
                    onClick={() => setSplitMethod(method)}
                    className={`flex flex-col items-center gap-2 rounded-xl border-2 p-3 text-sm font-bold transition-colors disabled:opacity-50 ${splitMethod === method ? 'border-blue-500 bg-blue-50 text-blue-700' : 'border-slate-200 text-slate-600 hover:border-slate-300'}`}
                  >
                    <Icon size={24} />{label}
                  </button>
                ))}
              </div>
              {splitRemaining > 0 && <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-4">
                <label className="mb-2 block text-xs font-bold uppercase tracking-wide text-slate-500">Payment Amount</label>
                <input
                  type="number"
                  min={1}
                  max={splitRemaining}
                  value={splitAmount}
                  placeholder={String(splitRemaining)}
                  onChange={event => setSplitAmount(event.target.value === '' ? '' : Number(event.target.value))}
                  className="mb-3 w-full rounded-lg border border-slate-300 bg-white p-3 text-xl font-bold outline-none focus:border-blue-500"
                />
                {splitMethod === 'cash' && <>
                  <label className="mb-2 block text-xs font-bold uppercase tracking-wide text-slate-500">Cash Received</label>
                  <input
                    type="number"
                    min={pendingSplitAmount}
                    value={splitCashReceived}
                    placeholder={String(pendingSplitAmount)}
                    onChange={event => setSplitCashReceived(event.target.value === '' ? '' : Number(event.target.value))}
                    className="w-full rounded-lg border border-slate-300 bg-white p-3 text-xl font-bold outline-none focus:border-emerald-500"
                  />
                  <p className="mt-2 text-right text-sm font-semibold text-slate-600">Change: Rp {Math.max(0, pendingSplitCashReceived - pendingSplitAmount).toLocaleString('id-ID')}</p>
                </>}
                <button type="button" disabled={!canAddSplit || settling} onClick={addSplitPayment} className="mt-3 flex w-full items-center justify-center gap-2 rounded-lg bg-slate-800 py-3 font-bold text-white disabled:bg-slate-300"><Plus size={16} /> Add Payment</button>
              </div>}
              {splitPayments.length > 0 && <div className="mt-3 space-y-2">
                {splitPayments.map((payment, index) => <div key={`${payment.method}-${index}`} className="flex items-center justify-between rounded-lg border border-slate-200 bg-white p-3 text-sm">
                  <div className="flex items-center gap-2">
                    <button type="button" disabled={settling} onClick={() => setSplitPayments(current => current.filter((_, itemIndex) => itemIndex !== index))} className="text-slate-400 hover:text-red-500"><X size={16} /></button>
                    <span className="font-semibold">{paymentOptions.find(option => option.method === payment.method)?.label}</span>
                  </div>
                  <span className="font-bold">Rp {payment.amount.toLocaleString('id-ID')}</span>
                </div>)}
              </div>}
              <div className="mt-3 flex justify-between rounded-lg bg-slate-50 p-3 text-sm">
                <span className="font-semibold">Remaining</span>
                <span className={`font-black ${splitRemaining ? 'text-red-500' : 'text-emerald-600'}`}>Rp {splitRemaining.toLocaleString('id-ID')}</span>
              </div>
            </>}

            {settlementError && <p className="mt-4 border border-red-200 bg-red-50 p-3 text-sm text-red-700">{settlementError}</p>}
            <button
              type="button"
              disabled={settling || (isSplitMode
                ? splitRemaining > 0 || !splitPayments.length
                : paymentMethod === 'cash' && Number(cashReceived) < Number(paymentTarget.total))}
              onClick={() => void submitOpenBillPayment()}
              className="mt-5 w-full rounded-lg bg-emerald-600 py-3 font-bold text-white hover:bg-emerald-700 disabled:bg-slate-300"
            >
              {settling ? 'Saving Payment...' : 'Confirm Payment'}
            </button>
          </div>
        </div>
      </div>}
    </div>
  );
}