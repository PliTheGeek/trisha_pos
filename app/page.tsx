'use client';

import { useState } from 'react';
import { Coffee, Croissant, Search, ShoppingBag, Trash2, User, X, Tag, Store, History, Settings, Flame, Menu, Banknote, QrCode, CreditCard, Bell } from 'lucide-react';
import Link from 'next/link';

export default function PosInterface() {

  // ---------------- DATA ----------------
  const menuItems = [
    { id: 'M001', name: 'V60 Filter', price: 35000, category: 'Coffee' },
    { 
      id: 'M002', name: 'Latte', price: 30000, category: 'Coffee',
      options: [
        { group: 'Temperature', choices: [{ name: 'Hot', addPrice: 0 }, { name: 'Iced', addPrice: 3000 }] },
        { group: 'Milk Type', choices: [{ name: 'Fresh Milk', addPrice: 0 }, { name: 'Oat Milk', addPrice: 8000 }] }
      ]
    },
    { id: 'M003', name: 'Butter Croissant', price: 25000, category: 'Snack' },
  ];

  const availableDiscounts = [
    { id: 'D001', name: 'Opening Promo', type: 'percentage', value: 10 },
    { id: 'D002', name: 'Staff Meal', type: 'percentage', value: 50 },
    { id: 'D003', name: 'BYO Cup', type: 'flat', value: 5000 },
  ];

  // Dummy incoming QR orders waiting for payment/cashier action
  const [pendingQrOrders, setPendingQrOrders] = useState([
    { id: '104', table: 'Table 4', customer: 'Budi', total: 30000, items: '1x Latte' }
  ]);

  // ---------------- STATE ----------------
  const [cart, setCart] = useState<any[]>([]); 
  const [appliedDiscounts, setAppliedDiscounts] = useState<any[]>([]); 
  const [activeCategory, setActiveCategory] = useState('All');
  
  // Modals & Drawers
  const [selectedItem, setSelectedItem] = useState<any>(null); 
  const [tempOptions, setTempOptions] = useState<any>({}); 
  const [isDiscountModalOpen, setIsDiscountModalOpen] = useState(false); 
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false); 
  const [isCheckoutModalOpen, setIsCheckoutModalOpen] = useState(false);
  const [cashGiven, setCashGiven] = useState<number | ''>('');
  
  // Notification Dropdown State
  const [isNotifOpen, setIsNotifOpen] = useState(false);

  // ---------------- ACTIONS ----------------
  const handleProductClick = (item: any) => {
    if (item.options && item.options.length > 0) {
      setSelectedItem(item);
      setTempOptions({}); 
    } else addToCart(item, {});
  };

  const handleOptionSelect = (groupName: string, choice: any) => {
    setTempOptions({ ...tempOptions, [groupName]: choice });
  };

  const addToCart = (item: any, selectedModifiers: any) => {
    let finalPrice = item.price;
    let notes: string[] = [];
    Object.values(selectedModifiers).forEach((mod: any) => {
      finalPrice += mod.addPrice;
      if (mod.name !== 'Hot' && mod.name !== 'Fresh Milk') notes.push(mod.name);
    });
    setCart([...cart, { cartId: Math.random().toString(), id: item.id, name: item.name, finalPrice, notes: notes.join(', ') }]);
    setSelectedItem(null); 
  };

  const removeFromCart = (cartId: string) => {
    setCart(cart.filter(item => item.cartId !== cartId));
  };

  const toggleDiscount = (discount: any) => {
    const isAlreadyApplied = appliedDiscounts.some(d => d.id === discount.id);
    if (isAlreadyApplied) setAppliedDiscounts(appliedDiscounts.filter(d => d.id !== discount.id));
    else setAppliedDiscounts([...appliedDiscounts, discount]);
  };

  const removeDiscount = (discountId: string) => {
    setAppliedDiscounts(appliedDiscounts.filter(d => d.id !== discountId));
  };

  const submitOrder = (paymentMethod: string) => {
    alert(`Order saved to database! Paid via ${paymentMethod}.`);
    setCart([]);
    setAppliedDiscounts([]);
    setIsCheckoutModalOpen(false);
    setCashGiven('');
  };

  // Pull a pending QR order directly into the cashier's cart to check out
  const loadQrOrderToCart = (order: any) => {
    setCart([{
      cartId: Math.random().toString(),
      id: 'QR',
      name: order.items,
      finalPrice: order.total,
      notes: `QR Order - ${order.customer} (${order.table})`
    }]);
    setPendingQrOrders(pendingQrOrders.filter(o => o.id !== order.id));
    setIsNotifOpen(false);
  };

  // ---------------- MATH LOGIC ----------------
  const subtotal = cart.reduce((sum, item) => sum + item.finalPrice, 0);
  let totalDiscountAmount = 0;
  appliedDiscounts.forEach(disc => {
    if (disc.type === 'flat') totalDiscountAmount += disc.value;
    else if (disc.type === 'percentage') totalDiscountAmount += (subtotal * (disc.value / 100));
  });
  if (totalDiscountAmount > subtotal) totalDiscountAmount = subtotal;
  const finalTotal = subtotal - totalDiscountAmount;

  return (
    <div className="flex flex-col md:flex-row h-screen bg-slate-50 text-slate-800 relative">
      
      {/* MOBILE DRAWER */}
      {isMobileMenuOpen && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-50 md:hidden flex" onClick={() => setIsMobileMenuOpen(false)}>
          <div className="w-64 bg-white h-full shadow-2xl flex flex-col" onClick={e => e.stopPropagation()}>
            <div className="p-4 border-b border-slate-100 flex justify-between items-center bg-slate-50">
              <h2 className="font-black text-slate-800 flex items-center gap-2"><Coffee className="text-blue-600" size={20} /> TRISHA CAFE</h2>
              <button onClick={() => setIsMobileMenuOpen(false)} className="p-2 text-slate-400 hover:text-slate-600 bg-slate-200 rounded-full"><X size={16} /></button>
            </div>
            <div className="p-4 flex flex-col gap-2">
              <Link href="/" className="p-3 rounded-lg bg-blue-50 text-blue-700 font-bold flex items-center gap-3"><Store size={20}/> POS</Link>
              <Link href="/history" className="p-3 rounded-lg text-slate-600 hover:bg-slate-50 font-bold flex items-center gap-3"><History size={20}/> LOGS</Link>
              <Link href="/manage" className="p-3 rounded-lg text-slate-600 hover:bg-slate-50 font-bold flex items-center gap-3"><Settings size={20}/> EDIT</Link>
              <hr className="my-2 border-slate-100"/>
              <Link href="/kitchen" className="p-3 rounded-lg text-slate-600 hover:bg-orange-50 hover:text-orange-600 font-bold flex items-center gap-3"><Flame size={20}/> KDS</Link>
            </div>
          </div>
        </div>
      )}

      {/* MODALS */}
      {selectedItem && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-md rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
            <div className="p-4 border-b border-slate-100 flex justify-between items-center bg-slate-50">
              <h2 className="text-xl font-bold">{selectedItem.name}</h2>
              <button onClick={() => setSelectedItem(null)} className="p-2 bg-slate-200 hover:bg-slate-300 rounded-full transition-colors"><X size={20} /></button>
            </div>
            <div className="p-6 overflow-y-auto flex-1">
              {selectedItem.options.map((optionGroup: any, index: number) => (
                <div key={index} className="mb-6 last:mb-0">
                  <h3 className="text-sm font-bold text-slate-800 uppercase tracking-wider mb-3">{optionGroup.group}</h3>
                  <div className="flex flex-col gap-2">
                    {optionGroup.choices.map((choice: any, cIdx: number) => {
                      const isSelected = tempOptions[optionGroup.group]?.name === choice.name;
                      return (
                        <button key={cIdx} onClick={() => handleOptionSelect(optionGroup.group, choice)}
                          className={`flex justify-between items-center p-3 rounded-lg border-2 transition-all text-left ${isSelected ? 'border-blue-600 bg-blue-50/50' : 'border-slate-200 hover:border-blue-300'}`}>
                          <span className={`font-medium ${isSelected ? 'text-blue-700' : 'text-slate-700'}`}>{choice.name}</span>
                          {choice.addPrice > 0 && <span className="text-sm text-slate-500">+Rp {choice.addPrice.toLocaleString('id-ID')}</span>}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
            <div className="p-4 border-t border-slate-100 bg-slate-50">
              <button onClick={() => addToCart(selectedItem, tempOptions)} className="w-full bg-blue-600 text-white font-bold py-4 rounded-xl hover:bg-blue-700 shadow-sm">
                Add to Ticket
              </button>
            </div>
          </div>
        </div>
      )}

      {isDiscountModalOpen && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-sm rounded-2xl shadow-2xl overflow-hidden flex flex-col">
            <div className="p-4 border-b border-slate-100 flex justify-between items-center bg-slate-50">
              <h2 className="text-xl font-bold flex items-center gap-2"><Tag size={20}/> Apply Discount</h2>
              <button onClick={() => setIsDiscountModalOpen(false)} className="p-2 bg-slate-200 hover:bg-slate-300 rounded-full"><X size={20} /></button>
            </div>
            <div className="p-4 flex flex-col gap-3">
              {availableDiscounts.map((disc) => {
                const isSelected = appliedDiscounts.some(d => d.id === disc.id);
                return (
                  <button key={disc.id} onClick={() => toggleDiscount(disc)}
                    className={`flex justify-between items-center p-4 rounded-xl border-2 transition-all text-left ${isSelected ? 'border-emerald-500 bg-emerald-50' : 'border-slate-200 hover:border-slate-300 bg-white'}`}>
                    <div>
                      <h4 className={`font-bold ${isSelected ? 'text-emerald-700' : 'text-slate-800'}`}>{disc.name}</h4>
                      <p className="text-sm text-slate-500 uppercase tracking-wide mt-0.5">{disc.type}</p>
                    </div>
                    <span className={`font-black text-lg ${isSelected ? 'text-emerald-600' : 'text-slate-600'}`}>
                      {disc.type === 'percentage' ? `${disc.value}%` : `-Rp ${disc.value.toLocaleString('id-ID')}`}
                    </span>
                  </button>
                )
              })}
            </div>
            <div className="p-4 border-t border-slate-100 bg-slate-50">
              <button onClick={() => setIsDiscountModalOpen(false)} className="w-full bg-slate-800 text-white font-bold py-3 rounded-xl hover:bg-slate-900">Done</button>
            </div>
          </div>
        </div>
      )}

      {isCheckoutModalOpen && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-lg rounded-2xl shadow-2xl overflow-hidden flex flex-col">
            <div className="p-6 text-center border-b border-slate-100 bg-slate-50">
              <h2 className="text-slate-500 font-bold tracking-widest text-sm mb-1 uppercase">Total Amount Due</h2>
              <h1 className="text-5xl font-black text-blue-600 tracking-tight">Rp {finalTotal.toLocaleString('id-ID')}</h1>
            </div>
            <div className="p-6 flex flex-col gap-6">
              <div>
                <h3 className="text-sm font-bold text-slate-800 uppercase tracking-wider mb-3">Select Payment Method</h3>
                <div className="grid grid-cols-3 gap-3">
                  <button onClick={() => submitOrder('QRIS')} className="flex flex-col items-center justify-center gap-2 p-4 rounded-xl border-2 border-slate-200 hover:border-blue-500 hover:bg-blue-50 transition-colors text-slate-700">
                    <QrCode size={28} className="text-blue-600" /><span className="font-bold">QRIS</span>
                  </button>
                  <button onClick={() => submitOrder('Debit/Credit')} className="flex flex-col items-center justify-center gap-2 p-4 rounded-xl border-2 border-slate-200 hover:border-blue-500 hover:bg-blue-50 transition-colors text-slate-700">
                    <CreditCard size={28} className="text-slate-500" /><span className="font-bold text-sm">Debit</span>
                  </button>
                  <button onClick={() => setCashGiven(finalTotal)} className="flex flex-col items-center justify-center gap-2 p-4 rounded-xl border-2 border-slate-200 hover:border-emerald-500 hover:bg-emerald-50 transition-colors text-slate-700">
                    <Banknote size={28} className="text-emerald-600" /><span className="font-bold">Cash</span>
                  </button>
                </div>
              </div>
              {cashGiven !== '' && (
                <div className="bg-slate-50 p-4 rounded-xl border border-slate-200">
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-wide mb-2">Cash Received</label>
                  <input type="number" value={cashGiven} onChange={(e) => setCashGiven(Number(e.target.value))} className="w-full text-2xl font-bold bg-white border border-slate-300 rounded-lg p-3 outline-none focus:border-emerald-500 mb-3" />
                  <div className="flex justify-between items-center text-lg">
                    <span className="font-bold text-slate-600">Change Due:</span>
                    <span className={`font-black ${Number(cashGiven) >= finalTotal ? 'text-emerald-600' : 'text-red-500'}`}>
                      Rp {Math.max(0, Number(cashGiven) - finalTotal).toLocaleString('id-ID')}
                    </span>
                  </div>
                  <button disabled={Number(cashGiven) < finalTotal} onClick={() => submitOrder('Cash')} className="w-full mt-4 bg-emerald-600 disabled:bg-slate-300 text-white font-bold py-3 rounded-lg">Confirm Payment</button>
                </div>
              )}
            </div>
            <div className="p-4 border-t border-slate-100">
              <button onClick={() => {setIsCheckoutModalOpen(false); setCashGiven('');}} className="w-full bg-slate-100 text-slate-600 font-bold py-3 rounded-xl hover:bg-slate-200">Cancel</button>
            </div>
          </div>
        </div>
      )}


      {/* ----------------- HEADER & NAVIGATION ----------------- */}
      <div className="flex-1 flex flex-col h-full overflow-hidden bg-white">
        <header className="bg-white p-4 flex justify-between items-center z-10 border-b border-slate-100">
          <div className="flex items-center gap-2 md:gap-6">
            <button onClick={() => setIsMobileMenuOpen(true)} className="md:hidden p-2 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-lg"><Menu size={20} /></button>
            <h1 className="text-xl font-black tracking-tight text-slate-800 flex items-center gap-2">
              <Coffee className="text-blue-600 hidden md:block" size={24} /> TRISHA CAFE
            </h1>
            <nav className="hidden md:flex items-center gap-1 bg-slate-100 p-1 rounded-lg">
              <Link href="/" className="px-4 py-1.5 rounded-md text-sm font-bold bg-white text-blue-600 shadow-sm">POS</Link>
              <Link href="/history" className="px-4 py-1.5 rounded-md text-sm font-bold text-slate-500 hover:text-slate-800 hover:bg-slate-200">LOGS</Link>
              <Link href="/manage" className="px-4 py-1.5 rounded-md text-sm font-bold text-slate-500 hover:text-slate-800 hover:bg-slate-200">EDIT</Link>
              <div className="w-px h-4 bg-slate-300 mx-1"></div>
              <Link href="/kitchen" className="px-4 py-1.5 rounded-md text-sm font-bold text-slate-500 hover:text-orange-600 hover:bg-orange-100 flex items-center gap-1.5"><Flame size={14} /> KDS</Link>
            </nav>
          </div>

          <div className="flex items-center gap-3">
            {/* NOTIFICATION BELL COUNTER */}
            <div className="relative">
              <button onClick={() => setIsNotifOpen(!isNotifOpen)} className="p-2.5 bg-slate-100 hover:bg-slate-200 rounded-xl text-slate-600 relative transition-colors">
                <Bell size={20} />
                {pendingQrOrders.length > 0 && (
                  <span className="absolute -top-1 -right-1 bg-red-500 text-white font-bold text-xs w-5 h-5 rounded-full flex items-center justify-center animate-bounce">
                    {pendingQrOrders.length}
                  </span>
                )}
              </button>

              {/* Notification Dropdown */}
              {isNotifOpen && (
                <div className="absolute right-0 mt-2 w-80 bg-white rounded-2xl shadow-2xl border border-slate-200 z-50 overflow-hidden">
                  <div className="p-3 bg-slate-50 border-b border-slate-100 flex justify-between items-center">
                    <span className="font-bold text-sm text-slate-800">Pending QR Orders</span>
                    <span className="bg-red-100 text-red-600 text-xs font-bold px-2 py-0.5 rounded-full">{pendingQrOrders.length} new</span>
                  </div>
                  <div className="max-h-64 overflow-y-auto divide-y divide-slate-100">
                    {pendingQrOrders.length === 0 ? (
                      <div className="p-4 text-center text-slate-400 text-sm">No pending QR orders</div>
                    ) : (
                      pendingQrOrders.map(order => (
                        <div key={order.id} onClick={() => loadQrOrderToCart(order)} className="p-3 hover:bg-blue-50/50 cursor-pointer transition-colors flex justify-between items-center">
                          <div>
                            <h4 className="font-bold text-sm text-slate-800">{order.table} ({order.customer})</h4>
                            <p className="text-xs text-slate-500">{order.items}</p>
                          </div>
                          <div className="text-right">
                            <span className="font-bold text-blue-600 text-sm block">Rp {order.total.toLocaleString('id-ID')}</span>
                            <span className="text-[10px] bg-emerald-100 text-emerald-700 font-bold px-1.5 py-0.5 rounded">Checkout</span>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              )}
            </div>

            <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 px-3 py-2 rounded-lg hidden sm:flex">
              <Search size={18} className="text-slate-400" />
              <input type="text" placeholder="Search menu..." className="bg-transparent border-none outline-none text-sm w-28 lg:w-36" />
            </div>
          </div>
        </header>

        <div className="p-4 flex gap-3 overflow-x-auto bg-white">
          {['All', 'Coffee', 'Snack', 'Retail'].map(cat => (
            <button key={cat} onClick={() => setActiveCategory(cat)}
              className={`flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium transition-colors border ${activeCategory === cat ? 'bg-slate-800 text-white border-slate-800 shadow-md' : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'}`}>
              {cat === 'Coffee' ? <Coffee size={16} /> : <Croissant size={16} />} {cat}
            </button>
          ))}
        </div>

        <div className="flex-1 overflow-y-auto p-4 pt-0 bg-slate-50 shadow-inner">
          <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 mt-4">
            {menuItems.filter(item => activeCategory === 'All' || item.category === activeCategory).map((item) => (
              <button key={item.id} onClick={() => handleProductClick(item)} className="bg-white p-5 rounded-xl shadow-[0_2px_8px_-4px_rgba(0,0,0,0.1)] border border-slate-200 hover:border-blue-500 hover:shadow-md transition-all text-left flex flex-col h-32 justify-between">
                <div>
                  <span className="font-bold text-lg text-slate-800 leading-tight block">{item.name}</span>
                  {item.options && <span className="text-[10px] font-bold uppercase tracking-wider text-blue-500 bg-blue-50 px-2 py-0.5 rounded mt-1 inline-block border border-blue-100">Customizable</span>}
                </div>
                <span className="text-blue-600 font-bold text-lg">Rp {item.price.toLocaleString('id-ID')}</span>
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* ----------------- CART ----------------- */}
      <div className="w-full md:w-[400px] bg-white border-l border-slate-200 flex flex-col h-[50vh] md:h-full shadow-2xl z-20 shrink-0">
        <div className="p-4 border-b border-slate-100 flex justify-between items-center bg-white">
          <div className="flex items-center gap-2">
            <User size={20} className="text-slate-500" />
            <span className="font-bold text-slate-800">Current Order</span>
          </div>
          <span className="bg-blue-100 text-blue-700 text-xs font-bold px-2 py-1 rounded">New Ticket</span>
        </div>

        <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-4 bg-slate-50/50">
          {cart.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-slate-400 gap-2">
              <ShoppingBag size={48} className="opacity-20" />
              <p className="text-sm font-medium">Cart is empty</p>
            </div>
          ) : (
            cart.map((cartItem) => (
              <div key={cartItem.cartId} className="flex justify-between items-start bg-white p-3 rounded-lg border border-slate-100 shadow-sm">
                <div className="flex-1 pr-2">
                  <h4 className="font-bold text-slate-800">{cartItem.name}</h4>
                  {cartItem.notes && <p className="text-blue-600 font-medium text-xs mt-1 bg-blue-50 border border-blue-100 inline-block px-1.5 py-0.5 rounded">+ {cartItem.notes}</p>}
                </div>
                <div className="flex flex-col items-end gap-2">
                  <span className="font-bold text-slate-800">Rp {cartItem.finalPrice.toLocaleString('id-ID')}</span>
                  <button onClick={() => removeFromCart(cartItem.cartId)} className="text-slate-300 hover:text-red-500"><Trash2 size={16} /></button>
                </div>
              </div>
            ))
          )}
        </div>

        <div className="p-4 bg-white border-t border-slate-200 shadow-[0_-4px_12px_-4px_rgba(0,0,0,0.05)]">
          <div className="flex justify-between text-sm mb-2 text-slate-600">
            <span>Subtotal</span>
            <span>Rp {subtotal.toLocaleString('id-ID')}</span>
          </div>

          {appliedDiscounts.length > 0 && (
            <div className="flex flex-col gap-1 mb-2">
              {appliedDiscounts.map(disc => (
                <div key={disc.id} className="flex justify-between items-center text-sm">
                  <div className="flex items-center gap-1 text-emerald-600">
                    <button onClick={() => removeDiscount(disc.id)} className="text-slate-400 hover:text-red-500"><X size={14}/></button>
                    <span>{disc.name} {disc.type === 'percentage' && `(${disc.value}%)`}</span>
                  </div>
                  <span className="text-emerald-600 font-medium">- Rp {(disc.type === 'percentage' ? (subtotal * (disc.value/100)) : disc.value).toLocaleString('id-ID')}</span>
                </div>
              ))}
            </div>
          )}
          
          <div className="mb-4 pt-2">
            <button onClick={() => setIsDiscountModalOpen(true)} disabled={cart.length === 0} className="w-full bg-slate-50 border border-slate-200 py-2.5 rounded-lg text-sm font-semibold hover:bg-slate-100 text-slate-700 disabled:opacity-50 flex justify-center items-center gap-2">
              <Tag size={16} /> Add / Manage Discounts
            </button>
          </div>

          <div className="flex justify-between items-end mb-4 pt-2 border-t border-slate-100">
            <span className="font-bold text-slate-500 uppercase tracking-wider text-sm">Total</span>
            <span className="font-black text-2xl text-blue-600">Rp {finalTotal.toLocaleString('id-ID')}</span>
          </div>

          <button 
            disabled={cart.length === 0} 
            onClick={() => setIsCheckoutModalOpen(true)}
            className="w-full bg-slate-800 disabled:bg-slate-300 text-white font-bold py-4 rounded-xl shadow-md hover:bg-slate-900 flex justify-center items-center gap-2 text-lg"
          >
            <ShoppingBag size={20} /> Charge
          </button>
        </div>
      </div>
    </div>
  );
}