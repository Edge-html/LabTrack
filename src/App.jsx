import React, { Suspense, lazy } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import { ToastProvider } from './context/ToastContext';
import { NotificationProvider } from './context/NotificationContext';
import { firebaseConfigured, missingVars } from './lib/firebase';

// Load each screen on demand so students do not download admin code up front.
const Login = lazy(() => import('./pages/Login'));
const Register = lazy(() => import('./pages/Register'));
const VerifyEmail = lazy(() => import('./pages/VerifyEmail'));
const AuthAction = lazy(() => import('./pages/AuthAction'));
const Home = lazy(() => import('./pages/Home'));
const Inventory = lazy(() => import('./pages/Inventory'));
const RequestEquipment = lazy(() => import('./pages/RequestEquipment'));
const MyRequests = lazy(() => import('./pages/MyRequests'));
const RequestDetails = lazy(() => import('./pages/RequestDetails'));
const RulesPenalties = lazy(() => import('./pages/RulesPenalties'));
const About = lazy(() => import('./pages/About'));
const LabBooking = lazy(() => import('./pages/LabBooking'));
const MyLabBookings = lazy(() => import('./pages/MyLabBookings'));
const LabSchedule = lazy(() => import('./pages/LabSchedule'));
const ManageRequests = lazy(() => import('./pages/admin/ManageRequests'));
const BorrowingReturns = lazy(() => import('./pages/admin/BorrowingReturns'));
const PenaltiesViolations = lazy(() => import('./pages/admin/PenaltiesViolations'));
const AdminSettings = lazy(() => import('./pages/admin/AdminSettings'));
const ManageLabBookings = lazy(() => import('./pages/admin/ManageLabBookings'));
const Warnings = lazy(() => import('./pages/admin/Warnings'));
const AdminActivity = lazy(() => import('./pages/admin/AdminActivity'));
const Reports = lazy(() => import('./pages/admin/Reports'));

// Guards
import { RequireAuth, RequireAdmin } from './components/RouteGuards';

function FirebaseNotConfigured() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-primary-800 to-navy flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full p-8">
        <div className="text-center mb-6">
          <div className="w-14 h-14 bg-red-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <span className="text-red-500 text-2xl">⚠️</span>
          </div>
          <h1 className="text-xl font-bold text-gray-900">Firebase is not configured</h1>
          <p className="text-gray-500 text-sm mt-2">
            The following environment variables are missing:
          </p>
        </div>
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 mb-6">
          <ul className="space-y-1">
            {missingVars.map(v => (
              <li key={v} className="text-sm font-mono text-red-700">{v}</li>
            ))}
          </ul>
        </div>
        <div className="text-sm text-gray-600 space-y-2">
          <p>To fix this:</p>
          <ol className="list-decimal list-inside space-y-1 text-gray-600">
            <li>Copy <code className="bg-gray-100 px-1.5 py-0.5 rounded text-xs">.env.example</code> to <code className="bg-gray-100 px-1.5 py-0.5 rounded text-xs">.env.local</code></li>
            <li>Fill in your Firebase project credentials</li>
            <li>Restart the development server</li>
          </ol>
        </div>
      </div>
    </div>
  );
}

export default function App() {
  if (!firebaseConfigured) {
    return <FirebaseNotConfigured />;
  }

  return (
    <AuthProvider>
      <ToastProvider>
        <BrowserRouter>
          {/* Notifications derive from live Firestore data; the provider is
              router-aware because the bell navigates on click. */}
          <NotificationProvider>
          <Suspense fallback={<div className="min-h-screen flex items-center justify-center text-sm text-gray-500">Loading page…</div>}>
          <Routes>
            {/* Public routes */}
            <Route path="/login" element={<Login />} />
            <Route path="/register" element={<Register />} />
            <Route path="/verify-email" element={<VerifyEmail />} />
            <Route path="/auth/action" element={<AuthAction />} />

            {/* Protected routes */}
            <Route element={<RequireAuth />}>
              <Route path="/" element={<Home />} />
              <Route path="/inventory" element={<Inventory />} />
              <Route path="/request" element={<RequestEquipment />} />
              <Route path="/my-requests" element={<MyRequests />} />
              <Route path="/requests/:id" element={<RequestDetails />} />
              <Route path="/lab-booking" element={<LabBooking />} />
              <Route path="/my-lab-bookings" element={<MyLabBookings />} />
              <Route path="/lab-schedule" element={<LabSchedule />} />
              <Route path="/rules" element={<RulesPenalties />} />
              <Route path="/about" element={<About />} />

              {/* Admin-only routes */}
              <Route element={<RequireAdmin />}>
                <Route path="/admin/requests" element={<ManageRequests />} />
                <Route path="/admin/borrowing" element={<BorrowingReturns />} />
                <Route path="/admin/lab-bookings" element={<ManageLabBookings />} />
                <Route path="/admin/penalties" element={<PenaltiesViolations />} />
                <Route path="/admin/warnings" element={<Warnings />} />
                <Route path="/admin/settings" element={<AdminSettings />} />
                <Route path="/admin/activity" element={<AdminActivity />} />
                <Route path="/admin/reports" element={<Reports />} />
              </Route>
            </Route>

            {/* Fallback */}
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
          </Suspense>
          </NotificationProvider>
        </BrowserRouter>
      </ToastProvider>
    </AuthProvider>
  );
}
