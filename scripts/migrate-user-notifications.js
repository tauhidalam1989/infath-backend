const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5432'),
  database: process.env.DB_NAME || 'screen',
  user: process.env.DB_USER || 'screen',
  password: process.env.DB_PASSWORD || 'screen',
});

async function migrateUserNotifications() {
  try {
    console.log('🔧 Creating user_notifications table...\n');

    // Create user_notifications table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS user_notifications (
        id SERIAL PRIMARY KEY,
        notification_id INTEGER NOT NULL,
        user_id INTEGER NOT NULL,
        is_read BOOLEAN NOT NULL DEFAULT FALSE,
        read_at TIMESTAMP,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (notification_id) REFERENCES notifications(id) ON DELETE CASCADE,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
        UNIQUE(notification_id, user_id)
      )
    `);
    console.log('✅ Successfully created user_notifications table');

    // Create indexes for better performance
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_user_notifications_user_id ON user_notifications(user_id);
    `);
    console.log('✅ Created index on user_id');

    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_user_notifications_notification_id ON user_notifications(notification_id);
    `);
    console.log('✅ Created index on notification_id');

    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_user_notifications_is_read ON user_notifications(is_read);
    `);
    console.log('✅ Created index on is_read');

    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_user_notifications_created_at ON user_notifications(created_at);
    `);
    console.log('✅ Created index on created_at');

    // Verify table exists
    const checkTable = await pool.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_name = 'user_notifications'
      );
    `);
    
    if (checkTable.rows[0].exists) {
      console.log('\n✅ Verification: user_notifications table exists');
      
      // Get table info
      const tableInfo = await pool.query(`
        SELECT column_name, data_type, is_nullable
        FROM information_schema.columns
        WHERE table_name = 'user_notifications'
        ORDER BY ordinal_position;
      `);
      
      console.log('\n📋 Table structure:');
      tableInfo.rows.forEach(col => {
        console.log(`   - ${col.column_name}: ${col.data_type} ${col.is_nullable === 'NO' ? '(NOT NULL)' : ''}`);
      });
    } else {
      console.log('\n❌ Warning: Table verification failed');
    }

    await pool.end();
    console.log('\n✅ Migration completed successfully!');
    console.log('💡 Note: The table will also be created automatically on server startup.');
  } catch (error) {
    console.error('❌ Migration error:', error.message);
    console.error(error);
    await pool.end();
    process.exit(1);
  }
}

migrateUserNotifications();

