const { Pool } = require('pg');
const crypto = require('crypto');
require('dotenv').config();

const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5432'),
  database: process.env.DB_NAME || 'screening_db',
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || 'postgres'
});

function verifyPassword(password, hash) {
  try {
    if (!hash || !password) {
      console.log('Missing hash or password');
      return false;
    }
    
    const [salt, hashValue] = hash.split(':');
    if (!salt || !hashValue) {
      console.log('Invalid hash format');
      return false;
    }
    
    const computedHash = crypto.pbkdf2Sync(password, salt, 10000, 64, 'sha512').toString('hex');
    return computedHash === hashValue;
  } catch (error) {
    console.error('Error verifying password:', error);
    return false;
  }
}

async function checkUserPassword(emailOrUsername, testPassword) {
  try {
    const result = await pool.query(`
      SELECT id, username, email, password_hash, is_active
      FROM users
      WHERE username = $1 OR email = $1
    `, [emailOrUsername]);

    if (result.rows.length === 0) {
      console.log('❌ User not found:', emailOrUsername);
      return;
    }

    const user = result.rows[0];
    console.log('\n📋 User Details:');
    console.log('  ID:', user.id);
    console.log('  Username:', user.username);
    console.log('  Email:', user.email);
    console.log('  Is Active:', user.is_active);
    console.log('  Has Password Hash:', !!user.password_hash);
    
    if (!user.password_hash) {
      console.log('\n❌ User has no password hash!');
      console.log('   The user was likely created without a password.');
      console.log('   You need to update the user with a password.');
      return;
    }

    console.log('  Password Hash Length:', user.password_hash.length);
    console.log('  Password Hash Format:', user.password_hash.substring(0, 50) + '...');
    
    if (testPassword) {
      console.log('\n🔐 Testing Password:', testPassword);
      const isValid = verifyPassword(testPassword, user.password_hash);
      console.log('  Password Valid:', isValid ? '✅ YES' : '❌ NO');
      
      if (!isValid) {
        console.log('\n💡 Possible Issues:');
        console.log('   1. The password stored in DB is different');
        console.log('   2. The password was hashed with different algorithm');
        console.log('   3. The password_hash field might be corrupted');
      }
    }
    
    await pool.end();
  } catch (error) {
    console.error('Error:', error);
    await pool.end();
  }
}

// Get command line arguments
const emailOrUsername = process.argv[2];
const testPassword = process.argv[3];

if (!emailOrUsername) {
  console.log('Usage: node check_user_password.js <email_or_username> [test_password]');
  console.log('Example: node check_user_password.js j@gmail.com 123456');
  process.exit(1);
}

checkUserPassword(emailOrUsername, testPassword);

