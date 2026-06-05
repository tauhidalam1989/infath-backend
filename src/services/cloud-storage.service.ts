import { CloudStorageConfig, UploadFileResponse, CloudProvider } from '../types/cloud-storage.types';
import { pool } from '../config/database';
import { getUploadsDir } from '../config/uploads';
import { ensureUtf8FileName } from '../utils/encoding.util';
import * as fs from 'fs';
import * as path from 'path';
import { v4 as uuidv4 } from 'uuid';
import * as crypto from 'crypto';

function buildSafeStoredFileName(originalName: string): string {
  const normalized = ensureUtf8FileName(originalName);
  // Preserve extension (if any) but keep the stored filename ASCII-safe.
  const ext = path.extname(normalized);
  return `${uuidv4()}${ext}`;
}

/**
 * Get cloud storage configuration
 */
export async function getCloudStorageConfig(): Promise<CloudStorageConfig | null> {
  try {
    // First try to get enabled config
    let result = await pool.query(`
      SELECT provider, enabled, config_data
      FROM cloud_storage_configs
      WHERE enabled = true
      ORDER BY id DESC
      LIMIT 1
    `);

    // If no enabled config, get any config (to show what's configured)
    if (result.rows.length === 0) {
      result = await pool.query(`
        SELECT provider, enabled, config_data
        FROM cloud_storage_configs
        ORDER BY id DESC
        LIMIT 1
      `);
    }

    if (result.rows.length === 0) {
      return null;
    }

    const row = result.rows[0];
    const configData = typeof row.config_data === 'string' 
      ? JSON.parse(row.config_data) 
      : row.config_data;
    
    return {
      provider: row.provider as CloudProvider,
      enabled: row.enabled,
      ...(configData || {})
    };
  } catch (error) {
    console.error('Error getting cloud storage config:', error);
    throw error;
  }
}

/**
 * Save cloud storage configuration
 */
export async function saveCloudStorageConfig(config: CloudStorageConfig): Promise<CloudStorageConfig> {
  try {
    const configData: any = {};
    
    if (config.provider === 'aws-s3') {
      configData.awsAccessKeyId = config.awsAccessKeyId;
      configData.awsSecretAccessKey = config.awsSecretAccessKey;
      configData.awsRegion = config.awsRegion;
      configData.awsBucket = config.awsBucket;
    } else if (config.provider === 'google-cloud') {
      configData.gcsProjectId = config.gcsProjectId;
      configData.gcsBucket = config.gcsBucket;
      configData.gcsKeyFile = config.gcsKeyFile;
    } else if (config.provider === 'azure') {
      configData.azureAccountName = config.azureAccountName;
      configData.azureContainer = config.azureContainer;
      configData.azureAuthMethod = config.azureAuthMethod || 'account-key';
      
      if (config.azureAuthMethod === 'account-key') {
        configData.azureAccountKey = config.azureAccountKey;
      } else if (config.azureAuthMethod === 'azure-ad') {
        configData.azureClientId = config.azureClientId;
        configData.azureTenantId = config.azureTenantId;
        configData.azureClientSecret = config.azureClientSecret;
      }
    } else if (config.provider === 'local') {
      configData.localUploadPath = config.localUploadPath || './uploads';
      configData.baseUrl = config.baseUrl || 'http://localhost:3000';
    }

    // Disable all other providers
    await pool.query(`
      UPDATE cloud_storage_configs
      SET enabled = false
      WHERE provider != $1
    `, [config.provider]);

    // Upsert configuration
    const result = await pool.query(`
      INSERT INTO cloud_storage_configs (provider, enabled, config_data, updated_at)
      VALUES ($1, $2, $3, CURRENT_TIMESTAMP)
      ON CONFLICT (provider)
      DO UPDATE SET
        enabled = $2,
        config_data = $3,
        updated_at = CURRENT_TIMESTAMP
      RETURNING *
    `, [config.provider, config.enabled, JSON.stringify(configData)]);

    return {
      provider: result.rows[0].provider,
      enabled: result.rows[0].enabled,
      ...configData
    };
  } catch (error) {
    console.error('Error saving cloud storage config:', error);
    throw error;
  }
}

