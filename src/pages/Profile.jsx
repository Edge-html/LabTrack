import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { CheckCircle2, Save, UserRound } from 'lucide-react';
import { collection, doc, serverTimestamp, writeBatch } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { GRADE_LEVELS, isValidGradeLevel } from '../lib/helpers';

function gradeOption(value) {
  if (value === '11' || value === 'Grade 11') return 'Grade 11';
  if (value === '12' || value === 'Grade 12') return 'Grade 12';
  return '';
}

export default function Profile() {
  const { currentUser, userProfile, refreshProfile, isAdmin } = useAuth();
  const toast = useToast();
  const isStudent = userProfile?.role === 'student';
  const savedLrn = String(userProfile?.lrn || '');
  const canAddLrn = isStudent && !savedLrn;
  const [form, setForm] = useState({ name: '', lrn: '', gradeLevel: '', section: '' });
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    setForm({
      name: userProfile?.name || '',
      lrn: savedLrn,
      gradeLevel: gradeOption(userProfile?.gradeLevel),
      section: userProfile?.section || '',
    });
  }, [userProfile?.name, savedLrn, userProfile?.gradeLevel, userProfile?.section]);

  function setField(key, value) {
    setForm(current => ({ ...current, [key]: value }));
    setSaved(false);
  }

  async function handleSubmit(event) {
    event.preventDefault();
    if (!currentUser || !userProfile) return;
    if (!form.name.trim()) {
      toast.error('Enter your full name.');
      return;
    }

    if (isStudent) {
      if (!isValidGradeLevel(form.gradeLevel)) {
        toast.error('Choose Grade 11 or Grade 12.');
        return;
      }
      if (!form.section.trim()) {
        toast.error('Enter your section.');
        return;
      }
      if (!/^\d+$/.test(form.lrn.trim())) {
        toast.error('Enter your LRN using digits only.');
        return;
      }
      if (savedLrn && form.lrn.trim() !== savedLrn) {
        toast.error('An assigned LRN cannot be changed here. Contact a laboratory administrator to correct it.');
        return;
      }
    }

    setSaving(true);
    try {
      const batch = writeBatch(db);
      const profilePatch = {
        name: form.name.trim(),
        updatedAt: serverTimestamp(),
      };

      if (isStudent) {
        profilePatch.gradeLevel = form.gradeLevel;
        profilePatch.section = form.section.trim();
        if (canAddLrn) profilePatch.lrn = form.lrn.trim();
      }

      batch.update(doc(db, 'users', currentUser.uid), profilePatch);
      if (canAddLrn) {
        const registryRef = doc(collection(db, 'lrnRegistry'), form.lrn.trim());
        batch.set(registryRef, {
          uid: currentUser.uid,
          lrn: form.lrn.trim(),
          createdAt: serverTimestamp(),
        });
      }

      await batch.commit();
      await refreshProfile();
      setSaved(true);
      toast.success('Profile updated. You can submit your item request now.');
    } catch (error) {
      console.error('Profile update failed:', error?.code || error);
      if (error?.code === 'permission-denied' || error?.code === 'firestore/permission-denied') {
        toast.error(canAddLrn
          ? 'That LRN may already be assigned, or the latest profile rules are not deployed. Check the number and ask an administrator for help if it still fails.'
          : 'Your profile could not be updated. Ask an administrator to check your account and the Firestore rules.');
      } else {
        toast.error(`Could not save your profile: ${error.message}`);
      }
    } finally {
      setSaving(false);
    }
  }

  if (!isStudent && !isAdmin) {
    return <div className="mx-auto mt-8 max-w-xl card p-6 text-center text-sm text-gray-600">Your account cannot edit a LabTrack profile.</div>;
  }

  return (
    <div className="mx-auto max-w-2xl space-y-4 animate-fade-in">
      <section className="card">
        <div className="card-header"><UserRound size={18} /> My Profile</div>
        <div className="p-5">
          <p className="mb-5 text-sm text-gray-600">
            Keep these details current. Your name, LRN, grade, and section are used to submit laboratory requests.
          </p>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="label" htmlFor="profile-name">Full name *</label>
              <input id="profile-name" className="input" autoComplete="name" value={form.name}
                onChange={event => setField('name', event.target.value)} maxLength={100} required />
            </div>
            <div>
              <label className="label" htmlFor="profile-email">Email address</label>
              <input id="profile-email" className="input bg-gray-50" value={currentUser?.email || ''} readOnly />
              <p className="mt-1 text-xs text-gray-500">Email changes are managed through account verification.</p>
            </div>
            {isStudent && (
              <>
                <div>
                  <label className="label" htmlFor="profile-lrn">LRN / Student ID *</label>
                  <input id="profile-lrn" className="input font-mono" inputMode="numeric" autoComplete="off"
                    value={form.lrn} onChange={event => setField('lrn', event.target.value.replace(/\D/g, ''))}
                    readOnly={!canAddLrn} required />
                  <p className="mt-1 text-xs text-gray-500">
                    {canAddLrn
                      ? 'Enter your LRN. LabTrack checks that it is not already assigned to another student.'
                      : /^\d+$/.test(savedLrn)
                        ? 'This LRN is linked to your account. Contact a laboratory administrator if it needs correction.'
                        : 'Ask a laboratory administrator to correct your existing LRN entry.'}
                  </p>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="label" htmlFor="profile-grade">Grade level *</label>
                    <select id="profile-grade" className="input" value={form.gradeLevel}
                      onChange={event => setField('gradeLevel', event.target.value)} required>
                      <option value="">Choose grade</option>
                      {GRADE_LEVELS.map(grade => <option key={grade} value={grade}>{grade}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="label" htmlFor="profile-section">Section *</label>
                    <input id="profile-section" className="input" value={form.section}
                      onChange={event => setField('section', event.target.value)} maxLength={80} required />
                  </div>
                </div>
              </>
            )}
            {saved && (
              <p className="flex items-center gap-2 rounded-lg border border-green-200 bg-green-50 p-3 text-sm text-green-800" role="status">
                <CheckCircle2 size={16} /> Your profile is up to date.
              </p>
            )}
            <div className="flex flex-wrap gap-2">
              <button type="submit" disabled={saving} className="btn-primary">
                <Save size={15} /> {saving ? 'Saving…' : 'Save Profile'}
              </button>
              {isStudent && <Link to="/request" className="btn-secondary">Go to Request Item</Link>}
            </div>
          </form>
        </div>
      </section>
    </div>
  );
}
