import initSqlJs, { type Database as SqlJsDatabase } from 'sql.js';
import fs from 'node:fs';
import path from 'node:path';
import { hashPassword } from './auth.ts';
import { evaluateAssetMatch } from './matching.ts';

const DATA_DIR = path.resolve(process.cwd(), 'data');
export const UPLOADS_DIR = path.resolve(process.cwd(), 'uploads', 'claim-documents');

fs.mkdirSync(DATA_DIR, { recursive: true });
fs.mkdirSync(UPLOADS_DIR, { recursive: true });

const DB_PATH = path.join(DATA_DIR, 'virasat_setu.db');

export interface LocalDb {
  exec: (sql: string) => void;
  prepare: (sql: string) => {
    run: (...params: any[]) => void;
    get: (...params: any[]) => any;
    all: (...params: any[]) => any[];
  };
}

let rawDb: SqlJsDatabase | null = null;
let suppressPersist = false;

function persistToDisk() {
  if (!rawDb || suppressPersist) return;
  const bytes = rawDb.export();
  fs.writeFileSync(DB_PATH, Buffer.from(bytes));
}

function normalizeParams(params: any[]): any[] {
  return params.map((p) => (p === undefined ? null : p));
}

export const db: LocalDb = {
  exec(sql: string) {
    if (!rawDb) throw new Error('Database not initialized');
    rawDb.exec(sql);
    persistToDisk();
  },
  prepare(sql: string) {
    return {
      run(...params: any[]) {
        if (!rawDb) throw new Error('Database not initialized');
        rawDb.run(sql, normalizeParams(params));
        persistToDisk();
      },
      get(...params: any[]) {
        if (!rawDb) throw new Error('Database not initialized');
        const stmt = rawDb.prepare(sql);
        try {
          stmt.bind(normalizeParams(params));
          if (!stmt.step()) return undefined;
          return stmt.getAsObject();
        } finally {
          stmt.free();
        }
      },
      all(...params: any[]) {
        if (!rawDb) throw new Error('Database not initialized');
        const stmt = rawDb.prepare(sql);
        const rows: any[] = [];
        try {
          stmt.bind(normalizeParams(params));
          while (stmt.step()) {
            rows.push(stmt.getAsObject());
          }
          return rows;
        } finally {
          stmt.free();
        }
      },
    };
  },
};

