import { Request, Response } from 'express';
import * as notificationConfigService from '../services/notification-config.service';
import { ChannelType, ChannelConfig } from '../types/notification-config.types';
import { logEvent } from '../utils/logger.util';

/**
 * GET /api/notification-configs
 * Get all channel configurations
 */
export const getChannelConfigs = async (req: Request, res: Response) => {
  try {
    const configs = await notificationConfigService.getChannelConfigs();
    res.json({
      success: true,
      configs
    });
  } catch (error: any) {
    console.error('Error getting channel configurations:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to get channel configurations'
    });
  }
};

/**
 * GET /api/notification-configs/:channelType
 * Get configuration for a specific channel
 */
export const getChannelConfig = async (req: Request, res: Response) => {
  try {
    const channelType = req.params.channelType as ChannelType;
    if (!['email', 'sms', 'push', 'whatsapp'].includes(channelType)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid channel type'
      });
    }

    const config = await notificationConfigService.getChannelConfig(channelType);
    if (!config) {
      return res.status(404).json({
        success: false,
        error: 'Configuration not found'
      });
    }

    res.json({
      success: true,
      config
    });
  } catch (error: any) {
    console.error('Error getting channel configuration:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to get channel configuration'
    });
  }
};

/**
 * POST /api/notification-configs/:channelType
 * Create or update channel configuration
 */
export const upsertChannelConfig = async (req: Request, res: Response) => {
  try {
    const channelType = req.params.channelType as ChannelType;
    if (!['email', 'sms', 'push', 'whatsapp'].includes(channelType)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid channel type'
      });
    }

    const { isEnabled, configData } = req.body;

    if (typeof isEnabled !== 'boolean') {
      return res.status(400).json({
        success: false,
        error: 'isEnabled must be a boolean'
      });
    }

    if (!configData || typeof configData !== 'object') {
      return res.status(400).json({
        success: false,
        error: 'configData must be an object'
      });
    }

    // Get createdBy from request (you might want to get this from auth token)
    const createdBy = (req as any).user?.id;

    const config = await notificationConfigService.upsertChannelConfig(
      channelType,
      isEnabled,
      configData as ChannelConfig,
      createdBy
    );

    // Log notification config update
    await logEvent(
      'info',
      'notification_config',
      'update',
      `${channelType.toUpperCase()} notification channel configuration ${config.id ? 'updated' : 'created'}`,
      { channelType, isEnabled, configId: config.id },
      createdBy,
      req.ip || req.connection?.remoteAddress,
      req.get('user-agent')
    );

    res.json({
      success: true,
      message: 'Configuration saved successfully',
      config
    });
  } catch (error: any) {
    console.error('Error upserting channel configuration:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to save channel configuration'
    });
  }
};

/**
 * PUT /api/notification-configs/:channelType/status
 * Update channel enabled status
 */
export const updateChannelStatus = async (req: Request, res: Response) => {
  try {
    const channelType = req.params.channelType as ChannelType;
    if (!['email', 'sms', 'push', 'whatsapp'].includes(channelType)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid channel type'
      });
    }

    const { isEnabled } = req.body;

    if (typeof isEnabled !== 'boolean') {
      return res.status(400).json({
        success: false,
        error: 'isEnabled must be a boolean'
      });
    }

    await notificationConfigService.updateChannelStatus(channelType, isEnabled);

    // Log channel status update
    await logEvent(
      'info',
      'notification_config',
      'status_update',
      `${channelType.toUpperCase()} notification channel ${isEnabled ? 'enabled' : 'disabled'}`,
      { channelType, isEnabled },
      (req as any).user?.id,
      req.ip || req.connection?.remoteAddress,
      req.get('user-agent')
    );

    res.json({
      success: true,
      message: 'Channel status updated successfully'
    });
  } catch (error: any) {
    console.error('Error updating channel status:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to update channel status'
    });
  }
};

/**
 * POST /api/notification-configs/:channelType/test
 * Test channel configuration
 */
export const testChannelConfig = async (req: Request, res: Response) => {
  try {
    const channelType = req.params.channelType as ChannelType;
    if (!['email', 'sms', 'push', 'whatsapp'].includes(channelType)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid channel type'
      });
    }

    const result = await notificationConfigService.testChannelConfig(channelType);

    // Log channel test
    await logEvent(
      result.success ? 'success' : 'error',
      'notification_config',
      'test',
      `${channelType.toUpperCase()} notification channel test ${result.success ? 'passed' : 'failed'}`,
      { channelType, success: result.success, message: result.message },
      (req as any).user?.id,
      req.ip || req.connection?.remoteAddress,
      req.get('user-agent')
    );

    res.json({
      success: result.success,
      message: result.message
    });
  } catch (error: any) {
    console.error('Error testing channel configuration:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to test channel configuration'
    });
  }
};

