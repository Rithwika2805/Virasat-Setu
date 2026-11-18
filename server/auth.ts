import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import type { Request, Response, NextFunction } from 'express';

function getLocalSigningKey(): string {
  const keyFile = path.resolve(process.cwd(), 'data', '.session.key');
  fs.mkdirSync(path.dirname(keyFile), { recursive: true });
  if (fs.existsSync(keyFile)) {
    const existing = fs.readFileSync(keyFile, 'utf8').trim();
    if (existing) return existing;
  }
  const generated = crypto.randomBytes(32).toString('hex');
  fs.writeFileSync(keyFile, generated, 'utf8');
  return generated;
}

const AUTH_SECRET = getLocalSigningKey();

export interface AuthUser {
  id: string;
  email: string;
  full_name: string;
  role: 'family' | 'admin' | 'institution';
  institution_id: string | null;
}

export interface AuthenticatedRequest extends Request {
  user?: AuthUser;
}

export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString('hex');
  const derived = crypto.scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${derived}`;
}

export function verifyPassword(password: string, storedHash: string): boolean {
  const [salt, key] = storedHash.split(':');
  if (!salt || !key) return false;
  const derived = crypto.scryptSync(password, salt, 64);
  const keyBuf = Buffer.from(key, 'hex');
  if (derived.length !== keyBuf.length) return false;
  return crypto.timingSafeEqual(derived, keyBuf);
}

export function signToken(payload: AuthUser, expiresInSeconds = 60 * 60 * 24 * 7): string {
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
  const exp = Math.floor(Date.now() / 1000) + expiresInSeconds;
  const body = Buffer.from(JSON.stringify({ ...payload, exp })).toString('base64url');
  const signature = crypto
    .createHmac('sha256', AUTH_SECRET)
    .update(`${header}.${body}`)
    .digest('base64url');
  return `${header}.${body}.${signature}`;
}

export function verifyToken(token: string): AuthUser | null {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    const [header, body, sig] = parts;
    const expected = crypto
      .createHmac('sha256', AUTH_SECRET)
      .update(`${header}.${body}`)
      .digest('base64url');
    const sigBuf = Buffer.from(sig);
    const expBuf = Buffer.from(expected);
    if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) {
      return null;
    }
    const decoded = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
    if (decoded.exp && decoded.exp < Math.floor(Date.now() / 1000)) {
      return null;
    }
    return {
      id: decoded.id,
      email: decoded.email,
      full_name: decoded.full_name,
      role: decoded.role,
      institution_id: decoded.institution_id ?? null,
    };
  } catch {
    return null;
  }
}

export function requireAuth(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  const tokenFromQuery = typeof req.query.token === 'string' ? req.query.token : null;
  const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : tokenFromQuery;

  if (!token) {
    res.status(401).json({ error: 'Authentication required' });
    return;
  }

  const user = verifyToken(token);
  if (!user) {
    res.status(401).json({ error: 'Invalid or expired authentication token' });
    return;
  }

  req.user = user;
  next();
}

export function requireRole(...roles: Array<'family' | 'admin' | 'institution'>) {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    if (!req.user) {
      res.status(401).json({ error: 'Authentication required' });
      return;
    }
    if (!roles.includes(req.user.role)) {
      res.status(403).json({ error: `Access denied. Required role: ${roles.join(' or ')}` });
      return;
    }
    next();
  };
}