export async function initDatabase() {
  const SQL = await initSqlJs();
  if (fs.existsSync(DB_PATH)) {
    const fileBuffer = fs.readFileSync(DB_PATH);
    rawDb = new SQL.Database(fileBuffer);
  } else {
    rawDb = new SQL.Database();
  }

  rawDb.exec('PRAGMA foreign_keys = ON;');
  suppressPersist = true;
  db.exec(`
    CREATE TABLE IF NOT EXISTS institutions (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      code TEXT NOT NULL UNIQUE,
      category TEXT NOT NULL CHECK(category IN ('bank', 'insurance', 'mutual_fund')),
      contact_email TEXT NOT NULL,
      nodal_officer_name TEXT NOT NULL,
      city TEXT NOT NULL,
      is_active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS profiles (
      id TEXT PRIMARY KEY,
      email TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      full_name TEXT NOT NULL,
      phone TEXT NOT NULL,
      role TEXT NOT NULL CHECK(role IN ('family', 'admin', 'institution')),
      institution_id TEXT REFERENCES institutions(id) ON DELETE SET NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS deceased_persons (
      id TEXT PRIMARY KEY,
      submitted_by TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
      full_name TEXT NOT NULL,
      date_of_birth TEXT NOT NULL,
      date_of_death TEXT NOT NULL,
      gender TEXT NOT NULL,
      last_city TEXT NOT NULL,
      last_state TEXT NOT NULL,
      death_certificate_ref TEXT NOT NULL UNIQUE,
      death_registration_date TEXT NOT NULL,
      issuing_authority TEXT NOT NULL,
      sample_identity_ref TEXT NOT NULL,
      verification_status TEXT NOT NULL DEFAULT 'Pending Verification'
        CHECK(verification_status IN ('Pending Verification', 'Approved', 'Rejected', 'Additional Information Required')),
      admin_notes TEXT,
      reviewed_by TEXT REFERENCES profiles(id) ON DELETE SET NULL,
      reviewed_at TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS claimants (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
      deceased_person_id TEXT NOT NULL REFERENCES deceased_persons(id) ON DELETE CASCADE,
      full_name TEXT NOT NULL,
      email TEXT NOT NULL,
      phone TEXT NOT NULL,
      relationship TEXT NOT NULL,
      claimant_type TEXT NOT NULL CHECK(claimant_type IN ('Nominee', 'Legal Heir')),
      verification_status TEXT NOT NULL DEFAULT 'Pending'
        CHECK(verification_status IN ('Pending', 'Approved', 'Rejected', 'Additional Documents Required')),
      admin_notes TEXT,
      reviewed_by TEXT REFERENCES profiles(id) ON DELETE SET NULL,
      reviewed_at TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS claimant_relationships (
      id TEXT PRIMARY KEY,
      claimant_id TEXT NOT NULL REFERENCES claimants(id) ON DELETE CASCADE,
      deceased_person_id TEXT NOT NULL REFERENCES deceased_persons(id) ON DELETE CASCADE,
      relationship_label TEXT NOT NULL,
      priority_order INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS documents (
      id TEXT PRIMARY KEY,
      owner_user_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
      deceased_person_id TEXT REFERENCES deceased_persons(id) ON DELETE CASCADE,
      claimant_id TEXT REFERENCES claimants(id) ON DELETE CASCADE,
      claim_id TEXT,
      document_type TEXT NOT NULL,
      file_name TEXT NOT NULL,
      mime_type TEXT NOT NULL,
      file_size INTEGER NOT NULL,
      storage_bucket TEXT NOT NULL DEFAULT 'claim-documents',
      storage_path TEXT NOT NULL,
      uploaded_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS financial_assets (
      id TEXT PRIMARY KEY,
      institution_id TEXT NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
      category TEXT NOT NULL CHECK(category IN ('bank', 'insurance', 'mutual_fund')),
      holder_name TEXT NOT NULL,
      date_of_birth TEXT NOT NULL,
      sample_identity_ref TEXT NOT NULL,
      institution_name TEXT NOT NULL,
      account_or_policy_ref TEXT NOT NULL,
      masked_ref TEXT NOT NULL,
      sub_category TEXT NOT NULL,
      nominee_ref TEXT,
      record_status TEXT NOT NULL,
      unclaimed_status TEXT NOT NULL,
      fictional_amount REAL NOT NULL,
      city_or_branch TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS asset_matches (
      id TEXT PRIMARY KEY,
      deceased_person_id TEXT NOT NULL REFERENCES deceased_persons(id) ON DELETE CASCADE,
      financial_asset_id TEXT NOT NULL REFERENCES financial_assets(id) ON DELETE CASCADE,
      institution_id TEXT NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
      matching_score INTEGER NOT NULL,
      score_breakdown TEXT NOT NULL,
      matching_reasons TEXT NOT NULL,
      outcome_tier TEXT NOT NULL CHECK(outcome_tier IN ('Strong Potential Match', 'Requires Manual Review')),
      review_status TEXT NOT NULL DEFAULT 'Approved Match'
        CHECK(review_status IN ('Pending Review', 'Approved Match', 'Flagged for Manual Review', 'Rejected Match')),
      reviewed_by TEXT REFERENCES profiles(id) ON DELETE SET NULL,
      reviewed_notes TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      UNIQUE(deceased_person_id, financial_asset_id)
    );

    CREATE TABLE IF NOT EXISTS claims (
      id TEXT PRIMARY KEY,
      claim_number TEXT NOT NULL UNIQUE,
      asset_match_id TEXT NOT NULL UNIQUE REFERENCES asset_matches(id) ON DELETE CASCADE,
      deceased_person_id TEXT NOT NULL REFERENCES deceased_persons(id) ON DELETE CASCADE,
      financial_asset_id TEXT NOT NULL REFERENCES financial_assets(id) ON DELETE CASCADE,
      institution_id TEXT NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
      claimant_id TEXT NOT NULL REFERENCES claimants(id) ON DELETE CASCADE,
      user_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
      status TEXT NOT NULL DEFAULT 'Submitted'
        CHECK(status IN ('Submitted', 'Under Review', 'Documents Required', 'Approved', 'Rejected', 'Completed')),
      claimant_notes TEXT,
      institution_comments TEXT,
      status_history TEXT NOT NULL,
      submitted_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS notifications (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
      category TEXT NOT NULL,
      title TEXT NOT NULL,
      message TEXT NOT NULL,
      link_path TEXT NOT NULL,
      related_entity_id TEXT,
      is_read INTEGER NOT NULL DEFAULT 0,
      email_sent INTEGER NOT NULL DEFAULT 1,
      email_subject TEXT NOT NULL,
      email_body TEXT NOT NULL,
      sms_simulated_text TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS audit_logs (
      id TEXT PRIMARY KEY,
      actor_user_id TEXT REFERENCES profiles(id) ON DELETE SET NULL,
      actor_name TEXT NOT NULL,
      actor_role TEXT NOT NULL,
      action TEXT NOT NULL,
      entity_type TEXT NOT NULL,
      entity_id TEXT NOT NULL,
      details TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS contact_inquiries (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      email TEXT NOT NULL,
      subject TEXT NOT NULL,
      message TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
  `);

  const countRow = db.prepare('SELECT COUNT(*) as c FROM institutions').get() as { c: number };
  if (countRow.c === 0) {
    seedDatabase();
  }
  suppressPersist = false;
  persistToDisk();
}

function createSampleCertificateFile(fileName: string, content: string): { path: string; size: number } {
  const safePath = path.join(UPLOADS_DIR, fileName);
  fs.writeFileSync(safePath, content, 'utf8');
  const stats = fs.statSync(safePath);
  return { path: fileName, size: stats.size };
}

