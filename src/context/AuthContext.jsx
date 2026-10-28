import React, { createContext, useContext, useEffect, useState } from 'react';
import {
  onAuthStateChanged,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  sendPasswordResetEmail,
  sendEmailVerification,
  deleteUser,
  reload,
  getIdToken,
} from 'firebase/auth';
import { doc, getDoc, serverTimestamp, writeBatch } from 'firebase/firestore';
import { auth, db, firebaseConfigured } from '../lib/firebase';
import { parseFirebaseError, isValidGradeLevel } from '../lib/helpers';

const AuthContext = createContext(null);
const AUTO_VERIFY_COOLDOWN_MS = 10 * 60 * 1000;
const verificationAttemptsInMemory = new Map();

function verificationAttemptKey(uid) {
  return `labtrack:verification-attempt:${uid}`;
}

function hasRecentVerificationAttempt(uid) {
  const inMemoryTime = verificationAttemptsInMemory.get(uid) || 0;
  try {
    const attemptedAt = Number(localStorage.getItem(verificationAttemptKey(uid)) || 0);
    const latestAttempt = Math.max(attemptedAt, inMemoryTime);
    return latestAttempt > 0 && Date.now() - latestAttempt < AUTO_VERIFY_COOLDOWN_MS;
  } catch {
    return inMemoryTime > 0 && Date.now() - inMemoryTime < AUTO_VERIFY_COOLDOWN_MS;
  }
}

function recordVerificationAttempt(uid) {
  const attemptedAt = Date.now();
  verificationAttemptsInMemory.set(uid, attemptedAt);
  try {
    localStorage.setItem(verificationAttemptKey(uid), String(attemptedAt));
  } catch {
    // Storage may be disabled; Firebase remains the source of truth.
  }
}

async function sendVerificationWithFallback(user) {
  try {
    const idToken = await getIdToken(user);
    const response = await fetch('/api/auth/send-verification', {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + idToken },
    });
    const payload = await response.json().catch(() => ({}));

    if (response.ok && payload.sent) {
      return { returnsToApp: true, delivery: 'labtrack' };
    }
    if (response.ok && payload.alreadyVerified) {
      return { returnsToApp: true, delivery: 'labtrack', alreadyVerified: true };
    }
    if (response.status === 429) {
      const error = new Error(payload.message || 'Please wait before requesting another verification email.');
      error.code = 'auth/too-many-requests';
      throw error;
    }
    console.warn('LabTrack email delivery is not ready; falling back to Firebase email delivery:', payload.code || response.status);
  } catch (error) {
    if (error?.code === 'auth/too-many-requests') throw error;
    console.warn('LabTrack email delivery is unavailable; falling back to Firebase email delivery:', error?.message || error);
  }

  try {
    await sendEmailVerification(user, { url: `${window.location.origin}/verify-email` });
    return { returnsToApp: true, delivery: 'firebase' };
  } catch (error) {
    if (error?.code !== 'auth/unauthorized-continue-uri') throw error;
    console.warn('Verification redirect domain is not authorized; sending a Firebase default action link.');
    await sendEmailVerification(user);
    return { returnsToApp: false, delivery: 'firebase' };
  }
}

async function sendPasswordResetWithFallback(email) {
  try {
    await sendPasswordResetEmail(auth, email, {
      url: `${window.location.origin}/login?passwordReset=complete`,
      handleCodeInApp: false,
    });
    return true;
  } catch (error) {
    if (error?.code !== 'auth/unauthorized-continue-uri') throw error;
    console.warn('Password-reset redirect domain is not authorized; sending a Firebase default action link.');
    await sendPasswordResetEmail(auth, email);
    return false;
  }
}

