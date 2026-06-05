import { pool } from '../config/database';
import { NotificationChannelConfig, ChannelType, ChannelConfig } from '../types/notification-config.types';

/**
 * Get all notification channel configurations
 */
export async function getChannelConfigs(): Promise<NotificationChannelConfig[]> {
  try {
    const result = await pool.query(`
      SELECT 
        id,
        channel_type as "channelType",
        is_enabled as "isEnabled",
        config_data as "configData",
        created_at as "createdAt",
        updated_at as "updatedAt",
        created_by as "createdBy"
      FROM notification_channel_configs
      ORDER BY channel_type
    `);

    return result.rows.map(row => ({
      id: row.id,
      channelType: row.channelType,
      isEnabled: row.isEnabled,
      configData: row.configData,
      createdAt: new Date(row.createdAt),
      updatedAt: new Date(row.updatedAt),
      createdBy: row.createdBy ?? null
    }));
  } catch (error) {
    console.error('Error fetching channel configurations:', error);
    throw error;
  }
}

/**
 * Get configuration for a specific channel
 */
export async function getChannelConfig(channelType: ChannelType): Promise<NotificationChannelConfig | null> {
  try {
    const result = await pool.query(`
      SELECT 
        id,
        channel_type as "channelType",
        is_enabled as "isEnabled",
        config_data as "configData",
        created_at as "createdAt",
        updated_at as "updatedAt",
        created_by as "createdBy"
      FROM notification_channel_configs
      WHERE channel_type = $1
    `, [channelType]);

    if (result.rows.length === 0) {
      return null;
    }

    const row = result.rows[0];
    return {
      id: row.id,
      channelType: row.channelType,
      isEnabled: row.isEnabled,
      configData: row.configData,
      createdAt: new Date(row.createdAt),
      updatedAt: new Date(row.updatedAt),
      createdBy: row.createdBy ?? null
    };
  } catch (error) {
    console.error('Error fetching channel configuration:', error);
    throw error;
  }
}

/**
 * Create or update channel configuration
 */
export async function upsertChannelConfig(
  channelType: ChannelType,
  isEnabled: boolean,
  configData: ChannelConfig,
  createdBy?: number
): Promise<NotificationChannelConfig> {
  try {
    const result = await pool.query(`
      INSERT INTO notification_channel_configs (
        channel_type,
        is_enabled,
        config_data,
        created_by,
        created_at,
        updated_at
      )
      VALUES ($1, $2, $3, $4, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
      ON CONFLICT (channel_type)
      DO UPDATE SET
        is_enabled = EXCLUDED.is_enabled,
        config_data = EXCLUDED.config_data,
        updated_at = CURRENT_TIMESTAMP
      RETURNING 
        id,
        channel_type as "channelType",
        is_enabled as "isEnabled",
        config_data as "configData",
        created_at as "createdAt",
        updated_at as "updatedAt",
        created_by as "createdBy"
    `, [channelType, isEnabled, JSON.stringify(configData), createdBy ?? null]);

    const row = result.rows[0];
    return {
      id: row.id,
      channelType: row.channelType,
      isEnabled: row.isEnabled,
      configData: row.configData,
      createdAt: new Date(row.createdAt),
      updatedAt: new Date(row.updatedAt),
      createdBy: row.createdBy ?? null
    };
  } catch (error) {
    console.error('Error upserting channel configuration:', error);
    throw error;
  }
}

/**
 * Update channel enabled status
 */
export async function updateChannelStatus(
  channelType: ChannelType,
  isEnabled: boolean
): Promise<void> {
  try {
    await pool.query(`
      UPDATE notification_channel_configs
      SET is_enabled = $1,
          updated_at = CURRENT_TIMESTAMP
      WHERE channel_type = $2
    `, [isEnabled, channelType]);
  } catch (error) {
    console.error('Error updating channel status:', error);
    throw error;
  }
}

/**
 * Test channel configuration (validate credentials)
 */
export async function testChannelConfig(channelType: ChannelType): Promise<{ success: boolean; message: string }> {
  try {
    const config = await getChannelConfig(channelType);
    if (!config) {
      return { success: false, message: 'Configuration not found' };
    }

    if (!config.isEnabled) {
      return { success: false, message: 'Channel is disabled' };
    }

    // TODO: Implement actual testing logic for each channel type
    // For now, just validate that required fields are present
    switch (channelType) {
      case 'email':
        const emailConfig = config.configData as any;
        if (!emailConfig.smtp_host || !emailConfig.smtp_user || !emailConfig.from_email) {
          return { success: false, message: 'Missing required email configuration' };
        }
        // In production, you would test SMTP connection here
        return { success: true, message: 'Email configuration is valid (not tested)' };
      
      case 'sms':
        const smsConfig = config.configData as any;
        if (!smsConfig.api_key || !smsConfig.provider) {
          return { success: false, message: 'Missing required SMS configuration' };
        }
        return { success: true, message: 'SMS configuration is valid (not tested)' };
      
      case 'push':
        const pushConfig = config.configData as any;
        if (!pushConfig.server_key || !pushConfig.provider) {
          return { success: false, message: 'Missing required Push configuration' };
        }
        return { success: true, message: 'Push configuration is valid (not tested)' };
      
      case 'whatsapp':
        const whatsappConfig = config.configData as any;
        if (!whatsappConfig.api_key || !whatsappConfig.phone_number_id) {
          return { success: false, message: 'Missing required WhatsApp configuration' };
        }
        return { success: true, message: 'WhatsApp configuration is valid (not tested)' };
      
      default:
        return { success: false, message: 'Unknown channel type' };
    }
  } catch (error: any) {
    console.error('Error testing channel configuration:', error);
    return { success: false, message: error.message || 'Error testing configuration' };
  }
}