function seedDatabase() {
  const now = new Date('2026-11-12T09:30:00Z').toISOString();

  // 1. Seed 9 Financial Institutions
  const institutions = [
    {
      id: 'inst-brb-001',
      name: 'Bharatiya Rashtriya Bank',
      code: 'BRB',
      category: 'bank',
      contact_email: 'claims.nodal@brb-demo.in',
      nodal_officer_name: 'Meera Kulkarni',
      city: 'Mumbai, Maharashtra',
    },
    {
      id: 'inst-dhb-002',
      name: 'Dakshin Heritage Bank',
      code: 'DHB',
      category: 'bank',
      contact_email: 'inheritance@dhb-demo.in',
      nodal_officer_name: 'Raghavendra Iyer',
      city: 'Bengaluru, Karnataka',
    },
    {
      id: 'inst-ncb-003',
      name: 'Navjeevan Cooperative Bank',
      code: 'NCB',
      category: 'bank',
      contact_email: 'nodal@navjeevan-demo.in',
      nodal_officer_name: 'Sneha Joshi',
      city: 'Pune, Maharashtra',
    },
    {
      id: 'inst-sjic-004',
      name: 'Suraksha Jeevan Insurance Corp',
      code: 'SJIC',
      category: 'insurance',
      contact_email: 'settlements@sjic-demo.in',
      nodal_officer_name: 'Suresh Menon',
      city: 'New Delhi, Delhi',
    },
    {
      id: 'inst-asla-005',
      name: 'Arogya Shield Life Assurance',
      code: 'ASLA',
      category: 'insurance',
      contact_email: 'claims@arogyashield-demo.in',
      nodal_officer_name: 'Nandini Nair',
      city: 'Chennai, Tamil Nadu',
    },
    {
      id: 'inst-pgl-006',
      name: 'Pragati General & Life',
      code: 'PGL',
      category: 'insurance',
      contact_email: 'policy.claims@pragati-demo.in',
      nodal_officer_name: 'Harshvardhan Patel',
      city: 'Ahmedabad, Gujarat',
    },
    {
      id: 'inst-sam-007',
      name: 'Sanchay Asset Management',
      code: 'SAM',
      category: 'mutual_fund',
      contact_email: 'transmission@sanchayamc-demo.in',
      nodal_officer_name: 'Kavita Deshmukh',
      city: 'Mumbai, Maharashtra',
    },
    {
      id: 'inst-nimf-008',
      name: 'Nivesh India Mutual Fund',
      code: 'NIMF',
      category: 'mutual_fund',
      contact_email: 'investor.care@niveshmf-demo.in',
      nodal_officer_name: 'Arvind Reddy',
      city: 'Hyderabad, Telangana',
    },
    {
      id: 'inst-dfh-009',
      name: 'Dhanvriddhi Fund House',
      code: 'DFH',
      category: 'mutual_fund',
      contact_email: 'folios@dhanvriddhi-demo.in',
      nodal_officer_name: 'Subhashis Sen',
      city: 'Kolkata, West Bengal',
    },
  ];

  const insertInst = db.prepare(
    `INSERT INTO institutions (id, name, code, category, contact_email, nodal_officer_name, city, is_active, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?, ?)`
  );
  for (const inst of institutions) {
    insertInst.run(
      inst.id,
      inst.name,
      inst.code,
      inst.category,
      inst.contact_email,
      inst.nodal_officer_name,
      inst.city,
      now,
      now
    );
  }

  // 2. Seed Demo User Profiles
  const profiles = [
    {
      id: 'user-family-demo',
      email: 'family.demo@virasatsetu.in',
      password: 'Virasat@2026',
      full_name: 'Priya Kumar',
      phone: '+91 98201 44510',
      role: 'family',
      institution_id: null,
    },
    {
      id: 'user-family-verma',
      email: 'family.verma@virasatsetu.in',
      password: 'Virasat@2026',
      full_name: 'Rohan Verma',
      phone: '+91 98112 77320',
      role: 'family',
      institution_id: null,
    },
    {
      id: 'user-admin-demo',
      email: 'admin@virasatsetu.in',
      password: 'Admin@2026',
      full_name: 'Vikramaditya Rao',
      phone: '+91 98100 10001',
      role: 'admin',
      institution_id: null,
    },
    {
      id: 'user-rep-bank',
      email: 'rep.bank@virasatsetu.in',
      password: 'Inst@2026',
      full_name: 'Meera Kulkarni',
      phone: '+91 98204 88120',
      role: 'institution',
      institution_id: 'inst-brb-001',
    },
    {
      id: 'user-rep-insurance',
      email: 'rep.insurance@virasatsetu.in',
      password: 'Inst@2026',
      full_name: 'Suresh Menon',
      phone: '+91 98114 66340',
      role: 'institution',
      institution_id: 'inst-sjic-004',
    },
    {
      id: 'user-rep-mf',
      email: 'rep.mutualfund@virasatsetu.in',
      password: 'Inst@2026',
      full_name: 'Kavita Deshmukh',
      phone: '+91 98209 33190',
      role: 'institution',
      institution_id: 'inst-sam-007',
    },
  ];

  const insertProfile = db.prepare(
    `INSERT INTO profiles (id, email, password_hash, full_name, phone, role, institution_id, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
  );
  for (const p of profiles) {
    insertProfile.run(
      p.id,
      p.email,
      hashPassword(p.password),
      p.full_name,
      p.phone,
      p.role,
      p.institution_id,
      now,
      now
    );
  }

  // 3. Seed 90 Financial Assets (40 Bank, 25 Insurance, 25 Mutual Fund)
  // Including Rajesh Kumar's 4 assets (SIMULATED-123456, 1960-06-15)
  const insertAsset = db.prepare(
    `INSERT INTO financial_assets (
      id, institution_id, category, holder_name, date_of_birth, sample_identity_ref,
      institution_name, account_or_policy_ref, masked_ref, sub_category, nominee_ref,
      record_status, unclaimed_status, fictional_amount, city_or_branch, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  );

  // Rajesh Kumar's 4 matching records across all 3 categories
  const rajeshAssets = [
    {
      id: 'asset-rajesh-bank-sb',
      institution_id: 'inst-brb-001',
      category: 'bank',
      holder_name: 'Rajesh Kumar',
      date_of_birth: '1960-06-15',
      sample_identity_ref: 'SIMULATED-123456',
      institution_name: 'Bharatiya Rashtriya Bank',
      account_or_policy_ref: 'BRB-SB-8841209',
      masked_ref: 'XXXX-XXXX-1209',
      sub_category: 'Savings Account',
      nominee_ref: 'Priya Kumar (Spouse)',
      record_status: 'Dormant / Inoperative',
      unclaimed_status: 'Flagged Unclaimed',
      fictional_amount: 485200,
      city_or_branch: 'Pune Shivajinagar, Maharashtra',
    },
    {
      id: 'asset-rajesh-bank-fd',
      institution_id: 'inst-brb-001',
      category: 'bank',
      holder_name: 'Rajesh Kumar',
      date_of_birth: '1960-06-15',
      sample_identity_ref: 'SIMULATED-123456',
      institution_name: 'Bharatiya Rashtriya Bank',
      account_or_policy_ref: 'BRB-FD-3390451',
      masked_ref: 'XXXX-XXXX-0451',
      sub_category: 'Fixed Deposit (5-Yr)',
      nominee_ref: 'Priya Kumar (Spouse)',
      record_status: 'Matured / Unrenewed',
      unclaimed_status: 'Flagged Unclaimed',
      fictional_amount: 1250000,
      city_or_branch: 'Pune Shivajinagar, Maharashtra',
    },
    {
      id: 'asset-rajesh-ins-pol',
      institution_id: 'inst-sjic-004',
      category: 'insurance',
      holder_name: 'Rajesh Kumar',
      date_of_birth: '1960-06-15',
      sample_identity_ref: 'SIMULATED-123456',
      institution_name: 'Suraksha Jeevan Insurance Corp',
      account_or_policy_ref: 'SJIC-END-774129',
      masked_ref: 'XXXX-4129',
      sub_category: 'Jeevan Anand Endowment Policy',
      nominee_ref: 'Priya Kumar (Spouse)',
      record_status: 'In-Force / Matured',
      unclaimed_status: 'Unclaimed Death Benefit',
      fictional_amount: 1500000,
      city_or_branch: 'Pune Regional Office, Maharashtra',
    },
    {
      id: 'asset-rajesh-mf-fol',
      institution_id: 'inst-sam-007',
      category: 'mutual_fund',
      holder_name: 'Rajesh Kumar',
      date_of_birth: '1960-06-15',
      sample_identity_ref: 'SIMULATED-123456',
      institution_name: 'Sanchay Asset Management',
      account_or_policy_ref: 'SAM-FOL-990182',
      masked_ref: 'XXXX-0182',
      sub_category: 'Sanchay Balanced Advantage Fund',
      nominee_ref: 'Priya Kumar (Spouse)',
      record_status: 'Active / KYC Frozen',
      unclaimed_status: 'Unclaimed Redemption',
      fictional_amount: 842750,
      city_or_branch: 'Pune Investor Service Centre, Maharashtra',
    },
  ];

  for (const a of rajeshAssets) {
    insertAsset.run(
      a.id,
      a.institution_id,
      a.category,
      a.holder_name,
      a.date_of_birth,
      a.sample_identity_ref,
      a.institution_name,
      a.account_or_policy_ref,
      a.masked_ref,
      a.sub_category,
      a.nominee_ref,
      a.record_status,
      a.unclaimed_status,
      a.fictional_amount,
      a.city_or_branch,
      now,
      now
    );
  }

  // Historical person templates for 30 seeded deceased records + matching & unmatched assets
  const historicalPersons = [
    { name: 'Sureshchandra Verma', dob: '1954-03-22', dod: '2025-08-14', gender: 'Male', city: 'Lucknow', state: 'Uttar Pradesh', ref: 'SIMULATED-200101', cert: 'DC-2025-101', auth: 'Lucknow Municipal Corporation', owner: 'user-family-verma', status: 'Approved', nominee: 'Rohan Verma' },
    { name: 'Kamala Devi Iyer', dob: '1949-11-05', dod: '2025-09-02', gender: 'Female', city: 'Chennai', state: 'Tamil Nadu', ref: 'SIMULATED-200102', cert: 'DC-2025-102', auth: 'Greater Chennai Corporation', owner: 'user-family-verma', status: 'Approved', nominee: 'Meenakshi Iyer' },
    { name: 'Harishankar Nair', dob: '1958-07-19', dod: '2025-10-11', gender: 'Male', city: 'Kochi', state: 'Kerala', ref: 'SIMULATED-200103', cert: 'DC-2025-103', auth: 'Kochi Municipal Corporation', owner: 'user-family-demo', status: 'Approved', nominee: 'Lakshmi Nair' },
    { name: 'Mahendra Pratap Singh', dob: '1952-01-30', dod: '2025-07-29', gender: 'Male', city: 'Jaipur', state: 'Rajasthan', ref: 'SIMULATED-200104', cert: 'DC-2025-104', auth: 'Jaipur Nagar Nigam', owner: 'user-family-verma', status: 'Approved', nominee: 'Kavita Singh' },
    { name: 'Sunita Deshpande', dob: '1963-05-12', dod: '2025-11-03', gender: 'Female', city: 'Nagpur', state: 'Maharashtra', ref: 'SIMULATED-200105', cert: 'DC-2025-105', auth: 'Nagpur Municipal Corporation', owner: 'user-family-demo', status: 'Pending Verification', nominee: 'Priya Kumar' },
    { name: 'Gopalakrishna Hegde', dob: '1947-09-08', dod: '2025-06-18', gender: 'Male', city: 'Bengaluru', state: 'Karnataka', ref: 'SIMULATED-200106', cert: 'DC-2025-106', auth: 'BBMP Bengaluru', owner: 'user-family-verma', status: 'Approved', nominee: 'Rohan Verma' },
    { name: 'Bimala Chatterjee', dob: '1951-12-25', dod: '2025-10-20', gender: 'Female', city: 'Kolkata', state: 'West Bengal', ref: 'SIMULATED-200107', cert: 'DC-2025-107', auth: 'Kolkata Municipal Corporation', owner: 'user-family-verma', status: 'Approved', nominee: 'Anirban Chatterjee' },
    { name: 'Devendra Nath Tiwari', dob: '1956-04-14', dod: '2025-09-15', gender: 'Male', city: 'Bhopal', state: 'Madhya Pradesh', ref: 'SIMULATED-200108', cert: 'DC-2025-108', auth: 'Bhopal Municipal Corporation', owner: 'user-family-verma', status: 'Approved', nominee: 'Rohan Verma' },
    { name: 'Shanta Bai Kulkarni', dob: '1945-08-03', dod: '2025-05-28', gender: 'Female', city: 'Pune', state: 'Maharashtra', ref: 'SIMULATED-200109', cert: 'DC-2025-109', auth: 'Pune Municipal Corporation', owner: 'user-family-verma', status: 'Pending Verification', nominee: 'Anil Kulkarni' },
    { name: 'Narendra Mohan Gupta', dob: '1959-02-17', dod: '2025-11-01', gender: 'Male', city: 'New Delhi', state: 'Delhi', ref: 'SIMULATED-200110', cert: 'DC-2025-110', auth: 'MCD New Delhi', owner: 'user-family-verma', status: 'Approved', nominee: 'Rohan Verma' },
    { name: 'Padmavati Subramanian', dob: '1953-10-09', dod: '2025-08-22', gender: 'Female', city: 'Coimbatore', state: 'Tamil Nadu', ref: 'SIMULATED-200111', cert: 'DC-2025-111', auth: 'Coimbatore City Corporation', owner: 'user-family-verma', status: 'Approved', nominee: 'Karthik S' },
    { name: 'Rameshbhai Patel', dob: '1950-06-27', dod: '2025-07-07', gender: 'Male', city: 'Ahmedabad', state: 'Gujarat', ref: 'SIMULATED-200112', cert: 'DC-2025-112', auth: 'AMC Ahmedabad', owner: 'user-family-verma', status: 'Approved', nominee: 'Jignesh Patel' },
    { name: 'Usha Kiran Malhotra', dob: '1961-09-11', dod: '2025-10-05', gender: 'Female', city: 'Chandigarh', state: 'Chandigarh', ref: 'SIMULATED-200113', cert: 'DC-2025-113', auth: 'MC Chandigarh', owner: 'user-family-verma', status: 'Rejected', nominee: 'Vikram Malhotra' },
    { name: 'Jagdish Prasad Agarwal', dob: '1948-11-19', dod: '2025-09-29', gender: 'Male', city: 'Kanpur', state: 'Uttar Pradesh', ref: 'SIMULATED-200114', cert: 'DC-2025-114', auth: 'Kanpur Nagar Nigam', owner: 'user-family-verma', status: 'Pending Verification', nominee: 'Rohan Verma' },
    { name: 'Vasundhara Rao', dob: '1955-01-15', dod: '2025-08-08', gender: 'Female', city: 'Hyderabad', state: 'Telangana', ref: 'SIMULATED-200115', cert: 'DC-2025-115', auth: 'GHMC Hyderabad', owner: 'user-family-verma', status: 'Approved', nominee: 'Srinivas Rao' },
    { name: 'Keshav Murthy', dob: '1957-03-04', dod: '2025-10-17', gender: 'Male', city: 'Mysuru', state: 'Karnataka', ref: 'SIMULATED-200116', cert: 'DC-2025-116', auth: 'Mysuru City Corporation', owner: 'user-family-verma', status: 'Additional Information Required', nominee: 'Rohan Verma' },
    { name: 'Indira Sengupta', dob: '1946-07-21', dod: '2025-06-12', gender: 'Female', city: 'Siliguri', state: 'West Bengal', ref: 'SIMULATED-200117', cert: 'DC-2025-117', auth: 'Siliguri Municipal Corp', owner: 'user-family-verma', status: 'Approved', nominee: 'Tapan Sengupta' },
    { name: 'Bhaskar Narayanan', dob: '1962-12-01', dod: '2025-10-28', gender: 'Male', city: 'Madurai', state: 'Tamil Nadu', ref: 'SIMULATED-200118', cert: 'DC-2025-118', auth: 'Madurai Corporation', owner: 'user-family-verma', status: 'Pending Verification', nominee: 'Rohan Verma' },
    { name: 'Leela Krishnan', dob: '1950-04-26', dod: '2025-07-19', gender: 'Female', city: 'Thiruvananthapuram', state: 'Kerala', ref: 'SIMULATED-200119', cert: 'DC-2025-119', auth: 'TVM Corporation', owner: 'user-family-verma', status: 'Approved', nominee: 'Arjun Krishnan' },
    { name: 'Prakash Chandra Joshi', dob: '1958-08-14', dod: '2025-09-09', gender: 'Male', city: 'Dehradun', state: 'Uttarakhand', ref: 'SIMULATED-200120', cert: 'DC-2025-120', auth: 'Nagar Nigam Dehradun', owner: 'user-family-verma', status: 'Approved', nominee: 'Rohan Verma' },
    { name: 'Nirmala Devi Choudhary', dob: '1952-05-06', dod: '2025-08-30', gender: 'Female', city: 'Patna', state: 'Bihar', ref: 'SIMULATED-200121', cert: 'DC-2025-121', auth: 'Patna Municipal Corp', owner: 'user-family-verma', status: 'Pending Verification', nominee: 'Sanjay Choudhary' },
    { name: 'Arvind Kumar Saxena', dob: '1964-01-23', dod: '2025-11-02', gender: 'Male', city: 'Indore', state: 'Madhya Pradesh', ref: 'SIMULATED-200122', cert: 'DC-2025-122', auth: 'Indore Municipal Corp', owner: 'user-family-verma', status: 'Approved', nominee: 'Rohan Verma' },
    { name: 'Savita Ganguly', dob: '1949-09-17', dod: '2025-07-11', gender: 'Female', city: 'Howrah', state: 'West Bengal', ref: 'SIMULATED-200123', cert: 'DC-2025-123', auth: 'Howrah Municipal Corp', owner: 'user-family-verma', status: 'Approved', nominee: 'Ritwik Ganguly' },
    { name: 'Yogendra Singh Rathore', dob: '1955-11-29', dod: '2025-10-01', gender: 'Male', city: 'Udaipur', state: 'Rajasthan', ref: 'SIMULATED-200124', cert: 'DC-2025-124', auth: 'Udaipur Municipal Corp', owner: 'user-family-verma', status: 'Pending Verification', nominee: 'Rohan Verma' },
    { name: 'Meenakshi Sundaram', dob: '1951-02-08', dod: '2025-08-04', gender: 'Female', city: 'Trichy', state: 'Tamil Nadu', ref: 'SIMULATED-200125', cert: 'DC-2025-125', auth: 'Trichy Corporation', owner: 'user-family-verma', status: 'Approved', nominee: 'Suresh Sundaram' },
    { name: 'Vinod Kumar Bansal', dob: '1960-10-16', dod: '2025-10-22', gender: 'Male', city: 'Gurugram', state: 'Haryana', ref: 'SIMULATED-200126', cert: 'DC-2025-126', auth: 'MC Gurugram', owner: 'user-family-verma', status: 'Approved', nominee: 'Rohan Verma' },
    { name: 'Geeta Bhargava', dob: '1957-06-03', dod: '2025-09-12', gender: 'Female', city: 'Surat', state: 'Gujarat', ref: 'SIMULATED-200127', cert: 'DC-2025-127', auth: 'SMC Surat', owner: 'user-family-verma', status: 'Rejected', nominee: 'Alok Bhargava' },
    { name: 'Satishchandra Gokhale', dob: '1947-04-12', dod: '2025-06-25', gender: 'Male', city: 'Thane', state: 'Maharashtra', ref: 'SIMULATED-200128', cert: 'DC-2025-128', auth: 'Thane Municipal Corp', owner: 'user-family-verma', status: 'Approved', nominee: 'Rohan Verma' },
    { name: 'Anasuya Venkatesh', dob: '1953-07-31', dod: '2025-09-25', gender: 'Female', city: 'Visakhapatnam', state: 'Andhra Pradesh', ref: 'SIMULATED-200129', cert: 'DC-2025-129', auth: 'GVMC Visakhapatnam', owner: 'user-family-verma', status: 'Pending Verification', nominee: 'Venkat Rao' },
    { name: 'Harbans Lal Kapoor', dob: '1948-12-09', dod: '2025-08-19', gender: 'Male', city: 'Ludhiana', state: 'Punjab', ref: 'SIMULATED-200130', cert: 'DC-2025-130', auth: 'MC Ludhiana', owner: 'user-family-verma', status: 'Approved', nominee: 'Rohan Verma' },
  ];

  // Remaining 38 Bank records (total 40 bank records)
  const bankInstIds = ['inst-brb-001', 'inst-dhb-002', 'inst-ncb-003'];
  const bankNames: Record<string, string> = {
    'inst-brb-001': 'Bharatiya Rashtriya Bank',
    'inst-dhb-002': 'Dakshin Heritage Bank',
    'inst-ncb-003': 'Navjeevan Cooperative Bank',
  };

  for (let i = 0; i < 38; i++) {
    const isMatched = i < 20;
    const p = isMatched ? historicalPersons[i % 15] : null;
    const instId = i < 16 ? 'inst-brb-001' : bankInstIds[i % 3];
    const accNum = `${instId === 'inst-brb-001' ? 'BRB' : instId === 'inst-dhb-002' ? 'DHB' : 'NCB'}-${i % 3 === 0 ? 'FD' : 'SB'}-${500100 + i * 37}`;
    const masked = `XXXX-XXXX-${String(500100 + i * 37).slice(-4)}`;
    const holderName = p
      ? i === 18
        ? `${p.name.split(' ')[0]} ${p.name.split(' ').slice(-1)[0]}` // partial name for manual review test
        : p.name
      : `Unmatched Citizen ${i + 1}`;
    const ref = p
      ? i === 19
        ? `ALT-REF-${900 + i}` // different ref, same name + DOB -> won't auto-confirm without ID ref
        : p.ref
      : `SIMULATED-99${1000 + i}`;
    const dob = p ? p.dob : `195${i % 9}-0${(i % 8) + 1}-1${i % 9}`;
    const branch = p ? `${p.city} Main Branch, ${p.state}` : `Sector ${i + 1}, Mumbai`;
    const amount = 125000 + ((i * 73500) % 1450000);

    insertAsset.run(
      `asset-bank-${i + 1}`,
      instId,
      'bank',
      holderName,
      dob,
      ref,
      bankNames[instId],
      accNum,
      masked,
      i % 3 === 0 ? 'Fixed Deposit' : 'Savings Account',
      p ? `${p.nominee} (Family)` : 'Not Registered',
      i % 2 === 0 ? 'Dormant' : 'Inoperative > 5 Yrs',
      'Flagged Unclaimed',
      amount,
      branch,
      now,
      now
    );
  }

  // Remaining 24 Insurance records (total 25 insurance records)
  const insInstIds = ['inst-sjic-004', 'inst-asla-005', 'inst-pgl-006'];
  const insNames: Record<string, string> = {
    'inst-sjic-004': 'Suraksha Jeevan Insurance Corp',
    'inst-asla-005': 'Arogya Shield Life Assurance',
    'inst-pgl-006': 'Pragati General & Life',
  };

  for (let i = 0; i < 24; i++) {
    const isMatched = i < 12;
    const p = isMatched ? historicalPersons[i] : null;
    const instId = i < 10 ? 'inst-sjic-004' : insInstIds[i % 3];
    const polNum = `${instId === 'inst-sjic-004' ? 'SJIC' : instId === 'inst-asla-005' ? 'ASLA' : 'PGL'}-POL-${620100 + i * 53}`;
    const masked = `XXXX-${String(620100 + i * 53).slice(-4)}`;
    insertAsset.run(
      `asset-ins-${i + 1}`,
      instId,
      'insurance',
      p ? p.name : `Unclaimed Policyholder ${i + 1}`,
      p ? p.dob : `196${i % 8}-0${(i % 7) + 1}-2${i % 8}`,
      p ? p.ref : `SIMULATED-88${2000 + i}`,
      insNames[instId],
      polNum,
      masked,
      i % 2 === 0 ? 'Whole Life Policy' : 'Term & Savings Rider',
      p ? `${p.nominee} (Nominee)` : 'Legal Heir Pending',
      'Matured / Death Intimation Open',
      'Pending Payout',
      350000 + ((i * 125000) % 2200000),
      p ? `${p.city} Division, ${p.state}` : `Zone ${i + 1}, Delhi`,
      now,
      now
    );
  }

  // Remaining 24 Mutual Fund records (total 25 mutual fund records)
  const mfInstIds = ['inst-sam-007', 'inst-nimf-008', 'inst-dfh-009'];
  const mfNames: Record<string, string> = {
    'inst-sam-007': 'Sanchay Asset Management',
    'inst-nimf-008': 'Nivesh India Mutual Fund',
    'inst-dfh-009': 'Dhanvriddhi Fund House',
  };

  for (let i = 0; i < 24; i++) {
    const isMatched = i < 12;
    const p = isMatched ? historicalPersons[i] : null;
    const instId = i < 10 ? 'inst-sam-007' : mfInstIds[i % 3];
    const folNum = `${instId === 'inst-sam-007' ? 'SAM' : instId === 'inst-nimf-008' ? 'NIMF' : 'DFH'}-FOL-${410200 + i * 41}`;
    const masked = `XXXX-${String(410200 + i * 41).slice(-4)}`;
    insertAsset.run(
      `asset-mf-${i + 1}`,
      instId,
      'mutual_fund',
      p ? p.name : `Unclaimed Investor ${i + 1}`,
      p ? p.dob : `195${i % 9}-1${i % 2}-0${(i % 8) + 1}`,
      p ? p.ref : `SIMULATED-77${3000 + i}`,
      mfNames[instId],
      folNum,
      masked,
      i % 2 === 0 ? 'Bluechip Equity Growth' : 'Debt & Liquid Direct Plan',
      p ? `${p.nominee} (Nominee)` : 'Unassigned',
      'Active / KYC Hold',
      'Unclaimed Dividend & Units',
      210000 + ((i * 94500) % 1650000),
      p ? `${p.city} ISC, ${p.state}` : `ISC ${i + 1}, Bengaluru`,
      now,
      now
    );
  }

  // 4. Seed 30 Deceased Persons + sample documents + matches for Approved ones
  const sampleFile = createSampleCertificateFile(
    'sample-death-certificate-archive.txt',
    'SIMULATED MUNICIPAL DEATH CERTIFICATE ARCHIVE\nIssued for Virasat Setu College Prototype Demonstration.\n'
  );

  const insertDeceased = db.prepare(
    `INSERT INTO deceased_persons (
      id, submitted_by, full_name, date_of_birth, date_of_death, gender,
      last_city, last_state, death_certificate_ref, death_registration_date,
      issuing_authority, sample_identity_ref, verification_status, admin_notes,
      reviewed_by, reviewed_at, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  );

  const insertDoc = db.prepare(
    `INSERT INTO documents (
      id, owner_user_id, deceased_person_id, claimant_id, claim_id, document_type,
      file_name, mime_type, file_size, storage_bucket, storage_path, uploaded_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'claim-documents', ?, ?)`
  );

  const insertClaimant = db.prepare(
    `INSERT INTO claimants (
      id, user_id, deceased_person_id, full_name, email, phone, relationship,
      claimant_type, verification_status, admin_notes, reviewed_by, reviewed_at, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  );

  const insertRel = db.prepare(
    `INSERT INTO claimant_relationships (id, claimant_id, deceased_person_id, relationship_label, priority_order, created_at)
     VALUES (?, ?, ?, ?, ?, ?)`
  );

  const insertMatch = db.prepare(
    `INSERT INTO asset_matches (
      id, deceased_person_id, financial_asset_id, institution_id, matching_score,
      score_breakdown, matching_reasons, outcome_tier, review_status, reviewed_by,
      reviewed_notes, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  );

  const insertClaim = db.prepare(
    `INSERT INTO claims (
      id, claim_number, asset_match_id, deceased_person_id, financial_asset_id,
      institution_id, claimant_id, user_id, status, claimant_notes,
      institution_comments, status_history, submitted_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  );

  const allAssets = db.prepare('SELECT * FROM financial_assets').all() as Array<{
    id: string;
    institution_id: string;
    category: 'bank' | 'insurance' | 'mutual_fund';
    holder_name: string;
    date_of_birth: string;
    sample_identity_ref: string;
    institution_name: string;
    nominee_ref: string | null;
    city_or_branch: string | null;
  }>;

  let claimSeq = 1001;

  for (let idx = 0; idx < historicalPersons.length; idx++) {
    const p = historicalPersons[idx];
    const decId = `dec-seed-${idx + 1}`;
    const isReviewed = p.status !== 'Pending Verification';
    const createdAt = new Date(Date.now() - (35 - idx) * 86400000).toISOString();

    insertDeceased.run(
      decId,
      p.owner,
      p.name,
      p.dob,
      p.dod,
      p.gender,
      p.city,
      p.state,
      p.cert,
      p.dod,
      p.auth,
      p.ref,
      p.status,
      isReviewed ? `Registry record ${p.status.toLowerCase()} after verification.` : null,
      isReviewed ? 'user-admin-demo' : null,
      isReviewed ? createdAt : null,
      createdAt,
      createdAt
    );

    insertDoc.run(
      `doc-seed-${idx + 1}`,
      p.owner,
      decId,
      null,
      null,
      'Death Certificate',
      `${p.cert}_certificate.txt`,
      'text/plain',
      sampleFile.size,
      sampleFile.path,
      createdAt
    );

    const claimantId = `claimant-seed-${idx + 1}`;
    const claimantStatus =
      idx < 6 ? 'Approved' : idx < 10 ? 'Pending' : p.status === 'Approved' ? 'Approved' : 'Pending';
    insertClaimant.run(
      claimantId,
      p.owner,
      decId,
      p.nominee,
      p.owner === 'user-family-demo' ? 'family.demo@virasatsetu.in' : 'family.verma@virasatsetu.in',
      '+91 98112 77320',
      idx % 2 === 0 ? 'Son' : 'Spouse',
      idx % 3 === 0 ? 'Legal Heir' : 'Nominee',
      claimantStatus,
      claimantStatus === 'Approved' ? 'KYC & relationship proof verified.' : null,
      claimantStatus === 'Approved' ? 'user-admin-demo' : null,
      claimantStatus === 'Approved' ? createdAt : null,
      createdAt,
      createdAt
    );

    insertRel.run(
      `rel-seed-${idx + 1}`,
      claimantId,
      decId,
      idx % 2 === 0 ? 'Son' : 'Spouse',
      1,
      createdAt
    );

    if (p.status === 'Approved') {
      for (const asset of allAssets) {
        const res = evaluateAssetMatch(
          {
            id: decId,
            full_name: p.name,
            date_of_birth: p.dob,
            sample_identity_ref: p.ref,
            last_city: p.city,
            last_state: p.state,
            claimant_names: [p.nominee],
          },
          asset
        );
        if (res) {
          const matchId = `match-seed-${idx + 1}-${asset.id}`;
          insertMatch.run(
            matchId,
            decId,
            asset.id,
            asset.institution_id,
            res.matching_score,
            JSON.stringify(res.score_breakdown),
            JSON.stringify(res.matching_reasons),
            res.outcome_tier,
            res.review_status,
            'user-admin-demo',
            'Automated multi-registry discovery match.',
            createdAt,
            createdAt
          );

          // Create sample claims on first 6 deceased records for realistic dashboard analytics
          if (idx < 6 && claimantStatus === 'Approved') {
            const statuses = ['Completed', 'Approved', 'Under Review', 'Documents Required', 'Submitted', 'Completed'] as const;
            const st = statuses[(idx + claimSeq) % statuses.length];
            const history = [
              {
                status: 'Submitted',
                timestamp: createdAt,
                actor: p.nominee,
                comment: 'Claim submitted with verified death certificate and claimant KYC.',
              },
            ];
            if (st !== 'Submitted') {
              history.push({
                status: st,
                timestamp: now,
                actor: 'Institution Nodal Officer',
                comment:
                  st === 'Completed'
                    ? 'Simulated settlement processed and closed.'
                    : st === 'Documents Required'
                    ? 'Please upload notarized indemnity bond.'
                    : 'Claim verified against institutional ledger.',
              });
            }
            insertClaim.run(
              `claim-seed-${claimSeq}`,
              `VS-CLM-${claimSeq}`,
              matchId,
              decId,
              asset.id,
              asset.institution_id,
              claimantId,
              p.owner,
              st,
              'Requesting asset claim verification and release instructions.',
              history[history.length - 1].comment,
              JSON.stringify(history),
              createdAt,
              now
            );
            claimSeq++;
          }
        }
      }
    }
  }

  // 5. Seed initial notifications & audit logs
  db.prepare(
    `INSERT INTO notifications (
      id, user_id, category, title, message, link_path, related_entity_id,
      is_read, email_sent, email_subject, email_body, sms_simulated_text, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, 0, 1, ?, ?, ?, ?)`
  ).run(
    'notif-seed-welcome',
    'user-family-demo',
    'system',
    'Welcome to Virasat Setu Portal',
    'Submit a deceased family member record to begin automated discovery across participating banks, insurers, and mutual funds.',
    '/family',
    null,
    'Welcome to Virasat Setu',
    'Dear Priya Kumar,\n\nYour Virasat Setu family portal is active. You can submit death registration details and track asset discovery requests securely.',
    '[Virasat Setu] Welcome to your family inheritance discovery portal.',
    now
  );

  db.prepare(
    `INSERT INTO audit_logs (id, actor_user_id, actor_name, actor_role, action, entity_type, entity_id, details, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    'audit-seed-1',
    'user-admin-demo',
    'Vikramaditya Rao',
    'admin',
    'SYSTEM_SEED_INITIALIZED',
    'system',
    'registry',
    'Initialized 9 financial institutions, 90 simulated financial asset records, and 30 registry records.',
    now
  );
}
