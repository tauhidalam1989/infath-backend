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
  const configData = {
    azureAccountName: 'YOUR_STORAGE_ACCOUNT_NAME', // Replace with your Azure Storage Account Name
    azureContainer: 'YOUR_CONTAINER_NAME', // Replace with your Azure Blob Container Name
    azureAuthMethod: 'azure-ad',
    azureClientId: '54a88f72-745d-432f-b63c-b6ac657b0e18',
    azureTenantId: '70ca47a3-3991-4823-8769-6da1f74d05c3',
    azureClientSecret: 'YOUR_CLIENT_SECRET' // Replace with the actual client secret from Azure Portal
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
    console.log('Provider:', result.rows[0].provider);
    console.log('Enabled:', result.rows[0].enabled);
    console.log('Config Data:', JSON.stringify(JSON.parse(result.rows[0].config_data), null, 2));
  } catch (error) {
    console.error('❌ Error:', error.message);
    throw error;
  } finally {
    await pool.end();
  }
}

insertAzureConfig()
  .then(() => process.exit(0))
  .catch(() => process.exit(1));
