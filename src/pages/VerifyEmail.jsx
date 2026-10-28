import React, { useState } from 'react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { MailCheck, RefreshCw, LogOut } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';

export default function VerifyEmail() {
  const { currentUser, isAdmin, refreshAuthUser, resendVerificationEmail, logout } = useAuth();
  const toast = useToast();
  const location = useLocation();
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  const [verified, setVerified] = useState(false);
  const [error, setError] = useState(location.state?.verificationError || '');

  if (!currentUser) return <Navigate to="/login" replace />;
  if (currentUser.emailVerified || isAdmin || verified) return <Navigate to="/" replace />;

  async function checkVerification() {
    setBusy(true);
    setError('');
    try {
      const isVerified = await refreshAuthUser();
      if (isVerified) {
        setVerified(true);
        toast.success('Email verified. Welcome to LabTrack!');
        navigate('/', { replace: true });
      } else {
        setError('Your email is not verified yet. Open the link in your inbox, then try again.');
      }
    } catch (err) {
      setError(err.message || 'Could not check verification status. Please try again.');
    } finally {
      setBusy(false);
    }
  }

  async function resend() {
    setBusy(true);
    setError('');
    try {
      const result = await resendVerificationEmail();
      toast.success(result?.returnsToApp === false
        ? 'Verification link sent. After confirming it on Firebase’s page, return here and check your verification.'
        : 'A new verification link has been sent.');
    } catch (err) {
      setError(err.message || 'Could not send the verification email.');
    } finally {
      setBusy(false);
    }
  }

  async function signOut() {
    await logout();
    navigate('/login', { replace: true });
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-primary-800 to-navy flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-7 sm:p-9 text-center">
        <div className="w-14 h-14 rounded-2xl bg-blue-50 text-blue-700 flex items-center justify-center mx-auto mb-4">
          <MailCheck size={28} />
        </div>
        <h1 className="text-xl font-bold text-gray-900">Verify your email</h1>
        <p className="text-sm text-gray-600 mt-2">
          {location.state?.verificationSent === true
            ? 'A verification link was sent to '
            : location.state?.verificationSent === false
              ? 'We could not send a verification link to '
              : location.state?.verificationCooldown
                ? 'A recent verification email was already requested for '
                : 'Your email is not verified yet. Request a verification link for '}
          <strong>{currentUser.email}</strong>. Verify it before using LabTrack.
        </p>
        {location.state?.verificationReturnsToApp === false && (
          <p className="mt-3 text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-lg p-2.5">
            The link will open Firebase’s verification page. After confirming, return to this tab and choose “I have verified my email.” Add this website’s domain to Firebase Authentication’s authorized domains to enable the automatic return link.
          </p>
        )}
        {error && <p role="alert" className="mt-4 p-3 rounded-xl bg-red-50 border border-red-200 text-sm text-red-700">{error}</p>}
        <div className="mt-6 space-y-2">
          <button onClick={checkVerification} disabled={busy} className="btn-primary w-full justify-center">
            {busy ? 'Checking…' : 'I have verified my email'}
          </button>
          <button onClick={resend} disabled={busy} className="btn-secondary w-full justify-center">
            <RefreshCw size={15} /> Resend verification email
          </button>
          <button onClick={signOut} disabled={busy} className="btn-ghost w-full justify-center text-gray-600">
            <LogOut size={15} /> Sign out
          </button>
        </div>
        <p className="text-xs text-gray-400 mt-5">Check your spam folder if it doesn’t arrive.</p>
        <Link to="/login" className="sr-only">Back to sign in</Link>
      </div>
    </div>
  );
}
