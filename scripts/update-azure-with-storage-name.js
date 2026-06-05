require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5432'),
  database: process.env.DB_NAME || 'screen',
  user: process.env.DB_USER || 'screen',
  password: process.env.DB_PASSWORD || 'screen',
});

async function updateAzureStorageConfig() {
  const azureAccountName = 'mystorageaccount21041989';
  const azureContainer = process.argv[2] || 'advertisements'; // Default to 'advertisements' if not provided

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

    // Update storage account name and container
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

    console.log('✅ Azure Storage configuration updated successfully!');
    console.log('\n📋 Updated Configuration:');
    console.log(`  Storage Account Name: ${azureAccountName}`);
    console.log(`  Container Name: ${azureContainer}`);
    console.log(`  Auth Method: ${updatedConfig.azureAuthMethod}`);
    console.log(`  Client ID: ${updatedConfig.azureClientId}`);
    console.log(`  Tenant ID: ${updatedConfig.azureTenantId}`);
    console.log('\n⚠️  IMPORTANT: Make sure to:');
    console.log('  1. Create the container "' + azureContainer + '" in your Storage Account if it doesn\'t exist');
    console.log('  2. Assign "Storage Blob Data Contributor" role to your Azure AD app in Storage Account IAM');
  } catch (error) {
    console.error('❌ Error:', error.message);
    throw error;
  } finally {
    await pool.end();
  }
}

updateAzureStorageConfig()
  .then(() => process.exit(0))
  .catch(() => process.exit(1));


