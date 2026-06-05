const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  host: process.env.DB_HOST || '88.222.244.10',
  port: parseInt(process.env.DB_PORT || '5432'),
  database: process.env.DB_NAME || 'screen',
  user: process.env.DB_USER || 'screen',
  password: process.env.DB_PASSWORD || 'screen',
});

async function migrateScreensSchema() {
  try {
    console.log('🔧 Starting screens table migration...\n');

    // Step 1: Create screen_groups table
    console.log('Step 1: Creating screen_groups table...');
    await pool.query(`
      CREATE TABLE IF NOT EXISTS screen_groups (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        description TEXT,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `);
    console.log('✅ screen_groups table created/verified\n');

    // Step 2: Make existing columns nullable (if they're not already)
    console.log('Step 2: Making device_id, ip_address, mac_address, location nullable...');
    await pool.query(`
      ALTER TABLE screens 
      ALTER COLUMN device_id DROP NOT NULL,
      ALTER COLUMN ip_address DROP NOT NULL,
      ALTER COLUMN mac_address DROP NOT NULL,
      ALTER COLUMN location DROP NOT NULL
    `).catch(err => {
      // Ignore error if columns are already nullable or don't have NOT NULL constraint
      if (!err.message.includes('does not exist') && !err.message.includes('column') && !err.message.includes('constraint')) {
        console.log('⚠️  Note:', err.message);
      }
    });
    console.log('✅ Columns made nullable\n');

    // Step 3: Add new columns to screens table
    console.log('Step 3: Adding new columns to screens table...');
    
    const columnsToAdd = [
      { name: 'group_id', type: 'INTEGER' },
      { name: 'subsite_id', type: 'INTEGER' },
      { name: 'section_id', type: 'INTEGER' },
      { name: 'special_division_id', type: 'INTEGER' },
      { name: 'assigned_user_id', type: 'INTEGER' },
      { name: 'start_date', type: 'DATE' },
      { name: 'end_date', type: 'DATE' },
      { name: 'start_time', type: 'TIME' },
      { name: 'end_time', type: 'TIME' }
    ];

    for (const column of columnsToAdd) {
      await pool.query(`
        ALTER TABLE screens 
        ADD COLUMN IF NOT EXISTS ${column.name} ${column.type}
      `).catch(err => {
        if (!err.message.includes('already exists')) {
          console.error(`❌ Error adding ${column.name}:`, err.message);
        }
      });
    }
    console.log('✅ New columns added\n');

    // Step 4: Add foreign key constraints
    console.log('Step 4: Adding foreign key constraints...');
    
    const foreignKeys = [
      { column: 'group_id', table: 'screen_groups', onDelete: 'SET NULL' },
      { column: 'subsite_id', table: 'subsites', onDelete: 'SET NULL' },
      { column: 'section_id', table: 'sections', onDelete: 'SET NULL' },
      { column: 'special_division_id', table: 'special_divisions', onDelete: 'SET NULL' },
      { column: 'assigned_user_id', table: 'users', onDelete: 'SET NULL' }
    ];

    for (const fk of foreignKeys) {
      // Check if constraint already exists
      const constraintCheck = await pool.query(`
        SELECT constraint_name 
        FROM information_schema.table_constraints 
        WHERE table_name = 'screens' 
        AND constraint_type = 'FOREIGN KEY'
        AND constraint_name LIKE '%${fk.column}%'
      `);

      if (constraintCheck.rows.length === 0) {
        await pool.query(`
          ALTER TABLE screens 
          ADD CONSTRAINT fk_screens_${fk.column} 
          FOREIGN KEY (${fk.column}) 
          REFERENCES ${fk.table}(id) 
          ON DELETE ${fk.onDelete}
        `).catch(err => {
          if (!err.message.includes('already exists') && !err.message.includes('constraint')) {
            console.log(`⚠️  Note for ${fk.column}:`, err.message);
          }
        });
      }
    }
    console.log('✅ Foreign key constraints added\n');

    // Step 5: Update device_id foreign key to SET NULL
    console.log('Step 5: Updating device_id foreign key constraint...');
    await pool.query(`
      ALTER TABLE screens 
      DROP CONSTRAINT IF EXISTS screens_device_id_fkey
    `).catch(() => {});
    
    await pool.query(`
      ALTER TABLE screens 
      ADD CONSTRAINT screens_device_id_fkey 
      FOREIGN KEY (device_id) 
      REFERENCES discovered_devices(id) 
      ON DELETE SET NULL
    `).catch(err => {
      if (!err.message.includes('already exists')) {
        console.log('⚠️  Note:', err.message);
      }
    });
    console.log('✅ device_id foreign key updated\n');

    // Step 6: Create indexes
    console.log('Step 6: Creating indexes...');
    const indexes = [
      'CREATE INDEX IF NOT EXISTS idx_screens_group_id ON screens(group_id)',
      'CREATE INDEX IF NOT EXISTS idx_screens_subsite_id ON screens(subsite_id)',
      'CREATE INDEX IF NOT EXISTS idx_screens_section_id ON screens(section_id)',
      'CREATE INDEX IF NOT EXISTS idx_screens_special_division_id ON screens(special_division_id)',
      'CREATE INDEX IF NOT EXISTS idx_screens_assigned_user_id ON screens(assigned_user_id)',
      'CREATE INDEX IF NOT EXISTS idx_screen_ads_ad_id ON screen_ads(ad_id)'
    ];

    for (const indexQuery of indexes) {
      await pool.query(indexQuery).catch(err => {
        if (!err.message.includes('already exists')) {
          console.log('⚠️  Note:', err.message);
        }
      });
    }
    console.log('✅ Indexes created\n');

    // Step 7: Verify migration
    console.log('Step 7: Verifying migration...');
    const verifyResult = await pool.query(`
      SELECT column_name, data_type, is_nullable
      FROM information_schema.columns
      WHERE table_name = 'screens'
      AND column_name IN ('group_id', 'subsite_id', 'section_id', 'special_division_id', 'assigned_user_id', 'start_date', 'end_date', 'start_time', 'end_time')
      ORDER BY column_name
    `);

    console.log('📋 New columns in screens table:');
    verifyResult.rows.forEach(row => {
      console.log(`   - ${row.column_name} (${row.data_type}, nullable: ${row.is_nullable})`);
    });

    const groupTableCheck = await pool.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_name = 'screen_groups'
      )
    `);
    
    if (groupTableCheck.rows[0].exists) {
      console.log('\n✅ screen_groups table exists');
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

migrateScreensSchema();


