'use client';

import { useState } from 'react';
import { Coffee, Croissant, ShoppingBag, X, CheckCircle2, ChevronRight, Utensils } from 'lucide-react';

export default function CustomerMenu() {
  // ---------------- DATA ----------------
  const menuItems = [
    { id: 'M001', name: 'V60 Filter', price: 35000, category: 'Coffee', desc: 'Single origin manual brew' },
    { 
      id: 'M002', name: 'Latte', price: 30000, category: 'Coffee', desc: 'Espresso with steamed milk',
      options: [
        { group: 'Temperature', choices: [{ name: 'Hot', addPrice: 0 }, { name: 'Iced', addPrice: 3000 }] },
        { group: 'Milk Type', choices: [{ name: 'Fresh Milk', addPrice: 0 }, { name: 'Oat Milk', addPrice: 8000 }] }
      ]
    },
    { id: 'M003', name: 'Butter Croissant', price: 25000, category: 'Snack', desc: 'Flaky, buttery pastry' },
    { id: 'M004', name: 'Mineral Water', price: 15000, category: 'Retail', desc: '600ml bottled water' },
  ];

  // ---------------- STATE ----------------
  const [activeCategory, setActiveCategory] = useState('Coffee');
  const [cart, setCart] = useState<any[]>([]); 
  
  // Modals
  const [selectedItem, setSelectedItem] = useState<any>(null); 
  const [tempOptions, setTempOptions] = useState<any>({}); 
  const [isCartOpen, setIsCartOpen] = useState(false);
  const [orderPlaced, setOrderPlaced] = useState(false); // Success screen state

  // Customer Details (For the kitchen to identify them)
  const [customerName, setCustomerName] = useState('');
  const [tableNumber, setTableNumber] = useState('4'); // Usually pulled from the URL (e.g., ?table=4)

  // ---------------- ACTIONS ----------------
  const handleProductClick = (item: any) => {
    if (item.options && item.options.length > 0) {
      setSelectedItem(item);
      setTempOptions({}); 
    } else {
      addToCart(item, {});
    }
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
    if (cart.length === 1) setIsCartOpen(false); // Close cart if empty
  };

  const submitOrder = () => {
    if (!customerName) {
      alert("Please enter your name so we can call your order!");
      return;
    }
    // This public ordering screen is separate from the authenticated cashier checkout.
    setOrderPlaced(true);
    setIsCartOpen(false);
  };

  // ---------------- MATH LOGIC ----------------
  const subtotal = cart.reduce((sum, item) => sum + item.finalPrice, 0);

  // ---------------- SUCCESS SCREEN ----------------
  if (orderPlaced) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-6 text-center">
        <div className="w-20 h-20 bg-emerald-100 rounded-full flex items-center justify-center mb-6">
          <CheckCircle2 size={40} className="text-emerald-600" />
        </div>
        <h1 className="text-2xl font-black text-slate-800 mb-2">Order Sent to Kitchen!</h1>
        <p className="text-slate-500 mb-8">Thank you, {customerName}. The barista is preparing your order for Table {tableNumber}. Please proceed to the cashier to complete your payment.</p>
        <button onClick={() => window.location.reload()} className="px-6 py-3 bg-white border border-slate-200 rounded-xl font-bold text-slate-600 shadow-sm">
          View Menu Again
        </button>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 text-slate-800 pb-24 font-sans relative">
      
      {/* ----------------- MODALS ----------------- */}
      
      {/* 1. Item Customization Modal */}
      {selectedItem && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 transition-all">
          <div className="bg-white w-full sm:max-w-md rounded-t-2xl sm:rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[85vh] animate-in slide-in-from-bottom-4 sm:slide-in-from-bottom-0 sm:zoom-in-95">
            <div className="p-5 border-b border-slate-100 flex justify-between items-center bg-white sticky top-0 z-10">
              <h2 className="text-xl font-black">{selectedItem.name}</h2>
              <button onClick={() => setSelectedItem(null)} className="p-2 bg-slate-100 hover:bg-slate-200 rounded-full text-slate-500"><X size={20} /></button>
            </div>
            
            <div className="p-6 overflow-y-auto flex-1 bg-slate-50">
              {selectedItem.options.map((optionGroup: any, index: number) => (
                <div key={index} className="mb-6 last:mb-0">
                  <h3 className="text-sm font-bold text-slate-800 uppercase tracking-wider mb-3">Select {optionGroup.group}</h3>
                  <div className="flex flex-col gap-2">
                    {optionGroup.choices.map((choice: any, cIdx: number) => {
                      const isSelected = tempOptions[optionGroup.group]?.name === choice.name;
                      return (
                        <button key={cIdx} onClick={() => handleOptionSelect(optionGroup.group, choice)}
                          className={`flex justify-between items-center p-4 rounded-xl border-2 transition-all text-left bg-white shadow-sm ${isSelected ? 'border-blue-600 ring-1 ring-blue-600' : 'border-transparent hover:border-blue-200'}`}>
                          <div className="flex items-center gap-3">
                            <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${isSelected ? 'border-blue-600' : 'border-slate-300'}`}>
                              {isSelected && <div className="w-2.5 h-2.5 bg-blue-600 rounded-full" />}
                            </div>
                            <span className={`font-bold ${isSelected ? 'text-blue-700' : 'text-slate-700'}`}>{choice.name}</span>
                          </div>
                          {choice.addPrice > 0 && <span className="text-sm font-semibold text-slate-500">+Rp {choice.addPrice.toLocaleString('id-ID')}</span>}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
            <div className="p-5 bg-white border-t border-slate-100 shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.05)]">
              <button onClick={() => addToCart(selectedItem, tempOptions)} className="w-full bg-slate-800 text-white font-bold py-4 rounded-xl shadow-md text-lg active:scale-[0.98] transition-transform">
                Add to Order
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 2. Cart Review Modal (Bottom Sheet on Mobile) */}
      {isCartOpen && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
          <div className="bg-white w-full sm:max-w-md rounded-t-2xl sm:rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh] animate-in slide-in-from-bottom-4 sm:slide-in-from-bottom-0 sm:zoom-in-95">
            <div className="p-5 border-b border-slate-100 flex justify-between items-center bg-white sticky top-0">
              <h2 className="text-xl font-black">Your Order</h2>
              <button onClick={() => setIsCartOpen(false)} className="p-2 bg-slate-100 hover:bg-slate-200 rounded-full text-slate-500"><X size={20} /></button>
            </div>
            
            <div className="p-6 overflow-y-auto flex-1 bg-slate-50 flex flex-col gap-3">
              {cart.map((cartItem) => (
                <div key={cartItem.cartId} className="flex justify-between items-start bg-white p-4 rounded-xl shadow-sm border border-slate-100">
                  <div className="flex-1 pr-3">
                    <h4 className="font-bold text-slate-800 text-lg">{cartItem.name}</h4>
                    {cartItem.notes && <p className="text-slate-500 text-sm mt-1">{cartItem.notes}</p>}
                    <button onClick={() => removeFromCart(cartItem.cartId)} className="text-red-500 text-sm font-semibold mt-2 text-left">Remove</button>
                  </div>
                  <span className="font-bold text-slate-800">Rp {cartItem.finalPrice.toLocaleString('id-ID')}</span>
                </div>
              ))}
              
              {/* Customer Details Input */}
              <div className="mt-4 p-4 bg-white rounded-xl shadow-sm border border-slate-100">
                <label className="block text-sm font-bold text-slate-800 mb-2">Your Name</label>
                <input 
                  type="text" 
                  placeholder="e.g. Budi" 
                  value={customerName}
                  onChange={(e) => setCustomerName(e.target.value)}
                  className="w-full border border-slate-300 rounded-lg p-3 outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                />
              </div>
            </div>

            <div className="p-5 bg-white border-t border-slate-100">
              <div className="flex justify-between items-end mb-4">
                <span className="font-bold text-slate-500">Total</span>
                <span className="font-black text-2xl text-blue-600">Rp {subtotal.toLocaleString('id-ID')}</span>
              </div>
              <button onClick={submitOrder} className="w-full bg-blue-600 text-white font-bold py-4 rounded-xl shadow-md text-lg flex items-center justify-center gap-2 active:scale-[0.98] transition-transform">
                Send Order to Kitchen <ChevronRight size={20}/>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ----------------- PAGE HEADER ----------------- */}
      <header className="bg-white px-6 py-5 shadow-sm sticky top-0 z-30 flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-black tracking-tight text-slate-800 flex items-center gap-2">
            <Coffee className="text-blue-600" size={24} /> TRISHA CAFE
          </h1>
          <p className="text-sm text-slate-500 font-medium mt-1 flex items-center gap-1">
            <Utensils size={14}/> Table {tableNumber}
          </p>
        </div>
      </header>

      {/* ----------------- CATEGORY TABS ----------------- */}
      <div className="bg-white/80 backdrop-blur-md sticky top-[76px] z-20 py-3 px-6 shadow-sm border-t border-slate-100 overflow-x-auto whitespace-nowrap">
        <div className="flex gap-2">
          {['Coffee', 'Snack', 'Retail'].map(cat => (
            <button key={cat} onClick={() => setActiveCategory(cat)}
              className={`px-5 py-2.5 rounded-full text-sm font-bold transition-all shadow-sm ${
                activeCategory === cat ? 'bg-slate-800 text-white' : 'bg-white text-slate-600 border border-slate-200'
              }`}>
              {cat}
            </button>
          ))}
        </div>
      </div>

      {/* ----------------- MENU LIST ----------------- */}
      <div className="p-6">
        <h2 className="text-xl font-black mb-4 text-slate-800">{activeCategory}</h2>
        <div className="flex flex-col gap-4">
          {menuItems.filter(item => item.category === activeCategory).map((item) => (
            <button 
              key={item.id} 
              onClick={() => handleProductClick(item)} 
              className="bg-white p-5 rounded-2xl shadow-sm border border-slate-200 active:bg-slate-50 transition-colors text-left flex justify-between items-center group"
            >
              <div className="pr-4">
                <h3 className="font-bold text-lg text-slate-800">{item.name}</h3>
                <p className="text-sm text-slate-500 mt-1 line-clamp-2 leading-relaxed">{item.desc}</p>
                {item.options && (
                  <span className="text-[10px] font-bold uppercase tracking-wider text-blue-500 bg-blue-50 px-2 py-0.5 rounded mt-2 inline-block border border-blue-100">
                    Customizable
                  </span>
                )}
              </div>
              <div className="flex flex-col items-end gap-2 shrink-0">
                <span className="text-blue-600 font-bold text-lg whitespace-nowrap">Rp {item.price.toLocaleString('id-ID')}</span>
                <div className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center text-slate-600 group-hover:bg-blue-600 group-hover:text-white transition-colors">
                  <span className="font-bold text-xl leading-none mb-1">+</span>
                </div>
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* ----------------- FLOATING CART BUTTON ----------------- */}
      {cart.length > 0 && (
        <div className="fixed bottom-6 left-0 right-0 px-6 z-40 animate-in slide-in-from-bottom-10">
          <button 
            onClick={() => setIsCartOpen(true)}
            className="w-full bg-slate-800 text-white p-4 rounded-2xl shadow-2xl flex justify-between items-center active:scale-[0.98] transition-transform"
          >
            <div className="flex items-center gap-3">
              <div className="bg-white/20 px-3 py-1.5 rounded-lg font-black text-sm">
                {cart.length}
              </div>
              <span className="font-bold text-lg">View Order</span>
            </div>
            <span className="font-black text-xl">Rp {subtotal.toLocaleString('id-ID')}</span>
          </button>
        </div>
      )}

    </div>
  );
}