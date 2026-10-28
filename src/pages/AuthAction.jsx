import React, { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import {
  applyActionCode, checkActionCode, confirmPasswordReset, verifyPasswordResetCode,
} from 'firebase/auth';
import { KeyRound, Loader2, MailCheck, ShieldCheck } from 'lucide-react';
import { auth } from '../lib/firebase';

const ERROR_MESSAGES = {
  'auth/expired-action-code': 'This email link has expired. Request a new one from LabTrack.',
  'auth/invalid-action-code': 'This email link is invalid or has already been used.',
  'auth/weak-password': 'Choose a stronger password with at least 6 characters.',
  'auth/network-request-failed': 'Could not reach Firebase. Check your connection and try again.',
};

export default function AuthAction() {
  const [searchParams] = useSearchParams();
  const mode = searchParams.get('mode');
  const actionCode = searchParams.get('oobCode');
  const [state, setState] = useState('loading');
  const [message, setMessage] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let active = true;
    async function validateAction() {
      if (!actionCode) {
        setMessage('This email link is missing its security code. Request a new link from LabTrack.');
        setState('error');
        return;
      }
      try {
        if (mode === 'verifyEmail') {
          await applyActionCode(auth, actionCode);
          if (active) {
            setMessage('Your email is verified. Return to LabTrack and choose “I have verified my email.”');
            setState('success');
          }
          return;
        }
        if (mode === 'resetPassword') {
          const accountEmail = await verifyPasswordResetCode(auth, actionCode);
          if (active) {
            setEmail(accountEmail);
            setState('reset');
          }
          return;
        }
        if (mode === 'recoverEmail') {
          const info = await checkActionCode(auth, actionCode);
          await applyActionCode(auth, actionCode);
          if (active) {
            setMessage(info.data?.email
              ? `The email address ${info.data.email} has been restored to your account.`
              : 'Your previous email address has been restored.');
            setState('success');
          }
          return;
        }
        setMessage('This email link has an unsupported action. Open LabTrack and request a new link.');
        setState('error');
      } catch (error) {
        if (active) {
          setMessage(ERROR_MESSAGES[error.code] || 'This email link could not be used. Request a new link from LabTrack.');
          setState('error');
        }
      }
    }

    validateAction();
    return () => { active = false; };
  }, [mode, actionCode]);

  async function submitPassword(event) {
    event.preventDefault();
    setMessage('');
    if (password.length < 6) {
      setMessage('Password must contain at least 6 characters.');
      return;
    }
    if (password !== confirmPassword) {
      setMessage('The passwords do not match.');
      return;
    }

    setBusy(true);
    try {
      await confirmPasswordReset(auth, actionCode, password);
      setPassword('');
      setConfirmPassword('');
      setMessage('Your password has been reset. You can now sign in to LabTrack.');
      setState('success');
    } catch (error) {
      setMessage(ERROR_MESSAGES[error.code] || 'Could not reset the password. Request a new link and try again.');
    } finally {
      setBusy(false);
    }
  }

  const isReset = state === 'reset';
  const Icon = mode === 'resetPassword' ? KeyRound : mode === 'verifyEmail' ? MailCheck : ShieldCheck;

  return (
    <div className="min-h-screen bg-gradient-to-br from-primary-800 to-navy flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-7 sm:p-9 text-center">
        <div className="w-14 h-14 rounded-2xl bg-blue-50 text-blue-700 flex items-center justify-center mx-auto mb-4">
          <Icon size={28} />
        </div>
        <h1 className="text-xl font-bold text-gray-900">
          {mode === 'verifyEmail' ? 'Verify your email'
            : mode === 'resetPassword' ? 'Reset your password'
              : mode === 'recoverEmail' ? 'Restore your email' : 'Email action'}
        </h1>

        {state === 'loading' && (
          <p className="mt-4 text-sm text-gray-500 inline-flex items-center gap-2">
            <Loader2 size={15} className="animate-spin" /> Checking your secure link…
          </p>
        )}

        {isReset && (
          <form onSubmit={submitPassword} className="mt-5 space-y-4 text-left">
            <p className="text-sm text-gray-600 text-center">Choose a new password for <strong>{email}</strong>.</p>
            <div>
              <label className="label" htmlFor="new-password">New password</label>
              <input
                id="new-password" type="password" autoComplete="new-password" required minLength={6}
                className="input" value={password} onChange={event => setPassword(event.target.value)}
                disabled={busy}
              />
            </div>
            <div>
              <label className="label" htmlFor="confirm-password">Confirm new password</label>
              <input
                id="confirm-password" type="password" autoComplete="new-password" required minLength={6}
                className="input" value={confirmPassword} onChange={event => setConfirmPassword(event.target.value)}
                disabled={busy}
              />
            </div>
            {message && <p role="alert" className="text-sm text-red-700">{message}</p>}
            <button type="submit" disabled={busy} className="btn-primary w-full justify-center">
              {busy ? <><Loader2 size={15} className="animate-spin" /> Saving…</> : 'Save new password'}
            </button>
          </form>
        )}

        {(state === 'success' || state === 'error') && (
          <>
            <p role={state === 'error' ? 'alert' : undefined}
              className={`mt-3 text-sm ${state === 'error' ? 'text-red-700' : 'text-gray-600'}`}>
              {message}
            </p>
            <Link to={state === 'error' ? '/login' : mode === 'resetPassword' ? '/login' : '/verify-email'}
              className="btn-primary mt-5 inline-flex justify-center">
              {state === 'error' ? 'Go to LabTrack' : mode === 'resetPassword' ? 'Go to sign in' : 'Return to LabTrack'}
            </Link>
          </>
        )}
      </div>
    </div>
  );
}
