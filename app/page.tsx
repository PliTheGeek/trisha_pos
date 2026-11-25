'use client';

import { useEffect, useState } from 'react';
import { Coffee, Croissant, MessageCircle, Phone, Search, ShoppingBag, Trash2, User, UserPlus, X, Tag, Store, History, Settings, Menu, Banknote, QrCode, CreditCard, Pencil, Receipt } from 'lucide-react';
import Link from 'next/link';
import Image from 'next/image';
import { createTransaction } from '@/app/actions/transactions';
import { listDiscounts } from '@/app/actions/discounts';
import { listMenu } from '@/app/actions/menu';
import { listContacts, createContact, type Contact } from '@/app/actions/contacts';
import { listKitchenOrders } from '@/app/actions/kitchen';
import { createSupabaseBrowserClient } from '@/lib/supabase/browser';

const normalizeCategory = (category: unknown) => {
  const value = String(category ?? '').trim().toLowerCase().replace(/\s+/g, '_');

  if (value === 'non-coffee' || value === 'non_coffee') return 'Non-Coffee';
  if (value === 'snack' || value === 'snacks') return 'Snacks';
  if (value === 'coffee') return 'Coffee';
  if (value === 'retail') return 'Retail';

  return String(category ?? 'Other').trim() || 'Other';
};

const menuCategories = ['All', 'Coffee', 'Non-Coffee', 'Snacks', 'Retail'];

function formatReceiptText(cart: any[], subtotal: number, totalDiscountAmount: number, finalTotal: number, appliedDiscounts: any[], paymentMethod: string, cashGiven: number | '', contactName?: string) {
  const date = new Date().toLocaleString('id-ID');
  const lines: string[] = [
    '================================',
    '       *TRISHA COFFEA*',
    '================================',
    `Tanggal : ${date}`,
    `Bayar   : ${paymentMethod}`,
  ];
  if (contactName) lines.push(`Pelanggan: ${contactName}`);
  lines.push('--------------------------------');
  cart.forEach(item => {
    lines.push(`1x ${item.name}`);
    lines.push(`   Rp ${item.finalPrice.toLocaleString('id-ID')}`);
    const note = [item.notes, item.orderNote].filter(Boolean).join(', ');
    if (note) lines.push(`   Note: ${note}`);
  });
  lines.push('--------------------------------');
  lines.push(`Subtotal : Rp ${subtotal.toLocaleString('id-ID')}`);
  if (totalDiscountAmount > 0) {
    lines.push(`Diskon   : -Rp ${totalDiscountAmount.toLocaleString('id-ID')}`);
  }
  lines.push(`*TOTAL   : Rp ${finalTotal.toLocaleString('id-ID')}*`);
  if (paymentMethod === 'Cash' && cashGiven !== '' && Number(cashGiven) > 0) {
    lines.push(`Tunai    : Rp ${Number(cashGiven).toLocaleString('id-ID')}`);
    lines.push(`Kembali  : Rp ${Math.max(0, Number(cashGiven) - finalTotal).toLocaleString('id-ID')}`);
  }
  lines.push('================================');
  lines.push('  Terima kasih sudah berkunjung!');
  lines.push('        *Trisha Coffea*');
  lines.push('================================');
  return lines.join('\n');
}

function sendWhatsApp(phone: string, text: string) {
  let normalized = phone.replace(/\D/g, '');
  if (normalized.startsWith('0')) normalized = '62' + normalized.slice(1);
  else if (!normalized.startsWith('62')) normalized = '62' + normalized;
  const url = `https://wa.me/${normalized}?text=${encodeURIComponent(text)}`;
  window.open(url, '_blank');
}