/**
 * Upload file to cloud storage
 */
export async function uploadFile(
  file: Express.Multer.File,
  folder?: string
): Promise<UploadFileResponse> {
  try {
    const config = await getCloudStorageConfig();

    if (!config || !config.enabled) {
      // Fallback to local storage
      return await uploadToLocal(file, folder);
    }

    switch (config.provider) {
      case 'aws-s3':
        return await uploadToS3(file, config, folder);
      case 'google-cloud':
        return await uploadToGCS(file, config, folder);
      case 'azure':
        return await uploadToAzure(file, config, folder);
      case 'local':
      default:
        return await uploadToLocal(file, folder, config);
    }
  } catch (error) {
    console.error('Error uploading file:', error);
    throw error;
  }
}

/**
 * Upload to local storage
 */
async function uploadToLocal(
  file: Express.Multer.File,
  folder?: string,
  config?: CloudStorageConfig
): Promise<UploadFileResponse> {
  // Use same path as server (getUploadsDir) so GET /uploads/* finds the file
  const uploadPath = config?.localUploadPath && path.isAbsolute(config.localUploadPath)
    ? config.localUploadPath
    : getUploadsDir();
  const baseUrl = config?.baseUrl || process.env.BACKEND_PUBLIC_URL || 'http://localhost:3000';
  const folderPath = folder ? `${folder}/` : '';
  const originalName = ensureUtf8FileName(file.originalname);
  const fileName = buildSafeStoredFileName(originalName);
  const filePath = path.join(uploadPath, folderPath, fileName);

  // Ensure directory exists
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  // Write file
  fs.writeFileSync(filePath, file.buffer);

  const url = `${baseUrl}/uploads/${folderPath}${fileName}`;

  return {
    success: true,
    url,
    // For display / DB: keep original name (Arabic etc.)
    fileName: originalName,
    fileSize: file.size,
    mimeType: file.mimetype,
    provider: 'local'
  };
}

/**
 * Upload to AWS S3
 */
async function uploadToS3(
  file: Express.Multer.File,
  config: CloudStorageConfig,
  folder?: string
): Promise<UploadFileResponse> {
  // TODO: Implement AWS S3 upload
  // For now, fallback to local
  console.warn('AWS S3 upload not implemented yet, using local storage');
  return await uploadToLocal(file, folder, config);
}

/**
 * Upload to Google Cloud Storage
 */
async function uploadToGCS(
  file: Express.Multer.File,
  config: CloudStorageConfig,
  folder?: string
): Promise<UploadFileResponse> {
  // TODO: Implement GCS upload
  // For now, fallback to local
  console.warn('Google Cloud Storage upload not implemented yet, using local storage');
  return await uploadToLocal(file, folder, config);
}

/**
 * Upload to Azure Blob Storage
 */
/**
 * Create Azure Blob Storage container if it doesn't exist
 */
