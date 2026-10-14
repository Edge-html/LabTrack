import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ClipboardList, Plus, Trash2, AlertTriangle, AlertCircle,
  Calendar, User, BookOpen, Clock, Camera,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { db } from '../lib/firebase';
import {
  collection, getDocs, addDoc, serverTimestamp,
  query, orderBy, doc, getDoc,
} from 'firebase/firestore';
import {
  getTodayManila, formatDate, addDays, durationToDays,
  countSchoolDays, DURATION_OPTIONS, isValidGradeLevel,
} from '../lib/helpers';

const EMPTY_LINE = { equipmentId: '', name: '', qtyRequested: 1 };

export default function RequestEquipment() {
  const { userProfile } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();
  const today = getTodayManila();

  const [equipment, setEquipment] = useState([]);
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  const [form, setForm] = useState({
    requestDate: today,
    experimentDate: '',
    duration: '1 day',
    customDays: '',
    expectedReturnDate: '',
    teacher: '',
    experiment: '',
  });
  const [lines, setLines] = useState([{ ...EMPTY_LINE }]);
  const [lineErrors, setLineErrors] = useState([]);
  const [formErrors, setFormErrors] = useState({});
  const [lateWarning, setLateWarning] = useState(false);

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

  function validate() {
    const errs = {};
    if (!form.teacher.trim()) errs.teacher = 'Teacher name is required.';
    if (!form.experiment.trim()) errs.experiment = 'Experiment/activity name is required.';
    if (!form.experimentDate) errs.experimentDate = 'Experiment date is required.';
    if (!form.expectedReturnDate) errs.expectedReturnDate = 'Expected return date is required.';
    const lErrs = lines.map(l => {
      if (!l.equipmentId) return 'Select equipment.';
      const eq = getEquipmentAvail(l.equipmentId);
      if (!eq) return 'Equipment not found.';
      if (!l.qtyRequested || l.qtyRequested < 1) return 'Quantity must be at least 1.';
      return null;
    });
    return { formErrs: errs, lineErrs: lErrs };
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (restricted) return;

    if (!isValidGradeLevel(userProfile?.gradeLevel)) {
      toast.error('Only Grade 11 and Grade 12 students are permitted to submit laboratory requests.');
      return;
    }

    const { formErrs, lineErrs } = validate();
    setFormErrors(formErrs);
    setLineErrors(lineErrs);
    if (Object.keys(formErrs).length > 0 || lineErrs.some(Boolean)) return;

    // Check insufficient stock
    const insufficientLine = lines.find(l => {
      const eq = getEquipmentAvail(l.equipmentId);
      return eq && parseInt(l.qtyRequested) > eq.availableQty;
    });
    if (insufficientLine) {
      toast.error('Please fix insufficient equipment errors before submitting.');
      return;
    }

    setSubmitting(true);
    try {
      const items = lines.map(l => {
        const eq = getEquipmentAvail(l.equipmentId);
        return {
          equipmentId: l.equipmentId,
          name: l.name,
          qtyRequested: parseInt(l.qtyRequested) || 1,
          qtyReleased: 0,
          qtyReturned: 0,
          qtyDamaged: 0,
          qtyMissing: 0,
          conditionOnReturn: '',
        };
      });

      await addDoc(collection(db, 'requests'), {
        userId: userProfile.uid,
        borrowerName: userProfile.name,
        gradeLevel: userProfile.gradeLevel,
        section: userProfile.section,
        teacher: form.teacher.trim(),
        experiment: form.experiment.trim(),
        experimentDate: form.experimentDate,
        requestDate: form.requestDate,
        duration: form.duration === 'Custom' ? `${form.customDays} days` : form.duration,
        expectedReturnDate: form.expectedReturnDate,
        actualReturnDate: null,
        releaseDate: null,
        status: 'pending',
        staffRemarks: '',
        lateRequestFlag: lateWarning,
        items,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      toast.success('Request submitted successfully!');
      navigate('/my-requests');
    } catch (err) {
      toast.error('Failed to submit: ' + err.message);
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
          Request Equipment
        </div>
        <form onSubmit={handleSubmit} className="p-5 space-y-5">
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
              <label className="label">Date of Request</label>
              <input type="date" className="input" value={form.requestDate}
                onChange={e => setField('requestDate', e.target.value)} />
            </div>
            <div>
              <label className="label">Name of Borrower</label>
              <input className="input bg-gray-50" value={userProfile?.name || ''} readOnly />
            </div>
            <div>
              <label className="label">Grade Level & Section</label>
              <input className="input bg-gray-50"
                value={`${userProfile?.gradeLevel || ''} · ${userProfile?.section || ''}`}
                readOnly />
            </div>
            <div>
              <label className="label">Teacher Assigned *</label>
              <input
                className={`input ${formErrors.teacher ? 'input-error' : ''}`}
                placeholder="Teacher's name"
                value={form.teacher}
                onChange={e => setField('teacher', e.target.value)}
              />
              {formErrors.teacher && <p className="text-xs text-red-600 mt-1">{formErrors.teacher}</p>}
            </div>
            <div className="sm:col-span-2">
              <label className="label">Experiment / Activity *</label>
              <input
                className={`input ${formErrors.experiment ? 'input-error' : ''}`}
                placeholder="e.g. Photosynthesis"
                value={form.experiment}
                onChange={e => setField('experiment', e.target.value)}
              />
              {formErrors.experiment && <p className="text-xs text-red-600 mt-1">{formErrors.experiment}</p>}
            </div>
            <div>
              <label className="label">Date of Experiment *</label>
              <input
                type="date"
                className={`input ${formErrors.experimentDate ? 'input-error' : ''}`}
                value={form.experimentDate}
                onChange={e => setField('experimentDate', e.target.value)}
              />
              {formErrors.experimentDate && <p className="text-xs text-red-600 mt-1">{formErrors.experimentDate}</p>}
            </div>
            <div>
              <label className="label">Estimated Borrowing Duration</label>
              <select className="input" value={form.duration} onChange={e => setField('duration', e.target.value)}>
                {DURATION_OPTIONS.map(d => <option key={d}>{d}</option>)}
              </select>
            </div>
            {form.duration === 'Custom' && (
              <div>
                <label className="label">Custom Duration (days)</label>
                <input
                  type="number" min="1" className="input"
                  value={form.customDays}
                  onChange={e => setField('customDays', e.target.value)}
                  placeholder="e.g. 5"
                />
              </div>
            )}
            <div>
              <label className="label">Expected Return Date</label>
              <input
                type="date"
                className={`input ${formErrors.expectedReturnDate ? 'input-error' : ''}`}
                value={form.expectedReturnDate}
                onChange={e => setField('expectedReturnDate', e.target.value)}
              />
              {formErrors.expectedReturnDate && <p className="text-xs text-red-600 mt-1">{formErrors.expectedReturnDate}</p>}
            </div>
          </div>

          {/* Equipment lines */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="label mb-0">Equipment Requested</label>
              <button type="button" onClick={addLine} className="btn-secondary btn-sm">
                <Plus size={14} /> Add Item
              </button>
            </div>
            <div className="space-y-2">
              {lines.map((line, i) => {
                const eq = getEquipmentAvail(line.equipmentId);
                const insufficient = eq && parseInt(line.qtyRequested) > eq.availableQty;
                return (
                  <div key={i} className="flex flex-wrap gap-2 items-start p-3 bg-gray-50 rounded-xl">
                    <div className="flex-[2] min-w-[140px]">
                      <select
                        className={`input text-sm ${lineErrors[i] ? 'input-error' : ''}`}
                        value={line.equipmentId}
                        onChange={e => setLine(i, 'equipmentId', e.target.value)}
                      >
                        <option value="">Select equipment</option>
                        {equipment.map(e => (
                          <option key={e.id} value={e.id}>
                            {e.name} (avail: {e.availableQty})
                          </option>
                        ))}
                      </select>
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
                        Insufficient equipment available. (Available: {eq.availableQty})
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
            disabled={submitting || lines.some((l, i) => {
              const eq = getEquipmentAvail(l.equipmentId);
              return eq && parseInt(l.qtyRequested) > eq.availableQty;
            })}
            className="btn-primary w-full justify-center"
          >
            <ClipboardList size={16} />
            {submitting ? 'Submitting…' : 'Submit Request'}
          </button>
        </form>
      </div>
    </div>
  );
}
