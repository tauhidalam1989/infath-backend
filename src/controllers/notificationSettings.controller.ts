import { Request, Response } from 'express';
import { getNotificationSettings, saveNotificationSettings, resetNotificationSettingsToDefaults } from '../services/notificationSettings.service';
import { logEvent } from '../utils/logger.util';

/**
 * Get notification settings
 * GET /api/notification-settings
 */
export async function getSettings(req: Request, res: Response): Promise<void> {
  try {
    // TODO: Get userId from authenticated user session/token
    // For now, using default settings (userId = undefined)
    const userId = req.query.userId ? parseInt(req.query.userId as string) : undefined;
    
    const settings = await getNotificationSettings(userId);
    
    res.json({
      success: true,
      settings
    });
  } catch (error: any) {
    console.error('Error in getSettings controller:', error);
    res.status(500).json({ 
      error: 'Internal server error while fetching notification settings' 
    });
  }
}

/**
 * Save notification settings
 * POST /api/notification-settings
 */
export async function saveSettings(req: Request, res: Response): Promise<void> {
  try {
    // TODO: Get userId from authenticated user session/token
    // For now, using default settings (userId = undefined)
    const userId = req.body.userId ? parseInt(req.body.userId) : undefined;
    
    const settingsData = {
      systemUpdatesEmail: req.body.system_updates_email ?? req.body.systemUpdatesEmail ?? true,
      systemUpdatesSms: req.body.system_updates_sms ?? req.body.systemUpdatesSms ?? false,
      systemUpdatesPush: req.body.system_updates_push ?? req.body.systemUpdatesPush ?? true,
      systemUpdatesWhatsapp: req.body.system_updates_whatsapp ?? req.body.systemUpdatesWhatsapp ?? false,
      securityAlertsEmail: req.body.security_alerts_email ?? req.body.securityAlertsEmail ?? true,
      securityAlertsSms: req.body.security_alerts_sms ?? req.body.securityAlertsSms ?? true,
      securityAlertsPush: req.body.security_alerts_push ?? req.body.securityAlertsPush ?? true,
      securityAlertsWhatsapp: req.body.security_alerts_whatsapp ?? req.body.securityAlertsWhatsapp ?? true,
      newMessagesEmail: req.body.new_messages_email ?? req.body.newMessagesEmail ?? false,
      newMessagesSms: req.body.new_messages_sms ?? req.body.newMessagesSms ?? false,
      newMessagesPush: req.body.new_messages_push ?? req.body.newMessagesPush ?? true,
      newMessagesWhatsapp: req.body.new_messages_whatsapp ?? req.body.newMessagesWhatsapp ?? false,
      remindersEmail: req.body.reminders_email ?? req.body.remindersEmail ?? true,
      remindersSms: req.body.reminders_sms ?? req.body.remindersSms ?? false,
      remindersPush: req.body.reminders_push ?? req.body.remindersPush ?? true,
      remindersWhatsapp: req.body.reminders_whatsapp ?? req.body.remindersWhatsapp ?? false,
      marketingEmail: req.body.marketing_email ?? req.body.marketingEmail ?? false,
      marketingSms: req.body.marketing_sms ?? req.body.marketingSms ?? false,
      marketingPush: req.body.marketing_push ?? req.body.marketingPush ?? false,
      marketingWhatsapp: req.body.marketing_whatsapp ?? req.body.marketingWhatsapp ?? false
    };

    const savedSettings = await saveNotificationSettings(settingsData, userId);
    
    // Log notification settings update
    await logEvent(
      'info',
      'notification_settings',
      'update',
      'Notification settings updated',
      { userId },
      userId || (req as any).user?.id,
      req.ip || req.connection?.remoteAddress,
      req.get('user-agent')
    );
    
    res.json({
      success: true,
      message: 'Notification settings saved successfully',
      settings: savedSettings
    });
  } catch (error: any) {
    console.error('Error in saveSettings controller:', error);
    res.status(500).json({ 
      error: 'Internal server error while saving notification settings' 
    });
  }
}

/**
 * Reset notification settings to defaults
 * POST /api/notification-settings/reset
 */
export async function resetSettings(req: Request, res: Response): Promise<void> {
  try {
    // TODO: Get userId from authenticated user session/token
    const userId = req.body.userId ? parseInt(req.body.userId) : undefined;
    
    const resetSettings = await resetNotificationSettingsToDefaults(userId);
    
    // Log notification settings reset
    await logEvent(
      'info',
      'notification_settings',
      'reset',
      'Notification settings reset to defaults',
      { userId },
      userId || (req as any).user?.id,
      req.ip || req.connection?.remoteAddress,
      req.get('user-agent')
    );
    
    res.json({
      success: true,
      message: 'Notification settings reset to defaults successfully',
      settings: resetSettings
    });
  } catch (error: any) {
    console.error('Error in resetSettings controller:', error);
    res.status(500).json({ 
      error: 'Internal server error while resetting notification settings' 
    });
  }
}

