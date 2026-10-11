import React, { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { AlertTriangle, Plus, Search, User, Ban } from 'lucide-react';
import { useToast } from '../../context/ToastContext';
import { db } from '../../lib/firebase';
import {
  collection, query, getDocs, addDoc, updateDoc,
  doc, serverTimestamp, orderBy, limit, getDoc,
} from 'firebase/firestore';
import { formatDate, getTodayManila, addDays } from '../../lib/helpers';
import { TableSkeleton } from '../../components/LoadingSpinner';

const VIOLATION_TYPES = ['late return', 'improperly returned', 'damaged', 'lost', 'other'];

function ViolationForm({ initial, users, onSave, onCancel }) {
  const today = getTodayManila();
  const [form, setForm] = useState({
    requestId: initial?.requestId || '',
    userId: initial?.userId || '',
    studentName: initial?.studentName || '',
    violationType: initial?.violationType || 'late return',
    description: initial?.description || '',
    consequence: initial?.consequence || '',
    dateRecorded: today,
    staffRemarks: initial?.staffRemarks || '',
    applyRestriction: false,
    restrictionDays: '7',
    restrictionReason: '',
  });
  const [saving, setSaving] = useState(false);

  function setField(k, v) { setForm(f => ({ ...f, [k]: v })); }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!form.userId || !form.studentName || !form.description) return;
    setSaving(true);
    await onSave(form);
    setSaving(false);
  }

  return (
    <form onSubmit={handleSubmit} className="p-5 space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className="label">Student Name *</label>
          <input
            className="input" required
            value={form.studentName}
            onChange={e => setField('studentName', e.target.value)}
            placeholder="Student's full name"
          />
        </div>
        <div>
          <label className="label">Student UID</label>
          <input
            className="input" required
            value={form.userId}
            onChange={e => setField('userId', e.target.value)}
            placeholder="Firebase UID"
          />
        </div>
        <div>
          <label className="label">Request ID (optional)</label>
          <input className="input"
            value={form.requestId}
            onChange={e => setField('requestId', e.target.value)}
            placeholder="Request ID"
          />
        </div>
        <div>
          <label className="label">Violation Type</label>
          <select className="input" value={form.violationType} onChange={e => setField('violationType', e.target.value)}>
            {VIOLATION_TYPES.map(t => <option key={t}>{t}</option>)}
          </select>
        </div>
        <div className="sm:col-span-2">
          <label className="label">Description *</label>
          <textarea className="input min-h-[70px] resize-none" required
            value={form.description}
            onChange={e => setField('description', e.target.value)}
            placeholder="Describe the violation…"
          />
        </div>
        <div>
          <label className="label">Consequence</label>
          <input className="input"
            value={form.consequence}
            onChange={e => setField('consequence', e.target.value)}
            placeholder="e.g. Warning, replacement required"
          />
        </div>
        <div>
          <label className="label">Date Recorded</label>
          <input type="date" className="input"
            value={form.dateRecorded}
            onChange={e => setField('dateRecorded', e.target.value)}
          />
        </div>
        <div className="sm:col-span-2">
          <label className="label">Staff Remarks</label>
          <input className="input"
            value={form.staffRemarks}
            onChange={e => setField('staffRemarks', e.target.value)}
          />
        </div>
      </div>

      {/* Restriction toggle */}
      <div className="border border-amber-200 bg-amber-50 rounded-xl p-4 space-y-3">
        <label className="flex items-center gap-2 cursor-pointer">
          <input type="checkbox" className="w-4 h-4 accent-primary-600"
            checked={form.applyRestriction}
            onChange={e => setField('applyRestriction', e.target.checked)}
          />
          <span className="text-sm font-semibold text-amber-800">Apply Borrowing Restriction</span>
        </label>
        {form.applyRestriction && (
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label text-xs">Duration (days)</label>
              <input type="number" min="1" className="input" value={form.restrictionDays}
                onChange={e => setField('restrictionDays', e.target.value)} />
            </div>
            <div>
              <label className="label text-xs">Reason</label>
              <input className="input" value={form.restrictionReason}
                onChange={e => setField('restrictionReason', e.target.value)}
                placeholder="Why is this student restricted?" />
            </div>
          </div>
        )}
      </div>

      <div className="flex gap-2 justify-end">
        {onCancel && <button type="button" onClick={onCancel} className="btn-secondary btn-sm">Cancel</button>}
        <button type="submit" disabled={saving} className="btn-primary btn-sm">
          {saving ? 'Saving…' : 'Record Violation'}
        </button>
      </div>
    </form>
  );
}

