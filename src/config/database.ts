import { Pool, PoolConfig, Client } from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const dbConfig: PoolConfig = {
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5432'),
  database: process.env.DB_NAME || 'screen',
  user: process.env.DB_USER || 'screen',
  password: process.env.DB_PASSWORD || 'screen',
  max: 20, // Maximum number of clients in the pool
  idleTimeoutMillis: 30000, // Close idle clients after 30 seconds
  connectionTimeoutMillis: 20000, // Increased to 20 seconds for better reliability
  statement_timeout: 30000, // Query timeout
  query_timeout: 30000, // Query timeout
  keepAlive: true, // Enable TCP keep-alive
  keepAliveInitialDelayMillis: 10000, // Start keep-alive after 10 seconds
  // Add retry logic for connection errors
  allowExitOnIdle: false, // Don't exit when pool is idle
};

// Create connection pool
export const pool = new Pool(dbConfig);

// Test database connection
pool.on('connect', () => {
  console.log('✅ Connected to PostgreSQL database');
});

pool.on('error', (err: Error & { code?: string }) => {
  console.error('❌ Database pool error:', err.message);
  if (err.code) {
    console.error('Error code:', err.code);
  }
  
  // Don't crash the server on connection errors
  // The pool will handle reconnection automatically
  if (err.code === 'ETIMEDOUT' || err.code === 'ECONNREFUSED') {
    console.warn('⚠️ Database connection issue. Server will continue running.');
    console.warn('⚠️ Some database operations may fail until connection is restored.');
  } else {
    // For other errors, log but don't exit
    console.error('⚠️ Database error occurred, but server will continue running.');
  }
});

// Test connection function
export async function testConnection(): Promise<boolean> {
  try {
    const result = await pool.query('SELECT NOW()');
    console.log('📊 Database connection test successful:', result.rows[0]);
    return true;
  } catch (error: unknown) {
    const dbError = error as Error & { code?: string };
    console.error('❌ Database connection test failed:', dbError.message);
    if (dbError.code) {
      console.error('Error code:', dbError.code);
    }
    
    // Provide helpful error messages
    if (dbError.code === 'ETIMEDOUT') {
      console.error('💡 Connection timeout. Check:');
      console.error('   - Database server is running');
      console.error('   - Network connectivity');
      console.error('   - Firewall settings');
      console.error('   - Database host and port are correct');
    } else if (dbError.code === 'ECONNREFUSED') {
      console.error('💡 Connection refused. Check:');
      console.error('   - Database server is running');
      console.error('   - Database host and port are correct');
    }
    
    return false;
  }
}

/**
 * Run GRANTs as postgres superuser so the app user can access screen_regions etc.
 * Call from GET /api/admin/grant-db?secret=GRANT_DB_SECRET (one-time fix for permission denied).
 */
export async function runGrantPermissions(): Promise<{ ok: boolean; message: string; detail?: string[] }> {
  const appUser = (process.env.DB_USER || 'smg').toLowerCase();
  const postgresPassword = process.env.POSTGRES_PASSWORD || process.env.DB_PASSWORD;
  if (!postgresPassword) {
    return { ok: false, message: 'POSTGRES_PASSWORD or DB_PASSWORD required to run as postgres' };
  }
  const client = new Client({
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '5432', 10),
    database: process.env.DB_NAME || 'screen',
    user: 'postgres',
    password: postgresPassword
  });
  const detail: string[] = [];
  try {
    await client.connect();
  } catch (e) {
    const err = e as Error;
    return { ok: false, message: 'Failed to connect as postgres: ' + err.message };
  }
  try {
    const { rowCount } = await client.query('SELECT 1 FROM pg_roles WHERE rolname = $1', [appUser]);
    if (rowCount === 0) {
      const pwd = (process.env.DB_PASSWORD || '').replace(/'/g, "''");
      await client.query("CREATE ROLE " + appUser + " WITH LOGIN PASSWORD '" + pwd + "'");
      detail.push('Created role ' + appUser);
    }
    const statements = [
      'GRANT USAGE ON SCHEMA public TO ' + appUser,
      'GRANT SELECT, INSERT, UPDATE, DELETE ON screen_regions TO ' + appUser,
      'GRANT USAGE, SELECT ON SEQUENCE screen_regions_id_seq TO ' + appUser,
      'GRANT SELECT, INSERT, UPDATE, DELETE ON advertisement_schedules TO ' + appUser,
      'GRANT USAGE, SELECT ON SEQUENCE advertisement_schedules_id_seq TO ' + appUser,
      'GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO ' + appUser,
      'GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO ' + appUser
    ];
    for (const q of statements) {
      try {
        await client.query(q);
        detail.push('OK: ' + q.split(' ON ')[0]);
      } catch (err) {
        const e = err as Error;
        detail.push('Skip: ' + e.message);
      }
    }
    return { ok: true, message: 'Grants applied for ' + appUser, detail };
  } finally {
    await client.end();
  }
}

