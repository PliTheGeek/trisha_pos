'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  Banknote, CheckCircle2, ChevronRight, Coffee, CreditCard, Minus, Plus,
  QrCode, ShoppingBag, Truck, Utensils, X,
} from 'lucide-react';
import {
  listScanMenu,
  submitScanOrder,
  type ScanOrderType,
  type ScanPaymentMethod,
} from '@/app/actions/scan-orders';

type MenuChoice = { name: string; addPrice: number };
type MenuOption = { group: string; choices: MenuChoice[] };
type MenuItem = {
  product_id: string;
  product_name: string;
  category: string;
  price: number;
  description: string | null;
  options: MenuOption[] | null;
};
type CartLine = {
  cart_id: string;
  item: MenuItem;
  selections: Record<string, string>;
  quantity: number;
  unit_price: number;
};

const orderTypes: { value: ScanOrderType; label: string; Icon: typeof Utensils }[] = [
  { value: 'dine_in', label: 'Dine in', Icon: Utensils },
  { value: 'takeaway', label: 'Takeaway / pickup', Icon: ShoppingBag },
  { value: 'delivery', label: 'Delivery', Icon: Truck },
];

const paymentOptions: { value: ScanPaymentMethod; label: string; Icon: typeof Banknote }[] = [
  { value: 'cash', label: 'Cash', Icon: Banknote },
  { value: 'qris', label: 'QRIS', Icon: QrCode },
  { value: 'card', label: 'Other / card', Icon: CreditCard },
];

function normalizeWhatsAppNumber(value: string) {
  const trimmed = value.trim();
  const digits = trimmed.replace(/\D/g, '');
  if (!digits || trimmed.startsWith('+') || digits.startsWith('62')) return digits;
  if (digits.startsWith('0')) return `62${digits.slice(1)}`;
  if (digits.startsWith('8')) return `62${digits}`;
  return digits;
}

function formatRp(value: number) {
  return `Rp ${value.toLocaleString('id-ID')}`;
}