async function ensureAzureContainer(
  config: CloudStorageConfig,
  containerName: string
): Promise<void> {
  try {
    let authHeader: string;
    const date = new Date().toUTCString();

    if (config.azureAuthMethod === 'azure-ad') {
      // Use Azure AD authentication
      if (!config.azureClientId || !config.azureTenantId || !config.azureClientSecret) {
        throw new Error('Azure AD credentials are required');
      }

      // Get access token
      const tokenUrl = `https://login.microsoftonline.com/${config.azureTenantId}/oauth2/v2.0/token`;
      const tokenParams = new URLSearchParams({
        client_id: config.azureClientId,
        scope: 'https://storage.azure.com/.default',
        client_secret: config.azureClientSecret,
        grant_type: 'client_credentials'
      });

      const tokenResponse = await fetch(tokenUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded'
        },
        body: tokenParams.toString()
      });

      if (!tokenResponse.ok) {
        const errorData = await tokenResponse.text();
        throw new Error(`Azure AD authentication failed: ${tokenResponse.status} ${errorData}`);
      }

      const tokenData = await tokenResponse.json() as { access_token?: string };
      if (!tokenData.access_token) {
        throw new Error('Failed to obtain access token from Azure AD');
      }

      authHeader = `Bearer ${tokenData.access_token}`;
    } else {
      // Use Account Key authentication
      if (!config.azureAccountKey) {
        throw new Error('Azure Account Key is required');
      }

      // Create SharedKey signature for container creation
      const stringToSign = [
        'PUT', // HTTP method
        '', // Content-Encoding
        '', // Content-Language
        '0', // Content-Length
        '', // Content-MD5
        '', // Content-Type
        '', // Date
        '', // If-Modified-Since
        '', // If-Match
        '', // If-None-Match
        '', // If-Unmodified-Since
        '', // Range
        `x-ms-date:${date}`,
        `x-ms-version:2021-04-10`
      ].join('\n') + `\n/${config.azureAccountName}/${containerName}\nrestype:container`;

      const signature = crypto.createHmac('sha256', Buffer.from(config.azureAccountKey, 'base64'))
        .update(stringToSign, 'utf8')
        .digest('base64');

      authHeader = `SharedKey ${config.azureAccountName}:${signature}`;
    }

    // Try to create container (will succeed if exists or create if not)
    const containerUrl = `https://${config.azureAccountName}.blob.core.windows.net/${containerName}?restype=container`;
    const createResponse = await fetch(containerUrl, {
      method: 'PUT',
      headers: {
        'Authorization': authHeader,
        'x-ms-date': date,
        'x-ms-version': '2021-04-10'
      }
    });

    // 201 = Created, 409 = Already exists (both are OK)
    if (createResponse.status !== 201 && createResponse.status !== 409) {
      const errorText = await createResponse.text();
      // Don't throw error if container already exists
      if (createResponse.status !== 404) {
        console.warn(`Container creation warning: ${createResponse.status} ${errorText}`);
      }
    }
  } catch (error: any) {
    // Log but don't fail - container might already exist
    console.warn('Container creation check failed (may already exist):', error.message);
  }
}

