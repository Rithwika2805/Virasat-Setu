import express from 'express';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import multer from 'multer';
import { createServer as createViteServer } from 'vite';
import { db, initDatabase, UPLOADS_DIR } from './server/db.ts';
import {
  hashPassword,
  verifyPassword,
  signToken,
  requireAuth,
  requireRole,
  type AuthenticatedRequest,
} from './server/auth.ts';
import { evaluateAssetMatch } from './server/matching.ts';
import { dispatchNotification } from './server/notifications.ts';

const app = express();
const PORT = 3000;

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// CORS headers for flexible frontend/backend integration
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', req.headers.origin || '*');
  res.header('Access-Control-Allow-Methods', 'GET,POST,PATCH,PUT,DELETE,OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') {
    res.sendStatus(204);
    return;
  }
  next();
});

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    cb(null, UPLOADS_DIR);
  },
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname).replace(/[^a-zA-Z0-9.]/g, '');
    cb(null, `${Date.now()}-${crypto.randomUUID().slice(0, 8)}${ext}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 },
});

function logAudit(
  actor: { id: string; full_name: string; role: string },
  action: string,
  entityType: string,
  entityId: string,
  details: string
) {
  db.prepare(
    `INSERT INTO audit_logs (id, actor_user_id, actor_name, actor_role, action, entity_type, entity_id, details, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    crypto.randomUUID(),
    actor.id,
    actor.full_name,
    actor.role,
    action,
    entityType,
    entityId,
    details,
    new Date().toISOString()
  );
}

async function runAssetMatchingForDeceased(
  deceasedId: string,
  actor: { id: string; full_name: string; role: string }
) {
  const deceased = db
    .prepare('SELECT * FROM deceased_persons WHERE id = ?')
    .get(deceasedId) as any;

  if (!deceased) {
    throw new Error('Deceased record not found');
  }
  if (deceased.verification_status !== 'Approved') {
    throw new Error('Only Approved death records can enter asset matching');
  }

  const claimants = db
    .prepare('SELECT full_name FROM claimants WHERE deceased_person_id = ?')
    .all(deceasedId) as Array<{ full_name: string }>;

  const assets = db.prepare('SELECT * FROM financial_assets').all() as any[];

  const insertMatch = db.prepare(
    `INSERT INTO asset_matches (
      id, deceased_person_id, financial_asset_id, institution_id, matching_score,
      score_breakdown, matching_reasons, outcome_tier, review_status,
      reviewed_by, reviewed_notes, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  );

  const now = new Date().toISOString();
  const createdMatches: any[] = [];
  let skippedDuplicates = 0;

  for (const asset of assets) {
    const existing = db
      .prepare(
        'SELECT id FROM asset_matches WHERE deceased_person_id = ? AND financial_asset_id = ?'
      )
      .get(deceasedId, asset.id);

    if (existing) {
      skippedDuplicates++;
      continue;
    }

    const evaluation = evaluateAssetMatch(
      {
        id: deceased.id,
        full_name: deceased.full_name,
        date_of_birth: deceased.date_of_birth,
        sample_identity_ref: deceased.sample_identity_ref,
        last_city: deceased.last_city,
        last_state: deceased.last_state,
        claimant_names: claimants.map((c) => c.full_name),
      },
      asset
    );

    if (evaluation) {
      const matchId = crypto.randomUUID();
      insertMatch.run(
        matchId,
        deceasedId,
        asset.id,
        asset.institution_id,
        evaluation.matching_score,
        JSON.stringify(evaluation.score_breakdown),
        JSON.stringify(evaluation.matching_reasons),
        evaluation.outcome_tier,
        evaluation.review_status,
        actor.id,
        'Generated automatically upon death registration approval.',
        now,
        now
      );
      createdMatches.push({
        id: matchId,
        institution_id: asset.institution_id,
        institution_name: asset.institution_name,
        category: asset.category,
        matching_score: evaluation.matching_score,
        outcome_tier: evaluation.outcome_tier,
      });
    }
  }

  logAudit(
    actor,
    'ASSET_MATCHING_EXECUTED',
    'deceased_person',
    deceasedId,
    `Scanned ${assets.length} institutional records for ${deceased.full_name}. Discovered ${createdMatches.length} new potential matches (${skippedDuplicates} already recorded).`
  );

  if (createdMatches.length > 0) {
    await dispatchNotification(db, {
      userId: deceased.submitted_by,
      category: 'asset_discovery',
      title: `${createdMatches.length} Potential Financial Asset${createdMatches.length > 1 ? 's' : ''} Discovered`,
      message: `Potential financial records associated with ${deceased.full_name} (${deceased.death_certificate_ref}) have been identified across participating institutions. These are potential matches and not confirmed ownership.`,
      linkPath: '/family/assets',
      relatedEntityId: deceasedId,
      emailSubject: `Virasat Setu Alert: Potential Financial Record Identified`,
      emailBody: `Dear User,\n\nA potential financial record associated with your deceased family member (${deceased.full_name}) has been identified across ${createdMatches.length} institutional dataset(s).\n\nPlease log in to Virasat Setu to view the details and proceed with the claimant verification process.\n\nNote: For security, no account references or asset balances are included in email notifications.`,
      smsSimulatedText: `[Virasat Setu] ${createdMatches.length} potential financial match(es) identified for ${deceased.full_name}. Log in to review and verify claimant status.`,
    });

    // Notify relevant institution representatives
    const notifiedInsts = new Set<string>();
    for (const m of createdMatches) {
      if (notifiedInsts.has(m.institution_id)) continue;
      notifiedInsts.add(m.institution_id);
      const reps = db
        .prepare("SELECT id, email FROM profiles WHERE role = 'institution' AND institution_id = ?")
        .all(m.institution_id) as Array<{ id: string; email: string }>;
      for (const rep of reps) {
        await dispatchNotification(db, {
          userId: rep.id,
          userEmail: rep.email,
          category: 'asset_discovery',
          title: 'New Verified Death Record Match Queue',
          message: `Verified death registration for ${deceased.full_name} matched institutional record(s) at ${m.institution_name}.`,
          linkPath: '/institution',
          relatedEntityId: m.id,
        });
      }
    }
  }

  return {
    scannedCount: assets.length,
    newMatchesCount: createdMatches.length,
    skippedDuplicates,
    matches: createdMatches,
  };
}

// ========================
// PUBLIC & AUTH ENDPOINTS
// ========================

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', service: 'Virasat Setu API', timestamp: new Date().toISOString() });
});

app.get('/api/institutions', (_req, res) => {
  const rows = db
    .prepare('SELECT * FROM institutions WHERE is_active = 1 ORDER BY category, name')
    .all();
  res.json({ institutions: rows });
});

app.post('/api/contact', (req, res) => {
  const { name, email, subject, message } = req.body || {};
  if (!name || !email || !message) {
    res.status(400).json({ error: 'Name, email, and message are required.' });
    return;
  }
  const id = crypto.randomUUID();
  db.prepare(
    'INSERT INTO contact_inquiries (id, name, email, subject, message, created_at) VALUES (?, ?, ?, ?, ?, ?)'
  ).run(id, String(name).trim(), String(email).trim(), String(subject || 'General Inquiry').trim(), String(message).trim(), new Date().toISOString());

  res.status(201).json({
    id,
    message: 'Your inquiry has been logged with the Virasat Setu Support Desk.',
  });
});

app.post('/api/auth/register', async (req, res) => {
  try {
    const { email, password, full_name, phone, role, institution_id } = req.body || {};
    if (!email || !password || !full_name) {
      res.status(400).json({ error: 'Full name, email, and password are required.' });
      return;
    }
    if (String(password).length < 6) {
      res.status(400).json({ error: 'Password must be at least 6 characters.' });
      return;
    }

    const normalizedEmail = String(email).trim().toLowerCase();
    const existing = db
      .prepare('SELECT id FROM profiles WHERE lower(email) = ?')
      .get(normalizedEmail);
    if (existing) {
      res.status(409).json({ error: 'An account with this email already exists.' });
      return;
    }

    const assignedRole: 'family' | 'admin' | 'institution' =
      role === 'institution' || role === 'admin' ? role : 'family';

    let assignedInstId: string | null = null;
    if (assignedRole === 'institution') {
      if (!institution_id) {
        res.status(400).json({ error: 'Institution selection is required for institution representatives.' });
        return;
      }
      const inst = db.prepare('SELECT id FROM institutions WHERE id = ?').get(institution_id);
      if (!inst) {
        res.status(400).json({ error: 'Selected institution was not found.' });
        return;
      }
      assignedInstId = institution_id;
    }

    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    db.prepare(
      `INSERT INTO profiles (id, email, password_hash, full_name, phone, role, institution_id, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      id,
      normalizedEmail,
      hashPassword(String(password)),
      String(full_name).trim(),
      String(phone || '+91 90000 00000').trim(),
      assignedRole,
      assignedInstId,
      now,
      now
    );

    await dispatchNotification(db, {
      userId: id,
      userEmail: normalizedEmail,
      category: 'system',
      title: 'Account Created on Virasat Setu',
      message: `Welcome ${String(full_name).trim()}. Your ${assignedRole} account is now active.`,
      linkPath: assignedRole === 'admin' ? '/admin' : assignedRole === 'institution' ? '/institution' : '/family',
    });

    logAudit(
      { id, full_name: String(full_name).trim(), role: assignedRole },
      'USER_REGISTERED',
      'profile',
      id,
      `New ${assignedRole} user registered (${normalizedEmail}).`
    );

    const authUser = {
      id,
      email: normalizedEmail,
      full_name: String(full_name).trim(),
      role: assignedRole,
      institution_id: assignedInstId,
    };
    const token = signToken(authUser);
    res.status(201).json({ token, user: authUser });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Registration failed' });
  }
});

