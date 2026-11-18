export function formatINR(amount: number | null | undefined): string {
  const num = Number(amount || 0);
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
  }).format(num);
}

export function formatDate(dateStr: string | null | undefined): string {
  if (!dateStr) return '—';
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return dateStr;
  return d.toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

export function formatDateTime(dateStr: string | null | undefined): string {
  if (!dateStr) return '—';
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return dateStr;
  return d.toLocaleString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function formatCategoryLabel(cat: 'bank' | 'insurance' | 'mutual_fund' | string): string {
  switch (cat) {
    case 'bank':
      return 'Bank Deposit';
    case 'insurance':
      return 'Insurance Policy';
    case 'mutual_fund':
      return 'Mutual Fund';
    default:
      return cat;
  }
}

export function getStatusTextClass(status: string): string {
  switch (status) {
    case 'Approved':
    case 'Approved Match':
    case 'Completed':
    case 'Strong Potential Match':
      return 'text-emerald-700';
    case 'Pending':
    case 'Pending Verification':
    case 'Pending Review':
    case 'Submitted':
    case 'Under Review':
    case 'Requires Manual Review':
    case 'Flagged for Manual Review':
      return 'text-amber-700';
    case 'Documents Required':
    case 'Additional Documents Required':
    case 'Additional Information Required':
      return 'text-sky-700';
    case 'Rejected':
    case 'Rejected Match':
      return 'text-rose-700';
    default:
      return 'text-slate-700';
  }
}