export function AuthProvider({ children }) {
  const [currentUser, setCurrentUser] = useState(null);
  const [userProfile, setUserProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [, setAuthRevision] = useState(0);

  useEffect(() => {
    if (!firebaseConfigured) {
      setLoading(false);
      return;
    }
    const unsub = onAuthStateChanged(auth, async (user) => {
      setCurrentUser(user);
      if (user) {
        try {
          const snap = await getDoc(doc(db, 'users', user.uid));
          if (snap.exists()) {
            setUserProfile({ uid: user.uid, ...snap.data() });
          } else {
            setUserProfile(null);
          }
        } catch {
          setUserProfile(null);
        }
      } else {
        setUserProfile(null);
      }
      setLoading(false);
    });
    return unsub;
  }, []);

  async function register({ name, email, password, gradeLevel, section, lrn }) {
    if (!isValidGradeLevel(gradeLevel)) {
      throw new Error('Only Grade 11 and Grade 12 students are permitted to register.');
    }
    const normalizedLrn = String(lrn || '').replace(/\D/g, '');
    if (!/^\d{12}$/.test(normalizedLrn)) throw new Error('LRN must contain exactly 12 digits.');
    const cred = await createUserWithEmailAndPassword(auth, email, password);
    const uid = cred.user.uid;
    const profile = {
      name,
      email,
      lrn: normalizedLrn,
      role: 'student',
      gradeLevel,
      section,
      createdAt: serverTimestamp(),
    };
    try {
      const batch = writeBatch(db);
      batch.set(doc(db, 'users', uid), profile);
      // Create-only rules on this document make the LRN unique atomically.
      batch.set(doc(db, 'lrnRegistry', normalizedLrn), { uid, lrn: normalizedLrn, createdAt: serverTimestamp() });
      await batch.commit();
    } catch (error) {
      // Do not leave an Auth account behind when its profile/LRN could not be claimed.
      try { await deleteUser(cred.user); } catch { /* account cleanup is best effort */ }
      throw error;
    }

    setCurrentUser(cred.user);
    const profileSnap = await getDoc(doc(db, 'users', uid));
    setUserProfile({ uid, ...profileSnap.data() });
    let verificationSent = true;
    let verificationReturnsToApp = true;
    let verificationDelivery = null;
    try {
      const sendResult = await sendVerificationWithFallback(cred.user);
      verificationReturnsToApp = sendResult.returnsToApp;
      verificationDelivery = sendResult.delivery;
    } catch (error) {
      verificationSent = false;
      console.error('Could not send the first verification email:', error);
    }
    return { verificationSent, verificationReturnsToApp, verificationDelivery };
  }

  async function login(email, password) {
    const credential = await signInWithEmailAndPassword(auth, email, password);
    const user = credential.user;
    setCurrentUser(user);

    // Admin access is granted by the protected Firestore role, not by email address.
    let role = null;
    try {
      const profile = await getDoc(doc(db, 'users', user.uid));
      if (profile.exists()) {
        const data = profile.data();
        role = data.role;
        setUserProfile({ uid: user.uid, ...data });
      } else {
        setUserProfile(null);
      }
    } catch (error) {
      console.error('Could not load the signed-in user profile:', error);
    }
    if (user.emailVerified) return { needsVerification: false };
    if (role === 'admin') return { needsVerification: false, isAdmin: true };

    if (hasRecentVerificationAttempt(user.uid)) {
      return {
        needsVerification: true,
        verificationSent: null,
        verificationCooldown: true,
      };
    }

    // Record before sending so repeat logins do not hammer Firebase if it fails.
    recordVerificationAttempt(user.uid);
    try {
      const sendResult = await sendVerificationWithFallback(user);
      if (sendResult.alreadyVerified) {
        await reload(user);
        if (user.emailVerified) return { needsVerification: false };
      }
      return {
        needsVerification: true,
        verificationSent: !sendResult.alreadyVerified,
        verificationReturnsToApp: sendResult.returnsToApp,
        verificationDelivery: sendResult.delivery,
        alreadyVerified: sendResult.alreadyVerified,
      };
    } catch (error) {
      console.error('Could not send a verification email during sign-in:', error);
      return {
        needsVerification: true,
        verificationSent: false,
        verificationError: parseFirebaseError(error),
      };
    }
  }

  async function logout() {
    await signOut(auth);
    setUserProfile(null);
  }

  async function resetPassword(email) {
    const returnsToApp = await sendPasswordResetWithFallback(email);
    return { returnsToApp };
  }

  async function resendVerificationEmail() {
    if (!auth.currentUser) throw new Error('Sign in first to request a verification email.');
    if (userProfile?.role === 'admin') return { skipped: true };
    recordVerificationAttempt(auth.currentUser.uid);
    return sendVerificationWithFallback(auth.currentUser);
  }

  async function refreshAuthUser() {
    if (!auth.currentUser) return false;
    await reload(auth.currentUser);
    await getIdToken(auth.currentUser, true);
    setAuthRevision(revision => revision + 1);
    return auth.currentUser.emailVerified;
  }

  async function refreshProfile() {
    if (!currentUser) return;
    const snap = await getDoc(doc(db, 'users', currentUser.uid));
    if (snap.exists()) {
      setUserProfile({ uid: currentUser.uid, ...snap.data() });
    }
  }

  const isAdmin = userProfile?.role === 'admin';
  const isStudent = userProfile?.role === 'student';

  return (
    <AuthContext.Provider value={{
      currentUser,
      userProfile,
      loading,
      isAdmin,
      isStudent,
      register,
      login,
      logout,
      resetPassword,
      resendVerificationEmail,
      refreshAuthUser,
      refreshProfile,
      parseFirebaseError,
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
