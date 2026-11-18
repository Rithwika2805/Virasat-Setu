import React, { useCallback, useEffect, useState } from 'react';
import {
  Activity,
  Bell,
  Building2,
  CheckCircle2,
  FileSearch,
  FileText,
  LayoutDashboard,
  LogOut,
  Plus,
  RefreshCw,
  Search,
  UserCheck,
  X,
} from 'lucide-react';
import { BrandMark } from '../components/BrandMark';
import { CategoryBreakdownChart, InstitutionBarChart } from '../components/DataCharts';
import { DocumentViewerModal } from '../components/DocumentViewerModal';
import { NotificationCenter } from '../components/NotificationCenter';
import { useAuth } from '../context/AuthContext';
import { apiRequest } from '../services/api';
import type {
  AssetMatch,
  AuditLog,
  ClaimantRecord,
  ClaimantVerificationStatus,
  DeceasedRecord,
  DocumentItem,
  NotificationItem,
} from '../types';
import {
  formatCategoryLabel,
  formatDate,
  formatDateTime,
  formatINR,
  getStatusTextClass,
} from '../utils/format';

type AdminTab = 'overview' | 'deceased' | 'matches' | 'claimants' | 'institutions' | 'logs';

export function AdminDashboard({ onBackHome }: { onBackHome: () => void }) {
  const { user, logout } = useAuth();
  const [tab, setTab] = useState<AdminTab>('overview');
  const [loading, setLoading] = useState(true);
  const [banner, setBanner] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  const [overview, setOverview] = useState<any>(null);
  const [deceased, setDeceased] = useState<DeceasedRecord[]>([]);
  const [matches, setMatches] = useState<AssetMatch[]>([]);
  const [claimants, setClaimants] = useState<ClaimantRecord[]>([]);
  const [representatives, setRepresentatives] = useState<any[]>([]);
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [notifOpen, setNotifOpen] = useState(false);

  // Filters
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('All');

  // Review modals
  const [inspectDeceased, setInspectDeceased] = useState<{
    record: DeceasedRecord;
    documents: DocumentItem[];
    claimants: ClaimantRecord[];
  } | null>(null);
  const [adminNotes, setAdminNotes] = useState('');
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [viewerDoc, setViewerDoc] = useState<DocumentItem | null>(null);

  // Add Institution Modal
  const [showAddInst, setShowAddInst] = useState(false);
  const [instForm, setInstForm] = useState({
    name: '',
    code: '',
    category: 'bank' as 'bank' | 'insurance' | 'mutual_fund',
    contact_email: '',
    nodal_officer_name: '',
    city: '',
  });

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [ov, rec, notif] = await Promise.all([
        apiRequest<any>('/api/admin/overview'),
        apiRequest<any>('/api/admin/records'),
        apiRequest<{ notifications: NotificationItem[] }>('/api/notifications'),
      ]);
      setOverview(ov);
      setDeceased(rec.deceased || []);
      setMatches(rec.matches || []);
      setClaimants(rec.claimants || []);
      setRepresentatives(rec.representatives || []);
      setLogs(rec.logs || []);
      setNotifications(notif.notifications || []);
    } catch (err: any) {
      setBanner({ type: 'err', text: err.message || 'Failed to load admin console.' });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const openInspectDeceased = async (id: string) => {
    try {
      const res = await apiRequest<{
        record: DeceasedRecord;
        documents: DocumentItem[];
        claimants: ClaimantRecord[];
      }>(`/api/deceased/${id}`);
      setInspectDeceased(res);
      setAdminNotes(res.record.admin_notes || '');
    } catch (err: any) {
      setBanner({ type: 'err', text: err.message });
    }
  };

  const handleVerifyDeceased = async (
    id: string,
    status: 'Approved' | 'Rejected' | 'Additional Information Required'
  ) => {
    setProcessingId(id);
    setBanner(null);
    try {
      const res = await apiRequest<{ message: string }>(`/api/deceased/${id}/verify`, {
        method: 'PATCH',
        body: JSON.stringify({ status, admin_notes: adminNotes }),
      });
      setBanner({ type: 'ok', text: res.message });
      setInspectDeceased(null);
      await loadData();
    } catch (err: any) {
      setBanner({ type: 'err', text: err.message });
    } finally {
      setProcessingId(null);
    }
  };

  const handleRerunMatching = async (deceasedId: string) => {
    setProcessingId(deceasedId);
    try {
      const res = await apiRequest<{ scannedCount: number; newMatchesCount: number }>(
        `/api/matching/${deceasedId}`,
        { method: 'POST' }
      );
      setBanner({
        type: 'ok',
        text: `Asset matching scanned ${res.scannedCount} records and added ${res.newMatchesCount} new match(es).`,
      });
      await loadData();
    } catch (err: any) {
      setBanner({ type: 'err', text: err.message });
    } finally {
      setProcessingId(null);
    }
  };

  const handleReviewMatch = async (
    matchId: string,
    reviewStatus: 'Approved Match' | 'Flagged for Manual Review' | 'Rejected Match'
  ) => {
    setProcessingId(matchId);
    try {
      await apiRequest(`/api/admin/matches/${matchId}`, {
        method: 'PATCH',
        body: JSON.stringify({ review_status: reviewStatus }),
      });
      setBanner({ type: 'ok', text: `Match status updated to ${reviewStatus}.` });
      await loadData();
    } catch (err: any) {
      setBanner({ type: 'err', text: err.message });
    } finally {
      setProcessingId(null);
    }
  };

  const handleVerifyClaimant = async (
    claimantId: string,
    status: ClaimantVerificationStatus
  ) => {
    setProcessingId(claimantId);
    try {
      await apiRequest(`/api/claimants/${claimantId}/verify`, {
        method: 'PATCH',
        body: JSON.stringify({
          status,
          admin_notes:
            status === 'Approved'
              ? 'Identity & relationship dossier approved by Registry Administrator.'
              : `Updated to ${status} by Registry Administrator.`,
        }),
      });
      setBanner({ type: 'ok', text: `Claimant verification updated to ${status}.` });
      await loadData();
    } catch (err: any) {
      setBanner({ type: 'err', text: err.message });
    } finally {
      setProcessingId(null);
    }
  };

  const handleAddInstitution = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await apiRequest('/api/institutions', {
        method: 'POST',
        body: JSON.stringify(instForm),
      });
      setShowAddInst(false);
      setInstForm({
        name: '',
        code: '',
        category: 'bank',
        contact_email: '',
        nodal_officer_name: '',
        city: '',
      });
      setBanner({ type: 'ok', text: 'New participating financial institution registered.' });
      await loadData();
    } catch (err: any) {
      setBanner({ type: 'err', text: err.message });
    }
  };

  const filteredDeceased = deceased.filter((d) => {
    const matchesStatus = statusFilter === 'All' || d.verification_status === statusFilter;
    const term = searchTerm.trim().toLowerCase();
    const matchesSearch =
      !term ||
      d.full_name.toLowerCase().includes(term) ||
      d.death_certificate_ref.toLowerCase().includes(term) ||
      d.sample_identity_ref.toLowerCase().includes(term) ||
      d.last_city.toLowerCase().includes(term);
    return matchesStatus && matchesSearch;
  });

  const unreadCount = notifications.filter((n) => !n.is_read).length;

  const navItems: Array<{ id: AdminTab; label: string; icon: React.ReactNode; count?: number }> = [
    { id: 'overview', label: 'Overview', icon: <LayoutDashboard className="w-4 h-4" /> },
    {
      id: 'deceased',
      label: 'Death Records',
      icon: <FileText className="w-4 h-4" />,
      count: overview?.stats?.pendingVerifications,
    },
    {
      id: 'matches',
      label: 'Asset Matches',
      icon: <FileSearch className="w-4 h-4" />,
      count: matches.length,
    },
    {
      id: 'claimants',
      label: 'Claimants',
      icon: <UserCheck className="w-4 h-4" />,
      count: claimants.filter((c) => c.verification_status === 'Pending').length,
    },
    {
      id: 'institutions',
      label: 'Institutions',
      icon: <Building2 className="w-4 h-4" />,
      count: overview?.institutionStats?.length,
    },
    { id: 'logs', label: 'Activity Logs', icon: <Activity className="w-4 h-4" /> },
  ];

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col lg:flex-row">
      {/* Sidebar */}
      <aside className="lg:w-64 bg-[#0B1F3A] text-slate-200 flex flex-col shrink-0">
        <div className="h-16 px-5 border-b border-slate-800 flex items-center">
          <button type="button" onClick={onBackHome}>
            <BrandMark dark size="sm" />
          </button>
        </div>

        <div className="px-5 py-4 border-b border-slate-800">
          <p className="text-xs text-amber-300 font-medium">Central Registry Admin</p>
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
                  <span className="font-mono tabular-nums text-[11px] opacity-85">
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
            className="w-full flex items-center gap-2 px-3 py-2 text-xs font-medium text-slate-300 hover:text-white hover:bg-slate-800 rounded-md"
          >
            <LogOut className="w-4 h-4" />
            Sign Out
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <div className="flex-1 flex flex-col min-w-0">
        <header className="h-16 bg-white border-b border-slate-200 px-6 flex items-center justify-between gap-4">
          <div className="text-xs text-slate-500 truncate">
            <span>Administrator Console</span>
            <span className="mx-2">/</span>
            <span className="font-semibold text-slate-900">
              {navItems.find((i) => i.id === tab)?.label}
            </span>
          </div>

          <div className="flex items-center gap-3 shrink-0">
            <button
              type="button"
              onClick={loadData}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 border border-slate-200 rounded-md hover:bg-slate-50"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              Refresh
            </button>
            <button
              type="button"
              onClick={() => setNotifOpen(true)}
              className="inline-flex items-center gap-2 px-3 py-1.5 text-xs font-medium text-slate-700 border border-slate-200 rounded-md hover:bg-slate-50"
            >
              <Bell className="w-4 h-4" />
              Alerts
              <span className="font-mono tabular-nums font-semibold text-teal-700">
                {unreadCount}
              </span>
            </button>
          </div>
        </header>

        <main className="flex-1 p-6 max-w-7xl w-full mx-auto space-y-6">
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
              Loading administrator telemetry...
            </div>
          ) : tab === 'overview' && overview ? (
            <div className="space-y-6">
              {/* 7-Metric KPI Strip */}
              <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3">
                {[
                  { label: 'Registered Users', val: overview.stats.totalUsers },
                  { label: 'Deceased Records', val: overview.stats.totalDeceased },
                  {
                    label: 'Pending Review',
                    val: overview.stats.pendingVerifications,
                    accent: 'text-amber-700',
                  },
                  {
                    label: 'Verified Records',
                    val: overview.stats.verifiedRecords,
                    accent: 'text-emerald-700',
                  },
                  {
                    label: 'Asset Matches',
                    val: overview.stats.totalMatches,
                    accent: 'text-teal-700',
                  },
                  { label: 'Claims Initiated', val: overview.stats.claimsInitiated },
                  {
                    label: 'Claims Settled',
                    val: overview.stats.claimsSettled,
                    accent: 'text-[#0B1F3A]',
                  },
                ].map((kpi) => (
                  <div
                    key={kpi.label}
                    className="bg-white border border-slate-200 rounded-lg p-4"
                  >
                    <div className="text-[11px] text-slate-500 truncate">{kpi.label}</div>
                    <div
                      className={`font-mono tabular-nums text-2xl font-bold mt-1 ${
                        kpi.accent || 'text-slate-900'
                      }`}
                    >
                      {kpi.val}
                    </div>
                  </div>
                ))}
              </div>

              <div className="grid lg:grid-cols-12 gap-6">
                <div className="lg:col-span-7 bg-white border border-slate-200 rounded-lg p-6">
                  <h2 className="font-display text-base font-bold text-slate-900 mb-4">
                    Institution-Wise Matching & Claim Activity
                  </h2>
                  <InstitutionBarChart data={overview.institutionStats || []} />
                </div>

                <div className="lg:col-span-5 space-y-6">
                  <div className="bg-white border border-slate-200 rounded-lg p-6">
                    <h2 className="font-display text-base font-bold text-slate-900 mb-4">
                      Discovered Value by Asset Category
                    </h2>
                    <CategoryBreakdownChart data={overview.categoryBreakdown || []} />
                  </div>

                  <div className="bg-white border border-slate-200 rounded-lg p-6">
                    <h2 className="font-display text-base font-bold text-slate-900 mb-3">
                      Simulated Institutional Dataset Size
                    </h2>
                    <div className="divide-y divide-slate-100 text-xs">
                      {(overview.assetInventoryCounts || []).map((row: any) => (
                        <div key={row.category} className="py-2 flex justify-between">
                          <span className="text-slate-700 font-medium">
                            {formatCategoryLabel(row.category)} Records
                          </span>
                          <span className="font-mono tabular-nums font-bold text-slate-900">
                            {row.count}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          ) : tab === 'deceased' ? (
            <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
              <div className="p-5 border-b border-slate-200 flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                  <h1 className="font-display text-lg font-bold text-slate-900">
                    Death Record Management
                  </h1>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Approving a death record automatically executes the weighted matching algorithm across Bank, Insurance, and Mutual Fund registries.
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-3">
                  <div className="relative">
                    <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                    <input
                      type="text"
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      placeholder="Search name, cert ref, ID..."
                      className="pl-8 pr-3 py-1.5 text-xs border border-slate-300 rounded-md w-56"
                    />
                  </div>
                  <select
                    value={statusFilter}
                    onChange={(e) => setStatusFilter(e.target.value)}
                    className="px-3 py-1.5 text-xs border border-slate-300 rounded-md bg-white"
                  >
                    <option value="All">All Statuses</option>
                    <option value="Pending Verification">Pending Verification</option>
                    <option value="Approved">Approved</option>
                    <option value="Rejected">Rejected</option>
                    <option value="Additional Information Required">
                      Additional Information Required
                    </option>
                  </select>
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-slate-200 bg-slate-50 text-xs font-semibold text-slate-600">
                      <th className="py-3 px-4">Deceased Person</th>
                      <th className="py-3 px-4">Certificate / ID Ref</th>
                      <th className="py-3 px-4">Submitted By</th>
                      <th className="py-3 px-4">Status</th>
                      <th className="py-3 px-4 text-right">Matches</th>
                      <th className="py-3 px-4 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-xs">
                    {filteredDeceased.map((d) => (
                      <tr key={d.id} className="hover:bg-slate-50">
                        <td className="py-3 px-4">
                          <div className="font-semibold text-slate-900">{d.full_name}</div>
                          <div className="text-slate-500 tabular-nums">
                            DOB {formatDate(d.date_of_birth)} · {d.last_city}, {d.last_state}
                          </div>
                        </td>
                        <td className="py-3 px-4 font-mono">
                          <div className="text-slate-900">{d.death_certificate_ref}</div>
                          <div className="text-slate-500">{d.sample_identity_ref}</div>
                        </td>
                        <td className="py-3 px-4">
                          <div className="text-slate-800">{d.submitted_by_name}</div>
                          <div className="text-slate-500">{d.submitted_by_email}</div>
                        </td>
                        <td className="py-3 px-4">
                          <span className={`font-semibold ${getStatusTextClass(d.verification_status)}`}>
                            {d.verification_status}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-right font-mono tabular-nums font-bold text-slate-900">
                          {d.match_count ?? 0}
                        </td>
                        <td className="py-3 px-4 text-right whitespace-nowrap space-x-2">
                          <button
                            type="button"
                            onClick={() => openInspectDeceased(d.id)}
                            className="px-3 py-1.5 font-semibold text-white bg-[#0B1F3A] rounded hover:bg-slate-800"
                          >
                            Review & Verify
                          </button>
                          {d.verification_status === 'Approved' && (
                            <button
                              type="button"
                              disabled={processingId === d.id}
                              onClick={() => handleRerunMatching(d.id)}
                              className="px-2.5 py-1.5 font-medium text-teal-800 border border-teal-700/30 rounded hover:bg-teal-50"
                            >
                              Scan
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ) : tab === 'matches' ? (
            <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
              <div className="p-5 border-b border-slate-200">
                <h1 className="font-display text-lg font-bold text-slate-900">
                  Asset Match Management
                </h1>
                <p className="text-xs text-slate-500 mt-0.5">
                  Inspect weighted match scores, matching reasons, and approve, flag, or reject candidates.
                </p>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-slate-200 bg-slate-50 text-xs font-semibold text-slate-600">
                      <th className="py-3 px-4">Deceased / Cert</th>
                      <th className="py-3 px-4">Institution & Asset</th>
                      <th className="py-3 px-4">Score & Tier</th>
                      <th className="py-3 px-4">Matching Reasons</th>
                      <th className="py-3 px-4">Review Status</th>
                      <th className="py-3 px-4 text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-xs">
                    {matches.map((m) => (
                      <tr key={m.id} className="hover:bg-slate-50">
                        <td className="py-3 px-4">
                          <div className="font-semibold text-slate-900">{m.deceased_name}</div>
                          <div className="font-mono text-slate-500">{m.death_certificate_ref}</div>
                        </td>
                        <td className="py-3 px-4">
                          <div className="font-semibold text-slate-900">{m.institution_name}</div>
                          <div className="text-slate-600">
                            {formatCategoryLabel(m.category)} · {m.sub_category} ·{' '}
                            <span className="font-mono">{m.masked_ref}</span>
                          </div>
                          <div className="font-mono tabular-nums text-slate-800 mt-0.5">
                            {formatINR(m.fictional_amount)}
                          </div>
                        </td>
                        <td className="py-3 px-4">
                          <div className={`font-mono font-bold ${getStatusTextClass(m.outcome_tier)}`}>
                            {m.matching_score} / 100
                          </div>
                          <div className="text-slate-600">{m.outcome_tier}</div>
                        </td>
                        <td className="py-3 px-4 max-w-xs">
                          <ul className="list-disc pl-4 space-y-0.5 text-slate-600">
                            {m.matching_reasons.map((r, i) => (
                              <li key={i}>{r}</li>
                            ))}
                          </ul>
                        </td>
                        <td className="py-3 px-4">
                          <span className={`font-semibold ${getStatusTextClass(m.review_status)}`}>
                            {m.review_status}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-right whitespace-nowrap space-x-2">
                          <button
                            type="button"
                            disabled={processingId === m.id}
                            onClick={() => handleReviewMatch(m.id, 'Approved Match')}
                            className="text-emerald-700 font-semibold hover:underline"
                          >
                            Approve
                          </button>
                          <button
                            type="button"
                            disabled={processingId === m.id}
                            onClick={() => handleReviewMatch(m.id, 'Flagged for Manual Review')}
                            className="text-amber-700 font-semibold hover:underline"
                          >
                            Flag
                          </button>
                          <button
                            type="button"
                            disabled={processingId === m.id}
                            onClick={() => handleReviewMatch(m.id, 'Rejected Match')}
                            className="text-rose-700 font-semibold hover:underline"
                          >
                            Reject
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ) : tab === 'claimants' ? (
            <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
              <div className="p-5 border-b border-slate-200">
                <h1 className="font-display text-lg font-bold text-slate-900">
                  Claimant & Legal Heir Verification
                </h1>
                <p className="text-xs text-slate-500 mt-0.5">
                  Verify claimant relationship and proofs. Approval unlocks institutional claim submission for the family.
                </p>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-slate-200 bg-slate-50 text-xs font-semibold text-slate-600">
                      <th className="py-3 px-4">Claimant</th>
                      <th className="py-3 px-4">Deceased Record</th>
                      <th className="py-3 px-4">Type & Relation</th>
                      <th className="py-3 px-4">Documents</th>
                      <th className="py-3 px-4">Status</th>
                      <th className="py-3 px-4 text-right">Decision</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-xs">
                    {claimants.map((cl) => (
                      <tr key={cl.id} className="hover:bg-slate-50">
                        <td className="py-3 px-4">
                          <div className="font-semibold text-slate-900">{cl.full_name}</div>
                          <div className="text-slate-500">
                            {cl.email} · {cl.phone}
                          </div>
                        </td>
                        <td className="py-3 px-4">
                          <div className="font-medium text-slate-900">{cl.deceased_name}</div>
                          <div className="font-mono text-slate-500">{cl.death_certificate_ref}</div>
                        </td>
                        <td className="py-3 px-4">
                          <div className="font-medium text-slate-800">{cl.claimant_type}</div>
                          <div className="text-slate-500">{cl.relationship}</div>
                        </td>
                        <td className="py-3 px-4">
                          {cl.documents && cl.documents.length > 0 ? (
                            <div className="space-y-1">
                              {cl.documents.map((d) => (
                                <button
                                  key={d.id}
                                  type="button"
                                  onClick={() => setViewerDoc(d)}
                                  className="block text-teal-700 font-medium hover:underline truncate max-w-[160px]"
                                >
                                  {d.file_name}
                                </button>
                              ))}
                            </div>
                          ) : (
                            <span className="text-slate-400">Using death record docs</span>
                          )}
                        </td>
                        <td className="py-3 px-4">
                          <span className={`font-semibold ${getStatusTextClass(cl.verification_status)}`}>
                            {cl.verification_status}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-right whitespace-nowrap space-x-2">
                          <button
                            type="button"
                            disabled={processingId === cl.id}
                            onClick={() => handleVerifyClaimant(cl.id, 'Approved')}
                            className="px-2.5 py-1 bg-emerald-700 text-white font-semibold rounded hover:bg-emerald-800"
                          >
                            Approve
                          </button>
                          <button
                            type="button"
                            disabled={processingId === cl.id}
                            onClick={() =>
                              handleVerifyClaimant(cl.id, 'Additional Documents Required')
                            }
                            className="px-2.5 py-1 border border-slate-300 text-slate-700 font-medium rounded hover:bg-slate-50"
                          >
                            Request Docs
                          </button>
                          <button
                            type="button"
                            disabled={processingId === cl.id}
                            onClick={() => handleVerifyClaimant(cl.id, 'Rejected')}
                            className="px-2.5 py-1 text-rose-700 font-semibold hover:underline"
                          >
                            Reject
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ) : tab === 'institutions' && overview ? (
            <div className="space-y-6">
              <div className="bg-white border border-slate-200 rounded-lg p-6 flex items-center justify-between gap-4">
                <div>
                  <h1 className="font-display text-lg font-bold text-slate-900">
                    Participating Financial Institutions
                  </h1>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Registered banks, insurance carriers, mutual fund houses, and nodal representatives.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setShowAddInst(true)}
                  className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-[#0B1F3A] rounded-md hover:bg-slate-800"
                >
                  <Plus className="w-3.5 h-3.5" />
                  Add Sample Institution
                </button>
              </div>

              <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-slate-200 bg-slate-50 text-xs font-semibold text-slate-600">
                      <th className="py-3 px-4">Institution</th>
                      <th className="py-3 px-4">Category</th>
                      <th className="py-3 px-4">Nodal Officer</th>
                      <th className="py-3 px-4 text-right">Records</th>
                      <th className="py-3 px-4 text-right">Matches</th>
                      <th className="py-3 px-4 text-right">Claims</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-xs">
                    {(overview.institutionStats || []).map((inst: any) => (
                      <tr key={inst.id} className="hover:bg-slate-50">
                        <td className="py-3 px-4">
                          <div className="font-semibold text-slate-900">
                            {inst.name}{' '}
                            <span className="font-mono text-slate-400">({inst.code})</span>
                          </div>
                          <div className="text-slate-500">{inst.city}</div>
                        </td>
                        <td className="py-3 px-4 text-slate-700">
                          {formatCategoryLabel(inst.category)}
                        </td>
                        <td className="py-3 px-4">
                          <div className="text-slate-900">{inst.nodal_officer_name}</div>
                          <div className="text-slate-500">{inst.contact_email}</div>
                        </td>
                        <td className="py-3 px-4 text-right font-mono tabular-nums">
                          {inst.asset_count}
                        </td>
                        <td className="py-3 px-4 text-right font-mono tabular-nums font-semibold text-teal-700">
                          {inst.match_count}
                        </td>
                        <td className="py-3 px-4 text-right font-mono tabular-nums">
                          {inst.claim_count}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="bg-white border border-slate-200 rounded-lg p-6">
                <h2 className="font-display text-base font-bold text-slate-900 mb-3">
                  Active Institution Representatives
                </h2>
                <div className="grid sm:grid-cols-3 gap-4">
                  {representatives.map((rep) => (
                    <div key={rep.id} className="p-4 border border-slate-200 rounded-md text-xs">
                      <div className="font-semibold text-slate-900">{rep.full_name}</div>
                      <div className="text-teal-800 font-medium mt-0.5">{rep.institution_name}</div>
                      <div className="font-mono text-slate-500 mt-1">{rep.email}</div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          ) : (
            /* Activity Logs */
            <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
              <div className="p-5 border-b border-slate-200">
                <h1 className="font-display text-lg font-bold text-slate-900">
                  System Activity & Audit Logs
                </h1>
                <p className="text-xs text-slate-500 mt-0.5">
                  Immutable ledger of death record reviews, matching scans, claimant verifications, and claim transitions.
                </p>
              </div>
              <div className="divide-y divide-slate-100">
                {logs.map((log) => (
                  <div key={log.id} className="p-4 text-xs flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <div>
                      <span className="font-mono font-semibold text-[#0B1F3A]">{log.action}</span>
                      <span className="text-slate-400 mx-2">·</span>
                      <span className="font-medium text-slate-800">
                        {log.actor_name} ({log.actor_role})
                      </span>
                      <div className="text-slate-600 mt-1">{log.details}</div>
                    </div>
                    <div className="font-mono tabular-nums text-slate-400 shrink-0">
                      {formatDateTime(log.created_at)}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </main>
      </div>

      {/* Inspect & Verify Death Record Modal */}
      {inspectDeceased && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4">
          <div className="bg-white border border-slate-200 rounded-lg max-w-2xl w-full max-h-[90vh] overflow-y-auto p-6 space-y-5 shadow-xl">
            <div className="flex items-start justify-between border-b border-slate-200 pb-3">
              <div>
                <p className="text-xs text-slate-500">Death Record Inspection</p>
                <h2 className="font-display text-xl font-bold text-slate-900 mt-0.5">
                  {inspectDeceased.record.full_name}
                </h2>
              </div>
              <button
                type="button"
                onClick={() => setInspectDeceased(null)}
                className="p-1 text-slate-500 hover:text-slate-900"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="grid sm:grid-cols-2 gap-4 text-xs bg-slate-50 p-4 rounded border border-slate-200">
              <div>
                <span className="text-slate-500">Death Certificate Ref</span>
                <div className="font-mono font-semibold text-slate-900">
                  {inspectDeceased.record.death_certificate_ref}
                </div>
              </div>
              <div>
                <span className="text-slate-500">Sample Identity Reference</span>
                <div className="font-mono font-semibold text-slate-900">
                  {inspectDeceased.record.sample_identity_ref}
                </div>
              </div>
              <div>
                <span className="text-slate-500">DOB / Date of Death</span>
                <div className="text-slate-900 font-medium tabular-nums">
                  {formatDate(inspectDeceased.record.date_of_birth)} →{' '}
                  {formatDate(inspectDeceased.record.date_of_death)}
                </div>
              </div>
              <div>
                <span className="text-slate-500">Issuing Authority</span>
                <div className="text-slate-900 font-medium">
                  {inspectDeceased.record.issuing_authority}
                </div>
              </div>
              <div>
                <span className="text-slate-500">Last Known Location</span>
                <div className="text-slate-900 font-medium">
                  {inspectDeceased.record.last_city}, {inspectDeceased.record.last_state}
                </div>
              </div>
              <div>
                <span className="text-slate-500">Current Status</span>
                <div
                  className={`font-semibold ${getStatusTextClass(
                    inspectDeceased.record.verification_status
                  )}`}
                >
                  {inspectDeceased.record.verification_status}
                </div>
              </div>
            </div>

            <div>
              <h3 className="text-xs font-semibold text-slate-800 mb-2">Uploaded Documents</h3>
              {inspectDeceased.documents.length === 0 ? (
                <p className="text-xs text-slate-500">
                  No uploaded file attached to this record.
                </p>
              ) : (
                <div className="space-y-2">
                  {inspectDeceased.documents.map((doc) => (
                    <div
                      key={doc.id}
                      className="flex items-center justify-between p-2.5 border border-slate-200 rounded text-xs"
                    >
                      <span>
                        {doc.file_name} · <span className="text-slate-500">{doc.document_type}</span>
                      </span>
                      <button
                        type="button"
                        onClick={() => setViewerDoc(doc)}
                        className="font-semibold text-teal-700 hover:underline"
                      >
                        View Document
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                Administrator Review Notes
              </label>
              <textarea
                rows={2}
                value={adminNotes}
                onChange={(e) => setAdminNotes(e.target.value)}
                placeholder="Optional remarks or instructions for the family..."
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-md"
              />
            </div>

            <div className="flex flex-wrap items-center justify-end gap-3 pt-3 border-t border-slate-200">
              <button
                type="button"
                disabled={processingId === inspectDeceased.record.id}
                onClick={() =>
                  handleVerifyDeceased(inspectDeceased.record.id, 'Additional Information Required')
                }
                className="px-3.5 py-2 text-xs font-semibold text-slate-700 border border-slate-300 rounded-md hover:bg-slate-50"
              >
                Request More Info
              </button>
              <button
                type="button"
                disabled={processingId === inspectDeceased.record.id}
                onClick={() => handleVerifyDeceased(inspectDeceased.record.id, 'Rejected')}
                className="px-3.5 py-2 text-xs font-semibold text-rose-700 border border-rose-300 rounded-md hover:bg-rose-50"
              >
                Reject Record
              </button>
              <button
                type="button"
                disabled={processingId === inspectDeceased.record.id}
                onClick={() => handleVerifyDeceased(inspectDeceased.record.id, 'Approved')}
                className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-teal-700 rounded-md hover:bg-teal-800 disabled:opacity-60"
              >
                <CheckCircle2 className="w-3.5 h-3.5" />
                {processingId === inspectDeceased.record.id
                  ? 'Approving & Matching...'
                  : 'Approve & Run Asset Matching'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add Institution Modal */}
      {showAddInst && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4">
          <div className="bg-white border border-slate-200 rounded-lg max-w-md w-full p-6 space-y-4 shadow-xl">
            <div className="flex items-center justify-between border-b border-slate-200 pb-3">
              <h3 className="font-display text-base font-bold text-slate-900">
                Register Sample Institution
              </h3>
              <button
                type="button"
                onClick={() => setShowAddInst(false)}
                className="p-1 text-slate-500 hover:text-slate-900"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <form onSubmit={handleAddInstitution} className="space-y-3 text-xs">
              <div>
                <label className="block font-medium text-slate-700 mb-1">Institution Name *</label>
                <input
                  type="text"
                  required
                  value={instForm.name}
                  onChange={(e) => setInstForm({ ...instForm, name: e.target.value })}
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-md"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-medium text-slate-700 mb-1">Short Code *</label>
                  <input
                    type="text"
                    required
                    value={instForm.code}
                    onChange={(e) => setInstForm({ ...instForm, code: e.target.value })}
                    placeholder="e.g., KMB"
                    className="w-full px-3 py-2 text-sm font-mono border border-slate-300 rounded-md"
                  />
                </div>
                <div>
                  <label className="block font-medium text-slate-700 mb-1">Category *</label>
                  <select
                    value={instForm.category}
                    onChange={(e) =>
                      setInstForm({ ...instForm, category: e.target.value as any })
                    }
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-md bg-white"
                  >
                    <option value="bank">Bank</option>
                    <option value="insurance">Insurance</option>
                    <option value="mutual_fund">Mutual Fund</option>
                  </select>
                </div>
              </div>
              <div>
                <label className="block font-medium text-slate-700 mb-1">Nodal Officer *</label>
                <input
                  type="text"
                  required
                  value={instForm.nodal_officer_name}
                  onChange={(e) =>
                    setInstForm({ ...instForm, nodal_officer_name: e.target.value })
                  }
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-md"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-medium text-slate-700 mb-1">Contact Email *</label>
                  <input
                    type="email"
                    required
                    value={instForm.contact_email}
                    onChange={(e) => setInstForm({ ...instForm, contact_email: e.target.value })}
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-md"
                  />
                </div>
                <div>
                  <label className="block font-medium text-slate-700 mb-1">City *</label>
                  <input
                    type="text"
                    required
                    value={instForm.city}
                    onChange={(e) => setInstForm({ ...instForm, city: e.target.value })}
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-md"
                  />
                </div>
              </div>
              <button
                type="submit"
                className="w-full py-2.5 text-sm font-semibold text-white bg-teal-700 rounded-md hover:bg-teal-800"
              >
                Add Institution
              </button>
            </form>
          </div>
        </div>
      )}

      <DocumentViewerModal doc={viewerDoc} onClose={() => setViewerDoc(null)} />

      <NotificationCenter
        open={notifOpen}
        onClose={() => setNotifOpen(false)}
        notifications={notifications}
        onMarkRead={async (id) => {
          await apiRequest(`/api/notifications/${id}/read`, { method: 'PATCH' });
          setNotifications((prev) => prev.map((n) => (n.id === id ? { ...n, is_read: 1 } : n)));
        }}
        onMarkAllRead={async () => {
          await apiRequest('/api/notifications/read-all', { method: 'PATCH' });
          setNotifications((prev) => prev.map((n) => ({ ...n, is_read: 1 })));
        }}
      />
    </div>
  );
}