export default function PosInterface() {

  // ---------------- DATA ----------------
  const [availableDiscounts, setAvailableDiscounts] = useState<any[]>([]);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [queueCount, setQueueCount] = useState(0);

  // ---------------- STATE ----------------
  const [cart, setCart] = useState<any[]>([]);
  const [menuItems, setMenuItems] = useState<any[]>([]);
  const [isLoadingMenu, setIsLoadingMenu] = useState(true);
  const [appliedDiscounts, setAppliedDiscounts] = useState<any[]>([]);
  const [activeCategory, setActiveCategory] = useState('All');

  // Contact selection
  const [selectedContactId, setSelectedContactId] = useState<string | null>(null);
  const [isContactModalOpen, setIsContactModalOpen] = useState(false);
  const [newContactName, setNewContactName] = useState('');
  const [newContactPhone, setNewContactPhone] = useState('');
  const [savingContact, setSavingContact] = useState(false);

  // Modals & Drawers
  const [selectedItem, setSelectedItem] = useState<any>(null);
  const [tempOptions, setTempOptions] = useState<any>({});
  const [isDiscountModalOpen, setIsDiscountModalOpen] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isCheckoutModalOpen, setIsCheckoutModalOpen] = useState(false);
  const [cashGiven, setCashGiven] = useState<number | ''>('');

  const [editingNoteId, setEditingNoteId] = useState<string | null>(null);
  const [noteDraft, setNoteDraft] = useState('');
  const [isSubmittingOrder, setIsSubmittingOrder] = useState(false);

  useEffect(() => {
    async function getMenuItems() {
      try {
        const [rows, discounts, contactList, kitchenOrders] = await Promise.all([
          listMenu(),
          listDiscounts(),
          listContacts(),
          listKitchenOrders(),
        ]);
        const normalizedItems = rows.map((item: any, index: number) => ({
          ...item,
          id: String(item.product_id),
          menuKey: `${String(item.product_id)}-${index}`,
          name: item.product_name,
          price: Number(item.price) || 0,
          category: normalizeCategory(item.category),
        }));
        setMenuItems(normalizedItems);
        setContacts(contactList);
        setQueueCount(Array.isArray(kitchenOrders) ? kitchenOrders.length : 0);
        setAvailableDiscounts(
          discounts
            .filter((discount: any) => discount.is_active)
            .map((discount: any) => ({
              ...discount,
              id: discount.discount_id,
              name: discount.discount_name,
              type: discount.discount_type,
              value: Number(discount.discount_value),
            }))
        );
      } catch (error) {
        console.error('Failed to load menu:', error);
        setMenuItems([]);
      } finally {
        setIsLoadingMenu(false);
      }
    }

    void getMenuItems();
  }, []);

  // Keep ODS queue count synced in real time
  useEffect(() => {
    const supabase = createSupabaseBrowserClient();
    const refreshQueueCount = async () => {
      try {
        const orders = await listKitchenOrders();
        setQueueCount(Array.isArray(orders) ? orders.length : 0);
      } catch {
        // Ignore transient errors
      }
    };

    const channel = supabase
      .channel('pos-ods-queue-count')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'kitchen_orders' }, () => {
        void refreshQueueCount();
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'kitchen_orders' }, () => {
        void refreshQueueCount();
      })
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, []);

  const selectedContact = contacts.find(c => c.contact_id === selectedContactId) ?? null;

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
    const notes: string[] = [];
    Object.values(selectedModifiers).forEach((mod: any) => {
      finalPrice += mod.addPrice;
      if (mod.name !== 'Hot' && mod.name !== 'Fresh Milk') notes.push(mod.name);
    });
    setCart([...cart, { cartId: Math.random().toString(), id: item.id, name: item.name, finalPrice, notes: notes.join(', '), orderNote: '' }]);
    setSelectedItem(null);
  };

  const startEditingNote = (cartItem: any) => {
    setEditingNoteId(cartItem.cartId);
    setNoteDraft(cartItem.orderNote ?? '');
  };

  const saveItemNote = () => {
    if (!editingNoteId) return;

    setCart(cart.map(item => item.cartId === editingNoteId
      ? { ...item, orderNote: noteDraft.trim() }
      : item
    ));
    setEditingNoteId(null);
    setNoteDraft('');
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

  const handleAddContact = async () => {
    if (!newContactName.trim() || !newContactPhone.trim()) return;
    setSavingContact(true);
    try {
      const created = await createContact({ name: newContactName.trim(), phone: newContactPhone.trim() });
      setContacts(prev => [...prev, created].sort((a, b) => a.name.localeCompare(b.name)));
      setSelectedContactId(created.contact_id);
      setNewContactName('');
      setNewContactPhone('');
    } catch (error) {
      alert(error instanceof Error ? error.message : 'Failed to save contact.');
    } finally {
      setSavingContact(false);
    }
  };

  const submitOrder = async (paymentMethod: string) => {
    setIsSubmittingOrder(true);

    try {
      await createTransaction({
        payment_method: paymentMethod === 'QRIS' ? 'qris' : paymentMethod === 'Cash' ? 'cash' : paymentMethod === 'Open Bill' ? 'open_bill' : 'card',
        status: paymentMethod === 'Open Bill' ? 'pending' : 'paid',
        cash_received: paymentMethod === 'Cash' ? Number(cashGiven || 0) : 0,
        discount_ids: appliedDiscounts.map(discount => discount.id),
        contact_id: selectedContactId,
        items: cart.map(item => ({
          product_id: item.id,
          quantity: 1,
          order_note: [item.notes, item.orderNote].filter(Boolean).join(', '),
        })),
      });

      void listKitchenOrders()
        .then(orders => setQueueCount(Array.isArray(orders) ? orders.length : 0))
        .catch(() => {});

      // After successful order, offer to send WA receipt
      if (selectedContact?.phone) {
        const receiptText = formatReceiptText(cart, subtotal, totalDiscountAmount, finalTotal, appliedDiscounts, paymentMethod, cashGiven, selectedContact.name);
        if (window.confirm(`Order berhasil! Kirim struk via WhatsApp ke ${selectedContact.name} (${selectedContact.phone})?`)) {
          sendWhatsApp(selectedContact.phone, receiptText);
        }
      } else {
        alert(`Order saved. Paid via ${paymentMethod}.`);
      }

      setCart([]);
      setAppliedDiscounts([]);
      setIsCheckoutModalOpen(false);
      setCashGiven('');
      setSelectedContactId(null);
    } catch (error) {
      alert(error instanceof Error ? error.message : 'Failed to save order.');
    } finally {
      setIsSubmittingOrder(false);
    }
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
              <button onClick={() => setIsMobileMenuOpen(false)} className="p-2 text-slate-400 hover:text-slate-600 bg-slate-200 rounded-full"><X size={16} /></button>
            </div>
            <div className="p-4 flex flex-col gap-2">
              <Link href="/" className="p-3 rounded-lg bg-blue-50 text-blue-700 font-bold flex items-center gap-3"><Store size={20} /> POS</Link>
              <Link href="/history" className="p-3 rounded-lg text-slate-600 hover:bg-slate-50 font-bold flex items-center gap-3"><History size={20} /> LOGS</Link>
              <Link href="/manage" className="p-3 rounded-lg text-slate-600 hover:bg-slate-50 font-bold flex items-center gap-3"><Settings size={20} /> EDIT</Link>
              <hr className="my-2 border-slate-100" />
              <Link href="/kitchen" className="p-3 rounded-lg text-slate-600 hover:bg-orange-50 hover:text-orange-600 font-bold flex items-center justify-between">
                <span>ODS</span>
                <span className={`min-w-[24px] h-6 px-2 rounded-full text-xs font-bold flex items-center justify-center ${queueCount > 0 ? 'bg-orange-500 text-white' : 'bg-slate-200 text-slate-600'}`}>
                  {queueCount}
                </span>
              </Link>
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
              <h2 className="text-xl font-bold flex items-center gap-2"><Tag size={20} /> Apply Discount</h2>
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
                );
              })}
            </div>
            <div className="p-4 border-t border-slate-100 bg-slate-50">
              <button onClick={() => setIsDiscountModalOpen(false)} className="w-full bg-slate-800 text-white font-bold py-3 rounded-xl hover:bg-slate-900">Done</button>
            </div>
          </div>
        </div>
      )}

      {/* CONTACT MODAL */}
      {isContactModalOpen && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-sm rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[85vh]">
            <div className="p-4 border-b border-slate-100 flex justify-between items-center bg-slate-50">
              <h2 className="text-xl font-bold flex items-center gap-2"><Phone size={20} /> Select Contact</h2>
              <button onClick={() => setIsContactModalOpen(false)} className="p-2 bg-slate-200 hover:bg-slate-300 rounded-full"><X size={20} /></button>
            </div>
            <div className="p-4 flex flex-col gap-2 overflow-y-auto flex-1">
              <button onClick={() => { setSelectedContactId(null); setIsContactModalOpen(false); }}
                className={`flex items-center gap-3 p-3 rounded-lg border-2 transition-all text-left ${!selectedContactId ? 'border-blue-600 bg-blue-50' : 'border-slate-200 hover:border-slate-300'}`}>
                <User size={18} className="text-slate-400" />
                <span className="font-medium text-slate-600">No contact (walk-in)</span>
              </button>
              {contacts.map(contact => {
                const isSelected = selectedContactId === contact.contact_id;
                return (
                  <button key={contact.contact_id} onClick={() => { setSelectedContactId(contact.contact_id); setIsContactModalOpen(false); }}
                    className={`flex items-center justify-between p-3 rounded-lg border-2 transition-all text-left ${isSelected ? 'border-blue-600 bg-blue-50' : 'border-slate-200 hover:border-slate-300'}`}>
                    <div>
                      <span className={`font-bold ${isSelected ? 'text-blue-700' : 'text-slate-800'}`}>{contact.name}</span>
                      <p className="text-xs text-slate-500">{contact.phone}</p>
                    </div>
                    <MessageCircle size={16} className="text-green-500" />
                  </button>
                );
              })}
            </div>
            <div className="p-4 border-t border-slate-100 bg-slate-50">
              <p className="text-xs font-bold text-slate-500 uppercase mb-2 flex items-center gap-1"><UserPlus size={14} /> Add New Contact</p>
              <div className="flex flex-col gap-2">
                <input type="text" placeholder="Name" value={newContactName} onChange={e => setNewContactName(e.target.value)}
                  className="border border-slate-300 rounded-lg px-3 py-2 text-sm outline-none focus:border-blue-500" />
                <input type="tel" placeholder="Phone (08xx...)" value={newContactPhone} onChange={e => setNewContactPhone(e.target.value)}
                  className="border border-slate-300 rounded-lg px-3 py-2 text-sm outline-none focus:border-blue-500" />
                <button disabled={savingContact || !newContactName.trim() || !newContactPhone.trim()} onClick={() => void handleAddContact()}
                  className="bg-blue-600 text-white font-bold py-2 rounded-lg hover:bg-blue-700 disabled:bg-slate-300 text-sm">{savingContact ? 'Saving...' : 'Add & Select'}</button>
              </div>
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
              {selectedContact && <p className="text-sm text-slate-500 mt-2">Customer: {selectedContact.name}</p>}
            </div>
            <div className="p-6 flex flex-col gap-6">
              <div>
                <h3 className="text-sm font-bold text-slate-800 uppercase tracking-wider mb-3">Select Payment Method</h3>
                <div className="grid grid-cols-3 gap-3">
                  <button disabled={isSubmittingOrder} onClick={() => submitOrder('QRIS')} className="flex flex-col items-center justify-center gap-2 p-4 rounded-xl border-2 border-slate-200 hover:border-blue-500 hover:bg-blue-50 transition-colors text-slate-700 disabled:opacity-50">
                    <QrCode size={28} className="text-blue-600" /><span className="font-bold">QRIS</span>
                  </button>
                  <button disabled={isSubmittingOrder} onClick={() => submitOrder('Other')} className="flex flex-col items-center justify-center gap-2 p-4 rounded-xl border-2 border-slate-200 hover:border-blue-500 hover:bg-blue-50 transition-colors text-slate-700 disabled:opacity-50">
                    <CreditCard size={28} className="text-slate-500" /><span className="font-bold text-sm">Other</span>
                  </button>
                  <button onClick={() => setCashGiven(finalTotal)} className="flex flex-col items-center justify-center gap-2 p-4 rounded-xl border-2 border-slate-200 hover:border-emerald-500 hover:bg-emerald-50 transition-colors text-slate-700">
                    <Banknote size={28} className="text-emerald-600" /><span className="font-bold">Cash</span>
                  </button>
                </div>
                <button disabled={isSubmittingOrder} onClick={() => submitOrder('Open Bill')} className="w-full mt-3 flex items-center justify-center gap-2 p-3 rounded-xl border-2 border-amber-200 bg-amber-50 text-amber-800 hover:bg-amber-100 transition-colors font-bold disabled:opacity-50">
                  <Receipt size={20} /> Open Bill
                </button>
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
                  <button disabled={Number(cashGiven) < finalTotal || isSubmittingOrder} onClick={() => submitOrder('Cash')} className="w-full mt-4 bg-emerald-600 disabled:bg-slate-300 text-white font-bold py-3 rounded-lg">{isSubmittingOrder ? 'Saving...' : 'Confirm Payment'}</button>
                </div>
              )}
            </div>
            <div className="p-4 border-t border-slate-100">
              <button onClick={() => { setIsCheckoutModalOpen(false); setCashGiven(''); }} className="w-full bg-slate-100 text-slate-600 font-bold py-3 rounded-xl hover:bg-slate-200">Cancel</button>
            </div>
          </div>
        </div>
      )}

      {editingNoteId && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-md rounded-2xl shadow-2xl overflow-hidden">
            <div className="p-4 border-b border-slate-100 flex justify-between items-center bg-slate-50">
              <h2 className="text-lg font-bold">Add item note</h2>
              <button onClick={() => setEditingNoteId(null)} className="p-2 bg-slate-200 hover:bg-slate-300 rounded-full">
                <X size={18} />
              </button>
            </div>
            <div className="p-4">
              <label className="block text-xs font-bold text-slate-500 uppercase tracking-wide mb-2">
                Customization or preparation note
              </label>
              <textarea
                autoFocus
                value={noteDraft}
                onChange={(event) => setNoteDraft(event.target.value)}
                placeholder="Example: less ice, no sugar, extra hot"
                rows={4}
                className="w-full border border-slate-300 rounded-lg p-3 text-sm outline-none focus:border-blue-500 resize-none"
              />
            </div>
            <div className="p-4 border-t border-slate-100 bg-slate-50 flex gap-3">
              <button onClick={() => setEditingNoteId(null)} className="flex-1 bg-white border border-slate-200 text-slate-600 font-bold py-3 rounded-lg hover:bg-slate-100">Cancel</button>
              <button onClick={saveItemNote} className="flex-1 bg-blue-600 text-white font-bold py-3 rounded-lg hover:bg-blue-700">Save Note</button>
            </div>
          </div>
        </div>
      )}

      {/* ----------------- HEADER & NAVIGATION ----------------- */}
      <div className="flex-1 flex flex-col h-full overflow-hidden bg-white">
        <header className="bg-white p-4 flex justify-between items-center z-10 border-b border-slate-100">
          <div className="flex items-center gap-2 md:gap-6">
            <button onClick={() => setIsMobileMenuOpen(true)} className="md:hidden p-2 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-lg"><Menu size={20} /></button>
            <h1 className="text-x2 font-black tracking-tight text-slate-800 flex items-center gap-2">
              <Image src="/logo/logo.png" alt="Trisha Coffea Logo" width={32} height={32} quality={90} className="object-contain" /> TRISHA POS
            </h1>
            <nav className="hidden md:flex items-center gap-1 bg-slate-100 p-1 rounded-lg">
              <Link href="/" className="px-4 py-1.5 rounded-md text-sm font-bold bg-white text-blue-600 shadow-sm">POS</Link>
              <Link href="/history" className="px-4 py-1.5 rounded-md text-sm font-bold text-slate-500 hover:text-slate-800 hover:bg-slate-200">LOGS</Link>
              <Link href="/manage" className="px-4 py-1.5 rounded-md text-sm font-bold text-slate-500 hover:text-slate-800 hover:bg-slate-200">EDIT</Link>
              <div className="w-px h-4 bg-slate-300 mx-1"></div>
              <Link href="/kitchen" className="px-4 py-1.5 rounded-md text-sm font-bold text-slate-500 hover:text-orange-600 hover:bg-orange-100 inline-flex items-center gap-1.5">
                <span className={`inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 rounded-full text-xs font-bold leading-none tabular-nums ${queueCount > 0 ? 'bg-orange-500 text-white' : 'bg-slate-200 text-slate-600'}`}>
                {queueCount}
                </span>
                <span className="leading-none">ODS</span>
              </Link>
            </nav>
          </div>

          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 px-3 py-2 rounded-lg hidden sm:flex">
              <Search size={18} className="text-slate-400" />
              <input type="text" placeholder="Search menu..." className="bg-transparent border-none outline-none text-sm w-28 lg:w-36" />
            </div>
          </div>
        </header>

        <div className="p-4 flex gap-3 overflow-x-auto bg-white">
          {menuCategories.map(cat => (
            <button key={cat} onClick={() => setActiveCategory(cat)}
              className={`flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium transition-colors border ${activeCategory === cat ? 'bg-slate-800 text-white border-slate-800 shadow-md' : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'}`}>
              {cat === 'Coffee' ? <Coffee size={16} /> : <Croissant size={16} />} {cat}
            </button>
          ))}
        </div>

        <div className="flex-1 overflow-y-auto p-4 pt-0 bg-slate-50 shadow-inner">
          {isLoadingMenu ? (
            <p className="mt-8 text-center text-sm text-slate-400">Loading menu...</p>
          ) : (
            <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 mt-4">
              {menuItems.filter(item => activeCategory === 'All' || item.category === activeCategory).map((item) => (
                <button key={item.menuKey} onClick={() => handleProductClick(item)} className="bg-white p-5 rounded-xl shadow-[0_2px_8px_-4px_rgba(0,0,0,0.1)] border border-slate-200 hover:border-blue-500 hover:shadow-md transition-all text-left flex flex-col h-32 justify-between">
                  <div>
                    <span className="font-bold text-lg text-slate-800 leading-tight block">{item.name}</span>
                    {item.options && <span className="text-[10px] font-bold uppercase tracking-wider text-blue-500 bg-blue-50 px-2 py-0.5 rounded mt-1 inline-block border border-blue-100">Customizable</span>}
                  </div>
                  <span className="text-blue-600 font-bold text-lg">Rp {item.price.toLocaleString('id-ID')}</span>
                </button>
              ))}
            </div>
          )}
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

        {/* Contact selector */}
        <div className="px-4 pt-3 pb-2 border-b border-slate-100">
          <div
            role="button"
            tabIndex={0}
            onClick={() => setIsContactModalOpen(true)}
            onKeyDown={e => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                setIsContactModalOpen(true);
              }
            }}
            className="w-full flex items-center justify-between gap-2 p-2.5 rounded-lg border border-slate-200 bg-slate-50 hover:bg-slate-100 transition-colors text-left cursor-pointer"
          >
            <div className="flex items-center gap-2 min-w-0">
              <Phone size={16} className={selectedContact ? 'text-blue-600 shrink-0' : 'text-slate-400 shrink-0'} />
              {selectedContact ? (
                <div className="min-w-0">
                  <p className="text-sm font-bold text-slate-800 truncate">{selectedContact.name}</p>
                  <p className="text-xs text-slate-500 truncate">{selectedContact.phone}</p>
                </div>
              ) : (
                <span className="text-sm text-slate-500 font-medium">Select Contact (Optional)</span>
              )}
            </div>
            {selectedContact && (
              <button
                type="button"
                onClick={e => {
                  e.stopPropagation();
                  setSelectedContactId(null);
                }}
                className="shrink-0 self-center text-slate-300 hover:text-red-500 p-1"
              >
                <X size={14} />
              </button>
            )}
          </div>
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
                  {cartItem.orderNote && <p className="text-slate-500 text-xs mt-1 italic">Note: {cartItem.orderNote}</p>}
                </div>
                <div className="flex flex-col items-end gap-2">
                  <span className="font-bold text-slate-800">Rp {cartItem.finalPrice.toLocaleString('id-ID')}</span>
                  <div className="flex items-center gap-2">
                    <button onClick={() => startEditingNote(cartItem)} className="text-slate-300 hover:text-blue-500" title="Add item note"><Pencil size={16} /></button>
                    <button onClick={() => removeFromCart(cartItem.cartId)} className="text-slate-300 hover:text-red-500" title="Remove item"><Trash2 size={16} /></button>
                  </div>
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
                    <button onClick={() => removeDiscount(disc.id)} className="text-slate-400 hover:text-red-500"><X size={14} /></button>
                    <span>{disc.name} {disc.type === 'percentage' && `(${disc.value}%)`}</span>
                  </div>
                  <span className="text-emerald-600 font-medium">- Rp {(disc.type === 'percentage' ? (subtotal * (disc.value / 100)) : disc.value).toLocaleString('id-ID')}</span>
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