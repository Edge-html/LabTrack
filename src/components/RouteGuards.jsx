import React, { useState } from 'react';
import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useNotifications } from '../context/NotificationContext';
import { Sidebar, Header } from './Layout';
import { PageLoader } from './LoadingSpinner';
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
  const [mobileOpen, setMobileOpen] = useState(false);
  // One set of subscriptions feeds both the sidebar badges and the bell, so the
  // two can never disagree.
  const { counts } = useNotifications();

  return (
    <div className="relative flex h-screen overflow-hidden">
      <Sidebar
        mobileOpen={mobileOpen}
        onClose={() => setMobileOpen(false)}
        notifCounts={counts}
      />
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden relative z-10">
        <Header onMenuClick={() => setMobileOpen(true)} />
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
