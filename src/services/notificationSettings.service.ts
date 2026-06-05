import { pool } from '../config/database';
import { NotificationSettings } from '../types/notification.types';

/**
 * Get notification settings for a user (or default if no user_id)
 */
export async function getNotificationSettings(userId?: number): Promise<NotificationSettings> {
  try {
    let result;
    
    if (userId) {
      // Get user-specific settings
      result = await pool.query(`
        SELECT 
          id,
          user_id as "userId",
          system_updates_email as "systemUpdatesEmail",
          system_updates_sms as "systemUpdatesSms",
          system_updates_push as "systemUpdatesPush",
          system_updates_whatsapp as "systemUpdatesWhatsapp",
          security_alerts_email as "securityAlertsEmail",
          security_alerts_sms as "securityAlertsSms",
          security_alerts_push as "securityAlertsPush",
          security_alerts_whatsapp as "securityAlertsWhatsapp",
          new_messages_email as "newMessagesEmail",
          new_messages_sms as "newMessagesSms",
          new_messages_push as "newMessagesPush",
          new_messages_whatsapp as "newMessagesWhatsapp",
          reminders_email as "remindersEmail",
          reminders_sms as "remindersSms",
          reminders_push as "remindersPush",
          reminders_whatsapp as "remindersWhatsapp",
          marketing_email as "marketingEmail",
          marketing_sms as "marketingSms",
          marketing_push as "marketingPush",
          marketing_whatsapp as "marketingWhatsapp",
          created_at as "createdAt",
          updated_at as "updatedAt"
        FROM notification_settings
        WHERE user_id = $1
      `, [userId]);
    } else {
      // Get default/system settings (user_id is NULL)
      result = await pool.query(`
        SELECT 
          id,
          user_id as "userId",
          system_updates_email as "systemUpdatesEmail",
          system_updates_sms as "systemUpdatesSms",
          system_updates_push as "systemUpdatesPush",
          system_updates_whatsapp as "systemUpdatesWhatsapp",
          security_alerts_email as "securityAlertsEmail",
          security_alerts_sms as "securityAlertsSms",
          security_alerts_push as "securityAlertsPush",
          security_alerts_whatsapp as "securityAlertsWhatsapp",
          new_messages_email as "newMessagesEmail",
          new_messages_sms as "newMessagesSms",
          new_messages_push as "newMessagesPush",
          new_messages_whatsapp as "newMessagesWhatsapp",
          reminders_email as "remindersEmail",
          reminders_sms as "remindersSms",
          reminders_push as "remindersPush",
          reminders_whatsapp as "remindersWhatsapp",
          marketing_email as "marketingEmail",
          marketing_sms as "marketingSms",
          marketing_push as "marketingPush",
          marketing_whatsapp as "marketingWhatsapp",
          created_at as "createdAt",
          updated_at as "updatedAt"
        FROM notification_settings
        WHERE user_id IS NULL
        LIMIT 1
      `);
    }

    if (result.rows.length > 0) {
      const row = result.rows[0];
      return {
        id: row.id,
        userId: row.userId || undefined,
        systemUpdatesEmail: row.systemUpdatesEmail,
        systemUpdatesSms: row.systemUpdatesSms,
        systemUpdatesPush: row.systemUpdatesPush,
        systemUpdatesWhatsapp: row.systemUpdatesWhatsapp,
        securityAlertsEmail: row.securityAlertsEmail,
        securityAlertsSms: row.securityAlertsSms,
        securityAlertsPush: row.securityAlertsPush,
        securityAlertsWhatsapp: row.securityAlertsWhatsapp,
        newMessagesEmail: row.newMessagesEmail,
        newMessagesSms: row.newMessagesSms,
        newMessagesPush: row.newMessagesPush,
        newMessagesWhatsapp: row.newMessagesWhatsapp,
        remindersEmail: row.remindersEmail,
        remindersSms: row.remindersSms,
        remindersPush: row.remindersPush,
        remindersWhatsapp: row.remindersWhatsapp,
        marketingEmail: row.marketingEmail,
        marketingSms: row.marketingSms,
        marketingPush: row.marketingPush,
        marketingWhatsapp: row.marketingWhatsapp,
        createdAt: new Date(row.createdAt),
        updatedAt: new Date(row.updatedAt)
      };
    }

    // Return default settings if none found
    return getDefaultSettings();
  } catch (error) {
    console.error('Error fetching notification settings:', error);
    throw error;
  }
}

/**
 * Save notification settings for a user (or default if no user_id)
 */