app.post('/api/auth/login', (req, res) => {
  const { email, password } = req.body || {};
  if (!email || !password) {
    res.status(400).json({ error: 'Email and password are required.' });
    return;
  }

  const normalizedEmail = String(email).trim().toLowerCase();
  const profile = db
    .prepare(
      `SELECT p.*, i.name as institution_name, i.category as institution_category
       FROM profiles p
       LEFT JOIN institutions i ON p.institution_id = i.id
       WHERE lower(p.email) = ?`
    )
    .get(normalizedEmail) as any;

  if (!profile || !verifyPassword(String(password), profile.password_hash)) {
    res.status(401).json({ error: 'Invalid email or password.' });
    return;
  }

  const authUser = {
    id: profile.id,
    email: profile.email,
    full_name: profile.full_name,
    role: profile.role,
    institution_id: profile.institution_id ?? null,
    institution_name: profile.institution_name ?? null,
    institution_category: profile.institution_category ?? null,
    phone: profile.phone,
  };
  const token = signToken({
    id: profile.id,
    email: profile.email,
    full_name: profile.full_name,
    role: profile.role,
    institution_id: profile.institution_id ?? null,
  });

  res.json({ token, user: authUser });
});

app.post('/api/auth/forgot-password', async (req, res) => {
  const { email, new_password } = req.body || {};
  if (!email) {
    res.status(400).json({ error: 'Email is required.' });
    return;
  }
  const normalizedEmail = String(email).trim().toLowerCase();
  const profile = db
    .prepare('SELECT id, email, full_name FROM profiles WHERE lower(email) = ?')
    .get(normalizedEmail) as any;

  if (!profile) {
    // Return uniform response for privacy
    res.json({ message: 'If an account matches that email, recovery instructions have been issued.' });
    return;
  }

  if (new_password) {
    if (String(new_password).length < 6) {
      res.status(400).json({ error: 'New password must be at least 6 characters.' });
      return;
    }
    db.prepare('UPDATE profiles SET password_hash = ?, updated_at = ? WHERE id = ?').run(
      hashPassword(String(new_password)),
      new Date().toISOString(),
      profile.id
    );
    await dispatchNotification(db, {
      userId: profile.id,
      userEmail: profile.email,
      category: 'system',
      title: 'Password Updated',
      message: 'Your Virasat Setu account password was successfully updated.',
      linkPath: '/auth',
    });
    res.json({ message: 'Password updated successfully. You may now log in with your new password.' });
    return;
  }

  const recoveryCode = `VS-${crypto.randomInt(100000, 999999)}`;
  await dispatchNotification(db, {
    userId: profile.id,
    userEmail: profile.email,
    category: 'system',
    title: 'Password Recovery Verification',
    message: `A password recovery request was initiated for ${profile.email}. Verification code: ${recoveryCode}`,
    linkPath: '/auth',
  });

  res.json({
    message: 'Recovery verification code dispatched to your registered email.',
    simulated_code: recoveryCode,
  });
});

app.get('/api/auth/me', requireAuth, (req: AuthenticatedRequest, res) => {
  const profile = db
    .prepare(
      `SELECT p.id, p.email, p.full_name, p.phone, p.role, p.institution_id, p.created_at,
              i.name as institution_name, i.category as institution_category
       FROM profiles p
       LEFT JOIN institutions i ON p.institution_id = i.id
       WHERE p.id = ?`
    )
    .get(req.user!.id);
  if (!profile) {
    res.status(404).json({ error: 'User profile not found.' });
    return;
  }
  res.json({ user: profile });
});

// ========================
// FAMILY DASHBOARD & DECEASED RECORDS
// ========================

app.get('/api/family/dashboard', requireAuth, requireRole('family', 'admin'), (req: AuthenticatedRequest, res) => {
  const userId = req.user!.id;

  const deceasedRows = db
    .prepare('SELECT * FROM deceased_persons WHERE submitted_by = ? ORDER BY created_at DESC')
    .all(userId) as any[];

  const matchesCountRow = db
    .prepare(
      `SELECT COUNT(*) as c FROM asset_matches m
       JOIN deceased_persons d ON m.deceased_person_id = d.id
       WHERE d.submitted_by = ? AND m.review_status != 'Rejected Match'`
    )
    .get(userId) as { c: number };

  const claimsRows = db
    .prepare(
      `SELECT c.*, fa.institution_name, fa.category as asset_category, fa.masked_ref, fa.fictional_amount,
              dp.full_name as deceased_name
       FROM claims c
       JOIN financial_assets fa ON c.financial_asset_id = fa.id
       JOIN deceased_persons dp ON c.deceased_person_id = dp.id
       WHERE c.user_id = ?
       ORDER BY c.updated_at DESC`
    )
    .all(userId) as any[];

  const unreadNotifs = db
    .prepare('SELECT COUNT(*) as c FROM notifications WHERE user_id = ? AND is_read = 0')
    .get(userId) as { c: number };

  const recentActivity = db
    .prepare(
      `SELECT * FROM audit_logs
       WHERE actor_user_id = ? OR entity_id IN (SELECT id FROM deceased_persons WHERE submitted_by = ?)
       ORDER BY created_at DESC LIMIT 12`
    )
    .all(userId, userId);

  res.json({
    stats: {
      totalDeceasedSubmitted: deceasedRows.length,
      potentialAssetsDiscovered: matchesCountRow.c,
      claimsInProgress: claimsRows.filter((c) => !['Completed', 'Rejected'].includes(c.status)).length,
      totalClaims: claimsRows.length,
      unreadNotifications: unreadNotifs.c,
    },
    deceasedRecords: deceasedRows,
    claims: claimsRows.map((c) => ({
      ...c,
      status_history: JSON.parse(c.status_history || '[]'),
    })),
    recentActivity,
  });
});

