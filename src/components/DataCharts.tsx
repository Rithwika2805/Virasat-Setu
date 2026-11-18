import { formatCategoryLabel, formatINR } from '../utils/format';

interface InstitutionStat {
  id: string;
  name: string;
  code: string;
  category: string;
  asset_count: number;
  match_count: number;
  claim_count: number;
  settled_count: number;
}

interface CategoryStat {
  category: string;
  match_count: number;
  total_amount: number;
}

export function InstitutionBarChart({ data }: { data: InstitutionStat[] }) {
  const maxMatches = Math.max(...data.map((d) => d.match_count), 1);

  return (
    <div className="space-y-3">
      {data.map((inst) => {
        const matchPct = Math.round((inst.match_count / maxMatches) * 100);
        const claimPct = Math.round((inst.claim_count / maxMatches) * 100);
        return (
          <div key={inst.id} className="space-y-1">
            <div className="flex items-baseline justify-between gap-4 text-xs">
              <div className="truncate font-medium text-slate-800">
                {inst.name}{' '}
                <span className="text-slate-400 font-normal">
                  · {formatCategoryLabel(inst.category)}
                </span>
              </div>
              <div className="font-mono tabular-nums text-slate-600 shrink-0">
                {inst.match_count} matches · {inst.claim_count} claims
              </div>
            </div>
            <div className="h-2.5 w-full bg-slate-100 rounded-sm overflow-hidden flex">
              <div
                className="h-full bg-[#0B1F3A] transition-all duration-300"
                style={{ width: `${matchPct}%` }}
                title={`${inst.match_count} potential matches`}
              />
            </div>
            {inst.claim_count > 0 && (
              <div className="h-1.5 w-full bg-slate-100 rounded-sm overflow-hidden">
                <div
                  className="h-full bg-teal-600 transition-all duration-300"
                  style={{ width: `${claimPct}%` }}
                  title={`${inst.claim_count} initiated claims`}
                />
              </div>
            )}
          </div>
        );
      })}
      <div className="pt-2 flex items-center gap-6 text-xs text-slate-500 border-t border-slate-100">
        <span className="inline-flex items-center gap-2">
          <span className="w-3 h-2 bg-[#0B1F3A] inline-block rounded-[1px]" />
          Potential Matches
        </span>
        <span className="inline-flex items-center gap-2">
          <span className="w-3 h-2 bg-teal-600 inline-block rounded-[1px]" />
          Claims Initiated
        </span>
      </div>
    </div>
  );
}

export function CategoryBreakdownChart({ data }: { data: CategoryStat[] }) {
  const maxMatches = Math.max(...data.map((d) => d.match_count), 1);

  return (
    <div className="space-y-4">
      {data.map((item) => {
        const pct = Math.round((item.match_count / maxMatches) * 100);
        const barColor =
          item.category === 'bank'
            ? 'bg-[#0B1F3A]'
            : item.category === 'insurance'
            ? 'bg-teal-700'
            : 'bg-amber-600';
        return (
          <div key={item.category} className="space-y-1.5">
            <div className="flex items-baseline justify-between text-xs">
              <span className="font-semibold text-slate-800">
                {formatCategoryLabel(item.category)}
              </span>
              <span className="font-mono tabular-nums text-slate-600">
                {item.match_count} matched · {formatINR(item.total_amount)}
              </span>
            </div>
            <div className="h-3 w-full bg-slate-100 rounded-sm overflow-hidden">
              <div
                className={`h-full ${barColor} transition-all duration-300`}
                style={{ width: `${pct}%` }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}
