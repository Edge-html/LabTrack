import React, { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import {
  DoorOpen, Search, Trash2, ArrowLeft, Info, Calendar, Package,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { db } from '../lib/firebase';
import {
  collection, query, where, getDocs, doc, serverTimestamp, limit, writeBatch, startAfter,
} from 'firebase/firestore';
import {
  formatDate, formatTimeOfDay, formatTimestamp, timeAgo, bookingHasStarted,
} from '../lib/helpers';
import { LabStatusBadge } from '../components/StatusBadge';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { TableSkeleton } from '../components/LoadingSpinner';
import WarningsPanel from '../components/WarningsPanel';
import BookingTimeline from '../components/BookingTimeline';

const STATUS_OPTIONS = ['pending', 'approved', 'rejected', 'completed', 'cancelled'];

export default function MyLabBookings() {
  const { userProfile } = useAuth();
  const toast = useToast();
  const [searchParams] = useSearchParams();

  const [bookings, setBookings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [cancelTarget, setCancelTarget] = useState(null);
  const [focusId, setFocusId] = useState(null);
  const [historyCursor, setHistoryCursor] = useState(null);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);

  useEffect(() => { load(); }, [userProfile]);

  // Deep link from a warning: /my-lab-bookings?booking=<id>
  useEffect(() => {
    const id = searchParams.get('booking');
    if (id) setFocusId(id);
  }, [searchParams]);

  async function load() {
    if (!userProfile) return;
    setLoading(true);
    try {
      const snap = await getDocs(query(collection(db, 'labBookings'), where('userId', '==', userProfile.uid), limit(100)));
      const all = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      all.sort((a, b) => {
        const at = a.bookingDate || '';
        const bt = b.bookingDate || '';
        if (at !== bt) return bt.localeCompare(at);
        return (b.startTime || '').localeCompare(a.startTime || '');
      });
      setBookings(all);
      setHistoryCursor(snap.docs.at(-1) || null);
      setHasMore(snap.size === 100);
    } catch (err) {
      console.error(err);
      toast.error('Failed to load laboratory bookings.');
    } finally {
      setLoading(false);
    }
  }

  async function loadMore() {
    if (!userProfile || !historyCursor || !hasMore || loadingMore) return;
    setLoadingMore(true);
    try {
      const snap = await getDocs(query(
        collection(db, 'labBookings'), where('userId', '==', userProfile.uid), startAfter(historyCursor), limit(100),
      ));
      const page = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      setBookings(current => [...current, ...page].sort((a, b) => {
        const dateOrder = (b.bookingDate || '').localeCompare(a.bookingDate || '');
        return dateOrder || (b.startTime || '').localeCompare(a.startTime || '');
      }));
      setHistoryCursor(snap.docs.at(-1) || historyCursor);
      setHasMore(snap.size === 100);
    } catch (error) {
      toast.error(`Could not load more laboratory bookings: ${error.message}`);
    } finally {
      setLoadingMore(false);
    }
  }

  const filtered = bookings.filter(b => {
    const q = search.toLowerCase();
    const matchSearch =
      !q ||
      b.purpose?.toLowerCase().includes(q) ||
      b.teacher?.toLowerCase().includes(q) ||
      b.studentId?.toLowerCase().includes(q);
    const matchStatus = !statusFilter || b.status === statusFilter;
    return matchSearch && matchStatus;
  });

  async function handleCancel() {
    if (!cancelTarget) return;
    if (cancelTarget.status === 'approved' && bookingHasStarted(cancelTarget)) {
      toast.error('An approved booking cannot be cancelled after its start time. Contact laboratory staff.');
      setCancelTarget(null);
      return;
    }
    try {
      const batch = writeBatch(db);
      batch.update(doc(db, 'labBookings', cancelTarget.id), {
        status: 'cancelled',
        cancelledAt: serverTimestamp(),
        cancellationReason: 'student_cancelled',
        updatedAt: serverTimestamp(),
      });
      batch.update(doc(db, 'labBookingCalendar', cancelTarget.id), { status: 'cancelled' });
      await batch.commit();
      toast.success('Booking cancelled.');
      setCancelTarget(null);
      load();
    } catch (err) {
      toast.error('Failed to cancel: ' + err.message);
    }
  }

  const focused = focusId && bookings.find(b => b.id === focusId);

  return (
    <div className="space-y-4 max-w-5xl mx-auto animate-fade-in">
      <WarningsPanel userId={userProfile?.uid} header="Warnings on My Account" />

      {/* Booking timeline for the linked booking */}
      {focused && (
        <div className="card border-gold/50">
          <div className="card-header">
            <Info size={18} strokeWidth={1.8} />
            Booking Details
            <button onClick={() => setFocusId(null)} className="ml-auto btn-ghost btn-sm">
              <ArrowLeft size={14} /> Back to all
            </button>
          </div>
          <div className="p-5 space-y-4">
            <div className="flex flex-wrap items-center gap-3">
              <LabStatusBadge booking={focused} />
              <span className="text-sm font-semibold text-ink">
                {focused.labRoom}
              </span>
              <span className="text-sm text-gray-600">
                {formatDate(focused.bookingDate)} ·{' '}
                {formatTimeOfDay(focused.startTime)} – {formatTimeOfDay(focused.endTime)}
              </span>
            </div>
            <BookingTimeline booking={focused} />
            {focused.staffRemarks && (
              <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-800">
                <span className="font-semibold">Laboratory staff:</span> {focused.staffRemarks}
              </div>
            )}
          </div>
        </div>
      )}

      <div className="card">
        <div className="card-header">
          <DoorOpen size={18} strokeWidth={1.8} />
          My Laboratory Bookings
          <Link to="/lab-booking" className="ml-auto btn-primary btn-sm">
            <DoorOpen size={14} /> New Booking
          </Link>
        </div>

        <div className="p-4 flex flex-wrap gap-3 border-b border-gray-100">
          <div className="relative flex-1 min-w-[180px]">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input className="input pl-9" placeholder="Search by purpose, teacher or ID…"
              value={search} onChange={e => setSearch(e.target.value)} />
          </div>
          <select className="input w-auto min-w-[150px]" value={statusFilter}
            onChange={e => setStatusFilter(e.target.value)}>
            <option value="">All Statuses</option>
            {STATUS_OPTIONS.map(s => (
              <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>
            ))}
          </select>
        </div>

        {loading ? (
          <TableSkeleton rows={5} cols={5} />
        ) : filtered.length === 0 ? (
          <div className="py-12 text-center text-gray-400">
            <DoorOpen size={32} className="mx-auto mb-2 opacity-30" />
            <p className="text-sm">No laboratory bookings yet.</p>
            <Link to="/lab-booking" className="btn-primary btn-sm mt-3 inline-flex">
              Book a Laboratory
            </Link>
          </div>
        ) : (
          <div className="table-container">
            <table className="table">
              <thead>
                <tr>
                  <th>Laboratory</th>
                  <th>Date &amp; Time</th>
                  <th>Purpose</th>
                  <th>Request Sent</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(b => (
                  <tr key={b.id}>
                    <td data-label="Laboratory">
                      <p className="font-medium text-sm">{b.labRoom}</p>
                      <p className="text-xs text-gray-400">ID: {b.studentId}</p>
                    </td>
                    <td data-label="Date & Time">
                      <p className="text-sm">{formatDate(b.bookingDate)}</p>
                      <p className="text-xs text-gray-400">
                        {formatTimeOfDay(b.startTime)} – {formatTimeOfDay(b.endTime)}
                      </p>
                    </td>
                    <td data-label="Purpose" className="text-sm max-w-[220px]">
                      <p className="line-clamp-2">{b.purpose}</p>
                      {b.teacher && <p className="text-xs text-gray-400 mt-0.5">{b.teacher}</p>}
                    </td>
                    <td data-label="Request Sent">
                      <p className="text-sm">{formatTimestamp(b.submittedAt || b.createdAt)}</p>
                      <p className="text-xs text-gray-400">{timeAgo(b.submittedAt || b.createdAt)}</p>
                    </td>
                    <td data-label="Status">
                      <LabStatusBadge booking={b} />
                      {b.cancellationReason === 'no_show' && <p className="mt-1 text-[11px] font-medium text-red-700">No-show</p>}
                      {b.returnedAt && (
                        <p className="text-[11px] text-gray-400 mt-1">
                          Room returned {formatTimestamp(b.returnedAt)}
                        </p>
                      )}
                    </td>
                    <td>
                      <div className="flex flex-wrap gap-1">
                        <button
                          onClick={() => setFocusId(b.id)}
                          className="btn-secondary btn-sm"
                        >
                          <Calendar size={13} /> Details
                        </button>
                        {(b.status === 'pending' || (b.status === 'approved' && !b.checkedInAt && !bookingHasStarted(b))) && (
                          <button
                            onClick={() => setCancelTarget(b)}
                            className="btn-ghost btn-sm p-1.5 text-red-400 hover:bg-red-50"
                            title="Cancel booking"
                          >
                            <Trash2 size={14} />
                          </button>
                        )}
                        {['pending', 'approved'].includes(b.status) && (
                          <Link to={`/request?booking=${b.id}`} className="btn-secondary btn-sm">
                            <Package size={13} /> Request equipment
                          </Link>
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
              {loadingMore ? 'Loading…' : 'Load more bookings'}
            </button>
          </div>
        )}
      </div>

      <ConfirmDialog
        isOpen={!!cancelTarget}
        title="Cancel Booking"
        message={`Cancel your ${cancelTarget?.labRoom || ''} booking on ${formatDate(cancelTarget?.bookingDate)}? This will release the room slot.`}
        confirmLabel="Cancel Booking"
        danger
        onConfirm={handleCancel}
        onCancel={() => setCancelTarget(null)}
      />
    </div>
  );
}
