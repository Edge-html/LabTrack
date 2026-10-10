import React, { useState } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { FlaskConical, Mail, Lock, Eye, EyeOff } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';

export default function Login() {
  const { login, parseFirebaseError } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();
  const location = useLocation();
  const from = location.state?.from?.pathname || '/';

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [resetMode, setResetMode] = useState(false);
  const [resetSent, setResetSent] = useState(false);

  const { resetPassword } = useAuth();

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await login(email, password);
      navigate(from, { replace: true });
    } catch (err) {
      setError(parseFirebaseError(err));
    } finally {
      setLoading(false);
    }
  }

  async function handleReset(e) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await resetPassword(email);
      setResetSent(true);
      toast.success('Password reset email sent!');
    } catch (err) {
      setError(parseFirebaseError(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-primary-800 to-navy flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-white/10 rounded-2xl mb-4">
            <FlaskConical size={32} className="text-white" strokeWidth={1.5} />
          </div>
          <h1 className="text-3xl font-bold text-white">LabTrack</h1>
          <p className="text-blue-200 text-sm mt-1">KNCHS Science Laboratory System</p>
        </div>

        <div className="card p-8">
          {!resetMode ? (
            <>
              <h2 className="text-xl font-semibold text-gray-800 mb-6">Sign in to your account</h2>
              {error && (
                <div className="mb-4 p-3 bg-red-50 border border-red-200 text-red-700 rounded-xl text-sm">
                  {error}
                </div>
              )}
              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label className="label" htmlFor="login-email">Email address</label>
                  <div className="relative">
                    <Mail size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                    <input
                      id="login-email"
                      type="email"
                      autoComplete="email"
                      required
                      value={email}
                      onChange={e => setEmail(e.target.value)}
                      className="input pl-9"
                      placeholder="you@email.com"
                    />
                  </div>
                </div>
                <div>
                  <label className="label" htmlFor="login-password">Password</label>
                  <div className="relative">
                    <Lock size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                    <input
                      id="login-password"
                      type={showPw ? 'text' : 'password'}
                      autoComplete="current-password"
                      required
                      value={password}
                      onChange={e => setPassword(e.target.value)}
                      className="input pl-9 pr-10"
                      placeholder="••••••••"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPw(v => !v)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                    >
                      {showPw ? <EyeOff size={16} /> : <Eye size={16} />}
                    </button>
                  </div>
                </div>
                <button type="submit" disabled={loading} className="btn-primary w-full justify-center">
                  {loading ? 'Signing in…' : 'Sign In'}
                </button>
              </form>
              <div className="mt-4 text-center text-sm">
                <button
                  onClick={() => { setResetMode(true); setError(''); }}
                  className="text-primary-500 hover:underline"
                >
                  Forgot password?
                </button>
              </div>
              <div className="mt-4 text-center text-sm text-gray-600">
                Don't have an account?{' '}
                <Link to="/register" className="text-primary-500 font-medium hover:underline">Sign up</Link>
              </div>
            </>
          ) : (
            <>
              <h2 className="text-xl font-semibold text-gray-800 mb-2">Reset password</h2>
              <p className="text-sm text-gray-500 mb-6">Enter your email and we'll send a reset link.</p>
              {error && (
                <div className="mb-4 p-3 bg-red-50 border border-red-200 text-red-700 rounded-xl text-sm">{error}</div>
              )}
              {resetSent ? (
                <div className="p-3 bg-green-50 border border-green-200 text-green-700 rounded-xl text-sm mb-4">
                  Check your inbox for a password reset link.
                </div>
              ) : (
                <form onSubmit={handleReset} className="space-y-4">
                  <div>
                    <label className="label" htmlFor="reset-email">Email address</label>
                    <input
                      id="reset-email"
                      type="email"
                      required
                      value={email}
                      onChange={e => setEmail(e.target.value)}
                      className="input"
                      placeholder="you@email.com"
                    />
                  </div>
                  <button type="submit" disabled={loading} className="btn-primary w-full justify-center">
                    {loading ? 'Sending…' : 'Send Reset Link'}
                  </button>
                </form>
              )}
              <button
                onClick={() => { setResetMode(false); setResetSent(false); setError(''); }}
                className="mt-4 text-sm text-primary-500 hover:underline"
              >
                ← Back to sign in
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
