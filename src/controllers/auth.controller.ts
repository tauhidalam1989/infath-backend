import { Request, Response } from 'express';
import { loginUser, getUserById } from '../services/users.service';
import {
  signPending2FAToken,
  verifyPending2FAToken,
  verify2FALogin,
  start2FASetup,
  complete2FASetup,
  disable2FA,
  get2FAStatus,
  otpLoginStart,
  otpLoginVerify
} from '../services/two-factor.service';
import { logLoginSuccess, logLoginFailure } from '../utils/logger.util';

/**
 * Login user
 * POST /api/auth/login
 * If user has 2FA enabled, returns { requiresTwoFactor: true, tempToken } instead of user.
 */
export async function login(req: Request, res: Response): Promise<void> {
  try {
    const { username, password } = req.body;
    
    console.log('Login request received:', {
      username: username,
      passwordLength: password ? password.length : 0,
      hasUsername: !!username,
      hasPassword: !!password
    });

    // Validate input
    if (!username || !password) {
      console.log('Login validation failed: Missing username or password');
      res.status(400).json({ 
        error: 'Username/email and password are required' 
      });
      return;
    }

    // Attempt login
    const user = await loginUser(username, password);

    if (!user) {
      console.log('Login failed: Invalid credentials for username:', username);
      await logLoginFailure(username, 'Invalid credentials', req);
      res.status(401).json({ 
        error: 'Invalid username/email or password' 
      });
      return;
    }

    // If 2FA is enabled, return temp token instead of user
    if (user.twoFactorEnabled) {
      const tempToken = signPending2FAToken(user.id);
      res.json({
        success: true,
        requiresTwoFactor: true,
        tempToken
      });
      return;
    }
    
    console.log('Login successful for user:', user.username);
    await logLoginSuccess(user.username, user.id, req);

    // Return user data (without password hash)
    res.json({
      success: true,
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        phone1: user.phone1,
        phone2: user.phone2,
        subsiteId: user.subsiteId,
        sectionId: user.sectionId,
        specialDivisionId: user.specialDivisionId,
        subsiteName: user.subsiteName,
        sectionName: user.sectionName,
        specialDivisionName: user.specialDivisionName,
        userType: user.userType,
        validity: user.validity,
        notes: user.notes,
        isActive: user.isActive,
        twoFactorEnabled: user.twoFactorEnabled,
        permissions: user.permissions
      }
    });
  } catch (error: any) {
    console.error('Error in login controller:', error);
    res.status(500).json({ 
      error: 'Internal server error during login' 
    });
  }
}

/**
 * Login user WITHOUT 2FA step (password login only).
 * POST /api/auth/login-no2fa
 *
 * This is intentionally used for "normal login" UX where OTP is required only
 * for the "Sign in with Google" flow.
 */
export async function loginNo2FA(req: Request, res: Response): Promise<void> {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      res.status(400).json({ error: 'Username/email and password are required' });
      return;
    }

    const user = await loginUser(username, password);

    if (!user) {
      await logLoginFailure(username, 'Invalid credentials', req);
      res.status(401).json({ error: 'Invalid username/email or password' });
      return;
    }

    await logLoginSuccess(user.username, user.id, req);

    res.json({
      success: true,
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        phone1: user.phone1,
        phone2: user.phone2,
        subsiteId: user.subsiteId,
        sectionId: user.sectionId,
        specialDivisionId: user.specialDivisionId,
        subsiteName: user.subsiteName,
        sectionName: user.sectionName,
        specialDivisionName: user.specialDivisionName,
        userType: user.userType,
        validity: user.validity,
        notes: user.notes,
        isActive: user.isActive,
        twoFactorEnabled: user.twoFactorEnabled,
        permissions: user.permissions
      }
    });
  } catch (error: any) {
    console.error('Error in loginNo2FA controller:', error);
    res.status(500).json({ error: 'Internal server error during login' });
  }
}

/**
 * Verify 2FA code and complete login
 * POST /api/auth/2fa/verify
 */
