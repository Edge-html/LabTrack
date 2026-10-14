import React, { useEffect, useState } from 'react';
import {
  Settings, Users, Tag, Sliders, BookOpen,
  Plus, Trash2, Edit2, Save, X, Database, AlertTriangle,
} from 'lucide-react';
import { useToast } from '../../context/ToastContext';
import { db } from '../../lib/firebase';
import {
  doc, getDoc, setDoc, getDocs, collection, query,
  orderBy, updateDoc, serverTimestamp, writeBatch, addDoc,
} from 'firebase/firestore';
import { formatDate, GRADE_LEVELS } from '../../lib/helpers';
import { TableSkeleton } from '../../components/LoadingSpinner';
import { ConfirmDialog } from '../../components/ConfirmDialog';

const SEED_EQUIPMENT = [
  { name: 'Beaker', category: 'Glassware', totalQty: 20, availableQty: 15, condition: 'Good', description: '250ml glass beakers' },
  { name: 'Test Tube', category: 'Glassware', totalQty: 40, availableQty: 30, condition: 'Good', description: 'Borosilicate glass test tubes' },
  { name: 'Erlenmeyer Flask', category: 'Glassware', totalQty: 20, availableQty: 12, condition: 'Good', description: '500ml Erlenmeyer flasks' },
  { name: 'Microscope', category: 'Microscope', totalQty: 5, availableQty: 3, condition: 'Needs Cleaning', description: 'Compound light microscopes' },
  { name: 'Bunsen Burner', category: 'Heating Equipment', totalQty: 10, availableQty: 8, condition: 'Good', description: 'Natural gas Bunsen burners' },
  { name: 'Digital Balance', category: 'Measuring Equipment', totalQty: 5, availableQty: 2, condition: 'Good', description: 'Precision digital scales' },
  { name: 'Thermometer', category: 'Measuring Equipment', totalQty: 15, availableQty: 10, condition: 'Good', description: 'Glass mercury thermometers' },
  { name: 'Safety Goggles', category: 'Safety Equipment', totalQty: 25, availableQty: 18, condition: 'Good', description: 'Chemical splash goggles' },
];

const DEFAULT_CATEGORIES = ['Glassware', 'Microscope', 'Heating Equipment', 'Measuring Equipment', 'Safety Equipment', 'Others'];
const DEFAULT_CONDITIONS = ['Good', 'Needs Cleaning', 'Needs Repair', 'Damaged', 'Out of Service'];
const DEFAULT_PENALTY_RULES = [
  { id: 'late', title: 'Late Return', icon: 'AlertTriangle', iconColor: 'text-amber-500', bg: 'bg-amber-50', border: 'border-amber-200', description: 'Returning equipment after the expected return date.', consequence: 'Corresponding penalty or warning as set by the school/laboratory.' },
  { id: 'improper', title: 'Not Properly Returned/Arranged', icon: 'Package', iconColor: 'text-crimson', bg: 'bg-gold-pale/50', border: 'border-gold/30', description: 'Equipment returned dirty or not arranged properly.', consequence: 'Warning or temporary borrowing restriction.' },
  { id: 'damaged', title: 'Damaged Equipment', icon: 'Tool', iconColor: 'text-orange-500', bg: 'bg-orange-50', border: 'border-orange-200', description: 'Equipment returned in a damaged condition.', consequence: 'Assessment and possible replacement/repair responsibility.' },
  { id: 'lost', title: 'Lost Equipment', icon: 'AlertCircle', iconColor: 'text-red-500', bg: 'bg-red-50', border: 'border-red-200', description: 'Equipment not returned or confirmed lost.', consequence: 'Replacement or other school-approved consequence.' },
];

