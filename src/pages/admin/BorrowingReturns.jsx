import React, { useEffect, useState } from 'react';
import { useSearchParams, useNavigate, Link } from 'react-router-dom';
import {
  Archive, Search, Check, AlertTriangle, Camera, ShieldCheck, AlertOctagon, Loader2,
} from 'lucide-react';
import { useToast } from '../../context/ToastContext';
import { useAuth } from '../../context/AuthContext';
import { db } from '../../lib/firebase';
import {
  collection, query, where, getDocs, doc, runTransaction,
  serverTimestamp, orderBy, limit,
} from 'firebase/firestore';
import { formatDate, formatTimestamp, timeAgo, getTodayManila } from '../../lib/helpers';
import { StatusBadge, ConditionBadge } from '../../components/StatusBadge';
import { TableSkeleton } from '../../components/LoadingSpinner';
import ReturnProofCard from '../../components/ReturnProofCard';
import ProofThumb from '../../components/ProofThumb';
import { proofPhotos } from '../../lib/upload';

const ACTIVE_STATUSES = ['approved', 'borrowed', 'return_submitted', 'return_flagged'];

/* ── Mark borrowed ────────────────────────────────────────────────────────── */

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
        <p className="text-sm text-gray-500 mb-4">{request.borrowerName} — {request.experiment}</p>
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

/* ── Manual return (no student photo) ─────────────────────────────────────── */

