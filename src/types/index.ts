export type UserRole = 'family' | 'admin' | 'institution';

export interface UserProfile {
  id: string;
  email: string;
  full_name: string;
  phone?: string;
  role: UserRole;
  institution_id: string | null;
  institution_name?: string | null;
  institution_category?: 'bank' | 'insurance' | 'mutual_fund' | null;
}

export interface Institution {
  id: string;
  name: string;
  code: string;
  category: 'bank' | 'insurance' | 'mutual_fund';
  contact_email: string;
  nodal_officer_name: string;
  city: string;
  is_active: number;
  created_at: string;
}

export type DeceasedVerificationStatus =
  | 'Pending Verification'
  | 'Approved'
  | 'Rejected'
  | 'Additional Information Required';

export interface DeceasedRecord {
  id: string;
  submitted_by: string;
  submitted_by_name?: string;
  submitted_by_email?: string;
  full_name: string;
  date_of_birth: string;
  date_of_death: string;
  gender: string;
  last_city: string;
  last_state: string;
  death_certificate_ref: string;
  death_registration_date: string;
  issuing_authority: string;
  sample_identity_ref: string;
  verification_status: DeceasedVerificationStatus;
  admin_notes?: string | null;
  reviewed_by?: string | null;
  reviewed_at?: string | null;
  match_count?: number;
  document_count?: number;
  created_at: string;
  updated_at: string;
}

export interface DocumentItem {
  id: string;
  document_type: string;
  file_name: string;
  mime_type: string;
  file_size: number;
  uploaded_at: string;
}

export type ClaimantVerificationStatus =
  | 'Pending'
  | 'Approved'
  | 'Rejected'
  | 'Additional Documents Required';

export interface ClaimantRecord {
  id: string;
  user_id: string;
  deceased_person_id: string;
  deceased_name?: string;
  death_certificate_ref?: string;
  full_name: string;
  email: string;
  phone: string;
  relationship: string;
  claimant_type: 'Nominee' | 'Legal Heir';
  verification_status: ClaimantVerificationStatus;
  admin_notes?: string | null;
  documents?: DocumentItem[];
  created_at: string;
  updated_at: string;
}

export interface ScoreBreakdown {
  identity_ref: number;
  name_similarity: number;
  date_of_birth: number;
  other_details: number;
}

export interface AssetMatch {
  id: string;
  deceased_person_id: string;
  deceased_name?: string;
  death_certificate_ref?: string;
  date_of_birth?: string;
  date_of_death?: string;
  last_city?: string;
  last_state?: string;
  financial_asset_id: string;
  institution_id: string;
  institution_name: string;
  category: 'bank' | 'insurance' | 'mutual_fund';
  sub_category: string;
  holder_name?: string;
  masked_ref: string;
  account_or_policy_ref: string;
  nominee_ref?: string | null;
  record_status?: string;
  unclaimed_status?: string;
  fictional_amount: number;
  city_or_branch?: string;
  matching_score: number;
  score_breakdown: ScoreBreakdown;
  matching_reasons: string[];
  outcome_tier: 'Strong Potential Match' | 'Requires Manual Review';
  review_status:
    | 'Pending Review'
    | 'Approved Match'
    | 'Flagged for Manual Review'
    | 'Rejected Match';
  reviewed_notes?: string | null;
  claim_id?: string | null;
  claim_number?: string | null;
  claim_status?: ClaimStatus | null;
  institution_comments?: string | null;
  claimant_id?: string | null;
  claimant_name?: string | null;
  claimant_type?: 'Nominee' | 'Legal Heir';
  relationship?: string;
  claimant_email?: string;
  claimant_phone?: string;
  claimant_verification_status?: ClaimantVerificationStatus;
  documents?: DocumentItem[];
  created_at: string;
}

export type ClaimStatus =
  | 'Submitted'
  | 'Under Review'
  | 'Documents Required'
  | 'Approved'
  | 'Rejected'
  | 'Completed';

export interface ClaimStatusStep {
  status: ClaimStatus;
  timestamp: string;
  actor: string;
  comment: string;
}

export interface ClaimRecord {
  id: string;
  claim_number: string;
  asset_match_id: string;
  deceased_person_id: string;
  deceased_name: string;
  death_certificate_ref?: string;
  financial_asset_id: string;
  institution_id: string;
  institution_name: string;
  asset_category: 'bank' | 'insurance' | 'mutual_fund';
  sub_category: string;
  masked_ref: string;
  account_or_policy_ref: string;
  fictional_amount: number;
  claimant_id: string;
  claimant_name: string;
  claimant_type: 'Nominee' | 'Legal Heir';
  relationship: string;
  claimant_email?: string;
  claimant_phone?: string;
  claimant_status?: ClaimantVerificationStatus;
  status: ClaimStatus;
  claimant_notes?: string;
  institution_comments?: string;
  status_history: ClaimStatusStep[];
  documents?: DocumentItem[];
  submitted_at: string;
  updated_at: string;
}

export interface NotificationItem {
  id: string;
  user_id: string;
  category: string;
  title: string;
  message: string;
  link_path: string;
  related_entity_id?: string | null;
  is_read: number;
  email_sent: number;
  email_subject: string;
  email_body: string;
  sms_simulated_text: string;
  created_at: string;
}

export interface AuditLog {
  id: string;
  actor_user_id: string;
  actor_name: string;
  actor_role: string;
  action: string;
  entity_type: string;
  entity_id: string;
  details: string;
  created_at: string;
}
