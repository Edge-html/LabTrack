import React, { useState, useEffect } from 'react';
import { getIdToken, reload } from 'firebase/auth';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  ClipboardList, Plus, Trash2, AlertTriangle, AlertCircle,
  Calendar, User, BookOpen, Clock, Camera,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import EquipmentPicker from '../components/EquipmentPicker';
import { hasReservationOverlap, reservationWindow } from '../lib/equipmentReservations';
import { db } from '../lib/firebase';
import {
  collection, getDocs, addDoc, serverTimestamp, onSnapshot,
  query, orderBy, where, doc, getDoc, updateDoc,
} from 'firebase/firestore';
import {
  getTodayManila, formatDate, addDays, durationToDays,
  countSchoolDays, DURATION_OPTIONS, isValidGradeLevel,
} from '../lib/helpers';

const EMPTY_LINE = { equipmentId: '', name: '', qtyRequested: 1 };

export default function RequestEquipment() {
  const { currentUser, userProfile } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const editId = searchParams.get('edit');
  const bookingId = searchParams.get('booking');
  const today = getTodayManila();

  const [equipment, setEquipment] = useState([]);
  const [reservations, setReservations] = useState([]);
  const [reservationsReady, setReservationsReady] = useState(false);
  const [reservationError, setReservationError] = useState(false);
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  const [form, setForm] = useState({
    requestDate: today,
    experimentDate: '',
    proposedBorrowTime: '08:00',
    duration: '1 day',
    customDays: '',
    expectedReturnDate: '',
    expectedReturnTime: '12:00',
    teacher: '',
    experiment: '',
  });
  const [lines, setLines] = useState([{ ...EMPTY_LINE }]);
  const [lineErrors, setLineErrors] = useState([]);
  const [formErrors, setFormErrors] = useState({});
  const [lateWarning, setLateWarning] = useState(false);
  const [editingRequest, setEditingRequest] = useState(null);
  const [linkedBooking, setLinkedBooking] = useState(null);
  const [prefillLoading, setPrefillLoading] = useState(false);

  useEffect(() => {
    async function load() {
      try {
        const [eqSnap, catSnap] = await Promise.all([
          getDocs(query(collection(db, 'equipment'), orderBy('name'))),
          safeGetDoc('settings', 'categories'),
        ]);
        setEquipment(eqSnap.docs.map(d => ({ id: d.id, ...d.data() })));
        setCategories(catSnap?.list || []);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  useEffect(() => onSnapshot(
    query(collection(db, 'equipmentReservations'), where('status', '==', 'active')),
    snapshot => {
      setReservations(snapshot.docs.map(item => ({ id: item.id, ...item.data() })));
      setReservationsReady(true);
      setReservationError(false);
    },
    err => {
      console.error('Could not load equipment reservations:', err);
      setReservationsReady(true);
      setReservationError(true);
    },
  ), []);

  useEffect(() => {
    if (!userProfile?.uid || (!editId && !bookingId)) return;
    let cancelled = false;
    setPrefillLoading(true);
    async function loadPrefill() {
      try {
        if (editId) {
          const snap = await getDoc(doc(db, 'requests', editId));
          if (!snap.exists() || snap.data().userId !== userProfile.uid || snap.data().status !== 'pending') {
            toast.error('Only your pending requests can be edited.');
            navigate('/my-requests', { replace: true });
            return;
          }
          const request = { id: snap.id, ...snap.data() };
          if (cancelled) return;
          setEditingRequest(request);
          setForm(current => ({
            ...current,
            requestDate: request.requestDate || current.requestDate,
            experimentDate: request.experimentDate || '',
            proposedBorrowTime: request.proposedBorrowTime || '08:00',
            duration: DURATION_OPTIONS.includes(request.duration) ? request.duration : 'Custom',
            customDays: /^\d+/.exec(request.duration || '')?.[0] || '',
            expectedReturnDate: request.expectedReturnDate || '',
            expectedReturnTime: request.expectedReturnTime || '12:00',
            teacher: request.teacher || '',
            experiment: request.experiment || '',
          }));
          const savedLines = (request.items || []).map(item => ({
            equipmentId: item.equipmentId || '', name: item.name || '', qtyRequested: Number(item.qtyRequested) || 1,
          }));
          setLines(savedLines.length ? savedLines : [{ ...EMPTY_LINE }]);
          if (request.labBookingId) {
            const bookingSnap = await getDoc(doc(db, 'labBookings', request.labBookingId));
            if (!cancelled && bookingSnap.exists()) setLinkedBooking({ id: bookingSnap.id, ...bookingSnap.data() });
          }
          return;
        }
        const snap = await getDoc(doc(db, 'labBookings', bookingId));
        if (!snap.exists() || snap.data().userId !== userProfile.uid || !['pending', 'approved'].includes(snap.data().status)) {
          toast.error('That laboratory booking cannot be linked to a new equipment request.');
          navigate('/my-lab-bookings', { replace: true });
          return;
        }
        const booking = { id: snap.id, ...snap.data() };
        if (cancelled) return;
        setLinkedBooking(booking);
        setForm(current => ({
          ...current,
          experimentDate: booking.bookingDate,
          proposedBorrowTime: booking.startTime,
          duration: 'Same day',
          expectedReturnDate: booking.bookingDate,
          expectedReturnTime: booking.endTime,
          teacher: booking.teacher || '',
          experiment: booking.purpose || '',
        }));
      } catch (error) {
        console.error('Could not load request prefill:', error);
        toast.error('Could not load the selected request or booking.');
      } finally {
        if (!cancelled) setPrefillLoading(false);
      }
    }
    loadPrefill();
    return () => { cancelled = true; };
  }, [userProfile?.uid, editId, bookingId]);

  async function safeGetDoc(col, id) {
    try {
      const snap = await getDoc(doc(db, col, id));
      return snap.exists() ? snap.data() : null;
    } catch { return null; }
  }

  // Auto-calculate expected return date
  useEffect(() => {
    if (!form.experimentDate) return;
    const days = form.duration === 'Custom'
      ? parseInt(form.customDays) || 0
      : durationToDays(form.duration) || 0;
    if (days > 0) {
      setForm(f => ({ ...f, expectedReturnDate: addDays(f.experimentDate, days) }));
    }
  }, [form.experimentDate, form.duration, form.customDays]);

  // Late warning check
  useEffect(() => {
    if (!form.experimentDate || !form.requestDate) { setLateWarning(false); return; }
    const schoolDays = countSchoolDays(form.requestDate, form.experimentDate);
    setLateWarning(schoolDays < 3);
  }, [form.requestDate, form.experimentDate]);

  // Check if student is restricted
  const restricted = userProfile?.borrowRestrictedUntil && userProfile.borrowRestrictedUntil >= today;

  function setField(k, v) {
    setForm(f => ({ ...f, [k]: v }));
    setFormErrors(e => ({ ...e, [k]: undefined }));
  }

  function addLine() {
    setLines([...lines, { ...EMPTY_LINE }]);
  }

  function removeLine(i) {
    setLines(lines.filter((_, j) => j !== i));
  }

  function setLine(i, k, v) {
    const updated = [...lines];
    if (k === 'equipmentId') {
      const eq = equipment.find(e => e.id === v);
      updated[i] = { ...updated[i], equipmentId: v, name: eq?.name || '', qtyRequested: 1 };
    } else {
      updated[i] = { ...updated[i], [k]: v };
    }
    setLines(updated);
  }

  function getEquipmentAvail(id) {
    return equipment.find(e => e.id === id);
  }

  function getAvailableForWindow(id) {
    const item = getEquipmentAvail(id);
    if (!item) return 0;
    const window = reservationWindow(form);
    if (!window) return item.availableQty || 0;
    const itemReservations = reservations.filter(reservation => reservation.equipmentId === id && reservation.status === 'active');
    const reservedTotal = itemReservations.reduce((sum, reservation) => sum + (Number(reservation.qty) || 0), 0);
    const reservedOverlap = itemReservations
      .filter(reservation => hasReservationOverlap(window, reservation))
      .reduce((sum, reservation) => sum + (Number(reservation.qty) || 0), 0);
    const legacyHeld = Math.max(0, (Number(item.totalQty) || 0) - (Number(item.availableQty) || 0) - reservedTotal);
    return Math.max(0, (Number(item.totalQty) || 0) - reservedOverlap - legacyHeld);
  }

  function validate() {
    const errs = {};
    if (!form.teacher.trim()) errs.teacher = 'Teacher name is required.';
    if (!form.experiment.trim()) errs.experiment = 'Experiment/activity name is required.';
    if (!form.experimentDate) errs.experimentDate = 'Experiment date is required.';
    if (!form.proposedBorrowTime) errs.proposedBorrowTime = 'Proposed borrow time is required.';
    if (!form.expectedReturnDate) errs.expectedReturnDate = 'Expected return date is required.';
    if (form.experimentDate && form.expectedReturnDate && form.expectedReturnDate < form.experimentDate) {
      errs.expectedReturnDate = 'Expected return must be on or after the experiment date.';
    }
    if (!form.expectedReturnTime) errs.expectedReturnTime = 'Expected return time is required.';
    if (form.experimentDate === form.expectedReturnDate && form.proposedBorrowTime && form.expectedReturnTime <= form.proposedBorrowTime) {
      errs.expectedReturnTime = 'Return time must be after the proposed borrow time.';
    }
    const lErrs = lines.map(l => {
      if (!l.equipmentId) return 'Select equipment.';
      const eq = getEquipmentAvail(l.equipmentId);
      if (!eq) return 'Equipment not found.';
      if (!l.qtyRequested || l.qtyRequested < 1) return 'Quantity must be at least 1.';
      if (reservationError) return 'Could not verify whether this equipment is already booked.';
      if (reservationsReady && form.experimentDate && form.expectedReturnDate && Number(l.qtyRequested) > getAvailableForWindow(l.equipmentId)) {
        return `Only ${getAvailableForWindow(l.equipmentId)} available for these dates and times.`;
      }
      return null;
    });
    return { formErrs: errs, lineErrs: lErrs };
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (restricted) return;
    if (!reservationsReady || reservationError) {
      toast.error('Equipment availability could not be verified. Please wait or reload and try again.');
      return;
    }

    const { formErrs, lineErrs } = validate();
    setFormErrors(formErrs);
    setLineErrors(lineErrs);
    if (Object.keys(formErrs).length > 0 || lineErrs.some(Boolean)) return;

    // Check insufficient stock
    const insufficientLine = lines.find(l => {
      const eq = getEquipmentAvail(l.equipmentId);
      return eq && parseInt(l.qtyRequested) > getAvailableForWindow(l.equipmentId);
    });
    if (insufficientLine) {
      toast.error('That equipment is already booked for overlapping dates or times. Reduce the quantity or choose another time.');
      return;
    }

    setSubmitting(true);
    try {
      if (!currentUser) throw new Error('Please sign in again before submitting your request.');

      // Refresh the Firebase claims and profile before writing. This avoids a
      // stale email-verification token or cached LRN/grade causing a rule deny.
      await reload(currentUser);
      if (!currentUser.emailVerified) {
        throw new Error('Verify your email address, then sign out and sign back in before requesting items.');
      }
      await getIdToken(currentUser, true);
      const profileSnap = await getDoc(doc(db, 'users', currentUser.uid));
      if (!profileSnap.exists()) {
        throw new Error('Your student profile is missing. Ask a laboratory administrator to check your account.');
      }
      const currentProfile = profileSnap.data();
      if (currentProfile.role !== 'student') {
        throw new Error('Only student accounts can submit item requests.');
      }
      if (!isValidGradeLevel(currentProfile.gradeLevel)) {
        throw new Error('Your profile must have Grade 11 or Grade 12 set. Ask a laboratory administrator to update it.');
      }
      const currentLrn = String(currentProfile.lrn || '');
      if (!/^\d+$/.test(currentLrn)) {
        throw new Error('Your profile is missing a valid LRN. Ask a laboratory administrator to add it under Settings.');
      }

      const items = lines.map(l => {
        const eq = getEquipmentAvail(l.equipmentId);
        return {
          equipmentId: l.equipmentId,
          name: l.name,
          lab: getEquipmentAvail(l.equipmentId)?.lab || 'Unassigned',
          category: getEquipmentAvail(l.equipmentId)?.category || '',
          qtyRequested: parseInt(l.qtyRequested) || 1,
          qtyReleased: 0,
          qtyReturned: 0,
          qtyDamaged: 0,
          qtyMissing: 0,
          conditionOnReturn: '',
        };
      });

      const requestData = {
        userId: editingRequest?.userId || currentUser.uid,
        borrowerName: editingRequest?.borrowerName || currentProfile.name || userProfile?.name || '',
        studentId: editingRequest?.studentId || currentLrn,
        gradeLevel: editingRequest?.gradeLevel || currentProfile.gradeLevel,
        section: editingRequest?.section ?? currentProfile.section ?? '',
        teacher: form.teacher.trim(),
        experiment: form.experiment.trim(),
        experimentDate: form.experimentDate,
        proposedBorrowTime: form.proposedBorrowTime,
        requestDate: form.requestDate,
        duration: form.duration === 'Custom' ? `${form.customDays} days` : form.duration,
        expectedReturnDate: form.expectedReturnDate,
        expectedReturnTime: form.expectedReturnTime,
        actualReturnDate: null,
        releaseDate: null,
        status: 'pending',
        staffRemarks: '',
        lateRequestFlag: lateWarning,
        items,
        labBookingId: linkedBooking?.id || editingRequest?.labBookingId || '',
        labRoom: linkedBooking?.labRoom || editingRequest?.labRoom || '',
        updatedAt: serverTimestamp(),
      };

      if (editingRequest) {
        await updateDoc(doc(db, 'requests', editingRequest.id), {
          teacher: requestData.teacher,
          experiment: requestData.experiment,
          experimentDate: requestData.experimentDate,
          proposedBorrowTime: requestData.proposedBorrowTime,
          duration: requestData.duration,
          expectedReturnDate: requestData.expectedReturnDate,
          expectedReturnTime: requestData.expectedReturnTime,
          items: requestData.items,
          lateRequestFlag: requestData.lateRequestFlag,
          labBookingId: requestData.labBookingId,
          labRoom: requestData.labRoom,
          studentEditedAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      } else {
        await addDoc(collection(db, 'requests'), {
          ...requestData,
          createdAt: serverTimestamp(),
        });
      }

      toast.success(editingRequest ? 'Pending request updated.' : 'Request submitted successfully!');
      navigate('/my-requests');
    } catch (err) {
      console.error('Item request submission failed:', err?.code || err);
      if (err?.code === 'permission-denied' || err?.code === 'firestore/permission-denied') {
        toast.error('LabTrack could not verify this student profile for the request. Sign out and back in; if it continues, ask an administrator to check the account’s LRN, grade level, and Firestore rules.');
      } else {
        toast.error('Failed to submit: ' + err.message);
      }
    } finally {
      setSubmitting(false);
    }
  }

  if (restricted) {
    return (
      <div className="max-w-xl mx-auto mt-10">
        <div className="card p-6 border-red-200">
          <div className="flex items-start gap-3">
            <AlertTriangle size={24} className="text-red-500 shrink-0 mt-0.5" />
            <div>
              <h2 className="font-semibold text-gray-900 text-lg">Borrowing Restricted</h2>
              <p className="text-sm text-gray-600 mt-1">{userProfile.restrictionReason}</p>
              <p className="text-sm text-gray-500 mt-2">
                Restriction lifts on: <span className="font-semibold text-red-700">{formatDate(userProfile.borrowRestrictedUntil)}</span>
              </p>
              <p className="text-xs text-gray-400 mt-3">Contact the laboratory staff to appeal.</p>
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
          <ClipboardList size={18} strokeWidth={1.8} />
          {editingRequest ? 'Edit Pending Request' : 'Request Item'}
        </div>
        <form onSubmit={handleSubmit} className="p-5 space-y-5">
          {linkedBooking && (
            <div className="rounded-xl border border-sky-200 bg-sky-50 p-3 text-sm text-sky-900" role="status">
              Linked to <strong>{linkedBooking.labRoom}</strong> on <strong>{formatDate(linkedBooking.bookingDate)}</strong>, {linkedBooking.startTime}–{linkedBooking.endTime}. The equipment request still needs its own staff approval.
            </div>
          )}
          {!editingRequest && !linkedBooking && (
            <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900" role="note">
              Availability is checked for your selected time, but equipment is not reserved until staff approve your request. If another request is approved first, staff will contact you about the conflict.
            </div>
          )}
          {lateWarning && (
            <div className="flex items-start gap-2.5 p-3 bg-amber-50 border border-amber-200 rounded-xl">
              <AlertTriangle size={16} className="text-amber-600 shrink-0 mt-0.5" />
              <p className="text-sm text-amber-800">
                The experiment date is less than 3 school days from your request date. This request will be flagged as late.
                Staff may still review and approve it at their discretion.
              </p>
            </div>
          )}

          <div className="flex items-start gap-2.5 p-3 bg-primary-50 border border-primary-100 rounded-xl">
            <Camera size={16} className="text-crimson shrink-0 mt-0.5" />
            <p className="text-sm text-gray-700">
              <span className="font-semibold text-crimson">Photo proof is required when you return this equipment.</span>{' '}
              The laboratory staff will check your photo and approve the return, or flag it if the
              equipment is damaged or not properly cleaned.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="label" htmlFor="equipment-request-date">Date of Request</label>
              <input id="equipment-request-date" type="date" className="input" value={form.requestDate}
                onChange={e => setField('requestDate', e.target.value)} />
            </div>
            <div>
              <label className="label" htmlFor="equipment-borrower">Name of Borrower</label>
              <input id="equipment-borrower" className="input bg-gray-50" value={userProfile?.name || ''} readOnly />
            </div>
            <div>
              <label className="label" htmlFor="equipment-grade-section">Grade Level & Section</label>
              <input id="equipment-grade-section" className="input bg-gray-50"
                value={`${userProfile?.gradeLevel || ''} · ${userProfile?.section || ''}`}
                readOnly />
            </div>
            <div>
              <label className="label" htmlFor="equipment-teacher">Teacher Assigned *</label>
              <input
                id="equipment-teacher"
                className={`input ${formErrors.teacher ? 'input-error' : ''}`}
                placeholder="Teacher's name"
                value={form.teacher}
                onChange={e => setField('teacher', e.target.value)}
              />
              {formErrors.teacher && <p className="text-xs text-red-600 mt-1">{formErrors.teacher}</p>}
            </div>
            <div className="sm:col-span-2">
              <label className="label" htmlFor="equipment-experiment">Experiment / Activity *</label>
              <input
                id="equipment-experiment"
                className={`input ${formErrors.experiment ? 'input-error' : ''}`}
                placeholder="e.g. Photosynthesis"
                value={form.experiment}
                onChange={e => setField('experiment', e.target.value)}
              />
              {formErrors.experiment && <p className="text-xs text-red-600 mt-1">{formErrors.experiment}</p>}
            </div>
            <div>
              <label className="label" htmlFor="equipment-experiment-date">Date of Experiment *</label>
              <input
                id="equipment-experiment-date"
                type="date"
                className={`input ${formErrors.experimentDate ? 'input-error' : ''}`}
                value={form.experimentDate}
                onChange={e => setField('experimentDate', e.target.value)}
              />
              {formErrors.experimentDate && <p className="text-xs text-red-600 mt-1">{formErrors.experimentDate}</p>}
            </div>
            <div>
              <label className="label" htmlFor="equipment-borrow-time">Proposed Borrow Time *</label>
              <input
                id="equipment-borrow-time"
                type="time"
                className={`input ${formErrors.proposedBorrowTime ? 'input-error' : ''}`}
                value={form.proposedBorrowTime}
                onChange={e => setField('proposedBorrowTime', e.target.value)}
              />
              {formErrors.proposedBorrowTime && <p className="text-xs text-red-600 mt-1">{formErrors.proposedBorrowTime}</p>}
            </div>
            <div>
              <label className="label" htmlFor="equipment-duration">Estimated Borrowing Duration</label>
              <select id="equipment-duration" className="input" value={form.duration} onChange={e => setField('duration', e.target.value)}>
                {DURATION_OPTIONS.map(d => <option key={d}>{d}</option>)}
              </select>
            </div>
            {form.duration === 'Custom' && (
              <div>
                <label className="label" htmlFor="equipment-custom-days">Custom Duration (days)</label>
                <input
                  id="equipment-custom-days"
                  type="number" min="1" className="input"
                  value={form.customDays}
                  onChange={e => setField('customDays', e.target.value)}
                  placeholder="e.g. 5"
                />
              </div>
            )}
            <div>
              <label className="label" htmlFor="equipment-return-date">Expected Return Date</label>
              <input
                id="equipment-return-date"
                type="date"
                className={`input ${formErrors.expectedReturnDate ? 'input-error' : ''}`}
                value={form.expectedReturnDate}
                onChange={e => setField('expectedReturnDate', e.target.value)}
              />
              {formErrors.expectedReturnDate && <p className="text-xs text-red-600 mt-1">{formErrors.expectedReturnDate}</p>}
            </div>
            <div>
              <label className="label" htmlFor="equipment-return-time">Expected Return Time *</label>
              <input
                id="equipment-return-time"
                type="time"
                className={`input ${formErrors.expectedReturnTime ? 'input-error' : ''}`}
                value={form.expectedReturnTime}
                onChange={e => setField('expectedReturnTime', e.target.value)}
              />
              {formErrors.expectedReturnTime && <p className="text-xs text-red-600 mt-1">{formErrors.expectedReturnTime}</p>}
            </div>
          </div>

          {/* Equipment lines */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="label mb-0">Items Requested</label>
              <button type="button" onClick={addLine} className="btn-secondary btn-sm">
                <Plus size={14} /> Add Item
              </button>
            </div>
            {reservationError && (
              <p role="alert" className="mb-3 rounded-lg border border-red-200 bg-red-50 p-2 text-xs text-red-700">
                The equipment schedule could not be loaded, so requests are paused until availability can be verified.
              </p>
            )}
            {!reservationsReady && (
              <p className="mb-3 text-xs text-gray-500">Loading equipment booking availability…</p>
            )}
            <div className="space-y-2">
              {lines.map((line, i) => {
                const eq = getEquipmentAvail(line.equipmentId);
                const availableForWindow = eq ? getAvailableForWindow(line.equipmentId) : 0;
                const insufficient = eq && reservationsReady && parseInt(line.qtyRequested) > availableForWindow;
                return (
                  <div key={i} className="flex flex-wrap gap-2 items-start p-3 bg-gray-50 rounded-xl">
                    <div className="flex-[2] min-w-[140px]">
                      <EquipmentPicker
                        equipment={equipment.filter(item => !lines.some((other, otherIndex) => otherIndex !== i && other.equipmentId === item.id))}
                        value={line.equipmentId}
                        onChange={value => setLine(i, 'equipmentId', value)}
                        invalid={!!lineErrors[i]}
                      />
                      {lineErrors[i] && <p className="text-xs text-red-600 mt-1">{lineErrors[i]}</p>}
                    </div>
                    <div className="flex-1 min-w-[80px]">
                      <input
                        type="number" min="1"
                        className={`input text-sm ${insufficient ? 'input-error' : ''}`}
                        value={line.qtyRequested}
                        onChange={e => setLine(i, 'qtyRequested', parseInt(e.target.value) || 1)}
                      />
                    </div>
                    {insufficient && (
                      <div className="w-full flex items-center gap-1.5 text-xs text-red-600">
                        <AlertCircle size={13} />
                        Equipment is booked/borrowed during this window. Available for the selected dates and times: {availableForWindow}.
                      </div>
                    )}
                    {lines.length > 1 && (
                      <button type="button" onClick={() => removeLine(i)} className="btn-ghost btn-sm p-1.5 text-red-400">
                        <Trash2 size={14} />
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          <button
            type="submit"
    disabled={loading || prefillLoading || submitting || lines.some((l, i) => {
              const eq = getEquipmentAvail(l.equipmentId);
              return eq && reservationsReady && parseInt(l.qtyRequested) > getAvailableForWindow(l.equipmentId);
            }) || !reservationsReady || reservationError}
            className="btn-primary w-full justify-center"
          >
            <ClipboardList size={16} />
            {submitting ? (editingRequest ? 'Saving…' : 'Submitting…') : editingRequest ? 'Save Changes' : 'Submit Request'}
          </button>
        </form>
      </div>
    </div>
  );
}