function ReturnModal({ request, onClose, onConfirm, reason }) {
  const today = getTodayManila();
  const [returnDate, setReturnDate] = useState(today);
  const [items, setItems] = useState(
    request.items?.map(item => ({
      ...item,
      qtyReturned: item.qtyReleased || item.qtyRequested,
      qtyDamaged: request.returnProof ? (item.qtyDamaged || 0) : 0,
      qtyMissing: 0,
      conditionOnReturn: item.conditionOnReturn || 'Good',
    })) || []
  );
  const [submitting, setSubmitting] = useState(false);

  async function handle() {
    setSubmitting(true);
    await onConfirm(returnDate, items, 'manual');
    setSubmitting(false);
  }

  const isLate = returnDate > request.expectedReturnDate;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-2xl max-w-2xl w-full p-6 animate-fade-in overflow-y-auto max-h-[90vh]">
        <h3 className="font-semibold text-gray-900 mb-1">Mark as Returned Manually</h3>
        <p className="text-sm text-gray-500 mb-2">{request.borrowerName} — {request.experiment}</p>
        {reason && (
          <div className="mb-3 flex items-start gap-2.5 p-3 bg-amber-50 border border-amber-200 rounded-xl text-sm text-amber-800">
            <AlertTriangle size={15} className="shrink-0 mt-0.5" />
            <span>{reason}</span>
          </div>
        )}
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

/* ── Review the student's return photo ────────────────────────────────────── */

const VERDICTS = [
  {
    value: 'clean',
    label: 'Clean & no damage',
    hint: 'Approve and mark as returned',
    cls: 'border-gray-300 peer-checked:border-green-500 peer-checked:bg-green-500',
  },
  {
    value: 'damaged',
    label: 'Has damage',
    hint: 'Flag the student',
    cls: 'border-gray-300 peer-checked:border-red-500 peer-checked:bg-red-500',
  },
  {
    value: 'not_cleaned',
    label: 'Not cleaned',
    hint: 'Flag the student',
    cls: 'border-gray-300 peer-checked:border-amber-500 peer-checked:bg-amber-500',
  },
];

function ReturnReviewModal({ request, onClose, onApprove, onFlag }) {
  const [verdict, setVerdict] = useState('clean');
  const [remarks, setRemarks] = useState(request.returnReview?.remarks || '');
  const [items, setItems] = useState(
    request.items?.map(item => ({
      ...item,
      qtyReturned: item.qtyReleased || item.qtyRequested,
      qtyDamaged: item.qtyDamaged || 0,
      qtyMissing: item.qtyMissing || 0,
      conditionOnReturn: item.conditionOnReturn || (verdict === 'clean' ? 'Good' : 'Needs Cleaning'),
    })) || []
  );
  const [busy, setBusy] = useState(false);

  const isClean = verdict === 'clean';
  const hasDamaged = items.some(i => (i.qtyDamaged || 0) > 0);
  const hasMissing = items.some(i => (i.qtyMissing || 0) > 0);
  const requiresRemarks = !isClean && !remarks.trim();

  async function handleApprove() {
    setBusy(true);
    await onApprove(getTodayManila(), items, verdict, remarks.trim());
    setBusy(false);
  }

  async function handleFlag() {
    setBusy(true);
    await onFlag(verdict, remarks.trim(), items);
    setBusy(false);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-2xl max-w-3xl w-full p-6 animate-fade-in overflow-y-auto max-h-[92vh]">

        <h3 className="font-semibold text-gray-900 mb-1 flex items-center gap-2">
          <ShieldCheck size={18} className="text-crimson" />
          Assess Return Proof
        </h3>
        <p className="text-sm text-gray-500 mb-4">
          {request.borrowerName} · {request.experiment} · returned{' '}
          {request.returnSubmittedAt ? timeAgo(request.returnSubmittedAt) : '—'}
        </p>

        {request.returnAttempt > 1 && (
          <div className="mb-4 flex items-start gap-2.5 p-3 bg-amber-50 border border-amber-200 rounded-xl text-sm text-amber-800">
            <AlertTriangle size={15} className="shrink-0 mt-0.5" />
            <span>
              This is re-submission #{request.returnAttempt}. The previous proof was flagged as{' '}
              <span className="font-semibold">{request.returnReview?.verdict?.replace(/_/g, ' ')}</span>
              {request.returnReview?.remarks ? ` — “${request.returnReview.remarks}”` : ''}.
            </span>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          {/* Photo */}
          <div>
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
              Student Photos
            </p>
            <ReturnProofCard request={request} size="lg" />
          </div>

          {/* Assessment */}
          <div className="space-y-4">
            <div>
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
                Assessment
              </p>
              <div className="space-y-2">
                {VERDICTS.map(v => (
                  <label
                    key={v.value}
                    className="flex items-center gap-3 p-3 rounded-xl border-2 border-gray-200 cursor-pointer hover:border-gold transition-colors"
                  >
                    <input
                      type="radio"
                      name="verdict"
                      className="peer sr-only"
                      checked={verdict === v.value}
                      onChange={() => setVerdict(v.value)}
                    />
                    <span className={`w-4 h-4 rounded-full border-2 shrink-0 ${v.cls}`} />
                    <span className="min-w-0">
                      <span className="block text-sm font-semibold text-gray-800">{v.label}</span>
                      <span className="block text-xs text-gray-500">{v.hint}</span>
                    </span>
                  </label>
                ))}
              </div>
            </div>

            <div>
              <label className="label">
                Remarks {isClean ? '(optional)' : '*'}
              </label>
              <textarea
                className="input min-h-[70px] resize-none"
                value={remarks}
                onChange={e => setRemarks(e.target.value)}
                placeholder={
                  isClean
                    ? 'Anything to note about the returned equipment…'
                    : 'Tell the student what is wrong and what they must do (e.g. “Beaker is cracked and stained. Report to the lab at 7:00 AM.”).'
                }
              />
              {!isClean && (
                <p className="text-xs text-red-600 mt-1">
                  The student will be alerted and required to report to the laboratory.
                </p>
              )}
            </div>

            {/* Item counts — only meaningful when approving */}
            <div>
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
                Equipment Count
              </p>
              <div className="space-y-2 max-h-40 overflow-y-auto pr-1">
                {items.map((item, i) => (
                  <div key={i} className="p-2.5 bg-gray-50 rounded-xl text-sm">
                    <p className="font-semibold text-xs">{item.name}</p>
                    <div className="grid grid-cols-3 gap-2 mt-1.5">
                      <div>
                        <label className="text-[10px] text-gray-500">Returned</label>
                        <input type="number" min="0" className="input text-xs min-h-[32px] py-1"
                          value={item.qtyReturned}
                          onChange={e => { const u = [...items]; u[i] = { ...u[i], qtyReturned: parseInt(e.target.value) || 0 }; setItems(u); }}
                        />
                      </div>
                      <div>
                        <label className="text-[10px] text-gray-500">Damaged</label>
                        <input type="number" min="0" className="input text-xs min-h-[32px] py-1"
                          value={item.qtyDamaged}
                          onChange={e => { const u = [...items]; u[i] = { ...u[i], qtyDamaged: parseInt(e.target.value) || 0 }; setItems(u); }}
                        />
                      </div>
                      <div>
                        <label className="text-[10px] text-gray-500">Missing</label>
                        <input type="number" min="0" className="input text-xs min-h-[32px] py-1"
                          value={item.qtyMissing}
                          onChange={e => { const u = [...items]; u[i] = { ...u[i], qtyMissing: parseInt(e.target.value) || 0 }; setItems(u); }}
                        />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap gap-2 justify-end mt-5 pt-4 border-t border-gray-100">
          <button onClick={onClose} disabled={busy} className="btn-secondary btn-sm">Cancel</button>
          {isClean ? (
            <button onClick={handleApprove} disabled={busy} className="btn-primary btn-sm">
              {busy ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
              Approve &amp; Mark Returned
            </button>
          ) : (
            <button
              onClick={handleFlag}
              disabled={busy || requiresRemarks}
              title={requiresRemarks ? 'Remarks are required when flagging a problem.' : undefined}
              className="btn-danger btn-sm"
            >
              {busy ? <Loader2 size={14} className="animate-spin" /> : <AlertTriangle size={14} />}
              Flag Problem &amp; Alert Student
            </button>
          )}
        </div>

        {(hasDamaged || hasMissing) && isClean && (
          <p className="text-xs text-amber-700 mt-2 text-right">
            <AlertTriangle size={11} className="inline" /> You have marked items as damaged or missing —
            consider flagging the problem instead so the student is alerted.
          </p>
        )}
      </div>
    </div>
  );
}

/* ── Page ─────────────────────────────────────────────────────────────────── */

export default function BorrowingReturns() {
  const toast = useToast();
  const { userProfile } = useAuth();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [borrowTarget, setBorrowTarget] = useState(null);
  const [returnTarget, setReturnTarget] = useState(null);
  const [reviewTarget, setReviewTarget] = useState(null);
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
        else if (preAction === 'return' && r.status === 'return_submitted') setReviewTarget(r);
        else if (r.status === 'approved') setBorrowTarget(r);
      }
    }
  }, [preId, preAction, requests]);

  async function load() {
    setLoading(true);
    try {
      let q;
      if (tab === 0) {
        q = query(
          collection(db, 'requests'),
          where('status', 'in', ACTIVE_STATUSES),
          orderBy('experimentDate', 'asc'),
          limit(100)
        );
      } else {
        q = query(collection(db, 'requests'), where('status', '==', 'returned'), orderBy('actualReturnDate', 'desc'), limit(100));
      }
      const snap = await getDocs(q);
      setRequests(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    } catch (err) {
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

  const reviewQueueCount = requests.filter(r => r.status === 'return_submitted').length;

  async function handleMarkBorrowed(request, releaseDate, items) {
    try {
      await runTransaction(db, async (tx) => {
        // All reads must complete before the first write.
        const eqRefs = items.map(item => doc(db, 'equipment', item.equipmentId));
        const eqSnaps = [];
        for (const ref of eqRefs) {
          eqSnaps.push(await tx.get(ref));
        }
        eqSnaps.forEach((snap, i) => {
          if (!snap.exists()) return;
          // If released < approved, return the difference
          const diff = (items[i].qtyRequested || 0) - (items[i].qtyReleased || 0);
          if (diff > 0) {
            tx.update(eqRefs[i], {
              availableQty: snap.data().availableQty + diff,
              updatedAt: serverTimestamp(),
            });
          }
        });
        tx.update(doc(db, 'requests', request.id), {
          status: 'borrowed',
          releaseDate,
          releasedAt: serverTimestamp(),
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

  /**
   * Write the signed-off return and put the equipment back into stock.
   * Shared by the photo-review approval and the manual return flow.
   */
  async function commitReturned(request, returnDate, items, review) {
    await runTransaction(db, async (tx) => {
      // All reads must complete before the first write.
      const eqRefs = items.map(item => doc(db, 'equipment', item.equipmentId));
      const eqSnaps = [];
      for (const ref of eqRefs) {
        eqSnaps.push(await tx.get(ref));
      }
      eqSnaps.forEach((snap, i) => {
        if (!snap.exists()) return;
        const data = snap.data();
        const returnQty = (items[i].qtyReturned || 0) - (items[i].qtyDamaged || 0);
        const missingQty = items[i].qtyMissing || 0;
        tx.update(eqRefs[i], {
          availableQty: Math.max(0, data.availableQty + returnQty),
          totalQty: Math.max(0, data.totalQty - missingQty),
          updatedAt: serverTimestamp(),
        });
      });
      tx.update(doc(db, 'requests', request.id), {
        status: 'returned',
        actualReturnDate: returnDate,
        returnedAt: serverTimestamp(),
        items,
        returnReview: review,
        updatedAt: serverTimestamp(),
      });
    });
  }

  function afterReturned(request, returnDate, items, { announce }) {
    setReturnTarget(null);
    setReviewTarget(null);
    toast.success(announce);

    const isLate = returnDate > request.expectedReturnDate;
    const hasDamaged = items.some(i => (i.qtyDamaged || 0) > 0);
    const hasMissing = items.some(i => (i.qtyMissing || 0) > 0);

    if (isLate || hasDamaged || hasMissing) {
      setShowViolationPrompt({ ...request, actualReturnDate: returnDate, items });
    } else {
      load();
    }
  }

  async function handleMarkReturned(request, returnDate, items, mode) {
    try {
      await commitReturned(request, returnDate, items, {
        verdict: 'clean',
        remarks: mode === 'manual'
          ? 'Returned and inspected at the laboratory counter.'
          : request.returnSubmittedNote || '',
        reviewedBy: userProfile?.uid || '',
        reviewedByName: userProfile?.name || 'Laboratory Staff',
        reviewedAt: serverTimestamp(),
        requiresLabVisit: false,
        method: mode,
      });
      afterReturned(request, returnDate, items, { announce: 'Marked as returned.' });
    } catch (err) {
      toast.error('Failed: ' + err.message);
    }
  }

  /** Approve a student's photo → equipment goes back into stock. */
  async function handleApproveReturn(request, returnDate, items, verdict, remarks) {
    try {
      await commitReturned(request, returnDate, items, {
        verdict,
        remarks,
        reviewedBy: userProfile?.uid || '',
        reviewedByName: userProfile?.name || 'Laboratory Staff',
        reviewedAt: serverTimestamp(),
        requiresLabVisit: false,
        method: 'photo',
      });
      afterReturned(request, returnDate, items, { announce: 'Return approved and marked as returned.' });
    } catch (err) {
      toast.error('Failed: ' + err.message);
    }
  }

  /**
   * Flag a photo as damaged / not cleaned. The equipment stays out of stock,
   * the student is alerted, and they must report to the laboratory.
   */
  async function handleFlagReturn(request, verdict, remarks, items) {
    try {
      await runTransaction(db, async (tx) => {
        tx.update(doc(db, 'requests', request.id), {
          status: 'return_flagged',
          flaggedAt: serverTimestamp(),
          items,
          returnReview: {
            verdict,
            remarks,
            reviewedBy: userProfile?.uid || '',
            reviewedByName: userProfile?.name || 'Laboratory Staff',
            reviewedAt: serverTimestamp(),
            requiresLabVisit: true,
            method: 'photo',
          },
          staffRemarks: remarks,
          updatedAt: serverTimestamp(),
        });
      });
      setReviewTarget(null);
      toast.success('Flagged. The student has been alerted to report to the laboratory.');
      load();
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
            {i === 0 && reviewQueueCount > 0 && (
              <span className="ml-2 px-1.5 py-0.5 bg-flame text-white text-[10px] font-bold rounded-full">
                {reviewQueueCount}
              </span>
            )}
          </button>
        ))}
      </div>

      <div className="card">
        <div className="card-header">
          <Archive size={18} strokeWidth={1.8} />
          Borrowing &amp; Returns
          <span className="ml-auto text-xs text-gold font-medium">
            {tab === 0 ? 'Approved, borrowed & awaiting return check' : 'Returned requests'}
          </span>
        </div>

        {tab === 0 && reviewQueueCount > 0 && (
          <div className="flex items-start gap-2.5 m-4 mb-0 p-3 bg-sky-50 border border-sky-200 rounded-xl">
            <Camera size={16} className="text-sky-600 shrink-0 mt-0.5" />
            <p className="text-sm text-sky-900">
              <span className="font-semibold">{reviewQueueCount} return proof{reviewQueueCount === 1 ? '' : 's'}</span>{' '}
              waiting for your assessment. Check each photo before approving.
            </p>
          </div>
        )}

        <div className="p-4 border-b border-gray-100">
          <div className="relative max-w-xs">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input className="input pl-9" placeholder="Search by student or experiment…"
              value={search} onChange={e => setSearch(e.target.value)} />
          </div>
        </div>

        {loading ? (
          <TableSkeleton rows={5} cols={6} />
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
                  <th>{tab === 0 ? 'Expected Return' : 'Returned Date'}</th>
                  <th>{tab === 0 ? 'Request Sent' : 'Returned At'}</th>
                  <th>Proof</th>
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
                    <td data-label="Experiment">
                      <p className="text-sm font-medium">{r.experiment}</p>
                      <p className="text-xs text-gray-400">
                        Exp. {formatDate(r.experimentDate)}
                      </p>
                    </td>
                    <td data-label={tab === 0 ? 'Expected Return' : 'Returned Date'}>
                      {tab === 0 ? formatDate(r.expectedReturnDate) : formatDate(r.actualReturnDate)}
                    </td>
                    <td data-label={tab === 0 ? 'Request Sent' : 'Returned At'}>
                      <p className="text-sm">
                        {formatTimestamp(tab === 0 ? r.createdAt : r.returnedAt)}
                      </p>
                      {tab === 0 && r.createdAt && (
                        <p className="text-xs text-gray-400">{timeAgo(r.createdAt)}</p>
                      )}
                    </td>
                    <td data-label="Proof">
                      {proofPhotos(r.returnProof).length > 0 ? (
                        <button
                          onClick={() => setReviewTarget(r)}
                          className="flex items-center gap-1.5 text-xs font-medium text-crimson hover:text-gold"
                        >
                          <ProofThumb proof={r.returnProof} />
                          View
                        </button>
                      ) : (
                        <span className="text-xs text-gray-300">—</span>
                      )}
                    </td>
                    <td data-label="Status">
                      <StatusBadge status={r.status} expectedReturnDate={r.expectedReturnDate} />
                      {r.returnReview && tab === 1 && (
                        <div className="mt-1">
                          <ConditionBadge condition={
                            r.returnReview.verdict === 'clean' ? 'Good'
                              : r.returnReview.verdict === 'damaged' ? 'Damaged' : 'Needs Cleaning'
                          } />
                        </div>
                      )}
                    </td>
                    <td>
                      <div className="flex gap-1 flex-wrap">
                        <Link to={`/requests/${r.id}`} className="btn-secondary btn-sm">View</Link>

                        {tab === 0 && r.status === 'approved' && (
                          <button onClick={() => setBorrowTarget(r)} className="btn-primary btn-sm">
                            Mark Borrowed
                          </button>
                        )}

                        {tab === 0 && r.status === 'return_submitted' && (
                          <button onClick={() => setReviewTarget(r)} className="btn-primary btn-sm">
                            <ShieldCheck size={13} /> Review Return
                          </button>
                        )}

                        {tab === 0 && r.status === 'borrowed' && (
                          <button
                            onClick={() => setReturnTarget(r)}
                            className="btn-secondary btn-sm"
                            title="Return processed at the counter without a student photo"
                          >
                            Mark Returned
                          </button>
                        )}

                        {tab === 0 && r.status === 'return_flagged' && (
                          <>
                            <button
                              onClick={() => setReviewTarget(r)}
                              className="btn-secondary btn-sm"
                              title="Review the student's latest photo"
                            >
                              <Camera size={13} /> View Proof
                            </button>
                            <button
                              onClick={() => setReturnTarget(r)}
                              className="btn-danger btn-sm"
                              title="Settle the assessment and close the request"
                            >
                              Settle &amp; Return
                            </button>
                            <Link
                              to={`/admin/warnings?userId=${r.userId}&requestId=${r.id}`}
                              className="btn-secondary btn-sm"
                              title="Issue an account warning"
                            >
                              <AlertOctagon size={13} /> Warn
                            </Link>
                          </>
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
          reason={
            returnTarget.status === 'return_flagged'
              ? 'This request was flagged for damage / improper cleaning. Completing this closes the request and returns the equipment to stock.'
              : null
          }
          onClose={() => setReturnTarget(null)}
          onConfirm={(date, items, mode) => handleMarkReturned(returnTarget, date, items, mode)}
        />
      )}

      {reviewTarget && (
        <ReturnReviewModal
          request={reviewTarget}
          onClose={() => setReviewTarget(null)}
          onApprove={(date, items, verdict, remarks) =>
            handleApproveReturn(reviewTarget, date, items, verdict, remarks)
          }
          onFlag={(verdict, remarks, items) => handleFlagReturn(reviewTarget, verdict, remarks, items)}
        />
      )}

      {/* Violation prompt after a return is closed */}
      {showViolationPrompt && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/40" />
          <div className="relative bg-white rounded-2xl shadow-2xl max-w-md w-full p-6 animate-fade-in">
            <h3 className="font-semibold text-gray-900 mb-2 flex items-center gap-2">
              <AlertTriangle size={18} className="text-amber-500" /> Record Violation?
            </h3>
            <p className="text-sm text-gray-600 mb-1">
              Issues were detected (late return, damaged, or missing items). Would you like to record a violation?
            </p>
            <div className="flex gap-2 justify-end">
              <button onClick={() => { setShowViolationPrompt(null); load(); }} className="btn-secondary btn-sm">
                Skip
              </button>
              <button
                onClick={() => { setShowViolationPrompt(null); setReturnTarget(null); navigate(`/admin/warnings?userId=${showViolationPrompt.userId}&requestId=${showViolationPrompt.id}`); }}
                className="btn-danger btn-sm"
              >
                <AlertOctagon size={14} /> Issue Warning
              </button>
              <Link
                to={`/admin/penalties?requestId=${showViolationPrompt.id}&userId=${showViolationPrompt.userId}&studentName=${encodeURIComponent(showViolationPrompt.borrowerName)}`}
                onClick={() => setShowViolationPrompt(null)}
                className="btn-secondary btn-sm"
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