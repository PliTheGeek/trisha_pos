'use client';

import { useEffect, useState } from 'react';
import { ArrowLeft, Edit, Plus, Tags, Trash2, Percent, Ribbon } from 'lucide-react';
import Link from 'next/link';
import {
  createMenu, createMenuCategory, deleteMenu, deleteMenuCategory, listMenu, listMenuCategories, renameMenuCategory, updateMenu,
} from '@/app/actions/menu';
import {
  createDiscount, deleteDiscount, listDiscounts, updateDiscount,
} from '@/app/actions/discounts';
import {
  createContact, deleteContact, listContacts, updateContact, type Contact,
} from '@/app/actions/contacts';

type Menu = {
  product_id: string; product_name: string; category: string; price: number; cogs: number; description: string;
};
type Discount = {
  discount_id: string; discount_name: string; discount_type: 'percentage' | 'flat'; discount_value: number;
  minimum_subtotal: number; is_active: boolean;
};
type ManageTab = 'menu' | 'category' | 'discount';

const emptyMenu = { name: '', category: '', price: '', cogs: '', description: '' };
const emptyCategory = { name: '' };
type DiscountForm = { name: string; type: 'percentage' | 'flat'; value: string; minimum_subtotal: string };
const emptyDiscount: DiscountForm = { name: '', type: 'percentage', value: '', minimum_subtotal: '' };
const emptyContact = { name: '', phone: '' };

