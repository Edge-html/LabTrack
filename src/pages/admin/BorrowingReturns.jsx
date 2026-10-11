import React, { useEffect, useState } from 'react';
import { useSearchParams, useNavigate, Link } from 'react-router-dom';
import { Archive, Search, X, Check, AlertTriangle } from 'lucide-react';
import { useToast } from '../../context/ToastContext';
import { db } from '../../lib/firebase';
import {
  collection, query, where, getDocs, doc, runTransaction,
  serverTimestamp, orderBy, limit,
} from 'firebase/firestore';
import { formatDate, getTodayManila } from '../../lib/helpers';
import { StatusBadge } from '../../components/StatusBadge';
import { TableSkeleton } from '../../components/LoadingSpinner';

function BorrowModal({ request, onClose, onConfirm }) {
  const today = getTodayManila();
  const [releaseDate, setReleaseDate] = useState(today);
  const [items, setItems] = useState(
    request.items?.map(item => ({ ...item, qtyReleased: item.qtyRequested })) || []
  );
  const [submitting, setSubmitting] = useState(false);

  async function handle() {
    setSubmitting(true);
    await onConfirm(releaseDate, items);
    setSubmitting(false);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-2xl max-w-lg w-full p-6 animate-fade-in overflow-y-auto max-h-[90vh]">
        <h3 className="font-semibold text-gray-900 mb-1">Mark as Borrowed</h3>
        <p className="text-sm text-gray-500 mb-4">
          {request.borrowerName} — {request.experiment}
        </p>
        <div className="mb-4">
          <label className="label">Release Date</label>
          <input type="date" className="input" value={releaseDate} onChange={e => setReleaseDate(e.target.value)} />
        </div>
        <div className="space-y-2 mb-4">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Quantity Released:</p>
          {items.map((item, i) => (
            <div key={i} className="flex items-center gap-3 p-2 bg-gray-50 rounded-xl text-sm">
              <span className="flex-1 font-medium">{item.name}</span>
              <span className="text-gray-500 text-xs">Approved: {item.qtyRequested}</span>
              <input
                type="number" min="0" max={item.qtyRequested}
                className="input w-20 text-sm min-h-[36px] py-1"
                value={item.qtyReleased}
                onChange={e => {
                  const u = [...items];
                  u[i] = { ...u[i], qtyReleased: parseInt(e.target.value) || 0 };
                  setItems(u);
                }}
              />
            </div>
          ))}
        </div>
        <div className="flex gap-2 justify-end">
          <button onClick={onClose} className="btn-secondary btn-sm">Cancel</button>
          <button onClick={handle} disabled={submitting} className="btn-primary btn-sm">
            <Check size={14} /> {submitting ? 'Saving…' : 'Mark Borrowed'}
          </button>
        </div>
      </div>
    </div>
  );
}

