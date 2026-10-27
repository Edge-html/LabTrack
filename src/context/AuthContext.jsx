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
    try {
      await sendEmailVerification(cred.user, { url: `${window.location.origin}/verify-email` });
    } catch (error) {
      verificationSent = false;
      console.error('Could not send the first verification email:', error);
    }
    return { verificationSent };
  }

  async function login(email, password) {
    await signInWithEmailAndPassword(auth, email, password);
  }

  async function logout() {
    await signOut(auth);
    setUserProfile(null);
  }

  async function resetPassword(email) {
    await sendPasswordResetEmail(auth, email, {
      url: `${window.location.origin}/login?passwordReset=complete`,
      handleCodeInApp: false,
    });
  }

  async function resendVerificationEmail() {
    if (!auth.currentUser) throw new Error('Sign in first to request a verification email.');
    await sendEmailVerification(auth.currentUser, { url: `${window.location.origin}/verify-email` });
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
