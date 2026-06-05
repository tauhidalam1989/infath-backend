-- Direct insert with provided Azure AD credentials
-- Note: You still need to provide:
-- 1. Storage Account Name (replace 'YOUR_STORAGE_ACCOUNT_NAME')
-- 2. Container Name (replace 'YOUR_CONTAINER_NAME')
-- 3. Client Secret (replace 'YOUR_CLIENT_SECRET') - Create from Azure Portal

INSERT INTO cloud_storage_configs (provider, enabled, config_data, updated_at)
VALUES (
  'azure',
  true,
  '{
    "azureAccountName": "YOUR_STORAGE_ACCOUNT_NAME",
    "azureContainer": "YOUR_CONTAINER_NAME",
    "azureAuthMethod": "azure-ad",
    "azureClientId": "54a88f72-745d-432f-b63c-b6ac657b0e18",
    "azureTenantId": "70ca47a3-3991-4823-8769-6da1f74d05c3",
    "azureClientSecret": "YOUR_CLIENT_SECRET"
  }'::jsonb,
  CURRENT_TIMESTAMP
)
ON CONFLICT (provider)
DO UPDATE SET
  enabled = true,
  config_data = '{
    "azureAccountName": "' || COALESCE((config_data->>'azureAccountName'), 'YOUR_STORAGE_ACCOUNT_NAME') || '",
    "azureContainer": "' || COALESCE((config_data->>'azureContainer'), 'YOUR_CONTAINER_NAME') || '",
    "azureAuthMethod": "azure-ad",
    "azureClientId": "54a88f72-745d-432f-b63c-b6ac657b0e18",
    "azureTenantId": "70ca47a3-3991-4823-8769-6da1f74d05c3",
    "azureClientSecret": "' || COALESCE((config_data->>'azureClientSecret'), 'YOUR_CLIENT_SECRET') || '"
  }'::jsonb,
  updated_at = CURRENT_TIMESTAMP;