function ReturnModal({ request, onClose, onConfirm }) {
  const today = getTodayManila();
  const [returnDate, setReturnDate] = useState(today);
  const [items, setItems] = useState(
    request.items?.map(item => ({
      ...item,
      qtyReturned: item.qtyReleased || item.qtyRequested,
      qtyDamaged: 0,
      qtyMissing: 0,
      conditionOnReturn: 'Good',
    })) || []
  );
  const [submitting, setSubmitting] = useState(false);

  async function handle() {
    setSubmitting(true);
    await onConfirm(returnDate, items);
    setSubmitting(false);
  }

  const isLate = returnDate > request.expectedReturnDate;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-2xl max-w-2xl w-full p-6 animate-fade-in overflow-y-auto max-h-[90vh]">
        <h3 className="font-semibold text-gray-900 mb-1">Mark as Returned</h3>
        <p className="text-sm text-gray-500 mb-2">
          {request.borrowerName} — {request.experiment}
        </p>
        {isLate && (
          <div className="flex items-center gap-2 text-orange-700 bg-orange-50 border border-orange-200 rounded-xl px-3 py-2 mb-3 text-sm">
            <AlertTriangle size={15} /> Return date is past the expected return date — this may trigger a late penalty.
          </div>
        )}
        <div className="mb-4">
          <label className="label">Actual Return Date</label>
          <input type="date" className="input" value={returnDate} onChange={e => setReturnDate(e.target.value)} />
        </div>
        <div className="space-y-3 mb-4">
          {items.map((item, i) => (
            <div key={i} className="p-3 bg-gray-50 rounded-xl text-sm space-y-2">
              <p className="font-semibold">{item.name} (Released: {item.qtyReleased || item.qtyRequested})</p>
              <div className="grid grid-cols-3 gap-2">
                <div>
                  <label className="text-xs text-gray-500">Returned</label>
                  <input type="number" min="0" className="input text-sm min-h-[36px] py-1"
                    value={item.qtyReturned}
                    onChange={e => { const u = [...items]; u[i] = { ...u[i], qtyReturned: parseInt(e.target.value) || 0 }; setItems(u); }}
                  />
                </div>
                <div>
                  <label className="text-xs text-gray-500">Damaged</label>
                  <input type="number" min="0" className="input text-sm min-h-[36px] py-1"
                    value={item.qtyDamaged}
                    onChange={e => { const u = [...items]; u[i] = { ...u[i], qtyDamaged: parseInt(e.target.value) || 0 }; setItems(u); }}
                  />
                </div>
                <div>
                  <label className="text-xs text-gray-500">Missing</label>
                  <input type="number" min="0" className="input text-sm min-h-[36px] py-1"
                    value={item.qtyMissing}
                    onChange={e => { const u = [...items]; u[i] = { ...u[i], qtyMissing: parseInt(e.target.value) || 0 }; setItems(u); }}
                  />
                </div>
              </div>
              <div>
                <label className="text-xs text-gray-500">Condition on Return</label>
                <input className="input text-sm" value={item.conditionOnReturn}
                  onChange={e => { const u = [...items]; u[i] = { ...u[i], conditionOnReturn: e.target.value }; setItems(u); }}
                  placeholder="e.g. Good, Cracked, etc."
                />
              </div>
            </div>
          ))}
        </div>
        <div className="flex gap-2 justify-end">
          <button onClick={onClose} className="btn-secondary btn-sm">Cancel</button>
          <button onClick={handle} disabled={submitting} className="btn-primary btn-sm">
            <Check size={14} /> {submitting ? 'Saving…' : 'Mark Returned'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function BorrowingReturns() {
  const toast = useToast();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [borrowTarget, setBorrowTarget] = useState(null);
  const [returnTarget, setReturnTarget] = useState(null);
  const [showViolationPrompt, setShowViolationPrompt] = useState(null);

  const [tab, setTab] = useState(0);

  const preId = searchParams.get('id');
  const preAction = searchParams.get('action');

  useEffect(() => {
    load();
  }, [tab]);

  useEffect(() => {
    if (preId && requests.length > 0) {
      const r = requests.find(x => x.id === preId);
      if (r) {
        if (preAction === 'return' && r.status === 'borrowed') setReturnTarget(r);
        else if (r.status === 'approved') setBorrowTarget(r);
      }
    }
  }, [preId, preAction, requests]);

  async function load() {
    setLoading(true);
    try {
      let q;
      if (tab === 0) {
        q = query(collection(db, 'requests'), where('status', 'in', ['approved', 'borrowed']), orderBy('experimentDate', 'asc'), limit(100));
      } else {
        q = query(collection(db, 'requests'), where('status', '==', 'returned'), orderBy('actualReturnDate', 'desc'), limit(100));
      }
      const snap = await getDocs(q);
      setRequests(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    } catch(err) {
      console.error(err);
      toast.error('Failed to load requests.');
    } finally {
      setLoading(false);
    }
  }

  const filtered = requests.filter(r => {
    const q = search.toLowerCase();
    return !q || r.borrowerName?.toLowerCase().includes(q) || r.experiment?.toLowerCase().includes(q);
  });

  async function handleMarkBorrowed(request, releaseDate, items) {
    try {
      await runTransaction(db, async (tx) => {
        for (const item of items) {
          const eqRef = doc(db, 'equipment', item.equipmentId);
          const eqSnap = await tx.get(eqRef);
          if (eqSnap.exists()) {
            // If released < approved, return the difference
            const diff = (item.qtyRequested || 0) - (item.qtyReleased || 0);
            if (diff > 0) {
              tx.update(eqRef, {
                availableQty: eqSnap.data().availableQty + diff,
                updatedAt: serverTimestamp(),
              });
            }
          }
        }
        tx.update(doc(db, 'requests', request.id), {
          status: 'borrowed',
          releaseDate,
          items,
          updatedAt: serverTimestamp(),
        });
      });
      toast.success('Marked as borrowed.');
      setBorrowTarget(null);
      load();
    } catch (err) {
      toast.error('Failed: ' + err.message);
    }
  }

  async function handleMarkReturned(request, returnDate, items) {
    try {
      await runTransaction(db, async (tx) => {
        for (const item of items) {
          const eqRef = doc(db, 'equipment', item.equipmentId);
          const eqSnap = await tx.get(eqRef);
          if (eqSnap.exists()) {
            const data = eqSnap.data();
            const returnQty = (item.qtyReturned || 0) - (item.qtyDamaged || 0);
            const missingQty = item.qtyMissing || 0;
            tx.update(eqRef, {
              availableQty: Math.max(0, data.availableQty + returnQty),
              totalQty: Math.max(0, data.totalQty - missingQty),
              updatedAt: serverTimestamp(),
            });
          }
        }
        tx.update(doc(db, 'requests', request.id), {
          status: 'returned',
          actualReturnDate: returnDate,
          items,
          updatedAt: serverTimestamp(),
        });
      });
      toast.success('Marked as returned.');
      setReturnTarget(null);

      // Offer to record violation if late, damaged, or missing
      const isLate = returnDate > request.expectedReturnDate;
      const hasDamaged = items.some(i => i.qtyDamaged > 0);
      const hasMissing = items.some(i => i.qtyMissing > 0);
      if (isLate || hasDamaged || hasMissing) {
        setShowViolationPrompt({ ...request, actualReturnDate: returnDate, items });
      } else {
        load();
      }
    } catch (err) {
      toast.error('Failed: ' + err.message);
    }
  }

  return (
    <div className="space-y-4 max-w-7xl mx-auto animate-fade-in">
      {/* Tabs */}
      <div className="flex gap-1 border-b border-gray-200">
        {['Active Borrowing', 'History (Returned)'].map((t, i) => (
          <button
            key={t}
            onClick={() => setTab(i)}
            className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
              tab === i
                ? 'border-primary-500 text-primary-700'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      <div className="card">
        <div className="card-header">
          <Archive size={18} strokeWidth={1.8} />
          Borrowing & Returns
          <span className="ml-auto text-xs text-gold font-medium">
            {tab === 0 ? 'Approved & Borrowed requests' : 'Returned requests'}
          </span>
        </div>
        <div className="p-4 border-b border-gray-100">
          <div className="relative max-w-xs">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              className="input pl-9"
              placeholder="Search by student or experiment…"
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>
        </div>

        {loading ? (
          <TableSkeleton rows={5} cols={5} />
        ) : filtered.length === 0 ? (
          <div className="py-12 text-center text-gray-400">
            <Archive size={32} className="mx-auto mb-2 opacity-30" />
            <p className="text-sm">No active borrowings found.</p>
          </div>
        ) : (
          <div className="table-container">
            <table className="table">
              <thead>
                <tr>
                  <th>Student</th>
                  <th>Experiment</th>
                  <th>Exp. Date</th>
                  <th>{tab === 0 ? 'Expected Return' : 'Returned Date'}</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(r => (
                  <tr key={r.id}>
                    <td data-label="Student">
                      <p className="font-medium text-sm">{r.borrowerName}</p>
                      <p className="text-xs text-gray-400">{r.gradeLevel} · {r.section}</p>
                    </td>
                    <td data-label="Experiment">{r.experiment}</td>
                    <td data-label="Exp. Date">{formatDate(r.experimentDate)}</td>
                    <td data-label={tab === 0 ? "Expected Return" : "Returned Date"}>
                      {tab === 0 ? formatDate(r.expectedReturnDate) : formatDate(r.actualReturnDate)}
                    </td>
                    <td data-label="Status">
                      <StatusBadge status={r.status} expectedReturnDate={r.expectedReturnDate} />
                    </td>
                    <td>
                      <div className="flex gap-1 flex-wrap">
                        <Link to={`/requests/${r.id}`} className="btn-secondary btn-sm">View</Link>
                        {r.status === 'approved' && (
                          <button onClick={() => setBorrowTarget(r)} className="btn-primary btn-sm">
                            Mark Borrowed
                          </button>
                        )}
                        {r.status === 'borrowed' && (
                          <button onClick={() => setReturnTarget(r)} className="btn-primary btn-sm">
                            Mark Returned
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {borrowTarget && (
        <BorrowModal
          request={borrowTarget}
          onClose={() => setBorrowTarget(null)}
          onConfirm={(date, items) => handleMarkBorrowed(borrowTarget, date, items)}
        />
      )}
      {returnTarget && (
        <ReturnModal
          request={returnTarget}
          onClose={() => setReturnTarget(null)}
          onConfirm={(date, items) => handleMarkReturned(returnTarget, date, items)}
        />
      )}

      {/* Violation Prompt after return */}
      {showViolationPrompt && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/40" />
          <div className="relative bg-white rounded-2xl shadow-2xl max-w-md w-full p-6 animate-fade-in">
            <h3 className="font-semibold text-gray-900 mb-2 flex items-center gap-2">
              <AlertTriangle size={18} className="text-amber-500" /> Record Violation?
            </h3>
            <p className="text-sm text-gray-600 mb-4">
              Issues were detected (late return, damaged, or missing items). Would you like to record a violation?
            </p>
            <div className="flex gap-2 justify-end">
              <button onClick={() => { setShowViolationPrompt(null); load(); }} className="btn-secondary btn-sm">
                Skip
              </button>
              <Link
                to={`/admin/penalties?requestId=${showViolationPrompt.id}&userId=${showViolationPrompt.userId}&studentName=${encodeURIComponent(showViolationPrompt.borrowerName)}`}
                onClick={() => setShowViolationPrompt(null)}
                className="btn-danger btn-sm"
              >
                Record Violation
              </Link>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