app.post(
  '/api/deceased',
  requireAuth,
  upload.array('documents', 5),
  async (req: AuthenticatedRequest, res) => {
    try {
      const b = req.body || {};
      const requiredFields = [
        'full_name',
        'date_of_birth',
        'date_of_death',
        'gender',
        'last_city',
        'last_state',
        'death_certificate_ref',
        'death_registration_date',
        'issuing_authority',
        'sample_identity_ref',
        'claimant_name',
        'relationship',
        'claimant_email',
        'claimant_phone',
        'claimant_type',
      ];
      for (const f of requiredFields) {
        if (!b[f] || !String(b[f]).trim()) {
          res.status(400).json({ error: `Missing required field: ${f}` });
          return;
        }
      }

      const certRef = String(b.death_certificate_ref).trim().toUpperCase();
      const dupCert = db
        .prepare('SELECT id FROM deceased_persons WHERE upper(death_certificate_ref) = ?')
        .get(certRef);
      if (dupCert) {
        res.status(409).json({
          error: `A record with Death Certificate Reference "${certRef}" already exists.`,
        });
        return;
      }

      const now = new Date().toISOString();
      const deceasedId = crypto.randomUUID();
      const claimantId = crypto.randomUUID();

      db.prepare(
        `INSERT INTO deceased_persons (
          id, submitted_by, full_name, date_of_birth, date_of_death, gender,
          last_city, last_state, death_certificate_ref, death_registration_date,
          issuing_authority, sample_identity_ref, verification_status, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'Pending Verification', ?, ?)`
      ).run(
        deceasedId,
        req.user!.id,
        String(b.full_name).trim(),
        String(b.date_of_birth).trim(),
        String(b.date_of_death).trim(),
        String(b.gender).trim(),
        String(b.last_city).trim(),
        String(b.last_state).trim(),
        certRef,
        String(b.death_registration_date).trim(),
        String(b.issuing_authority).trim(),
        String(b.sample_identity_ref).trim().toUpperCase(),
        now,
        now
      );

      db.prepare(
        `INSERT INTO claimants (
          id, user_id, deceased_person_id, full_name, email, phone, relationship,
          claimant_type, verification_status, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'Pending', ?, ?)`
      ).run(
        claimantId,
        req.user!.id,
        deceasedId,
        String(b.claimant_name).trim(),
        String(b.claimant_email).trim().toLowerCase(),
        String(b.claimant_phone).trim(),
        String(b.relationship).trim(),
        b.claimant_type === 'Legal Heir' ? 'Legal Heir' : 'Nominee',
        now,
        now
      );

      db.prepare(
        `INSERT INTO claimant_relationships (id, claimant_id, deceased_person_id, relationship_label, priority_order, created_at)
         VALUES (?, ?, ?, ?, 1, ?)`
      ).run(crypto.randomUUID(), claimantId, deceasedId, String(b.relationship).trim(), now);

      const files = (req.files as Express.Multer.File[]) || [];
      const savedDocs: any[] = [];
      for (let i = 0; i < files.length; i++) {
        const f = files[i];
        const docId = crypto.randomUUID();
        const docType = i === 0 ? 'Death Certificate' : 'Supporting Document';
        db.prepare(
          `INSERT INTO documents (
            id, owner_user_id, deceased_person_id, claimant_id, document_type,
            file_name, mime_type, file_size, storage_bucket, storage_path, uploaded_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'claim-documents', ?, ?)`
        ).run(
          docId,
          req.user!.id,
          deceasedId,
          claimantId,
          docType,
          f.originalname,
          f.mimetype,
          f.size,
          f.filename,
          now
        );
        savedDocs.push({ id: docId, file_name: f.originalname, document_type: docType });
      }

      logAudit(
        req.user!,
        'DECEASED_RECORD_SUBMITTED',
        'deceased_person',
        deceasedId,
        `Submitted death registration record for ${String(b.full_name).trim()} (${certRef}). Status: Pending Verification.`
      );

      await dispatchNotification(db, {
        userId: req.user!.id,
        category: 'death_record',
        title: 'Death Record Submitted for Verification',
        message: `Record for ${String(b.full_name).trim()} (${certRef}) has been received and is awaiting registry verification.`,
        linkPath: '/family',
        relatedEntityId: deceasedId,
      });

      const admins = db.prepare("SELECT id, email FROM profiles WHERE role = 'admin'").all() as Array<{
        id: string;
        email: string;
      }>;
      for (const adm of admins) {
        await dispatchNotification(db, {
          userId: adm.id,
          userEmail: adm.email,
          category: 'death_record',
          title: 'New Death Record Pending Verification',
          message: `${req.user!.full_name} submitted a new death registration record for ${String(b.full_name).trim()} (${certRef}).`,
          linkPath: '/admin',
          relatedEntityId: deceasedId,
        });
      }

      const createdRecord = db
        .prepare('SELECT * FROM deceased_persons WHERE id = ?')
        .get(deceasedId);
      res.status(201).json({
        record: createdRecord,
        claimant_id: claimantId,
        documents: savedDocs,
        message: 'Deceased family member record submitted and queued for verification.',
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message || 'Failed to submit deceased record.' });
    }
  }
);

app.get('/api/deceased', requireAuth, (req: AuthenticatedRequest, res) => {
  const { search, status } = req.query;
  let query = `
    SELECT d.*,
      (SELECT COUNT(*) FROM asset_matches m WHERE m.deceased_person_id = d.id AND m.review_status != 'Rejected Match') as match_count,
      (SELECT COUNT(*) FROM documents doc WHERE doc.deceased_person_id = d.id) as document_count
    FROM deceased_persons d
    WHERE 1=1
  `;
  const params: any[] = [];

  if (req.user!.role === 'family') {
    query += ' AND d.submitted_by = ?';
    params.push(req.user!.id);
  } else if (req.user!.role === 'institution') {
    query += ` AND d.id IN (SELECT deceased_person_id FROM asset_matches WHERE institution_id = ?)`;
    params.push(req.user!.institution_id);
  }

  if (status && typeof status === 'string' && status !== 'All') {
    query += ' AND d.verification_status = ?';
    params.push(status);
  }

  if (search && typeof search === 'string' && search.trim()) {
    const term = `%${search.trim().toLowerCase()}%`;
    query +=
      ' AND (lower(d.full_name) LIKE ? OR lower(d.death_certificate_ref) LIKE ? OR lower(d.sample_identity_ref) LIKE ? OR lower(d.last_city) LIKE ?)';
    params.push(term, term, term, term);
  }

  query += ' ORDER BY d.created_at DESC';
  const rows = db.prepare(query).all(...params);
  res.json({ records: rows });
});

