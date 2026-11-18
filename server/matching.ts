export interface DeceasedMatchInput {
  id: string;
  full_name: string;
  date_of_birth: string;
  sample_identity_ref: string;
  last_city: string;
  last_state: string;
  claimant_names?: string[];
}

export interface FinancialAssetInput {
  id: string;
  institution_id: string;
  category: 'bank' | 'insurance' | 'mutual_fund';
  holder_name: string;
  date_of_birth: string;
  sample_identity_ref: string;
  institution_name: string;
  nominee_ref: string | null;
  city_or_branch: string | null;
}

export interface MatchResult {
  deceased_person_id: string;
  financial_asset_id: string;
  institution_id: string;
  matching_score: number;
  score_breakdown: {
    identity_ref: number;
    name_similarity: number;
    date_of_birth: number;
    other_details: number;
  };
  matching_reasons: string[];
  outcome_tier: 'Strong Potential Match' | 'Requires Manual Review';
  review_status: 'Approved Match' | 'Flagged for Manual Review';
}

function normalizeText(value: string | null | undefined): string {
  return (value || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function levenshtein(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;
  const dp: number[][] = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0));
  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + cost);
    }
  }
  return dp[m][n];
}

export function computeNameSimilarityRatio(a: string, b: string): number {
  const na = normalizeText(a);
  const nb = normalizeText(b);
  if (!na || !nb) return 0;
  if (na === nb) return 1;

  const maxLen = Math.max(na.length, nb.length);
  const levSim = 1 - levenshtein(na, nb) / maxLen;

  const tokensA = new Set(na.split(' ').filter(Boolean));
  const tokensB = new Set(nb.split(' ').filter(Boolean));
  let intersection = 0;
  for (const t of tokensA) {
    if (tokensB.has(t)) intersection++;
  }
  const tokenSim = (2 * intersection) / (tokensA.size + tokensB.size);

  return Math.max(levSim, tokenSim);
}

export function evaluateAssetMatch(
  deceased: DeceasedMatchInput,
  asset: FinancialAssetInput
): MatchResult | null {
  const reasons: string[] = [];

  // 1. Exact sample identity reference (50 pts)
  const decRef = (deceased.sample_identity_ref || '').trim().toUpperCase();
  const assetRef = (asset.sample_identity_ref || '').trim().toUpperCase();
  let identityRefScore = 0;
  if (decRef && assetRef && decRef === assetRef) {
    identityRefScore = 50;
    reasons.push(`Exact sample identity reference match (${decRef})`);
  }

  // 2. Name similarity (up to 25 pts)
  const sim = computeNameSimilarityRatio(deceased.full_name, asset.holder_name);
  let nameScore = 0;
  if (sim === 1) {
    nameScore = 25;
    reasons.push(`Exact legal name match ("${asset.holder_name}")`);
  } else if (sim >= 0.85) {
    nameScore = 20;
    reasons.push(`High name similarity (${Math.round(sim * 100)}%)`);
  } else if (sim >= 0.7) {
    nameScore = 15;
    reasons.push(`Partial name similarity (${Math.round(sim * 100)}%)`);
  } else if (sim >= 0.55) {
    nameScore = 10;
    reasons.push(`Moderate name token overlap (${Math.round(sim * 100)}%)`);
  }

  // 3. Exact date of birth (15 pts)
  let dobScore = 0;
  if (
    deceased.date_of_birth &&
    asset.date_of_birth &&
    deceased.date_of_birth.trim() === asset.date_of_birth.trim()
  ) {
    dobScore = 15;
    reasons.push(`Exact date of birth match (${deceased.date_of_birth})`);
  }

  // 4. Other matching reference details (up to 10 pts)
  let otherScore = 0;
  const cityNorm = normalizeText(deceased.last_city);
  const stateNorm = normalizeText(deceased.last_state);
  const branchNorm = normalizeText(asset.city_or_branch);
  const nomineeNorm = normalizeText(asset.nominee_ref);

  const locationMatches =
    (cityNorm && branchNorm && branchNorm.includes(cityNorm)) ||
    (stateNorm && branchNorm && branchNorm.includes(stateNorm));

  const claimantMatchesNominee = (deceased.claimant_names || []).some((cn) => {
    const clean = normalizeText(cn);
    if (!clean || !nomineeNorm) return false;
    return nomineeNorm.includes(clean) || computeNameSimilarityRatio(clean, nomineeNorm) >= 0.6;
  });

  if (locationMatches && claimantMatchesNominee) {
    otherScore = 10;
    reasons.push('Last known city/branch and nominee reference align');
  } else if (locationMatches) {
    otherScore = 10;
    reasons.push(`City/branch location alignment (${asset.city_or_branch})`);
  } else if (claimantMatchesNominee) {
    otherScore = 10;
    reasons.push(`Nominee reference aligns with registered claimant (${asset.nominee_ref})`);
  } else if (identityRefScore === 50 && dobScore === 15 && nameScore >= 20) {
    // High-confidence identity + DOB + name correspondence
    otherScore = 5;
    reasons.push('Multi-attribute institutional record consistency');
  }

  const totalScore = identityRefScore + nameScore + dobScore + otherScore;

  // Threshold rules:
  // Below 60: No Match Generated
  // 60-79: Requires Manual Review
  // 80-100: Strong Potential Match
  // Also enforce: name similarity alone must never establish a match (max 25 < 60, guaranteed)
  if (totalScore < 60) {
    return null;
  }

  const outcomeTier =
    totalScore >= 80 ? 'Strong Potential Match' : 'Requires Manual Review';
  const reviewStatus =
    totalScore >= 80 ? 'Approved Match' : 'Flagged for Manual Review';

  return {
    deceased_person_id: deceased.id,
    financial_asset_id: asset.id,
    institution_id: asset.institution_id,
    matching_score: totalScore,
    score_breakdown: {
      identity_ref: identityRefScore,
      name_similarity: nameScore,
      date_of_birth: dobScore,
      other_details: otherScore,
    },
    matching_reasons: reasons,
    outcome_tier: outcomeTier,
    review_status: reviewStatus,
  };
}
