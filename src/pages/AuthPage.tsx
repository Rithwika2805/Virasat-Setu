import React, { useEffect, useState } from 'react';
import { ArrowLeft, KeyRound, Shield, UserPlus } from 'lucide-react';
import { BrandMark } from '../components/BrandMark';
import { useAuth } from '../context/AuthContext';
import { apiRequest } from '../services/api';
import type { Institution, UserRole } from '../types';

interface Props {
  initialMode?: 'login' | 'register';
  onBackHome: () => void;
}

const DEMO_ACCOUNTS = [
  {
    label: 'Family User (Priya Kumar)',
    role: 'family',
    email: 'family.demo@virasatsetu.in',
    pass: 'Virasat@2026',
    note: 'Submit Rajesh Kumar death record, view 4 matched assets & track claims',
  },
  {
    label: 'Registry Administrator',
    role: 'admin',
    email: 'admin@virasatsetu.in',
    pass: 'Admin@2026',
    note: 'Approve death records, trigger asset matching & verify claimants',
  },
  {
    label: 'Bank Rep (Bharatiya Rashtriya Bank)',
    role: 'institution',
    email: 'rep.bank@virasatsetu.in',
    pass: 'Inst@2026',
    note: 'Process Rajesh Kumar Savings & Fixed Deposit claims',
  },
  {
    label: 'Insurance Rep (Suraksha Jeevan)',
    role: 'institution',
    email: 'rep.insurance@virasatsetu.in',
    pass: 'Inst@2026',
    note: 'Process Rajesh Kumar Endowment Policy claim',
  },
  {
    label: 'Mutual Fund Rep (Sanchay AMC)',
    role: 'institution',
    email: 'rep.mutualfund@virasatsetu.in',
    pass: 'Inst@2026',
    note: 'Process Rajesh Kumar Mutual Fund Folio claim',
  },
];

