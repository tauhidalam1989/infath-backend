// Update SSH credentials using Node.js
// Run: node update_ssh_via_node.js

const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  host: process.env.DB_HOST || '88.222.244.10',
  port: parseInt(process.env.DB_PORT || '5432'),
  database: process.env.DB_NAME || 'screen',
  user: process.env.DB_USER || 'screen',
  password: process.env.DB_PASSWORD || 'screen',
});

async function updateSSHCredentials() {
  try {
    console.log('Updating SSH credentials...');
    
    const result = await pool.query(`
      UPDATE screens 
      SET ssh_username = $1, 
          ssh_password = $2,
          updated_at = CURRENT_TIMESTAMP
      WHERE ip_address = $3
      RETURNING id, name, ip_address, ssh_username
    `, ['jainishali', 'jaaai@19', '192.168.1.7']);
    
    if (result.rows.length > 0) {
      console.log('✅ SSH credentials updated successfully!');
      console.log('Updated screen:', result.rows[0]);
    } else {
      console.log('⚠️  No screen found with IP address 192.168.1.7');
      console.log('Make sure the screen is registered first.');
    }
    
    // Verify
    const verify = await pool.query(`
      SELECT id, name, ip_address, ssh_username,
             CASE WHEN ssh_password IS NOT NULL THEN '***' ELSE NULL END as password_set
      FROM screens 
      WHERE ip_address = $1
    `, ['192.168.1.7']);
    
    if (verify.rows.length > 0) {
      console.log('\n📋 Verification:');
      console.log(verify.rows[0]);
    }
    
    await pool.end();
  } catch (error) {
    console.error('❌ Error updating SSH credentials:', error);
    process.exit(1);
  }
}

updateSSHCredentials();

