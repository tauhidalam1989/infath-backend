# Azure Blob Storage Configuration

## Insert Azure AD Credentials into Database

You have the following Azure AD credentials:
- **Application (client) ID**: `54a88f72-745d-432f-b63c-b6ac657b0e18`
- **Directory (tenant) ID**: `70ca47a3-3991-4823-8769-6da1f74d05c3`

## Required Information

Before inserting, you need:
1. **Storage Account Name**: Your Azure Storage Account name
2. **Container Name**: Your Azure Blob Container name
3. **Client Secret**: Create from Azure Portal > App Registrations > Your App > Certificates & secrets

## Method 1: Using Node.js Script (Recommended)

1. Edit `scripts/insert-azure-config-quick.js`
2. Replace the placeholder values:
   - `YOUR_STORAGE_ACCOUNT_NAME`
   - `YOUR_CONTAINER_NAME`
   - `YOUR_CLIENT_SECRET`
3. Run:
```bash
node scripts/insert-azure-config-quick.js
```

## Method 2: Using SQL Directly

1. Edit `scripts/azure-config-insert.sql`
2. Replace the placeholder values
3. Run in psql:
```bash
psql -h localhost -U screen -d screen -f scripts/azure-config-insert.sql
```

## Method 3: Using System Settings UI

1. Go to System Settings > Cloud Storage
2. Select "Azure Blob Storage" as provider
3. Select "Azure AD" as authentication method
4. Fill in:
   - Account Name: Your Storage Account name
   - Container: Your Container name
   - Client ID: `54a88f72-745d-432f-b63c-b6ac657b0e18`
   - Tenant ID: `70ca47a3-3991-4823-8769-6da1f74d05c3`
   - Client Secret: (from Azure Portal)
5. Click Save

## Verify Configuration

After inserting, verify the configuration:
```sql
SELECT provider, enabled, config_data FROM cloud_storage_configs WHERE provider = 'azure';
```