app.get('/api/deceased/:id', requireAuth, (req: AuthenticatedRequest, res) => {
  const { id } = req.params;
  const record = db.prepare('SELECT * FROM deceased_persons WHERE id = ?').get(id) as any;
  if (!record) {
    res.status(404).json({ error: 'Deceased record not found.' });
    return;
  }

  if (req.user!.role === 'family' && record.submitted_by !== req.user!.id) {
    res.status(403).json({ error: 'Access denied to another user’s private record.' });
    return;
  }
  if (req.user!.role === 'institution') {
    const instMatch = db
      .prepare('SELECT id FROM asset_matches WHERE deceased_person_id = ? AND institution_id = ?')
      .get(id, req.user!.institution_id);
    if (!instMatch) {
      res.status(403).json({ error: 'Access denied. Record has no matches for your institution.' });
      return;
    }
  }

  const documents = db
    .prepare('SELECT * FROM documents WHERE deceased_person_id = ? ORDER BY uploaded_at DESC')
    .all(id);
  const claimants = db
    .prepare('SELECT * FROM claimants WHERE deceased_person_id = ? ORDER BY created_at DESC')
    .all(id);
  const submitter = db
    .prepare('SELECT id, full_name, email, phone FROM profiles WHERE id = ?')
    .get(record.submitted_by);

  res.json({ record, documents, claimants, submitter });
});

app.patch(
  '/api/deceased/:id/verify',
  requireAuth,
  requireRole('admin'),
  async (req: AuthenticatedRequest, res) => {
    try {
      const { id } = req.params;
      const { status, admin_notes } = req.body || {};
      const allowed = ['Approved', 'Rejected', 'Additional Information Required'];
      if (!allowed.includes(status)) {
        res.status(400).json({ error: `Status must be one of: ${allowed.join(', ')}` });
        return;
      }

      const existing = db.prepare('SELECT * FROM deceased_persons WHERE id = ?').get(id) as any;
      if (!existing) {
        res.status(404).json({ error: 'Deceased record not found.' });
        return;
      }

      const now = new Date().toISOString();
      db.prepare(
        `UPDATE deceased_persons
         SET verification_status = ?, admin_notes = ?, reviewed_by = ?, reviewed_at = ?, updated_at = ?
         WHERE id = ?`
      ).run(status, admin_notes || null, req.user!.id, now, now, id);

      logAudit(
        req.user!,
        'DEATH_RECORD_REVIEWED',
        'deceased_person',
        id,
        `Updated death record ${existing.full_name} (${existing.death_certificate_ref}) to ${status}.${admin_notes ? ` Notes: ${admin_notes}` : ''}`
      );

      await dispatchNotification(db, {
        userId: existing.submitted_by,
        category: 'death_record',
        title: `Death Record ${status}`,
        message: `Your submitted death record for ${existing.full_name} (${existing.death_certificate_ref}) has been marked as "${status}".${admin_notes ? ` Note: ${admin_notes}` : ''}`,
        linkPath: '/family',
        relatedEntityId: id,
      });

      let matchingSummary = null;
      if (status === 'Approved') {
        matchingSummary = await runAssetMatchingForDeceased(id, req.user!);
      }

      const updated = db.prepare('SELECT * FROM deceased_persons WHERE id = ?').get(id);
      res.json({
        record: updated,
        matchingSummary,
        message:
          status === 'Approved'
            ? `Record approved. Asset discovery scanned ${matchingSummary?.scannedCount || 0} records and identified ${matchingSummary?.newMatchesCount || 0} potential match(es).`
            : `Record updated to ${status}.`,
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message || 'Verification update failed.' });
    }
  }
);

// ========================
// ASSET MATCHING & DISCOVERY
// ========================

app.post(
  '/api/matching/:id',
  requireAuth,
  requireRole('admin'),
  async (req: AuthenticatedRequest, res) => {
    try {
      const result = await runAssetMatchingForDeceased(req.params.id, req.user!);
      res.json(result);
    } catch (err: any) {
      res.status(400).json({ error: err.message || 'Matching operation failed.' });
    }
  }
);

app.get('/api/matches/:deceasedId', requireAuth, (req: AuthenticatedRequest, res) => {
  const { deceasedId } = req.params;
  const deceased = db
    .prepare('SELECT * FROM deceased_persons WHERE id = ?')
    .get(deceasedId) as any;

  if (!deceased) {
    res.status(404).json({ error: 'Deceased record not found.' });
    return;
  }

  if (req.user!.role === 'family' && deceased.submitted_by !== req.user!.id) {
    res.status(403).json({ error: 'Access denied to another user’s asset discovery results.' });
    return;
  }

  let sql = `
    SELECT m.*, fa.category, fa.holder_name, fa.institution_name, fa.masked_ref,
           fa.account_or_policy_ref, fa.sub_category, fa.nominee_ref, fa.record_status,
           fa.unclaimed_status, fa.fictional_amount, fa.city_or_branch,
           c.id as claim_id, c.claim_number, c.status as claim_status
    FROM asset_matches m
    JOIN financial_assets fa ON m.financial_asset_id = fa.id
    LEFT JOIN claims c ON c.asset_match_id = m.id
    WHERE m.deceased_person_id = ?
  `;
  const params: any[] = [deceasedId];

  if (req.user!.role === 'family') {
    sql += " AND m.review_status != 'Rejected Match'";
  } else if (req.user!.role === 'institution') {
    sql += ' AND m.institution_id = ?';
    params.push(req.user!.institution_id);
  }

  sql += ' ORDER BY m.matching_score DESC, fa.category ASC';
  const rows = db.prepare(sql).all(...params) as any[];

  const claimant = db
    .prepare('SELECT * FROM claimants WHERE deceased_person_id = ? ORDER BY created_at DESC LIMIT 1')
    .get(deceasedId) as any;

  const isClaimantVerified = claimant?.verification_status === 'Approved';

  const matches = rows.map((r) => ({
    ...r,
    // Keep full account ref hidden on family side until claimant verification is approved
    account_or_policy_ref:
      req.user!.role === 'family' && !isClaimantVerified ? r.masked_ref : r.account_or_policy_ref,
    score_breakdown: JSON.parse(r.score_breakdown || '{}'),
    matching_reasons: JSON.parse(r.matching_reasons || '[]'),
  }));

  res.json({
    deceased,
    claimant,
    isClaimantVerified,
    matches,
  });
});

app.get('/api/family/assets', requireAuth, requireRole('family', 'admin'), (req: AuthenticatedRequest, res) => {
  const sql = `
    SELECT m.*, dp.full_name as deceased_name, dp.death_certificate_ref, dp.date_of_death,
           fa.category, fa.holder_name, fa.institution_name, fa.masked_ref,
           fa.account_or_policy_ref, fa.sub_category, fa.nominee_ref, fa.record_status,
           fa.unclaimed_status, fa.fictional_amount, fa.city_or_branch,
           c.id as claim_id, c.claim_number, c.status as claim_status, c.institution_comments,
           cl.id as claimant_id, cl.full_name as claimant_name, cl.verification_status as claimant_verification_status
    FROM asset_matches m
    JOIN deceased_persons dp ON m.deceased_person_id = dp.id
    JOIN financial_assets fa ON m.financial_asset_id = fa.id
    LEFT JOIN claims c ON c.asset_match_id = m.id
    LEFT JOIN claimants cl ON cl.id = (
      SELECT id FROM claimants WHERE deceased_person_id = dp.id ORDER BY created_at DESC LIMIT 1
    )
    WHERE dp.submitted_by = ? AND m.review_status != 'Rejected Match'
    ORDER BY m.created_at DESC, m.matching_score DESC
  `;
  const rows = db.prepare(sql).all(req.user!.id) as any[];
  const formatted = rows.map((r) => ({
    ...r,
    account_or_policy_ref:
      r.claimant_verification_status === 'Approved' ? r.account_or_policy_ref : r.masked_ref,
    score_breakdown: JSON.parse(r.score_breakdown || '{}'),
    matching_reasons: JSON.parse(r.matching_reasons || '[]'),
  }));
  res.json({ assets: formatted });
});