export default function PenaltiesViolations() {
  const toast = useToast();
  const [searchParams] = useSearchParams();
  const [penalties, setPenalties] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [search, setSearch] = useState('');

  const preRequestId = searchParams.get('requestId') || '';
  const preUserId = searchParams.get('userId') || '';
  const preStudentName = decodeURIComponent(searchParams.get('studentName') || '');

  useEffect(() => {
    load();
    if (preRequestId) setShowForm(true);
  }, []);

  async function load() {
    setLoading(true);
    try {
      const snap = await getDocs(
        query(collection(db, 'penalties'), orderBy('dateRecorded', 'desc'), limit(100))
      );
      setPenalties(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    } finally {
      setLoading(false);
    }
  }

  const today = getTodayManila();

  async function handleSave(form) {
    try {
      await addDoc(collection(db, 'penalties'), {
        requestId: form.requestId,
        userId: form.userId,
        studentName: form.studentName,
        violationType: form.violationType,
        description: form.description,
        consequence: form.consequence,
        dateRecorded: form.dateRecorded,
        staffRemarks: form.staffRemarks,
        createdAt: serverTimestamp(),
      });

      if (form.applyRestriction && form.userId) {
        const days = parseInt(form.restrictionDays) || 7;
        const until = addDays(today, days);
        await updateDoc(doc(db, 'users', form.userId), {
          borrowRestrictedUntil: until,
          restrictionReason: form.restrictionReason || `Violation: ${form.violationType}`,
          updatedAt: serverTimestamp(),
        });
        toast.success(`Violation recorded and restriction applied until ${formatDate(until)}.`);
      } else {
        toast.success('Violation recorded.');
      }

      setShowForm(false);
      load();
    } catch (err) {
      toast.error('Failed: ' + err.message);
    }
  }

  const filtered = penalties.filter(p => {
    const q = search.toLowerCase();
    return !q || p.studentName?.toLowerCase().includes(q) || p.violationType?.toLowerCase().includes(q);
  });

  return (
    <div className="space-y-4 max-w-5xl mx-auto animate-fade-in">
      <div className="card">
        <div className="card-header">
          <AlertTriangle size={18} strokeWidth={1.8} />
          Penalties & Violations
          <button onClick={() => setShowForm(v => !v)} className="ml-auto btn-secondary btn-sm">
            <Plus size={14} /> Record Violation
          </button>
        </div>

        {showForm && (
          <div className="border-b border-gray-100">
            <div className="bg-primary-50 px-5 py-2 text-sm font-semibold text-primary-700 border-b border-primary-100">
              New Violation
            </div>
            <ViolationForm
              initial={{ requestId: preRequestId, userId: preUserId, studentName: preStudentName }}
              onSave={handleSave}
              onCancel={() => setShowForm(false)}
            />
          </div>
        )}

        <div className="p-4 border-b border-gray-100">
          <div className="relative max-w-xs">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              className="input pl-9"
              placeholder="Search by student or type…"
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>
        </div>

        {loading ? (
          <TableSkeleton rows={4} cols={5} />
        ) : filtered.length === 0 ? (
          <div className="py-12 text-center text-gray-400">
            <AlertTriangle size={32} className="mx-auto mb-2 opacity-30" />
            <p className="text-sm">No violations on record.</p>
          </div>
        ) : (
          <div className="table-container">
            <table className="table">
              <thead>
                <tr>
                  <th>Student</th>
                  <th>Violation Type</th>
                  <th>Description</th>
                  <th>Consequence</th>
                  <th>Date Recorded</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(p => (
                  <tr key={p.id}>
                    <td data-label="Student" className="font-medium">{p.studentName}</td>
                    <td data-label="Type">
                      <span className="capitalize text-xs font-semibold text-red-600 bg-red-50 px-2 py-0.5 rounded-full">
                        {p.violationType}
                      </span>
                    </td>
                    <td data-label="Description" className="text-sm">{p.description}</td>
                    <td data-label="Consequence" className="text-sm">{p.consequence || '—'}</td>
                    <td data-label="Date">{formatDate(p.dateRecorded)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
