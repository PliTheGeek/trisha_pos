'use client';

import { useEffect, useState } from 'react';
import { Coffee, Croissant, Search, ShoppingBag, Trash2, User, X, Tag, Store, History, Settings, Flame, Menu, Banknote, QrCode, CreditCard, Pencil, Receipt, Plus, Minus } from 'lucide-react';
import Link from 'next/link';
import Image from 'next/image';
import { createTransaction } from '@/app/actions/transactions';
import { listDiscounts } from '@/app/actions/discounts';
import { listMenu } from '@/app/actions/menu';

// ---------------- TYPES ----------------
type PaymentMethod = 'cash' | 'qris' | 'card';
type OrderType = 'dine_in' | 'takeaway';

type PaymentLine = {
  method: PaymentMethod;
  amount: number;       // portion of the bill covered by this payment
  cashReceived: number; // only used for cash (0 for cashless)
};

type CartItem = {
  cartId: string;
  id: string;
  name: string;
  unitPrice: number;
  quantity: number;
  notes: string;     // modifiers (Oat Milk, Large, ...)
  orderNote: string; // free-text note typed by the cashier
};

// ---------------- HELPERS ----------------
const normalizeCategory = (category: unknown) => {
  const value = String(category ?? '').trim().toLowerCase().replace(/\s+/g, '_');

  if (value === 'non-coffee' || value === 'non_coffee') return 'Non-Coffee';
  if (value === 'snack' || value === 'snacks') return 'Snacks';
  if (value === 'coffee') return 'Coffee';
  if (value === 'retail') return 'Retail';

  return String(category ?? 'Other').trim() || 'Other';
};

const menuCategories = ['All', 'Coffee', 'Non-Coffee', 'Snacks', 'Retail'];

const formatRp = (value: number) => `Rp ${value.toLocaleString('id-ID')}`;

const paymentLabels: Record<PaymentMethod, string> = { cash: 'Cash', qris: 'QRIS', card: 'Other' };

const splitMethodOptions = [
  { value: 'cash', label: 'Cash', Icon: Banknote, active: 'border-emerald-500 bg-emerald-50', iconClass: 'text-emerald-600' },
  { value: 'qris', label: 'QRIS', Icon: QrCode, active: 'border-blue-500 bg-blue-50', iconClass: 'text-blue-600' },
  { value: 'card', label: 'Other', Icon: CreditCard, active: 'border-blue-500 bg-blue-50', iconClass: 'text-slate-500' },
] as const;

// "0812-3456-789" -> "628123456789" | "+65 9123 4567" -> "6591234567"
const normalizeWhatsAppNumber = (raw: string) => {
  const trimmed = raw.trim();
  let digits = trimmed.replace(/\D/g, '');
  if (!digits) return '';
  if (trimmed.startsWith('+')) return digits;          // already international
  if (digits.startsWith('62')) return digits;
  if (digits.startsWith('0')) return `62${digits.slice(1)}`;
  if (digits.startsWith('8')) return `62${digits}`;
  return digits;
};

const isValidWhatsAppNumber = (digits: string) => /^\d{9,15}$/.test(digits);