export async function saveNotificationSettings(
  settings: Omit<NotificationSettings, 'id' | 'createdAt' | 'updatedAt'>,
  userId?: number
): Promise<NotificationSettings> {
  try {
    // Check if settings already exist
    const existingResult = await pool.query(
      'SELECT id FROM notification_settings WHERE user_id = $1 OR (user_id IS NULL AND $1 IS NULL)',
      [userId || null]
    );

    if (existingResult.rows.length > 0) {
      // Update existing settings
      const updateResult = await pool.query(`
        UPDATE notification_settings
        SET 
          system_updates_email = $1,
          system_updates_sms = $2,
          system_updates_push = $3,
          system_updates_whatsapp = $4,
          security_alerts_email = $5,
          security_alerts_sms = $6,
          security_alerts_push = $7,
          security_alerts_whatsapp = $8,
          new_messages_email = $9,
          new_messages_sms = $10,
          new_messages_push = $11,
          new_messages_whatsapp = $12,
          reminders_email = $13,
          reminders_sms = $14,
          reminders_push = $15,
          reminders_whatsapp = $16,
          marketing_email = $17,
          marketing_sms = $18,
          marketing_push = $19,
          marketing_whatsapp = $20,
          updated_at = CURRENT_TIMESTAMP
        WHERE user_id = $21 OR (user_id IS NULL AND $21 IS NULL)
        RETURNING id
      `, [
        settings.systemUpdatesEmail,
        settings.systemUpdatesSms,
        settings.systemUpdatesPush,
        settings.systemUpdatesWhatsapp,
        settings.securityAlertsEmail,
        settings.securityAlertsSms,
        settings.securityAlertsPush,
        settings.securityAlertsWhatsapp,
        settings.newMessagesEmail,
        settings.newMessagesSms,
        settings.newMessagesPush,
        settings.newMessagesWhatsapp,
        settings.remindersEmail,
        settings.remindersSms,
        settings.remindersPush,
        settings.remindersWhatsapp,
        settings.marketingEmail,
        settings.marketingSms,
        settings.marketingPush,
        settings.marketingWhatsapp,
        userId || null
      ]);

      const settingsId = updateResult.rows[0].id;
      const updatedSettings = await getNotificationSettings(userId);
      return updatedSettings;
    } else {
      // Insert new settings
      const insertResult = await pool.query(`
        INSERT INTO notification_settings (
          user_id,
          system_updates_email,
          system_updates_sms,
          system_updates_push,
          system_updates_whatsapp,
          security_alerts_email,
          security_alerts_sms,
          security_alerts_push,
          security_alerts_whatsapp,
          new_messages_email,
          new_messages_sms,
          new_messages_push,
          new_messages_whatsapp,
          reminders_email,
          reminders_sms,
          reminders_push,
          reminders_whatsapp,
          marketing_email,
          marketing_sms,
          marketing_push,
          marketing_whatsapp
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21)
        RETURNING id
      `, [
        userId || null,
        settings.systemUpdatesEmail,
        settings.systemUpdatesSms,
        settings.systemUpdatesPush,
        settings.systemUpdatesWhatsapp,
        settings.securityAlertsEmail,
        settings.securityAlertsSms,
        settings.securityAlertsPush,
        settings.securityAlertsWhatsapp,
        settings.newMessagesEmail,
        settings.newMessagesSms,
        settings.newMessagesPush,
        settings.newMessagesWhatsapp,
        settings.remindersEmail,
        settings.remindersSms,
        settings.remindersPush,
        settings.remindersWhatsapp,
        settings.marketingEmail,
        settings.marketingSms,
        settings.marketingPush,
        settings.marketingWhatsapp
      ]);

      const settingsId = insertResult.rows[0].id;
      const savedSettings = await getNotificationSettings(userId);
      return savedSettings;
    }
  } catch (error) {
    console.error('Error saving notification settings:', error);
    throw error;
  }
}

/**
 * Get default notification settings
 */
function getDefaultSettings(): NotificationSettings {
  return {
    systemUpdatesEmail: true,
    systemUpdatesSms: false,
    systemUpdatesPush: true,
    systemUpdatesWhatsapp: false,
    securityAlertsEmail: true,
    securityAlertsSms: true,
    securityAlertsPush: true,
    securityAlertsWhatsapp: true,
    newMessagesEmail: false,
    newMessagesSms: false,
    newMessagesPush: true,
    newMessagesWhatsapp: false,
    remindersEmail: true,
    remindersSms: false,
    remindersPush: true,
    remindersWhatsapp: false,
    marketingEmail: false,
    marketingSms: false,
    marketingPush: false,
    marketingWhatsapp: false
  };
}

/**
 * Reset notification settings to defaults
 */
export async function resetNotificationSettingsToDefaults(userId?: number): Promise<NotificationSettings> {
  const defaultSettings = getDefaultSettings();
  return await saveNotificationSettings(defaultSettings, userId);
}

