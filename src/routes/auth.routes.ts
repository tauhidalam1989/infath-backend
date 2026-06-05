import express from 'express';
import {
  login,
  loginNo2FA,
  verify2FA,
  setup2FA,
  verifySetup2FA,
  disable2FAController,
  status2FA,
  otp2FALoginStart,
  otp2FALoginVerify
} from '../controllers/auth.controller';

const router = express.Router();

// Auth routes
router.post('/login', login);
router.post('/login-no2fa', loginNo2FA);
router.post('/2fa/verify', verify2FA);
router.post('/2fa/setup', setup2FA);
router.post('/2fa/verify-setup', verifySetup2FA);
router.post('/2fa/disable', disable2FAController);
router.post('/2fa/status', status2FA);
router.post('/2fa/otp-login/start', otp2FALoginStart);
router.post('/2fa/otp-login/verify', otp2FALoginVerify);

export default router;

