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
  const [notifCounts, setNotifCounts] = useState({});

  useEffect(() => {
    if (!userProfile || !db) return;

    // Each stream contributes its own count. The header bell shows their sum;
    // the sidebar shows the individual counts against each admin section.
    const sources = isAdmin
      ? [
          ['pendingRequests', query(collection(db, 'requests'), where('status', '==', 'pending'))],
          ['returnProofs', query(collection(db, 'requests'), where('status', '==', 'return_submitted'))],
          ['labBookings', query(collection(db, 'labBookings'), where('status', '==', 'pending'))],
        ]
      : [
          ['toCollect', query(collection(db, 'requests'), where('userId', '==', userProfile.uid), where('status', '==', 'approved'))],
          ['returnAction', query(collection(db, 'requests'), where('userId', '==', userProfile.uid), where('status', '==', 'return_flagged'))],
          ['labAction', query(collection(db, 'labBookings'), where('userId', '==', userProfile.uid), where('status', 'in', ['approved', 'cancelled']))],
        ];

    const unsubs = sources.map(([key, q]) =>
      onSnapshot(q, (snap) => {
        setNotifCounts(prev => (prev[key] === snap.size ? prev : { ...prev, [key]: snap.size }));
      }, () => {})
    );

    return () => unsubs.forEach(u => u());
  }, [userProfile, isAdmin]);

  const notifCount = Object.values(notifCounts).reduce((a, b) => a + b, 0);

  return (
    <div className="relative flex h-screen overflow-hidden">
      <Sidebar
        mobileOpen={mobileOpen}
        onClose={() => setMobileOpen(false)}
        notifCounts={notifCounts}
      />
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden relative z-10">
        <Header onMenuClick={() => setMobileOpen(true)} notifCount={notifCount} />
        <main
          className="flex-1 overflow-y-auto p-4 md:p-6"
          style={{
            backgroundImage: `linear-gradient(rgba(252, 251, 247, 0.85), rgba(252, 251, 247, 0.85)), url('/images/lab-pics4.jpg')`,
            backgroundSize: 'cover',
            backgroundPosition: 'center',
            backgroundRepeat: 'no-repeat',
            backgroundAttachment: 'local'
          }}
        >
          <Outlet />
        </main>
      </div>
    </div>
  );
}
