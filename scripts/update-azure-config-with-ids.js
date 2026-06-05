require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5432'),
  database: process.env.DB_NAME || 'screen',
  user: process.env.DB_USER || 'screen',
  password: process.env.DB_PASSWORD || 'screen',
});

async function updateAzureConfig() {
  // Azure AD Configuration
  // NOTE: You need to provide the actual Client Secret VALUE (not the Secret ID)
  // The Secret ID is just an identifier: c13e9f1b-488a-48da-8cc6-7e25348d5763
  const configData = {
    azureAccountName: 'YOUR_STORAGE_ACCOUNT_NAME', // TODO: Replace with your Azure Storage Account Name
    azureContainer: 'YOUR_CONTAINER_NAME', // TODO: Replace with your Azure Blob Container Name
    azureAuthMethod: 'azure-ad',
    azureClientId: '54a88f72-745d-432f-b63c-b6ac657b0e18',
    azureTenantId: '70ca47a3-3991-4823-8769-6da1f74d05c3',
    azureClientSecret: 'CFC8Q~VKDrXmIXKkyBICLdmdrJEe51MDaxYdwc~f'
    // Secret ID (for reference): c13e9f1b-488a-48da-8cc6-7e25348d5763
    // Object ID (for reference): 8a710b0b-d16b-43d8-a15b-b30ef344fdae
  };

  try {
    const result = await pool.query(`
      INSERT INTO cloud_storage_configs (provider, enabled, config_data, updated_at)
      VALUES ($1, $2, $3, CURRENT_TIMESTAMP)
      ON CONFLICT (provider)
      DO UPDATE SET
        enabled = $2,
        config_data = $3,
        updated_at = CURRENT_TIMESTAMP
      RETURNING *
    `, ['azure', true, JSON.stringify(configData)]);

    console.log('✅ Azure configuration updated successfully!');
    console.log('\n📋 Azure AD Credentials:');
    console.log('  Application (Client) ID: 54a88f72-745d-432f-b63c-b6ac657b0e18');
    console.log('  Directory (Tenant) ID:   70ca47a3-3991-4823-8769-6da1f74d05c3');
    console.log('  Object ID:                8a710b0b-d16b-43d8-a15b-b30ef344fdae');
    console.log('  Secret ID:                c13e9f1b-488a-48da-8cc6-7e25348d5763');
    console.log('\n⚠️  IMPORTANT: Update the following in this script before running:');
    console.log('  1. azureAccountName: Your Azure Storage Account Name');
    console.log('  2. azureContainer: Your Azure Blob Container Name');
    console.log('\n✅ Client Secret is already configured!');
  } catch (error) {
    console.error('❌ Error:', error.message);
    throw error;
  } finally {
    await pool.end();
  }
}

updateAzureConfig()
  .then(() => process.exit(0))
  .catch(() => process.exit(1));

