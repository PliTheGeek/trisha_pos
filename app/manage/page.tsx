'use client'; 

import { useEffect, useState } from 'react';
import { ArrowLeft, Edit, Plus, Tags, Trash2, Percent } from 'lucide-react';
import Link from 'next/link';

export default function ManageInterface() {
  const [activeTab, setActiveTab] = useState('menu'); 
  const [editingId, setEditingId] = useState<string | null>(null); 
  const [menuItems, setMenuItems] = useState<any[]>([]);
  const [isLoadingMenu, setIsLoadingMenu] = useState(true);


  type MenuForm = {
    name: string;
    category: string;
    price: string;
    cogs: string;
    description: string;
  };

  const emptyForm: MenuForm = {
    name: '',
    category: 'Coffee',
    price: '',
    cogs: '',
    description: '',
  };

  const [menuForm, setMenuForm] = useState<MenuForm>(emptyForm);
  const [isSaving, setIsSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState('');

  useEffect(() => {
    async function getMenuItems() {
      try {
        const sheetUrl = process.env.NEXT_PUBLIC_GOOGLE_SHEETS_URL;

        if (!sheetUrl) {
          throw new Error('NEXT_PUBLIC_GOOGLE_SHEETS_URL is not configured');
        }

        const response = await fetch(`${sheetUrl}?action=menu`, {
          method: 'GET',
          cache: 'no-store',
        });

        if (!response.ok) {
          throw new Error(`Menu request failed with status ${response.status}`);
        }

        const data = await response.json();
        const rows = Array.isArray(data) ? data : data.menu || data.data || [];

      setMenuItems(rows.map((item: any) => ({
        ...item,
        id: String(item.id ?? item.product_id),
        name: item.name ?? item.product_name ?? item.product_id,
        price: Number(item.price) || 0,
        cogs: Number(item.cogs) || 0,
        description: item.description ?? '',
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

  const discountItems = [
    { id: 'D001', name: 'Opening Promo', type: 'percentage', value: 10, status: 'Active' },
    { id: 'D002', name: 'Bring Your Own Cup', type: 'flat', value: 5000, status: 'Active' },
  ];

  const currentEditMenu = menuItems.find(item => item.id === editingId);
  const currentEditDisc = discountItems.find(item => item.id === editingId);


  const handleDeleteMenu = async (item: any) => {
  const confirmed = window.confirm(
    `Delete "${item.name}"? This action cannot be undone.`
  );

  if (!confirmed) {
    return;
  }

  const sheetUrl = process.env.NEXT_PUBLIC_GOOGLE_SHEETS_URL;

  if (!sheetUrl) {
    return;
  }

  try {
    const payload = new URLSearchParams({
      action: 'deleteMenu',
      id: String(item.id),
    });

    const response = await fetch(sheetUrl, {
      method: 'POST',
      body: payload,
    });

    const result = await response.json();

    if (!response.ok || result.success === false) {
      throw new Error(result.message || 'Failed to delete product.');
    }

    setMenuItems((currentItems) =>
      currentItems.filter(
        (currentItem) => String(currentItem.id) !== String(item.id)
      )
    );

    if (String(editingId) === String(item.id)) {
      handleAddNewMenu();
    }
  } catch (error) {
    setSaveMessage(
      error instanceof Error
        ? error.message
        : 'Failed to delete product.'
    );
  }
};

  // ---------------- FORM BUILDER ACTIONS ----------------

  // When clicking Edit on a Menu Item
  const handleEditMenu = (item: any) => {
    setEditingId(item.id);
    setMenuForm({
      name: item.name,
      category: item.category,
      price: String(item.price),
      cogs: String(item.cogs),
      description: item.description,
    });

    setSaveMessage('');
  };

  const handleAddNewMenu = () => {
    setEditingId(null);
    setMenuForm(emptyForm);
    setSaveMessage('');
  };

const handleSaveMenu = async () => {
  const sheetUrl = process.env.NEXT_PUBLIC_GOOGLE_SHEETS_URL;

  if (!sheetUrl) {
    setSaveMessage('Google Sheets URL belum dikonfigurasi.');
    return;
  }

  if (!menuForm.name.trim()) {
    setSaveMessage('Nama produk wajib diisi.');
    return;
  }

  setIsSaving(true);
  setSaveMessage('');

  try {
    const payload = new URLSearchParams({
      action: editingId ? 'updateMenu' : 'createMenu',
      id: editingId ?? '',
      name: menuForm.name.trim(),
      category: menuForm.category,
      price: menuForm.price || '0',
      cogs: menuForm.cogs || '0',
      description: menuForm.description.trim(),
    });

    const response = await fetch(sheetUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8',
      },
      body: payload.toString(),
    });

    const result = await response.json();

    if (!response.ok || result.success === false) {
      throw new Error(result.message || 'Gagal menyimpan produk.');
    }

    const savedItem = {
      id: editingId ?? result.id,
      name: menuForm.name.trim(),
      category: menuForm.category,
      price: Number(menuForm.price) || 0,
      cogs: Number(menuForm.cogs) || 0,
      description: menuForm.description.trim(),
    };

    setMenuItems((currentItems) =>
      editingId
        ? currentItems.map((item) =>
            String(item.id) === String(editingId) ? savedItem : item
          )
        : [...currentItems, savedItem]
    );

    setSaveMessage('Produk berhasil disimpan.');

    if (!editingId) {
      setMenuForm(emptyForm);
    }
  } catch (error) {
    setSaveMessage(
      error instanceof Error ? error.message : 'Gagal menyimpan produk.'
    );
  } finally {
    setIsSaving(false);
  }
};



  return (
    <div className="flex flex-col md:flex-row h-screen bg-slate-50 text-slate-800">
      
      {/* ---------------- LEFT SECTION: Data Table ---------------- */}
      <div className="flex-1 flex flex-col h-full overflow-hidden">
        
        <header className="bg-white p-4 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-4 z-10">
          <div className="flex items-center gap-4">
            <Link href="/" className="p-2 bg-slate-100 rounded-lg hover:bg-slate-200 text-slate-600 transition-colors">
              <ArrowLeft size={20} />
            </Link>
            <h1 className="text-xl font-bold tracking-tight">Data Management</h1>
          </div>
          
          <div className="flex bg-slate-100 p-1 rounded-lg">
            <button onClick={() => { setActiveTab('menu'); handleAddNewMenu(); }}
              className={`px-4 py-2 rounded-md text-sm font-medium flex items-center gap-2 transition-all ${activeTab === 'menu' ? 'bg-white shadow-sm text-slate-800' : 'text-slate-500'}`}>
              <Tags size={16} /> Menu Items
            </button>
            <button onClick={() => { setActiveTab('discount'); handleAddNewMenu(); }}
              className={`px-4 py-2 rounded-md text-sm font-medium flex items-center gap-2 transition-all ${activeTab === 'discount' ? 'bg-white shadow-sm text-slate-800' : 'text-slate-500'}`}>
              <Percent size={16} /> Discounts
            </button>
          </div>
        </header>

        <div className="flex-1 overflow-y-auto p-6">
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
            
            {activeTab === 'menu' ? (
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200 text-sm text-slate-500">
                    <th className="p-4 font-medium">Item Name</th>
                    <th className="p-4 font-medium">Category</th>
                    <th className="p-4 font-medium">Selling Price</th>
                    <th className="p-4 font-medium text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {isLoadingMenu ? (
                    <tr>
                      <td colSpan={4} className="p-6 text-center text-sm text-slate-400">Loading menu...</td>
                    </tr>
                  ) : menuItems.length === 0 ? (
                    <tr>
                      <td colSpan={4} className="p-6 text-center text-sm text-slate-400">No menu items found.</td>
                    </tr>
                  ) : menuItems.map((item) => (
                    <tr key={item.id} className="hover:bg-slate-50 transition-colors">
                      <td className="p-4 font-medium text-slate-800">
                        {item.name}
                      </td>
                      <td className="p-4"><span className="px-2 py-1 bg-slate-100 text-slate-600 text-xs rounded-md">{item.category}</span></td>
                      <td className="p-4 font-medium text-blue-600">Rp {item.price.toLocaleString('id-ID')}</td>
                      <td className="p-4 text-right">
                        {/* Edit Button triggers the state load */}
                        <button onClick={() => handleEditMenu(item)} className="p-2 text-slate-400 hover:text-blue-600"><Edit size={16} /></button>
                        <button
                          onClick={() => handleDeleteMenu(item)}
                          className="p-2 text-slate-400 hover:text-red-600"
                          title="Delete product">
                          <Trash2 size={16} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <table className="w-full text-left border-collapse">
                 {/* Discount Table */}
                 <thead>
                  <tr className="bg-slate-50 border-b border-slate-200 text-sm text-slate-500">
                    <th className="p-4 font-medium">Discount Name</th>
                    <th className="p-4 font-medium">Type</th>
                    <th className="p-4 font-medium">Amount</th>
                    <th className="p-4 font-medium text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {discountItems.map((discount) => (
                    <tr key={discount.id} className="hover:bg-slate-50">
                      <td className="p-4 font-medium">{discount.name}</td>
                      <td className="p-4 text-xs uppercase">{discount.type}</td>
                      <td className="p-4 font-bold text-blue-600">{discount.value}</td>
                      <td className="p-4 text-right">
                        <button onClick={() => setEditingId(discount.id)} className="p-2 text-slate-400 hover:text-blue-600"><Edit size={16} /></button>
                        <button className="p-2 text-slate-400 hover:text-red-600"><Trash2 size={16} /></button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </div>

      {/* ---------------- RIGHT SECTION: Dynamic Editor Form ---------------- */}
      <div className="w-full md:w-[450px] bg-white border-l border-slate-200 flex flex-col shadow-lg z-20">
        
        <div className="p-4 border-b border-slate-100 bg-slate-50 flex items-center justify-between">
          <span className="font-bold text-slate-800">
            {activeTab === 'menu' 
              ? (editingId ? `Edit: ${currentEditMenu?.name}` : 'Add New Menu Item') 
              : (editingId ? `Edit: ${currentEditDisc?.name}` : 'Add New Discount')
            }
          </span>
          <button onClick={handleAddNewMenu} className="bg-blue-100 text-blue-600 p-1.5 rounded hover:bg-blue-200 transition-colors" title="Create New">
            <Plus size={18} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6">
          {activeTab === 'menu' ? (
            /* MENU FORM */
            <form key={editingId || 'new'} className="flex flex-col gap-4">
              <div>
                <label className="block text-xs font-semibold text-slate-500 mb-1">Item Name</label>
                <input
                  type="text"
                  value={menuForm.name}
                  onChange={(e) =>
                    setMenuForm({ ...menuForm, name: e.target.value })
                  }
                  placeholder="e.g. V60 Filter"
                  className="w-full border border-slate-300 rounded-lg p-2.5 text-sm outline-none focus:border-blue-500"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-500 mb-1">Category</label>
                <select
                  value={menuForm.category}
                  onChange={(e) =>
                    setMenuForm({ ...menuForm, category: e.target.value })
                  }
                  className="w-full border border-slate-300 rounded-lg p-2.5 text-sm outline-none focus:border-blue-500 bg-white"
                >
                  <option>Coffee</option>
                  <option>Non-Coffee</option>
                  <option>Snack</option>
                  <option>Retail</option>
                </select>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-500 mb-1">Selling Price</label>
                  <input
                    type="number"
                    value={menuForm.price}
                    onChange={(e) =>
                      setMenuForm({ ...menuForm, price: e.target.value })
                    }
                    placeholder="35000"
                    className="w-full border border-slate-300 rounded-lg p-2.5 text-sm outline-none focus:border-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-500 mb-1">COGS</label>
                  <input
                    type="number"
                    value={menuForm.cogs}
                    onChange={(e) =>
                      setMenuForm({ ...menuForm, cogs: e.target.value })
                    }
                    placeholder="12000"
                    className="w-full border border-slate-300 rounded-lg p-2.5 text-sm outline-none focus:border-blue-500"
                  />
                </div>
              </div>
            <div className="pt-4 mt-2 border-t border-slate-100">
              <label className="block text-xs font-bold text-slate-800 uppercase tracking-wide mb-3">
                Description
              </label>
                <textarea
                  value={menuForm.description}
                  onChange={(e) =>
                    setMenuForm({ ...menuForm, description: e.target.value })
                  }
                  placeholder="Food or drink description"
                  rows={4}
                  className="w-full border border-slate-300 rounded-lg p-2.5 text-sm outline-none focus:border-blue-500 resize-none"
                />
            </div>
            <button
              type="button"
              onClick={handleSaveMenu}
              disabled={isSaving}
              className="mt-4 w-full bg-slate-800 text-white font-bold py-4 rounded-xl hover:bg-slate-900 transition-colors shadow-md text-lg disabled:opacity-50"
            >
              {isSaving
                ? 'Saving...'
                : editingId
                  ? 'Save Changes'
                  : 'Save New Item'}
            </button>

          {saveMessage && (
            <p className="text-sm text-center text-slate-500">
              {saveMessage}
            </p>
          )}
          </form>
          ) : (
            /* DISCOUNT FORM (Unchanged) */
            <form key={editingId || 'newDisc'} className="flex flex-col gap-4">
               {/* Same discount inputs as before... */}
               <div>
                <label className="block text-xs font-semibold text-slate-500 mb-1">Discount Name</label>
                <input type="text" defaultValue={currentEditDisc?.name || ''} placeholder="e.g. Happy Hour" className="w-full border border-slate-300 rounded-lg p-2.5 text-sm outline-none focus:border-blue-500" />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-500 mb-1">Discount Type</label>
                <select defaultValue={currentEditDisc?.type || 'percentage'} className="w-full border border-slate-300 rounded-lg p-2.5 text-sm outline-none focus:border-blue-500 bg-white">
                  <option value="percentage">Percentage (%)</option>
                  <option value="flat">Flat Amount (Rp)</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-500 mb-1">Discount Value</label>
                <input type="number" defaultValue={currentEditDisc?.value || ''} placeholder="15" className="w-full border border-slate-300 rounded-lg p-2.5 text-sm outline-none focus:border-blue-500" />
              </div>
              <button type="button" className="mt-4 w-full bg-blue-600 text-white font-bold py-4 rounded-xl hover:bg-blue-700 transition-colors shadow-md text-lg">
                 {editingId ? 'Update Discount' : 'Save New Discount'}
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
} 