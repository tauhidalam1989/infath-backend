require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5432'),
  database: process.env.DB_NAME || 'screen',
  user: process.env.DB_USER || 'screen',
  password: process.env.DB_PASSWORD || 'screen',
});

async function checkAzureConfig() {
  try {
    const result = await pool.query(`
      SELECT provider, enabled, config_data
      FROM cloud_storage_configs
      WHERE provider = $1
    `, ['azure']);

    console.log('Found configs:', result.rows.length);
    if (result.rows.length > 0) {
      const row = result.rows[0];
      console.log('\nProvider:', row.provider);
      console.log('Enabled:', row.enabled);
      console.log('\nConfig Data:');
      const configData = typeof row.config_data === 'string' 
        ? JSON.parse(row.config_data) 
        : row.config_data;
      console.log(JSON.stringify(configData, null, 2));
    } else {
      console.log('No Azure configuration found in database.');
    }
  } catch (error) {
    console.error('Error:', error.message);
  } finally {
    await pool.end();
  }
}

checkAzureConfig();


