import React, { useEffect, useState } from 'react';
import {
  Settings, Users, Tag, Sliders, BookOpen, Phone,
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

export default function AdminSettings() {
  const toast = useToast();
  const [tab, setTab] = useState(0);
  const [settings, setSettings] = useState({});
  const [loading, setLoading] = useState(true);
  const [seeding, setSeeding] = useState(false);
  const [seedDone, setSeedDone] = useState(false);
  const [showSeedConfirm, setShowSeedConfirm] = useState(false);
  const [contact, setContact] = useState({ name: '', email: '', phone: '', location: '' });
  const [savingContact, setSavingContact] = useState(false);

  const TABS = ['Users & Roles', 'Categories', 'Conditions', 'Penalty Rules', 'Contact Info', 'Seed Data'];

  useEffect(() => {
    async function load() {
      const [catSnap, condSnap, penSnap, contactSnap] = await Promise.all([
        getDoc(doc(db, 'settings', 'categories')),
        getDoc(doc(db, 'settings', 'conditions')),
        getDoc(doc(db, 'settings', 'penaltyRules')),
        getDoc(doc(db, 'settings', 'contact')),
      ]);
      setSettings({
        categories: catSnap.exists() ? catSnap.data().list : DEFAULT_CATEGORIES,
        conditions: condSnap.exists() ? condSnap.data().list : DEFAULT_CONDITIONS,
        penaltyRules: penSnap.exists() ? penSnap.data().rules : DEFAULT_PENALTY_RULES,
      });
      if (contactSnap.exists()) setContact(contactSnap.data());
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

  async function saveContact(e) {
    e.preventDefault();
    setSavingContact(true);
    await setDoc(doc(db, 'settings', 'contact'), { ...contact, updatedAt: serverTimestamp() }, { merge: true });
    setSavingContact(false);
    toast.success('Contact info saved.');
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
            <div className="space-y-3">
              <p className="text-sm text-gray-600">Manage penalty rule cards shown on the Rules & Penalties page.</p>
              {(settings.penaltyRules || []).map((rule, i) => (
                <div key={rule.id || i} className="p-4 border border-gray-200 rounded-xl space-y-2">
                  <input className="input text-sm font-semibold" value={rule.title}
                    onChange={e => {
                      const r = [...settings.penaltyRules]; r[i] = { ...r[i], title: e.target.value };
                      setSettings(s => ({ ...s, penaltyRules: r }));
                    }} />
                  <textarea className="input text-sm min-h-[50px] resize-none" value={rule.description}
                    onChange={e => {
                      const r = [...settings.penaltyRules]; r[i] = { ...r[i], description: e.target.value };
                      setSettings(s => ({ ...s, penaltyRules: r }));
                    }} />
                  <input className="input text-sm" placeholder="Consequence" value={rule.consequence}
                    onChange={e => {
                      const r = [...settings.penaltyRules]; r[i] = { ...r[i], consequence: e.target.value };
                      setSettings(s => ({ ...s, penaltyRules: r }));
                    }} />
                </div>
              ))}
              <button onClick={() => savePenaltyRules(settings.penaltyRules)} className="btn-primary btn-sm">
                <Save size={14} /> Save Rules
              </button>
            </div>
          )}
          {tab === 4 && (
            <form onSubmit={saveContact} className="space-y-3 max-w-md">
              <div>
                <label className="label">Contact Name / Title</label>
                <input className="input" value={contact.name} onChange={e => setContact(c => ({ ...c, name: e.target.value }))} placeholder="e.g. Mr. dela Cruz, Laboratory Staff" />
              </div>
              <div>
                <label className="label">Email</label>
                <input type="email" className="input" value={contact.email} onChange={e => setContact(c => ({ ...c, email: e.target.value }))} />
              </div>
              <div>
                <label className="label">Phone</label>
                <input className="input" value={contact.phone || ''} onChange={e => setContact(c => ({ ...c, phone: e.target.value }))} />
              </div>
              <div>
                <label className="label">Location / Room</label>
                <input className="input" value={contact.location || ''} onChange={e => setContact(c => ({ ...c, location: e.target.value }))} />
              </div>
              <button type="submit" disabled={savingContact} className="btn-primary btn-sm">
                <Save size={14} /> {savingContact ? 'Saving…' : 'Save Contact Info'}
              </button>
            </form>
          )}
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
