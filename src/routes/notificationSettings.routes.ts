import express from 'express';
import { getSettings, saveSettings, resetSettings } from '../controllers/notificationSettings.controller';

const router = express.Router();

// Notification settings routes
router.get('/', getSettings);
router.post('/', saveSettings);
router.post('/reset', resetSettings);

export default router;

