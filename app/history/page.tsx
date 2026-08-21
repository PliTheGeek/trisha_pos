'use client';

import { useState } from 'react';
import { ArrowLeft, Calendar, FileText, TrendingUp, Search, Filter, X, Receipt, CreditCard} from 'lucide-react';
import Link from 'next/link';

export default function HistoryInterface() {
  // ---------------- STATE ----------------
  const [searchQuery, setSearchQuery] = useState('');
  const [dateFilter, setDateFilter] = useState('Today'); // Today, This Month, All Time
  const [paymentFilter, setPaymentFilter] = useState('All'); // All, QRIS, Cash
  const [statusFilter, setStatusFilter] = useState('All'); // All, Paid, Voided
  
  const [selectedOrder, setSelectedOrder] = useState<any>(null); // Controls the Receipt Modal

  // ---------------- DUMMY DATA ----------------
  // Enriched with dates, items, and subtotals for the detailed view
  const logs = [
    { 
      id: '101', date: '21 Aug 2026', time: '10:15 AM', dateGroup: 'Today',
      subtotal: 70000, discount: 0, total: 70000, 
      method: 'QRIS', status: 'Paid', cashier: 'Trisha',
      items: [
        { qty: 2, name: 'V60 Filter', price: 70000, notes: '' },
      ]
    },
    { 
      id: '102', date: '21 Aug 2026', time: '10:30 AM', dateGroup: 'Today',
      subtotal: 55000, discount: 17000, total: 38000, 
      method: 'Cash', status: 'Paid', cashier: 'Trisha',
      items: [
        { qty: 1, name: 'Latte', price: 30000, notes: 'Iced, Oat Milk' },
        { qty: 1, name: 'Butter Croissant', price: 25000, notes: '' }
      ]
    },
    { 
      id: '098', date: '20 Aug 2026', time: '16:45 PM', dateGroup: 'This Month',
      subtotal: 35000, discount: 0, total: 35000, 
      method: 'QRIS', status: 'Paid', cashier: 'Trisha',
      items: [
        { qty: 1, name: 'V60 Filter', price: 35000, notes: 'Takeaway' },
      ]
    },
    { 
      id: '099', date: '20 Aug 2026', time: '17:05 PM', dateGroup: 'This Month',
      subtotal: 30000, discount: 0, total: 0, 
      method: '-', status: 'Voided', cashier: 'Trisha',
      items: [
        { qty: 1, name: 'Latte', price: 30000, notes: 'Hot' },
      ]
    },
  ];

  // ---------------- FILTER LOGIC ----------------
  const filteredLogs = logs.filter(log => {
    const matchesSearch = log.id.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesDate = dateFilter === 'All Time' || log.dateGroup === dateFilter;
    const matchesPayment = paymentFilter === 'All' || log.method === paymentFilter;
    const matchesStatus = statusFilter === 'All' || log.status === statusFilter;
    
    return matchesSearch && matchesDate && matchesPayment && matchesStatus;
  });

  // Recalculate top cards based on filtered data
  const totalRevenue = filteredLogs.filter(l => l.status === 'Paid').reduce((sum, l) => sum + l.total, 0);
  const totalTransactions = filteredLogs.length;

  return (
    <div className="min-h-screen bg-slate-50 p-6 text-slate-800 relative">
      
      {/* ---------------- RECEIPT MODAL ---------------- */}
      {selectedOrder && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-sm rounded-2xl shadow-2xl overflow-hidden flex flex-col">
            
            {/* Modal Header */}
            <div className="p-4 border-b border-slate-100 flex justify-between items-center bg-slate-50">
              <div className="flex items-center gap-2 text-slate-800">
                <Receipt size={20} className="text-slate-500"/>
                <h2 className="text-lg font-bold">Order #{selectedOrder.id}</h2>
              </div>
              <button onClick={() => setSelectedOrder(null)} className="p-2 bg-slate-200 hover:bg-slate-300 rounded-full transition-colors">
                <X size={18} />
              </button>
            </div>

            {/* Receipt Body */}
            <div className="p-6 overflow-y-auto bg-white">
              <div className="text-center mb-6">
                <h3 className="font-black text-xl tracking-tight text-slate-800">TRISHA SLOWBAR</h3>
                <p className="text-xs text-slate-500 mt-1">{selectedOrder.date} • {selectedOrder.time}</p>
                <p className="text-xs text-slate-500">Cashier: {selectedOrder.cashier}</p>
              </div>

              {/* Items List */}
              <div className="border-t border-b border-dashed border-slate-300 py-4 mb-4 flex flex-col gap-3">
                {selectedOrder.items.map((item: any, idx: number) => (
                  <div key={idx} className="flex justify-between items-start text-sm">
                    <div className="flex-1 pr-4">
                      <span className="font-bold text-slate-800">{item.qty}x {item.name}</span>
                      {item.notes && <p className="text-xs text-slate-500 mt-0.5">{item.notes}</p>}
                    </div>
                    <span className="font-medium text-slate-800">Rp {item.price.toLocaleString('id-ID')}</span>
                  </div>
                ))}
              </div>

              {/* Totals */}
              <div className="flex flex-col gap-1 text-sm mb-6">
                <div className="flex justify-between text-slate-600">
                  <span>Subtotal</span>
                  <span>Rp {selectedOrder.subtotal.toLocaleString('id-ID')}</span>
                </div>
                {selectedOrder.discount > 0 && (
                  <div className="flex justify-between text-emerald-600">
                    <span>Discount</span>
                    <span>- Rp {selectedOrder.discount.toLocaleString('id-ID')}</span>
                  </div>
                )}
                <div className="flex justify-between font-black text-lg text-slate-800 mt-2 pt-2 border-t border-slate-100">
                  <span>Total</span>
                  <span>Rp {selectedOrder.total.toLocaleString('id-ID')}</span>
                </div>
              </div>

              {/* Payment Status Badge */}
              <div className={`p-3 rounded-lg flex items-center justify-center gap-2 font-bold text-sm ${
                selectedOrder.status === 'Paid' ? 'bg-emerald-50 text-emerald-700 border border-emerald-100' : 'bg-red-50 text-red-700 border border-red-100'
              }`}>
                {selectedOrder.status === 'Paid' ? `PAID VIA ${selectedOrder.method}` : 'ORDER VOIDED'}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ---------------- MAIN LAYOUT ---------------- */}
      <header className="flex justify-between items-center mb-6">
        <div className="flex items-center gap-4">
          <Link href="/" className="p-2 bg-white border border-slate-200 rounded-lg hover:bg-slate-100 transition-colors">
            <ArrowLeft size={20} />
          </Link>
          <h1 className="text-2xl font-bold">Sales Overview</h1>
        </div>
        <div className="flex items-center gap-2 bg-white border border-slate-200 px-4 py-2 rounded-lg text-sm font-medium">
          <Calendar size={16} className="text-slate-400" />
          Today: 21 Aug 2026
        </div>
      </header>

      {/* Top Level Summary Cards (Now dynamic based on filters) */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
        <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
          <p className="text-sm font-semibold text-slate-500 mb-2 uppercase tracking-wide flex items-center gap-2">
            Gross Sales <span className="text-xs font-normal text-slate-400 normal-case">({dateFilter})</span>
          </p>
          <h2 className="text-3xl font-bold text-slate-800 flex items-center gap-2">
            Rp {totalRevenue.toLocaleString('id-ID')} <TrendingUp size={24} className="text-emerald-500" />
          </h2>
        </div>
        <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
          <p className="text-sm font-semibold text-slate-500 mb-2 uppercase tracking-wide">Total Transactions</p>
          <h2 className="text-3xl font-bold text-slate-800">{totalTransactions} Orders</h2>
        </div>
        <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm flex flex-col justify-center">
          <button className="w-full bg-blue-50 text-blue-700 font-semibold py-3 rounded-lg border border-blue-100 hover:bg-blue-100 transition-colors flex justify-center items-center gap-2">
            <FileText size={18} /> Export CSV Report
          </button>
        </div>
      </div>

      {/* ---------------- FILTERS & SEARCH BAR ---------------- */}
      <div className="bg-white p-4 rounded-t-xl border-x border-t border-slate-200 flex flex-col md:flex-row gap-4 justify-between items-center shadow-sm">
        
        {/* Search */}
        <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 px-3 py-2 rounded-lg w-full md:w-64">
          <Search size={18} className="text-slate-400" />
          <input 
            type="text" 
            placeholder="Search Order ID..." 
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="bg-transparent border-none outline-none text-sm w-full"
          />
        </div>

        {/* Filters */}
        <div className="flex gap-3 w-full md:w-auto overflow-x-auto pb-1 md:pb-0">
          
          <div className="flex items-center gap-2 border border-slate-200 rounded-lg px-3 py-2 bg-slate-50 shrink-0">
            <Calendar size={16} className="text-slate-500"/>
            <select value={dateFilter} onChange={(e) => setDateFilter(e.target.value)} className="bg-transparent text-sm font-medium outline-none cursor-pointer">
              <option value="Today">Today</option>
              <option value="This Month">This Month</option>
              <option value="All Time">All Time</option>
            </select>
          </div>

          <div className="flex items-center gap-2 border border-slate-200 rounded-lg px-3 py-2 bg-slate-50 shrink-0">
            <CreditCard size={16} className="text-slate-500"/>
            <select value={paymentFilter} onChange={(e) => setPaymentFilter(e.target.value)} className="bg-transparent text-sm font-medium outline-none cursor-pointer">
              <option value="All">All Payments</option>
              <option value="QRIS">QRIS</option>
              <option value="Cash">Cash</option>
            </select>
          </div>

          <div className="flex items-center gap-2 border border-slate-200 rounded-lg px-3 py-2 bg-slate-50 shrink-0">
            <Filter size={16} className="text-slate-500"/>
            <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="bg-transparent text-sm font-medium outline-none cursor-pointer">
              <option value="All">All Status</option>
              <option value="Paid">Paid Only</option>
              <option value="Voided">Voided Only</option>
            </select>
          </div>

        </div>
      </div>

      {/* ---------------- TRANSACTION TABLE ---------------- */}
      <div className="bg-white rounded-b-xl shadow-sm border border-slate-200 overflow-hidden">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="border-b border-slate-200 text-xs uppercase tracking-wider text-slate-500 bg-slate-50">
              <th className="p-4 font-semibold">Order ID</th>
              <th className="p-4 font-semibold">Date & Time</th>
              <th className="p-4 font-semibold">Cashier</th>
              <th className="p-4 font-semibold">Payment</th>
              <th className="p-4 font-semibold">Status</th>
              <th className="p-4 font-semibold text-right">Total</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 text-sm">
            {filteredLogs.length === 0 ? (
              <tr>
                <td colSpan={6} className="p-8 text-center text-slate-500">No transactions found matching your filters.</td>
              </tr>
            ) : (
              filteredLogs.map((log) => (
                <tr 
                  key={log.id} 
                  onClick={() => setSelectedOrder(log)}
                  className="hover:bg-slate-50 transition-colors cursor-pointer group"
                >
                  <td className="p-4 font-bold text-blue-600 group-hover:text-blue-700">#{log.id}</td>
                  <td className="p-4 text-slate-600">
                    <span className="font-medium text-slate-800 block">{log.date}</span>
                    <span className="text-xs">{log.time}</span>
                  </td>
                  <td className="p-4 text-slate-600">{log.cashier}</td>
                  <td className="p-4 text-slate-600 font-medium">
                    {log.method !== '-' && (
                      <span className="bg-slate-100 px-2 py-1 rounded text-xs">
                        {log.method}
                      </span>
                    )}
                  </td>
                  <td className="p-4">
                    <span className={`px-2 py-1 rounded-md text-xs font-bold ${
                      log.status === 'Paid' ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'
                    }`}>
                      {log.status}
                    </span>
                  </td>
                  <td className="p-4 text-right font-black text-slate-800">
                    Rp {log.total.toLocaleString('id-ID')}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

    </div>
  );
}