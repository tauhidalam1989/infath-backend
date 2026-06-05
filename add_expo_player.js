const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  host: process.env.DB_HOST || '88.222.244.10',
  port: parseInt(process.env.DB_PORT || '5432'),
  database: process.env.DB_NAME || 'screen',
  user: process.env.DB_USER || 'screen',
  password: process.env.DB_PASSWORD || 'screen',
});

async function addExpoPlayer() {
  try {
    const deviceId = 'expo-player-001'; // Match with config.ts
    const deviceName = 'Expo Player Device';
    const ipAddress = '10.0.2.2'; // Android emulator IP (or use actual device IP)
    const macAddress = '00:00:00:00:00:00'; // Placeholder
    const location = 'Android Emulator'; // Or 'Physical Device' if using real device
    
    console.log('Adding Expo Player to database...');
    console.log(`Device ID: ${deviceId}`);
    console.log(`Device Name: ${deviceName}`);
    console.log(`IP Address: ${ipAddress}`);
    
    // Add as discovered device
    await pool.query(`
      INSERT INTO discovered_devices (id, name, ip_address, mac_address, device_type, status, last_seen, is_registered)
      VALUES ($1, $2, $3, $4, $5, $6, CURRENT_TIMESTAMP, false)
      ON CONFLICT (id) DO UPDATE SET
        name = EXCLUDED.name,
        ip_address = EXCLUDED.ip_address,
        status = EXCLUDED.status,
        last_seen = CURRENT_TIMESTAMP,
        updated_at = CURRENT_TIMESTAMP
    `, [deviceId, deviceName, ipAddress, macAddress, 'unknown', 'online']);
    
    console.log('✅ Expo Player added as discovered device');
    
    // Register as screen
    const screenResult = await pool.query(`
      INSERT INTO screens (device_id, name, ip_address, mac_address, location, status, last_connected)
      VALUES ($1, $2, $3, $4, $5, 'online', CURRENT_TIMESTAMP)
      ON CONFLICT (device_id) DO UPDATE SET
        name = EXCLUDED.name,
        ip_address = EXCLUDED.ip_address,
        location = EXCLUDED.location,
        status = 'online',
        updated_at = CURRENT_TIMESTAMP
      RETURNING id, device_id, name, ip_address, location
    `, [deviceId, deviceName, ipAddress, macAddress, location]);
    
    console.log('✅ Expo Player registered as screen:');
    console.log(screenResult.rows[0]);
    
    // Mark as registered
    await pool.query(`
      UPDATE discovered_devices 
      SET is_registered = TRUE, updated_at = CURRENT_TIMESTAMP 
      WHERE id = $1
    `, [deviceId]);
    
    console.log('✅ Device marked as registered');
    
    await pool.end();
    console.log('\n✅ Done! Expo Player is now available in the frontend.');
    console.log('\n📱 Next steps:');
    console.log('1. Refresh the frontend page');
    console.log('2. You should see "Expo Player Device" in the device list');
    console.log('3. Click "Play Video" to test');
  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error(error);
    process.exit(1);
  }
}

addExpoPlayer();

