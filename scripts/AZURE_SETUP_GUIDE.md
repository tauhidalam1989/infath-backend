# Azure Blob Storage Setup Guide

## Prerequisites

1. **Azure Storage Account** - You need an actual Azure Storage Account
2. **Storage Account Name** - The name of your storage account (lowercase, no spaces)
3. **Container Name** - A blob container in your storage account (or create a new one)
4. **Azure AD App Registration** - Already configured ✅
   - Client ID: `54a88f72-745d-432f-b63c-b6ac657b0e18`
   - Tenant ID: `70ca47a3-3991-4823-8769-6da1f74d05c3`
   - Client Secret: `CFC8Q~VKDrXmIXKkyBICLdmdrJEe51MDaxYdwc~f`

## Step 1: Get Your Azure Storage Account Name

1. Go to [Azure Portal](https://portal.azure.com)
2. Navigate to **Storage Accounts**
3. Click on your storage account
4. In the **Overview** section, you'll see the **Storage account name**
   - Example: `mystorageaccount123`
   - Copy this name (it's lowercase, no spaces)

## Step 2: Get or Create Container Name

1. In your Storage Account, go to **Containers** (under Data storage)
2. Either:
   - Use an existing container name, OR
   - Click **+ Container** to create a new one
   - Recommended name: `advertisements` or `uploads`
   - Set **Public access level** to **Private** (recommended) or **Blob** (if you want public access)

## Step 3: Assign Storage Blob Data Contributor Role

**IMPORTANT:** Your Azure AD app needs permission to access the Storage Account.

1. Go to your **Storage Account** in Azure Portal
2. Click on **Access control (IAM)** in the left menu
3. Click **+ Add** → **Add role assignment**
4. Select role: **Storage Blob Data Contributor**
5. Click **Next**
6. Under **Assign access to**, select **Managed identity** or **User, group, or service principal**
7. Click **+ Select members**
8. Search for your app registration name or Client ID: `54a88f72-745d-432f-b63c-b6ac657b0e18`
9. Select it and click **Select**
10. Click **Review + assign**

## Step 4: Update Configuration in Database

### Option A: Using System Settings UI (Recommended)

1. Go to System Settings → Cloud Storage tab
2. Select **Azure** as provider
3. Fill in:
   - **Storage Account Name**: Your actual storage account name (e.g., `mystorageaccount123`)
   - **Container Name**: Your container name (e.g., `advertisements`)
   - **Authentication Method**: Azure AD
   - **Client ID**: `54a88f72-745d-432f-b63c-b6ac657b0e18`
   - **Tenant ID**: `70ca47a3-3991-4823-8769-6da1f74d05c3`
   - **Client Secret**: `CFC8Q~VKDrXmIXKkyBICLdmdrJEe51MDaxYdwc~f`
4. Click **Test Configuration** to verify
5. Click **Save Configuration**

### Option B: Using Script

```bash
cd screening-backend
export AZURE_STORAGE_ACCOUNT_NAME="your-actual-storage-account-name"
export AZURE_CONTAINER_NAME="your-actual-container-name"
node scripts/update-azure-storage-details.js
```

## Step 5: Verify Configuration

1. Test the configuration using the **Test Configuration** button
2. You should see: "Azure AD authentication successful! Storage account connection verified."

## Common Issues

### Error: "fetch failed" or "ENOTFOUND"
- **Cause**: Storage Account Name is still a placeholder
- **Fix**: Update with actual Storage Account Name

### Error: "403 Forbidden" or "Access Denied"
- **Cause**: Azure AD app doesn't have permissions on Storage Account
- **Fix**: Assign **Storage Blob Data Contributor** role (Step 3)

### Error: "Container not found"
- **Cause**: Container doesn't exist
- **Fix**: Create container in Azure Portal or update Container Name

### Error: "Invalid authentication"
- **Cause**: Client Secret expired or incorrect
- **Fix**: Generate new Client Secret in Azure AD App Registration

## Testing Upload

After configuration is complete:
1. Create a new advertisement
2. Upload a file
3. Check Azure Portal → Storage Account → Container → Blobs
4. You should see the uploaded file


