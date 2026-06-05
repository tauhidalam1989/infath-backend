/**
 * Script to insert Azure Blob Storage configuration with Azure AD authentication
 * 
 * Usage: node scripts/insert-azure-config.js
 * 
 * Make sure to update the placeholder values:
 * - storageAccountName: Your Azure Storage Account name
 * - containerName: Your Azure Blob Container name
 * - clientSecret: Client secret from Azure Portal
 */

require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5432'),
  database: process.env.DB_NAME || 'screen',
  user: process.env.DB_USER || 'screen',
  password: process.env.DB_PASSWORD || 'screen',
});

async function insertAzureConfig() {
  // TODO: Replace these placeholder values with your actual values
  const storageAccountName = 'YOUR_STORAGE_ACCOUNT_NAME'; // Replace with your Azure Storage Account name
  const containerName = 'YOUR_CONTAINER_NAME'; // Replace with your container name
  const clientSecret = 'YOUR_CLIENT_SECRET'; // Replace with client secret from Azure Portal

  const configData = {
    azureAccountName: storageAccountName,
    azureContainer: containerName,
    azureAuthMethod: 'azure-ad',
    azureClientId: '54a88f72-745d-432f-b63c-b6ac657b0e18',
    azureTenantId: '70ca47a3-3991-4823-8769-6da1f74d05c3',
    azureClientSecret: clientSecret
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

    console.log('✅ Azure configuration inserted/updated successfully!');
    console.log('Configuration:', JSON.stringify(result.rows[0], null, 2));
  } catch (error) {
    console.error('❌ Error inserting Azure configuration:', error);
    throw error;
  } finally {
    await pool.end();
  }
}

insertAzureConfig()
  .then(() => {
    console.log('✅ Script completed successfully');
    process.exit(0);
  })
  .catch((error) => {
    console.error('❌ Script failed:', error);
    process.exit(1);
  });