export default function CustomerMenu() {
  const [menuItems, setMenuItems] = useState<MenuItem[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
  const [activeCategory, setActiveCategory] = useState('All');
  const [cart, setCart] = useState<CartLine[]>([]);
  const [selectedItem, setSelectedItem] = useState<MenuItem | null>(null);
  const [selections, setSelections] = useState<Record<string, string>>({});
  const [isCartOpen, setIsCartOpen] = useState(false);
  const [customerName, setCustomerName] = useState('');
  const [customerContact, setCustomerContact] = useState('');
  const [orderType, setOrderType] = useState<ScanOrderType>('dine_in');
  const [paymentMethod, setPaymentMethod] = useState<ScanPaymentMethod>('cash');
  const [orderNotes, setOrderNotes] = useState('');
  const [orderNumber, setOrderNumber] = useState('');
  const [orderTotal, setOrderTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    let active = true;
    listScanMenu()
      .then(menu => {
        if (!active) return;
        setMenuItems(menu.items);
        setCategories(menu.categories);
        setActiveCategory(menu.categories[0] ?? 'All');
      })
      .catch(loadError => {
        if (active) setError(loadError instanceof Error ? loadError.message : 'Unable to load the menu.');
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => { active = false; };
  }, []);

  const visibleItems = useMemo(
    () => menuItems.filter(item => item.category === activeCategory),
    [activeCategory, menuItems]
  );
  const total = cart.reduce((sum, line) => sum + line.unit_price * line.quantity, 0);
  const itemCount = cart.reduce((sum, line) => sum + line.quantity, 0);

  function addToCart(item: MenuItem, chosenOptions: Record<string, string>) {
    const optionPrice = (item.options ?? []).reduce((sum, group) => {
      const choice = group.choices.find(option => option.name === chosenOptions[group.group]);
      return sum + (choice?.addPrice ?? 0);
    }, 0);
    const unitPrice = Number(item.price) + optionPrice;
    const optionKey = JSON.stringify(chosenOptions);

    setCart(current => {
      const existing = current.find(line =>
        line.item.product_id === item.product_id
        && line.unit_price === unitPrice
        && JSON.stringify(line.selections) === optionKey
      );
      if (existing) {
        return current.map(line => line.cart_id === existing.cart_id
          ? { ...line, quantity: line.quantity + 1 }
          : line);
      }
      return [...current, {
        cart_id: crypto.randomUUID(),
        item,
        selections: chosenOptions,
        quantity: 1,
        unit_price: unitPrice,
      }];
    });
    setSelectedItem(null);
    setSelections({});
  }

  function updateQuantity(cartId: string, delta: number) {
    setCart(current => current
      .map(line => line.cart_id === cartId ? { ...line, quantity: line.quantity + delta } : line)
      .filter(line => line.quantity > 0));
  }

  async function placeOrder() {
    const normalizedContact = normalizeWhatsAppNumber(customerContact);
    if (!customerName.trim()) {
      setError('Enter your name to continue.');
      return;
    }
    if (!/^\d{9,15}$/.test(normalizedContact)) {
      setError('Enter a valid WhatsApp number. Include your country code if you are outside Indonesia.');
      return;
    }
    if (cart.length === 0) {
      setError('Add at least one menu item to your order.');
      return;
    }
    setSubmitting(true);
    setError('');
    try {
      const result = await submitScanOrder({
        customer_name: customerName.trim(),
        customer_contact: normalizedContact,
        order_type: orderType,
        payment_method: orderType === 'delivery' ? null : paymentMethod,
        notes: orderNotes.trim(),
        items: cart.map(line => ({
          product_id: line.item.product_id,
          quantity: line.quantity,
          selections: line.selections,
        })),
      });
      setOrderNumber(result.order_number);
      setOrderTotal(Number(result.total));
      setSuccess(true);
      setIsCartOpen(false);
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : 'Unable to submit your order. Please try again.');
    } finally {
      setSubmitting(false);
    }
  }

  if (success) {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center bg-slate-50 p-6 text-center text-slate-800">
        <div className="mb-6 flex h-20 w-20 items-center justify-center rounded-full bg-emerald-100">
          <CheckCircle2 size={40} className="text-emerald-600" />
        </div>
        <h1 className="mb-2 text-2xl font-black">Order received</h1>
        <p className="mb-2 text-lg font-bold text-blue-700">{orderNumber}</p>
        <p className="mb-2 text-slate-600">Total: {formatRp(orderTotal)}</p>
        <p className="max-w-md text-slate-500">
          {orderType === 'delivery'
            ? `Thanks, ${customerName}. Our cashier will contact you on WhatsApp to arrange delivery and payment.`
            : `Thanks, ${customerName}. Your ${orderType === 'dine_in' ? 'dine-in' : 'pickup'} order is with the store. Payment preference: ${paymentOptions.find(option => option.value === paymentMethod)?.label}. Please complete payment with the cashier; no online payment was taken.`}
        </p>
      </main>
    );
  }

  return (
    <main className="relative min-h-screen bg-slate-50 pb-28 font-sans text-slate-800">
      {selectedItem && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/60 p-0 backdrop-blur-sm sm:items-center sm:p-4">
          <section className="flex max-h-[85vh] w-full flex-col overflow-hidden rounded-t-2xl bg-white shadow-2xl sm:max-w-md sm:rounded-2xl">
            <header className="flex items-center justify-between border-b p-5">
              <div><h2 className="text-xl font-black">{selectedItem.product_name}</h2><p className="text-sm text-slate-500">{formatRp(Number(selectedItem.price))}</p></div>
              <button onClick={() => setSelectedItem(null)} className="rounded-full bg-slate-100 p-2 text-slate-500"><X size={20} /></button>
            </header>
            <div className="flex-1 overflow-y-auto bg-slate-50 p-5">
              {(selectedItem.options ?? []).map(group => (
                <fieldset key={group.group} className="mb-5 last:mb-0">
                  <legend className="mb-2 text-sm font-bold uppercase tracking-wide">{group.group}</legend>
                  <div className="flex flex-col gap-2">
                    {group.choices.map(choice => (
                      <button
                        key={choice.name}
                        type="button"
                        onClick={() => setSelections(current => ({ ...current, [group.group]: choice.name }))}
                        className={`flex items-center justify-between rounded-xl border-2 bg-white p-4 text-left ${selections[group.group] === choice.name ? 'border-blue-600' : 'border-transparent'}`}
                      >
                        <span className="font-semibold">{choice.name}</span>
                        {choice.addPrice > 0 && <span className="text-sm text-slate-500">+{formatRp(choice.addPrice)}</span>}
                      </button>
                    ))}
                  </div>
                </fieldset>
              ))}
            </div>
            <footer className="border-t bg-white p-5">
              <button onClick={() => addToCart(selectedItem, selections)} className="w-full rounded-xl bg-slate-800 py-4 text-lg font-bold text-white">Add to order</button>
            </footer>
          </section>
        </div>
      )}

      {isCartOpen && (
        <div className="fixed inset-0 z-40 flex items-end justify-center bg-slate-900/60 p-0 sm:items-center sm:p-4">
          <section className="flex max-h-[95vh] w-full flex-col overflow-hidden rounded-t-2xl bg-white shadow-2xl sm:max-w-lg sm:rounded-2xl">
            <header className="flex items-center justify-between border-b p-5">
              <h2 className="text-xl font-black">Review your order</h2>
              <button onClick={() => setIsCartOpen(false)} className="rounded-full bg-slate-100 p-2 text-slate-500"><X size={20} /></button>
            </header>
            <div className="flex-1 space-y-4 overflow-y-auto bg-slate-50 p-5">
              {cart.map(line => (
                <article key={line.cart_id} className="flex items-start justify-between gap-3 rounded-xl border border-slate-100 bg-white p-4">
                  <div className="min-w-0 flex-1">
                    <h3 className="font-bold">{line.item.product_name}</h3>
                    {Object.entries(line.selections).map(([group, choice]) => <p key={group} className="text-sm text-slate-500">{group}: {choice}</p>)}
                    <div className="mt-3 flex items-center gap-3">
                      <button aria-label={`Remove one ${line.item.product_name}`} onClick={() => updateQuantity(line.cart_id, -1)} className="rounded-md bg-slate-100 p-1.5"><Minus size={16} /></button>
                      <span className="min-w-5 text-center font-bold">{line.quantity}</span>
                      <button aria-label={`Add one ${line.item.product_name}`} onClick={() => updateQuantity(line.cart_id, 1)} className="rounded-md bg-slate-100 p-1.5"><Plus size={16} /></button>
                    </div>
                  </div>
                  <span className="whitespace-nowrap font-bold">{formatRp(line.unit_price * line.quantity)}</span>
                </article>
              ))}

              <section className="space-y-3 rounded-xl border border-slate-100 bg-white p-4">
                <h3 className="font-bold">Your details</h3>
                <label className="block text-sm font-semibold">Name (required)
                  <input required maxLength={80} value={customerName} onChange={event => setCustomerName(event.target.value)} placeholder="Your name" className="mt-1 w-full rounded-lg border border-slate-300 p-3 font-normal outline-none focus:border-blue-500" />
                </label>
                <label className="block text-sm font-semibold">WhatsApp number (required)
                  <input required type="tel" inputMode="tel" value={customerContact} onChange={event => setCustomerContact(event.target.value)} placeholder="08xx or +country code" className="mt-1 w-full rounded-lg border border-slate-300 p-3 font-normal outline-none focus:border-blue-500" />
                </label>
                <fieldset>
                  <legend className="mb-2 text-sm font-semibold">Order type</legend>
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                    {orderTypes.map(({ value, label, Icon }) => (
                      <button key={value} type="button" onClick={() => setOrderType(value)} className={`flex items-center justify-center gap-2 rounded-lg border p-3 text-sm font-bold ${orderType === value ? 'border-blue-500 bg-blue-50 text-blue-700' : 'border-slate-200 bg-white text-slate-600'}`}>
                        <Icon size={16} />{label}
                      </button>
                    ))}
                  </div>
                </fieldset>
                {orderType !== 'delivery' ? (
                  <fieldset>
                    <legend className="mb-2 text-sm font-semibold">Payment preference</legend>
                    <div className="grid grid-cols-3 gap-2">
                      {paymentOptions.map(({ value, label, Icon }) => (
                        <button key={value} type="button" onClick={() => setPaymentMethod(value)} className={`flex flex-col items-center gap-2 rounded-lg border-2 p-3 text-xs font-bold ${paymentMethod === value ? 'border-blue-500 bg-blue-50 text-blue-700' : 'border-slate-200 bg-white text-slate-600'}`}>
                          <Icon size={22} />{label}
                        </button>
                      ))}
                    </div>
                    <p className="mt-2 text-xs text-slate-500">Payment is completed with the cashier. This form does not charge your card or process QRIS.</p>
                  </fieldset>
                ) : <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-800">The store will contact you on WhatsApp to arrange delivery and payment.</p>}
                <label className="block text-sm font-semibold">Order notes
                  <textarea maxLength={500} value={orderNotes} onChange={event => setOrderNotes(event.target.value)} placeholder="Allergies, delivery instructions, or other requests" rows={3} className="mt-1 w-full resize-none rounded-lg border border-slate-300 p-3 font-normal outline-none focus:border-blue-500" />
                </label>
              </section>
              {error && <p role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</p>}
            </div>
            <footer className="border-t bg-white p-5">
              <div className="mb-4 flex justify-between font-bold"><span>Total</span><span className="text-xl text-blue-600">{formatRp(total)}</span></div>
              <button disabled={submitting} onClick={() => void placeOrder()} className="flex w-full items-center justify-center gap-2 rounded-xl bg-blue-600 py-4 text-lg font-bold text-white disabled:opacity-50">
                {submitting ? 'Sending order...' : 'Place order'} <ChevronRight size={20} />
              </button>
            </footer>
          </section>
        </div>
      )}

      <header className="sticky top-0 z-30 flex items-center justify-between bg-white px-5 py-4 shadow-sm">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-black"><Coffee size={23} className="text-blue-600" /> TRISHA CAFE</h1>
          <p className="mt-1 text-sm text-slate-500">Order from your phone</p>
        </div>
        <button onClick={() => setIsCartOpen(true)} disabled={!cart.length} aria-label={`View cart, ${itemCount} items`} className="relative rounded-xl bg-slate-800 p-3 text-white disabled:opacity-40">
          <ShoppingBag size={21} />
          {itemCount > 0 && <span className="absolute -right-2 -top-2 flex h-5 min-w-5 items-center justify-center rounded-full bg-blue-600 px-1 text-xs font-bold">{itemCount}</span>}
        </button>
      </header>

      <nav aria-label="Menu categories" className="sticky top-[72px] z-20 overflow-x-auto border-t border-slate-100 bg-white/95 px-5 py-3 shadow-sm">
        <div className="flex gap-2">
          {categories.map(category => (
            <button key={category} onClick={() => setActiveCategory(category)} className={`whitespace-nowrap rounded-full px-5 py-2.5 text-sm font-bold ${activeCategory === category ? 'bg-slate-800 text-white' : 'border border-slate-200 bg-white text-slate-600'}`}>
              {category}
            </button>
          ))}
        </div>
      </nav>

      <section className="p-5">
        <h2 className="mb-4 text-xl font-black">{activeCategory || 'Menu'}</h2>
        {loading && <p className="py-12 text-center text-slate-500">Loading menu...</p>}
        {!loading && error && menuItems.length === 0 && <p role="alert" className="rounded-xl bg-red-50 p-4 text-red-700">{error}</p>}
        {!loading && !error && visibleItems.length === 0 && <p className="py-12 text-center text-slate-500">No items in this category right now.</p>}
        <div className="flex flex-col gap-3">
          {visibleItems.map(item => (
            <button key={item.product_id} onClick={() => {
              if (item.options?.length) {
                setSelectedItem(item);
                setSelections({});
              } else {
                addToCart(item, {});
              }
            }} className="flex items-center justify-between gap-4 rounded-2xl border border-slate-200 bg-white p-5 text-left shadow-sm active:bg-slate-50">
              <div className="min-w-0">
                <h3 className="text-lg font-bold">{item.product_name}</h3>
                {item.description && <p className="mt-1 line-clamp-2 text-sm text-slate-500">{item.description}</p>}
                {item.options?.length ? <span className="mt-2 inline-block rounded border border-blue-100 bg-blue-50 px-2 py-0.5 text-[10px] font-bold uppercase text-blue-600">Customizable</span> : null}
              </div>
              <div className="flex shrink-0 flex-col items-end gap-2">
                <span className="whitespace-nowrap text-lg font-bold text-blue-600">{formatRp(Number(item.price))}</span>
                <span className="flex h-8 w-8 items-center justify-center rounded-full bg-slate-100 text-xl font-bold">+</span>
              </div>
            </button>
          ))}
        </div>
      </section>

      {itemCount > 0 && (
        <div className="fixed bottom-0 left-0 right-0 z-30 p-4">
          <button onClick={() => setIsCartOpen(true)} className="flex w-full items-center justify-between rounded-2xl bg-slate-800 p-4 text-white shadow-2xl">
            <span className="font-bold">{itemCount} item{itemCount === 1 ? '' : 's'} · Review order</span>
            <span className="text-lg font-black">{formatRp(total)}</span>
          </button>
        </div>
      )}
    </main>
  );
}
