import React, { useEffect, useState } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import {
  DoorOpen, Search, Check, X, LogIn, LogOut, AlertTriangle, Loader2, FlaskConical, Trash2,
} from 'lucide-react';
import { useToast } from '../../context/ToastContext';
import { useAuth } from '../../context/AuthContext';
import { db } from '../../lib/firebase';
import {
  collection, query, where, getDocs, doc, serverTimestamp, limit, getDoc, writeBatch, runTransaction,
  orderBy, startAfter,
} from 'firebase/firestore';
import {
  formatDate, formatTimeOfDay, formatTimestamp, timeAgo, timesOverlap,
} from '../../lib/helpers';
import {
  LAB_BOOKING_BLOCKING_STATUSES, labBookingCalendarEntry, roomBookingMutexId,
} from '../../lib/labBookings';
import { LabStatusBadge } from '../../components/StatusBadge';
import { TableSkeleton } from '../../components/LoadingSpinner';
import BookingTimeline from '../../components/BookingTimeline';
import { ConfirmDialog } from '../../components/ConfirmDialog';

const TABS = ['Pending', 'Approved / In Use', 'History'];
const STATUS_BY_TAB = [
  ['pending'],
  ['approved'],
  ['completed', 'rejected', 'cancelled'],
];
const HISTORY_PAGE_SIZE = 100;

/**
 * Approve / reject modal.
 */
function DecisionModal({ booking, action, onClose, onConfirm }) {
  const [remarks, setRemarks] = useState('');
  const [busy, setBusy] = useState(false);
  const isApprove = action === 'approve';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-2xl max-w-md w-full p-6 animate-fade-in">
        <h3 className="font-semibold text-gray-900 mb-1 flex items-center gap-2">
          {isApprove ? (
            <Check size={18} className="text-green-600" />
          ) : (
            <X size={18} className="text-red-600" />
          )}
          {isApprove ? 'Approve Booking' : 'Reject Booking'}
        </h3>
        <p className="text-sm text-gray-500 mb-4">
          {booking.studentName} · {booking.labRoom} · {formatDate(booking.bookingDate)},{' '}
          {formatTimeOfDay(booking.startTime)} – {formatTimeOfDay(booking.endTime)}
        </p>

        <div className="mb-4 p-3 bg-gray-50 rounded-xl text-sm">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Purpose</p>
          <p className="text-gray-700">{booking.purpose}</p>
          <p className="text-xs text-gray-500 mt-2">
            ID: {booking.studentId} · {booking.gradeLevel} {booking.section ? `· ${booking.section}` : ''}
            {booking.teacher ? ` · ${booking.teacher}` : ''}
            {booking.participants ? ` · ${booking.participants} student(s)` : ''}
          </p>
        </div>

        <label className="label">{isApprove ? 'Remarks (optional)' : 'Reason for Rejection *'}</label>
        <textarea className="input min-h-[70px] resize-none" value={remarks}
          onChange={e => setRemarks(e.target.value)}
          placeholder={isApprove ? 'Any instructions for the student…' : 'Explain why this booking is rejected…'} />

        <div className="flex gap-2 justify-end mt-4">
          <button onClick={onClose} disabled={busy} className="btn-secondary btn-sm">Cancel</button>
          <button
            disabled={busy || (!isApprove && !remarks.trim())}
            onClick={async () => { setBusy(true); await onConfirm(remarks.trim()); setBusy(false); }}
            className={isApprove ? 'btn-primary btn-sm' : 'btn-danger btn-sm'}
          >
            {busy ? <Loader2 size={14} className="animate-spin" /> : isApprove ? <Check size={14} /> : <X size={14} />}
            {isApprove ? 'Approve' : 'Reject'}
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * Mark-as-used / mark-as-returned modal (records the exact times).
 */
function UseModal({ booking, action, onClose, onConfirm }) {
  const [busy, setBusy] = useState(false);
  const isCheckIn = action === 'checkin';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-2xl max-w-sm w-full p-6 animate-fade-in text-center">
        <div className={`w-12 h-12 rounded-2xl flex items-center justify-center mx-auto mb-3 ${
          isCheckIn ? 'bg-green-100 text-green-600' : 'bg-blue-100 text-blue-600'
        }`}>
          {isCheckIn ? <LogIn size={22} /> : <LogOut size={22} />}
        </div>
        <h3 className="font-semibold text-gray-900 mb-1">
          {isCheckIn ? 'Mark Room Occupied' : 'Mark Room Done'}
        </h3>
        <p className="text-sm text-gray-500 mb-4">
          {booking.studentName} · {booking.labRoom}
          <br />
          The current time will be recorded.
        </p>
        <div className="flex gap-2 justify-center">
          <button onClick={onClose} disabled={busy} className="btn-secondary btn-sm">Cancel</button>
          <button
            disabled={busy}
            onClick={async () => { setBusy(true); await onConfirm(); setBusy(false); }}
            className="btn-primary btn-sm"
          >
            {busy ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />} Confirm
          </button>
        </div>
      </div>
    </div>
  );
}

