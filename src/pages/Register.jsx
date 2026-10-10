import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { FlaskConical, User, Mail, Lock, Eye, EyeOff } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { GRADE_LEVELS } from '../lib/helpers';

export default function Register() {
  const { register, parseFirebaseError } = useAuth();
  const navigate = useNavigate();

  const [form, setForm] = useState({
    name: '', email: '', password: '', confirmPassword: '',
    gradeLevel: '', section: '',
  });
  const [showPw, setShowPw] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [fieldErrors, setFieldErrors] = useState({});

  function validate() {
    const errs = {};
    if (!form.name.trim()) errs.name = 'Full name is required.';
    if (!form.email) errs.email = 'Email is required.';
    if (!form.gradeLevel) errs.gradeLevel = 'Grade level is required.';
    if (!form.section.trim()) errs.section = 'Section is required.';
    if (form.password.length < 6) errs.password = 'Password must be at least 6 characters.';
    if (form.password !== form.confirmPassword) errs.confirmPassword = 'Passwords do not match.';
    return errs;
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    const errs = validate();
    setFieldErrors(errs);
    if (Object.keys(errs).length > 0) return;

    setLoading(true);
    try {
      await register({
        name: form.name.trim(),
        email: form.email,
        password: form.password,
        gradeLevel: form.gradeLevel,
        section: form.section.trim(),
      });
      navigate('/', { replace: true });
    } catch (err) {
      setError(parseFirebaseError(err));
    } finally {
      setLoading(false);
    }
  }

  function setField(k, v) {
    setForm(prev => ({ ...prev, [k]: v }));
    setFieldErrors(prev => ({ ...prev, [k]: undefined }));
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-primary-800 to-navy flex items-center justify-center p-4">
      <div className="w-full max-w-lg">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-white/10 rounded-2xl mb-4">
            <FlaskConical size={32} className="text-white" strokeWidth={1.5} />
          </div>
          <h1 className="text-3xl font-bold text-white">LabTrack</h1>
          <p className="text-blue-200 text-sm mt-1">KNCHS Science Laboratory System</p>
        </div>

        <div className="card p-8">
          <h2 className="text-xl font-semibold text-gray-800 mb-6">Create your account</h2>
          {error && (
            <div className="mb-4 p-3 bg-red-50 border border-red-200 text-red-700 rounded-xl text-sm">{error}</div>
          )}
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="sm:col-span-2">
                <label className="label" htmlFor="reg-name">Full Name</label>
                <div className="relative">
                  <User size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                  <input
                    id="reg-name"
                    type="text"
                    autoComplete="name"
                    value={form.name}
                    onChange={e => setField('name', e.target.value)}
                    className={`input pl-9 ${fieldErrors.name ? 'input-error' : ''}`}
                    placeholder="Juan Dela Cruz"
                  />
                </div>
                {fieldErrors.name && <p className="text-xs text-red-600 mt-1">{fieldErrors.name}</p>}
              </div>

              <div className="sm:col-span-2">
                <label className="label" htmlFor="reg-email">Email Address</label>
                <div className="relative">
                  <Mail size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                  <input
                    id="reg-email"
                    type="email"
                    autoComplete="email"
                    value={form.email}
                    onChange={e => setField('email', e.target.value)}
                    className={`input pl-9 ${fieldErrors.email ? 'input-error' : ''}`}
                    placeholder="you@email.com"
                  />
                </div>
                {fieldErrors.email && <p className="text-xs text-red-600 mt-1">{fieldErrors.email}</p>}
              </div>

              <div>
                <label className="label" htmlFor="reg-grade">Grade Level</label>
                <select
                  id="reg-grade"
                  value={form.gradeLevel}
                  onChange={e => setField('gradeLevel', e.target.value)}
                  className={`input ${fieldErrors.gradeLevel ? 'input-error' : ''}`}
                >
                  <option value="">Select grade level</option>
                  {GRADE_LEVELS.map(g => (
                    <option key={g} value={g}>{g}</option>
                  ))}
                </select>
                {fieldErrors.gradeLevel && <p className="text-xs text-red-600 mt-1">{fieldErrors.gradeLevel}</p>}
              </div>

              <div>
                <label className="label" htmlFor="reg-section">Section</label>
                <input
                  id="reg-section"
                  type="text"
                  value={form.section}
                  onChange={e => setField('section', e.target.value)}
                  className={`input ${fieldErrors.section ? 'input-error' : ''}`}
                  placeholder="e.g. STEM Del Rosario"
                />
                {fieldErrors.section && <p className="text-xs text-red-600 mt-1">{fieldErrors.section}</p>}
              </div>

              <div>
                <label className="label" htmlFor="reg-password">Password</label>
                <div className="relative">
                  <Lock size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                  <input
                    id="reg-password"
                    type={showPw ? 'text' : 'password'}
                    autoComplete="new-password"
                    value={form.password}
                    onChange={e => setField('password', e.target.value)}
                    className={`input pl-9 pr-10 ${fieldErrors.password ? 'input-error' : ''}`}
                    placeholder="At least 6 characters"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPw(v => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                  >
                    {showPw ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
                {fieldErrors.password && <p className="text-xs text-red-600 mt-1">{fieldErrors.password}</p>}
              </div>

              <div>
                <label className="label" htmlFor="reg-confirm">Confirm Password</label>
                <input
                  id="reg-confirm"
                  type={showPw ? 'text' : 'password'}
                  autoComplete="new-password"
                  value={form.confirmPassword}
                  onChange={e => setField('confirmPassword', e.target.value)}
                  className={`input ${fieldErrors.confirmPassword ? 'input-error' : ''}`}
                  placeholder="••••••••"
                />
                {fieldErrors.confirmPassword && <p className="text-xs text-red-600 mt-1">{fieldErrors.confirmPassword}</p>}
              </div>
            </div>

            <button type="submit" disabled={loading} className="btn-primary w-full justify-center mt-2">
              {loading ? 'Creating account…' : 'Create Account'}
            </button>
          </form>
          <div className="mt-4 text-center text-sm text-gray-600">
            Already have an account?{' '}
            <Link to="/login" className="text-primary-500 font-medium hover:underline">Sign in</Link>
          </div>
        </div>
      </div>
    </div>
  );
}
