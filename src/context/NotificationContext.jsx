import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import {
  collection, query, where, onSnapshot, doc, updateDoc, limit,
} from 'firebase/firestore';
import { db } from '../lib/firebase';
import { useAuth } from './AuthContext';
import {
  buildAdminNotifications,
  buildStudentNotifications,
  buildCounts,
  isUnread,
  msOf,
} from '../lib/notifications';

/**
 * Every notification in LabTrack is derived from live Firestore data, so this
 * provider is the single place that subscribes to the collections behind them.
 * It also owns the read watermark stored on the user document
 * (`notifSeenAt`) — one field, no per-item state, and it keeps the sidebar
 * badges and the bell consistent with each other.
 *
 * Queries are kept to single-field equality (plus one existing composite for
 * a student's own requests) so no new Firestore indexes are required.
 */

/** Caps each admin queue listener so a busy school cannot blow up the tab. */
const ADMIN_QUEUE_LIMIT = 100;

/** A student's own history is small; this bounds it anyway. */
const STUDENT_REQUEST_LIMIT = 50;

const NotificationContext = createContext(null);

export function NotificationProvider({ children }) {
  const { userProfile, isAdmin } = useAuth();
  const uid = userProfile?.uid || null;

  const [data, setData] = useState({
    requests: [], bookings: [], warnings: [], penalties: [],
    pendingRequests: [], returnProofs: [], overdueReturns: [], flaggedReturns: [], pendingBookings: [],
  });
  const [seenAt, setSeenAt] = useState(0);
  const [clockNow, setClockNow] = useState(() => Date.now());

  useEffect(() => {
    const timer = setInterval(() => setClockNow(Date.now()), 60_000);
    return () => clearInterval(timer);
  }, []);

  /* ── live sources ─────────────────────────────────────────────────────── */
  useEffect(() => {
    if (!uid || !db) {
      setData({
        requests: [], bookings: [], warnings: [], penalties: [],
        pendingRequests: [], returnProofs: [], overdueReturns: [], flaggedReturns: [], pendingBookings: [],
      });
      return;
    }

    const empty = () => {};
    const mine = { userId: uid };
    const unsubs = [];

    if (isAdmin) {
      // Equality-only queries: Firestore serves these from its automatic
      // single-field indexes, so nothing new has to be deployed.
      unsubs.push(
        onSnapshot(query(collection(db, 'requests'), where('status', '==', 'pending'), limit(ADMIN_QUEUE_LIMIT)),
          snap => patch(setData, 'pendingRequests', snap.docs.map(d => d.data())),
          empty),
        onSnapshot(query(collection(db, 'requests'), where('status', '==', 'return_submitted'), limit(ADMIN_QUEUE_LIMIT)),
          snap => patch(setData, 'returnProofs', snap.docs.map(d => d.data())),
          empty),
        onSnapshot(query(collection(db, 'requests'), where('status', 'in', ['borrowed', 'return_submitted', 'return_flagged']), limit(ADMIN_QUEUE_LIMIT)),
          snap => patch(setData, 'overdueReturns', snap.docs.map(d => d.data())),
          empty),
        onSnapshot(query(collection(db, 'requests'), where('status', '==', 'return_flagged'), limit(ADMIN_QUEUE_LIMIT)),
          snap => patch(setData, 'flaggedReturns', snap.docs.map(d => d.data())),
          empty),
        onSnapshot(query(collection(db, 'labBookings'), where('status', '==', 'pending'), limit(ADMIN_QUEUE_LIMIT)),
          snap => patch(setData, 'pendingBookings', snap.docs.map(d => d.data())),
          empty),
      );
    } else {
      unsubs.push(
        onSnapshot(query(collection(db, 'requests'), where('userId', '==', uid), limit(STUDENT_REQUEST_LIMIT)),
          snap => patch(setData, 'requests', snap.docs.map(d => ({ id: d.id, ...d.data() }))),
          empty),
        onSnapshot(query(collection(db, 'labBookings'), where('userId', '==', uid)),
          snap => patch(setData, 'bookings', snap.docs.map(d => ({ id: d.id, ...d.data() }))),
          empty),
        onSnapshot(query(collection(db, 'warnings'), where('userId', '==', uid)),
          snap => patch(setData, 'warnings', snap.docs.map(d => ({ id: d.id, ...d.data() }))),
          empty),
        onSnapshot(query(collection(db, 'penalties'), where('userId', '==', uid)),
          snap => patch(setData, 'penalties', snap.docs.map(d => ({ id: d.id, ...d.data() }))),
          empty),
      );
    }

    return () => unsubs.forEach(u => u());
  }, [uid, isAdmin]);

  /* ── read watermark ───────────────────────────────────────────────────── */
  useEffect(() => {
    if (!uid || !db) {
      setSeenAt(0);
      return;
    }
    // A missing user document must not block the panel; fall back to 0.
    const unsub = onSnapshot(
      doc(db, 'users', uid),
      snap => setSeenAt(snap.exists() ? msOf(snap.data().notifSeenAt) : 0),
      () => setSeenAt(0),
    );
    return () => unsub();
  }, [uid]);

  /* ── derived ──────────────────────────────────────────────────────────── */
  const notifications = useMemo(
    () => (isAdmin ? buildAdminNotifications(data, clockNow) : buildStudentNotifications(data, clockNow)),
    [data, isAdmin, clockNow],
  );

  const unreadCount = useMemo(
    () => notifications.reduce((total, n) => total + (isUnread(n, seenAt) ? 1 : 0), 0),
    [notifications, seenAt],
  );

  const counts = useMemo(() => buildCounts({ isAdmin, data }), [isAdmin, data]);

  /**
   * Mark one notification (and anything older) as read. Clicking a single
   * notification is precise; "mark all" is a separate, deliberate action.
   */
  function markSeen(at) {
    const stamp = Math.max(msOf(at), seenAt);
    setSeenAt(stamp);
    if (uid) updateDoc(doc(db, 'users', uid), { notifSeenAt: stamp }).catch(() => {});
  }

  function markAllRead() {
    const stamp = Date.now();
    setSeenAt(stamp);
    if (uid) updateDoc(doc(db, 'users', uid), { notifSeenAt: stamp }).catch(() => {});
  }

  const value = useMemo(
    () => ({
      notifications: notifications.map(n => ({ ...n, unread: isUnread(n, seenAt) })),
      unreadCount,
      counts,
      markSeen,
      markAllRead,
      ready: !!uid,
    }),
    // markSeen/markAllRead only depend on uid + seenAt.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [notifications, unreadCount, counts, seenAt, uid],
  );

  return <NotificationContext.Provider value={value}>{children}</NotificationContext.Provider>;
}

/** Merge one collection's documents into state without touching the others. */
function patch(setData, key, docs) {
  setData(prev => (prev[key] === docs ? prev : { ...prev, [key]: docs }));
}

export function useNotifications() {
  const ctx = useContext(NotificationContext);
  if (!ctx) throw new Error('useNotifications must be used within NotificationProvider');
  return ctx;
}