// ========================
// CLAIMANT VERIFICATION
// ========================

app.get('/api/claimants', requireAuth, (req: AuthenticatedRequest, res) => {
  let sql = `
    SELECT cl.*, dp.full_name as deceased_name, dp.death_certificate_ref,
           (SELECT COUNT(*) FROM documents d WHERE d.claimant_id = cl.id) as document_count
    FROM claimants cl
    JOIN deceased_persons dp ON cl.deceased_person_id = dp.id
    WHERE 1=1
  `;
  const params: any[] = [];
  if (req.user!.role === 'family') {
    sql += ' AND cl.user_id = ?';
    params.push(req.user!.id);
  } else if (req.user!.role === 'institution') {
    sql += ` AND cl.deceased_person_id IN (SELECT deceased_person_id FROM asset_matches WHERE institution_id = ?)`;
    params.push(req.user!.institution_id);
  }
  sql += ' ORDER BY cl.created_at DESC';
  const rows = db.prepare(sql).all(...params) as any[];

  const withDocs = rows.map((row) => ({
    ...row,
    documents: db
      .prepare('SELECT id, document_type, file_name, mime_type, file_size, uploaded_at FROM documents WHERE claimant_id = ?')
      .all(row.id),
  }));
  res.json({ claimants: withDocs });
});

app.post(
  '/api/claimants',
  requireAuth,
  upload.array('documents', 5),
  async (req: AuthenticatedRequest, res) => {
    try {
      const { deceased_person_id, full_name, email, phone, relationship, claimant_type } =
        req.body || {};
      if (!deceased_person_id || !full_name || !email || !phone || !relationship || !claimant_type) {
        res.status(400).json({ error: 'All claimant verification fields are required.' });
        return;
      }

      const deceased = db
        .prepare('SELECT * FROM deceased_persons WHERE id = ?')
        .get(deceased_person_id) as any;
      if (!deceased) {
        res.status(404).json({ error: 'Deceased record not found.' });
        return;
      }
      if (req.user!.role === 'family' && deceased.submitted_by !== req.user!.id) {
        res.status(403).json({ error: 'Access denied.' });
        return;
      }

      const now = new Date().toISOString();
      const claimantId = crypto.randomUUID();
      db.prepare(
        `INSERT INTO claimants (
          id, user_id, deceased_person_id, full_name, email, phone, relationship,
          claimant_type, verification_status, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'Pending', ?, ?)`
      ).run(
        claimantId,
        req.user!.id,
        deceased_person_id,
        String(full_name).trim(),
        String(email).trim().toLowerCase(),
        String(phone).trim(),
        String(relationship).trim(),
        claimant_type === 'Legal Heir' ? 'Legal Heir' : 'Nominee',
        now,
        now
      );

      db.prepare(
        `INSERT INTO claimant_relationships (id, claimant_id, deceased_person_id, relationship_label, priority_order, created_at)
         VALUES (?, ?, ?, ?, 1, ?)`
      ).run(crypto.randomUUID(), claimantId, deceased_person_id, String(relationship).trim(), now);

      const files = (req.files as Express.Multer.File[]) || [];
      for (const f of files) {
        db.prepare(
          `INSERT INTO documents (
            id, owner_user_id, deceased_person_id, claimant_id, document_type,
            file_name, mime_type, file_size, storage_bucket, storage_path, uploaded_at
          ) VALUES (?, ?, ?, ?, 'Claimant Proof', ?, ?, ?, 'claim-documents', ?, ?)`
        ).run(
          crypto.randomUUID(),
          req.user!.id,
          deceased_person_id,
          claimantId,
          f.originalname,
          f.mimetype,
          f.size,
          f.filename,
          now
        );
      }

      logAudit(
        req.user!,
        'CLAIMANT_VERIFICATION_SUBMITTED',
        'claimant',
        claimantId,
        `Submitted ${claimant_type} verification request for ${full_name} (${relationship} of ${deceased.full_name}).`
      );

      const admins = db.prepare("SELECT id, email FROM profiles WHERE role = 'admin'").all() as Array<{
        id: string;
        email: string;
      }>;
      for (const adm of admins) {
        await dispatchNotification(db, {
          userId: adm.id,
          userEmail: adm.email,
          category: 'claimant_verification',
          title: 'Claimant Verification Pending Review',
          message: `${full_name} submitted ${claimant_type} verification documents for ${deceased.full_name}.`,
          linkPath: '/admin',
          relatedEntityId: claimantId,
        });
      }

      const created = db.prepare('SELECT * FROM claimants WHERE id = ?').get(claimantId);
      res.status(201).json({ claimant: created });
    } catch (err: any) {
      res.status(500).json({ error: err.message || 'Claimant submission failed.' });
    }
  }
);

app.patch(
  '/api/claimants/:id/verify',
  requireAuth,
  requireRole('admin'),
  async (req: AuthenticatedRequest, res) => {
    const { id } = req.params;
    const { status, admin_notes } = req.body || {};
    const allowed = ['Pending', 'Approved', 'Rejected', 'Additional Documents Required'];
    if (!allowed.includes(status)) {
      res.status(400).json({ error: `Status must be one of: ${allowed.join(', ')}` });
      return;
    }

    const claimant = db
      .prepare(
        `SELECT cl.*, dp.full_name as deceased_name
         FROM claimants cl
         JOIN deceased_persons dp ON cl.deceased_person_id = dp.id
         WHERE cl.id = ?`
      )
      .get(id) as any;

    if (!claimant) {
      res.status(404).json({ error: 'Claimant record not found.' });
      return;
    }

    const now = new Date().toISOString();
    db.prepare(
      `UPDATE claimants SET verification_status = ?, admin_notes = ?, reviewed_by = ?, reviewed_at = ?, updated_at = ? WHERE id = ?`
    ).run(status, admin_notes || null, req.user!.id, now, now, id);

    logAudit(
      req.user!,
      'CLAIMANT_VERIFIED',
      'claimant',
      id,
      `Claimant ${claimant.full_name} (${claimant.claimant_type}) for ${claimant.deceased_name} marked as ${status}.`
    );

    await dispatchNotification(db, {
      userId: claimant.user_id,
      category: 'claimant_verification',
      title: `Claimant Verification ${status}`,
      message:
        status === 'Approved'
          ? `Your ${claimant.claimant_type} verification for ${claimant.deceased_name} has been approved. You may now initiate claims on discovered assets.`
          : `Claimant verification status for ${claimant.full_name} updated to ${status}.${admin_notes ? ` Note: ${admin_notes}` : ''}`,
      linkPath: '/family/assets',
      relatedEntityId: id,
    });

    const updated = db.prepare('SELECT * FROM claimants WHERE id = ?').get(id);
    res.json({ claimant: updated });
  }
);

// ========================
// CLAIMS MANAGEMENT
// ========================