export function AuthPage({ initialMode = 'login', onBackHome }: Props) {
  const { login, register } = useAuth();
  const [mode, setMode] = useState<'login' | 'register' | 'forgot'>(initialMode);
  const [institutions, setInstitutions] = useState<Institution[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const [loginEmail, setLoginEmail] = useState('');
  const [loginPassword, setLoginPassword] = useState('');

  const [regForm, setRegForm] = useState({
    full_name: '',
    email: '',
    phone: '',
    password: '',
    role: 'family' as UserRole,
    institution_id: '',
  });

  const [forgotEmail, setForgotEmail] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [recoveryCodeSent, setRecoveryCodeSent] = useState<string | null>(null);

  useEffect(() => {
    apiRequest<{ institutions: Institution[] }>('/api/institutions')
      .then((res) => setInstitutions(res.institutions || []))
      .catch(() => {});
  }, []);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await login(loginEmail, loginPassword);
    } catch (err: any) {
      setError(err.message || 'Sign in failed.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDemoLogin = async (email: string, pass: string) => {
    setLoginEmail(email);
    setLoginPassword(pass);
    setError(null);
    setSubmitting(true);
    try {
      await login(email, pass);
    } catch (err: any) {
      setError(err.message || 'Demo login failed.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await register(regForm);
    } catch (err: any) {
      setError(err.message || 'Registration failed.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleForgot = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setInfo(null);
    setSubmitting(true);
    try {
      const res = await apiRequest<{ message: string; simulated_code?: string }>(
        '/api/auth/forgot-password',
        {
          method: 'POST',
          body: JSON.stringify({
            email: forgotEmail,
            new_password: newPassword || undefined,
          }),
        }
      );
      setInfo(res.message);
      if (res.simulated_code) {
        setRecoveryCodeSent(res.simulated_code);
      } else if (newPassword) {
        setMode('login');
        setLoginEmail(forgotEmail);
        setNewPassword('');
        setRecoveryCodeSent(null);
      }
    } catch (err: any) {
      setError(err.message || 'Password recovery failed.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      <header className="bg-white border-b border-slate-200 px-6 h-16 flex items-center justify-between">
        <button
          type="button"
          onClick={onBackHome}
          className="inline-flex items-center gap-2 text-xs font-medium text-slate-600 hover:text-slate-900"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to Home
        </button>
        <BrandMark />
        <div className="w-24" />
      </header>

      <div className="flex-1 max-w-6xl w-full mx-auto px-6 py-10 grid lg:grid-cols-12 gap-8 items-start">
        {/* Left Auth Card */}
        <div className="lg:col-span-6 bg-white border border-slate-200 rounded-lg p-8">
          <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-md mb-6">
            <button
              type="button"
              onClick={() => {
                setMode('login');
                setError(null);
                setInfo(null);
              }}
              className={`flex-1 py-2 text-xs font-semibold rounded transition-colors ${
                mode === 'login'
                  ? 'bg-white text-slate-900 shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Sign In
            </button>
            <button
              type="button"
              onClick={() => {
                setMode('register');
                setError(null);
                setInfo(null);
              }}
              className={`flex-1 py-2 text-xs font-semibold rounded transition-colors ${
                mode === 'register'
                  ? 'bg-white text-slate-900 shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Create Account
            </button>
            <button
              type="button"
              onClick={() => {
                setMode('forgot');
                setError(null);
                setInfo(null);
              }}
              className={`flex-1 py-2 text-xs font-semibold rounded transition-colors ${
                mode === 'forgot'
                  ? 'bg-white text-slate-900 shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Reset Password
            </button>
          </div>

          {error && (
            <div className="mb-4 p-3 rounded border border-rose-200 bg-rose-50 text-xs font-medium text-rose-800">
              {error}
            </div>
          )}
          {info && (
            <div className="mb-4 p-3 rounded border border-emerald-200 bg-emerald-50 text-xs font-medium text-emerald-800">
              {info}
            </div>
          )}

          {mode === 'login' && (
            <form onSubmit={handleLogin} className="space-y-4">
              <div>
                <h1 className="font-display text-xl font-bold text-slate-900">
                  Sign in to Virasat Setu
                </h1>
                <p className="text-xs text-slate-500 mt-1">
                  Access your Family, Administrator, or Institution Representative workspace.
                </p>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Email Address
                </label>
                <input
                  type="email"
                  required
                  value={loginEmail}
                  onChange={(e) => setLoginEmail(e.target.value)}
                  placeholder="name@example.com"
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-teal-700"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Password
                </label>
                <input
                  type="password"
                  required
                  value={loginPassword}
                  onChange={(e) => setLoginPassword(e.target.value)}
                  placeholder="Enter password"
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-teal-700"
                />
              </div>
              <button
                type="submit"
                disabled={submitting}
                className="w-full py-2.5 px-4 text-sm font-semibold text-white bg-[#0B1F3A] rounded-md hover:bg-slate-800 disabled:opacity-60 transition-colors"
              >
                {submitting ? 'Signing in...' : 'Sign In'}
              </button>
            </form>
          )}

          {mode === 'register' && (
            <form onSubmit={handleRegister} className="space-y-4">
              <div>
                <h1 className="font-display text-xl font-bold text-slate-900 flex items-center gap-2">
                  <UserPlus className="w-5 h-5 text-teal-700" />
                  Create Portal Account
                </h1>
                <p className="text-xs text-slate-500 mt-1">
                  Register as a Family User to submit death records and discover assets.
                </p>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Full Name</label>
                <input
                  type="text"
                  required
                  value={regForm.full_name}
                  onChange={(e) => setRegForm({ ...regForm, full_name: e.target.value })}
                  placeholder="e.g., Priya Kumar"
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-teal-700"
                />
              </div>
              <div className="grid sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Email</label>
                  <input
                    type="email"
                    required
                    value={regForm.email}
                    onChange={(e) => setRegForm({ ...regForm, email: e.target.value })}
                    placeholder="priya@example.com"
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-teal-700"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Mobile Number</label>
                  <input
                    type="tel"
                    required
                    value={regForm.phone}
                    onChange={(e) => setRegForm({ ...regForm, phone: e.target.value })}
                    placeholder="+91 98201 00000"
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-teal-700"
                  />
                </div>
              </div>
              <div className="grid sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Account Role</label>
                  <select
                    value={regForm.role}
                    onChange={(e) =>
                      setRegForm({ ...regForm, role: e.target.value as UserRole })
                    }
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-md bg-white focus:outline-none focus:ring-2 focus:ring-teal-700"
                  >
                    <option value="family">Family User</option>
                    <option value="institution">Institution Representative</option>
                    <option value="admin">Administrator</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Password (min 6 chars)
                  </label>
                  <input
                    type="password"
                    required
                    minLength={6}
                    value={regForm.password}
                    onChange={(e) => setRegForm({ ...regForm, password: e.target.value })}
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-teal-700"
                  />
                </div>
              </div>
              {regForm.role === 'institution' && (
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Assigned Financial Institution
                  </label>
                  <select
                    required
                    value={regForm.institution_id}
                    onChange={(e) => setRegForm({ ...regForm, institution_id: e.target.value })}
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-md bg-white focus:outline-none focus:ring-2 focus:ring-teal-700"
                  >
                    <option value="">Select institution...</option>
                    {institutions.map((inst) => (
                      <option key={inst.id} value={inst.id}>
                        {inst.name} ({inst.category})
                      </option>
                    ))}
                  </select>
                </div>
              )}
              <button
                type="submit"
                disabled={submitting}
                className="w-full py-2.5 px-4 text-sm font-semibold text-white bg-teal-700 rounded-md hover:bg-teal-800 disabled:opacity-60 transition-colors"
              >
                {submitting ? 'Creating Account...' : 'Register & Open Dashboard'}
              </button>
            </form>
          )}

          {mode === 'forgot' && (
            <form onSubmit={handleForgot} className="space-y-4">
              <div>
                <h1 className="font-display text-xl font-bold text-slate-900 flex items-center gap-2">
                  <KeyRound className="w-5 h-5 text-amber-700" />
                  Password Recovery
                </h1>
                <p className="text-xs text-slate-500 mt-1">
                  Enter your registered email to request a recovery code or set a new password.
                </p>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Registered Email
                </label>
                <input
                  type="email"
                  required
                  value={forgotEmail}
                  onChange={(e) => setForgotEmail(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-teal-700"
                />
              </div>
              {recoveryCodeSent && (
                <div>
                  <p className="text-xs text-slate-600 mb-2">
                    Simulated recovery code issued: <span className="font-mono font-semibold text-slate-900">{recoveryCodeSent}</span>. Enter your new password below:
                  </p>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    New Password
                  </label>
                  <input
                    type="password"
                    required
                    minLength={6}
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-teal-700"
                  />
                </div>
              )}
              <button
                type="submit"
                disabled={submitting}
                className="w-full py-2.5 px-4 text-sm font-semibold text-white bg-[#0B1F3A] rounded-md hover:bg-slate-800 disabled:opacity-60 transition-colors"
              >
                {recoveryCodeSent ? 'Update Password' : 'Send Recovery Verification'}
              </button>
            </form>
          )}
        </div>

        {/* Right Demo Credentials Panel */}
        <div className="lg:col-span-6 bg-white border border-slate-200 rounded-lg p-8">
          <div className="flex items-center gap-2 text-slate-900 mb-1">
            <Shield className="w-5 h-5 text-teal-700" />
            <h2 className="font-display text-lg font-bold">Prototype Demo Credentials</h2>
          </div>
          <p className="text-xs text-slate-600 mb-5">
            Use these pre-seeded role accounts to demonstrate the complete end-to-end flow across Family, Administrator, and Financial Institution portals.
          </p>

          <div className="divide-y divide-slate-200 border-t border-b border-slate-200">
            {DEMO_ACCOUNTS.map((acc) => (
              <div key={acc.email} className="py-3.5 flex items-center justify-between gap-4">
                <div className="min-w-0">
                  <div className="text-sm font-semibold text-slate-900">{acc.label}</div>
                  <div className="font-mono text-xs text-slate-600 mt-0.5 truncate">
                    {acc.email} · <span className="text-slate-500">{acc.pass}</span>
                  </div>
                  <div className="text-xs text-slate-500 mt-0.5">{acc.note}</div>
                </div>
                <button
                  type="button"
                  disabled={submitting}
                  onClick={() => handleDemoLogin(acc.email, acc.pass)}
                  className="px-3 py-1.5 text-xs font-semibold text-teal-800 border border-teal-700/40 rounded-md hover:bg-teal-50 transition-colors whitespace-nowrap shrink-0"
                >
                  Quick Sign In
                </button>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
