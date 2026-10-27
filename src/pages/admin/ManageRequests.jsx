import React, { useEffect, useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import {
  BarChart2, Search, ChevronDown, Check, X, Edit2, Trash2,
  AlertTriangle, Package, Clock,
} from 'lucide-react';
import { useToast } from '../../context/ToastContext';
import { useAuth } from '../../context/AuthContext';
import { db } from '../../lib/firebase';
import {
  collection, query, onSnapshot, orderBy, limit,
  runTransaction, doc, getDoc, serverTimestamp, updateDoc, deleteDoc,
  where, getDocs, increment,
} from 'firebase/firestore';
import { formatDate, formatTimestamp, timeAgo, getTodayManila } from '../../lib/helpers';
import { StatusBadge } from '../../components/StatusBadge';
import { ConfirmDialog } from '../../components/ConfirmDialog';
import { TableSkeleton } from '../../components/LoadingSpinner';
import { ensureActiveEquipmentReservations, hasReservationOverlap, reservationDocumentId, reservationWindow } from '../../lib/equipmentReservations';

const TABS = ['Pending', 'All Requests'];
const STATUS_OPTIONS = ['', 'pending', 'approved', 'rejected', 'borrowed', 'return_submitted', 'return_flagged', 'returned'];

function RejectModal({ request, onClose, onConfirm }) {
  const [reason, setReason] = useState('');
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-2xl max-w-md w-full p-6 animate-fade-in">
        <h3 className="font-semibold text-gray-900 mb-3">Reject Request</h3>
        <p className="text-sm text-gray-600 mb-3">
          Rejecting request for <strong>{request.borrowerName}</strong> — {request.experiment}.
        </p>
        <label className="label">Reason for rejection *</label>
        <textarea
          className="input min-h-[80px] resize-none"
          value={reason}
          onChange={e => setReason(e.target.value)}
          placeholder="Explain why the request is being rejected…"
        />
        <div className="flex gap-2 mt-4 justify-end">
          <button onClick={onClose} className="btn-secondary btn-sm">Cancel</button>
          <button
            disabled={!reason.trim()}
            onClick={() => onConfirm(reason)}
            className="btn-danger btn-sm"
          >
            Reject
          </button>
        </div>
      </div>
    </div>
  );
}