app.post('/api/claims', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const { asset_match_id, claimant_id, claimant_notes } = req.body || {};
    if (!asset_match_id) {
      res.status(400).json({ error: 'asset_match_id is required.' });
      return;
    }

    const match = db
      .prepare(
        `SELECT m.*, dp.submitted_by, dp.full_name as deceased_name, fa.institution_name, fa.sub_category
         FROM asset_matches m
         JOIN deceased_persons dp ON m.deceased_person_id = dp.id
         JOIN financial_assets fa ON m.financial_asset_id = fa.id
         WHERE m.id = ?`
      )
      .get(asset_match_id) as any;

    if (!match) {
      res.status(404).json({ error: 'Asset match not found.' });
      return;
    }
    if (req.user!.role === 'family' && match.submitted_by !== req.user!.id) {
      res.status(403).json({ error: 'Access denied.' });
      return;
    }
    if (match.review_status === 'Rejected Match') {
      res.status(400).json({ error: 'Cannot initiate a claim on a rejected match.' });
      return;
    }

    const existingClaim = db
      .prepare('SELECT id, claim_number FROM claims WHERE asset_match_id = ?')
      .get(asset_match_id) as any;
    if (existingClaim) {
      res.status(409).json({
        error: `A claim (${existingClaim.claim_number}) has already been submitted for this asset.`,
      });
      return;
    }

    const claimant = claimant_id
      ? (db.prepare('SELECT * FROM claimants WHERE id = ?').get(claimant_id) as any)
      : (db
          .prepare(
            "SELECT * FROM claimants WHERE deceased_person_id = ? AND verification_status = 'Approved' ORDER BY created_at DESC LIMIT 1"
          )
          .get(match.deceased_person_id) as any);

    if (!claimant || claimant.verification_status !== 'Approved') {
      res.status(400).json({
        error: 'Claimant verification must be Approved by an administrator before initiating a claim.',
      });
      return;
    }

    const now = new Date().toISOString();
    const claimId = crypto.randomUUID();
    const claimNumber = `VS-CLM-${Date.now().toString().slice(-6)}`;
    const history = [
      {
        status: 'Submitted',
        timestamp: now,
        actor: claimant.full_name,
        comment: claimant_notes || 'Claim initiated by verified claimant via Virasat Setu.',
      },
    ];

    db.prepare(
      `INSERT INTO claims (
        id, claim_number, asset_match_id, deceased_person_id, financial_asset_id,
        institution_id, claimant_id, user_id, status, claimant_notes,
        institution_comments, status_history, submitted_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'Submitted', ?, ?, ?, ?, ?)`
    ).run(
      claimId,
      claimNumber,
      asset_match_id,
      match.deceased_person_id,
      match.financial_asset_id,
      match.institution_id,
      claimant.id,
      req.user!.id,
      claimant_notes || 'Claim initiated by verified claimant.',
      'Awaiting nodal officer review at institution.',
      JSON.stringify(history),
      now,
      now
    );

    logAudit(
      req.user!,
      'CLAIM_SUBMITTED',
      'claim',
      claimId,
      `Submitted claim ${claimNumber} for ${match.sub_category} at ${match.institution_name} (Deceased: ${match.deceased_name}).`
    );

    await dispatchNotification(db, {
      userId: req.user!.id,
      category: 'claim_update',
      title: `Claim ${claimNumber} Submitted`,
      message: `Your claim for ${match.sub_category} at ${match.institution_name} has been forwarded to the institution nodal officer.`,
      linkPath: '/family/claims',
      relatedEntityId: claimId,
    });

    const reps = db
      .prepare("SELECT id, email FROM profiles WHERE role = 'institution' AND institution_id = ?")
      .all(match.institution_id) as Array<{ id: string; email: string }>;
    for (const rep of reps) {
      await dispatchNotification(db, {
        userId: rep.id,
        userEmail: rep.email,
        category: 'claim_update',
        title: `New Claim Received (${claimNumber})`,
        message: `Verified claimant ${claimant.full_name} initiated claim ${claimNumber} for ${match.sub_category}.`,
        linkPath: '/institution',
        relatedEntityId: claimId,
      });
    }

    const created = db.prepare('SELECT * FROM claims WHERE id = ?').get(claimId) as any;
    res.status(201).json({
      claim: { ...created, status_history: history },
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Claim submission failed.' });
  }
});

app.get('/api/claims', requireAuth, (req: AuthenticatedRequest, res) => {
  let sql = `
    SELECT c.*, dp.full_name as deceased_name, dp.death_certificate_ref,
           fa.institution_name, fa.category as asset_category, fa.sub_category,
           fa.masked_ref, fa.account_or_policy_ref, fa.fictional_amount,
           cl.full_name as claimant_name, cl.claimant_type, cl.relationship, cl.verification_status as claimant_status
    FROM claims c
    JOIN deceased_persons dp ON c.deceased_person_id = dp.id
    JOIN financial_assets fa ON c.financial_asset_id = fa.id
    JOIN claimants cl ON c.claimant_id = cl.id
    WHERE 1=1
  `;
  const params: any[] = [];
  if (req.user!.role === 'family') {
    sql += ' AND c.user_id = ?';
    params.push(req.user!.id);
  } else if (req.user!.role === 'institution') {
    sql += ' AND c.institution_id = ?';
    params.push(req.user!.institution_id);
  }
  sql += ' ORDER BY c.updated_at DESC';

  const rows = db.prepare(sql).all(...params) as any[];
  res.json({
    claims: rows.map((r) => ({
      ...r,
      status_history: JSON.parse(r.status_history || '[]'),
    })),
  });
});

app.get('/api/claims/:id', requireAuth, (req: AuthenticatedRequest, res) => {
  const claim = db
    .prepare(
      `SELECT c.*, dp.full_name as deceased_name, dp.death_certificate_ref,
              fa.institution_name, fa.category as asset_category, fa.sub_category,
              fa.masked_ref, fa.account_or_policy_ref, fa.fictional_amount,
              cl.full_name as claimant_name, cl.claimant_type, cl.relationship
       FROM claims c
       JOIN deceased_persons dp ON c.deceased_person_id = dp.id
       JOIN financial_assets fa ON c.financial_asset_id = fa.id
       JOIN claimants cl ON c.claimant_id = cl.id
       WHERE c.id = ?`
    )
    .get(req.params.id) as any;

  if (!claim) {
    res.status(404).json({ error: 'Claim not found.' });
    return;
  }
  if (req.user!.role === 'family' && claim.user_id !== req.user!.id) {
    res.status(403).json({ error: 'Access denied.' });
    return;
  }
  if (req.user!.role === 'institution' && claim.institution_id !== req.user!.institution_id) {
    res.status(403).json({ error: 'Access denied to unrelated institution claim.' });
    return;
  }

  res.json({
    claim: {
      ...claim,
      status_history: JSON.parse(claim.status_history || '[]'),
    },
  });
});

