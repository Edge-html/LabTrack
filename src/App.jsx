import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import { ToastProvider } from './context/ToastContext';
import { firebaseConfigured, missingVars } from './lib/firebase';

// Pages
import Login from './pages/Login';
import Register from './pages/Register';
import Home from './pages/Home';
import Inventory from './pages/Inventory';
import RequestEquipment from './pages/RequestEquipment';
import MyRequests from './pages/MyRequests';
import RequestDetails from './pages/RequestDetails';
import RulesPenalties from './pages/RulesPenalties';
import About from './pages/About';
import LabBooking from './pages/LabBooking';
import MyLabBookings from './pages/MyLabBookings';

// Admin pages
import ManageRequests from './pages/admin/ManageRequests';
import BorrowingReturns from './pages/admin/BorrowingReturns';
import PenaltiesViolations from './pages/admin/PenaltiesViolations';
import AdminSettings from './pages/admin/AdminSettings';
import ManageLabBookings from './pages/admin/ManageLabBookings';
import Warnings from './pages/admin/Warnings';

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
          <Routes>
            {/* Public routes */}
            <Route path="/login" element={<Login />} />
            <Route path="/register" element={<Register />} />

            {/* Protected routes */}
            <Route element={<RequireAuth />}>
              <Route path="/" element={<Home />} />
              <Route path="/inventory" element={<Inventory />} />
              <Route path="/request" element={<RequestEquipment />} />
              <Route path="/my-requests" element={<MyRequests />} />
              <Route path="/requests/:id" element={<RequestDetails />} />
              <Route path="/lab-booking" element={<LabBooking />} />
              <Route path="/my-lab-bookings" element={<MyLabBookings />} />
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
              </Route>
            </Route>

            {/* Fallback */}
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </BrowserRouter>
      </ToastProvider>
    </AuthProvider>
  );
}