function ApproveModal({ request, onClose, onConfirm }) {
  const [items, setItems] = useState(
    request.items?.map(item => ({ ...item, qtyApproved: item.qtyRequested })) || []
  );
  const [remarks, setRemarks] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const toast = useToast();

  async function handleApprove() {
    setSubmitting(true);
    await onConfirm(items, remarks);
    setSubmitting(false);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-2xl max-w-lg w-full p-6 animate-fade-in overflow-y-auto max-h-[90vh]">
        <h3 className="font-semibold text-gray-900 mb-1">Approve Request</h3>
        <p className="text-sm text-gray-500 mb-4">
          {request.borrowerName} — {request.experiment} ({formatDate(request.experimentDate)})
        </p>
        {request.lateRequestFlag && (
          <div className="flex items-center gap-2 text-amber-700 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2 mb-3 text-sm">
            <AlertTriangle size={15} /> This is a late request (less than 3 school days before experiment).
          </div>
        )}
        <div className="space-y-2 mb-4">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Adjust quantities if needed:</p>
          {items.map((item, i) => (
            <div key={i} className="flex items-center gap-3 p-2 bg-gray-50 rounded-xl text-sm">
              <span className="flex-1 font-medium">{item.name}</span>
              <span className="text-gray-500 text-xs">Requested: {item.qtyRequested}</span>
              <input
                type="number"
                min="1"
                max={item.qtyRequested}
                className="input w-20 text-sm min-h-[36px] py-1"
                value={item.qtyApproved}
                onChange={e => {
                  const updated = [...items];
                  updated[i] = { ...updated[i], qtyApproved: parseInt(e.target.value) || 1 };
                  setItems(updated);
                }}
              />
            </div>
          ))}
        </div>
        <div className="mb-4">
          <label className="label">Staff Remarks (optional)</label>
          <textarea
            className="input min-h-[60px] resize-none"
            value={remarks}
            onChange={e => setRemarks(e.target.value)}
            placeholder="Any notes for the student…"
          />
        </div>
        <div className="flex gap-2 justify-end">
          <button onClick={onClose} className="btn-secondary btn-sm">Cancel</button>
          <button onClick={handleApprove} disabled={submitting} className="btn-primary btn-sm">
            <Check size={14} /> {submitting ? 'Approving…' : 'Approve'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function ManageRequests() {
  const toast = useToast();
  const { userProfile } = useAuth();
  const [tab, setTab] = useState(0);
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [rejectTarget, setRejectTarget] = useState(null);
  const [approveTarget, setApproveTarget] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    setLoading(true);
    let q;
    if (tab === 0) {
      q = query(collection(db, 'requests'), where('status', '==', 'pending'), orderBy('requestDate', 'asc'));
    } else {
      q = query(collection(db, 'requests'), orderBy('requestDate', 'desc'), limit(100));
    }
    const unsub = onSnapshot(q, snap => {
      setRequests(snap.docs.map(d => ({ id: d.id, ...d.data() })));
      setLoading(false);
    }, (err) => {
      console.error(err);
      toast.error('Failed to load requests.');
      setLoading(false);
    });
    return unsub;
  }, [tab]);

  const filtered = requests.filter(r => {
    const q = search.toLowerCase();
    const matchSearch = !q ||
      r.borrowerName?.toLowerCase().includes(q) ||
      r.experiment?.toLowerCase().includes(q) ||
      r.status?.toLowerCase().includes(q);
    const matchStatus = !statusFilter || r.status === statusFilter;
    return matchSearch && matchStatus;
  });

  async function handleApprove(request, adjustedItems, remarks) {
    try {
      await ensureActiveEquipmentReservations(db);
      const allocationMap = new Map();
      adjustedItems.forEach(item => {
        const current = allocationMap.get(item.equipmentId) || { equipmentId: item.equipmentId, name: item.name, qty: 0 };
        current.qty += Number(item.qtyApproved || item.qtyRequested || 0);
        allocationMap.set(item.equipmentId, current);
      });
      const allocations = [...allocationMap.values()];
      const window = reservationWindow(request);
      if (!window) throw new Error('The request is missing its proposed borrow or return schedule.');
      await runTransaction(db, async (tx) => {
        const eqRefs = allocations.map(item => doc(db, 'equipment', item.equipmentId));
        const eqSnaps = [];
        for (const ref of eqRefs) {
          eqSnaps.push(await tx.get(ref));
        }
        const reservationQueries = allocations.map(item => query(
          collection(db, 'equipmentReservations'),
          where('equipmentId', '==', item.equipmentId),
          where('status', '==', 'active'),
        ));
        const reservationSnaps = [];
        for (const reservationQuery of reservationQueries) reservationSnaps.push(await tx.get(reservationQuery));

        allocations.forEach((item, i) => {
          if (!eqSnaps[i].exists()) throw new Error(`Equipment "${item.name}" not found.`);
          const inventory = eqSnaps[i].data();
          const activeReservations = reservationSnaps[i].docs.map(snapshot => snapshot.data());
          const reservedTotal = activeReservations.reduce((sum, entry) => sum + (Number(entry.qty) || 0), 0);
          const reservedOverlap = activeReservations
            .filter(entry => entry.requestId !== request.id && hasReservationOverlap(window, entry))
            .reduce((sum, entry) => sum + (Number(entry.qty) || 0), 0);
          const legacyHeld = Math.max(0, (Number(inventory.totalQty) || 0) - (Number(inventory.availableQty) || 0) - reservedTotal);
          const availableForWindow = Math.max(0, (Number(inventory.totalQty) || 0) - reservedOverlap - legacyHeld);
          if (item.qty > availableForWindow) {
            throw new Error(`"${item.name}" has only ${availableForWindow} available for these dates and times. Another reservation overlaps this request.`);
          }
        });

        allocations.forEach((item, i) => {
          const reservationId = reservationDocumentId(request.id, item.equipmentId);
          tx.set(doc(db, 'equipmentReservations', reservationId), {
            equipmentId: item.equipmentId,
            requestId: request.id,
            qty: item.qty,
            ...window,
            status: 'active',
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          });
          tx.update(eqRefs[i], { reservationRevision: increment(1), updatedAt: serverTimestamp() });
        });

        const reqRef = doc(db, 'requests', request.id);
        tx.update(reqRef, {
          status: 'approved',
          staffRemarks: remarks,
          approvedAt: serverTimestamp(),
          approvedBy: userProfile?.name || 'Laboratory Staff',
          inventoryDeductedAtApproval: false,
          items: adjustedItems.map(item => ({
            ...item,
            qtyRequested: item.qtyApproved || item.qtyRequested,
          })),
          updatedAt: serverTimestamp(),
        });
      });
      toast.success('Request approved.');
      setApproveTarget(null);
    } catch (err) {
      toast.error('Approve failed: ' + err.message);
    }
  }

  async function handleReject(request, reason) {
    try {
      // If was approved, restore stock
      if (request.status === 'approved') {
        await runTransaction(db, async (tx) => {
          const items = request.items || [];
          const quantities = new Map();
          items.forEach(item => quantities.set(item.equipmentId, (quantities.get(item.equipmentId) || 0) + Number(item.qtyRequested || 0)));
          const equipmentIds = [...quantities.keys()];
          const eqRefs = equipmentIds.map(id => doc(db, 'equipment', id));
          const reservationRefs = equipmentIds.map(id => doc(db, 'equipmentReservations', reservationDocumentId(request.id, id)));
          const eqSnaps = [];
          for (const ref of eqRefs) {
            eqSnaps.push(await tx.get(ref)); // all reads first
          }
          const reservationSnaps = [];
          for (const ref of reservationRefs) reservationSnaps.push(await tx.get(ref));
          eqSnaps.forEach((snap, i) => {
            if (snap.exists() && request.inventoryDeductedAtApproval !== false) {
              tx.update(eqRefs[i], {
                availableQty: snap.data().availableQty + quantities.get(equipmentIds[i]),
                updatedAt: serverTimestamp(),
              });
            }
          });
          reservationSnaps.forEach((snap, i) => {
            if (snap.exists()) tx.update(reservationRefs[i], { status: 'released', updatedAt: serverTimestamp() });
          });
          tx.update(doc(db, 'requests', request.id), {
            status: 'rejected',
            staffRemarks: reason,
            updatedAt: serverTimestamp(),
          });
        });
      } else {
        await updateDoc(doc(db, 'requests', request.id), {
          status: 'rejected',
          staffRemarks: reason,
          updatedAt: serverTimestamp(),
        });
      }
      toast.success('Request rejected.');
      setRejectTarget(null);
    } catch (err) {
      toast.error('Reject failed: ' + err.message);
    }
  }

  async function handleDeleteRequest() {
    if (!deleteTarget || deleting) return;
    setDeleting(true);
    try {
      await deleteDoc(doc(db, 'requests', deleteTarget.id));
      setRequests(current => current.filter(request => request.id !== deleteTarget.id));
      toast.success('Equipment request history deleted.');
      setDeleteTarget(null);
    } catch (err) {
      toast.error('Could not delete request history: ' + err.message);
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div className="space-y-4 max-w-7xl mx-auto animate-fade-in">
      {/* Tabs */}
      <div className="flex gap-1 border-b border-gray-200">
        {TABS.map((t, i) => (
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
          <BarChart2 size={18} strokeWidth={1.8} />
          {TABS[tab]}
        </div>

        <div className="p-4 flex flex-wrap gap-3 border-b border-gray-100">
          <div className="relative flex-1 min-w-[180px]">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              className="input pl-9"
              placeholder="Search by student, experiment, or status…"
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>
          {tab === 1 && (
            <select
              className="input w-auto min-w-[140px]"
              value={statusFilter}
              onChange={e => setStatusFilter(e.target.value)}
            >
              <option value="">All Statuses</option>
              {STATUS_OPTIONS.filter(Boolean).map(s => (
                <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>
              ))}
            </select>
          )}
        </div>

        {loading ? (
          <TableSkeleton rows={5} cols={6} />
        ) : filtered.length === 0 ? (
          <div className="py-12 text-center text-gray-400">
            <Clock size={32} className="mx-auto mb-2 opacity-30" />
            <p className="text-sm">No requests found.</p>
          </div>
        ) : (
          <div className="table-container">
            <table className="table">
              <thead>
                <tr>
                  <th>Student</th>
                  <th>Experiment</th>
                  <th>Exp. Date</th>
                  <th>Date Requested</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(r => (
                  <tr key={r.id}>
                    <td data-label="Student">
                      <div>
                        <p className="font-medium text-sm">{r.borrowerName}</p>
                        <p className="text-xs text-gray-400">{r.gradeLevel} · {r.section}</p>
                      </div>
                    </td>
                    <td data-label="Experiment">
                      <div>
                        <p className="text-sm">{r.experiment}</p>
                        {r.lateRequestFlag && (
                          <span className="text-[10px] text-amber-700 flex items-center gap-1">
                            <AlertTriangle size={10} /> Late
                          </span>
                        )}
                      </div>
                    </td>
                    <td data-label="Exp. Date">
                      <p>{formatDate(r.experimentDate)}</p>
                      <p className="text-xs text-gray-500">{r.proposedBorrowTime || '08:00'} – {formatDate(r.expectedReturnDate)} {r.expectedReturnTime || '12:00'}</p>
                    </td>
                    <td data-label="Requested">
                      <p className="text-sm">{formatTimestamp(r.createdAt)}</p>
                      <p className="text-xs text-gray-400">{timeAgo(r.createdAt)}</p>
                    </td>
                    <td data-label="Status">
                      <StatusBadge status={r.status} expectedReturnDate={r.expectedReturnDate} />
                    </td>
                    <td>
                      <div className="flex flex-wrap gap-1">
                        <Link to={`/requests/${r.id}`} className="btn-secondary btn-sm">View</Link>
                        {r.status === 'pending' && (
                          <>
                            <button
                              onClick={() => setApproveTarget(r)}
                              className="btn btn-sm bg-green-600 text-white hover:bg-green-700"
                            >
                              <Check size={13} /> Approve
                            </button>
                            <button
                              onClick={() => setRejectTarget(r)}
                              className="btn-danger btn-sm"
                            >
                              <X size={13} /> Reject
                            </button>
                          </>
                        )}
                        {r.status === 'approved' && (
                          <>
                            <Link to={`/admin/borrowing?id=${r.id}`} className="btn-primary btn-sm">
                              Mark Borrowed
                            </Link>
                            <button
                              onClick={() => setRejectTarget(r)}
                              className="btn-danger btn-sm"
                            >
                              <X size={13} /> Reject
                            </button>
                          </>
                        )}
                        {r.status === 'borrowed' && (
                          <Link to={`/admin/borrowing?id=${r.id}&action=return`} className="btn-primary btn-sm">
                            Mark Returned
                          </Link>
                        )}
                        {tab === 1 && ['returned', 'rejected'].includes(r.status) && (
                          <button
                            onClick={() => setDeleteTarget(r)}
                            className="btn-danger btn-sm"
                            title="Permanently delete this request history"
                          >
                            <Trash2 size={13} /> Delete
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

      {rejectTarget && (
        <RejectModal
          request={rejectTarget}
          onClose={() => setRejectTarget(null)}
          onConfirm={(reason) => handleReject(rejectTarget, reason)}
        />
      )}
      {approveTarget && (
        <ApproveModal
          request={approveTarget}
          onClose={() => setApproveTarget(null)}
          onConfirm={(items, remarks) => handleApprove(approveTarget, items, remarks)}
        />
      )}
      <ConfirmDialog
        isOpen={!!deleteTarget}
        title="Delete equipment request history?"
        message={deleteTarget
          ? `Permanently delete ${deleteTarget.borrowerName || 'this student'}’s ${deleteTarget.experiment || 'equipment'} request? This cannot be undone.`
          : ''}
        confirmLabel={deleting ? 'Deleting…' : 'Delete history'}
        onCancel={() => { if (!deleting) setDeleteTarget(null); }}
        onConfirm={handleDeleteRequest}
        busy={deleting}
        danger
      />
    </div>
  );
}