// Initialize database tables
export async function initializeDatabase(): Promise<void> {
  try {
    console.log('🔧 Initializing database tables...');

    // Create discovered_devices table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS discovered_devices (
        id VARCHAR(255) PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        ip_address VARCHAR(45) NOT NULL,
        mac_address VARCHAR(17) NOT NULL,
        device_type VARCHAR(50) NOT NULL DEFAULT 'unknown',
        status VARCHAR(20) NOT NULL DEFAULT 'offline',
        last_seen TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        is_registered BOOLEAN NOT NULL DEFAULT FALSE,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS screen_groups (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        description TEXT,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Create subsites (sub_locations) table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS subsites (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        address TEXT NOT NULL,
        type VARCHAR(50) NOT NULL,
        status VARCHAR(20) NOT NULL DEFAULT 'active',
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Create sections table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS sections (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        code VARCHAR(50) NOT NULL UNIQUE,
        type VARCHAR(50) NOT NULL,
        status VARCHAR(50) NOT NULL DEFAULT 'active',
        description TEXT,
        location VARCHAR(255) NOT NULL,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Create special_divisions table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS special_divisions (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        code VARCHAR(50) NOT NULL UNIQUE,
        category VARCHAR(50) NOT NULL DEFAULT 'government',
        priority VARCHAR(20) NOT NULL DEFAULT 'medium',
        description TEXT,
        location VARCHAR(255) NOT NULL,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Create users table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        username VARCHAR(255) NOT NULL UNIQUE,
        email VARCHAR(255) NOT NULL UNIQUE,
        password_hash VARCHAR(255),
        phone1 VARCHAR(20) NOT NULL,
        phone2 VARCHAR(20),
        subsite_id INTEGER,
        section_id INTEGER,
        special_division_id INTEGER,
        user_type VARCHAR(50) NOT NULL DEFAULT 'regular-user',
        validity VARCHAR(50) NOT NULL DEFAULT 'coordinator',
        notes TEXT,
        is_active BOOLEAN NOT NULL DEFAULT TRUE,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (subsite_id) REFERENCES subsites(id) ON DELETE SET NULL,
        FOREIGN KEY (section_id) REFERENCES sections(id) ON DELETE SET NULL,
        FOREIGN KEY (special_division_id) REFERENCES special_divisions(id) ON DELETE SET NULL
      )
    `);

    // Add 2FA columns to users if they don't exist
    await pool.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='users' AND column_name='two_factor_secret') THEN
          ALTER TABLE users ADD COLUMN two_factor_secret VARCHAR(255);
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='users' AND column_name='two_factor_enabled') THEN
          ALTER TABLE users ADD COLUMN two_factor_enabled BOOLEAN NOT NULL DEFAULT FALSE;
        END IF;
      END $$;
    `);

    // Create cloud_storage_configs table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS cloud_storage_configs (
        id SERIAL PRIMARY KEY,
        provider VARCHAR(50) NOT NULL DEFAULT 'local',
        enabled BOOLEAN NOT NULL DEFAULT false,
        config_data JSONB,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(provider)
      )
    `);

    // Create advertisements table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS advertisements (
        id SERIAL PRIMARY KEY,
        title VARCHAR(255) NOT NULL,
        description TEXT,
        type VARCHAR(50) NOT NULL,
        file_url TEXT NOT NULL,
        file_name VARCHAR(255) NOT NULL,
        file_size BIGINT NOT NULL,
        mime_type VARCHAR(100) NOT NULL,
        thumbnail_url TEXT,
        status VARCHAR(20) NOT NULL DEFAULT 'draft',
        start_date DATE,
        end_date DATE,
        subsite_id INTEGER,
        section_id INTEGER,
        special_division_id INTEGER,
        assigned_to_user_id INTEGER,
        created_by INTEGER,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (subsite_id) REFERENCES subsites(id) ON DELETE SET NULL,
        FOREIGN KEY (section_id) REFERENCES sections(id) ON DELETE SET NULL,
        FOREIGN KEY (special_division_id) REFERENCES special_divisions(id) ON DELETE SET NULL,
        FOREIGN KEY (assigned_to_user_id) REFERENCES users(id) ON DELETE SET NULL,
        FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
      )
    `);

    // Create screens table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS screens (
        id SERIAL PRIMARY KEY,
        device_id VARCHAR(255) UNIQUE,
        name VARCHAR(255) NOT NULL,
        ip_address VARCHAR(45),
        mac_address VARCHAR(17),
        location VARCHAR(255),
        status VARCHAR(20) NOT NULL DEFAULT 'offline',
        last_connected TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        current_video_url TEXT,
        current_video_title VARCHAR(255),
        video_started_at TIMESTAMP,
        ssh_username VARCHAR(100),
        ssh_password VARCHAR(255),
        group_id INTEGER,
        subsite_id INTEGER,
        section_id INTEGER,
        special_division_id INTEGER,
        assigned_user_id INTEGER,
        start_date DATE,
        end_date DATE,
        start_time TIME,
        end_time TIME,
        orientation VARCHAR(20),
        screen_size VARCHAR(20),
        screen_width INTEGER,
        screen_height INTEGER,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (group_id) REFERENCES screen_groups(id) ON DELETE SET NULL,
        FOREIGN KEY (subsite_id) REFERENCES subsites(id) ON DELETE SET NULL,
        FOREIGN KEY (section_id) REFERENCES sections(id) ON DELETE SET NULL,
        FOREIGN KEY (special_division_id) REFERENCES special_divisions(id) ON DELETE SET NULL,
        FOREIGN KEY (assigned_user_id) REFERENCES users(id) ON DELETE SET NULL
      )
    `);

    // Drop the device_id foreign key constraint if it exists (we're using IP addresses now, not discovered_devices)
    await pool.query(`
      DO $$ 
      BEGIN
        IF EXISTS (
          SELECT 1 FROM pg_constraint 
          WHERE conname = 'screens_device_id_fkey'
        ) THEN
          ALTER TABLE screens DROP CONSTRAINT screens_device_id_fkey;
          RAISE NOTICE 'Dropped screens_device_id_fkey constraint';
        END IF;
      END $$;
    `).catch(err => {
      // Ignore error if constraint doesn't exist
      if (!err.message.includes('does not exist') && !err.message.includes('constraint')) {
        console.log('Note: Could not drop device_id foreign key constraint:', err.message);
      }
    });

    // screens: display settings (orientation, size) for player layout
    await pool.query(`
      ALTER TABLE screens ADD COLUMN IF NOT EXISTS orientation VARCHAR(20)
    `);
    await pool.query(`
      ALTER TABLE screens ADD COLUMN IF NOT EXISTS screen_size VARCHAR(20)
    `);
    await pool.query(`
      ALTER TABLE screens ADD COLUMN IF NOT EXISTS screen_width INTEGER
    `);
    await pool.query(`
      ALTER TABLE screens ADD COLUMN IF NOT EXISTS screen_height INTEGER
    `);

    // Create screen_ads table (for assigned advertisements)
    await pool.query(`
      CREATE TABLE IF NOT EXISTS screen_ads (
        id SERIAL PRIMARY KEY,
        screen_id INTEGER NOT NULL,
        ad_id INTEGER NOT NULL,
        assigned_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (screen_id) REFERENCES screens(id) ON DELETE CASCADE,
        UNIQUE(screen_id, ad_id)
      )
    `);
    
    // Add UNIQUE constraint if table already exists but constraint doesn't
    await pool.query(`
      DO $$ 
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint 
          WHERE conname = 'screen_ads_screen_id_ad_id_key'
        ) THEN
          ALTER TABLE screen_ads ADD CONSTRAINT screen_ads_screen_id_ad_id_key UNIQUE(screen_id, ad_id);
        END IF;
      END $$;
    `).catch(err => {
      // Ignore error if constraint already exists or table doesn't exist
      if (!err.message.includes('already exists') && !err.message.includes('does not exist')) {
        console.log('Note: Could not add UNIQUE constraint:', err.message);
      }
    });

    // screen_ads: playlist order + per-slide duration (dashboard slider timing)
    try {
      await pool.query(`
        ALTER TABLE screen_ads ADD COLUMN IF NOT EXISTS sort_order INTEGER NOT NULL DEFAULT 0
      `);
      await pool.query(`
        ALTER TABLE screen_ads ADD COLUMN IF NOT EXISTS slide_duration_seconds INTEGER NOT NULL DEFAULT 5
      `);
      await pool.query(`
        UPDATE screen_ads sa
        SET sort_order = sub.rn
        FROM (
          SELECT id, ROW_NUMBER() OVER (PARTITION BY screen_id ORDER BY assigned_at ASC, id ASC) AS rn
          FROM screen_ads
        ) sub
        WHERE sa.id = sub.id
      `);
    } catch (e: unknown) {
      const err = e as Error;
      if (!err.message?.includes('does not exist')) {
        console.log('Note: screen_ads playlist columns:', err.message);
      }
    }

    // Create screen_regions table (for screen division into multiple areas)
    await pool.query(`
      CREATE TABLE IF NOT EXISTS screen_regions (
        id SERIAL PRIMARY KEY,
        screen_id INTEGER NOT NULL,
        region_type VARCHAR(20) NOT NULL DEFAULT 'split_horizontal',
        region_position VARCHAR(20) NOT NULL,
        width_percentage DECIMAL(5,2) NOT NULL DEFAULT 50.00,
        height_percentage DECIMAL(5,2) NOT NULL DEFAULT 50.00,
        x_position DECIMAL(5,2) NOT NULL DEFAULT 0.00,
        y_position DECIMAL(5,2) NOT NULL DEFAULT 0.00,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (screen_id) REFERENCES screens(id) ON DELETE CASCADE,
        UNIQUE(screen_id, region_position)
      )
    `);

    // Create advertisement_schedules table (for scheduling each advertisement on a screen)
    await pool.query(`
      CREATE TABLE IF NOT EXISTS advertisement_schedules (
        id SERIAL PRIMARY KEY,
        screen_id INTEGER NOT NULL,
        ad_id INTEGER NOT NULL,
        region_id INTEGER,
        start_date DATE,
        end_date DATE,
        start_time TIME,
        end_time TIME,
        is_active BOOLEAN NOT NULL DEFAULT true,
        priority INTEGER NOT NULL DEFAULT 0,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (screen_id) REFERENCES screens(id) ON DELETE CASCADE,
        FOREIGN KEY (ad_id) REFERENCES advertisements(id) ON DELETE CASCADE,
        FOREIGN KEY (region_id) REFERENCES screen_regions(id) ON DELETE SET NULL
      )
    `);

    // Create indexes for new tables (skip on permission error, e.g. not owner of table)
    try {
      await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_screen_regions_screen_id ON screen_regions(screen_id);
      CREATE INDEX IF NOT EXISTS idx_advertisement_schedules_screen_id ON advertisement_schedules(screen_id);
      CREATE INDEX IF NOT EXISTS idx_advertisement_schedules_ad_id ON advertisement_schedules(ad_id);
      CREATE INDEX IF NOT EXISTS idx_advertisement_schedules_region_id ON advertisement_schedules(region_id);
      CREATE INDEX IF NOT EXISTS idx_advertisement_schedules_active ON advertisement_schedules(is_active);
    `);
    } catch (idxErr: unknown) {
      const err = idxErr as Error & { code?: string };
      if (err.code === '42501') {
        console.warn('⚠️ Skipping index creation (insufficient privilege; tables may be owned by another user). Server will continue.');
      } else {
        throw idxErr;
      }
    }

    // Create user_permissions table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS user_permissions (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL UNIQUE,
        add_modify_accounts BOOLEAN NOT NULL DEFAULT FALSE,
        view_accounts BOOLEAN NOT NULL DEFAULT FALSE,
        delete_accounts BOOLEAN NOT NULL DEFAULT FALSE,
        add_modify_ads BOOLEAN NOT NULL DEFAULT FALSE,
        display_ads BOOLEAN NOT NULL DEFAULT FALSE,
        delete_ads BOOLEAN NOT NULL DEFAULT FALSE,
        add_modify_sites BOOLEAN NOT NULL DEFAULT FALSE,
        view_sites BOOLEAN NOT NULL DEFAULT FALSE,
        delete_sites BOOLEAN NOT NULL DEFAULT FALSE,
        notification_sending BOOLEAN NOT NULL DEFAULT FALSE,
        notification_viewing BOOLEAN NOT NULL DEFAULT FALSE,
        notification_deletion BOOLEAN NOT NULL DEFAULT FALSE,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      )
    `);

    // Create notification_settings table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS notification_settings (
        id SERIAL PRIMARY KEY,
        user_id INTEGER,
        system_updates_email BOOLEAN NOT NULL DEFAULT TRUE,
        system_updates_sms BOOLEAN NOT NULL DEFAULT FALSE,
        system_updates_push BOOLEAN NOT NULL DEFAULT TRUE,
        system_updates_whatsapp BOOLEAN NOT NULL DEFAULT FALSE,
        security_alerts_email BOOLEAN NOT NULL DEFAULT TRUE,
        security_alerts_sms BOOLEAN NOT NULL DEFAULT TRUE,
        security_alerts_push BOOLEAN NOT NULL DEFAULT TRUE,
        security_alerts_whatsapp BOOLEAN NOT NULL DEFAULT TRUE,
        new_messages_email BOOLEAN NOT NULL DEFAULT FALSE,
        new_messages_sms BOOLEAN NOT NULL DEFAULT FALSE,
        new_messages_push BOOLEAN NOT NULL DEFAULT TRUE,
        new_messages_whatsapp BOOLEAN NOT NULL DEFAULT FALSE,
        reminders_email BOOLEAN NOT NULL DEFAULT TRUE,
        reminders_sms BOOLEAN NOT NULL DEFAULT FALSE,
        reminders_push BOOLEAN NOT NULL DEFAULT TRUE,
        reminders_whatsapp BOOLEAN NOT NULL DEFAULT FALSE,
        marketing_email BOOLEAN NOT NULL DEFAULT FALSE,
        marketing_sms BOOLEAN NOT NULL DEFAULT FALSE,
        marketing_push BOOLEAN NOT NULL DEFAULT FALSE,
        marketing_whatsapp BOOLEAN NOT NULL DEFAULT FALSE,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
        UNIQUE(user_id)
      )
    `);

    // Create notifications table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS notifications (
        id SERIAL PRIMARY KEY,
        title VARCHAR(255) NOT NULL,
        type VARCHAR(50) NOT NULL DEFAULT 'normal',
        message TEXT NOT NULL,
        category VARCHAR(50) NOT NULL DEFAULT 'general',
        priority VARCHAR(20) NOT NULL DEFAULT 'medium',
        status VARCHAR(20) NOT NULL DEFAULT 'draft',
        content TEXT,
        send_to_all BOOLEAN NOT NULL DEFAULT FALSE,
        subsite_id INTEGER,
        section_id INTEGER,
        special_division_id INTEGER,
        scheduled_date DATE,
        scheduled_time TIME,
        sent_at TIMESTAMP,
        created_by INTEGER,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (subsite_id) REFERENCES subsites(id) ON DELETE SET NULL,
        FOREIGN KEY (section_id) REFERENCES sections(id) ON DELETE SET NULL,
        FOREIGN KEY (special_division_id) REFERENCES special_divisions(id) ON DELETE SET NULL,
        FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
      )
    `);

    // Create user_notifications table to link notifications to specific users
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

    // Create whatsapp_templates table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS whatsapp_templates (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        category VARCHAR(50) NOT NULL DEFAULT 'system-updates',
        content TEXT NOT NULL,
        variables TEXT[] DEFAULT ARRAY[]::TEXT[],
        status VARCHAR(20) NOT NULL DEFAULT 'active',
        usage_count INTEGER NOT NULL DEFAULT 0,
        last_used TIMESTAMP,
        created_by INTEGER,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
      )
    `);

    // Create whatsapp_messages table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS whatsapp_messages (
        id SERIAL PRIMARY KEY,
        template_id INTEGER,
        recipient_phone VARCHAR(20) NOT NULL,
        recipient_name VARCHAR(255),
        recipient_user_id INTEGER,
        message_type VARCHAR(50) NOT NULL DEFAULT 'template',
        message_content TEXT NOT NULL,
        variables JSONB,
        status VARCHAR(50) NOT NULL DEFAULT 'pending',
        sent_at TIMESTAMP,
        delivered_at TIMESTAMP,
        failed_at TIMESTAMP,
        error_message TEXT,
        created_by INTEGER,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (template_id) REFERENCES whatsapp_templates(id) ON DELETE SET NULL,
        FOREIGN KEY (recipient_user_id) REFERENCES users(id) ON DELETE SET NULL,
        FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
      )
    `);

    // Create notification_channel_configs table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS notification_channel_configs (
        id SERIAL PRIMARY KEY,
        channel_type VARCHAR(50) NOT NULL UNIQUE,
        is_enabled BOOLEAN NOT NULL DEFAULT TRUE,
        config_data JSONB NOT NULL DEFAULT '{}',
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        created_by INTEGER,
        FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
      )
    `);

    // Insert default channel configurations
    await pool.query(`
      INSERT INTO notification_channel_configs (channel_type, is_enabled, config_data)
      VALUES 
        ('email', TRUE, '{"smtp_host": "", "smtp_port": 587, "smtp_secure": false, "smtp_user": "", "smtp_password": "", "from_email": "", "from_name": ""}'),
        ('sms', FALSE, '{"provider": "", "api_key": "", "api_secret": "", "sender_id": ""}'),
        ('push', FALSE, '{"provider": "", "server_key": "", "project_id": "", "service_account": ""}'),
        ('whatsapp', FALSE, '{"provider": "", "api_key": "", "api_secret": "", "phone_number_id": "", "business_account_id": ""}')
      ON CONFLICT (channel_type) DO NOTHING
    `);

    // Create indexes for better performance
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_discovered_devices_ip ON discovered_devices(ip_address);
      CREATE INDEX IF NOT EXISTS idx_discovered_devices_mac ON discovered_devices(mac_address);
      CREATE INDEX IF NOT EXISTS idx_screens_device_id ON screens(device_id);
      CREATE INDEX IF NOT EXISTS idx_screens_ip ON screens(ip_address);
      CREATE INDEX IF NOT EXISTS idx_screens_group_id ON screens(group_id);
      CREATE INDEX IF NOT EXISTS idx_screens_subsite_id ON screens(subsite_id);
      CREATE INDEX IF NOT EXISTS idx_screens_section_id ON screens(section_id);
      CREATE INDEX IF NOT EXISTS idx_screens_special_division_id ON screens(special_division_id);
      CREATE INDEX IF NOT EXISTS idx_screens_assigned_user_id ON screens(assigned_user_id);
      CREATE INDEX IF NOT EXISTS idx_screen_ads_screen_id ON screen_ads(screen_id);
      CREATE INDEX IF NOT EXISTS idx_screen_ads_ad_id ON screen_ads(ad_id);
      CREATE INDEX IF NOT EXISTS idx_subsites_status ON subsites(status);
      CREATE INDEX IF NOT EXISTS idx_sections_code ON sections(code);
      CREATE INDEX IF NOT EXISTS idx_sections_status ON sections(status);
      CREATE INDEX IF NOT EXISTS idx_special_divisions_code ON special_divisions(code);
      CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
      CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);
      CREATE INDEX IF NOT EXISTS idx_users_is_active ON users(is_active);
      CREATE INDEX IF NOT EXISTS idx_notification_settings_user_id ON notification_settings(user_id);
      CREATE INDEX IF NOT EXISTS idx_notifications_status ON notifications(status);
      CREATE INDEX IF NOT EXISTS idx_notifications_type ON notifications(type);
      CREATE INDEX IF NOT EXISTS idx_notifications_category ON notifications(category);
      CREATE INDEX IF NOT EXISTS idx_notifications_created_at ON notifications(created_at);
      CREATE INDEX IF NOT EXISTS idx_notifications_scheduled_date ON notifications(scheduled_date);
      CREATE INDEX IF NOT EXISTS idx_notifications_send_to_all ON notifications(send_to_all);
      CREATE INDEX IF NOT EXISTS idx_user_notifications_user_id ON user_notifications(user_id);
      CREATE INDEX IF NOT EXISTS idx_user_notifications_notification_id ON user_notifications(notification_id);
      CREATE INDEX IF NOT EXISTS idx_user_notifications_is_read ON user_notifications(is_read);
      CREATE INDEX IF NOT EXISTS idx_user_notifications_created_at ON user_notifications(created_at);
      CREATE INDEX IF NOT EXISTS idx_whatsapp_templates_category ON whatsapp_templates(category);
      CREATE INDEX IF NOT EXISTS idx_whatsapp_templates_status ON whatsapp_templates(status);
      CREATE INDEX IF NOT EXISTS idx_whatsapp_templates_created_at ON whatsapp_templates(created_at);
      CREATE INDEX IF NOT EXISTS idx_whatsapp_messages_status ON whatsapp_messages(status);
      CREATE INDEX IF NOT EXISTS idx_whatsapp_messages_template_id ON whatsapp_messages(template_id);
      CREATE INDEX IF NOT EXISTS idx_whatsapp_messages_recipient_user_id ON whatsapp_messages(recipient_user_id);
      CREATE INDEX IF NOT EXISTS idx_whatsapp_messages_created_at ON whatsapp_messages(created_at);
      CREATE INDEX IF NOT EXISTS idx_notification_channel_configs_channel_type ON notification_channel_configs(channel_type);
    `);

    // Create system_logs table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS system_logs (
        id SERIAL PRIMARY KEY,
        level VARCHAR(20) NOT NULL DEFAULT 'info',
        module VARCHAR(100) NOT NULL,
        action VARCHAR(100) NOT NULL,
        message TEXT NOT NULL,
        details JSONB,
        user_id INTEGER,
        ip_address VARCHAR(45),
        user_agent TEXT,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
      )
    `);

    // Create indexes for system_logs
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_system_logs_level ON system_logs(level);
      CREATE INDEX IF NOT EXISTS idx_system_logs_module ON system_logs(module);
      CREATE INDEX IF NOT EXISTS idx_system_logs_action ON system_logs(action);
      CREATE INDEX IF NOT EXISTS idx_system_logs_user_id ON system_logs(user_id);
      CREATE INDEX IF NOT EXISTS idx_system_logs_created_at ON system_logs(created_at);
    `);

    // Create indexes for advertisements
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_advertisements_type ON advertisements(type);
      CREATE INDEX IF NOT EXISTS idx_advertisements_status ON advertisements(status);
      CREATE INDEX IF NOT EXISTS idx_advertisements_subsite_id ON advertisements(subsite_id);
      CREATE INDEX IF NOT EXISTS idx_advertisements_section_id ON advertisements(section_id);
      CREATE INDEX IF NOT EXISTS idx_advertisements_special_division_id ON advertisements(special_division_id);
      CREATE INDEX IF NOT EXISTS idx_advertisements_assigned_to_user_id ON advertisements(assigned_to_user_id);
      CREATE INDEX IF NOT EXISTS idx_advertisements_created_by ON advertisements(created_by);
      CREATE INDEX IF NOT EXISTS idx_advertisements_created_at ON advertisements(created_at);
    `);

    console.log('✅ Database tables initialized successfully');
  } catch (error) {
    console.error('❌ Error initializing database:', error);
    throw error;
  }
}