async function uploadToAzure(
  file: Express.Multer.File,
  config: CloudStorageConfig,
  folder?: string
): Promise<UploadFileResponse> {
  try {
    if (!config.azureAccountName) {
      throw new Error('Azure Storage Account Name is required');
    }

    const containerName = config.azureContainer || 'uploads';
    
    // Ensure container exists before uploading
    await ensureAzureContainer(config, containerName);
    
    const folderPath = folder ? `${folder}/` : '';
    const originalName = ensureUtf8FileName(file.originalname);
    const fileName = buildSafeStoredFileName(originalName);
    const blobName = `${folderPath}${fileName}`;
    const blobUrl = `https://${config.azureAccountName}.blob.core.windows.net/${containerName}/${blobName}`;

    let authHeader: string;
    const date = new Date().toUTCString();

    if (config.azureAuthMethod === 'azure-ad') {
      // Use Azure AD authentication
      if (!config.azureClientId || !config.azureTenantId || !config.azureClientSecret) {
        throw new Error('Azure AD credentials are required');
      }

      // Get access token
      const tokenUrl = `https://login.microsoftonline.com/${config.azureTenantId}/oauth2/v2.0/token`;
      const tokenParams = new URLSearchParams({
        client_id: config.azureClientId,
        scope: 'https://storage.azure.com/.default',
        client_secret: config.azureClientSecret,
        grant_type: 'client_credentials'
      });

      const tokenResponse = await fetch(tokenUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded'
        },
        body: tokenParams.toString()
      });

      if (!tokenResponse.ok) {
        const errorData = await tokenResponse.text();
        throw new Error(`Azure AD authentication failed: ${tokenResponse.status} ${errorData}`);
      }

      const tokenData = await tokenResponse.json() as { access_token?: string };
      if (!tokenData.access_token) {
        throw new Error('Failed to obtain access token from Azure AD');
      }

      authHeader = `Bearer ${tokenData.access_token}`;
    } else {
      // Use Account Key authentication
      if (!config.azureAccountKey) {
        throw new Error('Azure Account Key is required');
      }

      // Create SharedKey signature
      const stringToSign = [
        'PUT', // HTTP method
        '', // Content-Encoding
        '', // Content-Language
        file.size.toString(), // Content-Length
        '', // Content-MD5
        file.mimetype, // Content-Type
        '', // Date
        '', // If-Modified-Since
        '', // If-Match
        '', // If-None-Match
        '', // If-Unmodified-Since
        '', // Range
        `x-ms-blob-type:BlockBlob`,
        `x-ms-date:${date}`,
        `x-ms-version:2021-04-10`
      ].join('\n') + `\n/${config.azureAccountName}/${containerName}/${blobName}`;

      const signature = crypto.createHmac('sha256', Buffer.from(config.azureAccountKey, 'base64'))
        .update(stringToSign, 'utf8')
        .digest('base64');

      authHeader = `SharedKey ${config.azureAccountName}:${signature}`;
    }

    // Upload file to Azure Blob Storage
    const uploadResponse = await fetch(blobUrl, {
      method: 'PUT',
      headers: {
        'Authorization': authHeader,
        'x-ms-blob-type': 'BlockBlob',
        'x-ms-date': date,
        'x-ms-version': '2021-04-10',
        'Content-Type': file.mimetype,
        'Content-Length': file.size.toString()
      },
      body: file.buffer
    });

    if (!uploadResponse.ok) {
      const errorText = await uploadResponse.text();
      throw new Error(`Azure Blob Storage upload failed: ${uploadResponse.status} ${uploadResponse.statusText}. ${errorText}`);
    }

    return {
      success: true,
      url: blobUrl,
      fileName: originalName,
      fileSize: file.size,
      mimeType: file.mimetype,
      provider: 'azure'
    };
  } catch (error: any) {
    console.error('Error uploading to Azure Blob Storage:', error);
    // Fallback to local storage on error
    console.warn('Falling back to local storage due to Azure upload error');
    return await uploadToLocal(file, folder, config);
  }
}

/**
 * Generate SAS token for direct client upload to Azure Blob Storage
 */
export async function generateSasToken(
  fileName: string,
  folder?: string,
  expiryMinutes: number = 60
): Promise<{ success: boolean; sasUrl?: string; blobUrl?: string; error?: string }> {
  try {
    const config = await getCloudStorageConfig();
    
    if (!config || !config.enabled || config.provider !== 'azure') {
      return {
        success: false,
        error: 'Azure cloud storage is not configured or enabled'
      };
    }

    if (!config.azureAccountName) {
      return {
        success: false,
        error: 'Azure Storage Account Name is required'
      };
    }

    const containerName = config.azureContainer || 'uploads';
    const folderPath = folder ? `${folder}/` : '';
    const uniqueFileName = `${uuidv4()}-${fileName}`;
    const blobName = `${folderPath}${uniqueFileName}`;
    
    // Ensure container exists
    await ensureAzureContainer(config, containerName);

    // Generate SAS token using Account Key (preferred) or Azure AD
    let sasToken: string;
    
    if (config.azureAuthMethod === 'account-key' && config.azureAccountKey) {
      // Generate Service SAS using Account Key (recommended for SAS tokens)
      sasToken = generateServiceSasToken(
        config.azureAccountName,
        config.azureAccountKey,
        containerName,
        blobName,
        expiryMinutes
      );
    } else if (config.azureAuthMethod === 'azure-ad') {
      // For Azure AD, try User Delegation SAS, but fall back to error message
      try {
        const userDelegationSas = await generateUserDelegationSas(
          config,
          containerName,
          blobName,
          expiryMinutes
        );
        sasToken = userDelegationSas;
      } catch (error: any) {
        // User Delegation SAS is complex and may fail
        // Suggest using Account Key for SAS token generation
        return {
          success: false,
          error: `SAS token generation with Azure AD failed: ${error.message}. For SAS token generation, please configure Azure Account Key in cloud storage settings, or use direct upload with Azure AD credentials on the frontend.`
        };
      }
    } else {
      return {
        success: false,
        error: 'Azure authentication method not supported for SAS token generation. Please configure Azure Account Key for SAS token generation.'
      };
    }

    const blobUrl = `https://${config.azureAccountName}.blob.core.windows.net/${containerName}/${blobName}`;
    const sasUrl = `${blobUrl}?${sasToken}`;

    return {
      success: true,
      sasUrl,
      blobUrl
    };
  } catch (error: any) {
    console.error('Error generating SAS token:', error);
    return {
      success: false,
      error: error.message || 'Failed to generate SAS token'
    };
  }
}

