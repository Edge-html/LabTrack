import React, { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  AlertOctagon, Plus, Search, Check, Ban, User, Loader2,
} from 'lucide-react';
import { useToast } from '../../context/ToastContext';
import { useAuth } from '../../context/AuthContext';
import { db } from '../../lib/firebase';
import {
  collection, query, getDocs, addDoc, updateDoc, doc,
  serverTimestamp, orderBy, limit,
} from 'firebase/firestore';
import { formatDate, formatTimestamp, getTodayManila, addDays } from '../../lib/helpers';
import { TableSkeleton } from '../../components/LoadingSpinner';
import {
  WARNING_TYPES, WARNING_TYPE_LABELS, WARNING_SEVERITY, warningTypeLabel,
} from '../../components/WarningsPanel';

const SEVERITY_OPTIONS = [
  { value: 'warning', label: 'Warning' },
  { value: 'major', label: 'Major Warning' },
  { value: 'critical', label: 'Critical' },
];

/* ── Issue a new warning ─────────────────────────────────────────────────── */

function WarningForm({ users, initial, onSave, onCancel }) {
  const today = getTodayManila();
  const [form, setForm] = useState({
    userId: initial?.userId || '',
    type: initial?.type || 'not_returned',
    severity: initial?.severity || 'warning',
    message: '',
    requestId: initial?.requestId || '',
    labBookingId: initial?.labBookingId || '',
    applyRestriction: false,
    restrictionDays: '7',
    restrictionReason: '',
  });
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');

  function setField(k, v) {
    setForm(f => ({ ...f, [k]: v }));
    setErr('');
  }

  function pickUser(uid) {
    setForm(f => ({ ...f, userId: uid }));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!form.userId) return setErr('Please select a student.');
    if (!form.message.trim()) return setErr('Please describe the warning.');
    setSaving(true);
    await onSave(form);
    setSaving(false);
  }

  const selected = users.find(u => u.id === form.userId);

  return (
    <form onSubmit={handleSubmit} className="p-5 space-y-4">
      {(initial?.requestId || initial?.labBookingId) && (
        <div className="p-2.5 bg-primary-50 border border-primary-100 rounded-xl text-sm text-primary-700">
          This warning will be linked to{' '}
          {initial.requestId ? (
            <>equipment request <span className="font-mono font-semibold">{initial.requestId}</span></>
          ) : (
            <>laboratory booking <span className="font-mono font-semibold">{initial.labBookingId}</span></>
          )}{' '}
          and shown on the student's account.
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className="label">Student *</label>
          <select className="input" value={form.userId} onChange={e => pickUser(e.target.value)} required>
            <option value="">Select a student…</option>
            {users.map(u => (
              <option key={u.id} value={u.id}>
                {u.name} — {u.gradeLevel || '—'} {u.section ? `· ${u.section}` : ''}
              </option>
            ))}
          </select>
          {selected && (
            <p className="text-xs text-gray-500 mt-1">
              {selected.email}
              {selected.borrowRestrictedUntil && selected.borrowRestrictedUntil >= today && (
                <span className="text-red-600 font-semibold">
                  {' '}· currently restricted until {formatDate(selected.borrowRestrictedUntil)}
                </span>
              )}
            </p>
          )}
        </div>

        <div>
          <label className="label">Reason *</label>
          <select className="input" value={form.type} onChange={e => setField('type', e.target.value)}>
            {WARNING_TYPES.map(t => (
              <option key={t} value={t}>{WARNING_TYPE_LABELS[t]}</option>
            ))}
          </select>
        </div>

        <div>
          <label className="label">Severity</label>
          <select className="input" value={form.severity} onChange={e => setField('severity', e.target.value)}>
            {SEVERITY_OPTIONS.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
          </select>
        </div>

        <div>
          <label className="label">Equipment Request ID (optional)</label>
          <input className="input" value={form.requestId}
            onChange={e => setField('requestId', e.target.value)} placeholder="Request ID" />
        </div>

        <div className="sm:col-span-2">
          <label className="label">Warning Message *</label>
          <textarea className="input min-h-[80px] resize-none" required maxLength={1000}
            value={form.message}
            onChange={e => setField('message', e.target.value)}
            placeholder="Describe what happened and what the student must do (e.g. 'Beaker was returned cracked. Report to the laboratory at 7:00 AM to settle the assessment.')"
          />
        </div>
      </div>

      {/* Restriction toggle */}
      <div className="border border-amber-200 bg-amber-50 rounded-xl p-4 space-y-3">
        <label className="flex items-center gap-2 cursor-pointer">
          <input type="checkbox" className="w-4 h-4 accent-primary-600"
            checked={form.applyRestriction}
            onChange={e => setField('applyRestriction', e.target.checked)} />
          <span className="text-sm font-semibold text-amber-800">
            Also suspend borrowing &amp; lab booking privileges
          </span>
        </label>
        {form.applyRestriction && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="label text-xs">Duration (days)</label>
              <input type="number" min="1" className="input" value={form.restrictionDays}
                onChange={e => setField('restrictionDays', e.target.value)} />
            </div>
            <div>
              <label className="label text-xs">Restriction Reason</label>
              <input className="input" value={form.restrictionReason}
                onChange={e => setField('restrictionReason', e.target.value)}
                placeholder="Shown on the student's blocked page" />
            </div>
          </div>
        )}
      </div>

      {err && <p className="text-sm text-red-600">{err}</p>}

      <div className="flex gap-2 justify-end">
        {onCancel && <button type="button" onClick={onCancel} className="btn-secondary btn-sm">Cancel</button>}
        <button type="submit" disabled={saving} className="btn-danger btn-sm">
          {saving ? <><Loader2 size={14} className="animate-spin" /> Saving…</> : <><AlertOctagon size={14} /> Issue Warning</>}
        </button>
      </div>
    </form>
  );
}

/* ── Resolve / reopen ────────────────────────────────────────────────────── */

function ResolveModal({ warning, onClose, onConfirm }) {
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-2xl max-w-md w-full p-6 animate-fade-in">
        <h3 className="font-semibold text-gray-900 mb-1">
          {warning.resolved ? 'Reopen Warning' : 'Mark Warning as Resolved'}
        </h3>
        <p className="text-sm text-gray-500 mb-4">
          {warning.studentName} · {warningTypeLabel(warning.type)}
        </p>
        <label className="label">Resolution Note</label>
        <textarea className="input min-h-[80px] resize-none mb-4" value={note}
          onChange={e => setNote(e.target.value)}
          placeholder="How was this settled? (e.g. 'Replaced the broken beaker.')" />
        <div className="flex gap-2 justify-end">
          <button onClick={onClose} className="btn-secondary btn-sm">Cancel</button>
          <button
            disabled={busy}
            onClick={async () => { setBusy(true); await onConfirm(note.trim()); setBusy(false); }}
            className="btn-primary btn-sm"
          >
            {busy ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />} Confirm
          </button>
        </div>
      </div>
    </div>
  );
}

