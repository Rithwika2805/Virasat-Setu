import crypto from 'node:crypto';
import type { LocalDb } from './db.ts';

export interface NotificationPayload {
  userId: string;
  userEmail?: string;
  category:
    | 'death_record'
    | 'asset_discovery'
    | 'claimant_verification'
    | 'claim_update'
    | 'system';
  title: string;
  message: string;
  linkPath: string;
  relatedEntityId?: string;
  emailSubject?: string;
  emailBody?: string;
  smsSimulatedText?: string;
}

export async function dispatchNotification(
  db: LocalDb,
  payload: NotificationPayload
): Promise<string> {
  const id = crypto.randomUUID();
  const now = new Date().toISOString();

  let recipientEmail = payload.userEmail;
  if (!recipientEmail) {
    const row = db.prepare('SELECT email FROM profiles WHERE id = ?').get(payload.userId) as
      | { email: string }
      | undefined;
    recipientEmail = row?.email;
  }

  const emailSubject = payload.emailSubject || `Virasat Setu Update: ${payload.title}`;
  // Never include sensitive account numbers or balances in emails
  const emailBody =
    payload.emailBody ||
    `${payload.message}\n\nRecipient: ${recipientEmail || 'Registered Family Member'}\nPlease log in to Virasat Setu to review secure details and complete any required steps.`;
  const smsText =
    payload.smsSimulatedText ||
    `[Virasat Setu] ${payload.title}. Check your Virasat Setu portal for details.`;

  db.prepare(
    `INSERT INTO notifications (
      id, user_id, category, title, message, link_path, related_entity_id,
      is_read, email_sent, email_subject, email_body, sms_simulated_text, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, 0, 1, ?, ?, ?, ?)`
  ).run(
    id,
    payload.userId,
    payload.category,
    payload.title,
    payload.message,
    payload.linkPath,
    payload.relatedEntityId || null,
    emailSubject,
    emailBody,
    smsText,
    now
  );

  return id;
}
