import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  DoorOpen, Info, AlertTriangle, Calendar, Clock, Loader2,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { db } from '../lib/firebase';
import {
  collection, query, where, getDocs, doc, runTransaction, serverTimestamp,
} from 'firebase/firestore';
import {
  getTodayManila, formatDate, formatTimeOfDay, isValidGradeLevel,
  LAB_ROOMS, timesOverlap, durationLabel, countSchoolDays,
} from '../lib/helpers';
import { useLabRooms } from '../hooks/useLabRooms';
import {
  LAB_BOOKING_BLOCKING_STATUSES, labBookingCalendarEntry, roomBookingMutexId,
} from '../lib/labBookings';

export default function LabBooking() {
  const { userProfile } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { rooms } = useLabRooms();
  const today = getTodayManila();

  // Deep link from the room schedule: ?room=Room%20103&date=...&start=08:00&end=09:00
  const preRoom = searchParams.get('room');
  const preDate = searchParams.get('date');
  const preStart = searchParams.get('start');
  const preEnd = searchParams.get('end');

  const [form, setForm] = useState({
    labRoom: preRoom || LAB_ROOMS[0].id,
    bookingDate: preDate && preDate >= today ? preDate : today,
    startTime: /^\d{2}:\d{2}$/.test(preStart || '') ? preStart : '07:30',
    endTime: /^\d{2}:\d{2}$/.test(preEnd || '') ? preEnd : '08:30',
    purpose: '',
    teacher: '',
    participants: '1',
  });
  const [errors, setErrors] = useState({});
  const [existing, setExisting] = useState([]);
  const [checking, setChecking] = useState(false);
  const [availabilityError, setAvailabilityError] = useState(false);
  const [availabilityRetry, setAvailabilityRetry] = useState(0);
  const [submitting, setSubmitting] = useState(false);

  const restricted = userProfile?.borrowRestrictedUntil && userProfile.borrowRestrictedUntil >= today;
  const room = useMemo(() => rooms.find(item => item.id === form.labRoom) || null, [rooms, form.labRoom]);

  useEffect(() => {
    if (rooms.length && !rooms.some(item => item.id === form.labRoom)) {
      setForm(current => ({ ...current, labRoom: rooms[0].id }));
    }
  }, [rooms, form.labRoom]);

  // Load this room's bookings for the chosen date so we can flag slot conflicts.
  useEffect(() => {
    if (!form.bookingDate || !form.labRoom) return;
    let cancelled = false;
    setChecking(true);
    setAvailabilityError(false);

    (async () => {
      try {
        const snap = await getDocs(
          query(
            collection(db, 'labBookingCalendar'),
            where('bookingDate', '==', form.bookingDate),
            where('labRoom', '==', form.labRoom)
          )
        );
        if (!cancelled) {
          setExisting(snap.docs.map(d => ({ id: d.id, ...d.data() })));
        }
      } catch (err) {
        console.error('Failed to check availability:', err);
        if (!cancelled) {
          setExisting([]);
          setAvailabilityError(true);
        }
      } finally {
        if (!cancelled) setChecking(false);
      }
    })();

    return () => { cancelled = true; };
  }, [form.bookingDate, form.labRoom, availabilityRetry]);

  /** Approved/pending bookings that clash with the selected slot. */
  const conflicts = existing.filter(
    b => ['pending', 'approved'].includes(b.status) &&
         timesOverlap(form.startTime, form.endTime, b.startTime, b.endTime)
  );

  function setField(k, v) {
    setForm(f => ({ ...f, [k]: v }));
    setErrors(e => ({ ...e, [k]: undefined }));
  }

  function validate() {
    const errs = {};
    if (!/^\d+$/.test(userProfile?.lrn || '')) errs.studentId = 'Your profile needs a valid LRN. Please contact the administrator.';
    if (!form.bookingDate) errs.bookingDate = 'Booking date is required.';
    if (form.bookingDate && form.bookingDate < today) errs.bookingDate = 'Choose today or a future date.';
    if (!form.startTime) errs.startTime = 'Start time is required.';
    if (!form.endTime) errs.endTime = 'End time is required.';
    if (form.startTime && form.endTime && form.startTime >= form.endTime) {
      errs.endTime = 'End time must be after the start time.';
    }
    if (form.purpose.trim().length < 5) errs.purpose = 'Please describe the purpose of your booking.';
    return errs;
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (restricted) return;

    if (availabilityError) {
      toast.error('Room availability could not be checked. Please try again before submitting.');
      return;
    }

    if (!isValidGradeLevel(userProfile?.gradeLevel)) {
      toast.error('Only Grade 11 and Grade 12 students may book a laboratory room.');
      return;
    }

    const errs = validate();
    setErrors(errs);
    if (Object.keys(errs).length > 0) return;

    if (conflicts.length > 0) {
      toast.error('That time slot is already taken. Please pick another slot.');
      return;
    }

    setSubmitting(true);
    try {
      const bookingRef = doc(collection(db, 'labBookings'));
      const calendarRef = doc(db, 'labBookingCalendar', bookingRef.id);
      const mutexRef = doc(db, 'labBookingMutex', roomBookingMutexId(form.bookingDate, form.labRoom));
      const booking = {
        userId: userProfile.uid,
        studentName: userProfile.name,
        studentId: userProfile.lrn,
        gradeLevel: userProfile.gradeLevel,
        section: userProfile.section,
        labRoom: form.labRoom,
        bookingDate: form.bookingDate,
        startTime: form.startTime,
        endTime: form.endTime,
        purpose: form.purpose.trim(),
        teacher: form.teacher.trim(),
        participants: parseInt(form.participants) || 1,
        status: 'pending',
        staffRemarks: '',
        submittedAt: serverTimestamp(),
        approvedAt: null,
        approvedBy: null,
        checkedInAt: null,
        returnedAt: null,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      };

      await runTransaction(db, async transaction => {
        const mutexSnap = await transaction.get(mutexRef);
        const scheduleSnap = await transaction.get(query(
          collection(db, 'labBookingCalendar'),
          where('bookingDate', '==', form.bookingDate),
          where('labRoom', '==', form.labRoom),
        ));
        const hasConflict = scheduleSnap.docs.some(item => {
          const scheduled = item.data();
          return LAB_BOOKING_BLOCKING_STATUSES.includes(scheduled.status) &&
            timesOverlap(form.startTime, form.endTime, scheduled.startTime, scheduled.endTime);
        });
        if (hasConflict) throw new Error('That time slot was just reserved. Please choose another time.');

        const revision = (Number(mutexSnap.data()?.revision) || 0) + 1;
        transaction.set(bookingRef, booking);
        transaction.set(calendarRef, labBookingCalendarEntry(booking));
        transaction.set(mutexRef, {
          bookingId: bookingRef.id,
          bookingDate: form.bookingDate,
          labRoom: form.labRoom,
          revision,
        });
      });

      toast.success('Laboratory booking submitted!');
      navigate('/my-lab-bookings');
    } catch (err) {
      toast.error('Failed to submit: ' + err.message);
    } finally {
      setSubmitting(false);
    }
  }

  const advanceNotice = form.bookingDate
    ? countSchoolDays(today, form.bookingDate)
    : 0;

  if (restricted) {
    return (
      <div className="max-w-xl mx-auto mt-10">
        <div className="card p-6 border-red-200">
          <div className="flex items-start gap-3">
            <AlertTriangle size={24} className="text-red-500 shrink-0 mt-0.5" />
            <div>
              <h2 className="font-semibold text-gray-900 text-lg">Booking Restricted</h2>
              <p className="text-sm text-gray-600 mt-1">{userProfile.restrictionReason}</p>
              <p className="text-sm text-gray-500 mt-2">
                Restriction lifts on:{' '}
                <span className="font-semibold text-red-700">
                  {formatDate(userProfile.borrowRestrictedUntil)}
                </span>
              </p>
              <p className="text-xs text-gray-400 mt-3">
                Contact the laboratory staff to appeal.
              </p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto space-y-4 animate-fade-in">
      <div className="card">
        <div className="card-header">
          <DoorOpen size={18} strokeWidth={1.8} />
          Book a Laboratory Room
        </div>

        <div className="p-5 border-b border-gray-100 bg-gold-pale/20 flex items-start gap-2.5">
          <Info size={16} className="text-crimson shrink-0 mt-0.5" />
          <p className="text-sm text-gray-700">
            This form is for reserving a laboratory room. To borrow glassware and other
            equipment, use the <span className="font-semibold">Request Equipment</span> form instead.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-5">
          {/* Room picker */}
          <div>
            <label className="label">Laboratory Room *</label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {rooms.map(r => {
                const active = form.labRoom === r.id;
                return (
                  <button
                    key={r.id}
                    type="button"
                    onClick={() => setField('labRoom', r.id)}
                    className={`flex items-center gap-2.5 text-left p-3 rounded-xl border-2 transition-all ${
                      active
                        ? 'border-crimson bg-primary-50 shadow-sm'
                        : 'border-gray-200 bg-white hover:border-gold'
                    }`}
                  >
                    <DoorOpen
                      size={16}
                      className={active ? 'text-crimson' : 'text-gray-400'}
                      strokeWidth={1.8}
                    />
                    <span className={`font-semibold text-sm ${active ? 'text-crimson' : 'text-gray-700'}`}>
                      {r.id}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Who */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="label">Name of Booker</label>
              <input className="input bg-gray-50" value={userProfile?.name || ''} readOnly />
            </div>
            <div>
              <label className="label">LRN / Student ID</label>
              <input className="input bg-gray-50" value={userProfile?.lrn || 'LRN not set on your profile'} readOnly />
              {errors.studentId && <p className="text-xs text-red-600 mt-1">{errors.studentId}</p>}
            </div>
            <div>
              <label className="label">Grade Level &amp; Section</label>
              <input className="input bg-gray-50"
                value={`${userProfile?.gradeLevel || ''} · ${userProfile?.section || ''}`} readOnly />
            </div>
          </div>

          {/* When */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="label">Date of Booking *</label>
              <input
                type="date"
                className={`input ${errors.bookingDate ? 'input-error' : ''}`}
                value={form.bookingDate}
                min={today}
                onChange={e => setField('bookingDate', e.target.value)}
              />
              {errors.bookingDate && <p className="text-xs text-red-600 mt-1">{errors.bookingDate}</p>}
            </div>
            <div>
              <label className="label">Start Time *</label>
              <input
                type="time"
                step="300"
                className={`input ${errors.startTime ? 'input-error' : ''}`}
                value={form.startTime}
                onChange={e => setField('startTime', e.target.value)}
              />
              {errors.startTime && <p className="text-xs text-red-600 mt-1">{errors.startTime}</p>}
            </div>
            <div>
              <label className="label">End Time *</label>
              <input
                type="time"
                step="300"
                className={`input ${errors.endTime ? 'input-error' : ''}`}
                value={form.endTime}
                onChange={e => setField('endTime', e.target.value)}
              />
              {errors.endTime && <p className="text-xs text-red-600 mt-1">{errors.endTime}</p>}
            </div>
          </div>

          {/* Slot summary + conflicts */}
          <div className={`p-3 rounded-xl border text-sm ${
            conflicts.length > 0 || availabilityError
              ? 'bg-red-50 border-red-200'
              : 'bg-green-50 border-green-200'
          }`}>
            <div className="flex items-start gap-2.5">
              {checking ? (
                <Loader2 size={16} className="animate-spin text-gray-400 shrink-0 mt-0.5" />
              ) : conflicts.length > 0 || availabilityError ? (
                <AlertTriangle size={16} className="text-red-500 shrink-0 mt-0.5" />
              ) : (
                <Calendar size={16} className="text-green-600 shrink-0 mt-0.5" />
              )}
              <div className="min-w-0">
                {checking ? (
                  <p className="text-gray-600">Checking availability…</p>
                ) : availabilityError ? (
                  <div>
                    <p className="font-semibold text-red-800">Could not check room availability.</p>
                    <button type="button" className="text-red-700 underline text-xs mt-1" onClick={() => setAvailabilityRetry(v => v + 1)}>
                      Try again
                    </button>
                  </div>
                ) : conflicts.length > 0 ? (
                  <>
                    <p className="font-semibold text-red-800">
                      {room?.id} is already booked for this slot.
                    </p>
                    <ul className="mt-1 space-y-0.5">
                      {conflicts.map(c => (
                        <li key={c.id} className="text-red-700 text-xs">
                          {formatTimeOfDay(c.startTime)}–{formatTimeOfDay(c.endTime)}
                          {c.status === 'pending' ? ' · pending request' : ' · booked'}
                        </li>
                      ))}
                    </ul>
                    <p className="text-red-600 text-xs mt-1">Please choose a different time or room.</p>
                  </>
                ) : (
                  <p className="text-green-800">
                    <span className="font-semibold">{room?.id}</span> is available on{' '}
                    <span className="font-semibold">{formatDate(form.bookingDate)}</span>,{' '}
                    {formatTimeOfDay(form.startTime)} – {formatTimeOfDay(form.endTime)}
                    {durationLabel(form.startTime, form.endTime) && (
                      <>
                        {' '}(<span className="font-semibold">{durationLabel(form.startTime, form.endTime)}</span>)
                      </>
                    )}.
                  </p>
                )}
              </div>
            </div>
          </div>

          {/* Why */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="sm:col-span-2">
              <label className="label">Purpose of Booking *</label>
              <textarea
                className={`input min-h-[80px] resize-none ${errors.purpose ? 'input-error' : ''}`}
                placeholder="e.g. Titration experiment for Quarter 2 — Group 4"
                value={form.purpose}
                onChange={e => setField('purpose', e.target.value)}
                maxLength={500}
              />
              {errors.purpose && <p className="text-xs text-red-600 mt-1">{errors.purpose}</p>}
            </div>
            <div className="space-y-4">
              <div>
                <label className="label">Teacher Assigned</label>
                <input className="input" placeholder="Teacher's name"
                  value={form.teacher} onChange={e => setField('teacher', e.target.value)} />
              </div>
              <div>
                <label className="label">No. of Students</label>
                <input type="number" min="1" max="60" className="input"
                  value={form.participants} onChange={e => setField('participants', e.target.value)} />
              </div>
            </div>
          </div>

          {advanceNotice > 0 && advanceNotice < 3 && (
            <div className="flex items-start gap-2.5 p-3 bg-amber-50 border border-amber-200 rounded-xl">
              <AlertTriangle size={16} className="text-amber-600 shrink-0 mt-0.5" />
              <p className="text-sm text-amber-800">
                Your booking is less than 3 school days away. Staff may still review and approve it at
                their discretion.
              </p>
            </div>
          )}

          <button
            type="submit"
            disabled={submitting || checking || availabilityError || conflicts.length > 0}
            className="btn-primary w-full justify-center"
          >
            {submitting ? (
              <>
                <Loader2 size={16} className="animate-spin" /> Submitting…
              </>
            ) : (
              <>
                <Clock size={16} /> Submit Booking Request
              </>
            )}
          </button>
        </form>
      </div>
    </div>
  );
}
