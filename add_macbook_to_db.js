// Add MacBook to database as a screen
// Run: node add_macbook_to_db.js

const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  host: process.env.DB_HOST || '88.222.244.10',
  port: parseInt(process.env.DB_PORT || '5432'),
  database: process.env.DB_NAME || 'screen',
  user: process.env.DB_USER || 'screen',
  password: process.env.DB_PASSWORD || 'screen',
});

async function addMacBook() {
  try {
    const macbookIP = '192.168.1.6';
    const deviceId = `dev-${macbookIP.replace(/\./g, '-')}`;
    const deviceName = 'My MacBook';
    const macAddress = '00:00:00:00:00:00'; // Placeholder, will be updated on scan
    
    console.log('Adding MacBook to database...');
    
    // Add as discovered device
    await pool.query(`
      INSERT INTO discovered_devices (id, name, ip_address, mac_address, device_type, status, last_seen, is_registered)
      VALUES ($1, $2, $3, $4, $5, $6, CURRENT_TIMESTAMP, false)
      ON CONFLICT (id) DO UPDATE SET
        name = EXCLUDED.name,
        ip_address = EXCLUDED.ip_address,
        status = EXCLUDED.status,
        last_seen = CURRENT_TIMESTAMP
    `, [deviceId, deviceName, macbookIP, macAddress, 'unknown', 'online']);
    
    console.log('✅ MacBook added as discovered device');
    
    // Register as screen
    const screenResult = await pool.query(`
      INSERT INTO screens (device_id, name, ip_address, mac_address, location, status, last_connected)
      VALUES ($1, $2, $3, $4, $5, 'online', CURRENT_TIMESTAMP)
      ON CONFLICT (device_id) DO UPDATE SET
        name = EXCLUDED.name,
        ip_address = EXCLUDED.ip_address,
        updated_at = CURRENT_TIMESTAMP
      RETURNING id, name, ip_address
    `, [deviceId, deviceName, macbookIP, macAddress, 'Local MacBook']);
    
    console.log('✅ MacBook registered as screen:');
    console.log(screenResult.rows[0]);
    
    await pool.end();
    console.log('\n✅ Done! MacBook is now available in the frontend.');
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

addMacBook();