export default function ManageLabBookings() {
  const toast = useToast();
  const { userProfile } = useAuth();
  const [searchParams] = useSearchParams();

  const [bookings, setBookings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [tab, setTab] = useState(0);
  const [decision, setDecision] = useState(null); // { booking, action }
  const [useTarget, setUseTarget] = useState(null); // { booking, action }
  const [details, setDetails] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleting, setDeleting] = useState(false);
  const [historyYear, setHistoryYear] = useState('');
  const [deleteYearTarget, setDeleteYearTarget] = useState('');
  const [historyCursor, setHistoryCursor] = useState(null);
  const [hasMoreHistory, setHasMoreHistory] = useState(false);
  const [loadingMoreHistory, setLoadingMoreHistory] = useState(false);

  const preId = searchParams.get('id');

  useEffect(() => { load(); }, [tab, historyYear]);

  useEffect(() => {
    if (!preId) return;
    (async () => {
      try {
        const snap = await getDoc(doc(db, 'labBookings', preId));
        if (snap.exists()) setDetails({ id: snap.id, ...snap.data() });
      } catch { /* ignore */ }
    })();
  }, [preId]);

  function historyQuery(cursor = null) {
    const constraints = [
      where('status', 'in', STATUS_BY_TAB[2]),
    ];
    if (historyYear) {
      constraints.push(
        where('bookingDate', '>=', `${historyYear}-01-01`),
        where('bookingDate', '<=', `${historyYear}-12-31`),
      );
    }
    constraints.push(orderBy('bookingDate', 'desc'));
    if (cursor) constraints.push(startAfter(cursor));
    constraints.push(limit(HISTORY_PAGE_SIZE));
    return query(collection(db, 'labBookings'), ...constraints);
  }

  async function load() {
    setLoading(true);
    try {
      const bookingsQuery = tab === 2
        ? historyQuery()
        : query(collection(db, 'labBookings'), where('status', 'in', STATUS_BY_TAB[tab]), limit(300));
      const snap = await getDocs(bookingsQuery);
      const docs = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      setBookings(docs);
      if (tab === 2) {
        setHistoryCursor(snap.docs.at(-1) || null);
        setHasMoreHistory(snap.size === HISTORY_PAGE_SIZE);
      } else {
        setHistoryCursor(null);
        setHasMoreHistory(false);
      }
    } catch (err) {
      console.error(err);
      toast.error('Failed to load laboratory bookings.');
    } finally {
      setLoading(false);
    }
  }

  async function loadMoreHistory() {
    if (tab !== 2 || !historyCursor || !hasMoreHistory || loadingMoreHistory) return;
    setLoadingMoreHistory(true);
    try {
      const snap = await getDocs(historyQuery(historyCursor));
      setBookings(current => [...current, ...snap.docs.map(d => ({ id: d.id, ...d.data() }))]);
      setHistoryCursor(snap.docs.at(-1) || historyCursor);
      setHasMoreHistory(snap.size === HISTORY_PAGE_SIZE);
    } catch (err) {
      toast.error('Could not load more booking history: ' + err.message);
    } finally {
      setLoadingMoreHistory(false);
    }
  }

  const filtered = bookings.filter(b => {
    const q = search.toLowerCase();
    return (
      !q ||
      b.studentName?.toLowerCase().includes(q) ||
      b.purpose?.toLowerCase().includes(q) ||
      b.studentId?.toLowerCase().includes(q) ||
      (b.labRoom || '').toLowerCase().includes(q)
    );
  });

  async function handleDecision(booking, action, remarks) {
    try {
      const patch =
        action === 'approve'
          ? {
              status: 'approved',
              staffRemarks: remarks,
              approvedAt: serverTimestamp(),
              approvedBy: userProfile?.name || 'Laboratory Staff',
              updatedAt: serverTimestamp(),
            }
          : {
              status: 'rejected',
              staffRemarks: remarks,
              rejectedAt: serverTimestamp(),
              updatedAt: serverTimestamp(),
            };
      const bookingRef = doc(db, 'labBookings', booking.id);
      const calendarRef = doc(db, 'labBookingCalendar', booking.id);
      const mutexRef = doc(db, 'labBookingMutex', roomBookingMutexId(booking.bookingDate, booking.labRoom));
      await runTransaction(db, async transaction => {
        // Serialize admin approvals with student submissions for this room/date.
        const mutexSnap = await transaction.get(mutexRef);
        const currentSnap = await transaction.get(bookingRef);
        if (!currentSnap.exists() || currentSnap.data().status !== 'pending') {
          throw new Error('This booking is no longer pending. Refresh the page and try again.');
        }
        const current = currentSnap.data();
        const scheduleSnap = await transaction.get(query(
          collection(db, 'labBookingCalendar'),
          where('bookingDate', '==', current.bookingDate),
          where('labRoom', '==', current.labRoom),
        ));
        if (action === 'approve') {
          const conflict = scheduleSnap.docs.find(item => {
            if (item.id === booking.id) return false;
            const scheduled = item.data();
            return LAB_BOOKING_BLOCKING_STATUSES.includes(scheduled.status) &&
              timesOverlap(current.startTime, current.endTime, scheduled.startTime, scheduled.endTime);
          });
          if (conflict) {
            throw new Error('This room and time now overlap another pending or approved booking. Resolve the conflict before approving.');
          }
        }

        const revision = (Number(mutexSnap.data()?.revision) || 0) + 1;
        transaction.update(bookingRef, patch);
        transaction.set(calendarRef, labBookingCalendarEntry({ ...current, status: patch.status }));
        transaction.set(mutexRef, {
          bookingId: booking.id,
          bookingDate: current.bookingDate,
          labRoom: current.labRoom,
          revision,
        });
      });
      toast.success(action === 'approve' ? 'Booking approved.' : 'Booking rejected.');
      setDecision(null);
      load();
    } catch (err) {
      toast.error('Failed: ' + err.message);
    }
  }

  async function handleUse(booking, action) {
    try {
      const patch =
        action === 'checkin'
          ? { checkedInAt: serverTimestamp(), updatedAt: serverTimestamp() }
          : { status: 'completed', returnedAt: serverTimestamp(), updatedAt: serverTimestamp() };
      const batch = writeBatch(db);
      batch.update(doc(db, 'labBookings', booking.id), patch);
      if (patch.status) batch.update(doc(db, 'labBookingCalendar', booking.id), { status: patch.status });
      await batch.commit();
      toast.success(action === 'checkin' ? 'Room marked occupied.' : 'Room marked done.');
      setUseTarget(null);
      load();
    } catch (err) {
      toast.error('Failed: ' + err.message);
    }
  }

  async function handleDeleteBooking() {
    if (!deleteTarget || deleting) return;
    setDeleting(true);
    try {
      const batch = writeBatch(db);
      batch.delete(doc(db, 'labBookings', deleteTarget.id));
      batch.delete(doc(db, 'labBookingCalendar', deleteTarget.id));
      await batch.commit();
      setBookings(current => current.filter(booking => booking.id !== deleteTarget.id));
      if (details?.id === deleteTarget.id) setDetails(null);
      await load();
      toast.success('Booking history deleted.');
      setDeleteTarget(null);
    } catch (err) {
      toast.error('Could not delete booking history: ' + err.message);
    } finally {
      setDeleting(false);
    }
  }

  async function handleDeleteYear() {
    if (!deleteYearTarget || deleting) return;
    setDeleting(true);
    try {
      const year = deleteYearTarget;
      let deleted = 0;
      const deletedIds = new Set();
      // Delete a page at a time; two docs per booking keeps each batch below 500 writes.
      while (true) {
        const snap = await getDocs(query(
          collection(db, 'labBookings'),
          where('status', 'in', STATUS_BY_TAB[2]),
          where('bookingDate', '>=', `${year}-01-01`),
          where('bookingDate', '<=', `${year}-12-31`),
          orderBy('bookingDate', 'asc'),
          limit(225),
        ));
        if (snap.empty) break;
        const batch = writeBatch(db);
        snap.docs.forEach(item => {
          batch.delete(item.ref);
          batch.delete(doc(db, 'labBookingCalendar', item.id));
          deletedIds.add(item.id);
        });
        await batch.commit();
        deleted += snap.size;
      }
      setBookings(current => current.filter(booking => !deletedIds.has(booking.id)));
      await load();
      toast.success(`Deleted ${deleted} booking record(s) from ${year}.`);
      setDeleteYearTarget('');
    } catch (err) {
      toast.error('Could not delete that year’s history: ' + err.message);
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div className="space-y-4 max-w-7xl mx-auto animate-fade-in">
      {/* Deep-linked booking detail */}
      {details && (
        <div className="card border-gold/50">
          <div className="card-header">
            <DoorOpen size={18} strokeWidth={1.8} />
            {details.labRoom} — {details.studentName}
            <button onClick={() => setDetails(null)} className="ml-auto btn-ghost btn-sm">
              <X size={14} /> Close
            </button>
          </div>
          <div className="p-5 space-y-4">
            <div className="flex flex-wrap items-center gap-3">
              <LabStatusBadge booking={details} />
              <span className="text-sm text-gray-600">
                {formatDate(details.bookingDate)} · {formatTimeOfDay(details.startTime)} –{' '}
                {formatTimeOfDay(details.endTime)}
              </span>
              <span className="text-sm text-gray-600">ID: {details.studentId}</span>
            </div>
            <p className="text-sm text-gray-700">{details.purpose}</p>
            <BookingTimeline booking={details} />
            {details.staffRemarks && (
              <p className="text-sm text-gray-600">
                <span className="font-semibold">Remarks:</span> {details.staffRemarks}
              </p>
            )}
          </div>
        </div>
      )}

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
          <DoorOpen size={18} strokeWidth={1.8} />
          Laboratory Bookings
          <span className="ml-auto text-xs text-gold font-medium">
            {filtered.length}{tab === 2 ? ' loaded' : ''} booking{filtered.length === 1 ? '' : 's'}
          </span>
        </div>

        <div className="p-4 border-b border-gray-100">
          <div className="flex flex-wrap gap-2 items-center">
            <div className="relative max-w-xs flex-1 min-w-[200px]">
              <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input className="input pl-9" placeholder={tab === 2 ? 'Search loaded history…' : 'Search student, room, purpose…'}
                value={search} onChange={e => setSearch(e.target.value)} />
            </div>
            {tab === 2 && (
              <>
                <input
                  className="input w-28"
                  type="number"
                  min="2000"
                  max={new Date().getFullYear() + 1}
                  value={historyYear}
                  onChange={e => setHistoryYear(e.target.value)}
                  placeholder="All years"
                  aria-label="Filter booking history by year"
                />
                <button
                  type="button"
                  onClick={() => setDeleteYearTarget(historyYear)}
                  disabled={!/^\d{4}$/.test(historyYear) || !bookings.some(b => b.bookingDate?.startsWith(`${historyYear}-`))}
                  className="btn-danger btn-sm"
                >Delete {historyYear || 'year'} history</button>
              </>
            )}
          </div>
        </div>

        {loading ? (
          <TableSkeleton rows={5} cols={6} />
        ) : filtered.length === 0 ? (
          <div className="py-12 text-center text-gray-400">
            <DoorOpen size={32} className="mx-auto mb-2 opacity-30" />
            <p className="text-sm">No laboratory bookings in this view.</p>
          </div>
        ) : (
          <div className="table-container">
            <table className="table">
              <thead>
                <tr>
                  <th>Student</th>
                  <th>Laboratory</th>
                  <th>Date &amp; Time</th>
                  <th>Request Sent</th>
                  <th>Room Returned</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(b => {
                  return (
                    <tr key={b.id}>
                      <td data-label="Student">
                        <p className="font-medium text-sm">{b.studentName}</p>
                        <p className="text-xs text-gray-400">ID: {b.studentId}</p>
                      </td>
                      <td data-label="Laboratory">
                        <p className="text-sm font-medium">{b.labRoom}</p>
                        <p className="text-xs text-gray-400 line-clamp-1 max-w-[180px]">{b.purpose}</p>
                      </td>
                      <td data-label="Date & Time">
                        <p className="text-sm">{formatDate(b.bookingDate)}</p>
                        <p className="text-xs text-gray-400">
                          {formatTimeOfDay(b.startTime)} – {formatTimeOfDay(b.endTime)}
                        </p>
                      </td>
                      <td data-label="Request Sent">
                        <p className="text-sm">{formatTimestamp(b.submittedAt || b.createdAt)}</p>
                        <p className="text-xs text-gray-400">{timeAgo(b.submittedAt || b.createdAt)}</p>
                      </td>
                      <td data-label="Room Returned" className="text-sm">
                        {b.returnedAt ? formatTimestamp(b.returnedAt) : '—'}
                      </td>
                      <td data-label="Status">
                        <LabStatusBadge booking={b} />
                      </td>
                      <td>
                        <div className="flex gap-1 flex-wrap">
                          {b.status === 'pending' && (
                            <>
                              <button
                                onClick={() => setDecision({ booking: b, action: 'approve' })}
                                className="btn-primary btn-sm"
                              >
                                <Check size={13} /> Approve
                              </button>
                              <button
                                onClick={() => setDecision({ booking: b, action: 'reject' })}
                                className="btn-danger btn-sm"
                              >
                                <X size={13} /> Reject
                              </button>
                            </>
                          )}
                          {b.status === 'approved' && !b.checkedInAt && (
                            <button
                              onClick={() => setUseTarget({ booking: b, action: 'checkin' })}
                              className="btn-primary btn-sm"
                            >
                              <LogIn size={13} /> Occupied
                            </button>
                          )}
                          {b.status === 'approved' && b.checkedInAt && (
                            <button
                              onClick={() => setUseTarget({ booking: b, action: 'checkout' })}
                              className="btn-primary btn-sm"
                            >
                              <LogOut size={13} /> Done
                            </button>
                          )}
                          {(b.status === 'rejected' || b.status === 'cancelled') && b.studentName && (
                            <Link
                              to={`/admin/warnings?userId=${b.userId}&labBookingId=${b.id}`}
                              className="btn-secondary btn-sm"
                              title="Issue a warning for this student"
                            >
                              <AlertTriangle size={13} /> Warn
                            </Link>
                          )}
                          {tab === 2 && (
                            <button
                              onClick={() => setDeleteTarget(b)}
                              className="btn-danger btn-sm"
                              title="Permanently delete this booking history"
                            >
                              <Trash2 size={13} /> Delete
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
        {tab === 2 && hasMoreHistory && !loading && (
          <div className="p-4 border-t border-gray-100 text-center">
            <button className="btn-secondary btn-sm" onClick={loadMoreHistory} disabled={loadingMoreHistory}>
              {loadingMoreHistory ? 'Loading…' : 'Load more history'}
            </button>
          </div>
        )}
      </div>

      <div className="card p-4 flex items-start gap-2.5 bg-gold-pale/30 border-gold/30">
        <FlaskConical size={16} className="text-crimson shrink-0 mt-0.5" />
        <p className="text-xs text-gray-600">
          Room schedules are blocked by students who already have an approved or pending booking for the
          same room and an overlapping time slot. Approving a booking records the exact approval time;
          marking it returned records the exact time the room was handed back.
        </p>
      </div>

      {decision && (
        <DecisionModal
          booking={decision.booking}
          action={decision.action}
          onClose={() => setDecision(null)}
          onConfirm={remarks => handleDecision(decision.booking, decision.action, remarks)}
        />
      )}
      {useTarget && (
        <UseModal
          booking={useTarget.booking}
          action={useTarget.action}
          onClose={() => setUseTarget(null)}
          onConfirm={() => handleUse(useTarget.booking, useTarget.action)}
        />
      )}
      <ConfirmDialog
        isOpen={!!deleteTarget}
        title="Delete booking history?"
        message={deleteTarget
          ? `Permanently delete ${deleteTarget.studentName || 'this student'}’s ${deleteTarget.labRoom} booking for ${formatDate(deleteTarget.bookingDate)}? This cannot be undone.`
          : ''}
        confirmLabel={deleting ? 'Deleting…' : 'Delete history'}
        onCancel={() => { if (!deleting) setDeleteTarget(null); }}
        onConfirm={handleDeleteBooking}
        busy={deleting}
        danger
      />
      <ConfirmDialog
        isOpen={!!deleteYearTarget}
        title={`Delete all ${deleteYearTarget} booking history?`}
        message={`Permanently delete every completed, rejected, or cancelled laboratory booking dated in ${deleteYearTarget}? This cannot be undone.`}
        confirmLabel={deleting ? 'Deleting…' : 'Delete year history'}
        onCancel={() => { if (!deleting) setDeleteYearTarget(''); }}
        onConfirm={handleDeleteYear}
        busy={deleting}
        danger
      />
    </div>
  );
}