/**
 * Generate Service SAS token using Account Key
 */
function generateServiceSasToken(
  accountName: string,
  accountKey: string,
  containerName: string,
  blobName: string,
  expiryMinutes: number
): string {
  const expiryTime = new Date();
  expiryTime.setMinutes(expiryTime.getMinutes() + expiryMinutes);
  const expiryTimeStr = expiryTime.toISOString().split('.')[0] + 'Z';

  // SAS permissions: 'w' = write, 'c' = create
  const permissions = 'wc';
  
  // Canonicalized resource
  const canonicalizedResource = `/blob/${accountName}/${containerName}/${blobName}`;
  
  // String to sign for Service SAS
  const stringToSign = [
    permissions,
    '', // Start time (empty for immediate)
    expiryTimeStr,
    canonicalizedResource,
    '', // Identifier
    '', // IP range
    'https', // Protocol
    '2021-04-10', // Version
    '', // Cache control
    '', // Content disposition
    '', // Content encoding
    '', // Content language
    '' // Content type
  ].join('\n');

  // Generate signature
  const signature = crypto
    .createHmac('sha256', Buffer.from(accountKey, 'base64'))
    .update(stringToSign, 'utf8')
    .digest('base64');

  // Build SAS token query string
  const sasParams = new URLSearchParams({
    sv: '2021-04-10',
    ss: 'b', // Service (blob)
    srt: 'co', // Resource types (container, object)
    sp: permissions,
    se: expiryTimeStr,
    sig: signature
  });

  return sasParams.toString();
}

/**
 * Generate User Delegation SAS token using Azure AD
 * This requires getting a User Delegation Key from Azure Storage first
 */
