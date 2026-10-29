import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  FileText, Search, Trash2, Camera, AlertTriangle, Clock, Pencil,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { db } from '../lib/firebase';
import {
  collection, query, where, getDocs, deleteDoc, doc, orderBy, limit, startAfter,
} from 'firebase/firestore';
import { formatDate, formatTimestamp, timeAgo, formatTimeOfDay, getEquipmentDueState } from '../lib/helpers';
import { StatusBadge } from '../components/StatusBadge';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { TableSkeleton } from '../components/LoadingSpinner';
import ReturnProofModal from '../components/ReturnProofModal';
import WarningsPanel from '../components/WarningsPanel';

const STATUS_OPTIONS = ['', 'pending', 'approved', 'rejected', 'borrowed', 'return_submitted', 'return_flagged', 'returned'];

export default function MyRequests() {
  const { userProfile } = useAuth();
  const toast = useToast();
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [returnTarget, setReturnTarget] = useState(null);
  const [historyCursor, setHistoryCursor] = useState(null);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [clockNow, setClockNow] = useState(() => Date.now());

  useEffect(() => {
    const timer = setInterval(() => setClockNow(Date.now()), 60_000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    load();
  }, [userProfile]);

  async function load() {
    if (!userProfile) return;
    setLoading(true);
    try {
      const q = query(
        collection(db, 'requests'),
        where('userId', '==', userProfile.uid),
        orderBy('requestDate', 'desc'),
        limit(100)
      );
      const snap = await getDocs(q);
      setRequests(snap.docs.map(d => ({ id: d.id, ...d.data() })));
      setHistoryCursor(snap.docs.at(-1) || null);
      setHasMore(snap.size === 100);
    } catch (err) {
      console.error(err);
      toast.error('Failed to load requests.');
    } finally {
      setLoading(false);
    }
  }

  async function loadMore() {
    if (!userProfile || !historyCursor || !hasMore || loadingMore) return;
    setLoadingMore(true);
    try {
      const snap = await getDocs(query(
        collection(db, 'requests'), where('userId', '==', userProfile.uid),
        orderBy('requestDate', 'desc'), startAfter(historyCursor), limit(100),
      ));
      setRequests(current => [...current, ...snap.docs.map(d => ({ id: d.id, ...d.data() }))]);
      setHistoryCursor(snap.docs.at(-1) || historyCursor);
      setHasMore(snap.size === 100);
    } catch (error) {
      toast.error(`Could not load more requests: ${error.message}`);
    } finally {
      setLoadingMore(false);
    }
  }

  const filtered = requests.filter(r => {
    const q = search.toLowerCase();
    const matchSearch = !q ||
      r.experiment?.toLowerCase().includes(q) ||
      r.teacher?.toLowerCase().includes(q);
    const matchStatus = !statusFilter || r.status === statusFilter;
    return matchSearch && matchStatus;
  });

  const flaggedCount = requests.filter(r => r.status === 'return_flagged').length;
  // "Awaiting your photo" = equipment is out but the student hasn't submitted proof yet.
  const toReturnCount = requests.filter(r => r.status === 'borrowed').length;
  const dueSoonOrLate = requests
    .map(request => ({ request, due: getEquipmentDueState(request.status, request.expectedReturnDate, request.expectedReturnTime, clockNow) }))
    .filter(row => row.due);

  async function handleCancel() {
    if (!deleteTarget) return;
    try {
      await deleteDoc(doc(db, 'requests', deleteTarget.id));
      toast.success('Request cancelled.');
      setDeleteTarget(null);
      load();
    } catch (err) {
      toast.error('Failed to cancel: ' + err.message);
    }
  }

  return (
    <div className="space-y-4 max-w-6xl mx-auto animate-fade-in">
      {/* Action required — returned photo was flagged */}
      {flaggedCount > 0 && (
        <div className="card border-red-300 bg-red-50/50">
          <div className="card-header bg-red-700">
            <AlertTriangle size={18} strokeWidth={1.8} />
            Action Required — Report to the Laboratory
          </div>
          <div className="p-4 space-y-3">
            {requests.filter(r => r.status === 'return_flagged').map(r => (
              <div key={r.id} className="flex flex-wrap items-start gap-3 p-3 bg-white rounded-xl border border-red-200">
                <div className="flex-1 min-w-[220px]">
                  <p className="font-semibold text-sm text-gray-900">{r.experiment}</p>
                  <p className="text-xs text-gray-500 mt-0.5">
                    Flagged {timeAgo(r.returnReview?.reviewedAt)}
                    {r.returnReview?.reviewedByName ? ` by ${r.returnReview.reviewedByName}` : ''}
                  </p>
                  {r.returnReview?.remarks && (
                    <p className="text-sm text-red-800 mt-1.5 font-medium">{r.returnReview.remarks}</p>
                  )}
                </div>
                <div className="flex gap-2">
                  <Link to={`/requests/${r.id}`} className="btn-secondary btn-sm">View</Link>
                  <button onClick={() => setReturnTarget(r)} className="btn-primary btn-sm">
                    <Camera size={13} /> Re-submit Proof
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <WarningsPanel userId={userProfile?.uid} header="Warnings on My Account" />

      {dueSoonOrLate.length > 0 && (
        <section className="card border-amber-300 bg-amber-50/60" aria-labelledby="equipment-deadline-heading">
          <div className="card-header bg-amber-100 text-amber-950" id="equipment-deadline-heading">
            <Clock size={17} /> Equipment return reminders
          </div>
          <div className="p-3 space-y-2">
            {dueSoonOrLate.map(({ request, due }) => (
              <div key={request.id} className="flex flex-wrap items-center gap-3 rounded-lg bg-white p-3 border border-amber-100">
                <div className="min-w-0 flex-1">
                  <p className={`font-semibold text-sm ${due.kind === 'overdue' ? 'text-red-700' : 'text-amber-900'}`}>
                    {due.kind === 'overdue' ? 'Overdue' : 'Due within 24 hours'} · {request.experiment}
                  </p>
                  <p className="text-xs text-gray-600 mt-0.5">
                    Return by {formatDate(request.expectedReturnDate)} at {formatTimeOfDay(request.expectedReturnTime || '12:00')}.
                  </p>
                </div>
                <Link to={`/requests/${request.id}`} className="btn-secondary btn-sm">View request</Link>
              </div>
            ))}
          </div>
        </section>
      )}

      <div className="card">
        <div className="card-header">
          <FileText size={18} strokeWidth={1.8} />
          My Requests
          <Link to="/request" className="ml-auto btn-primary btn-sm">New Request</Link>
        </div>

        <div className="p-4 flex flex-wrap gap-3 border-b border-gray-100">
          <div className="relative flex-1 min-w-[180px]">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              className="input pl-9"
              placeholder="Search by experiment or teacher…"
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>
          <select
            className="input w-auto min-w-[160px]"
            value={statusFilter}
            onChange={e => setStatusFilter(e.target.value)}
          >
            <option value="">All Statuses</option>
            {STATUS_OPTIONS.filter(Boolean).map(s => (
              <option key={s} value={s}>{s.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}</option>
            ))}
          </select>
        </div>

        {loading ? (
          <TableSkeleton rows={5} cols={6} />
        ) : filtered.length === 0 ? (
          <div className="py-12 text-center text-gray-400">
            <FileText size={32} className="mx-auto mb-2 opacity-30" />
            <p className="text-sm">No requests found.</p>
            <Link to="/request" className="btn-primary btn-sm mt-3 inline-flex">Submit a Request</Link>
          </div>
        ) : (
          <div className="table-container">
            <table className="table">
              <thead>
                <tr>
                  <th>Experiment / Activity</th>
                  <th>Experiment Date</th>
                  <th>Expected Return</th>
                  <th>Request Sent</th>
                  <th>Returned</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(r => (
                  <tr key={r.id}>
                    <td data-label="Experiment" className="font-medium">{r.experiment}</td>
                    <td data-label="Experiment Date">
                      <p>{formatDate(r.experimentDate)}</p>
                      <p className="text-xs text-gray-500">Borrow at {r.proposedBorrowTime || '08:00'}</p>
                    </td>
                    <td data-label="Expected Return">
                      <p>{formatDate(r.expectedReturnDate)}</p>
                      <p className="text-xs text-gray-500">By {r.expectedReturnTime || '12:00'}</p>
                    </td>
                    <td data-label="Request Sent">
                      <p className="text-sm">{formatTimestamp(r.createdAt)}</p>
                      <p className="text-xs text-gray-400">{timeAgo(r.createdAt)}</p>
                      {r.studentEditedAt && <p className="text-xs text-sky-700 mt-1">Updated {timeAgo(r.studentEditedAt)}</p>}
                    </td>
                    <td data-label="Returned">
                      {r.returnedAt || r.returnSubmittedAt ? (
                        <>
                          <p className="text-sm">{formatTimestamp(r.returnedAt || r.returnSubmittedAt)}</p>
                          <p className="text-xs text-gray-400">
                            {r.returnedAt ? 'marked returned' : 'proof submitted'}
                          </p>
                        </>
                      ) : (
                        <span className="text-sm text-gray-300">—</span>
                      )}
                    </td>
                    <td data-label="Status">
                      <StatusBadge status={r.status} expectedReturnDate={r.expectedReturnDate} />
                      {(r.returnProofMeta?.count > 0 || r.returnProof?.dataUrl || r.returnProof?.photos?.length > 0) && (
                        <span className="mt-1 inline-flex items-center gap-1 text-xs text-gray-500">
                          <Camera size={12} /> Photo proof submitted
                        </span>
                      )}
                    </td>
                    <td>
                      <div className="flex gap-1 flex-wrap">
                        <Link to={`/requests/${r.id}`} className="btn-secondary btn-sm">View</Link>
                        {r.status === 'borrowed' && (
                          <button onClick={() => setReturnTarget(r)} className="btn-primary btn-sm">
                            <Camera size={13} /> Return
                          </button>
                        )}
                        {r.status === 'return_submitted' && (
                          <span className="inline-flex items-center gap-1 text-xs text-sky-700 bg-sky-50 border border-sky-200 rounded-lg px-2 py-1.5">
                            <Clock size={12} /> Awaiting check
                          </span>
                        )}
                        {r.status === 'pending' && (
                          <>
                            <Link to={`/request?edit=${r.id}`} className="btn-secondary btn-sm" aria-label={`Edit pending request for ${r.experiment}`}>
                              <Pencil size={13} /> Edit
                            </Link>
                            <button
                              onClick={() => setDeleteTarget(r)}
                              className="btn-ghost btn-sm p-1.5 text-red-400 hover:bg-red-50"
                              title="Cancel request"
                              aria-label={`Cancel request for ${r.experiment}`}
                            >
                              <Trash2 size={14} />
                            </button>
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
        {hasMore && !loading && filtered.length > 0 && (
          <div className="p-4 border-t border-gray-100 text-center">
            <button type="button" onClick={loadMore} disabled={loadingMore} className="btn-secondary btn-sm">
              {loadingMore ? 'Loading…' : 'Load more requests'}
            </button>
          </div>
        )}
      </div>

      {toReturnCount > 0 && !flaggedCount && (
        <p className="text-xs text-gray-500 text-center">
          <Camera size={12} className="inline" /> {toReturnCount} borrowed item
          {toReturnCount === 1 ? '' : 's'} awaiting your return photo.
        </p>
      )}

      <ConfirmDialog
        isOpen={!!deleteTarget}
        title="Cancel Request"
        message={`Cancel your request for "${deleteTarget?.experiment}"? This cannot be undone.`}
        confirmLabel="Cancel Request"
        danger
        onConfirm={handleCancel}
        onCancel={() => setDeleteTarget(null)}
      />

      {returnTarget && (
        <ReturnProofModal
          request={returnTarget}
          onClose={() => setReturnTarget(null)}
          onDone={() => {
            setReturnTarget(null);
            load();
          }}
        />
      )}
    </div>
  );
}
