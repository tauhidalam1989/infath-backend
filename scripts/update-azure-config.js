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
  // NOTE: Replace 'YOUR_CLIENT_SECRET' with the actual client secret from Azure Portal
  // You can find it in: Azure Portal > App registrations > Your app > Certificates & secrets
  const configData = {
    azureAccountName: 'YOUR_STORAGE_ACCOUNT_NAME', // Replace with your Azure Storage Account Name
    azureContainer: 'YOUR_CONTAINER_NAME', // Replace with your Azure Blob Container Name
    azureAuthMethod: 'azure-ad',
    azureClientId: '54a88f72-745d-432f-b63c-b6ac657b0e18',
    azureTenantId: '70ca47a3-3991-4823-8769-6da1f74d05c3',
    azureClientSecret: 'YOUR_CLIENT_SECRET' // Replace with the actual client secret value
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
    console.log('Provider:', result.rows[0].provider);
    console.log('Enabled:', result.rows[0].enabled);
    console.log('\n📋 Configuration Details:');
    console.log('  Application (Client) ID:', configData.azureClientId);
    console.log('  Directory (Tenant) ID:', configData.azureTenantId);
    console.log('  Authentication Method: Azure AD');
    console.log('\n⚠️  IMPORTANT: Make sure to update the following in the script:');
    console.log('  1. azureAccountName: Your Azure Storage Account Name');
    console.log('  2. azureContainer: Your Azure Blob Container Name');
    console.log('  3. azureClientSecret: Your Client Secret from Azure Portal');
    console.log('\n💡 To get the client secret:');
    console.log('   Azure Portal > App registrations > Your app > Certificates & secrets');
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