app.patch(
  '/api/claims/:id/status',
  requireAuth,
  requireRole('institution', 'admin'),
  async (req: AuthenticatedRequest, res) => {
    const { id } = req.params;
    const { status, institution_comments } = req.body || {};
    const validStatuses = [
      'Submitted',
      'Under Review',
      'Documents Required',
      'Approved',
      'Rejected',
      'Completed',
    ];
    if (!validStatuses.includes(status)) {
      res.status(400).json({ error: `Status must be one of: ${validStatuses.join(', ')}` });
      return;
    }

    const claim = db
      .prepare(
        `SELECT c.*, fa.institution_name, fa.sub_category, dp.full_name as deceased_name
         FROM claims c
         JOIN financial_assets fa ON c.financial_asset_id = fa.id
         JOIN deceased_persons dp ON c.deceased_person_id = dp.id
         WHERE c.id = ?`
      )
      .get(id) as any;

    if (!claim) {
      res.status(404).json({ error: 'Claim not found.' });
      return;
    }

    if (req.user!.role === 'institution' && claim.institution_id !== req.user!.institution_id) {
      res.status(403).json({ error: 'Access denied. You can only manage your own institution’s claims.' });
      return;
    }

    const now = new Date().toISOString();
    const history = JSON.parse(claim.status_history || '[]');
    history.push({
      status,
      timestamp: now,
      actor: `${req.user!.full_name} (${req.user!.role === 'admin' ? 'Administrator' : claim.institution_name})`,
      comment: institution_comments || `Claim moved to ${status}.`,
    });

    db.prepare(
      `UPDATE claims SET status = ?, institution_comments = ?, status_history = ?, updated_at = ? WHERE id = ?`
    ).run(
      status,
      institution_comments || claim.institution_comments,
      JSON.stringify(history),
      now,
      id
    );

    logAudit(
      req.user!,
      'CLAIM_STATUS_UPDATED',
      'claim',
      id,
      `Claim ${claim.claim_number} (${claim.institution_name}) updated to "${status}". ${institution_comments ? `Comment: ${institution_comments}` : ''}`
    );

    await dispatchNotification(db, {
      userId: claim.user_id,
      category: 'claim_update',
      title: `Claim ${claim.claim_number}: ${status}`,
      message: `${claim.institution_name} updated your claim for ${claim.deceased_name} (${claim.sub_category}) to "${status}".${institution_comments ? ` Instructions: ${institution_comments}` : ''}`,
      linkPath: '/family/claims',
      relatedEntityId: id,
    });

    const updated = db.prepare('SELECT * FROM claims WHERE id = ?').get(id) as any;
    res.json({
      claim: {
        ...updated,
        status_history: history,
      },
    });
  }
);

// ========================
// NOTIFICATIONS & DOCUMENTS
// ========================

app.get('/api/notifications', requireAuth, (req: AuthenticatedRequest, res) => {
  const rows = db
    .prepare('SELECT * FROM notifications WHERE user_id = ? ORDER BY created_at DESC LIMIT 50')
    .all(req.user!.id);
  res.json({ notifications: rows });
});

app.patch('/api/notifications/:id/read', requireAuth, (req: AuthenticatedRequest, res) => {
  db.prepare('UPDATE notifications SET is_read = 1 WHERE id = ? AND user_id = ?').run(
    req.params.id,
    req.user!.id
  );
  res.json({ success: true });
});

app.patch('/api/notifications/read-all', requireAuth, (req: AuthenticatedRequest, res) => {
  db.prepare('UPDATE notifications SET is_read = 1 WHERE user_id = ?').run(req.user!.id);
  res.json({ success: true });
});

app.get('/api/documents/:id/download', requireAuth, (req: AuthenticatedRequest, res) => {
  const doc = db.prepare('SELECT * FROM documents WHERE id = ?').get(req.params.id) as any;
  if (!doc) {
    res.status(404).json({ error: 'Document not found.' });
    return;
  }

  let authorized = false;
  if (req.user!.role === 'admin' || doc.owner_user_id === req.user!.id) {
    authorized = true;
  } else if (req.user!.role === 'institution' && doc.deceased_person_id) {
    const hasMatch = db
      .prepare('SELECT id FROM asset_matches WHERE deceased_person_id = ? AND institution_id = ?')
      .get(doc.deceased_person_id, req.user!.institution_id);
    if (hasMatch) authorized = true;
  }

  if (!authorized) {
    res.status(403).json({ error: 'Unauthorized document access denied.' });
    return;
  }

  const filePath = path.join(UPLOADS_DIR, path.basename(doc.storage_path));
  if (!fs.existsSync(filePath)) {
    res.status(404).json({ error: 'Document file missing on storage.' });
    return;
  }

  res.setHeader('Content-Type', doc.mime_type || 'application/octet-stream');
  res.setHeader('Content-Disposition', `inline; filename="${doc.file_name}"`);
  fs.createReadStream(filePath).pipe(res);
});

// ========================
// ADMIN ENDPOINTS
// ========================

app.get('/api/admin/overview', requireAuth, requireRole('admin'), (_req, res) => {
  const totalUsers = (db.prepare('SELECT COUNT(*) as c FROM profiles').get() as any).c;
  const totalDeceased = (db.prepare('SELECT COUNT(*) as c FROM deceased_persons').get() as any).c;
  const pendingVerifications = (
    db
      .prepare("SELECT COUNT(*) as c FROM deceased_persons WHERE verification_status = 'Pending Verification'")
      .get() as any
  ).c;
  const verifiedRecords = (
    db
      .prepare("SELECT COUNT(*) as c FROM deceased_persons WHERE verification_status = 'Approved'")
      .get() as any
  ).c;
  const totalMatches = (db.prepare('SELECT COUNT(*) as c FROM asset_matches').get() as any).c;
  const claimsInitiated = (db.prepare('SELECT COUNT(*) as c FROM claims').get() as any).c;
  const claimsSettled = (
    db.prepare("SELECT COUNT(*) as c FROM claims WHERE status = 'Completed'").get() as any
  ).c;

  const institutionStats = db
    .prepare(
      `SELECT i.id, i.name, i.code, i.category, i.city, i.nodal_officer_name, i.contact_email,
              (SELECT COUNT(*) FROM financial_assets fa WHERE fa.institution_id = i.id) as asset_count,
              (SELECT COUNT(*) FROM asset_matches m WHERE m.institution_id = i.id) as match_count,
              (SELECT COUNT(*) FROM claims c WHERE c.institution_id = i.id) as claim_count,
              (SELECT COUNT(*) FROM claims c WHERE c.institution_id = i.id AND c.status = 'Completed') as settled_count
       FROM institutions i
       ORDER BY match_count DESC, i.name ASC`
    )
    .all();

  const categoryBreakdown = db
    .prepare(
      `SELECT fa.category, COUNT(m.id) as match_count, COALESCE(SUM(fa.fictional_amount), 0) as total_amount
       FROM financial_assets fa
       LEFT JOIN asset_matches m ON m.financial_asset_id = fa.id
       GROUP BY fa.category`
    )
    .all();

  const assetInventoryCounts = db
    .prepare('SELECT category, COUNT(*) as count FROM financial_assets GROUP BY category')
    .all();

  res.json({
    stats: {
      totalUsers,
      totalDeceased,
      pendingVerifications,
      verifiedRecords,
      totalMatches,
      claimsInitiated,
      claimsSettled,
    },
    institutionStats,
    categoryBreakdown,
    assetInventoryCounts,
  });
});

