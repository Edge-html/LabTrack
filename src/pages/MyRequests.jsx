import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { FileText, Search, Filter, Trash2 } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { db } from '../lib/firebase';
import {
  collection, query, where, getDocs, deleteDoc, doc, orderBy, limit,
} from 'firebase/firestore';
import { formatDate } from '../lib/helpers';
import { StatusBadge } from '../components/StatusBadge';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { TableSkeleton } from '../components/LoadingSpinner';

const STATUS_OPTIONS = ['', 'pending', 'approved', 'rejected', 'borrowed', 'returned'];

export default function MyRequests() {
  const { userProfile } = useAuth();
  const toast = useToast();
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [deleteTarget, setDeleteTarget] = useState(null);

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
    <div className="space-y-4 max-w-5xl mx-auto animate-fade-in">
      <div className="card">
        <div className="card-header">
          <FileText size={18} strokeWidth={1.8} />
          My Requests
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
            className="input w-auto min-w-[140px]"
            value={statusFilter}
            onChange={e => setStatusFilter(e.target.value)}
          >
            <option value="">All Statuses</option>
            {STATUS_OPTIONS.filter(Boolean).map(s => (
              <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>
            ))}
          </select>
        </div>

        {loading ? (
          <TableSkeleton rows={5} cols={5} />
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
                  <th>Date Requested</th>
                  <th>Experiment Date</th>
                  <th>Expected Return</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(r => (
                  <tr key={r.id}>
                    <td data-label="Experiment" className="font-medium">{r.experiment}</td>
                    <td data-label="Date Requested">{formatDate(r.requestDate)}</td>
                    <td data-label="Exp. Date">{formatDate(r.experimentDate)}</td>
                    <td data-label="Return Date">{formatDate(r.expectedReturnDate)}</td>
                    <td data-label="Status">
                      <StatusBadge status={r.status} expectedReturnDate={r.expectedReturnDate} />
                    </td>
                    <td>
                      <div className="flex gap-1">
                        <Link to={`/requests/${r.id}`} className="btn-secondary btn-sm">View</Link>
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

      <ConfirmDialog
        isOpen={!!deleteTarget}
        title="Cancel Request"
        message={`Cancel your request for "${deleteTarget?.experiment}"? This cannot be undone.`}
        confirmLabel="Cancel Request"
        danger
        onConfirm={handleCancel}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  );
}
