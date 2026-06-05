/**
 * Run as: node scripts/run-grant-permissions.js
 * Uses postgres superuser (set POSTGRES_PASSWORD in env, or same as DB_PASSWORD if postgres has it).
 */
const path = require('path');
const fs = require('fs');
const envPath = path.join(__dirname, '..', '.env');
const distEnvPath = path.join(__dirname, '..', 'dist', '.env');
if (fs.existsSync(envPath)) {
  require('dotenv').config({ path: envPath });
} else if (fs.existsSync(distEnvPath)) {
  require('dotenv').config({ path: distEnvPath });
} else {
  console.error('No .env found at', envPath, 'or', distEnvPath);
  process.exit(1);
}

const { Client } = require('pg');

const appUser = (process.env.DB_USER || 'smg').toLowerCase();
const dbName = process.env.DB_NAME || 'screen';
const dbHost = process.env.DB_HOST || 'localhost';
const dbPort = parseInt(process.env.DB_PORT || '5432', 10);
const postgresPassword = process.env.POSTGRES_PASSWORD || process.env.DB_PASSWORD;

async function run() {
  const client = new Client({
    host: dbHost,
    port: dbPort,
    database: dbName,
    user: 'postgres',
    password: postgresPassword
  });
  try {
    await client.connect();
  } catch (e) {
    console.error('Failed to connect as postgres:', e.message);
    console.error('Set POSTGRES_PASSWORD (or ensure postgres uses same as DB_PASSWORD) and try again.');
    process.exit(1);
  }
  // Create role if it doesn't exist (PostgreSQL lowercases unquoted names; DB_USER=SMG -> smg)
  const { rowCount } = await client.query('SELECT 1 FROM pg_roles WHERE rolname = $1', [appUser]);
  if (rowCount === 0) {
    try {
      const pwd = (process.env.DB_PASSWORD || '').replace(/'/g, "''");
      await client.query("CREATE ROLE " + appUser + " WITH LOGIN PASSWORD '" + pwd + "'");
      console.log('Created role:', appUser);
    } catch (e) {
      if (!e.message.includes('already exists')) throw e;
      console.log('Role', appUser, 'already exists');
    }
  } else {
    console.log('Role', appUser, 'exists');
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
      console.log('OK:', q.split(' ON ')[0]);
    } catch (e) {
      console.warn('Skip:', e.message, '(', q.substring(0, 50) + '...)');
    }
  }
  await client.end();
  console.log('Done. App user', appUser, 'should now have access.');
}

run().catch((e) => { console.error(e); process.exit(1); });
