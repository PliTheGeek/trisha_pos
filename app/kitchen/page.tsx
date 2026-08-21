import { ArrowLeft, CheckCircle2, Clock, Coffee } from 'lucide-react';
import Link from 'next/link';

type OrderItem = {
  qty: number;
  name: string;
  note?: string;
};

type ActiveOrder = {
  id: string;
  table: string;
  time: string;
  waitTime: string;
  status: 'urgent' | 'normal';
  items: OrderItem[];
};

export default function KitchenInterface() {
  // Dummy incoming orders
  const activeOrders: ActiveOrder[] = [
    { 
      id: '101', 
      table: 'Table 4', 
      time: '10:15 AM', 
      waitTime: '4 min', 
      status: 'urgent', // custom flag for styling
      items: [
        { qty: 2, name: 'V60 Filter' }, 
        { qty: 1, name: 'Butter Croissant' }
      ] 
    },
    { 
      id: '102', 
      table: 'Takeaway', 
      time: '10:17 AM', 
      waitTime: '2 min', 
      status: 'normal',
      items: [
        { qty: 1, name: 'Japanese Iced', note: 'Less Ice' }
      ] 
    },
    { 
      id: '103', 
      table: 'Table 2', 
      time: '10:18 AM', 
      waitTime: '1 min', 
      status: 'normal',
      items: [
        { qty: 1, name: 'Latte', note: 'Oat Milk' },
        { qty: 1, name: 'Latte', note: 'Hot' }
      ] 
    }
  ];

  return (
    <div className="min-h-screen bg-slate-50 text-slate-800 p-6 flex flex-col h-screen">
      
      {/* Header (Matches the Management Page style) */}
      <header className="bg-white p-4 shadow-sm rounded-xl flex justify-between items-center mb-6 border border-slate-200">
        <div className="flex items-center gap-4">
          <Link href="/" className="p-2 bg-slate-100 rounded-lg hover:bg-slate-200 text-slate-600 transition-colors">
            <ArrowLeft size={20} />
          </Link>
          <div className="flex items-center gap-2">
            <Coffee className="text-slate-700" size={24} />
            <h1 className="text-xl font-bold tracking-tight">Barista Board</h1>
          </div>
        </div>
        
        {/* Live Indicator */}
        <div className="flex items-center gap-2 bg-blue-50 border border-blue-100 px-4 py-2 rounded-lg text-blue-700 font-bold tracking-widest text-sm shadow-sm">
          <span className="w-2.5 h-2.5 rounded-full bg-blue-500 animate-pulse shadow-[0_0_8px_rgba(59,130,246,0.8)]"></span>
          LIVE SYNC
        </div>
      </header>

      {/* Kanban Board Grid */}
      <div className="flex-1 overflow-y-auto">
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-6 pb-6">
          
          {activeOrders.map((order) => (
            <div 
              key={order.id} 
              className={`bg-white rounded-xl border flex flex-col shadow-sm transition-all ${
                order.status === 'urgent' 
                  ? 'border-red-200 shadow-[0_4px_12px_rgba(239,68,68,0.1)]' 
                  : 'border-slate-200'
              }`}
            >
              
              {/* Ticket Header */}
              <div className={`p-4 flex justify-between items-center border-b rounded-t-xl ${
                order.status === 'urgent' ? 'bg-red-50 border-red-100' : 'bg-slate-50 border-slate-100'
              }`}>
                <div>
                  <h2 className="font-bold text-xl text-slate-800">{order.table}</h2>
                  <span className="text-xs text-slate-500 font-medium">Order #{order.id}</span>
                </div>
                <div className={`flex items-center gap-1 font-mono font-bold px-2 py-1 rounded ${
                  order.status === 'urgent' ? 'text-red-600 bg-red-100' : 'text-amber-600 bg-amber-50'
                }`}>
                  <Clock size={16} />
                  <span>{order.waitTime}</span>
                </div>
              </div>

              {/* Ticket Items (The main content) */}
              <div className="p-5 flex-1">
                <ul className="space-y-4">
                  {order.items.map((item, idx) => (
                    <li key={idx} className="flex gap-4 items-start border-b border-slate-100 pb-4 last:border-0 last:pb-0">
                      {/* Quantity Badge */}
                      <span className="bg-slate-800 text-white font-bold px-3 py-1.5 rounded-lg text-lg shadow-sm">
                        {item.qty}
                      </span>
                      
                      {/* Item Details */}
                      <div className="flex-1 pt-0.5">
                        <p className="text-lg font-bold text-slate-800 leading-none">{item.name}</p>
                        
                        {/* Modifiers (if any exist) */}
                        {item.note && (
                          <p className="text-sm font-semibold text-blue-600 mt-2 bg-blue-50 inline-block px-2.5 py-1 rounded-md border border-blue-100">
                            + {item.note}
                          </p>
                        )}
                      </div>
                    </li>
                  ))}
                </ul>
              </div>

              {/* Kitchen Action Button */}
              <div className="p-4 bg-slate-50 border-t border-slate-100 rounded-b-xl">
                <button className="w-full bg-slate-800 hover:bg-slate-900 text-white font-bold py-3.5 rounded-lg flex justify-center items-center gap-2 transition-colors shadow-sm">
                  <CheckCircle2 size={20} />
                  Mark as Done
                </button>
              </div>

            </div>
          ))}

        </div>
      </div>
    </div>
  );
}