const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5432'),
  database: process.env.DB_NAME || 'screen',
  user: process.env.DB_USER || 'screen',
  password: process.env.DB_PASSWORD || 'screen',
});

async function dropDeviceIdForeignKey() {
  try {
    console.log('🔧 Dropping device_id foreign key constraint...\n');

    // Check if constraint exists
    const constraintCheck = await pool.query(`
      SELECT constraint_name 
      FROM information_schema.table_constraints 
      WHERE table_name = 'screens' 
      AND constraint_type = 'FOREIGN KEY'
      AND constraint_name = 'screens_device_id_fkey'
    `);

    if (constraintCheck.rows.length > 0) {
      console.log('Found constraint: screens_device_id_fkey');
      console.log('Dropping constraint...');
      
      await pool.query(`
        ALTER TABLE screens DROP CONSTRAINT screens_device_id_fkey
      `);
      
      console.log('✅ Successfully dropped screens_device_id_fkey constraint\n');
    } else {
      console.log('ℹ️  Constraint screens_device_id_fkey does not exist (may have been already dropped)\n');
    }

    // Verify constraint is gone
    const verifyCheck = await pool.query(`
      SELECT constraint_name 
      FROM information_schema.table_constraints 
      WHERE table_name = 'screens' 
      AND constraint_type = 'FOREIGN KEY'
      AND constraint_name = 'screens_device_id_fkey'
    `);

    if (verifyCheck.rows.length === 0) {
      console.log('✅ Verification: Constraint successfully removed');
    } else {
      console.log('⚠️  Warning: Constraint still exists');
    }

    await pool.end();
    console.log('\n✅ Migration completed successfully!');
  } catch (error) {
    console.error('❌ Migration error:', error.message);
    console.error(error);
    await pool.end();
    process.exit(1);
  }
}

dropDeviceIdForeignKey();