async function generateUserDelegationSas(
  config: CloudStorageConfig,
  containerName: string,
  blobName: string,
  expiryMinutes: number
): Promise<string> {
  if (!config.azureClientId || !config.azureTenantId || !config.azureClientSecret) {
    throw new Error('Azure AD credentials are required for User Delegation SAS');
  }

  // Step 1: Get access token from Azure AD
  const tokenUrl = `https://login.microsoftonline.com/${config.azureTenantId}/oauth2/v2.0/token`;
  const tokenParams = new URLSearchParams({
    client_id: config.azureClientId,
    scope: 'https://storage.azure.com/.default',
    client_secret: config.azureClientSecret,
    grant_type: 'client_credentials'
  });

  const tokenResponse = await fetch(tokenUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    body: tokenParams.toString()
  });

  if (!tokenResponse.ok) {
    const errorData = await tokenResponse.text();
    throw new Error(`Azure AD authentication failed: ${tokenResponse.status} ${errorData}`);
  }

  const tokenData = await tokenResponse.json() as { access_token?: string };
  if (!tokenData.access_token) {
    throw new Error('Failed to obtain access token from Azure AD');
  }

  const accessToken = tokenData.access_token;

  // Step 2: Get User Delegation Key from Azure Storage
  const expiryTime = new Date();
  expiryTime.setMinutes(expiryTime.getMinutes() + expiryMinutes);
  const expiryTimeStr = expiryTime.toISOString().split('.')[0] + 'Z';

  const startTime = new Date();
  startTime.setMinutes(startTime.getMinutes() - 5); // Start 5 minutes ago to account for clock skew
  const startTimeStr = startTime.toISOString().split('.')[0] + 'Z';

  const delegationKeyUrl = `https://${config.azureAccountName}.blob.core.windows.net/?restype=service&comp=userdelegationkey`;
  // Build XML body - Azure requires specific XML structure
  // Note: User Delegation SAS is complex. For production, consider using Account Key for SAS tokens.
  const delegationKeyBody = `<?xml version="1.0" encoding="utf-8"?>
<UserDelegationKey>
<KeyInfo>
<Start>${startTimeStr}</Start>
<Expiry>${expiryTimeStr}</Expiry>
</KeyInfo>
</UserDelegationKey>`;

  const delegationKeyResponse = await fetch(delegationKeyUrl, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'x-ms-version': '2021-04-10',
      'Content-Type': 'application/xml; charset=utf-8'
    },
    body: delegationKeyBody
  });

  if (!delegationKeyResponse.ok) {
    const errorText = await delegationKeyResponse.text();
    throw new Error(`Failed to get User Delegation Key: ${delegationKeyResponse.status} ${errorText}`);
  }

  const delegationKeyData = await delegationKeyResponse.text();
  
  // Parse XML response to get delegation key
  // Note: This is a simplified approach. In production, use proper XML parsing
  const keyMatch = delegationKeyData.match(/<Value>([^<]+)<\/Value>/);
  const signedOidMatch = delegationKeyData.match(/<SignedOid>([^<]+)<\/SignedOid>/);
  const signedTidMatch = delegationKeyData.match(/<SignedTid>([^<]+)<\/SignedTid>/);
  const signedStartMatch = delegationKeyData.match(/<SignedStart>([^<]+)<\/SignedStart>/);
  const signedExpiryMatch = delegationKeyData.match(/<SignedExpiry>([^<]+)<\/SignedExpiry>/);
  const signedServiceMatch = delegationKeyData.match(/<SignedService>([^<]+)<\/SignedService>/);
  const signedVersionMatch = delegationKeyData.match(/<SignedVersion>([^<]+)<\/SignedVersion>/);

  if (!keyMatch || !signedOidMatch || !signedTidMatch || !signedStartMatch || !signedExpiryMatch || !signedServiceMatch || !signedVersionMatch) {
    throw new Error('Failed to parse User Delegation Key response');
  }

  const delegationKey = keyMatch[1];
  const signedOid = signedOidMatch[1];
  const signedTid = signedTidMatch[1];
  const signedStart = signedStartMatch[1];
  const signedExpiry = signedExpiryMatch[1];
  const signedService = signedServiceMatch[1];
  const signedVersion = signedVersionMatch[1];

  // Step 3: Generate User Delegation SAS token
  const permissions = 'wc'; // Write and Create
  const canonicalizedResource = `/blob/${config.azureAccountName}/${containerName}/${blobName}`;
  
  // String to sign for User Delegation SAS
  const stringToSign = [
    permissions,
    signedStart,
    signedExpiry,
    canonicalizedResource,
    signedOid,
    signedTid,
    signedService,
    signedVersion
  ].join('\n');

  // Sign with delegation key
  const signature = crypto
    .createHmac('sha256', Buffer.from(delegationKey, 'base64'))
    .update(stringToSign, 'utf8')
    .digest('base64');

  // Build SAS token query string
  const sasParams = new URLSearchParams({
    sv: signedVersion,
    sr: 'b', // Resource (blob)
    sp: permissions,
    se: expiryTimeStr,
    skoid: signedOid,
    sktid: signedTid,
    ske: signedExpiry,
    sks: signedService,
    skv: signedVersion,
    sig: signature
  });

  return sasParams.toString();
}

/**
 * Test cloud storage configuration
 */