export async function verify2FA(req: Request, res: Response): Promise<void> {
  try {
    const { tempToken, code } = req.body;
    if (!tempToken || !code) {
      res.status(400).json({ error: 'Temp token and code are required' });
      return;
    }

    const payload = verifyPending2FAToken(tempToken);
    if (!payload) {
      res.status(401).json({ error: 'Invalid or expired token. Please login again.' });
      return;
    }

    const user = await getUserById(payload.userId);
    if (!user) {
      res.status(401).json({ error: 'User not found' });
      return;
    }

    const isValid = await verify2FALogin(payload.userId, code);
    if (!isValid) {
      await logLoginFailure(user.username, 'Invalid 2FA code', req);
      res.status(401).json({ error: 'Invalid verification code' });
      return;
    }

    console.log('2FA verification successful for user:', user.username);
    await logLoginSuccess(user.username, user.id, req);

    res.json({
      success: true,
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        phone1: user.phone1,
        phone2: user.phone2,
        subsiteId: user.subsiteId,
        sectionId: user.sectionId,
        specialDivisionId: user.specialDivisionId,
        subsiteName: user.subsiteName,
        sectionName: user.sectionName,
        specialDivisionName: user.specialDivisionName,
        userType: user.userType,
        validity: user.validity,
        notes: user.notes,
        isActive: user.isActive,
        twoFactorEnabled: true,
        permissions: user.permissions
      }
    });
  } catch (error: any) {
    console.error('Error in 2FA verify:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
}

/**
 * Start 2FA setup (requires username + password)
 * POST /api/auth/2fa/setup
 */
export async function setup2FA(req: Request, res: Response): Promise<void> {
  try {
    const { username, password } = req.body;
    if (!username || !password) {
      res.status(400).json({ error: 'Username and password are required' });
      return;
    }

    const user = await loginUser(username, password);
    if (!user) {
      res.status(401).json({ error: 'Invalid username/email or password' });
      return;
    }

    if (user.twoFactorEnabled) {
      res.status(400).json({ error: '2FA is already enabled for this account' });
      return;
    }

    const result = await start2FASetup(user.id);
    if (!result) {
      res.status(500).json({ error: 'Failed to start 2FA setup' });
      return;
    }

    res.json({ success: true, qrDataUrl: result.qrDataUrl });
  } catch (error: any) {
    console.error('Error in 2FA setup:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
}

/**
 * Complete 2FA setup (verify code after scanning QR)
 * POST /api/auth/2fa/verify-setup
 */
export async function verifySetup2FA(req: Request, res: Response): Promise<void> {
  try {
    const { username, password, code } = req.body;
    if (!username || !password || !code) {
      res.status(400).json({ error: 'Username, password and code are required' });
      return;
    }

    const user = await loginUser(username, password);
    if (!user) {
      res.status(401).json({ error: 'Invalid username/email or password' });
      return;
    }

    const success = await complete2FASetup(user.id, code);
    if (!success) {
      res.status(400).json({ error: 'Invalid verification code. Please try again.' });
      return;
    }

    res.json({ success: true, message: '2FA has been enabled successfully' });
  } catch (error: any) {
    console.error('Error in 2FA verify-setup:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
}

/**
 * Disable 2FA (requires username + password + current code)
 * POST /api/auth/2fa/disable
 */
export async function disable2FAController(req: Request, res: Response): Promise<void> {
  try {
    const { username, password, code } = req.body;
    if (!username || !password || !code) {
      res.status(400).json({ error: 'Username, password and code are required' });
      return;
    }

    const user = await loginUser(username, password);
    if (!user) {
      res.status(401).json({ error: 'Invalid username/email or password' });
      return;
    }

    const success = await disable2FA(user.id, code);
    if (!success) {
      res.status(400).json({ error: 'Invalid verification code. Please try again.' });
      return;
    }

    res.json({ success: true, message: '2FA has been disabled successfully' });
  } catch (error: any) {
    console.error('Error in 2FA disable:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
}

/**
 * Get 2FA status (requires username + password)
 * POST /api/auth/2fa/status
 */
export async function status2FA(req: Request, res: Response): Promise<void> {
  try {
    const { username, password } = req.body;
    if (!username || !password) {
      res.status(400).json({ error: 'Username and password are required' });
      return;
    }

    const user = await loginUser(username, password);
    if (!user) {
      res.status(401).json({ error: 'Invalid username/email or password' });
      return;
    }

    const status = await get2FAStatus(user.id);
    res.json({ success: true, enabled: status.enabled });
  } catch (error: any) {
    console.error('Error in 2FA status:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
}

/**
 * OTP-only 2FA login start (no password).
 * POST /api/auth/2fa/otp-login/start
 * Body: { usernameOrEmail }
 */
export async function otp2FALoginStart(req: Request, res: Response): Promise<void> {
  try {
    const { usernameOrEmail } = req.body;
    if (!usernameOrEmail) {
      res.status(400).json({ error: 'Username/email is required' });
      return;
    }

    const result = await otpLoginStart(usernameOrEmail);
    if (!result) {
      res.status(401).json({ error: 'User not found or inactive' });
      return;
    }

    if ('requiresSetup' in result && result.requiresSetup) {
      res.json({ success: true, requiresSetup: true, qrDataUrl: result.qrDataUrl });
      return;
    }

    res.json({ success: true, requiresSetup: false });
  } catch (error: any) {
    console.error('Error in otp2FALoginStart:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
}

/**
 * OTP-only 2FA login verify (no password).
 * POST /api/auth/2fa/otp-login/verify
 * Body: { usernameOrEmail, code }
 */
export async function otp2FALoginVerify(req: Request, res: Response): Promise<void> {
  try {
    const { usernameOrEmail, code } = req.body;
    if (!usernameOrEmail || !code) {
      res.status(400).json({ error: 'Username/email and code are required' });
      return;
    }

    const result = await otpLoginVerify(usernameOrEmail, code);
    if (!result.ok || !result.userId) {
      res.status(401).json({ error: 'Invalid verification code' });
      return;
    }

    const user = await getUserById(result.userId);
    if (!user) {
      res.status(401).json({ error: 'User not found' });
      return;
    }

    res.json({
      success: true,
      user: {
        ...user,
        twoFactorEnabled: true
      }
    });
  } catch (error: any) {
    console.error('Error in otp2FALoginVerify:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
}