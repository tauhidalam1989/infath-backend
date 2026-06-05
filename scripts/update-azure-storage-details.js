require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5432'),
  database: process.env.DB_NAME || 'screen',
  user: process.env.DB_USER || 'screen',
  password: process.env.DB_PASSWORD || 'screen',
});

async function updateAzureStorageDetails() {
  // TODO: Replace these with your actual Azure Storage Account details
  const azureAccountName = process.env.AZURE_STORAGE_ACCOUNT_NAME || 'YOUR_STORAGE_ACCOUNT_NAME';
  const azureContainer = process.env.AZURE_CONTAINER_NAME || 'YOUR_CONTAINER_NAME';

  if (azureAccountName === 'YOUR_STORAGE_ACCOUNT_NAME' || azureContainer === 'YOUR_CONTAINER_NAME') {
    console.error('❌ Error: Please set AZURE_STORAGE_ACCOUNT_NAME and AZURE_CONTAINER_NAME environment variables');
    console.error('   Or update this script with your actual values');
    console.error('\nExample:');
    console.error('  export AZURE_STORAGE_ACCOUNT_NAME="mystorageaccount"');
    console.error('  export AZURE_CONTAINER_NAME="mycontainer"');
    console.error('  node scripts/update-azure-storage-details.js');
    process.exit(1);
  }

  try {
    // Get existing config
    const existingResult = await pool.query(`
      SELECT config_data
      FROM cloud_storage_configs
      WHERE provider = 'azure'
    `);

    if (existingResult.rows.length === 0) {
      console.error('❌ Error: No Azure configuration found. Please run update-azure-config-with-ids.js first.');
      process.exit(1);
    }

    const existingConfig = typeof existingResult.rows[0].config_data === 'string'
      ? JSON.parse(existingResult.rows[0].config_data)
      : existingResult.rows[0].config_data;

    // Update only the storage account name and container
    const updatedConfig = {
      ...existingConfig,
      azureAccountName: azureAccountName,
      azureContainer: azureContainer
    };

    const result = await pool.query(`
      UPDATE cloud_storage_configs
      SET config_data = $1, updated_at = CURRENT_TIMESTAMP
      WHERE provider = 'azure'
      RETURNING *
    `, [JSON.stringify(updatedConfig)]);

    console.log('✅ Azure Storage Account details updated successfully!');
    console.log('\n📋 Updated Configuration:');
    console.log(`  Storage Account Name: ${azureAccountName}`);
    console.log(`  Container Name: ${azureContainer}`);
    console.log(`  Auth Method: ${updatedConfig.azureAuthMethod}`);
    console.log(`  Client ID: ${updatedConfig.azureClientId}`);
    console.log(`  Tenant ID: ${updatedConfig.azureTenantId}`);
  } catch (error) {
    console.error('❌ Error:', error.message);
    throw error;
  } finally {
    await pool.end();
  }
}

updateAzureStorageDetails()
  .then(() => process.exit(0))
  .catch(() => process.exit(1));