export default function ManageInterface() {
  const [tab, setTab] = useState<ManageTab>('menu');
  const [menus, setMenus] = useState<Menu[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
  const [discounts, setDiscounts] = useState<Discount[]>([]);
  const [contactList, setContactList] = useState<Contact[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [menuForm, setMenuForm] = useState(emptyMenu);
  const [categoryForm, setCategoryForm] = useState(emptyCategory);
  const [discountForm, setDiscountForm] = useState(emptyDiscount);
  const [contactForm, setContactForm] = useState(emptyContact);
  const [message, setMessage] = useState('');
  const [saving, setSaving] = useState(false);

  async function load() {
    try {
      const [menuRows, categoryRows, discountRows] = await Promise.all([listMenu(), listMenuCategories(), listDiscounts()]);
      setMenus(menuRows as Menu[]);
      setCategories(categoryRows);
      setDiscounts(discountRows as Discount[]);
      setContactList(contactRows);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Failed to load data.');
    }
  }

  // Data loading is intentionally started after mount.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { void load(); }, []);

  function reset() {
    setEditingId(null);
    setMenuForm(emptyMenu);
    setCategoryForm(emptyCategory);
    setDiscountForm(emptyDiscount);
    setContactForm(emptyContact);
    setMessage('');
  }

  async function save() {
    setSaving(true);
    setMessage('');
    try {
      if (tab === 'menu') {
        if (!menuForm.name.trim()) throw new Error('Menu name is required.');
        const input = {
          product_id: editingId ?? `P-${Date.now()}`, product_name: menuForm.name.trim(),
          category: menuForm.category, price: Number(menuForm.price),
          cogs: Number(menuForm.cogs) || 0, description: menuForm.description.trim(),
        };
        if (editingId) await updateMenu(editingId, input);
        else await createMenu(input);
      } else if (tab === 'category') {
        if (!categoryForm.name.trim()) throw new Error('Category name is required.');
        if (editingId) await renameMenuCategory(editingId, categoryForm.name.trim());
        else await createMenuCategory(categoryForm.name.trim());
      } else {
        if (!discountForm.name.trim() || Number(discountForm.value) <= 0) {
          throw new Error('Discount name and positive value are required.');
        }
        const input = {
          discount_id: editingId ?? `D-${Date.now()}`, discount_name: discountForm.name.trim(),
          discount_type: discountForm.type, discount_value: Number(discountForm.value),
          minimum_subtotal: Number(discountForm.minimum_subtotal) || 0,
          is_active: true,
        };
        if (editingId) await updateDiscount(editingId, input);
        else await createDiscount(input);
      } else {
        if (!contactForm.name.trim() || !contactForm.phone.trim()) {
          throw new Error('Contact name and phone are required.');
        }
        if (editingId) await updateContact(editingId, contactForm);
        else await createContact(contactForm);
      }
      await load();
      reset();
      setMessage('Saved successfully.');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Save failed.');
    } finally {
      setSaving(false);
    }
  }

  function editMenu(item: Menu) {
    setTab('menu'); setEditingId(item.product_id);
    setMenuForm({ name: item.product_name, category: item.category, price: String(item.price), cogs: String(item.cogs), description: item.description });
  }

  function editDiscount(item: Discount) {
    setTab('discount'); setEditingId(item.discount_id);
    setDiscountForm({ name: item.discount_name, type: item.discount_type, value: String(item.discount_value), minimum_subtotal: String(item.minimum_subtotal) });
  }

  function editCategory(category: string) {
    setTab('category');
    setEditingId(category);
    setCategoryForm({ name: category });
    setMessage('');
  }

  async function remove(id: string, type: 'menu' | 'category' | 'discount') {
    const prompt = type === 'category'
      ? 'Delete this category? It must not be assigned to any menu item.'
      : 'Delete this record?';
    if (!window.confirm(prompt)) return;
    try {
      if (type === 'menu') await deleteMenu(id);
      else if (type === 'category') await deleteMenuCategory(id);
      else await deleteDiscount(id);
      await load();
      reset();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Delete failed.');
    }
  }

  return (
    <div className="min-h-screen bg-slate-50 text-slate-800">
      <main className="mx-auto max-w-7xl p-4 sm:p-6">
        <header className="mb-6 flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <Link href="/" className="border border-slate-200 bg-white p-2 shadow-sm"><ArrowLeft size={20} /></Link>
            <div><p className="text-xs font-semibold uppercase tracking-widest text-slate-400">Catalog</p><h1 className="text-xl font-bold">Data Management</h1></div>
          </div>
          <div className="flex w-full gap-1 border border-slate-200 bg-white p-1 shadow-sm sm:w-auto">
            <button onClick={() => { setTab('menu'); reset(); }} className={`flex-1 px-3 py-2 text-sm font-semibold sm:flex-none ${tab === 'menu' ? 'bg-slate-800 text-white' : 'text-slate-500 hover:bg-slate-100'}`}><Tags size={15} className="mr-1 inline" />Menu</button>
            <button onClick={() => { setTab('category'); reset(); }} className={`flex-1 px-3 py-2 text-sm font-semibold sm:flex-none ${tab === 'category' ? 'bg-slate-800 text-white' : 'text-slate-500 hover:bg-slate-100'}`}><Ribbon size={15} className="mr-1 inline" />Categories</button>
            <button onClick={() => { setTab('discount'); reset(); }} className={`flex-1 px-3 py-2 text-sm font-semibold sm:flex-none ${tab === 'discount' ? 'bg-slate-800 text-white' : 'text-slate-500 hover:bg-slate-100'}`}><Percent size={15} className="mr-1 inline" />Discounts</button>
            <button onClick={() => { setTab('contacts'); reset(); }} className={`flex-1 px-3 py-2 text-sm font-semibold sm:flex-none ${tab === 'contacts' ? 'bg-slate-800 text-white' : 'text-slate-500 hover:bg-slate-100'}`}><Phone size={15} className="mr-1 inline" />Contacts</button>
          </div>
        </header>
        {message && <p className="mb-4 border border-blue-100 bg-blue-50 p-3 text-sm text-blue-700 shadow-sm">{message}</p>}
        <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_360px]">
        <section className="min-w-0 overflow-hidden border border-slate-200 bg-white shadow-sm">
          <div className="border-b px-5 py-4"><h2 className="font-bold">{tab === 'menu' ? 'Menu items' : tab === 'category' ? 'Menu categories' : 'Discount rules'}</h2><p className="text-xs text-slate-400">Manage active catalog data</p></div>
          <div className="overflow-x-auto">
          {tab === 'menu' ? (
            <table className="w-full min-w-[560px] text-left text-sm"><thead><tr className="border-b bg-slate-50 text-xs uppercase tracking-wide text-slate-500"><th className="p-4">Name</th><th className="p-4">Category</th><th className="p-4">Price</th><th className="p-4 text-right">Actions</th></tr></thead>
              <tbody>{menus.map(item => <tr key={item.product_id} className="border-b last:border-0 hover:bg-slate-50"><td className="p-4 font-semibold">{item.product_name}</td><td className="p-4 text-slate-500">{item.category}</td><td className="p-4">Rp {Number(item.price).toLocaleString('id-ID')}</td><td className="p-4 text-right"><button aria-label={`Edit ${item.product_name}`} onClick={() => editMenu(item)} className="mr-2 border border-blue-100 p-2 text-blue-600 shadow-sm hover:bg-blue-50"><Edit size={16} /></button><button aria-label={`Delete ${item.product_name}`} onClick={() => void remove(item.product_id, 'menu')} className="border border-red-100 p-2 text-red-600 shadow-sm hover:bg-red-50"><Trash2 size={16} /></button></td></tr>)}</tbody>
            </table>
          ) : tab === 'category' ? (
            <table className="w-full min-w-[420px] text-left text-sm"><thead><tr className="border-b bg-slate-50 text-xs uppercase tracking-wide text-slate-500"><th className="p-4">Category</th><th className="p-4">Menu items</th><th className="p-4 text-right">Actions</th></tr></thead>
              <tbody>{categories.map(category => <tr key={category} className="border-b last:border-0 hover:bg-slate-50"><td className="p-4 font-semibold"><Ribbon size={15} className="mr-2 inline text-slate-400" />{category}</td><td className="p-4 text-slate-500">{menus.filter(item => item.category === category).length}</td><td className="p-4 text-right"><button aria-label={`Edit ${category}`} onClick={() => editCategory(category)} className="mr-2 border border-blue-100 p-2 text-blue-600 shadow-sm hover:bg-blue-50"><Edit size={16} /></button><button aria-label={`Delete ${category}`} onClick={() => void remove(category, 'category')} className="border border-red-100 p-2 text-red-600 shadow-sm hover:bg-red-50"><Trash2 size={16} /></button></td></tr>)}</tbody>
            </table>
          ) : (
            <table className="w-full min-w-[560px] text-left text-sm"><thead><tr className="border-b bg-slate-50 text-xs uppercase tracking-wide text-slate-500"><th className="p-4">Name</th><th className="p-4">Type</th><th className="p-4">Value</th><th className="p-4 text-right">Actions</th></tr></thead>
              <tbody>{discounts.map(item => <tr key={item.discount_id} className="border-b last:border-0 hover:bg-slate-50"><td className="p-4 font-semibold">{item.discount_name}</td><td className="p-4 text-slate-500">{item.discount_type}</td><td className="p-4">{item.discount_type === 'flat' ? `Rp ${Number(item.discount_value).toLocaleString('id-ID')}` : `${item.discount_value}%`}</td><td className="p-4 text-right"><button aria-label={`Edit ${item.discount_name}`} onClick={() => editDiscount(item)} className="mr-2 border border-blue-100 p-2 text-blue-600 shadow-sm hover:bg-blue-50"><Edit size={16} /></button><button aria-label={`Delete ${item.discount_name}`} onClick={() => void remove(item.discount_id, 'discount')} className="border border-red-100 p-2 text-red-600 shadow-sm hover:bg-red-50"><Trash2 size={16} /></button></td></tr>)}</tbody>
            </table>
          ) : (
            <table className="w-full min-w-[400px] text-left text-sm"><thead><tr className="border-b bg-slate-50 text-xs uppercase tracking-wide text-slate-500"><th className="p-4">Name</th><th className="p-4">Phone</th><th className="p-4 text-right">Actions</th></tr></thead>
              <tbody>{contactList.map(item => <tr key={item.contact_id} className="border-b last:border-0 hover:bg-slate-50"><td className="p-4 font-semibold">{item.name}</td><td className="p-4 text-slate-500">{item.phone}</td><td className="p-4 text-right"><button aria-label={`Edit ${item.name}`} onClick={() => editContactItem(item)} className="mr-2 border border-blue-100 p-2 text-blue-600 shadow-sm hover:bg-blue-50"><Edit size={16} /></button><button aria-label={`Delete ${item.name}`} onClick={() => void remove(item.contact_id, 'contacts')} className="border border-red-100 p-2 text-red-600 shadow-sm hover:bg-red-50"><Trash2 size={16} /></button></td></tr>)}</tbody>
            </table>
          )}
          </div>
        </section>
        <aside className="border border-slate-200 bg-white p-5 shadow-sm">
        <div className="mb-5 flex items-center justify-between"><div><p className="text-xs font-semibold uppercase tracking-wide text-slate-400">{editingId ? 'Update existing' : 'Create new'}</p><h2 className="font-bold">{editingId ? 'Edit' : 'Add'} {tab === 'contacts' ? 'contact' : tab}</h2></div><button aria-label="Reset form" onClick={reset} className="border border-blue-100 bg-blue-50 p-2 text-blue-600 shadow-sm hover:bg-blue-100"><Plus size={18} /></button></div>
        {tab === 'menu' ? <div className="space-y-3">
          <input className="field" placeholder="Name" value={menuForm.name} onChange={e => setMenuForm({ ...menuForm, name: e.target.value })} />
          <select className="field" value={menuForm.category} onChange={e => setMenuForm({ ...menuForm, category: e.target.value })} required><option value="" disabled>Select category</option>{categories.map(category => <option key={category} value={category}>{category}</option>)}</select>
          <input className="field" type="number" placeholder="Price" value={menuForm.price} onChange={e => setMenuForm({ ...menuForm, price: e.target.value })} />
          <input className="field" type="number" placeholder="COGS" value={menuForm.cogs} onChange={e => setMenuForm({ ...menuForm, cogs: e.target.value })} />
          <textarea className="field" placeholder="Description" value={menuForm.description} onChange={e => setMenuForm({ ...menuForm, description: e.target.value })} />
        </div> : tab === 'category' ? <div className="space-y-3">
          <label className="block text-xs font-semibold uppercase tracking-wide text-slate-500" htmlFor="category-name">Category name</label>
          <input id="category-name" className="field" placeholder="e.g. Coffee, Snacks" value={categoryForm.name} onChange={e => setCategoryForm({ name: e.target.value })} />
        </div> : <div className="space-y-3">
          <input className="field" placeholder="Discount name" value={discountForm.name} onChange={e => setDiscountForm({ ...discountForm, name: e.target.value })} />
          <select className="field" value={discountForm.type} onChange={e => setDiscountForm({ ...discountForm, type: e.target.value as 'percentage' | 'flat' })}><option value="percentage">Percentage</option><option value="flat">Flat</option></select>
          <input className="field" type="number" placeholder="Value" value={discountForm.value} onChange={e => setDiscountForm({ ...discountForm, value: e.target.value })} />
          <input className="field" type="number" placeholder="Minimum subtotal" value={discountForm.minimum_subtotal} onChange={e => setDiscountForm({ ...discountForm, minimum_subtotal: e.target.value })} />
        </div> : <div className="space-y-3">
          <input className="field" placeholder="Contact name" value={contactForm.name} onChange={e => setContactForm({ ...contactForm, name: e.target.value })} />
          <input className="field" type="tel" placeholder="Phone number (08xx...)" value={contactForm.phone} onChange={e => setContactForm({ ...contactForm, phone: e.target.value })} />
        </div>}
        <button disabled={saving || (tab === 'menu' && categories.length === 0)} onClick={() => void save()} className="mt-5 w-full border border-blue-600 bg-blue-600 p-3 font-bold text-white shadow-sm transition hover:bg-blue-700 disabled:opacity-50">{saving ? 'Saving...' : editingId ? 'Update' : 'Save'}</button>
        </aside>
        </div>
      </main>
    </div>
  );
}