export async function testCloudStorageConfig(config?: CloudStorageConfig): Promise<{ success: boolean; message: string }> {
  try {
    // If config is provided, use it directly (for testing specific provider)
    // Otherwise, get from database
    const testConfig = config || await getCloudStorageConfig();
    
    if (!testConfig) {
      return { success: false, message: 'No cloud storage configuration found' };
    }

    if (!testConfig.provider) {
      return { success: false, message: 'No provider specified for testing' };
    }

    // Only check enabled if config is from database (not a direct test)
    if (!config && !testConfig.enabled) {
      return { success: false, message: 'Cloud storage is disabled' };
    }

    switch (testConfig.provider) {
      case 'azure':
        return await testAzureConfig(testConfig);
      
      case 'aws-s3':
        // Validate AWS S3 config
        if (!testConfig.awsAccessKeyId || !testConfig.awsSecretAccessKey || !testConfig.awsRegion || !testConfig.awsBucket) {
          return { success: false, message: 'Missing required AWS S3 configuration' };
        }
        // TODO: Implement actual AWS S3 connection test
        return { success: true, message: 'AWS S3 configuration is valid (connection not tested)' };
      
      case 'google-cloud':
        // Validate GCS config
        if (!testConfig.gcsProjectId || !testConfig.gcsBucket) {
          return { success: false, message: 'Missing required Google Cloud Storage configuration' };
        }
        // TODO: Implement actual GCS connection test
        return { success: true, message: 'Google Cloud Storage configuration is valid (connection not tested)' };
      
      case 'local':
        return { success: true, message: 'Local storage is always available' };
      
      default:
        return { success: false, message: 'Unknown cloud storage provider' };
    }
  } catch (error: any) {
    console.error('Error testing cloud storage config:', error);
    return { success: false, message: error.message || 'Error testing cloud storage configuration' };
  }
}

/**
 * Test Azure Blob Storage configuration
 */
