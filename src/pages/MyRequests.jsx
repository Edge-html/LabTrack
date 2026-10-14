import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  FileText, Search, Trash2, Camera, AlertTriangle, Clock,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { db } from '../lib/firebase';
import {
  collection, query, where, getDocs, deleteDoc, doc, orderBy, limit,
} from 'firebase/firestore';
import { formatDate, formatTimestamp, timeAgo } from '../lib/helpers';
import { StatusBadge } from '../components/StatusBadge';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { TableSkeleton } from '../components/LoadingSpinner';
import ReturnProofModal from '../components/ReturnProofModal';
import WarningsPanel from '../components/WarningsPanel';
import { proofSrc } from '../lib/upload';

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
    } catch (err) {
      console.error(err);
      toast.error('Failed to load requests.');
    } finally {
      setLoading(false);
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
                    <td data-label="Experiment Date">{formatDate(r.experimentDate)}</td>
                    <td data-label="Expected Return">{formatDate(r.expectedReturnDate)}</td>
                    <td data-label="Request Sent">
                      <p className="text-sm">{formatTimestamp(r.createdAt)}</p>
                      <p className="text-xs text-gray-400">{timeAgo(r.createdAt)}</p>
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
                      {proofSrc(r.returnProof) && (
                        <img
                          src={proofSrc(r.returnProof)}
                          alt="Return proof"
                          title="Return proof photo"
                          className="mt-1 w-8 h-8 object-cover rounded-lg border border-gray-200"
                        />
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
                          <button
                            onClick={() => setDeleteTarget(r)}
                            className="btn-ghost btn-sm p-1.5 text-red-400 hover:bg-red-50"
                            title="Cancel request"
                          >
                            <Trash2 size={14} />
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