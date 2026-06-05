const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5432'),
  database: process.env.DB_NAME || 'screening_db',
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || 'postgres'
});

async function listUsers() {
  try {
    const result = await pool.query(`
      SELECT id, username, email, is_active, 
             CASE WHEN password_hash IS NULL THEN 'NO' ELSE 'YES' END as has_password,
             LENGTH(password_hash) as password_hash_length
      FROM users
      ORDER BY id
    `);

    console.log('\n📋 Users in Database:');
    console.log('Total users:', result.rows.length);
    console.log('\n');
    
    if (result.rows.length === 0) {
      console.log('No users found in database.');
    } else {
      result.rows.forEach((user, index) => {
        console.log(`${index + 1}. ID: ${user.id}`);
        console.log(`   Username: ${user.username}`);
        console.log(`   Email: ${user.email}`);
        console.log(`   Active: ${user.is_active}`);
        console.log(`   Has Password: ${user.has_password}`);
        if (user.has_password === 'YES') {
          console.log(`   Password Hash Length: ${user.password_hash_length}`);
        }
        console.log('');
      });
    }
    
    await pool.end();
  } catch (error) {
    console.error('Error:', error);
    await pool.end();
  }
}

listUsers();

