import React, { useEffect, useState, useRef } from 'react';
import {
  Package, Search, Plus, Edit2, Trash2, Upload,
  Download, ChevronDown, X, Eye, AlertCircle,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { db } from '../lib/firebase';
import {
  collection, getDocs, addDoc, updateDoc, deleteDoc,
  doc, serverTimestamp, writeBatch, query, orderBy, getDoc,
} from 'firebase/firestore';
import { ConditionBadge } from '../components/StatusBadge';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { TableSkeleton } from '../components/LoadingSpinner';
import Papa from 'papaparse';

const LABS = ['Physics Lab', 'Biochem Lab'];
const EMPTY_ITEM = { name: '', category: '', lab: '', totalQty: '', availableQty: '', condition: 'Good', description: '' };

function EquipmentDrawer({ item, categories, conditions, onClose, onSave, isAdmin }) {
  const [form, setForm] = useState(item || EMPTY_ITEM);
  const [saving, setSaving] = useState(false);
  const toast = useToast();

  async function handleSave(e) {
    e.preventDefault();
    if (!form.name.trim() || !form.category || !LABS.includes(form.lab)) {
      toast.error('Name, category, and laboratory are required.');
      return;
    }
    const totalQty = parseInt(form.totalQty) || 0;
    const availableQty = parseInt(form.availableQty) || 0;
    if (availableQty > totalQty) {
      toast.error('Available quantity cannot exceed total quantity.');
      return;
    }
    setSaving(true);
    await onSave({ ...form, totalQty, availableQty });
    setSaving(false);
  }

  return (
    <div className="fixed inset-0 z-50 flex">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative ml-auto w-full max-w-md bg-white h-full overflow-y-auto animate-fade-in shadow-2xl">
        <div className="card-header rounded-none sticky top-0 z-10">
          <Package size={18} />
          {item?.id ? 'Edit Equipment' : 'Add Equipment'}
          <button onClick={onClose} className="ml-auto text-gold hover:text-white"><X size={18} /></button>
        </div>
        <form onSubmit={handleSave} className="p-5 space-y-4">
          <div>
            <label className="label">Equipment Name *</label>
            <input
              className="input"
              value={form.name}
              onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
              placeholder="e.g. Beaker"
              required
            />
          </div>
          <div>
            <label className="label">Category *</label>
            <select
              className="input"
              value={form.category}
              onChange={e => setForm(f => ({ ...f, category: e.target.value }))}
              required
            >
              <option value="">Select category</option>
              {categories.map(c => <option key={c}>{c}</option>)}
            </select>
          </div>
          <div>
            <label className="label">Laboratory *</label>
            <select
              className="input"
              value={form.lab || ''}
              onChange={e => setForm(f => ({ ...f, lab: e.target.value }))}
              required
            >
              <option value="">Assign a laboratory</option>
              {LABS.map(lab => <option key={lab} value={lab}>{lab}</option>)}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Total Qty</label>
              <input
                type="number" min="0" className="input"
                value={form.totalQty}
                onChange={e => setForm(f => ({ ...f, totalQty: e.target.value }))}
              />
            </div>
            <div>
              <label className="label">Available Qty</label>
              <input
                type="number" min="0" className="input"
                value={form.availableQty}
                onChange={e => setForm(f => ({ ...f, availableQty: e.target.value }))}
              />
            </div>
          </div>
          <div>
            <label className="label">Condition</label>
            <select
              className="input"
              value={form.condition}
              onChange={e => setForm(f => ({ ...f, condition: e.target.value }))}
            >
              {conditions.map(c => <option key={c}>{c}</option>)}
            </select>
          </div>
          <div>
            <label className="label">Description</label>
            <textarea
              className="input min-h-[80px] resize-none"
              value={form.description}
              onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
              placeholder="Optional notes"
            />
          </div>
          <div className="flex gap-2 pt-2">
            <button type="button" onClick={onClose} className="btn-secondary flex-1 justify-center">Cancel</button>
            <button type="submit" disabled={saving} className="btn-primary flex-1 justify-center">
              {saving ? 'Saving…' : 'Save'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function CSVImportModal({ categories, conditions, onClose, onImport }) {
  const [rows, setRows] = useState([]);
  const [errors, setErrors] = useState([]);
  const [importing, setImporting] = useState(false);
  const toast = useToast();

  function handleFile(e) {
    const file = e.target.files[0];
    if (!file) return;
    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: (results) => {
        const errs = [];
        const valid = results.data.map((row, i) => {
          const rowNum = i + 2;
          if (!row.name?.trim()) errs.push(`Row ${rowNum}: Name is required.`);
          if (!row.category?.trim()) errs.push(`Row ${rowNum}: Category is required.`);
          if (!LABS.includes(row.lab?.trim())) errs.push(`Row ${rowNum}: Lab must be Physics Lab or Biochem Lab.`);
          const total = parseInt(row.totalQty);
          const avail = parseInt(row.availableQty);
          if (isNaN(total) || total < 0) errs.push(`Row ${rowNum}: Invalid totalQty.`);
          if (isNaN(avail) || avail < 0) errs.push(`Row ${rowNum}: Invalid availableQty.`);
          if (!isNaN(total) && !isNaN(avail) && avail > total) errs.push(`Row ${rowNum}: availableQty > totalQty.`);
          return {
            name: row.name?.trim() || '',
            category: row.category?.trim() || '',
            lab: row.lab?.trim() || '',
            totalQty: isNaN(total) ? 0 : total,
            availableQty: isNaN(avail) ? 0 : avail,
            condition: row.condition?.trim() || 'Good',
            description: row.description?.trim() || '',
          };
        });
        setErrors(errs);
        setRows(valid);
      }
    });
  }

  function downloadTemplate() {
    const csv = 'name,category,lab,totalQty,availableQty,condition,description\nBeaker,Glassware,Biochem Lab,20,15,Good,250ml beakers\n';
    const blob = new Blob([csv], { type: 'text/csv' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'equipment_template.csv';
    a.click();
  }

  async function handleImport() {
    if (errors.length > 0) { toast.error('Fix validation errors first.'); return; }
    setImporting(true);
    await onImport(rows);
    setImporting(false);
    onClose();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-2xl max-w-2xl w-full max-h-[80vh] overflow-y-auto animate-fade-in">
        <div className="card-header rounded-t-2xl sticky top-0">
          <Upload size={18} />
          CSV Import
          <button onClick={onClose} className="ml-auto text-gold hover:text-white"><X size={18} /></button>
        </div>
        <div className="p-5 space-y-4">
          <div className="flex gap-2">
            <button onClick={downloadTemplate} className="btn-secondary btn-sm">
              <Download size={14} /> Download Template
            </button>
          </div>
          <input type="file" accept=".csv" onChange={handleFile} className="input" />
          {errors.length > 0 && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-xl">
              <p className="text-sm font-semibold text-red-700 mb-1">Validation errors:</p>
              {errors.map((e, i) => <p key={i} className="text-xs text-red-600">{e}</p>)}
            </div>
          )}
          {rows.length > 0 && errors.length === 0 && (
            <div>
              <p className="text-sm text-green-600 font-medium mb-2">{rows.length} rows ready to import.</p>
              <div className="overflow-x-auto max-h-48 border border-gray-200 rounded-xl">
                <table className="table text-xs">
                  <thead>
                    <tr>
                      <th>Name</th><th>Category</th><th>Laboratory</th><th>Total</th><th>Available</th><th>Condition</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.slice(0, 10).map((r, i) => (
                      <tr key={i}>
                        <td>{r.name}</td><td>{r.category}</td><td>{r.lab}</td>
                        <td>{r.totalQty}</td><td>{r.availableQty}</td><td>{r.condition}</td>
                      </tr>
                    ))}
                    {rows.length > 10 && <tr><td colSpan={6} className="text-center text-gray-400">...and {rows.length - 10} more</td></tr>}
                  </tbody>
                </table>
              </div>
            </div>
          )}
          <div className="flex gap-2 justify-end">
            <button onClick={onClose} className="btn-secondary btn-sm">Cancel</button>
            <button
              onClick={handleImport}
              disabled={rows.length === 0 || errors.length > 0 || importing}
              className="btn-primary btn-sm"
            >
              {importing ? 'Importing…' : `Import ${rows.length} rows`}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function Inventory() {
  const { isAdmin } = useAuth();
  const toast = useToast();
  const [equipment, setEquipment] = useState([]);
  const [categories, setCategories] = useState([]);
  const [conditions, setConditions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [labFilter, setLabFilter] = useState('');
  const [drawerItem, setDrawerItem] = useState(null);
  const [showDrawer, setShowDrawer] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [showCSV, setShowCSV] = useState(false);
  const [showBulk, setShowBulk] = useState(false);
  const [bulkRows, setBulkRows] = useState([{ ...EMPTY_ITEM }]);

  useEffect(() => {
    loadAll();
  }, []);

  async function loadAll() {
    setLoading(true);
    try {
      const [eqSnap, catSnap, condSnap] = await Promise.all([
        getDocs(query(collection(db, 'equipment'), orderBy('name'))),
        getDoc_safe('settings', 'categories'),
        getDoc_safe('settings', 'conditions'),
      ]);
      setEquipment(eqSnap.docs.map(d => ({ id: d.id, ...d.data() })));
      setCategories(catSnap?.list || ['Glassware', 'Microscope', 'Heating Equipment', 'Measuring Equipment', 'Safety Equipment', 'Others']);
      setConditions(condSnap?.list || ['Good', 'Needs Cleaning', 'Needs Repair', 'Damaged', 'Out of Service']);
    } finally {
      setLoading(false);
    }
  }

  async function getDoc_safe(col, id) {
    try {
      const snap = await getDoc(doc(db, col, id));
      return snap.exists() ? snap.data() : null;
    } catch { return null; }
  }

  const filtered = equipment.filter(e => {
    const q = search.toLowerCase();
    const matchSearch = !q || e.name?.toLowerCase().includes(q) || e.category?.toLowerCase().includes(q) || (e.lab || 'Unassigned').toLowerCase().includes(q);
    const matchCat = !categoryFilter || e.category === categoryFilter;
    const matchLab = !labFilter || (e.lab || 'Unassigned') === labFilter;
    return matchSearch && matchCat && matchLab;
  });

  async function handleSave(formData) {
    try {
      if (formData.id) {
        await updateDoc(doc(db, 'equipment', formData.id), {
          name: formData.name, category: formData.category, lab: formData.lab,
          totalQty: formData.totalQty, availableQty: formData.availableQty,
          condition: formData.condition, description: formData.description,
          updatedAt: serverTimestamp(),
        });
        toast.success('Equipment updated.');
      } else {
        await addDoc(collection(db, 'equipment'), {
          ...formData, createdAt: serverTimestamp(), updatedAt: serverTimestamp(),
        });
        toast.success('Equipment added.');
      }
      setShowDrawer(false);
      loadAll();
    } catch (err) {
      toast.error('Failed to save: ' + err.message);
    }
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    try {
      await deleteDoc(doc(db, 'equipment', deleteTarget.id));
      toast.success('Equipment deleted.');
      setDeleteTarget(null);
      loadAll();
    } catch (err) {
      toast.error('Delete failed: ' + err.message);
    }
  }

  async function handleCSVImport(rows) {
    try {
      const batch = writeBatch(db);
      rows.forEach(row => {
        const ref = doc(collection(db, 'equipment'));
        batch.set(ref, { ...row, createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
      });
      await batch.commit();
      toast.success(`${rows.length} items imported.`);
      loadAll();
    } catch (err) {
      toast.error('Import failed: ' + err.message);
    }
  }

  async function handleBulkSave() {
    const entered = bulkRows.filter(r => r.name.trim() || r.category || r.lab || r.totalQty || r.availableQty || r.description);
    const valid = entered.filter(r => r.name.trim() && r.category && LABS.includes(r.lab));
    if (valid.length === 0) { toast.error('Add at least one complete row.'); return; }
    if (valid.length !== entered.length) {
      toast.error('Complete each equipment row and assign Physics Lab or Biochem Lab before saving.');
      return;
    }
    try {
      const batch = writeBatch(db);
      valid.forEach(row => {
        const ref = doc(collection(db, 'equipment'));
        batch.set(ref, {
          ...row,
          totalQty: parseInt(row.totalQty) || 0,
          availableQty: parseInt(row.availableQty) || 0,
          createdAt: serverTimestamp(), updatedAt: serverTimestamp(),
        });
      });
      await batch.commit();
      toast.success(`${valid.length} items added.`);
      setShowBulk(false);
      setBulkRows([{ ...EMPTY_ITEM }]);
      loadAll();
    } catch (err) {
      toast.error('Bulk add failed: ' + err.message);
    }
  }

  return (
    <div className="space-y-4 max-w-7xl mx-auto animate-fade-in">
      <div className="card">
        <div className="card-header">
          <Package size={18} strokeWidth={1.8} />
          Laboratory Inventory
          {isAdmin && (
            <div className="ml-auto flex gap-2">
              <button onClick={() => setShowBulk(true)} className="btn-secondary btn-sm">
                <Plus size={14} /> Bulk Add
              </button>
              <button onClick={() => setShowCSV(true)} className="btn-secondary btn-sm">
                <Upload size={14} /> CSV Import
              </button>
              <button onClick={() => { setDrawerItem(null); setShowDrawer(true); }} className="btn-secondary btn-sm">
                <Plus size={14} /> Add Equipment
              </button>
            </div>
          )}
        </div>

        {/* Filters */}
        <div className="p-4 flex flex-wrap gap-3 border-b border-gray-100">
          <div className="relative flex-1 min-w-[200px]">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              className="input pl-9"
              placeholder="Search name, category, or lab…"
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>
          <select
            className="input w-auto min-w-[160px]"
            value={categoryFilter}
            onChange={e => setCategoryFilter(e.target.value)}
          >
            <option value="">All Categories</option>
            {categories.map(c => <option key={c}>{c}</option>)}
          </select>
          <select
            className="input w-auto min-w-[160px]"
            value={labFilter}
            onChange={e => setLabFilter(e.target.value)}
            aria-label="Filter inventory by laboratory"
          >
            <option value="">All Laboratories</option>
            <option value="Physics Lab">Physics Lab</option>
            <option value="Biochem Lab">Biochem Lab</option>
            <option value="Unassigned">Unassigned</option>
          </select>
        </div>

        {isAdmin && equipment.some(item => !LABS.includes(item.lab)) && (
          <div className="mx-4 mt-4 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
            {equipment.filter(item => !LABS.includes(item.lab)).length} equipment item(s) still need a lab assignment. Edit them to place them under Physics Lab or Biochem Lab; students will see these under Unassigned until then.
          </div>
        )}

        {loading ? (
          <TableSkeleton rows={6} cols={isAdmin ? 7 : 6} />
        ) : filtered.length === 0 ? (
          <div className="py-12 text-center text-gray-400">
            <Package size={32} className="mx-auto mb-2 opacity-30" />
            <p className="text-sm">No equipment found.</p>
          </div>
        ) : (
          <div className="table-container">
            <table className="table">
              <thead>
                <tr>
                  <th>Equipment Name</th>
                  <th>Category</th>
                  <th>Laboratory</th>
                  <th>Available Qty</th>
                  <th>Total Qty</th>
                  <th>Condition / Status</th>
                  {isAdmin && <th>Actions</th>}
                </tr>
              </thead>
              <tbody>
                {filtered.map(e => (
                  <tr key={e.id}>
                    <td data-label="Name" className="font-medium">{e.name}</td>
                    <td data-label="Category">{e.category}</td>
                    <td data-label="Laboratory">
                      {e.lab ? (
                        <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${e.lab === 'Physics Lab' ? 'bg-blue-50 text-blue-700' : 'bg-teal-50 text-teal-700'}`}>
                          {e.lab}
                        </span>
                      ) : <span className="text-amber-700 text-xs">Unassigned</span>}
                    </td>
                    <td data-label="Available">
                      <span className={`font-semibold ${e.availableQty === 0 ? 'text-red-600' : 'text-green-700'}`}>
                        {e.availableQty}
                      </span>
                    </td>
                    <td data-label="Total">{e.totalQty}</td>
                    <td data-label="Condition"><ConditionBadge condition={e.condition} /></td>
                    {isAdmin && (
                      <td>
                        <div className="flex gap-1">
                          <button
                            onClick={() => { setDrawerItem(e); setShowDrawer(true); }}
                            className="btn-ghost btn-sm p-1.5"
                            title="Edit"
                          >
                            <Edit2 size={14} />
                          </button>
                          <button
                            onClick={() => setDeleteTarget(e)}
                            className="btn-ghost btn-sm p-1.5 text-red-500 hover:bg-red-50"
                            title="Delete"
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Drawer */}
      {showDrawer && (
        <EquipmentDrawer
          item={drawerItem}
          categories={categories}
          conditions={conditions}
          onClose={() => setShowDrawer(false)}
          onSave={handleSave}
          isAdmin={isAdmin}
        />
      )}

      {/* CSV Import */}
      {showCSV && (
        <CSVImportModal
          categories={categories}
          conditions={conditions}
          onClose={() => setShowCSV(false)}
          onImport={handleCSVImport}
        />
      )}

      {/* Bulk Add */}
      {showBulk && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/40" onClick={() => setShowBulk(false)} />
          <div className="relative bg-white rounded-2xl shadow-2xl max-w-4xl w-full max-h-[80vh] overflow-y-auto animate-fade-in">
            <div className="card-header rounded-t-2xl sticky top-0">
              <Plus size={18} /> Bulk Add Equipment
              <button onClick={() => setShowBulk(false)} className="ml-auto text-gold hover:text-white"><X size={18} /></button>
            </div>
            <div className="p-4">
              <div className="overflow-x-auto">
                <table className="table text-xs">
                  <thead>
                    <tr>
                      <th>Name *</th><th>Category *</th><th>Laboratory *</th><th>Total Qty</th>
                      <th>Available Qty</th><th>Condition</th><th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {bulkRows.map((row, i) => (
                      <tr key={i}>
                        <td>
                          <input
                            className="input text-xs min-h-[36px] py-1"
                            value={row.name}
                            onChange={e => {
                              const r = [...bulkRows]; r[i] = { ...r[i], name: e.target.value };
                              setBulkRows(r);
                            }}
                            placeholder="Equipment name"
                          />
                        </td>
                        <td>
                          <select
                            className="input text-xs min-h-[36px] py-1"
                            value={row.category}
                            onChange={e => {
                              const r = [...bulkRows]; r[i] = { ...r[i], category: e.target.value };
                              setBulkRows(r);
                            }}
                          >
                            <option value="">Select</option>
                            {categories.map(c => <option key={c}>{c}</option>)}
                          </select>
                        </td>
                        <td>
                          <select
                            className="input text-xs min-h-[36px] py-1"
                            value={row.lab}
                            onChange={e => {
                              const r = [...bulkRows]; r[i] = { ...r[i], lab: e.target.value };
                              setBulkRows(r);
                            }}
                          >
                            <option value="">Select lab</option>
                            {LABS.map(lab => <option key={lab} value={lab}>{lab}</option>)}
                          </select>
                        </td>
                        <td>
                          <input type="number" min="0" className="input text-xs min-h-[36px] py-1 w-20"
                            value={row.totalQty}
                            onChange={e => { const r = [...bulkRows]; r[i] = { ...r[i], totalQty: e.target.value }; setBulkRows(r); }}
                          />
                        </td>
                        <td>
                          <input type="number" min="0" className="input text-xs min-h-[36px] py-1 w-20"
                            value={row.availableQty}
                            onChange={e => { const r = [...bulkRows]; r[i] = { ...r[i], availableQty: e.target.value }; setBulkRows(r); }}
                          />
                        </td>
                        <td>
                          <select className="input text-xs min-h-[36px] py-1"
                            value={row.condition}
                            onChange={e => { const r = [...bulkRows]; r[i] = { ...r[i], condition: e.target.value }; setBulkRows(r); }}
                          >
                            {conditions.map(c => <option key={c}>{c}</option>)}
                          </select>
                        </td>
                        <td>
                          <button
                            onClick={() => setBulkRows(bulkRows.filter((_, j) => j !== i))}
                            className="text-red-400 hover:text-red-600"
                          >
                            <X size={14} />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="flex gap-2 mt-3 justify-between">
                <button
                  onClick={() => setBulkRows([...bulkRows, { ...EMPTY_ITEM }])}
                  className="btn-secondary btn-sm"
                >
                  <Plus size={14} /> Add Row
                </button>
                <div className="flex gap-2">
                  <button onClick={() => setShowBulk(false)} className="btn-secondary btn-sm">Cancel</button>
                  <button onClick={handleBulkSave} className="btn-primary btn-sm">Save All</button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Confirm delete */}
      <ConfirmDialog
        isOpen={!!deleteTarget}
        title="Delete Equipment"
        message={`Are you sure you want to delete "${deleteTarget?.name}"? This cannot be undone.`}
        confirmLabel="Delete"
        danger
        onConfirm={handleDelete}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  );
}
