import React, { useState, useEffect } from 'react';
import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { Sidebar, Header } from './Layout';
import { PageLoader } from './LoadingSpinner';
import { collection, query, where, onSnapshot } from 'firebase/firestore';
import { db } from '../lib/firebase';
import labPics4 from '../assets/lab-pics4.jpg';

export function RequireAuth() {
  const { currentUser, loading } = useAuth();
  const location = useLocation();
  if (loading) return <PageLoader />;
  if (!currentUser) return <Navigate to="/login" state={{ from: location }} replace />;
  return <AppShell />;
}

export function RequireAdmin() {
  const { isAdmin, loading, currentUser } = useAuth();
  const location = useLocation();
  if (loading) return <PageLoader />;
  if (!currentUser) return <Navigate to="/login" state={{ from: location }} replace />;
  if (!isAdmin) return <Navigate to="/" replace />;
  return <Outlet />;
}

function AppShell() {
  const { userProfile, isAdmin } = useAuth();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [notifCount, setNotifCount] = useState(0);

  useEffect(() => {
    if (!userProfile || !db) return;
    let q;
    if (isAdmin) {
      q = query(collection(db, 'requests'), where('status', '==', 'pending'));
    } else {
      q = query(
        collection(db, 'requests'),
        where('userId', '==', userProfile.uid),
        where('status', '==', 'approved')
      );
    }
    const unsub = onSnapshot(q, (snap) => {
      setNotifCount(snap.size);
    }, () => {});
    return unsub;
  }, [userProfile, isAdmin]);

  return (
    <div className="relative flex h-screen overflow-hidden bg-cream">
      {/* Full-page fitted background image using lab-pics4 */}
      <div
        className="fixed inset-0 pointer-events-none lg:left-56 z-0 overflow-hidden"
        aria-hidden="true"
      >
        <img
          src={labPics4}
          alt=""
          className="w-full h-full object-cover opacity-[0.09] select-none pointer-events-none filter saturate-50"
        />
        <div className="absolute inset-0 bg-cream/70" />
      </div>

      <Sidebar mobileOpen={mobileOpen} onClose={() => setMobileOpen(false)} />
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden relative z-10">
        <Header onMenuClick={() => setMobileOpen(true)} notifCount={notifCount} />
        <main className="flex-1 overflow-y-auto p-4 md:p-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
