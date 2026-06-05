import { Request, Response } from 'express';
import * as cloudStorageService from '../services/cloud-storage.service';
import { CloudStorageConfig, CloudProvider } from '../types/cloud-storage.types';
import { logEvent } from '../utils/logger.util';

/**
 * GET /api/cloud-storage/config
 * Get cloud storage configuration
 */
export const getConfig = async (req: Request, res: Response) => {
  try {
    const config = await cloudStorageService.getCloudStorageConfig();
    res.json({
      success: true,
      config
    });
  } catch (error: any) {
    console.error('Error getting cloud storage config:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to get cloud storage configuration'
    });
  }
};

/**
 * POST /api/cloud-storage/config
 * Save cloud storage configuration
 */
export const saveConfig = async (req: Request, res: Response) => {
  try {
    const config: CloudStorageConfig = {
      provider: req.body.provider,
      enabled: req.body.enabled !== false,
      awsAccessKeyId: req.body.awsAccessKeyId,
      awsSecretAccessKey: req.body.awsSecretAccessKey,
      awsRegion: req.body.awsRegion,
      awsBucket: req.body.awsBucket,
      gcsProjectId: req.body.gcsProjectId,
      gcsBucket: req.body.gcsBucket,
      gcsKeyFile: req.body.gcsKeyFile,
      azureAccountName: req.body.azureAccountName,
      azureAccountKey: req.body.azureAccountKey,
      azureContainer: req.body.azureContainer,
      azureAuthMethod: req.body.azureAuthMethod,
      azureClientId: req.body.azureClientId,
      azureTenantId: req.body.azureTenantId,
      azureClientSecret: req.body.azureClientSecret,
      localUploadPath: req.body.localUploadPath,
      baseUrl: req.body.baseUrl
    };

    const savedConfig = await cloudStorageService.saveCloudStorageConfig(config);

    // Log configuration update
    await logEvent(
      'info',
      'cloud_storage',
      'config_update',
      `Cloud storage configuration updated: ${config.provider}`,
      { provider: config.provider, enabled: config.enabled },
      (req as any).user?.id,
      req.ip || req.connection?.remoteAddress,
      req.get('user-agent')
    );

    res.json({
      success: true,
      message: 'Cloud storage configuration saved successfully',
      config: savedConfig
    });
  } catch (error: any) {
    console.error('Error saving cloud storage config:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to save cloud storage configuration'
    });
  }
};

/**
 * POST /api/cloud-storage/test-config
 * Test cloud storage configuration
 */
export const testConfig = async (req: Request, res: Response) => {
  try {
    // Only include fields relevant to the selected provider
    const provider = req.body.provider;
    if (!provider) {
      return res.status(400).json({
        success: false,
        error: 'Provider is required for testing'
      });
    }

    // Build config object with only the selected provider's fields
    const config: CloudStorageConfig = {
      provider: provider as CloudProvider,
      enabled: true // Always enabled for testing purposes
    };

    // Add provider-specific fields based on selected provider
    if (provider === 'azure') {
      config.azureAccountName = req.body.azureAccountName;
      config.azureContainer = req.body.azureContainer;
      config.azureAuthMethod = req.body.azureAuthMethod || 'account-key';
      
      if (config.azureAuthMethod === 'account-key') {
        config.azureAccountKey = req.body.azureAccountKey;
      } else if (config.azureAuthMethod === 'azure-ad') {
        config.azureClientId = req.body.azureClientId;
        config.azureTenantId = req.body.azureTenantId;
        config.azureClientSecret = req.body.azureClientSecret;
      }
    } else if (provider === 'aws-s3') {
      config.awsAccessKeyId = req.body.awsAccessKeyId;
      config.awsSecretAccessKey = req.body.awsSecretAccessKey;
      config.awsRegion = req.body.awsRegion;
      config.awsBucket = req.body.awsBucket;
    } else if (provider === 'google-cloud') {
      config.gcsProjectId = req.body.gcsProjectId;
      config.gcsBucket = req.body.gcsBucket;
      config.gcsKeyFile = req.body.gcsKeyFile;
    } else if (provider === 'local') {
      config.localUploadPath = req.body.localUploadPath;
      config.baseUrl = req.body.baseUrl;
    }

    const result = await cloudStorageService.testCloudStorageConfig(config);

    // Log test attempt
    await logEvent(
      result.success ? 'info' : 'warning',
      'cloud_storage',
      'config_test',
      `Cloud storage configuration test: ${result.success ? 'Success' : 'Failed'}`,
      { provider: config?.provider || 'unknown', message: result.message },
      (req as any).user?.id,
      req.ip || req.connection?.remoteAddress,
      req.get('user-agent')
    );

    res.json({
      success: result.success,
      message: result.message
    });
  } catch (error: any) {
    console.error('Error testing cloud storage config:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to test cloud storage configuration'
    });
  }
};

/**
 * POST /api/cloud-storage/generate-sas-token
 * Generate SAS token for direct client upload
 */
export const generateSasToken = async (req: Request, res: Response) => {
  try {
    const { fileName, folder, expiryMinutes } = req.body;

    if (!fileName) {
      return res.status(400).json({
        success: false,
        error: 'File name is required'
      });
    }

    const result = await cloudStorageService.generateSasToken(
      fileName,
      folder || 'advertisements',
      expiryMinutes || 60
    );

    if (!result.success) {
      return res.status(400).json({
        success: false,
        error: result.error || 'Failed to generate SAS token'
      });
    }

    res.json({
      success: true,
      sasUrl: result.sasUrl,
      blobUrl: result.blobUrl
    });
  } catch (error: any) {
    console.error('Error generating SAS token:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to generate SAS token'
    });
  }
};