export default function PosInterface() {

  // ---------------- DATA ----------------
  const [availableDiscounts, setAvailableDiscounts] = useState<any[]>([]);

  // ---------------- STATE ----------------
  const [cart, setCart] = useState<CartItem[]>([]);
  const [menuItems, setMenuItems] = useState<any[]>([]);
  const [isLoadingMenu, setIsLoadingMenu] = useState(true);
  const [appliedDiscounts, setAppliedDiscounts] = useState<any[]>([]);
  const [activeCategory, setActiveCategory] = useState('All');

  // Order info
  const [orderName, setOrderName] = useState('');
  const [orderContact, setOrderContact] = useState('');
  const [orderType, setOrderType] = useState<OrderType>('dine_in');

  // Modals & Drawers
  const [selectedItem, setSelectedItem] = useState<any>(null);
  const [tempOptions, setTempOptions] = useState<any>({});
  const [isDiscountModalOpen, setIsDiscountModalOpen] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isCheckoutModalOpen, setIsCheckoutModalOpen] = useState(false);
  const [cashGiven, setCashGiven] = useState<number | ''>('');

  // Split bill
  const [isSplitMode, setIsSplitMode] = useState(false);
  const [splitPayments, setSplitPayments] = useState<PaymentLine[]>([]);
  const [splitMethod, setSplitMethod] = useState<PaymentMethod>('cash');
  const [splitAmount, setSplitAmount] = useState<number | ''>('');
  const [splitCashReceived, setSplitCashReceived] = useState<number | ''>('');

  const [editingNoteId, setEditingNoteId] = useState<string | null>(null);
  const [noteDraft, setNoteDraft] = useState('');
  const [isSubmittingOrder, setIsSubmittingOrder] = useState(false);

  useEffect(() => {
    async function getMenuItems() {
      try {
        const [rows, discounts] = await Promise.all([listMenu(), listDiscounts()]);
        const normalizedItems = rows.map((item: any, index: number) => ({
          ...item,
          id: String(item.product_id),
          menuKey: `${String(item.product_id)}-${index}`,
          name: item.product_name,
          price: Number(item.price) || 0,
          category: normalizeCategory(item.category),
        }));
        setMenuItems(normalizedItems);
        setAvailableDiscounts(discounts.filter((discount: any) => discount.is_active).map((discount: any) => ({
          ...discount,
          id: discount.discount_id,
          name: discount.discount_name,
          type: discount.discount_type,
          value: Number(discount.discount_value),
        })));
      } catch (error) {
        console.error('Failed to load menu:', error);
        setMenuItems([]);
      } finally {
        setIsLoadingMenu(false);
      }
    }

    getMenuItems();
  }, []);

  // ---------------- MATH LOGIC ----------------
  const subtotal = cart.reduce((sum, item) => sum + item.unitPrice * item.quantity, 0);

  const getDiscountAmount = (disc: any) => {
    if (disc.type === 'flat') return disc.value;
    if (disc.type === 'percentage') return subtotal * (disc.value / 100);
    return 0;
  };

  const totalDiscountAmount = Math.min(
    appliedDiscounts.reduce((sum, disc) => sum + getDiscountAmount(disc), 0),
    subtotal
  );
  const finalTotal = Math.round(subtotal - totalDiscountAmount);

  // Split bill maths
  const splitPaid = splitPayments.reduce((sum, p) => sum + p.amount, 0);
  const splitRemaining = Math.max(0, finalTotal - splitPaid);
  const splitCashTotal = splitPayments.filter(p => p.method === 'cash').reduce((sum, p) => sum + p.amount, 0);
  const splitCashlessTotal = splitPaid - splitCashTotal;
  // Empty input = "the rest of the bill" / "exact cash"
  const pendingSplitAmount = splitAmount === '' ? splitRemaining : Number(splitAmount);
  const pendingCashReceived = splitCashReceived === '' ? pendingSplitAmount : Number(splitCashReceived);
  const canAddSplit =
    pendingSplitAmount > 0 &&
    pendingSplitAmount <= splitRemaining &&
    (splitMethod !== 'cash' || pendingCashReceived >= pendingSplitAmount);

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
    let unitPrice = item.price;
    const notes: string[] = [];

    // Walk the option groups in their defined order so identical picks always produce identical notes
    (item.options ?? []).forEach((group: any) => {
      const mod = selectedModifiers[group.group];
      if (!mod) return;
      unitPrice += mod.addPrice;
      if (mod.name !== 'Hot' && mod.name !== 'Fresh Milk') notes.push(mod.name);
    });
    const notesText = notes.join(', ');

    setCart(prev => {
      // Same product + same modifiers + same price (and no custom note) => stack
      const existing = prev.find(c =>
        c.id === item.id && c.unitPrice === unitPrice && c.notes === notesText && !c.orderNote
      );
      if (existing) {
        return prev.map(c => c.cartId === existing.cartId ? { ...c, quantity: c.quantity + 1 } : c);
      }
      return [...prev, {
        cartId: Math.random().toString(),
        id: item.id,
        name: item.name,
        unitPrice,
        quantity: 1,
        notes: notesText,
        orderNote: '',
      }];
    });
    setSelectedItem(null);
  };

  const changeQuantity = (cartId: string, delta: number) => {
    setCart(prev => prev.map(item => item.cartId === cartId
      ? { ...item, quantity: Math.max(1, item.quantity + delta) }
      : item
    ));
  };

  const startEditingNote = (cartItem: CartItem) => {
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

  // ---------------- SPLIT BILL ACTIONS ----------------
  const resetSplit = () => {
    setSplitPayments([]);
    setSplitAmount('');
    setSplitCashReceived('');
    setSplitMethod('cash');
  };

  const toggleSplitMode = () => {
    setIsSplitMode(prev => !prev);
    setCashGiven('');
    resetSplit();
  };

  const addSplitPayment = () => {
    if (!canAddSplit) return;
    setSplitPayments(prev => [...prev, {
      method: splitMethod,
      amount: pendingSplitAmount,
      cashReceived: splitMethod === 'cash' ? pendingCashReceived : 0,
    }]);
    setSplitAmount('');
    setSplitCashReceived('');
  };

  const removeSplitPayment = (index: number) => {
    setSplitPayments(prev => prev.filter((_, i) => i !== index));
  };

  const closeCheckout = () => {
    setIsCheckoutModalOpen(false);
    setCashGiven('');
    setIsSplitMode(false);
    resetSplit();
  };

  // ---------------- WHATSAPP RECEIPT ----------------
  const buildReceipt = (payments: PaymentLine[], isOpenBill: boolean) => {
    const divider = '--------------------------';
    const date = new Date().toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short' });

    const itemLines = cart.flatMap(item => [
      `${item.quantity}x ${item.name} - ${formatRp(item.unitPrice * item.quantity)}`,
      ...(item.notes ? [`   + ${item.notes}`] : []),
      ...(item.orderNote ? [`   Note: ${item.orderNote}`] : []),
    ]);

    const discountLines = appliedDiscounts.map(d => `${d.name}: -${formatRp(getDiscountAmount(d))}`);

    const paymentLines = isOpenBill
      ? ['*OPEN BILL* - payment pending']
      : [
          ...payments.map(p => {
            const base = `${paymentLabels[p.method]}: ${formatRp(p.amount)}`;
            if (p.method !== 'cash' || p.cashReceived <= p.amount) return base;
            return `${base} (received ${formatRp(p.cashReceived)}, change ${formatRp(p.cashReceived - p.amount)})`;
          }),
          ...(payments.length > 1 ? ['_Split bill_'] : []),
        ];

    return [
      '*TRISHA CAFE*',
      date,
      ...(orderName.trim() ? [`Order: ${orderName.trim()}`] : []),
      `Type: ${orderType === 'dine_in' ? 'Dine in' : 'Takeaway'}`,
      divider,
      ...itemLines,
      divider,
      `Subtotal: ${formatRp(subtotal)}`,
      ...discountLines,
      `*Total: ${formatRp(finalTotal)}*`,
      divider,
      ...paymentLines,
      '',
      'Thank you for visiting!',
    ].join('\n');
  };

  // ---------------- SUBMIT ----------------
  // Every payment path (QRIS / Other / Cash / Open Bill / Split) ends up here.
  const processOrder = async (payments: PaymentLine[], isOpenBill = false) => {
    const contact = normalizeWhatsAppNumber(orderContact);

    if (orderContact.trim() && !isValidWhatsAppNumber(contact)) {
      alert('The WhatsApp number looks invalid. Please check it or clear the field.');
      return;
    }
    if (isOpenBill && !orderName.trim()) {
      alert('Please enter an order name so the open bill can be found later.');
      return;
    }

    const receiptText = buildReceipt(payments, isOpenBill);

    // Open the tab now (inside the click) so the browser doesn't block it as a popup after the await.
    const waWindow = contact ? window.open('', '_blank') : null;

    setIsSubmittingOrder(true);

    try {
      await createTransaction({
        payment_method: isOpenBill ? 'open_bill' : payments.length > 1 ? 'split' : payments[0].method,
        status: isOpenBill ? 'pending' : 'paid',
        cash_received: payments.reduce((sum, p) => sum + p.cashReceived, 0),
        customer_name: orderName.trim() || null,
        customer_contact: contact || null,
        order_type: orderType,
        payments: payments.map(p => ({
          method: p.method,
          amount: p.amount,
          cash_received: p.cashReceived,
        })),
        discount_ids: appliedDiscounts.map(discount => discount.id),
        items: cart.map(item => ({
          product_id: item.id,
          quantity: item.quantity,
          order_note: [item.notes, item.orderNote].filter(Boolean).join(', '),
        })),
      });

      if (waWindow) {
        waWindow.location.href = `https://wa.me/${contact}?text=${encodeURIComponent(receiptText)}`;
      }

      const label = isOpenBill
        ? 'Open Bill'
        : payments.length > 1
          ? `Split (${payments.map(p => paymentLabels[p.method]).join(' + ')})`
          : paymentLabels[payments[0].method];
      alert(`Order saved to Supabase. Paid via ${label}.`);

      setCart([]);
      setAppliedDiscounts([]);
      setOrderName('');
      setOrderContact('');
      setOrderType('dine_in');
      closeCheckout();
    } catch (error) {
      waWindow?.close();
      alert(error instanceof Error ? error.message : 'Failed to save order.');
    } finally {
      setIsSubmittingOrder(false);
    }
  };

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
          <div className="bg-white w-full max-w-lg rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[95vh]">
            <div className="p-6 text-center border-b border-slate-100 bg-slate-50">
              <h2 className="text-slate-500 font-bold tracking-widest text-sm mb-1 uppercase">Total Amount Due</h2>
              <h1 className="text-5xl font-black text-blue-600 tracking-tight">Rp {finalTotal.toLocaleString('id-ID')}</h1>
              {(orderName.trim() || orderContact.trim()) && (
                <p className="text-xs text-slate-500 mt-2">
                  {orderName.trim()}{orderName.trim() && orderContact.trim() && ' • '}{orderContact.trim() && `Receipt → WhatsApp ${orderContact.trim()}`}
                </p>
              )}
            </div>
            <div className="p-6 flex flex-col gap-6 overflow-y-auto">
              <div>
                <div className="flex justify-between items-center mb-3">
                  <h3 className="text-sm font-bold text-slate-800 uppercase tracking-wider">Select Payment Method</h3>
                  <button
                    disabled={isSubmittingOrder}
                    onClick={toggleSplitMode}
                    className={`px-3 py-1 rounded-full text-xs font-bold border transition-colors disabled:opacity-50 ${isSplitMode ? 'bg-slate-800 text-white border-slate-800' : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'}`}
                  >
                    Split Bill
                  </button>
                </div>

                {!isSplitMode ? (
                  <>
                    <div className="grid grid-cols-3 gap-3">
                      <button disabled={isSubmittingOrder} onClick={() => processOrder([{ method: 'qris', amount: finalTotal, cashReceived: 0 }])} className="flex flex-col items-center justify-center gap-2 p-4 rounded-xl border-2 border-slate-200 hover:border-blue-500 hover:bg-blue-50 transition-colors text-slate-700 disabled:opacity-50">
                        <QrCode size={28} className="text-blue-600" /><span className="font-bold">QRIS</span>
                      </button>
                      <button disabled={isSubmittingOrder} onClick={() => processOrder([{ method: 'card', amount: finalTotal, cashReceived: 0 }])} className="flex flex-col items-center justify-center gap-2 p-4 rounded-xl border-2 border-slate-200 hover:border-blue-500 hover:bg-blue-50 transition-colors text-slate-700 disabled:opacity-50">
                        <CreditCard size={28} className="text-slate-500" /><span className="font-bold text-sm">Other</span>
                      </button>
                      <button onClick={() => setCashGiven(finalTotal)} className="flex flex-col items-center justify-center gap-2 p-4 rounded-xl border-2 border-slate-200 hover:border-emerald-500 hover:bg-emerald-50 transition-colors text-slate-700">
                        <Banknote size={28} className="text-emerald-600" /><span className="font-bold">Cash</span>
                      </button>
                    </div>
                    <button disabled={isSubmittingOrder} onClick={() => processOrder([], true)} className="w-full mt-3 flex items-center justify-center gap-2 p-3 rounded-xl border-2 border-amber-200 bg-amber-50 text-amber-800 hover:bg-amber-100 transition-colors font-bold disabled:opacity-50">
                      <Receipt size={20} /> Open Bill
                    </button>
                  </>
                ) : (
                  <div className="flex flex-col gap-3">
                    {/* Method for the next portion */}
                    <div className="grid grid-cols-3 gap-3">
                      {splitMethodOptions.map(({ value, label, Icon, active, iconClass }) => (
                        <button
                          key={value}
                          disabled={isSubmittingOrder}
                          onClick={() => setSplitMethod(value)}
                          className={`flex flex-col items-center justify-center gap-2 p-4 rounded-xl border-2 transition-colors text-slate-700 disabled:opacity-50 ${splitMethod === value ? active : 'border-slate-200 hover:border-slate-300'}`}
                        >
                          <Icon size={28} className={iconClass} /><span className="font-bold text-sm">{label}</span>
                        </button>
                      ))}
                    </div>

                    {/* Amount for this portion */}
                    {splitRemaining > 0 && (
                      <div className="bg-slate-50 p-4 rounded-xl border border-slate-200">
                        <label className="block text-xs font-bold text-slate-500 uppercase tracking-wide mb-2">
                          Amount ({splitMethod === 'cash' ? 'Cash' : 'Cashless'})
                        </label>
                        <input
                          type="number"
                          value={splitAmount}
                          placeholder={String(splitRemaining)}
                          onChange={(e) => setSplitAmount(e.target.value === '' ? '' : Number(e.target.value))}
                          className="w-full text-2xl font-bold bg-white border border-slate-300 rounded-lg p-3 outline-none focus:border-blue-500 mb-3"
                        />
                        {splitMethod === 'cash' && (
                          <>
                            <label className="block text-xs font-bold text-slate-500 uppercase tracking-wide mb-2">Cash Received</label>
                            <input
                              type="number"
                              value={splitCashReceived}
                              placeholder={String(pendingSplitAmount)}
                              onChange={(e) => setSplitCashReceived(e.target.value === '' ? '' : Number(e.target.value))}
                              className="w-full text-2xl font-bold bg-white border border-slate-300 rounded-lg p-3 outline-none focus:border-emerald-500 mb-3"
                            />
                            <div className="flex justify-between items-center text-lg mb-1">
                              <span className="font-bold text-slate-600">Change Due:</span>
                              <span className={`font-black ${pendingCashReceived >= pendingSplitAmount ? 'text-emerald-600' : 'text-red-500'}`}>
                                Rp {Math.max(0, pendingCashReceived - pendingSplitAmount).toLocaleString('id-ID')}
                              </span>
                            </div>
                          </>
                        )}
                        <button
                          disabled={!canAddSplit || isSubmittingOrder}
                          onClick={addSplitPayment}
                          className="w-full mt-3 bg-slate-800 disabled:bg-slate-300 text-white font-bold py-3 rounded-lg flex justify-center items-center gap-2"
                        >
                          <Plus size={16} /> Add Payment
                        </button>
                      </div>
                    )}

                    {/* Payments already added */}
                    {splitPayments.length > 0 && (
                      <div className="flex flex-col gap-2">
                        {splitPayments.map((p, index) => (
                          <div key={index} className="flex justify-between items-center bg-white p-3 rounded-lg border border-slate-200">
                            <div className="flex items-center gap-2">
                              <button disabled={isSubmittingOrder} onClick={() => removeSplitPayment(index)} className="text-slate-300 hover:text-red-500"><X size={16} /></button>
                              <div>
                                <p className="font-bold text-slate-800 text-sm">{paymentLabels[p.method]}</p>
                                <p className="text-xs text-slate-400 uppercase tracking-wide">{p.method === 'cash' ? 'Cash' : 'Cashless'}</p>
                              </div>
                            </div>
                            <span className="font-bold text-slate-800">Rp {p.amount.toLocaleString('id-ID')}</span>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Summary */}
                    <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 text-sm">
                      <div className="flex justify-between text-slate-600 mb-1"><span>Cash</span><span>Rp {splitCashTotal.toLocaleString('id-ID')}</span></div>
                      <div className="flex justify-between text-slate-600 mb-2"><span>Cashless</span><span>Rp {splitCashlessTotal.toLocaleString('id-ID')}</span></div>
                      <div className="flex justify-between items-center text-lg pt-2 border-t border-slate-200">
                        <span className="font-bold text-slate-600">Remaining:</span>
                        <span className={`font-black ${splitRemaining === 0 ? 'text-emerald-600' : 'text-red-500'}`}>
                          Rp {splitRemaining.toLocaleString('id-ID')}
                        </span>
                      </div>
                    </div>

                    <button
                      disabled={splitRemaining > 0 || splitPayments.length === 0 || isSubmittingOrder}
                      onClick={() => processOrder(splitPayments)}
                      className="w-full bg-emerald-600 disabled:bg-slate-300 text-white font-bold py-3 rounded-lg"
                    >
                      {isSubmittingOrder ? 'Saving...' : 'Confirm Payment'}
                    </button>
                  </div>
                )}
              </div>

              {!isSplitMode && cashGiven !== '' && (
                <div className="bg-slate-50 p-4 rounded-xl border border-slate-200">
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-wide mb-2">Cash Received</label>
                  <input type="number" value={cashGiven} onChange={(e) => setCashGiven(Number(e.target.value))} className="w-full text-2xl font-bold bg-white border border-slate-300 rounded-lg p-3 outline-none focus:border-emerald-500 mb-3" />
                  <div className="flex justify-between items-center text-lg">
                    <span className="font-bold text-slate-600">Change Due:</span>
                    <span className={`font-black ${Number(cashGiven) >= finalTotal ? 'text-emerald-600' : 'text-red-500'}`}>
                      Rp {Math.max(0, Number(cashGiven) - finalTotal).toLocaleString('id-ID')}
                    </span>
                  </div>
                  <button
                    disabled={Number(cashGiven) < finalTotal || isSubmittingOrder}
                    onClick={() => processOrder([{ method: 'cash', amount: finalTotal, cashReceived: Number(cashGiven) }])}
                    className="w-full mt-4 bg-emerald-600 disabled:bg-slate-300 text-white font-bold py-3 rounded-lg"
                  >
                    {isSubmittingOrder ? 'Saving...' : 'Confirm Payment'}
                  </button>
                </div>
              )}
            </div>
            <div className="p-4 border-t border-slate-100">
              <button onClick={closeCheckout} className="w-full bg-slate-100 text-slate-600 font-bold py-3 rounded-xl hover:bg-slate-200">Cancel</button>
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
              <Image src="/logo/logo.png" alt="Trisha Cafe Logo" width={32} height={32} quality={90} className="object-contain" /> TRISHA POS
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

        {/* Order name & contact */}
        <div className="p-3 border-b border-slate-100 bg-white grid grid-cols-2 gap-2">
          <input
            type="text"
            value={orderName}
            onChange={(e) => setOrderName(e.target.value)}
            placeholder="Order name"
            className="bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-blue-500 min-w-0"
          />
          <input
            type="tel"
            inputMode="tel"
            value={orderContact}
            onChange={(e) => setOrderContact(e.target.value)}
            placeholder="WhatsApp (08xx...)"
            className="bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-blue-500 min-w-0"
          />
        </div>
        <div className="grid grid-cols-2 gap-2 border-b border-slate-100 bg-white p-3 pt-0">
          {([
            { value: 'dine_in', label: 'Dine in' },
            { value: 'takeaway', label: 'Takeaway' },
          ] as const).map(option => (
            <button
              key={option.value}
              type="button"
              onClick={() => setOrderType(option.value)}
              className={`rounded-lg border px-3 py-2 text-sm font-semibold transition-colors ${orderType === option.value ? 'border-blue-500 bg-blue-50 text-blue-700' : 'border-slate-200 bg-slate-50 text-slate-600 hover:bg-slate-100'}`}
            >
              {option.label}
            </button>
          ))}
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
                  <div className="flex items-center gap-2 mt-2">
                    <button
                      onClick={() => changeQuantity(cartItem.cartId, -1)}
                      disabled={cartItem.quantity <= 1}
                      className="p-1 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-md disabled:opacity-40"
                      title="Decrease quantity"
                    ><Minus size={14} /></button>
                    <span className="min-w-[1.5rem] text-center font-bold text-sm text-slate-800">{cartItem.quantity}</span>
                    <button
                      onClick={() => changeQuantity(cartItem.cartId, 1)}
                      className="p-1 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-md"
                      title="Increase quantity"
                    ><Plus size={14} /></button>
                    {cartItem.quantity > 1 && (
                      <span className="text-xs text-slate-400">@ Rp {cartItem.unitPrice.toLocaleString('id-ID')}</span>
                    )}
                  </div>
                </div>
                <div className="flex flex-col items-end gap-2">
                  <span className="font-bold text-slate-800">Rp {(cartItem.unitPrice * cartItem.quantity).toLocaleString('id-ID')}</span>
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
                    <button onClick={() => removeDiscount(disc.id)} className="text-slate-400 hover:text-red-500"><X size={14}/></button>
                    <span>{disc.name} {disc.type === 'percentage' && `(${disc.value}%)`}</span>
                  </div>
                  <span className="text-emerald-600 font-medium">- Rp {getDiscountAmount(disc).toLocaleString('id-ID')}</span>
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
