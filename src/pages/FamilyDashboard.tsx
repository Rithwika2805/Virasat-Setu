import React, { useCallback, useEffect, useState } from 'react';
import {
  Bell,
  Building2,
  CheckCircle2,
  Clock,
  FileCheck2,
  FilePlus2,
  FileText,
  Home,
  LogOut,
  Plus,
  Search,
  ShieldAlert,
  TrendingUp,
  Upload,
  UserCheck,
  X,
} from 'lucide-react';
import { BrandMark } from '../components/BrandMark';
import { DocumentViewerModal } from '../components/DocumentViewerModal';
import { NotificationCenter } from '../components/NotificationCenter';
import { useAuth } from '../context/AuthContext';
import { apiRequest } from '../services/api';
import type {
  AssetMatch,
  ClaimRecord,
  ClaimantRecord,
  DeceasedRecord,
  DocumentItem,
  NotificationItem,
  AuditLog,
} from '../types';
import {
  formatCategoryLabel,
  formatDate,
  formatDateTime,
  formatINR,
  getStatusTextClass,
} from '../utils/format';

type Tab = 'overview' | 'submit' | 'records' | 'assets' | 'claimants' | 'claims';

export function FamilyDashboard({ onBackHome }: { onBackHome: () => void }) {
  const { user, logout } = useAuth();
  const [tab, setTab] = useState<Tab>('overview');
  const [loading, setLoading] = useState(true);
  const [banner, setBanner] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  const [stats, setStats] = useState({
    totalDeceasedSubmitted: 0,
    potentialAssetsDiscovered: 0,
    claimsInProgress: 0,
    totalClaims: 0,
    unreadNotifications: 0,
  });
  const [deceasedRecords, setDeceasedRecords] = useState<DeceasedRecord[]>([]);
  const [assets, setAssets] = useState<AssetMatch[]>([]);
  const [claimants, setClaimants] = useState<ClaimantRecord[]>([]);
  const [claims, setClaims] = useState<ClaimRecord[]>([]);
  const [recentActivity, setRecentActivity] = useState<AuditLog[]>([]);
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);

  const [notifOpen, setNotifOpen] = useState(false);
  const [selectedAsset, setSelectedAsset] = useState<AssetMatch | null>(null);
  const [selectedDeceasedDetail, setSelectedDeceasedDetail] = useState<{
    record: DeceasedRecord;
    documents: DocumentItem[];
  } | null>(null);
  const [viewerDoc, setViewerDoc] = useState<DocumentItem | null>(null);
  const [claimNotes, setClaimNotes] = useState('');
  const [submittingClaim, setSubmittingClaim] = useState(false);

  // Add Deceased Form State
  const [deceasedForm, setDeceasedForm] = useState({
    full_name: '',
    date_of_birth: '',
    date_of_death: '',
    gender: 'Male',
    last_city: '',
    last_state: '',
    death_certificate_ref: '',
    death_registration_date: '',
    issuing_authority: '',
    sample_identity_ref: '',
    claimant_name: user?.full_name || '',
    relationship: 'Spouse',
    claimant_email: user?.email || '',
    claimant_phone: user?.phone || '+91 98201 44510',
    claimant_type: 'Nominee' as 'Nominee' | 'Legal Heir',
  });
  const [deceasedFiles, setDeceasedFiles] = useState<FileList | null>(null);
  const [submittingDeceased, setSubmittingDeceased] = useState(false);

  // Claimant Verification Form State
  const [claimantForm, setClaimantForm] = useState({
    deceased_person_id: '',
    full_name: user?.full_name || '',
    email: user?.email || '',
    phone: user?.phone || '+91 98201 44510',
    relationship: 'Spouse',
    claimant_type: 'Nominee' as 'Nominee' | 'Legal Heir',
  });
  const [claimantFiles, setClaimantFiles] = useState<FileList | null>(null);
  const [submittingClaimant, setSubmittingClaimant] = useState(false);

  const loadAllData = useCallback(async () => {
    setLoading(true);
    try {
      const [dashRes, assetsRes, claimantsRes, claimsRes, notifRes] = await Promise.all([
        apiRequest<any>('/api/family/dashboard'),
        apiRequest<{ assets: AssetMatch[] }>('/api/family/assets'),
        apiRequest<{ claimants: ClaimantRecord[] }>('/api/claimants'),
        apiRequest<{ claims: ClaimRecord[] }>('/api/claims'),
        apiRequest<{ notifications: NotificationItem[] }>('/api/notifications'),
      ]);
      setStats(dashRes.stats);
      setDeceasedRecords(dashRes.deceasedRecords || []);
      setRecentActivity(dashRes.recentActivity || []);
      setAssets(assetsRes.assets || []);
      setClaimants(claimantsRes.claimants || []);
      setClaims(claimsRes.claims || []);
      setNotifications(notifRes.notifications || []);
      if (dashRes.deceasedRecords?.length > 0) {
        setClaimantForm((prev) =>
          prev.deceased_person_id ? prev : { ...prev, deceased_person_id: dashRes.deceasedRecords[0].id }
        );
      }
    } catch (err: any) {
      setBanner({ type: 'err', text: err.message || 'Failed to load family workspace.' });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadAllData();
  }, [loadAllData]);

  const fillRajeshKumarDemo = () => {
    setDeceasedForm({
      full_name: 'Rajesh Kumar',
      date_of_birth: '1960-06-15',
      date_of_death: '2026-11-10',
      gender: 'Male',
      last_city: 'Pune',
      last_state: 'Maharashtra',
      death_certificate_ref: 'DC-2026-001',
      death_registration_date: '2026-11-12',
      issuing_authority: 'Pune Municipal Corporation',
      sample_identity_ref: 'SIMULATED-123456',
      claimant_name: user?.full_name || 'Priya Kumar',
      relationship: 'Spouse',
      claimant_email: user?.email || 'family.demo@virasatsetu.in',
      claimant_phone: user?.phone || '+91 98201 44510',
      claimant_type: 'Nominee',
    });
    setBanner({
      type: 'ok',
      text: 'Loaded Rajesh Kumar demonstration profile (SIMULATED-123456, DC-2026-001). Attach a sample certificate or submit directly.',
    });
  };

  const handleSubmitDeceased = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmittingDeceased(true);
    setBanner(null);
    try {
      const fd = new FormData();
      Object.entries(deceasedForm).forEach(([k, v]) => fd.append(k, String(v)));
      if (deceasedFiles) {
        Array.from(deceasedFiles).forEach((f) => fd.append('documents', f));
      }
      const res = await apiRequest<{ message: string }>('/api/deceased', {
        method: 'POST',
        body: fd,
      });
      setBanner({ type: 'ok', text: res.message });
      setDeceasedFiles(null);
      setTab('records');
      await loadAllData();
    } catch (err: any) {
      setBanner({ type: 'err', text: err.message || 'Failed to submit death record.' });
    } finally {
      setSubmittingDeceased(false);
    }
  };

  const handleOpenDeceasedDetail = async (id: string) => {
    try {
      const res = await apiRequest<{ record: DeceasedRecord; documents: DocumentItem[] }>(
        `/api/deceased/${id}`
      );
      setSelectedDeceasedDetail({ record: res.record, documents: res.documents });
    } catch (err: any) {
      setBanner({ type: 'err', text: err.message });
    }
  };

  const handleSubmitClaimant = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmittingClaimant(true);
    setBanner(null);
    try {
      const fd = new FormData();
      Object.entries(claimantForm).forEach(([k, v]) => fd.append(k, String(v)));
      if (claimantFiles) {
        Array.from(claimantFiles).forEach((f) => fd.append('documents', f));
      }
      await apiRequest('/api/claimants', {
        method: 'POST',
        body: fd,
      });
      setBanner({
        type: 'ok',
        text: 'Claimant verification dossier submitted to Administrator for review.',
      });
      setClaimantFiles(null);
      await loadAllData();
    } catch (err: any) {
      setBanner({ type: 'err', text: err.message || 'Failed to submit claimant verification.' });
    } finally {
      setSubmittingClaimant(false);
    }
  };

  const handleInitiateClaim = async (match: AssetMatch) => {
    setSubmittingClaim(true);
    setBanner(null);
    try {
      const res = await apiRequest<{ claim: ClaimRecord }>('/api/claims', {
        method: 'POST',
        body: JSON.stringify({
          asset_match_id: match.id,
          claimant_id: match.claimant_id || undefined,
          claimant_notes: claimNotes || 'Requesting claim review and settlement instructions.',
        }),
      });
      setBanner({
        type: 'ok',
        text: `Claim ${res.claim.claim_number} initiated with ${match.institution_name}.`,
      });
      setSelectedAsset(null);
      setClaimNotes('');
      setTab('claims');
      await loadAllData();
    } catch (err: any) {
      setBanner({ type: 'err', text: err.message || 'Unable to initiate claim.' });
    } finally {
      setSubmittingClaim(false);
    }
  };

  const handleMarkRead = async (id: string) => {
    await apiRequest(`/api/notifications/${id}/read`, { method: 'PATCH' });
    setNotifications((prev) => prev.map((n) => (n.id === id ? { ...n, is_read: 1 } : n)));
    setStats((s) => ({ ...s, unreadNotifications: Math.max(0, s.unreadNotifications - 1) }));
  };

  const handleMarkAllRead = async () => {
    await apiRequest('/api/notifications/read-all', { method: 'PATCH' });
    setNotifications((prev) => prev.map((n) => ({ ...n, is_read: 1 })));
    setStats((s) => ({ ...s, unreadNotifications: 0 }));
  };

  const bankAssets = assets.filter((a) => a.category === 'bank');
  const insuranceAssets = assets.filter((a) => a.category === 'insurance');
  const mfAssets = assets.filter((a) => a.category === 'mutual_fund');

  const navItems: Array<{ id: Tab; label: string; icon: React.ReactNode; count?: number }> = [
    { id: 'overview', label: 'Overview', icon: <Home className="w-4 h-4" /> },
    { id: 'submit', label: 'Add Deceased Member', icon: <FilePlus2 className="w-4 h-4" /> },
    {
      id: 'records',
      label: 'Submitted Records',
      icon: <FileText className="w-4 h-4" />,
      count: deceasedRecords.length,
    },
    {
      id: 'assets',
      label: 'Discovered Assets',
      icon: <Search className="w-4 h-4" />,
      count: assets.length,
    },
    {
      id: 'claimants',
      label: 'Claimant Verification',
      icon: <UserCheck className="w-4 h-4" />,
      count: claimants.length,
    },
    {
      id: 'claims',
      label: 'Claim Tracking',
      icon: <FileCheck2 className="w-4 h-4" />,
      count: claims.length,
    },
  ];

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col lg:flex-row">
      {/* Sidebar */}
      <aside className="lg:w-64 bg-[#0B1F3A] text-slate-200 flex flex-col shrink-0">
        <div className="h-16 px-5 border-b border-slate-800 flex items-center justify-between">
          <button type="button" onClick={onBackHome} className="text-left">
            <BrandMark dark size="sm" />
          </button>
        </div>

        <div className="px-5 py-4 border-b border-slate-800">
          <p className="text-xs text-slate-400">Family Portal</p>
          <p className="text-sm font-semibold text-white truncate mt-0.5">{user?.full_name}</p>
          <p className="text-xs text-slate-400 truncate">{user?.email}</p>
        </div>

        <nav className="flex-1 p-3 space-y-1 overflow-x-auto flex lg:flex-col">
          {navItems.map((item) => {
            const active = tab === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setTab(item.id)}
                className={`flex items-center justify-between gap-2.5 px-3 py-2.5 rounded-md text-xs font-medium transition-colors whitespace-nowrap shrink-0 lg:w-full ${
                  active
                    ? 'bg-teal-700 text-white'
                    : 'text-slate-300 hover:bg-slate-800 hover:text-white'
                }`}
              >
                <span className="inline-flex items-center gap-2.5">
                  {item.icon}
                  {item.label}
                </span>
                {typeof item.count === 'number' && (
                  <span className="font-mono tabular-nums text-[11px] opacity-80">
                    {item.count}
                  </span>
                )}
              </button>
            );
          })}
        </nav>

        <div className="p-3 border-t border-slate-800 hidden lg:block">
          <button
            type="button"
            onClick={logout}
            className="w-full flex items-center gap-2 px-3 py-2 text-xs font-medium text-slate-300 hover:text-white hover:bg-slate-800 rounded-md transition-colors"
          >
            <LogOut className="w-4 h-4" />
            Sign Out
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Top Header */}
        <header className="h-16 bg-white border-b border-slate-200 px-6 flex items-center justify-between gap-4">
          <div className="text-xs text-slate-500 truncate">
            <span>Family Portal</span>
            <span className="mx-2">/</span>
            <span className="font-semibold text-slate-900">
              {navItems.find((i) => i.id === tab)?.label}
            </span>
          </div>

          <div className="flex items-center gap-3 shrink-0">
            <button
              type="button"
              onClick={() => setNotifOpen(true)}
              className="relative inline-flex items-center gap-2 px-3 py-1.5 text-xs font-medium text-slate-700 border border-slate-200 rounded-md hover:bg-slate-50 whitespace-nowrap"
            >
              <Bell className="w-4 h-4 text-slate-600" />
              Notifications
              <span className="font-mono tabular-nums font-semibold text-teal-700">
                {stats.unreadNotifications}
              </span>
            </button>
            <button
              type="button"
              onClick={() => setTab('submit')}
              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold text-white bg-teal-700 rounded-md hover:bg-teal-800 whitespace-nowrap"
            >
              <Plus className="w-3.5 h-3.5" />
              Add Deceased Family Member
            </button>
            <button
              type="button"
              onClick={logout}
              className="lg:hidden p-2 text-slate-600 hover:text-slate-900"
              aria-label="Sign Out"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </header>

        <main className="flex-1 p-6 max-w-6xl w-full mx-auto space-y-6">
          {banner && (
            <div
              className={`p-4 rounded-md border text-sm flex items-start justify-between gap-4 ${
                banner.type === 'ok'
                  ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
                  : 'bg-rose-50 border-rose-200 text-rose-900'
              }`}
            >
              <span>{banner.text}</span>
              <button
                type="button"
                onClick={() => setBanner(null)}
                className="text-slate-500 hover:text-slate-800"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          )}

          {loading ? (
            <div className="bg-white border border-slate-200 rounded-lg p-8 text-sm text-slate-500">
              Loading your family inheritance workspace...
            </div>
          ) : tab === 'overview' ? (
            <div className="space-y-6">
              <div className="bg-white border border-slate-200 rounded-lg p-6 flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                  <h1 className="font-display text-2xl font-bold text-slate-950">
                    Welcome, {user?.full_name}
                  </h1>
                  <p className="text-sm text-slate-600 mt-1">
                    Submit verified death registrations, review discovered institutional matches, and track claim progress.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setTab('submit')}
                  className="inline-flex items-center gap-2 px-4 py-2.5 text-sm font-semibold text-white bg-[#0B1F3A] rounded-md hover:bg-slate-800 whitespace-nowrap shrink-0"
                >
                  <FilePlus2 className="w-4 h-4" />
                  Add Deceased Family Member
                </button>
              </div>

              {/* Dynamic KPI Strip */}
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                <div className="bg-white border border-slate-200 rounded-lg p-5">
                  <div className="text-xs text-slate-500">Deceased Records Submitted</div>
                  <div className="font-mono tabular-nums text-2xl font-bold text-slate-900 mt-1">
                    {stats.totalDeceasedSubmitted}
                  </div>
                </div>
                <div className="bg-white border border-slate-200 rounded-lg p-5">
                  <div className="text-xs text-slate-500">Potential Assets Discovered</div>
                  <div className="font-mono tabular-nums text-2xl font-bold text-teal-700 mt-1">
                    {stats.potentialAssetsDiscovered}
                  </div>
                </div>
                <div className="bg-white border border-slate-200 rounded-lg p-5">
                  <div className="text-xs text-slate-500">Claims In Progress</div>
                  <div className="font-mono tabular-nums text-2xl font-bold text-amber-700 mt-1">
                    {stats.claimsInProgress}
                  </div>
                </div>
                <div className="bg-white border border-slate-200 rounded-lg p-5">
                  <div className="text-xs text-slate-500">Unread Notifications</div>
                  <div className="font-mono tabular-nums text-2xl font-bold text-[#0B1F3A] mt-1">
                    {stats.unreadNotifications}
                  </div>
                </div>
              </div>

              <div className="grid lg:grid-cols-12 gap-6">
                {/* Claim Status Overview */}
                <div className="lg:col-span-7 bg-white border border-slate-200 rounded-lg p-6">
                  <div className="flex items-center justify-between mb-4">
                    <h2 className="font-display text-base font-bold text-slate-900">
                      Claim Status Overview
                    </h2>
                    <button
                      type="button"
                      onClick={() => setTab('claims')}
                      className="text-xs font-medium text-teal-700 hover:underline"
                    >
                      View all claims
                    </button>
                  </div>

                  {claims.length === 0 ? (
                    <div className="py-8 text-center text-sm text-slate-500">
                      No claims initiated yet. Once an administrator approves a submitted death record and verifies your claimant profile, you can initiate claims from Discovered Assets.
                    </div>
                  ) : (
                    <div className="divide-y divide-slate-100">
                      {claims.slice(0, 5).map((c) => (
                        <div key={c.id} className="py-3 flex items-center justify-between gap-4">
                          <div className="min-w-0">
                            <div className="text-sm font-semibold text-slate-900 truncate">
                              {c.institution_name} · {c.sub_category}
                            </div>
                            <div className="text-xs text-slate-500 mt-0.5 tabular-nums">
                              <span className="font-mono">{c.claim_number}</span>
                              <span className="mx-1.5">·</span>
                              <span>{c.deceased_name}</span>
                              <span className="mx-1.5">·</span>
                              <span>Updated {formatDate(c.updated_at)}</span>
                            </div>
                          </div>
                          <div className="text-right shrink-0">
                            <div className={`text-xs font-semibold ${getStatusTextClass(c.status)}`}>
                              {c.status}
                            </div>
                            <div className="font-mono tabular-nums text-xs text-slate-600 mt-0.5">
                              {formatINR(c.fictional_amount)}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Recent Activity */}
                <div className="lg:col-span-5 bg-white border border-slate-200 rounded-lg p-6">
                  <h2 className="font-display text-base font-bold text-slate-900 mb-4">
                    Recent Activity
                  </h2>
                  {recentActivity.length === 0 ? (
                    <p className="text-sm text-slate-500 py-6">No recent activity logged yet.</p>
                  ) : (
                    <div className="space-y-4">
                      {recentActivity.slice(0, 6).map((act) => (
                        <div key={act.id} className="text-xs border-b border-slate-100 pb-3 last:border-0 last:pb-0">
                          <div className="font-medium text-slate-800">{act.details}</div>
                          <div className="text-slate-400 mt-1 tabular-nums">
                            {formatDateTime(act.created_at)}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          ) : tab === 'submit' ? (
            <div className="bg-white border border-slate-200 rounded-lg p-6 lg:p-8">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-6 border-b border-slate-200">
                <div>
                  <h1 className="font-display text-xl font-bold text-slate-950">
                    Add Deceased Family Member
                  </h1>
                  <p className="text-xs text-slate-600 mt-1">
                    Submitted records undergo administrator verification before scanning Bank, Insurance, and Mutual Fund registries.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={fillRajeshKumarDemo}
                  className="px-3.5 py-2 text-xs font-semibold text-amber-800 border border-amber-300 bg-amber-50 rounded-md hover:bg-amber-100 transition-colors whitespace-nowrap shrink-0"
                >
                  Load Rajesh Kumar Demo Data
                </button>
              </div>

              <form onSubmit={handleSubmitDeceased} className="mt-6 space-y-8">
                {/* Section 1: Personal Information */}
                <section className="space-y-4">
                  <h2 className="font-display text-sm font-bold text-slate-900 border-b border-slate-100 pb-2">
                    01. Personal Information
                  </h2>
                  <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
                    <div>
                      <label className="block text-xs font-medium text-slate-700 mb-1">
                        Full Name *
                      </label>
                      <input
                        type="text"
                        required
                        value={deceasedForm.full_name}
                        onChange={(e) =>
                          setDeceasedForm({ ...deceasedForm, full_name: e.target.value })
                        }
                        placeholder="e.g., Rajesh Kumar"
                        className="w-full px-3 py-2 text-sm border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-teal-700"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-700 mb-1">
                        Date of Birth *
                      </label>
                      <input
                        type="date"
                        required
                        value={deceasedForm.date_of_birth}
                        onChange={(e) =>
                          setDeceasedForm({ ...deceasedForm, date_of_birth: e.target.value })
                        }
                        className="w-full px-3 py-2 text-sm border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-teal-700"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-700 mb-1">
                        Date of Death *
                      </label>
                      <input
                        type="date"
                        required
                        value={deceasedForm.date_of_death}
                        onChange={(e) =>
                          setDeceasedForm({ ...deceasedForm, date_of_death: e.target.value })
                        }
                        className="w-full px-3 py-2 text-sm border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-teal-700"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-700 mb-1">
                        Gender *
                      </label>
                      <select
                        value={deceasedForm.gender}
                        onChange={(e) =>
                          setDeceasedForm({ ...deceasedForm, gender: e.target.value })
                        }
                        className="w-full px-3 py-2 text-sm border border-slate-300 rounded-md bg-white focus:outline-none focus:ring-2 focus:ring-teal-700"
                      >
                        <option value="Male">Male</option>
                        <option value="Female">Female</option>
                        <option value="Other">Other</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-700 mb-1">
                        Last Known City *
                      </label>
                      <input
                        type="text"
                        required
                        value={deceasedForm.last_city}
                        onChange={(e) =>
                          setDeceasedForm({ ...deceasedForm, last_city: e.target.value })
                        }
                        placeholder="e.g., Pune"
                        className="w-full px-3 py-2 text-sm border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-teal-700"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-700 mb-1">
                        Last Known State *
                      </label>
                      <input
                        type="text"
                        required
                        value={deceasedForm.last_state}
                        onChange={(e) =>
                          setDeceasedForm({ ...deceasedForm, last_state: e.target.value })
                        }
                        placeholder="e.g., Maharashtra"
                        className="w-full px-3 py-2 text-sm border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-teal-700"
                      />
                    </div>
                  </div>
                </section>

                {/* Section 2: Death Registration Information */}
                <section className="space-y-4">
                  <h2 className="font-display text-sm font-bold text-slate-900 border-b border-slate-100 pb-2">
                    02. Death Registration Information
                  </h2>
                  <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
                    <div>
                      <label className="block text-xs font-medium text-slate-700 mb-1">
                        Death Certificate Ref No. *
                      </label>
                      <input
                        type="text"
                        required
                        value={deceasedForm.death_certificate_ref}
                        onChange={(e) =>
                          setDeceasedForm({
                            ...deceasedForm,
                            death_certificate_ref: e.target.value,
                          })
                        }
                        placeholder="e.g., DC-2026-001"
                        className="w-full px-3 py-2 text-sm font-mono border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-teal-700"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-700 mb-1">
                        Registration Date *
                      </label>
                      <input
                        type="date"
                        required
                        value={deceasedForm.death_registration_date}
                        onChange={(e) =>
                          setDeceasedForm({
                            ...deceasedForm,
                            death_registration_date: e.target.value,
                          })
                        }
                        className="w-full px-3 py-2 text-sm border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-teal-700"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-700 mb-1">
                        Issuing Authority *
                      </label>
                      <input
                        type="text"
                        required
                        value={deceasedForm.issuing_authority}
                        onChange={(e) =>
                          setDeceasedForm({ ...deceasedForm, issuing_authority: e.target.value })
                        }
                        placeholder="e.g., Pune Municipal Corporation"
                        className="w-full px-3 py-2 text-sm border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-teal-700"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-700 mb-1">
                        Sample Identity Reference *
                      </label>
                      <input
                        type="text"
                        required
                        value={deceasedForm.sample_identity_ref}
                        onChange={(e) =>
                          setDeceasedForm({
                            ...deceasedForm,
                            sample_identity_ref: e.target.value,
                          })
                        }
                        placeholder="e.g., SIMULATED-123456"
                        className="w-full px-3 py-2 text-sm font-mono border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-teal-700"
                      />
                    </div>
                  </div>
                </section>

                {/* Section 3: Claimant Information */}
                <section className="space-y-4">
                  <h2 className="font-display text-sm font-bold text-slate-900 border-b border-slate-100 pb-2">
                    03. Primary Claimant Information
                  </h2>
                  <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
                    <div>
                      <label className="block text-xs font-medium text-slate-700 mb-1">
                        Claimant Name *
                      </label>
                      <input
                        type="text"
                        required
                        value={deceasedForm.claimant_name}
                        onChange={(e) =>
                          setDeceasedForm({ ...deceasedForm, claimant_name: e.target.value })
                        }
                        className="w-full px-3 py-2 text-sm border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-teal-700"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-700 mb-1">
                        Relationship with Deceased *
                      </label>
                      <input
                        type="text"
                        required
                        value={deceasedForm.relationship}
                        onChange={(e) =>
                          setDeceasedForm({ ...deceasedForm, relationship: e.target.value })
                        }
                        placeholder="e.g., Spouse, Son, Daughter"
                        className="w-full px-3 py-2 text-sm border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-teal-700"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-700 mb-1">
                        Claimant Type *
                      </label>
                      <select
                        value={deceasedForm.claimant_type}
                        onChange={(e) =>
                          setDeceasedForm({
                            ...deceasedForm,
                            claimant_type: e.target.value as 'Nominee' | 'Legal Heir',
                          })
                        }
                        className="w-full px-3 py-2 text-sm border border-slate-300 rounded-md bg-white focus:outline-none focus:ring-2 focus:ring-teal-700"
                      >
                        <option value="Nominee">Nominee</option>
                        <option value="Legal Heir">Legal Heir</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-700 mb-1">
                        Claimant Email *
                      </label>
                      <input
                        type="email"
                        required
                        value={deceasedForm.claimant_email}
                        onChange={(e) =>
                          setDeceasedForm({ ...deceasedForm, claimant_email: e.target.value })
                        }
                        className="w-full px-3 py-2 text-sm border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-teal-700"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-700 mb-1">
                        Claimant Mobile Number *
                      </label>
                      <input
                        type="tel"
                        required
                        value={deceasedForm.claimant_phone}
                        onChange={(e) =>
                          setDeceasedForm({ ...deceasedForm, claimant_phone: e.target.value })
                        }
                        className="w-full px-3 py-2 text-sm border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-teal-700"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-700 mb-1">
                        Death Certificate & Supporting Docs
                      </label>
                      <label className="flex items-center gap-2 px-3 py-2 text-xs border border-dashed border-slate-300 rounded-md cursor-pointer hover:bg-slate-50">
                        <Upload className="w-4 h-4 text-teal-700 shrink-0" />
                        <span className="truncate text-slate-600">
                          {deceasedFiles?.length
                            ? `${deceasedFiles.length} file(s) selected`
                            : 'Upload PDF, PNG, JPG, or TXT'}
                        </span>
                        <input
                          type="file"
                          multiple
                          accept=".pdf,.png,.jpg,.jpeg,.txt"
                          onChange={(e) => setDeceasedFiles(e.target.files)}
                          className="hidden"
                        />
                      </label>
                    </div>
                  </div>
                </section>

                <div className="pt-4 border-t border-slate-200 flex items-center justify-end gap-3">
                  <button
                    type="button"
                    onClick={() => setTab('overview')}
                    className="px-4 py-2 text-sm font-medium text-slate-700 border border-slate-300 rounded-md hover:bg-slate-50"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={submittingDeceased}
                    className="px-6 py-2.5 text-sm font-semibold text-white bg-teal-700 rounded-md hover:bg-teal-800 disabled:opacity-60 transition-colors"
                  >
                    {submittingDeceased
                      ? 'Submitting Record...'
                      : 'Submit for Registry Verification'}
                  </button>
                </div>
              </form>
            </div>
          ) : tab === 'records' ? (
            <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
              <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between gap-4">
                <div>
                  <h1 className="font-display text-lg font-bold text-slate-900">
                    Submitted Death Records
                  </h1>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Track verification progress and open discovered institutional matches once approved.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setTab('submit')}
                  className="px-3.5 py-2 text-xs font-semibold text-white bg-[#0B1F3A] rounded-md hover:bg-slate-800 whitespace-nowrap"
                >
                  New Submission
                </button>
              </div>

              {deceasedRecords.length === 0 ? (
                <div className="p-10 text-center text-sm text-slate-500">
                  No deceased records submitted yet. Click &ldquo;New Submission&rdquo; to begin.
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="border-b border-slate-200 bg-slate-50 text-xs font-semibold text-slate-600">
                        <th className="py-3 px-4">Deceased Name</th>
                        <th className="py-3 px-4">Certificate Ref</th>
                        <th className="py-3 px-4">Sample ID Ref</th>
                        <th className="py-3 px-4">City / State</th>
                        <th className="py-3 px-4">Status</th>
                        <th className="py-3 px-4 text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 text-sm">
                      {deceasedRecords.map((rec) => (
                        <tr key={rec.id} className="hover:bg-slate-50/70">
                          <td className="py-3.5 px-4 font-medium text-slate-900">
                            <div>{rec.full_name}</div>
                            <div className="text-xs text-slate-500 font-normal tabular-nums">
                              DOB {formatDate(rec.date_of_birth)} · DOD {formatDate(rec.date_of_death)}
                            </div>
                          </td>
                          <td className="py-3.5 px-4 font-mono text-xs text-slate-700">
                            {rec.death_certificate_ref}
                          </td>
                          <td className="py-3.5 px-4 font-mono text-xs text-slate-700">
                            {rec.sample_identity_ref}
                          </td>
                          <td className="py-3.5 px-4 text-xs text-slate-600">
                            {rec.last_city}, {rec.last_state}
                          </td>
                          <td className="py-3.5 px-4">
                            <span className={`text-xs font-semibold ${getStatusTextClass(rec.verification_status)}`}>
                              {rec.verification_status}
                            </span>
                            {rec.admin_notes && (
                              <div className="text-[11px] text-slate-500 mt-0.5 max-w-xs truncate">
                                {rec.admin_notes}
                              </div>
                            )}
                          </td>
                          <td className="py-3.5 px-4 text-right whitespace-nowrap space-x-3">
                            <button
                              type="button"
                              onClick={() => handleOpenDeceasedDetail(rec.id)}
                              className="text-xs font-medium text-slate-700 hover:text-slate-950 underline underline-offset-2"
                            >
                              Documents
                            </button>
                            {rec.verification_status === 'Approved' && (
                              <button
                                type="button"
                                onClick={() => setTab('assets')}
                                className="text-xs font-semibold text-teal-700 hover:text-teal-900 underline underline-offset-2"
                              >
                                View Assets
                              </button>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          ) : tab === 'assets' ? (
            <div className="space-y-6">
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 flex items-start gap-3">
                <ShieldAlert className="w-5 h-5 text-amber-800 shrink-0 mt-0.5" />
                <div className="text-xs text-amber-950 leading-relaxed">
                  <span className="font-semibold">Important Discovery Notice:</span> Results below
                  represent weighted potential matches across participating institutions,{' '}
                  <span className="font-semibold">not confirmed legal ownership</span>. Full account
                  references remain masked until Claimant / Nominee / Legal Heir verification is
                  approved, and final payout decisions rest solely with the financial institution.
                </div>
              </div>

              {assets.length === 0 ? (
                <div className="bg-white border border-slate-200 rounded-lg p-10 text-center">
                  <Search className="w-8 h-8 text-slate-300 mx-auto mb-3" />
                  <h2 className="font-display text-base font-bold text-slate-900">
                    No Discovered Assets Yet
                  </h2>
                  <p className="text-sm text-slate-500 mt-1 max-w-md mx-auto">
                    Asset discovery runs automatically as soon as an Administrator approves a submitted death record.
                  </p>
                </div>
              ) : (
                [
                  {
                    title: 'Bank Deposits (Savings & Fixed Deposits)',
                    icon: <Building2 className="w-4 h-4 text-[#0B1F3A]" />,
                    items: bankAssets,
                  },
                  {
                    title: 'Insurance Policies',
                    icon: <ShieldAlert className="w-4 h-4 text-teal-700" />,
                    items: insuranceAssets,
                  },
                  {
                    title: 'Mutual Fund Investments',
                    icon: <TrendingUp className="w-4 h-4 text-amber-700" />,
                    items: mfAssets,
                  },
                ].map((group) => (
                  <section key={group.title} className="space-y-3">
                    <div className="flex items-center justify-between border-b border-slate-200 pb-2">
                      <h2 className="font-display text-base font-bold text-slate-900 flex items-center gap-2">
                        {group.icon}
                        {group.title}
                      </h2>
                      <span className="font-mono tabular-nums text-xs text-slate-500">
                        {group.items.length} potential match{group.items.length === 1 ? '' : 'es'}
                      </span>
                    </div>

                    {group.items.length === 0 ? (
                      <p className="text-xs text-slate-500 py-3">
                        No potential matches found in this category.
                      </p>
                    ) : (
                      <div className="grid md:grid-cols-2 gap-4">
                        {group.items.map((match) => (
                          <div
                            key={match.id}
                            className="bg-white border border-slate-200 rounded-lg p-5 flex flex-col justify-between space-y-4"
                          >
                            <div>
                              <div className="text-xs text-slate-500 flex items-center gap-2 flex-wrap">
                                <span>{formatCategoryLabel(match.category)}</span>
                                <span aria-hidden="true">·</span>
                                <span className={`font-semibold ${getStatusTextClass(match.outcome_tier)}`}>
                                  {match.outcome_tier} ({match.matching_score}/100)
                                </span>
                                <span aria-hidden="true">·</span>
                                <span>Potential Match</span>
                              </div>
                              <h3 className="font-display text-base font-bold text-slate-900 mt-1.5">
                                {match.institution_name}
                              </h3>
                              <p className="text-xs text-slate-600 mt-0.5">
                                {match.sub_category} · Deceased: {match.deceased_name}
                              </p>

                              <div className="mt-4 pt-3 border-t border-slate-100 grid grid-cols-2 gap-3 text-xs">
                                <div>
                                  <div className="text-slate-500">Reference</div>
                                  <div className="font-mono font-medium text-slate-900 mt-0.5">
                                    {match.masked_ref}
                                  </div>
                                </div>
                                <div>
                                  <div className="text-slate-500">Simulated Asset Value</div>
                                  <div className="font-mono tabular-nums font-bold text-slate-900 mt-0.5">
                                    {formatINR(match.fictional_amount)}
                                  </div>
                                </div>
                              </div>
                            </div>

                            <div className="pt-3 border-t border-slate-100 flex items-center justify-between gap-3">
                              <div className="text-xs">
                                <span className="text-slate-500">Claim Status: </span>
                                <span
                                  className={`font-semibold ${getStatusTextClass(
                                    match.claim_status || 'Not Initiated'
                                  )}`}
                                >
                                  {match.claim_status || 'Not Initiated'}
                                </span>
                              </div>
                              <button
                                type="button"
                                onClick={() => setSelectedAsset(match)}
                                className="px-3.5 py-1.5 text-xs font-semibold text-white bg-[#0B1F3A] rounded-md hover:bg-slate-800 transition-colors whitespace-nowrap"
                              >
                                View Details
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </section>
                ))
              )}
            </div>
          ) : tab === 'claimants' ? (
            <div className="grid lg:grid-cols-12 gap-6">
              <div className="lg:col-span-5 bg-white border border-slate-200 rounded-lg p-6">
                <h1 className="font-display text-lg font-bold text-slate-900">
                  Submit Claimant Verification
                </h1>
                <p className="text-xs text-slate-600 mt-1 mb-5">
                  Upload nominee or legal heir identity and relationship proofs. Administrator approval is required before initiating an institutional claim.
                </p>

                <form onSubmit={handleSubmitClaimant} className="space-y-4">
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">
                      Deceased Family Member *
                    </label>
                    <select
                      required
                      value={claimantForm.deceased_person_id}
                      onChange={(e) =>
                        setClaimantForm({ ...claimantForm, deceased_person_id: e.target.value })
                      }
                      className="w-full px-3 py-2 text-sm border border-slate-300 rounded-md bg-white"
                    >
                      <option value="">Select submitted record...</option>
                      {deceasedRecords.map((d) => (
                        <option key={d.id} value={d.id}>
                          {d.full_name} ({d.death_certificate_ref})
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">
                      Claimant Full Name *
                    </label>
                    <input
                      type="text"
                      required
                      value={claimantForm.full_name}
                      onChange={(e) =>
                        setClaimantForm({ ...claimantForm, full_name: e.target.value })
                      }
                      className="w-full px-3 py-2 text-sm border border-slate-300 rounded-md"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-medium text-slate-700 mb-1">
                        Relationship *
                      </label>
                      <input
                        type="text"
                        required
                        value={claimantForm.relationship}
                        onChange={(e) =>
                          setClaimantForm({ ...claimantForm, relationship: e.target.value })
                        }
                        className="w-full px-3 py-2 text-sm border border-slate-300 rounded-md"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-700 mb-1">
                        Claimant Type *
                      </label>
                      <select
                        value={claimantForm.claimant_type}
                        onChange={(e) =>
                          setClaimantForm({
                            ...claimantForm,
                            claimant_type: e.target.value as 'Nominee' | 'Legal Heir',
                          })
                        }
                        className="w-full px-3 py-2 text-sm border border-slate-300 rounded-md bg-white"
                      >
                        <option value="Nominee">Nominee</option>
                        <option value="Legal Heir">Legal Heir</option>
                      </select>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-medium text-slate-700 mb-1">
                        Email *
                      </label>
                      <input
                        type="email"
                        required
                        value={claimantForm.email}
                        onChange={(e) =>
                          setClaimantForm({ ...claimantForm, email: e.target.value })
                        }
                        className="w-full px-3 py-2 text-sm border border-slate-300 rounded-md"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-700 mb-1">
                        Mobile *
                      </label>
                      <input
                        type="tel"
                        required
                        value={claimantForm.phone}
                        onChange={(e) =>
                          setClaimantForm({ ...claimantForm, phone: e.target.value })
                        }
                        className="w-full px-3 py-2 text-sm border border-slate-300 rounded-md"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">
                      Supporting Proofs (Nominee ID / Legal Heir Certificate)
                    </label>
                    <label className="flex items-center gap-2 px-3 py-2 text-xs border border-dashed border-slate-300 rounded-md cursor-pointer hover:bg-slate-50">
                      <Upload className="w-4 h-4 text-teal-700" />
                      <span className="truncate text-slate-600">
                        {claimantFiles?.length
                          ? `${claimantFiles.length} document(s) attached`
                          : 'Attach supporting PDF / Image / TXT'}
                      </span>
                      <input
                        type="file"
                        multiple
                        accept=".pdf,.png,.jpg,.jpeg,.txt"
                        onChange={(e) => setClaimantFiles(e.target.files)}
                        className="hidden"
                      />
                    </label>
                  </div>
                  <button
                    type="submit"
                    disabled={submittingClaimant}
                    className="w-full py-2.5 text-sm font-semibold text-white bg-teal-700 rounded-md hover:bg-teal-800 disabled:opacity-60"
                  >
                    {submittingClaimant ? 'Submitting...' : 'Submit Claimant Verification'}
                  </button>
                </form>
              </div>

              <div className="lg:col-span-7 bg-white border border-slate-200 rounded-lg p-6">
                <h2 className="font-display text-base font-bold text-slate-900 mb-4">
                  Submitted Claimant Verification Requests
                </h2>
                {claimants.length === 0 ? (
                  <p className="text-sm text-slate-500">No claimant verification dossiers yet.</p>
                ) : (
                  <div className="divide-y divide-slate-200">
                    {claimants.map((cl) => (
                      <div key={cl.id} className="py-4 space-y-2">
                        <div className="flex items-start justify-between gap-4">
                          <div>
                            <div className="text-sm font-semibold text-slate-900">
                              {cl.full_name} ·{' '}
                              <span className="font-normal text-slate-600">
                                {cl.claimant_type} ({cl.relationship})
                              </span>
                            </div>
                            <div className="text-xs text-slate-500 mt-0.5">
                              For {cl.deceased_name} ({cl.death_certificate_ref}) · {cl.email} ·{' '}
                              {cl.phone}
                            </div>
                          </div>
                          <span
                            className={`text-xs font-semibold shrink-0 ${getStatusTextClass(
                              cl.verification_status
                            )}`}
                          >
                            {cl.verification_status}
                          </span>
                        </div>
                        {cl.admin_notes && (
                          <p className="text-xs text-slate-600 bg-slate-50 p-2 rounded border border-slate-200">
                            Admin Note: {cl.admin_notes}
                          </p>
                        )}
                        {cl.documents && cl.documents.length > 0 && (
                          <div className="flex flex-wrap gap-3 pt-1">
                            {cl.documents.map((d) => (
                              <button
                                key={d.id}
                                type="button"
                                onClick={() => setViewerDoc(d)}
                                className="text-xs font-medium text-teal-700 hover:underline inline-flex items-center gap-1"
                              >
                                <FileText className="w-3.5 h-3.5" />
                                {d.file_name}
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          ) : (
            /* Claim Tracking Tab */
            <div className="space-y-4">
              <div className="bg-white border border-slate-200 rounded-lg p-6">
                <h1 className="font-display text-lg font-bold text-slate-900">
                  Claim Management & Live Timeline
                </h1>
                <p className="text-xs text-slate-500 mt-1">
                  Every institutional status transition and nodal officer instruction is persisted and reflected here.
                </p>
              </div>

              {claims.length === 0 ? (
                <div className="bg-white border border-slate-200 rounded-lg p-10 text-center text-sm text-slate-500">
                  No claims have been submitted yet. Open Discovered Assets to initiate a claim once claimant verification is approved.
                </div>
              ) : (
                claims.map((claim) => (
                  <div
                    key={claim.id}
                    className="bg-white border border-slate-200 rounded-lg p-6 space-y-5"
                  >
                    <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-100 pb-4">
                      <div>
                        <div className="text-xs text-slate-500 flex items-center gap-2">
                          <span className="font-mono font-semibold text-slate-700">
                            {claim.claim_number}
                          </span>
                          <span aria-hidden="true">·</span>
                          <span>{formatCategoryLabel(claim.asset_category)}</span>
                          <span aria-hidden="true">·</span>
                          <span className="tabular-nums">
                            Submitted {formatDate(claim.submitted_at)}
                          </span>
                        </div>
                        <h2 className="font-display text-lg font-bold text-slate-900 mt-1">
                          {claim.institution_name} — {claim.sub_category}
                        </h2>
                        <p className="text-xs text-slate-600 mt-0.5">
                          Deceased: {claim.deceased_name} · Claimant: {claim.claimant_name} (
                          {claim.claimant_type}) · Simulated Amount:{' '}
                          <span className="font-mono font-semibold text-slate-900">
                            {formatINR(claim.fictional_amount)}
                          </span>
                        </p>
                      </div>

                      <div className="text-left md:text-right shrink-0">
                        <div className="text-xs text-slate-500">Current Status</div>
                        <div
                          className={`text-base font-bold mt-0.5 ${getStatusTextClass(
                            claim.status
                          )}`}
                        >
                          {claim.status}
                        </div>
                        <div className="text-[11px] text-slate-400 tabular-nums">
                          Updated {formatDateTime(claim.updated_at)}
                        </div>
                      </div>
                    </div>

                    {claim.institution_comments && (
                      <div className="bg-slate-50 border border-slate-200 rounded p-3 text-xs text-slate-700">
                        <span className="font-semibold text-slate-900">
                          Latest Institution Instruction:
                        </span>{' '}
                        {claim.institution_comments}
                      </div>
                    )}

                    {/* Status History Timeline */}
                    <div className="space-y-3">
                      <div className="text-xs font-semibold text-slate-700">Status History</div>
                      <div className="space-y-2.5">
                        {claim.status_history.map((step, i) => (
                          <div key={i} className="flex items-start gap-3 text-xs">
                            <Clock className="w-3.5 h-3.5 text-teal-700 shrink-0 mt-0.5" />
                            <div>
                              <span className={`font-semibold ${getStatusTextClass(step.status)}`}>
                                {step.status}
                              </span>
                              <span className="text-slate-400 mx-1.5">·</span>
                              <span className="text-slate-600">{step.actor}</span>
                              <span className="text-slate-400 mx-1.5">·</span>
                              <span className="text-slate-400 tabular-nums">
                                {formatDateTime(step.timestamp)}
                              </span>
                              <div className="text-slate-600 mt-0.5">{step.comment}</div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          )}
        </main>
      </div>

      {/* Asset Detail & Initiate Claim Modal */}
      {selectedAsset && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4">
          <div className="bg-white border border-slate-200 rounded-lg max-w-2xl w-full max-h-[90vh] overflow-y-auto p-6 space-y-5 shadow-xl">
            <div className="flex items-start justify-between gap-4 border-b border-slate-200 pb-4">
              <div>
                <p className="text-xs text-slate-500">
                  {formatCategoryLabel(selectedAsset.category)} · Potential Match (Not Confirmed Ownership)
                </p>
                <h2 className="font-display text-xl font-bold text-slate-900 mt-1">
                  {selectedAsset.institution_name}
                </h2>
                <p className="text-xs text-slate-600 mt-0.5">{selectedAsset.sub_category}</p>
              </div>
              <button
                type="button"
                onClick={() => setSelectedAsset(null)}
                className="p-1.5 text-slate-500 hover:text-slate-900 rounded hover:bg-slate-100"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="grid sm:grid-cols-2 gap-4 text-xs bg-slate-50 p-4 rounded border border-slate-200">
              <div>
                <span className="text-slate-500">Account / Policy / Folio Reference</span>
                <div className="font-mono font-semibold text-slate-900 mt-0.5">
                  {selectedAsset.account_or_policy_ref}
                </div>
                {selectedAsset.claimant_verification_status !== 'Approved' && (
                  <div className="text-[11px] text-amber-700 mt-0.5">
                    Masked until Claimant Verification is Approved
                  </div>
                )}
              </div>
              <div>
                <span className="text-slate-500">Simulated Asset Value</span>
                <div className="font-mono tabular-nums text-base font-bold text-slate-900 mt-0.5">
                  {formatINR(selectedAsset.fictional_amount)}
                </div>
              </div>
              <div>
                <span className="text-slate-500">Branch / Division</span>
                <div className="text-slate-800 font-medium mt-0.5">
                  {selectedAsset.city_or_branch}
                </div>
              </div>
              <div>
                <span className="text-slate-500">Recorded Nominee Reference</span>
                <div className="text-slate-800 font-medium mt-0.5">
                  {selectedAsset.claimant_verification_status === 'Approved'
                    ? selectedAsset.nominee_ref || 'On file'
                    : 'Restricted pending verification'}
                </div>
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs">
                <span className="font-semibold text-slate-900">Weighted Matching Breakdown</span>
                <span className={`font-mono font-bold ${getStatusTextClass(selectedAsset.outcome_tier)}`}>
                  {selectedAsset.matching_score} / 100 · {selectedAsset.outcome_tier}
                </span>
              </div>
              <div className="grid grid-cols-4 gap-2 text-center text-xs bg-slate-50 p-3 rounded border border-slate-200">
                <div>
                  <div className="text-slate-500">ID Ref (50)</div>
                  <div className="font-mono font-bold text-slate-900">
                    {selectedAsset.score_breakdown.identity_ref}
                  </div>
                </div>
                <div>
                  <div className="text-slate-500">Name (25)</div>
                  <div className="font-mono font-bold text-slate-900">
                    {selectedAsset.score_breakdown.name_similarity}
                  </div>
                </div>
                <div>
                  <div className="text-slate-500">DOB (15)</div>
                  <div className="font-mono font-bold text-slate-900">
                    {selectedAsset.score_breakdown.date_of_birth}
                  </div>
                </div>
                <div>
                  <div className="text-slate-500">Other (10)</div>
                  <div className="font-mono font-bold text-slate-900">
                    {selectedAsset.score_breakdown.other_details}
                  </div>
                </div>
              </div>
              <ul className="text-xs text-slate-600 list-disc pl-5 space-y-1">
                {selectedAsset.matching_reasons.map((r, i) => (
                  <li key={i}>{r}</li>
                ))}
              </ul>
            </div>

            {selectedAsset.claim_id ? (
              <div className="p-4 rounded bg-emerald-50 border border-emerald-200 text-xs text-emerald-900 flex items-center justify-between">
                <span>
                  Claim <span className="font-mono font-semibold">{selectedAsset.claim_number}</span>{' '}
                  is currently <span className="font-semibold">{selectedAsset.claim_status}</span>.
                </span>
                <button
                  type="button"
                  onClick={() => {
                    setSelectedAsset(null);
                    setTab('claims');
                  }}
                  className="font-semibold underline"
                >
                  Open Claim Tracker
                </button>
              </div>
            ) : selectedAsset.claimant_verification_status === 'Approved' ? (
              <div className="space-y-3 pt-3 border-t border-slate-200">
                <div className="flex items-center gap-2 text-xs font-semibold text-emerald-700">
                  <CheckCircle2 className="w-4 h-4" />
                  Claimant Verification Approved ({selectedAsset.claimant_name})
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Notes for Institution Nodal Officer
                  </label>
                  <textarea
                    rows={2}
                    value={claimNotes}
                    onChange={(e) => setClaimNotes(e.target.value)}
                    placeholder="Provide any bank account preference or supporting remarks for claim processing..."
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-md"
                  />
                </div>
                <button
                  type="button"
                  disabled={submittingClaim}
                  onClick={() => handleInitiateClaim(selectedAsset)}
                  className="w-full py-2.5 text-sm font-semibold text-white bg-teal-700 rounded-md hover:bg-teal-800 disabled:opacity-60"
                >
                  {submittingClaim ? 'Initiating Claim...' : 'Initiate Institutional Claim'}
                </button>
              </div>
            ) : (
              <div className="p-4 rounded bg-amber-50 border border-amber-200 text-xs text-amber-950 space-y-2">
                <p>
                  <span className="font-semibold">Claimant Verification Required:</span> Current status is{' '}
                  <span className="font-semibold">
                    {selectedAsset.claimant_verification_status || 'Pending'}
                  </span>
                  . Submit claimant proofs and wait for Administrator approval before initiating a claim.
                </p>
                <button
                  type="button"
                  onClick={() => {
                    setSelectedAsset(null);
                    setTab('claimants');
                  }}
                  className="font-semibold text-teal-800 underline"
                >
                  Go to Claimant Verification
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Deceased Record Documents Modal */}
      {selectedDeceasedDetail && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4">
          <div className="bg-white border border-slate-200 rounded-lg max-w-lg w-full p-6 space-y-4 shadow-xl">
            <div className="flex items-center justify-between border-b border-slate-200 pb-3">
              <div>
                <h3 className="font-display text-base font-bold text-slate-900">
                  {selectedDeceasedDetail.record.full_name}
                </h3>
                <p className="text-xs font-mono text-slate-500">
                  {selectedDeceasedDetail.record.death_certificate_ref}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setSelectedDeceasedDetail(null)}
                className="p-1 text-slate-500 hover:text-slate-900"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-2">
              <div className="text-xs font-semibold text-slate-700">Uploaded Documents</div>
              {selectedDeceasedDetail.documents.length === 0 ? (
                <p className="text-xs text-slate-500">No files attached to this record.</p>
              ) : (
                <div className="divide-y divide-slate-100 border border-slate-200 rounded">
                  {selectedDeceasedDetail.documents.map((doc) => (
                    <div
                      key={doc.id}
                      className="p-3 flex items-center justify-between gap-3 text-xs"
                    >
                      <div className="min-w-0">
                        <div className="font-medium text-slate-900 truncate">{doc.file_name}</div>
                        <div className="text-slate-500">{doc.document_type}</div>
                      </div>
                      <button
                        type="button"
                        onClick={() => setViewerDoc(doc)}
                        className="px-3 py-1 font-semibold text-teal-700 border border-teal-700/30 rounded hover:bg-teal-50 shrink-0"
                      >
                        Inspect
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      <DocumentViewerModal doc={viewerDoc} onClose={() => setViewerDoc(null)} />

      <NotificationCenter
        open={notifOpen}
        onClose={() => setNotifOpen(false)}
        notifications={notifications}
        onMarkRead={handleMarkRead}
        onMarkAllRead={handleMarkAllRead}
        onNavigate={(path) => {
          if (path.includes('assets')) setTab('assets');
          else if (path.includes('claims')) setTab('claims');
          else setTab('overview');
        }}
      />
    </div>
  );
}
