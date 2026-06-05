-- Insert Azure Blob Storage configuration with Azure AD authentication
-- Replace the placeholder values with your actual values:
-- - YOUR_STORAGE_ACCOUNT_NAME: Your Azure Storage Account name
-- - YOUR_CONTAINER_NAME: Your Azure Blob Container name
-- - YOUR_CLIENT_SECRET: Client secret from Azure Portal (App Registrations > Certificates & secrets)

INSERT INTO cloud_storage_configs (provider, enabled, config_data, updated_at)
VALUES (
  'azure',
  true,
  jsonb_build_object(
    'azureAccountName', 'YOUR_STORAGE_ACCOUNT_NAME',
    'azureContainer', 'YOUR_CONTAINER_NAME',
    'azureAuthMethod', 'azure-ad',
    'azureClientId', '54a88f72-745d-432f-b63c-b6ac657b0e18',
    'azureTenantId', '70ca47a3-3991-4823-8769-6da1f74d05c3',
    'azureClientSecret', 'YOUR_CLIENT_SECRET'
  ),
  CURRENT_TIMESTAMP
)
ON CONFLICT (provider)
DO UPDATE SET
  enabled = true,
  config_data = jsonb_build_object(
    'azureAccountName', EXCLUDED.config_data->>'azureAccountName',
    'azureContainer', EXCLUDED.config_data->>'azureContainer',
    'azureAuthMethod', 'azure-ad',
    'azureClientId', '54a88f72-745d-432f-b63c-b6ac657b0e18',
    'azureTenantId', '70ca47a3-3991-4823-8769-6da1f74d05c3',
    'azureClientSecret', EXCLUDED.config_data->>'azureClientSecret'
  ),
  updated_at = CURRENT_TIMESTAMP;