/* ── Page ────────────────────────────────────────────────────────────────── */

export default function Warnings() {
  const toast = useToast();
  const { userProfile } = useAuth();
  const [searchParams] = useSearchParams();

  const [warnings, setWarnings] = useState([]);
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [prefill, setPrefill] = useState(null);
  const [showResolved, setShowResolved] = useState(true);
  const [resolveTarget, setResolveTarget] = useState(null);

  // Deep link from a request or lab booking: ?userId=..&requestId=..&labBookingId=..
  const preUserId = searchParams.get('userId') || '';
  const preRequestId = searchParams.get('requestId') || '';
  const preLabBookingId = searchParams.get('labBookingId') || '';

  useEffect(() => { load(); }, []);

  useEffect(() => {
    if (!preUserId && !preRequestId && !preLabBookingId) return;
    setPrefill({
      userId: preUserId,
      requestId: preRequestId,
      labBookingId: preLabBookingId,
    });
    setShowForm(true);
  }, [preUserId, preRequestId, preLabBookingId]);

  async function load() {
    setLoading(true);
    try {
      const [wSnap, uSnap] = await Promise.all([
        getDocs(query(collection(db, 'warnings'), orderBy('issuedAt', 'desc'), limit(200))),
        getDocs(query(collection(db, 'users'), orderBy('name'))),
      ]);
      setWarnings(wSnap.docs.map(d => ({ id: d.id, ...d.data() })));
      setUsers(uSnap.docs.map(d => ({ id: d.id, ...d.data() })));
    } catch (err) {
      console.error(err);
      toast.error('Failed to load warnings.');
    } finally {
      setLoading(false);
    }
  }

  async function handleSave(form) {
    try {
      const student = users.find(u => u.id === form.userId);
      await addDoc(collection(db, 'warnings'), {
        userId: form.userId,
        studentName: student?.name || '',
        gradeLevel: student?.gradeLevel || '',
        section: student?.section || '',
        type: form.type,
        severity: form.severity,
        message: form.message.trim(),
        requestId: form.requestId || '',
        labBookingId: form.labBookingId || '',
        sourceType: form.requestId ? 'request' : form.labBookingId ? 'labBooking' : 'manual',
        issuedBy: userProfile?.uid || '',
        issuedByName: userProfile?.name || 'Laboratory Staff',
        issuedAt: serverTimestamp(),
        resolved: false,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      if (form.applyRestriction) {
        const days = parseInt(form.restrictionDays) || 7;
        const until = addDays(getTodayManila(), days);
        await updateDoc(doc(db, 'users', form.userId), {
          borrowRestrictedUntil: until,
          restrictionReason: form.restrictionReason || `Warning: ${WARNING_TYPE_LABELS[form.type]}`,
          updatedAt: serverTimestamp(),
        });
        toast.success(`Warning issued. Borrowing suspended until ${formatDate(until)}.`);
      } else {
        toast.success('Warning issued.');
      }

      setShowForm(false);
      setPrefill(null);
      load();
    } catch (err) {
      toast.error('Failed: ' + err.message);
    }
  }

  async function handleResolveToggle(warning, note) {
    try {
      const next = !warning.resolved;
      await updateDoc(doc(db, 'warnings', warning.id), {
        resolved: next,
        resolvedAt: next ? serverTimestamp() : null,
        resolvedBy: next ? (userProfile?.name || 'Laboratory Staff') : null,
        resolutionNote: next ? note : '',
        updatedAt: serverTimestamp(),
      });
      toast.success(next ? 'Warning marked as resolved.' : 'Warning reopened.');
      setResolveTarget(null);
      load();
    } catch (err) {
      toast.error('Failed: ' + err.message);
    }
  }

  const filtered = warnings.filter(w => {
    const q = search.toLowerCase();
    const matchSearch =
      !q ||
      w.studentName?.toLowerCase().includes(q) ||
      w.message?.toLowerCase().includes(q) ||
      warningTypeLabel(w.type).toLowerCase().includes(q);
    const matchResolved = showResolved || !w.resolved;
    return matchSearch && matchResolved;
  });

  const activeCount = warnings.filter(w => !w.resolved).length;

  return (
    <div className="space-y-4 max-w-6xl mx-auto animate-fade-in">
      <div className="card">
        <div className="card-header">
          <AlertOctagon size={18} strokeWidth={1.8} />
          Account Warnings
          <span className="ml-auto text-xs font-semibold text-white/90">
            {activeCount} active
          </span>
          <button
            onClick={() => { setPrefill(null); setShowForm(v => !v); }}
            className="btn-secondary btn-sm"
          >
            <Plus size={14} /> Issue Warning
          </button>
        </div>

        {showForm && (
          <div className="border-b border-gray-100">
            <div className="bg-red-50 px-5 py-2 text-sm font-semibold text-red-700 border-b border-red-100">
              New Account Warning
            </div>
            <WarningForm
              users={users}
              initial={prefill}
              onSave={handleSave}
              onCancel={() => { setShowForm(false); setPrefill(null); }}
            />
          </div>
        )}

        <div className="p-4 flex flex-wrap gap-3 border-b border-gray-100">
          <div className="relative flex-1 min-w-[200px]">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input className="input pl-9" placeholder="Search by student, reason or message…"
              value={search} onChange={e => setSearch(e.target.value)} />
          </div>
          <label className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer select-none">
            <input type="checkbox" className="w-4 h-4 accent-primary-600"
              checked={showResolved} onChange={e => setShowResolved(e.target.checked)} />
            Show resolved
          </label>
        </div>

        {loading ? (
          <TableSkeleton rows={5} cols={6} />
        ) : filtered.length === 0 ? (
          <div className="py-12 text-center text-gray-400">
            <AlertOctagon size={32} className="mx-auto mb-2 opacity-30" />
            <p className="text-sm">No warnings on record.</p>
          </div>
        ) : (
          <div className="table-container">
            <table className="table">
              <thead>
                <tr>
                  <th>Student</th>
                  <th>Reason</th>
                  <th>Severity</th>
                  <th>Message</th>
                  <th>Issued</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(w => {
                  const sev = WARNING_SEVERITY[w.severity] || WARNING_SEVERITY.warning;
                  return (
                    <tr key={w.id} className={w.resolved ? 'opacity-55' : ''}>
                      <td data-label="Student">
                        <p className="font-medium text-sm">{w.studentName || '—'}</p>
                        <p className="text-xs text-gray-400">{w.gradeLevel} {w.section ? `· ${w.section}` : ''}</p>
                      </td>
                      <td data-label="Reason" className="text-sm">{warningTypeLabel(w.type)}</td>
                      <td data-label="Severity">
                        <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full border ${sev.cls}`}>
                          {sev.label}
                        </span>
                      </td>
                      <td data-label="Message" className="text-sm max-w-[280px]">
                        <p className="line-clamp-2">{w.message}</p>
                        {w.requestId && (
                          <p className="text-[11px] text-gray-400 mt-0.5 font-mono">req: {w.requestId}</p>
                        )}
                      </td>
                      <td data-label="Issued">
                        <p className="text-sm">{formatTimestamp(w.issuedAt)}</p>
                        <p className="text-xs text-gray-400">{w.issuedByName}</p>
                      </td>
                      <td>
                        <div className="flex gap-1">
                          <button
                            onClick={() => setResolveTarget(w)}
                            className={`btn-secondary btn-sm ${w.resolved ? '' : 'text-green-700'}`}
                          >
                            {w.resolved ? <><Ban size={13} /> Reopen</> : <><Check size={13} /> Resolve</>}
                          </button>
                          {!w.requestId && (
                            <button
                              onClick={() => { setPrefill({ userId: w.userId, type: w.type, requestId: '' }); setShowForm(true); }}
                              className="btn-ghost btn-sm p-1.5 text-crimson"
                              title="Issue follow-up warning"
                            >
                              <Plus size={14} />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="card p-4 flex items-start gap-2.5 bg-gold-pale/30 border-gold/30">
        <User size={16} className="text-crimson shrink-0 mt-0.5" />
        <p className="text-xs text-gray-600">
          Warnings appear on the student's dashboard and on any equipment request or laboratory booking they
          are linked to. Ticking <span className="font-semibold">“suspend privileges”</span> also blocks the
          student from submitting new requests until the restriction date.
        </p>
      </div>

      {resolveTarget && (
        <ResolveModal
          warning={resolveTarget}
          onClose={() => setResolveTarget(null)}
          onConfirm={note => handleResolveToggle(resolveTarget, note)}
        />
      )}
    </div>
  );
}