app.get('/api/admin/records', requireAuth, requireRole('admin'), (_req, res) => {
  const deceased = db
    .prepare(
      `SELECT d.*, p.full_name as submitted_by_name, p.email as submitted_by_email,
              (SELECT COUNT(*) FROM asset_matches m WHERE m.deceased_person_id = d.id) as match_count,
              (SELECT COUNT(*) FROM documents doc WHERE doc.deceased_person_id = d.id) as document_count
       FROM deceased_persons d
       JOIN profiles p ON d.submitted_by = p.id
       ORDER BY CASE WHEN d.verification_status = 'Pending Verification' THEN 0 ELSE 1 END, d.created_at DESC`
    )
    .all();

  const matches = db
    .prepare(
      `SELECT m.*, dp.full_name as deceased_name, dp.death_certificate_ref,
              fa.institution_name, fa.category, fa.sub_category, fa.masked_ref, fa.fictional_amount
       FROM asset_matches m
       JOIN deceased_persons dp ON m.deceased_person_id = dp.id
       JOIN financial_assets fa ON m.financial_asset_id = fa.id
       ORDER BY m.created_at DESC`
    )
    .all()
    .map((m: any) => ({
      ...m,
      score_breakdown: JSON.parse(m.score_breakdown || '{}'),
      matching_reasons: JSON.parse(m.matching_reasons || '[]'),
    }));

  const claimants = db
    .prepare(
      `SELECT cl.*, dp.full_name as deceased_name, dp.death_certificate_ref
       FROM claimants cl
       JOIN deceased_persons dp ON cl.deceased_person_id = dp.id
       ORDER BY CASE WHEN cl.verification_status = 'Pending' THEN 0 ELSE 1 END, cl.created_at DESC`
    )
    .all()
    .map((cl: any) => ({
      ...cl,
      documents: db
        .prepare('SELECT id, document_type, file_name, mime_type, uploaded_at FROM documents WHERE claimant_id = ?')
        .all(cl.id),
    }));

  const representatives = db
    .prepare(
      `SELECT p.id, p.full_name, p.email, p.phone, i.name as institution_name, i.category
       FROM profiles p
       JOIN institutions i ON p.institution_id = i.id
       WHERE p.role = 'institution'`
    )
    .all();

  const logs = db
    .prepare('SELECT * FROM audit_logs ORDER BY created_at DESC LIMIT 60')
    .all();

  res.json({ deceased, matches, claimants, representatives, logs });
});

app.patch(
  '/api/admin/matches/:matchId',
  requireAuth,
  requireRole('admin'),
  (req: AuthenticatedRequest, res) => {
    const { matchId } = req.params;
    const { review_status, reviewed_notes } = req.body || {};
    const allowed = ['Pending Review', 'Approved Match', 'Flagged for Manual Review', 'Rejected Match'];
    if (!allowed.includes(review_status)) {
      res.status(400).json({ error: `review_status must be one of: ${allowed.join(', ')}` });
      return;
    }

    const existing = db.prepare('SELECT * FROM asset_matches WHERE id = ?').get(matchId);
    if (!existing) {
      res.status(404).json({ error: 'Asset match not found.' });
      return;
    }

    const now = new Date().toISOString();
    db.prepare(
      `UPDATE asset_matches SET review_status = ?, reviewed_notes = ?, reviewed_by = ?, updated_at = ? WHERE id = ?`
    ).run(review_status, reviewed_notes || null, req.user!.id, now, matchId);

    logAudit(
      req.user!,
      'ASSET_MATCH_REVIEWED',
      'asset_match',
      matchId,
      `Match review status updated to "${review_status}".`
    );

    res.json({ success: true });
  }
);

app.post(
  '/api/institutions',
  requireAuth,
  requireRole('admin'),
  (req: AuthenticatedRequest, res) => {
    const { name, code, category, contact_email, nodal_officer_name, city } = req.body || {};
    if (!name || !code || !category || !contact_email || !nodal_officer_name || !city) {
      res.status(400).json({ error: 'All institution fields are required.' });
      return;
    }
    const cleanCode = String(code).trim().toUpperCase();
    const dup = db.prepare('SELECT id FROM institutions WHERE code = ?').get(cleanCode);
    if (dup) {
      res.status(409).json({ error: `Institution code "${cleanCode}" already exists.` });
      return;
    }

    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    db.prepare(
      `INSERT INTO institutions (id, name, code, category, contact_email, nodal_officer_name, city, is_active, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?, ?)`
    ).run(
      id,
      String(name).trim(),
      cleanCode,
      category,
      String(contact_email).trim(),
      String(nodal_officer_name).trim(),
      String(city).trim(),
      now,
      now
    );

    logAudit(
      req.user!,
      'INSTITUTION_ADDED',
      'institution',
      id,
      `Added participating institution ${name} (${cleanCode}).`
    );

    const created = db.prepare('SELECT * FROM institutions WHERE id = ?').get(id);
    res.status(201).json({ institution: created });
  }
);

// ========================
// INSTITUTION DASHBOARD
// ========================

app.get(
  '/api/institution/dashboard',
  requireAuth,
  requireRole('institution'),
  (req: AuthenticatedRequest, res) => {
    const instId = req.user!.institution_id;
    if (!instId) {
      res.status(400).json({ error: 'No institution assigned to this representative.' });
      return;
    }

    const institution = db.prepare('SELECT * FROM institutions WHERE id = ?').get(instId);

    const matches = db
      .prepare(
        `SELECT m.*, dp.full_name as deceased_name, dp.date_of_birth, dp.date_of_death,
                dp.death_certificate_ref, dp.last_city, dp.last_state,
                fa.sub_category, fa.account_or_policy_ref, fa.masked_ref, fa.fictional_amount,
                fa.nominee_ref, fa.record_status,
                cl.id as claimant_id, cl.full_name as claimant_name, cl.claimant_type,
                cl.relationship, cl.verification_status as claimant_verification_status,
                cl.email as claimant_email, cl.phone as claimant_phone
         FROM asset_matches m
         JOIN deceased_persons dp ON m.deceased_person_id = dp.id
         JOIN financial_assets fa ON m.financial_asset_id = fa.id
         LEFT JOIN claimants cl ON cl.id = (
           SELECT id FROM claimants WHERE deceased_person_id = dp.id ORDER BY created_at DESC LIMIT 1
         )
         WHERE m.institution_id = ?
         ORDER BY m.created_at DESC`
      )
      .all(instId)
      .map((m: any) => ({
        ...m,
        score_breakdown: JSON.parse(m.score_breakdown || '{}'),
        matching_reasons: JSON.parse(m.matching_reasons || '[]'),
        documents: db
          .prepare(
            'SELECT id, document_type, file_name, mime_type, uploaded_at FROM documents WHERE deceased_person_id = ?'
          )
          .all(m.deceased_person_id),
      }));

    const claims = db
      .prepare(
        `SELECT c.*, dp.full_name as deceased_name, dp.death_certificate_ref,
                fa.sub_category, fa.account_or_policy_ref, fa.masked_ref, fa.fictional_amount,
                cl.full_name as claimant_name, cl.claimant_type, cl.relationship, cl.email as claimant_email, cl.phone as claimant_phone
         FROM claims c
         JOIN deceased_persons dp ON c.deceased_person_id = dp.id
         JOIN financial_assets fa ON c.financial_asset_id = fa.id
         JOIN claimants cl ON c.claimant_id = cl.id
         WHERE c.institution_id = ?
         ORDER BY c.updated_at DESC`
      )
      .all(instId)
      .map((c: any) => ({
        ...c,
        status_history: JSON.parse(c.status_history || '[]'),
        documents: db
          .prepare(
            'SELECT id, document_type, file_name, mime_type, uploaded_at FROM documents WHERE deceased_person_id = ? OR claimant_id = ?'
          )
          .all(c.deceased_person_id, c.claimant_id),
      }));

    const totalAssetsCount = (
      db.prepare('SELECT COUNT(*) as c FROM financial_assets WHERE institution_id = ?').get(instId) as any
    ).c;

    res.json({
      institution,
      stats: {
        totalHostedAssets: totalAssetsCount,
        incomingMatches: matches.length,
        activeClaims: claims.filter((c: any) => !['Completed', 'Rejected'].includes(c.status)).length,
        processedClaims: claims.filter((c: any) => ['Completed', 'Approved', 'Rejected'].includes(c.status)).length,
      },
      matches,
      claims,
    });
  }
);

// ========================
// VITE / STATIC SERVING
// ========================

async function startServer() {
  await initDatabase();

  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Virasat Setu full-stack server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
