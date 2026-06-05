import speakeasy from 'speakeasy';
import QRCode from 'qrcode';
import jwt from 'jsonwebtoken';
import { pool } from '../config/database';

const JWT_SECRET = process.env.JWT_SECRET || process.env.DB_PASSWORD || 'screening-2fa-secret-change-in-prod';
const APP_NAME = process.env.APP_NAME || 'Screening System';

/**
 * Generate a TOTP secret for a user
 */
export function generateSecret(): string {
  return speakeasy.generateSecret({ length: 20 }).base32;
}

/**
 * Generate QR code data URL for otpauth
 */
export async function generateQRDataUrl(secret: string, accountName: string): Promise<string> {
  const otpauth = speakeasy.otpauthURL({
    secret,
    label: `${APP_NAME}:${accountName}`,
    issuer: APP_NAME,
    encoding: 'base32'
  });
  return QRCode.toDataURL(otpauth, { width: 220, margin: 2 });
}

/**
 * Verify a TOTP token
 */
export function verifyToken(secret: string, token: string): boolean {
  return speakeasy.totp.verify({
    secret,
    encoding: 'base32',
    token,
    window: 1 // Allow 1 step (30s) before/after
  });
}

/**
 * Sign a temporary token for pending 2FA (login step 1 passed)
 */
export function signPending2FAToken(userId: number): string {
  return jwt.sign(
    { userId, purpose: 'pending-2fa' },
    JWT_SECRET,
    { expiresIn: '5m' }
  );
}

/**
 * Verify and decode a pending 2FA token
 */
export function verifyPending2FAToken(token: string): { userId: number } | null {
  try {
    const decoded = jwt.verify(token, JWT_SECRET) as { userId: number; purpose?: string };
    if (decoded.purpose !== 'pending-2fa') return null;
    return { userId: decoded.userId };
  } catch {
    return null;
  }
}

/**
 * Get 2FA status for a user
 */
export async function get2FAStatus(userId: number): Promise<{ enabled: boolean }> {
  const result = await pool.query(
    'SELECT two_factor_enabled as "twoFactorEnabled" FROM users WHERE id = $1',
    [userId]
  );
  if (result.rows.length === 0) return { enabled: false };
  return { enabled: !!result.rows[0].twoFactorEnabled };
}

/**
 * Start 2FA setup: generate secret, save (not enabled yet), return QR
 */
export async function start2FASetup(userId: number): Promise<{ qrDataUrl: string; secret: string } | null> {
  const userResult = await pool.query(
    'SELECT username, email FROM users WHERE id = $1 AND is_active = true',
    [userId]
  );
  if (userResult.rows.length === 0) return null;

  const accountName = userResult.rows[0].email || userResult.rows[0].username;
  const secret = generateSecret();

  await pool.query(
    'UPDATE users SET two_factor_secret = $1, two_factor_enabled = false, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
    [secret, userId]
  );

  const qrDataUrl = await generateQRDataUrl(secret, accountName);
  return { qrDataUrl, secret };
}

/**
 * Complete 2FA setup: verify code and enable 2FA
 */
export async function complete2FASetup(userId: number, code: string): Promise<boolean> {
  const result = await pool.query(
    'SELECT two_factor_secret as "twoFactorSecret" FROM users WHERE id = $1',
    [userId]
  );
  if (result.rows.length === 0 || !result.rows[0].twoFactorSecret) return false;

  const secret = result.rows[0].twoFactorSecret;
  if (!verifyToken(secret, code)) return false;

  await pool.query(
    'UPDATE users SET two_factor_enabled = true, updated_at = CURRENT_TIMESTAMP WHERE id = $1',
    [userId]
  );
  return true;
}

/**
 * Verify 2FA code during login (checks user has 2FA enabled and code is valid)
 */
export async function verify2FALogin(userId: number, code: string): Promise<boolean> {
  const result = await pool.query(
    'SELECT two_factor_secret as "twoFactorSecret", two_factor_enabled as "twoFactorEnabled" FROM users WHERE id = $1',
    [userId]
  );
  if (result.rows.length === 0 || !result.rows[0].twoFactorEnabled || !result.rows[0].twoFactorSecret) {
    return false;
  }
  return verifyToken(result.rows[0].twoFactorSecret, String(code).trim());
}

/**
 * Disable 2FA for a user (requires current valid code)
 */
export async function disable2FA(userId: number, code: string): Promise<boolean> {
  const result = await pool.query(
    'SELECT two_factor_secret as "twoFactorSecret", two_factor_enabled as "twoFactorEnabled" FROM users WHERE id = $1',
    [userId]
  );
  if (result.rows.length === 0 || !result.rows[0].twoFactorEnabled) return false;

  const secret = result.rows[0].twoFactorSecret;
  if (!secret || !verifyToken(secret, code)) return false;

  await pool.query(
    'UPDATE users SET two_factor_secret = NULL, two_factor_enabled = false, updated_at = CURRENT_TIMESTAMP WHERE id = $1',
    [userId]
  );
  return true;
}

/**
 * OTP-only 2FA login start (no password).
 * If 2FA is enabled => request OTP verification.
 * If 2FA is disabled => start a setup (generate secret + QR) and request OTP to enable.
 */
export async function otpLoginStart(usernameOrEmail: string): Promise<
  | { requiresSetup: true; qrDataUrl: string }
  | { requiresSetup: false }
  | null
> {
  const userResult = await pool.query(
    `SELECT id, username, email, two_factor_enabled as "twoFactorEnabled"
     FROM users
     WHERE (username = $1 OR email = $1) AND is_active = true`,
    [usernameOrEmail]
  );

  if (userResult.rows.length === 0) return null;

  const user = userResult.rows[0];
  if (user.twoFactorEnabled) {
    return { requiresSetup: false };
  }

  const setup = await start2FASetup(user.id);
  if (!setup) return null;

  return { requiresSetup: true, qrDataUrl: setup.qrDataUrl };
}

/**
 * OTP-only 2FA login verify (no password).
 * If enabled => validate OTP and login.
 * If not enabled => validate OTP against pending secret and enable then login.
 */
export async function otpLoginVerify(
  usernameOrEmail: string,
  code: string
): Promise<{ ok: boolean; userId?: number }> {
  const userResult = await pool.query(
    `SELECT id, two_factor_enabled as "twoFactorEnabled", two_factor_secret as "twoFactorSecret"
     FROM users
     WHERE (username = $1 OR email = $1) AND is_active = true`,
    [usernameOrEmail]
  );

  if (userResult.rows.length === 0) return { ok: false };

  const user = userResult.rows[0];
  const secret = user.twoFactorSecret;
  if (!secret) return { ok: false };

  const isValid = verifyToken(secret, String(code).trim());
  if (!isValid) return { ok: false };

  // If not enabled yet, enable it after a valid code.
  if (!user.twoFactorEnabled) {
    await pool.query(
      'UPDATE users SET two_factor_enabled = true, updated_at = CURRENT_TIMESTAMP WHERE id = $1',
      [user.id]
    );
  }

  return { ok: true, userId: user.id };
}
