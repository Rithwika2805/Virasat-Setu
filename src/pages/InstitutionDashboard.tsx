import React, { useCallback, useEffect, useState } from 'react';
import {
  Bell,
  Building2,
  CheckCircle2,
  ClipboardCheck,
  FileSearch,
  FileText,
  LogOut,
  RefreshCw,
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
  ClaimStatus,
  DocumentItem,
  Institution,
  NotificationItem,
} from '../types';
import {
  formatCategoryLabel,
  formatDate,
  formatDateTime,
  formatINR,
  getStatusTextClass,
} from '../utils/format';

type InstTab = 'overview' | 'matches' | 'claims';

const CLAIM_STATUSES: ClaimStatus[] = [
  'Submitted',
  'Under Review',
  'Documents Required',
  'Approved',
  'Rejected',
  'Completed',
];

export function InstitutionDashboard({ onBackHome }: { onBackHome: () => void }) {
  const { user, logout } = useAuth();
  const [tab, setTab] = useState<InstTab>('claims');
  const [loading, setLoading] = useState(true);
  const [banner, setBanner] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  const [institution, setInstitution] = useState<Institution | null>(null);
  const [stats, setStats] = useState({
    totalHostedAssets: 0,
    incomingMatches: 0,
    activeClaims: 0,
    processedClaims: 0,
  });
  const [matches, setMatches] = useState<AssetMatch[]>([]);
  const [claims, setClaims] = useState<ClaimRecord[]>([]);
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [notifOpen, setNotifOpen] = useState(false);

  const [selectedClaim, setSelectedClaim] = useState<ClaimRecord | null>(null);
  const [nextStatus, setNextStatus] = useState<ClaimStatus>('Under Review');
  const [statusComment, setStatusComment] = useState('');
  const [updatingClaim, setUpdatingClaim] = useState(false);
  const [viewerDoc, setViewerDoc] = useState<DocumentItem | null>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [instRes, notifRes] = await Promise.all([
        apiRequest<any>('/api/institution/dashboard'),
        apiRequest<{ notifications: NotificationItem[] }>('/api/notifications'),
      ]);
      setInstitution(instRes.institution);
      setStats(instRes.stats);
      setMatches(instRes.matches || []);
      setClaims(instRes.claims || []);
      setNotifications(notifRes.notifications || []);
    } catch (err: any) {
      setBanner({ type: 'err', text: err.message || 'Failed to load institution workspace.' });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const openClaimModal = (claim: ClaimRecord) => {
    setSelectedClaim(claim);
    setNextStatus(claim.status);
    setStatusComment('');
  };

  const handleUpdateClaimStatus = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedClaim) return;
    setUpdatingClaim(true);
    setBanner(null);
    try {
      await apiRequest(`/api/claims/${selectedClaim.id}/status`, {
        method: 'PATCH',
        body: JSON.stringify({
          status: nextStatus,
          institution_comments:
            statusComment ||
            `Claim status updated to ${nextStatus} by ${institution?.name || 'Institution Nodal Officer'}.`,
        }),
      });
      setBanner({
        type: 'ok',
        text: `Claim ${selectedClaim.claim_number} updated to "${nextStatus}". Family user notified.`,
      });
      setSelectedClaim(null);
      await loadData();
    } catch (err: any) {
      setBanner({ type: 'err', text: err.message });
    } finally {
      setUpdatingClaim(false);
    }
  };

  const unreadCount = notifications.filter((n) => !n.is_read).length;

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
          <p className="text-xs text-teal-300 font-medium">
            {institution ? formatCategoryLabel(institution.category) : 'Institution'} Portal
          </p>
          <p className="text-sm font-semibold text-white mt-0.5 leading-snug">
            {institution?.name || user?.institution_name}
          </p>
          <p className="text-xs text-slate-400 truncate mt-1">
            Nodal Officer: {user?.full_name}
          </p>
        </div>

        <nav className="flex-1 p-3 space-y-1 flex lg:flex-col overflow-x-auto">
          {[
            { id: 'overview' as InstTab, label: 'Institution Overview', icon: <Building2 className="w-4 h-4" /> },
            {
              id: 'matches' as InstTab,
              label: 'Incoming Matches',
              icon: <FileSearch className="w-4 h-4" />,
              count: matches.length,
            },
            {
              id: 'claims' as InstTab,
              label: 'Claim Processing Queue',
              icon: <ClipboardCheck className="w-4 h-4" />,
              count: claims.length,
            },
          ].map((item) => {
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
            <span>{institution?.name || 'Institution Portal'}</span>
            <span className="mx-2">/</span>
            <span className="font-semibold text-slate-900 capitalize">{tab}</span>
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
              Loading institution records...
            </div>
          ) : (
            <>
              {/* Strict Isolation Info & KPI Strip */}
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                <div className="bg-white border border-slate-200 rounded-lg p-5">
                  <div className="text-xs text-slate-500">Hosted Ledger Records</div>
                  <div className="font-mono tabular-nums text-2xl font-bold text-slate-900 mt-1">
                    {stats.totalHostedAssets}
                  </div>
                </div>
                <div className="bg-white border border-slate-200 rounded-lg p-5">
                  <div className="text-xs text-slate-500">Incoming Asset Matches</div>
                  <div className="font-mono tabular-nums text-2xl font-bold text-teal-700 mt-1">
                    {stats.incomingMatches}
                  </div>
                </div>
                <div className="bg-white border border-slate-200 rounded-lg p-5">
                  <div className="text-xs text-slate-500">Active Claims Queue</div>
                  <div className="font-mono tabular-nums text-2xl font-bold text-amber-700 mt-1">
                    {stats.activeClaims}
                  </div>
                </div>
                <div className="bg-white border border-slate-200 rounded-lg p-5">
                  <div className="text-xs text-slate-500">Processed Claims</div>
                  <div className="font-mono tabular-nums text-2xl font-bold text-emerald-700 mt-1">
                    {stats.processedClaims}
                  </div>
                </div>
              </div>

              {tab === 'overview' && (
                <div className="bg-white border border-slate-200 rounded-lg p-6 space-y-4">
                  <h2 className="font-display text-lg font-bold text-slate-900">
                    {institution?.name} — Nodal Desk Summary
                  </h2>
                  <p className="text-sm text-slate-600 leading-relaxed max-w-3xl">
                    This workspace is strictly scoped to <span className="font-semibold">{institution?.name}</span> ({institution?.code}). Records belonging to other banks, insurers, or mutual fund houses are inaccessible from this account.
                  </p>
                  <div className="grid sm:grid-cols-3 gap-4 pt-3 border-t border-slate-100 text-xs">
                    <div>
                      <div className="text-slate-500">Registered Office</div>
                      <div className="font-semibold text-slate-900 mt-0.5">{institution?.city}</div>
                    </div>
                    <div>
                      <div className="text-slate-500">Nodal Desk Email</div>
                      <div className="font-mono text-slate-900 mt-0.5">
                        {institution?.contact_email}
                      </div>
                    </div>
                    <div>
                      <div className="text-slate-500">Institution Category</div>
                      <div className="font-semibold text-slate-900 mt-0.5">
                        {institution ? formatCategoryLabel(institution.category) : '—'}
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {tab === 'matches' && (
                <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
                  <div className="p-5 border-b border-slate-200">
                    <h2 className="font-display text-lg font-bold text-slate-900">
                      Incoming Matching Requests ({institution?.name})
                    </h2>
                    <p className="text-xs text-slate-500 mt-0.5">
                      Verified deceased persons matched against your institution’s hosted records.
                    </p>
                  </div>
                  {matches.length === 0 ? (
                    <div className="p-10 text-center text-sm text-slate-500">
                      No asset matches currently assigned to {institution?.name}.
                    </div>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full text-left border-collapse">
                        <thead>
                          <tr className="border-b border-slate-200 bg-slate-50 text-xs font-semibold text-slate-600">
                            <th className="py-3 px-4">Deceased Holder</th>
                            <th className="py-3 px-4">Account / Policy Ref</th>
                            <th className="py-3 px-4">Simulated Value</th>
                            <th className="py-3 px-4">Match Score</th>
                            <th className="py-3 px-4">Claimant Verification</th>
                            <th className="py-3 px-4">Documents</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 text-xs">
                          {matches.map((m) => (
                            <tr key={m.id} className="hover:bg-slate-50">
                              <td className="py-3 px-4">
                                <div className="font-semibold text-slate-900">{m.deceased_name}</div>
                                <div className="font-mono text-slate-500">
                                  {m.death_certificate_ref} · DOD {formatDate(m.date_of_death)}
                                </div>
                              </td>
                              <td className="py-3 px-4">
                                <div className="font-mono font-medium text-slate-900">
                                  {m.account_or_policy_ref}
                                </div>
                                <div className="text-slate-500">{m.sub_category}</div>
                              </td>
                              <td className="py-3 px-4 font-mono tabular-nums font-bold text-slate-900">
                                {formatINR(m.fictional_amount)}
                              </td>
                              <td className="py-3 px-4">
                                <span
                                  className={`font-mono font-bold ${getStatusTextClass(
                                    m.outcome_tier
                                  )}`}
                                >
                                  {m.matching_score}/100
                                </span>
                                <div className="text-slate-500">{m.outcome_tier}</div>
                              </td>
                              <td className="py-3 px-4">
                                <div className="font-medium text-slate-900">
                                  {m.claimant_name || 'Pending'}
                                </div>
                                <div
                                  className={`font-semibold ${getStatusTextClass(
                                    m.claimant_verification_status || 'Pending'
                                  )}`}
                                >
                                  {m.claimant_verification_status || 'Pending'}
                                </div>
                              </td>
                              <td className="py-3 px-4">
                                {m.documents && m.documents.length > 0 ? (
                                  <div className="space-y-1">
                                    {m.documents.map((doc) => (
                                      <button
                                        key={doc.id}
                                        type="button"
                                        onClick={() => setViewerDoc(doc)}
                                        className="text-teal-700 hover:underline font-medium inline-flex items-center gap-1"
                                      >
                                        <FileText className="w-3.5 h-3.5" />
                                        {doc.document_type}
                                      </button>
                                    ))}
                                  </div>
                                ) : (
                                  <span className="text-slate-400">None</span>
                                )}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )}

              {tab === 'claims' && (
                <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
                  <div className="p-5 border-b border-slate-200">
                    <h2 className="font-display text-lg font-bold text-slate-900">
                      Claims Queue & Settlement Workflow ({institution?.name})
                    </h2>
                    <p className="text-xs text-slate-500 mt-0.5">
                      Review verified claimant dossiers, request additional documents, or advance claim statuses.
                    </p>
                  </div>

                  {claims.length === 0 ? (
                    <div className="p-10 text-center text-sm text-slate-500">
                      No claims have been submitted to {institution?.name} yet.
                    </div>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full text-left border-collapse">
                        <thead>
                          <tr className="border-b border-slate-200 bg-slate-50 text-xs font-semibold text-slate-600">
                            <th className="py-3 px-4">Claim ID & Asset</th>
                            <th className="py-3 px-4">Deceased & Claimant</th>
                            <th className="py-3 px-4">Amount</th>
                            <th className="py-3 px-4">Status</th>
                            <th className="py-3 px-4">Last Updated</th>
                            <th className="py-3 px-4 text-right">Action</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 text-xs">
                          {claims.map((cl) => (
                            <tr key={cl.id} className="hover:bg-slate-50">
                              <td className="py-3.5 px-4">
                                <div className="font-mono font-semibold text-slate-900">
                                  {cl.claim_number}
                                </div>
                                <div className="text-slate-600">
                                  {cl.sub_category} ({cl.account_or_policy_ref})
                                </div>
                              </td>
                              <td className="py-3.5 px-4">
                                <div className="font-semibold text-slate-900">
                                  {cl.deceased_name}
                                </div>
                                <div className="text-slate-500">
                                  Claimant: {cl.claimant_name} ({cl.claimant_type} ·{' '}
                                  {cl.relationship})
                                </div>
                              </td>
                              <td className="py-3.5 px-4 font-mono tabular-nums font-bold text-slate-900">
                                {formatINR(cl.fictional_amount)}
                              </td>
                              <td className="py-3.5 px-4">
                                <span className={`font-semibold ${getStatusTextClass(cl.status)}`}>
                                  {cl.status}
                                </span>
                                {cl.institution_comments && (
                                  <div className="text-[11px] text-slate-500 mt-0.5 max-w-xs truncate">
                                    {cl.institution_comments}
                                  </div>
                                )}
                              </td>
                              <td className="py-3.5 px-4 font-mono tabular-nums text-slate-500">
                                {formatDateTime(cl.updated_at)}
                              </td>
                              <td className="py-3.5 px-4 text-right whitespace-nowrap">
                                <button
                                  type="button"
                                  onClick={() => openClaimModal(cl)}
                                  className="px-3.5 py-1.5 font-semibold text-white bg-[#0B1F3A] rounded hover:bg-slate-800"
                                >
                                  Review & Update Status
                                </button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </main>
      </div>

      {/* Claim Processing Modal */}
      {selectedClaim && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4">
          <div className="bg-white border border-slate-200 rounded-lg max-w-xl w-full max-h-[90vh] overflow-y-auto p-6 space-y-5 shadow-xl">
            <div className="flex items-start justify-between border-b border-slate-200 pb-3">
              <div>
                <p className="text-xs font-mono text-slate-500">{selectedClaim.claim_number}</p>
                <h2 className="font-display text-lg font-bold text-slate-900">
                  {selectedClaim.sub_category} — {selectedClaim.deceased_name}
                </h2>
              </div>
              <button
                type="button"
                onClick={() => setSelectedClaim(null)}
                className="p-1 text-slate-500 hover:text-slate-900"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="grid grid-cols-2 gap-3 text-xs bg-slate-50 p-4 rounded border border-slate-200">
              <div>
                <span className="text-slate-500">Account / Policy / Folio</span>
                <div className="font-mono font-semibold text-slate-900">
                  {selectedClaim.account_or_policy_ref}
                </div>
              </div>
              <div>
                <span className="text-slate-500">Simulated Payout Amount</span>
                <div className="font-mono tabular-nums font-bold text-slate-900">
                  {formatINR(selectedClaim.fictional_amount)}
                </div>
              </div>
              <div>
                <span className="text-slate-500">Verified Claimant</span>
                <div className="font-semibold text-slate-900">
                  {selectedClaim.claimant_name} ({selectedClaim.claimant_type})
                </div>
              </div>
              <div>
                <span className="text-slate-500">Claimant Contact</span>
                <div className="text-slate-700">{selectedClaim.claimant_email}</div>
              </div>
            </div>

            {selectedClaim.documents && selectedClaim.documents.length > 0 && (
              <div>
                <div className="text-xs font-semibold text-slate-700 mb-2">
                  Supporting Document References
                </div>
                <div className="flex flex-wrap gap-2">
                  {selectedClaim.documents.map((doc) => (
                    <button
                      key={doc.id}
                      type="button"
                      onClick={() => setViewerDoc(doc)}
                      className="px-3 py-1.5 text-xs font-medium text-teal-800 border border-teal-700/30 rounded hover:bg-teal-50 inline-flex items-center gap-1.5"
                    >
                      <FileText className="w-3.5 h-3.5" />
                      {doc.file_name}
                    </button>
                  ))}
                </div>
              </div>
            )}

            <form onSubmit={handleUpdateClaimStatus} className="space-y-4 pt-2 border-t border-slate-200">
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  New Claim Status *
                </label>
                <select
                  value={nextStatus}
                  onChange={(e) => setNextStatus(e.target.value as ClaimStatus)}
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-md bg-white"
                >
                  {CLAIM_STATUSES.map((st) => (
                    <option key={st} value={st}>
                      {st}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Institution Comments / Instructions for Family *
                </label>
                <textarea
                  rows={3}
                  required
                  value={statusComment}
                  onChange={(e) => setStatusComment(e.target.value)}
                  placeholder="e.g., Nominee KYC verified. Please submit original cancelled cheque leaf for NEFT release."
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-md"
                />
              </div>

              <button
                type="submit"
                disabled={updatingClaim}
                className="w-full inline-flex items-center justify-center gap-2 py-2.5 text-sm font-semibold text-white bg-teal-700 rounded-md hover:bg-teal-800 disabled:opacity-60"
              >
                <CheckCircle2 className="w-4 h-4" />
                {updatingClaim ? 'Updating Claim...' : 'Save Claim Status & Notify Family'}
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