async function testAzureConfig(config: CloudStorageConfig): Promise<{ success: boolean; message: string }> {
  try {
    // Validate required fields - only check what's needed for the selected auth method
    if (!config.azureAccountName) {
      return { success: false, message: 'Missing required Azure configuration: Storage Account Name is required' };
    }
    
    // Container name is optional for testing authentication (we can test auth without it)

    if (config.azureAuthMethod === 'azure-ad') {
      // Validate Azure AD credentials
      if (!config.azureClientId || !config.azureTenantId || !config.azureClientSecret) {
        return { success: false, message: 'Missing required Azure AD credentials: Client ID, Tenant ID, and Client Secret are required' };
      }

      // Try to get access token from Azure AD
      try {
        // Validate Storage Account Name is not a placeholder
        if (config.azureAccountName === 'YOUR_STORAGE_ACCOUNT_NAME' || 
            config.azureAccountName?.toLowerCase().includes('your_storage') ||
            !config.azureAccountName || 
            config.azureAccountName.trim() === '') {
          return { 
            success: false, 
            message: 'Please provide your actual Azure Storage Account Name. Current value appears to be a placeholder.' 
          };
        }

        const tokenUrl = `https://login.microsoftonline.com/${config.azureTenantId}/oauth2/v2.0/token`;
        const tokenParams = new URLSearchParams({
          client_id: config.azureClientId,
          scope: 'https://storage.azure.com/.default',
          client_secret: config.azureClientSecret,
          grant_type: 'client_credentials'
        });

        const tokenResponse = await fetch(tokenUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded'
          },
          body: tokenParams.toString()
        });

        if (!tokenResponse.ok) {
          const errorData = await tokenResponse.text();
          let errorMessage = `Azure AD authentication failed: ${tokenResponse.status} ${tokenResponse.statusText}`;
          try {
            const errorJson = JSON.parse(errorData);
            if (errorJson.error_description) {
              errorMessage += `. ${errorJson.error_description}`;
            }
          } catch {
            errorMessage += `. ${errorData}`;
          }
          return { success: false, message: errorMessage };
        }

        const tokenData = await tokenResponse.json() as { access_token?: string; error?: string; error_description?: string };
        if (!tokenData.access_token) {
          return { success: false, message: 'Failed to obtain access token from Azure AD' };
        }

        // Try to access Azure Storage with the token
        const storageUrl = `https://${config.azureAccountName}.blob.core.windows.net/?comp=list`;
        let storageResponse;
        try {
          storageResponse = await fetch(storageUrl, {
            method: 'GET',
            headers: {
              'Authorization': `Bearer ${tokenData.access_token}`,
              'x-ms-version': '2021-04-10'
            }
          });
        } catch (fetchError: any) {
          if (fetchError.code === 'ENOTFOUND' || fetchError.message?.includes('getaddrinfo')) {
            return { 
              success: false, 
              message: `Storage Account "${config.azureAccountName}" not found. Please verify the Storage Account Name is correct and exists in your Azure subscription.` 
            };
          }
          throw fetchError;
        }

        if (storageResponse.ok) {
          return { success: true, message: 'Azure AD authentication successful! Storage account connection verified.' };
        } else if (storageResponse.status === 403) {
          return { 
            success: false, 
            message: 'Authentication successful but access denied. Please assign "Storage Blob Data Contributor" role to your Azure AD app in the Storage Account IAM settings.' 
          };
        } else {
          const errorText = await storageResponse.text();
          return { 
            success: false, 
            message: `Azure Storage connection failed: ${storageResponse.status} ${storageResponse.statusText}. ${errorText}` 
          };
        }
      } catch (error: any) {
        if (error.code === 'ENOTFOUND' || error.message?.includes('getaddrinfo')) {
          return { 
            success: false, 
            message: `Cannot resolve Storage Account "${config.azureAccountName}". Please verify the Storage Account Name is correct.` 
          };
        }
        return { 
          success: false, 
          message: `Azure AD authentication error: ${error.message}` 
        };
      }
    } else if (config.azureAuthMethod === 'account-key') {
      // Validate Account Key
      if (!config.azureAccountKey) {
        return { success: false, message: 'Missing required Azure Account Key' };
      }

      // Try to list containers using Account Key
      try {
        const storageUrl = `https://${config.azureAccountName}.blob.core.windows.net/?comp=list`;
        const date = new Date().toUTCString();
        const stringToSign = `GET\n\n\n\n\n\n\n\n\n\n\n\nx-ms-date:${date}\nx-ms-version:2021-04-10\n/${config.azureAccountName}/\ncomp:list`;
        
        // Create authorization header with account key
        const signature = crypto.createHmac('sha256', Buffer.from(config.azureAccountKey, 'base64'))
          .update(stringToSign, 'utf8')
          .digest('base64');
        
        const authHeader = `SharedKey ${config.azureAccountName}:${signature}`;
        
        const storageResponse = await fetch(storageUrl, {
          method: 'GET',
          headers: {
            'Authorization': authHeader,
            'x-ms-date': date,
            'x-ms-version': '2021-04-10'
          }
        });

        if (storageResponse.ok) {
          return { success: true, message: 'Azure Storage Account Key authentication successful! Storage account connection verified.' };
        } else {
          const errorText = await storageResponse.text();
          return { 
            success: false, 
            message: `Azure Storage connection failed: ${storageResponse.status} ${storageResponse.statusText}. ${errorText}` 
          };
        }
      } catch (error: any) {
        return { 
          success: false, 
          message: `Azure Storage connection error: ${error.message}` 
        };
      }
    } else {
      return { success: false, message: 'Invalid Azure authentication method' };
    }
  } catch (error: any) {
    console.error('Error testing Azure config:', error);
    return { success: false, message: error.message || 'Error testing Azure configuration' };
  }
}

/**
 * Delete file from cloud storage
 */
export async function deleteFile(fileUrl: string): Promise<void> {
  try {
    const config = await getCloudStorageConfig();

    if (!config || config.provider === 'local') {
      // Delete from local storage
      const urlPath = new URL(fileUrl).pathname;
      const filePath = path.join('.', urlPath);
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
      return;
    }

    // TODO: Implement delete for other cloud providers
    console.warn('Delete not implemented for cloud provider:', config.provider);
  } catch (error) {
    console.error('Error deleting file:', error);
    throw error;
  }
}

