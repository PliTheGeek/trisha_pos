'use client'; 

import { useState } from 'react';
import { ArrowLeft, Edit, Plus, Tags, Trash2, Percent, X } from 'lucide-react';
import Link from 'next/link';

export default function ManageInterface() {
  const [activeTab, setActiveTab] = useState('menu'); 
  const [editingId, setEditingId] = useState<string | null>(null); 
  
  // NEW: State to hold our dynamic options while editing/creating a menu item
  const [editOptions, setEditOptions] = useState<any[]>([]);

  // Dummy Data
  const menuItems = [
    { id: 'M001', name: 'V60 Filter', category: 'Coffee', price: 35000, cogs: 12000, options: [] },
    { 
      id: 'M002', name: 'Latte', category: 'Coffee', price: 30000, cogs: 11000, 
      options: [
        { group: 'Temperature', choices: [{ name: 'Hot', addPrice: 0 }, { name: 'Iced', addPrice: 3000 }] },
        { group: 'Milk Type', choices: [{ name: 'Fresh Milk', addPrice: 0 }, { name: 'Oat Milk', addPrice: 8000 }] }
      ] 
    },
    { id: 'M004', name: 'Butter Croissant', category: 'Snack', price: 25000, cogs: 15000, options: [] },
  ];

  const discountItems = [
    { id: 'D001', name: 'Opening Promo', type: 'percentage', value: 10, status: 'Active' },
    { id: 'D002', name: 'Bring Your Own Cup', type: 'flat', value: 5000, status: 'Active' },
  ];

  const currentEditMenu = menuItems.find(item => item.id === editingId);
  const currentEditDisc = discountItems.find(item => item.id === editingId);

  // ---------------- FORM BUILDER ACTIONS ----------------

  // When clicking Edit on a Menu Item
  const handleEditMenu = (item: any) => {
    setEditingId(item.id);
    // Load the item's options into the form state (or empty array if none)
    setEditOptions(item.options ? JSON.parse(JSON.stringify(item.options)) : []); 
  };

  // When clicking the (+) Add New button
  const handleAddNewMenu = () => {
    setEditingId(null);
    setEditOptions([]); // Clear the form options
  };

  // Add a new empty group (e.g., "Size")
  const addOptionGroup = () => {
    setEditOptions([...editOptions, { group: '', choices: [{ name: '', addPrice: 0 }] }]);
  };

  // Remove an entire group
  const removeOptionGroup = (groupIndex: number) => {
    const newOptions = [...editOptions];
    newOptions.splice(groupIndex, 1);
    setEditOptions(newOptions);
  };

  // Update Group Name
  const updateGroupName = (groupIndex: number, newName: string) => {
    const newOptions = [...editOptions];
    newOptions[groupIndex].group = newName;
    setEditOptions(newOptions);
  };

  // Add a choice to a specific group
  const addChoice = (groupIndex: number) => {
    const newOptions = [...editOptions];
    newOptions[groupIndex].choices.push({ name: '', addPrice: 0 });
    setEditOptions(newOptions);
  };

  // Remove a choice from a specific group
  const removeChoice = (groupIndex: number, choiceIndex: number) => {
    const newOptions = [...editOptions];
    newOptions[groupIndex].choices.splice(choiceIndex, 1);
    setEditOptions(newOptions);
  };

  // Update Choice Data (Name or Price)
  const updateChoice = (groupIndex: number, choiceIndex: number, field: string, value: any) => {
    const newOptions = [...editOptions];
    newOptions[groupIndex].choices[choiceIndex][field] = value;
    setEditOptions(newOptions);
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
                  {menuItems.map((item) => (
                    <tr key={item.id} className="hover:bg-slate-50 transition-colors">
                      <td className="p-4 font-medium text-slate-800">
                        {item.name}
                        {item.options && item.options.length > 0 && (
                           <span className="ml-2 text-[10px] font-bold uppercase tracking-wider text-blue-500 bg-blue-50 px-2 py-0.5 rounded">Customizable</span>
                        )}
                      </td>
                      <td className="p-4"><span className="px-2 py-1 bg-slate-100 text-slate-600 text-xs rounded-md">{item.category}</span></td>
                      <td className="p-4 font-medium text-blue-600">Rp {item.price.toLocaleString('id-ID')}</td>
                      <td className="p-4 text-right">
                        {/* Edit Button triggers the state load */}
                        <button onClick={() => handleEditMenu(item)} className="p-2 text-slate-400 hover:text-blue-600"><Edit size={16} /></button>
                        <button className="p-2 text-slate-400 hover:text-red-600"><Trash2 size={16} /></button>
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
                <input type="text" defaultValue={currentEditMenu?.name || ''} placeholder="e.g. V60 Filter" className="w-full border border-slate-300 rounded-lg p-2.5 text-sm outline-none focus:border-blue-500" />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-500 mb-1">Category</label>
                <select defaultValue={currentEditMenu?.category || 'Coffee'} className="w-full border border-slate-300 rounded-lg p-2.5 text-sm outline-none focus:border-blue-500 bg-white">
                  <option>Coffee</option>
                  <option>Snack</option>
                  <option>Retail</option>
                </select>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-500 mb-1">Selling Price</label>
                  <input type="number" defaultValue={currentEditMenu?.price || ''} placeholder="35000" className="w-full border border-slate-300 rounded-lg p-2.5 text-sm outline-none focus:border-blue-500" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-500 mb-1">COGS</label>
                  <input type="number" defaultValue={currentEditMenu?.cogs || ''} placeholder="12000" className="w-full border border-slate-300 rounded-lg p-2.5 text-sm outline-none focus:border-blue-500" />
                </div>
              </div>

              {/* DYNAMIC CUSTOM OPTIONS BUILDER */}
              <div className="pt-4 mt-2 border-t border-slate-100">
                <div className="flex justify-between items-center mb-3">
                  <label className="block text-xs font-bold text-slate-800 uppercase tracking-wide">Custom Options</label>
                  <button type="button" onClick={addOptionGroup} className="text-xs text-blue-600 font-bold flex items-center gap-1 bg-blue-50 px-3 py-1.5 rounded-md hover:bg-blue-100 transition-colors">
                    <Plus size={14} /> Add Group
                  </button>
                </div>

                {/* Map through the options state */}
                {editOptions.length === 0 ? (
                   <div className="text-center p-4 border border-dashed border-slate-300 rounded-lg text-sm text-slate-400 bg-slate-50/50">
                     No custom options. Click "Add Group" to create modifiers (e.g., Milk Type, Size).
                   </div>
                ) : (
                  editOptions.map((optGroup, gIndex) => (
                    <div key={gIndex} className="bg-slate-50 p-4 rounded-xl border border-slate-200 mb-4 shadow-sm">
                      
                      {/* Group Header (e.g., "Milk Type") */}
                      <div className="flex justify-between items-center mb-3 gap-2">
                        <input
                          type="text"
                          value={optGroup.group}
                          onChange={(e) => updateGroupName(gIndex, e.target.value)}
                          placeholder="Group Name (e.g., Milk Type)"
                          className="w-full bg-white border border-slate-300 rounded-md p-2 text-sm font-bold text-slate-800 outline-none focus:border-blue-500"
                        />
                        <button type="button" onClick={() => removeOptionGroup(gIndex)} className="p-2 text-slate-400 hover:text-red-500 bg-white rounded-md border border-slate-200 hover:border-red-200 transition-colors">
                          <Trash2 size={16}/>
                        </button>
                      </div>
                      
                      {/* Choices List (e.g., "Oat Milk", "+8000") */}
                      <div className="flex flex-col gap-2 pl-2 border-l-2 border-slate-200">
                        {optGroup.choices.map((choice: any, cIndex: number) => (
                          <div key={cIndex} className="flex gap-2 items-center">
                            <input 
                              type="text" 
                              value={choice.name}
                              onChange={(e) => updateChoice(gIndex, cIndex, 'name', e.target.value)}
                              placeholder="Option (e.g., Oat Milk)" 
                              className="flex-1 border border-slate-300 rounded-md p-2 text-sm outline-none focus:border-blue-500"
                            />
                            <div className="relative w-28">
                              <span className="absolute left-2 top-2 text-xs text-slate-400">+Rp</span>
                              <input 
                                type="number" 
                                value={choice.addPrice === 0 ? '' : choice.addPrice} // hide 0 for cleaner look
                                onChange={(e) => updateChoice(gIndex, cIndex, 'addPrice', Number(e.target.value))}
                                placeholder="0" 
                                className="w-full border border-slate-300 rounded-md p-2 pl-8 text-sm outline-none focus:border-blue-500"
                              />
                            </div>
                            <button type="button" onClick={() => removeChoice(gIndex, cIndex)} className="p-1.5 text-slate-400 hover:text-red-500 transition-colors">
                              <X size={18}/>
                            </button>
                          </div>
                        ))}
                        
                        <button type="button" onClick={() => addChoice(gIndex)} className="text-xs text-blue-600 font-semibold hover:text-blue-700 bg-blue-50/50 py-2 rounded-md border border-dashed border-blue-200 mt-1 transition-colors text-left pl-3">
                          + Add Option
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>

              <button type="button" className="mt-4 w-full bg-slate-800 text-white font-bold py-4 rounded-xl hover:bg-slate-900 transition-colors shadow-md text-lg">
                {editingId ? 'Save Changes' : 'Save New Item'}
              </button>
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