function ListEditor({ title, icon: Icon, items, onSave, loading }) {
  const [list, setList] = useState(items || []);
  const [newItem, setNewItem] = useState('');
  const [editIdx, setEditIdx] = useState(null);
  const [editVal, setEditVal] = useState('');
  const [saving, setSaving] = useState(false);
  const toast = useToast();

  useEffect(() => { setList(items || []); }, [items]);

  function add() {
    if (!newItem.trim()) return;
    setList([...list, newItem.trim()]);
    setNewItem('');
  }

  function remove(i) { setList(list.filter((_, j) => j !== i)); }

  function startEdit(i) { setEditIdx(i); setEditVal(list[i]); }

  function saveEdit(i) {
    if (!editVal.trim()) return;
    const u = [...list]; u[i] = editVal.trim(); setList(u);
    setEditIdx(null);
  }

  async function handleSave() {
    setSaving(true);
    await onSave(list);
    setSaving(false);
    toast.success(`${title} saved.`);
  }

  return (
    <div className="card">
      <div className="card-header"><Icon size={18} strokeWidth={1.8} /> {title}</div>
      <div className="p-4 space-y-3">
        {loading ? (
          <div className="skeleton h-20 rounded" />
        ) : (
          <>
            <div className="flex gap-2 flex-wrap">
              {list.map((item, i) => (
                <div key={i} className="flex items-center gap-1 bg-primary-50 border border-primary-100 rounded-full px-3 py-1">
                  {editIdx === i ? (
                    <>
                      <input
                        className="text-sm border-none bg-transparent outline-none w-24"
                        value={editVal}
                        onChange={e => setEditVal(e.target.value)}
                        onKeyDown={e => e.key === 'Enter' && saveEdit(i)}
                        autoFocus
                      />
                      <button onClick={() => saveEdit(i)} className="text-green-600 hover:text-green-700"><Save size={12} /></button>
                      <button onClick={() => setEditIdx(null)} className="text-gray-400"><X size={12} /></button>
                    </>
                  ) : (
                    <>
                      <span className="text-sm font-medium text-primary-700">{item}</span>
                      <button onClick={() => startEdit(i)} className="text-gray-400 hover:text-primary-600 ml-1"><Edit2 size={11} /></button>
                      <button onClick={() => remove(i)} className="text-gray-400 hover:text-red-500"><Trash2 size={11} /></button>
                    </>
                  )}
                </div>
              ))}
            </div>
            <div className="flex gap-2">
              <input
                className="input flex-1"
                value={newItem}
                onChange={e => setNewItem(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && add()}
                placeholder={`Add ${title.toLowerCase().replace(' (editable)', '')}…`}
              />
              <button onClick={add} className="btn-secondary btn-sm"><Plus size={14} /></button>
            </div>
            <button onClick={handleSave} disabled={saving} className="btn-primary btn-sm">
              <Save size={14} /> {saving ? 'Saving…' : 'Save Changes'}
            </button>
          </>
        )}
      </div>
    </div>
  );
}

function UsersTab() {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [editUser, setEditUser] = useState(null);
  const toast = useToast();

  useEffect(() => {
    getDocs(query(collection(db, 'users'), orderBy('name'))).then(snap => {
      setUsers(snap.docs.map(d => ({ id: d.id, ...d.data() })));
      setLoading(false);
    });
  }, []);

  const filtered = users.filter(u => {
    const q = search.toLowerCase();
    return !q || u.name?.toLowerCase().includes(q) || u.email?.toLowerCase().includes(q);
  });

  async function saveUserEdit() {
    if (!editUser) return;
    try {
      await updateDoc(doc(db, 'users', editUser.id), {
        role: editUser.role,
        gradeLevel: editUser.gradeLevel || null,
        borrowRestrictedUntil: editUser.borrowRestrictedUntil || null,
        restrictionReason: editUser.restrictionReason || null,
        updatedAt: serverTimestamp(),
      });
      setUsers(users.map(u => u.id === editUser.id ? editUser : u));
      setEditUser(null);
      toast.success('User updated.');
    } catch (err) {
      toast.error('Failed: ' + err.message);
    }
  }

  return (
    <div className="space-y-3">
      <div className="relative max-w-xs">
        <input className="input pl-9" placeholder="Search users…"
          value={search} onChange={e => setSearch(e.target.value)} />
        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">
          <Users size={15} />
        </span>
      </div>
      {loading ? <TableSkeleton rows={4} cols={4} /> : (
        <div className="overflow-x-auto">
          <table className="table">
            <thead>
              <tr><th>Name</th><th>Email</th><th>Grade</th><th>Role</th><th>Restricted Until</th><th>Actions</th></tr>
            </thead>
            <tbody>
              {filtered.map(u => (
                <tr key={u.id}>
                  <td className="font-medium text-ink">{u.name}</td>
                  <td className="text-sm">{u.email}</td>
                  <td>{u.gradeLevel || '—'}</td>
                  <td>
                    <span className={`text-xs font-semibold px-2.5 py-0.5 rounded-full ${u.role === 'admin' ? 'bg-gold-pale text-crimson font-bold border border-gold/40' : 'bg-gray-100 text-gray-600'}`}>
                      {u.role}
                    </span>
                  </td>
                  <td className="text-sm">{u.borrowRestrictedUntil ? (
                    <span className="text-crimson font-semibold">{formatDate(u.borrowRestrictedUntil)}</span>
                  ) : '—'}</td>
                  <td>
                    <button onClick={() => setEditUser({ ...u })} className="btn-secondary btn-sm">
                      <Edit2 size={13} /> Edit
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {editUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/40" onClick={() => setEditUser(null)} />
          <div className="relative bg-white rounded-2xl shadow-2xl max-w-md w-full p-6 animate-fade-in border border-gold/30">
            <h3 className="font-bold text-ink mb-4 text-base">Edit User — {editUser.name}</h3>
            <div className="space-y-3">
              <div>
                <label className="label">Role</label>
                <select className="input" value={editUser.role}
                  onChange={e => setEditUser(u => ({ ...u, role: e.target.value }))}>
                  <option value="student">student</option>
                  <option value="admin">admin</option>
                </select>
              </div>
              <div>
                <label className="label">Grade Level</label>
                <select
                  className="input"
                  value={editUser.gradeLevel || ''}
                  onChange={e => setEditUser(u => ({ ...u, gradeLevel: e.target.value }))}
                >
                  <option value="">Select grade level</option>
                  {GRADE_LEVELS.map(g => (
                    <option key={g} value={g}>{g}</option>
                  ))}
                  {/* Preserve legacy value if present without offering other legacy options */}
                  {editUser.gradeLevel && !GRADE_LEVELS.includes(editUser.gradeLevel) && (
                    <option value={editUser.gradeLevel}>{editUser.gradeLevel} (Legacy)</option>
                  )}
                </select>
              </div>
              <div>
                <label className="label">Restriction Until (YYYY-MM-DD)</label>
                <input type="date" className="input"
                  value={editUser.borrowRestrictedUntil || ''}
                  onChange={e => setEditUser(u => ({ ...u, borrowRestrictedUntil: e.target.value }))}
                />
              </div>
              <div>
                <label className="label">Restriction Reason</label>
                <input className="input"
                  value={editUser.restrictionReason || ''}
                  onChange={e => setEditUser(u => ({ ...u, restrictionReason: e.target.value }))}
                />
              </div>
            </div>
            <div className="flex gap-2 mt-4 justify-end">
              <button onClick={() => setEditUser(null)} className="btn-secondary btn-sm">Cancel</button>
              <button onClick={saveUserEdit} className="btn-primary btn-sm">Save</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

const EMPTY_CONTACT = { name: '', role: '', email: '', phone: '', location: '' };

/**
 * Manager for the list of laboratory contacts shown on the student dashboard.
 * Backwards compatible: a legacy single `settings/contact` doc is migrated
 * into the list on first load so nothing is lost.
 */
function ContactsTab() {
  const toast = useToast();
  const [contacts, setContacts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState({ ...EMPTY_CONTACT });
  const [editingId, setEditingId] = useState(null);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');

  useEffect(() => {
    (async () => {
      try {
        const snap = await getDoc(doc(db, 'settings', 'contacts'));
        if (snap.exists() && Array.isArray(snap.data().list)) {
          setContacts(snap.data().list);
          return;
        }
        // Migrate the old single-contact document.
        const legacy = await getDoc(doc(db, 'settings', 'contact'));
        if (legacy.exists()) {
          const d = legacy.data();
          if (d.name || d.email || d.phone || d.location) {
            setContacts([{ ...EMPTY_CONTACT, ...d, id: `c_${Date.now()}` }]);
            toast.info('Converted your existing contact into the new list. Save to keep it.');
          }
        }
      } catch (e) {
        console.error(e);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  async function persist(next) {
    await setDoc(doc(db, 'settings', 'contacts'), { list: next, updatedAt: serverTimestamp() });
    setContacts(next);
  }

  function startEdit(c) {
    setEditingId(c.id);
    setForm({ name: c.name || '', role: c.role || '', email: c.email || '', phone: c.phone || '', location: c.location || '' });
    setErr('');
  }

  function resetForm() {
    setEditingId(null);
    setForm({ ...EMPTY_CONTACT });
    setErr('');
  }

  async function handleSave(e) {
    e.preventDefault();
    if (!form.name.trim() && !form.email.trim() && !form.phone.trim()) {
      setErr('Add at least a name, email, or phone number.');
      return;
    }
    setSaving(true);
    try {
      const entry = { ...form, id: editingId || `c_${Date.now()}`, updatedAt: Date.now() };
      const next = editingId
        ? contacts.map(c => (c.id === editingId ? entry : c))
        : [...contacts, entry];
      await persist(next);
      toast.success(editingId ? 'Contact updated.' : 'Contact added.');
      resetForm();
    } catch (err) {
      toast.error('Failed: ' + err.message);
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(c) {
    try {
      await persist(contacts.filter(x => x.id !== c.id));
      if (editingId === c.id) resetForm();
      toast.success('Contact removed.');
    } catch (err) {
      toast.error('Failed: ' + err.message);
    }
  }

  function setField(k, v) {
    setForm(f => ({ ...f, [k]: v }));
    setErr('');
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
      {/* Existing contacts */}
      <div>
        <h3 className="text-sm font-bold text-ink mb-2">
          Saved Contacts
          <span className="ml-2 text-xs font-medium text-gray-400">{contacts.length}</span>
        </h3>

        {loading ? (
          <div className="skeleton h-20 rounded" />
        ) : contacts.length === 0 ? (
          <div className="text-center py-8 bg-gray-50 rounded-xl border border-dashed border-gray-200">
            <Users size={24} className="mx-auto text-gray-400 mb-1.5" />
            <p className="text-sm font-medium text-gray-600">No contacts yet.</p>
            <p className="text-xs text-gray-400 mt-0.5">Add the laboratory staff below.</p>
          </div>
        ) : (
          <div className="space-y-2 max-h-[420px] overflow-y-auto pr-1">
            {contacts.map(c => (
              <div
                key={c.id}
                className={`p-3 rounded-xl border bg-white ${
                  editingId === c.id ? 'border-crimson ring-1 ring-crimson/20' : 'border-gray-200'
                }`}
              >
                <div className="flex items-start gap-3">
                  <div className="w-9 h-9 rounded-full bg-gold-pale text-crimson flex items-center justify-center font-bold text-sm shrink-0">
                    {(c.name || '?').charAt(0).toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-sm text-ink truncate">{c.name || '—'}</p>
                    {c.role && <p className="text-xs text-crimson font-medium truncate">{c.role}</p>}
                    <div className="text-xs text-gray-500 mt-0.5 space-y-0.5">
                      {c.email && <p className="truncate">{c.email}</p>}
                      {c.phone && <p>{c.phone}</p>}
                      {c.location && <p className="text-gray-400 truncate">{c.location}</p>}
                    </div>
                  </div>
                  <div className="flex gap-1 shrink-0">
                    <button onClick={() => startEdit(c)} className="btn-ghost btn-sm p-1.5 text-gray-500" title="Edit">
                      <Edit2 size={13} />
                    </button>
                    <button onClick={() => handleDelete(c)} className="btn-ghost btn-sm p-1.5 text-red-400" title="Remove">
                      <Trash2 size={13} />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Add / edit form */}
      <form onSubmit={handleSave} className="space-y-3 h-fit">
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-bold text-ink">
            {editingId ? 'Edit Contact' : 'Add Contact'}
          </h3>
          {editingId && (
            <button type="button" onClick={resetForm} className="btn-ghost btn-sm ml-auto">
              <X size={13} /> Cancel
            </button>
          )}
        </div>

        <div>
          <label className="label">Contact Name / Title *</label>
          <input className="input" value={form.name}
            onChange={e => setField('name', e.target.value)}
            placeholder="e.g. June Vincent Camoro" />
        </div>
        <div>
          <label className="label">Role / Designation</label>
          <input className="input" value={form.role}
            onChange={e => setField('role', e.target.value)}
            placeholder="e.g. Assigned Dry Lab Teacher" />
        </div>
        <div>
          <label className="label">Email</label>
          <input type="email" className="input" value={form.email}
            onChange={e => setField('email', e.target.value)}
            placeholder="name@knchs.edu.ph" />
        </div>
        <div>
          <label className="label">Phone</label>
          <input className="input" value={form.phone}
            onChange={e => setField('phone', e.target.value)} placeholder="09XX XXX XXXX" />
        </div>
        <div>
          <label className="label">Location / Room</label>
          <input className="input" value={form.location}
            onChange={e => setField('location', e.target.value)}
            placeholder="e.g. Physics/Dry Laboratory — 301" />
        </div>

        {err && <p className="text-xs text-red-600">{err}</p>}

        <button type="submit" disabled={saving} className="btn-primary btn-sm w-full justify-center">
          <Save size={14} /> {saving ? 'Saving…' : editingId ? 'Update Contact' : 'Add Contact'}
        </button>
      </form>
    </div>
  );
}

export default function AdminSettings() {
  const toast = useToast();
  const [tab, setTab] = useState(0);
  const [settings, setSettings] = useState({});
  const [loading, setLoading] = useState(true);
  const [seeding, setSeeding] = useState(false);
  const [seedDone, setSeedDone] = useState(false);
  const [showSeedConfirm, setShowSeedConfirm] = useState(false);

  const TABS = ['Users & Roles', 'Categories', 'Conditions', 'Penalty Rules', 'Contacts', 'Seed Data'];

  useEffect(() => {
    async function load() {
      const [catSnap, condSnap, penSnap] = await Promise.all([
        getDoc(doc(db, 'settings', 'categories')),
        getDoc(doc(db, 'settings', 'conditions')),
        getDoc(doc(db, 'settings', 'penaltyRules')),
      ]);
      setSettings({
        categories: catSnap.exists() ? catSnap.data().list : DEFAULT_CATEGORIES,
        conditions: condSnap.exists() ? condSnap.data().list : DEFAULT_CONDITIONS,
        penaltyRules: penSnap.exists() ? penSnap.data().rules : DEFAULT_PENALTY_RULES,
      });
      setLoading(false);
    }
    load();
  }, []);

  async function saveList(key, list) {
    await setDoc(doc(db, 'settings', key), { list, updatedAt: serverTimestamp() }, { merge: true });
    setSettings(s => ({ ...s, [key]: list }));
  }

  async function savePenaltyRules(rules) {
    await setDoc(doc(db, 'settings', 'penaltyRules'), { rules, updatedAt: serverTimestamp() }, { merge: true });
    setSettings(s => ({ ...s, penaltyRules: rules }));
    toast.success('Penalty rules saved.');
  }

  async function seedData() {
    setSeeding(true);
    try {
      const batch = writeBatch(db);
      SEED_EQUIPMENT.forEach(item => {
        const ref = doc(collection(db, 'equipment'));
        batch.set(ref, { ...item, createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
      });
      await batch.commit();

      await Promise.all([
        setDoc(doc(db, 'settings', 'categories'), { list: DEFAULT_CATEGORIES, updatedAt: serverTimestamp() }),
        setDoc(doc(db, 'settings', 'conditions'), { list: DEFAULT_CONDITIONS, updatedAt: serverTimestamp() }),
        setDoc(doc(db, 'settings', 'penaltyRules'), { rules: DEFAULT_PENALTY_RULES, updatedAt: serverTimestamp() }),
      ]);

      setSeedDone(true);
      setShowSeedConfirm(false);
      toast.success('Starter data loaded successfully!');
    } catch (err) {
      toast.error('Seed failed: ' + err.message);
    } finally {
      setSeeding(false);
    }
  }

  return (
    <div className="space-y-4 max-w-5xl mx-auto animate-fade-in">
      <div className="card">
        <div className="card-header"><Settings size={18} strokeWidth={1.8} /> Admin Settings</div>
        <div className="flex gap-0.5 overflow-x-auto px-4 pt-3 border-b border-gray-100">
          {TABS.map((t, i) => (
            <button
              key={t}
              onClick={() => setTab(i)}
              className={`px-3 py-2 text-sm font-medium border-b-2 whitespace-nowrap transition-colors ${
                tab === i ? 'border-primary-500 text-primary-700' : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              {t}
            </button>
          ))}
        </div>
        <div className="p-4">
          {tab === 0 && <UsersTab />}
          {tab === 1 && (
            <ListEditor
              title="Equipment Categories"
              icon={Tag}
              items={settings.categories}
              onSave={list => saveList('categories', list)}
              loading={loading}
            />
          )}
          {tab === 2 && (
            <ListEditor
              title="Equipment Conditions"
              icon={Sliders}
              items={settings.conditions}
              onSave={list => saveList('conditions', list)}
              loading={loading}
            />
          )}
          {tab === 3 && (
            <div className="space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-2 border-b border-gray-100">
                <div>
                  <h3 className="text-base font-bold text-ink">Laboratory Penalty Rules</h3>
                  <p className="text-xs text-gray-500 mt-0.5">
                    Customize the penalty rules and violation guidelines visible to all students on the Rules & Penalties page.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    const newRule = {
                      id: `rule_${Date.now()}`,
                      title: '',
                      description: '',
                      consequence: '',
                      icon: 'AlertTriangle',
                      iconColor: 'text-crimson',
                      bg: 'bg-gold-pale/50',
                      border: 'border-gold/30',
                    };
                    setSettings(s => ({ ...s, penaltyRules: [...(s.penaltyRules || []), newRule] }));
                  }}
                  className="btn-primary btn-sm shrink-0 self-start sm:self-auto"
                >
                  <Plus size={15} /> Add New Rule
                </button>
              </div>

              {(!settings.penaltyRules || settings.penaltyRules.length === 0) ? (
                <div className="text-center py-8 bg-gray-50 rounded-xl border border-dashed border-gray-200">
                  <BookOpen size={28} className="mx-auto text-gray-400 mb-2" />
                  <p className="text-sm font-medium text-gray-600">No penalty rules configured.</p>
                  <p className="text-xs text-gray-400 mt-1">Click "Add New Rule" above to create one.</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 gap-4">
                  {(settings.penaltyRules || []).map((rule, i) => (
                    <div
                      key={rule.id || i}
                      className="p-4 sm:p-5 border border-gold/25 rounded-2xl bg-white shadow-sm hover:shadow-md transition-shadow relative space-y-3"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs font-bold uppercase tracking-wider text-gold px-2.5 py-0.5 rounded-full bg-crimson-dark/10 border border-gold/30">
                          Rule #{i + 1}
                        </span>
                        <button
                          type="button"
                          onClick={() => {
                            const updated = settings.penaltyRules.filter((_, idx) => idx !== i);
                            setSettings(s => ({ ...s, penaltyRules: updated }));
                          }}
                          className="text-gray-400 hover:text-red-600 p-1.5 rounded-lg hover:bg-red-50 transition-colors"
                          title="Delete Rule"
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        <div>
                          <label className="label text-xs font-semibold text-gray-700">Violation Title</label>
                          <input
                            className="input text-sm font-semibold"
                            placeholder="e.g. Broken Glassware, Late Return..."
                            value={rule.title || ''}
                            onChange={e => {
                              const r = [...settings.penaltyRules];
                              r[i] = { ...r[i], title: e.target.value };
                              setSettings(s => ({ ...s, penaltyRules: r }));
                            }}
                          />
                        </div>
                        <div>
                          <label className="label text-xs font-semibold text-gray-700">Consequence / Penalty</label>
                          <input
                            className="input text-sm"
                            placeholder="e.g. Warning, 1-week restriction, replacement responsibility..."
                            value={rule.consequence || ''}
                            onChange={e => {
                              const r = [...settings.penaltyRules];
                              r[i] = { ...r[i], consequence: e.target.value };
                              setSettings(s => ({ ...s, penaltyRules: r }));
                            }}
                          />
                        </div>
                      </div>

                      <div>
                        <label className="label text-xs font-semibold text-gray-700">Description & Details</label>
                        <textarea
                          className="input text-sm min-h-[60px] resize-y"
                          placeholder="Explain what qualifies as a violation of this rule..."
                          value={rule.description || ''}
                          onChange={e => {
                            const r = [...settings.penaltyRules];
                            r[i] = { ...r[i], description: e.target.value };
                            setSettings(s => ({ ...s, penaltyRules: r }));
                          }}
                        />
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                        <div>
                          <label className="label text-xs text-gray-600">Card Icon</label>
                          <select
                            className="input text-xs"
                            value={rule.icon || 'AlertTriangle'}
                            onChange={e => {
                              const r = [...settings.penaltyRules];
                              r[i] = { ...r[i], icon: e.target.value };
                              setSettings(s => ({ ...s, penaltyRules: r }));
                            }}
                          >
                            <option value="AlertTriangle">Alert Triangle (Warning)</option>
                            <option value="Package">Package (Inventory / Handling)</option>
                            <option value="Tool">Wrench / Tool (Damage / Repair)</option>
                            <option value="AlertCircle">Alert Circle (Critical / Loss)</option>
                          </select>
                        </div>
                        <div>
                          <label className="label text-xs text-gray-600">Color Badge Style</label>
                          <select
                            className="input text-xs"
                            value={rule.colorPreset || (rule.bg === 'bg-amber-50' ? 'amber' : rule.bg === 'bg-orange-50' ? 'orange' : rule.bg === 'bg-red-50' ? 'red' : 'gold')}
                            onChange={e => {
                              const presets = {
                                gold: { bg: 'bg-gold-pale/50', border: 'border-gold/30', iconColor: 'text-crimson' },
                                amber: { bg: 'bg-amber-50', border: 'border-amber-200', iconColor: 'text-amber-500' },
                                orange: { bg: 'bg-orange-50', border: 'border-orange-200', iconColor: 'text-orange-500' },
                                red: { bg: 'bg-red-50', border: 'border-red-200', iconColor: 'text-red-500' },
                              };
                              const selected = presets[e.target.value] || presets.gold;
                              const r = [...settings.penaltyRules];
                              r[i] = { ...r[i], colorPreset: e.target.value, ...selected };
                              setSettings(s => ({ ...s, penaltyRules: r }));
                            }}
                          >
                            <option value="gold">Gold / Crimson (Theme Default)</option>
                            <option value="amber">Amber (Moderate Warning)</option>
                            <option value="orange">Orange (Damage Assessment)</option>
                            <option value="red">Red (Severe / Replacement)</option>
                          </select>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              <div className="pt-2 flex items-center justify-between">
                <button
                  type="button"
                  onClick={() => savePenaltyRules(settings.penaltyRules)}
                  className="btn-primary"
                >
                  <Save size={15} /> Save All Penalty Rules
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setSettings(s => ({ ...s, penaltyRules: DEFAULT_PENALTY_RULES }));
                    toast.info('Reset to default rules in editor. Click Save to persist.');
                  }}
                  className="btn-ghost btn-sm text-gray-500 hover:text-crimson"
                >
                  Restore Defaults
                </button>
              </div>
            </div>
          )}
          {tab === 4 && <ContactsTab />}
          {tab === 5 && (
            <div className="space-y-4">
              <div className="p-4 bg-amber-50 border border-amber-200 rounded-xl">
                <div className="flex items-start gap-2.5">
                  <AlertTriangle size={18} className="text-amber-600 shrink-0 mt-0.5" />
                  <div>
                    <p className="text-sm font-semibold text-amber-800">One-time action</p>
                    <p className="text-sm text-amber-700 mt-1">
                      This will add 8 equipment items, default categories, conditions, and penalty rules to Firestore.
                      Run this only once on a fresh database — it doesn't check for duplicates.
                    </p>
                  </div>
                </div>
              </div>
              {seedDone && (
                <div className="p-3 bg-green-50 border border-green-200 rounded-xl text-sm text-green-700 font-medium">
                  ✓ Starter data loaded successfully.
                </div>
              )}
              <button
                onClick={() => setShowSeedConfirm(true)}
                disabled={seeding || seedDone}
                className="btn-primary"
              >
                <Database size={16} />
                {seeding ? 'Loading…' : seedDone ? 'Already Loaded' : 'Load Starter Data'}
              </button>
              <ConfirmDialog
                isOpen={showSeedConfirm}
                title="Load Starter Data"
                message="This will add equipment, categories, conditions, and penalty rules to your Firestore database. Proceed?"
                confirmLabel="Yes, Load Data"
                onConfirm={seedData}
                onCancel={() => setShowSeedConfirm(false)}
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
