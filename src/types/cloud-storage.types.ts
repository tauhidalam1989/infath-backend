export type CloudProvider = 'aws-s3' | 'google-cloud' | 'azure' | 'local';

export interface CloudStorageConfig {
  provider: CloudProvider;
  enabled: boolean;
  // AWS S3
  awsAccessKeyId?: string;
  awsSecretAccessKey?: string;
  awsRegion?: string;
  awsBucket?: string;
  // Google Cloud Storage
  gcsProjectId?: string;
  gcsBucket?: string;
  gcsKeyFile?: string;
  // Azure Blob Storage
  azureAccountName?: string;
  azureAccountKey?: string;
  azureContainer?: string;
  // Azure AD Authentication (alternative to Account Key)
  azureAuthMethod?: 'account-key' | 'azure-ad';
  azureClientId?: string;
  azureTenantId?: string;
  azureClientSecret?: string;
  // Local storage
  localUploadPath?: string;
  baseUrl?: string;
}

export interface UploadFileResponse {
  success: boolean;
  url: string;
  fileName: string;
  fileSize: number;
  mimeType: string;
  provider: CloudProvider;
}

