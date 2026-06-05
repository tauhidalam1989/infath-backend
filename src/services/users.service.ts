import { pool } from '../config/database';
import { User, UserPermissions, UserWithPermissions } from '../types/user.types';
import * as crypto from 'crypto';

/**
 * Hash a password using PBKDF2
 */
function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.pbkdf2Sync(password, salt, 10000, 64, 'sha512').toString('hex');
  return `${salt}:${hash}`;
}

/**
 * Verify a password against a hash
 */
function verifyPassword(password: string, hash: string): boolean {
  try {
    if (!hash || !password) {
      console.log('Password verification: Missing hash or password');
      return false;
    }
    
    const [salt, hashValue] = hash.split(':');
    if (!salt || !hashValue) {
      console.log('Password verification: Invalid hash format (missing salt or hash)');
      console.log('Hash format:', hash.substring(0, 50) + '...');
      return false;
    }
    
    const computedHash = crypto.pbkdf2Sync(password, salt, 10000, 64, 'sha512').toString('hex');
    const isValid = computedHash === hashValue;
    
    if (!isValid) {
      console.log('Password verification failed:');
      console.log('  Provided password length:', password.length);
      console.log('  Salt length:', salt.length);
      console.log('  Stored hash length:', hashValue.length);
      console.log('  Computed hash length:', computedHash.length);
    }
    
    return isValid;
  } catch (error) {
    console.error('Error verifying password:', error);
    return false;
  }
}

/**
 * Get all users with their permissions and location names
 */
export async function getUsers(): Promise<UserWithPermissions[]> {
  try {
    const result = await pool.query(`
      SELECT 
        u.id,
        u.username,
        u.email,
        u.phone1,
        u.phone2,
        u.subsite_id as "subsiteId",
        u.section_id as "sectionId",
        u.special_division_id as "specialDivisionId",
        u.user_type as "userType",
        u.validity,
        u.notes,
        u.is_active as "isActive",
        u.created_at as "createdAt",
        u.updated_at as "updatedAt",
        s.name as subsite_name,
        sec.name as section_name,
        sd.name as special_division_name,
        up.id as permission_id,
        up.add_modify_accounts as "addModifyAccounts",
        up.view_accounts as "viewAccounts",
        up.delete_accounts as "deleteAccounts",
        up.add_modify_ads as "addModifyAds",
        up.display_ads as "displayAds",
        up.delete_ads as "deleteAds",
        up.add_modify_sites as "addModifySites",
        up.view_sites as "viewSites",
        up.delete_sites as "deleteSites",
        up.notification_sending as "notificationSending",
        up.notification_viewing as "notificationViewing",
        up.notification_deletion as "notificationDeletion"
      FROM users u
      LEFT JOIN subsites s ON u.subsite_id = s.id
      LEFT JOIN sections sec ON u.section_id = sec.id
      LEFT JOIN special_divisions sd ON u.special_division_id = sd.id
      LEFT JOIN user_permissions up ON u.id = up.user_id
      ORDER BY u.created_at DESC
    `);

    return result.rows.map(row => ({
      id: row.id,
      username: row.username,
      email: row.email,
      phone1: row.phone1,
      phone2: row.phone2 || undefined,
      subsiteId: row.subsiteId || undefined,
      sectionId: row.sectionId || undefined,
      specialDivisionId: row.specialDivisionId || undefined,
      userType: row.userType,
      validity: row.validity,
      notes: row.notes || undefined,
      isActive: row.isActive,
      createdAt: new Date(row.createdAt),
      updatedAt: new Date(row.updatedAt),
      subsiteName: row.subsite_name || undefined,
      sectionName: row.section_name || undefined,
      specialDivisionName: row.special_division_name || undefined,
      permissions: row.permission_id ? {
        id: row.permission_id,
        userId: row.id,
        addModifyAccounts: row.addModifyAccounts,
        viewAccounts: row.viewAccounts,
        deleteAccounts: row.deleteAccounts,
        addModifyAds: row.addModifyAds,
        displayAds: row.displayAds,
        deleteAds: row.deleteAds,
        addModifySites: row.addModifySites,
        viewSites: row.viewSites,
        deleteSites: row.deleteSites,
        notificationSending: row.notificationSending,
        notificationViewing: row.notificationViewing,
        notificationDeletion: row.notificationDeletion,
        createdAt: new Date(row.createdAt),
        updatedAt: new Date(row.updatedAt)
      } : undefined
    }));
  } catch (error) {
    console.error('Error fetching users:', error);
    throw error;
  }
}

/**
 * Get user by ID
 */
export async function getUserById(id: number): Promise<UserWithPermissions | null> {
  try {
    const result = await pool.query(`
      SELECT 
        u.id,
        u.username,
        u.email,
        u.phone1,
        u.phone2,
        u.subsite_id as "subsiteId",
        u.section_id as "sectionId",
        u.special_division_id as "specialDivisionId",
        u.user_type as "userType",
        u.validity,
        u.notes,
        u.is_active as "isActive",
        u.created_at as "createdAt",
        u.updated_at as "updatedAt",
        s.name as subsite_name,
        sec.name as section_name,
        sd.name as special_division_name,
        up.id as permission_id,
        up.add_modify_accounts as "addModifyAccounts",
        up.view_accounts as "viewAccounts",
        up.delete_accounts as "deleteAccounts",
        up.add_modify_ads as "addModifyAds",
        up.display_ads as "displayAds",
        up.delete_ads as "deleteAds",
        up.add_modify_sites as "addModifySites",
        up.view_sites as "viewSites",
        up.delete_sites as "deleteSites",
        up.notification_sending as "notificationSending",
        up.notification_viewing as "notificationViewing",
        up.notification_deletion as "notificationDeletion"
      FROM users u
      LEFT JOIN subsites s ON u.subsite_id = s.id
      LEFT JOIN sections sec ON u.section_id = sec.id
      LEFT JOIN special_divisions sd ON u.special_division_id = sd.id
      LEFT JOIN user_permissions up ON u.id = up.user_id
      WHERE u.id = $1
    `, [id]);

    if (result.rows.length === 0) {
      return null;
    }

    const row = result.rows[0];
    return {
      id: row.id,
      username: row.username,
      email: row.email,
      phone1: row.phone1,
      phone2: row.phone2 || undefined,
      subsiteId: row.subsiteId || undefined,
      sectionId: row.sectionId || undefined,
      specialDivisionId: row.specialDivisionId || undefined,
      userType: row.userType,
      validity: row.validity,
      notes: row.notes || undefined,
      isActive: row.isActive,
      createdAt: new Date(row.createdAt),
      updatedAt: new Date(row.updatedAt),
      subsiteName: row.subsite_name || undefined,
      sectionName: row.section_name || undefined,
      specialDivisionName: row.special_division_name || undefined,
      permissions: row.permission_id ? {
        id: row.permission_id,
        userId: row.id,
        addModifyAccounts: row.addModifyAccounts,
        viewAccounts: row.viewAccounts,
        deleteAccounts: row.deleteAccounts,
        addModifyAds: row.addModifyAds,
        displayAds: row.displayAds,
        deleteAds: row.deleteAds,
        addModifySites: row.addModifySites,
        viewSites: row.viewSites,
        deleteSites: row.deleteSites,
        notificationSending: row.notificationSending,
        notificationViewing: row.notificationViewing,
        notificationDeletion: row.notificationDeletion,
        createdAt: new Date(row.createdAt),
        updatedAt: new Date(row.updatedAt)
      } : undefined
    };
  } catch (error) {
    console.error('Error fetching user:', error);
    throw error;
  }
}

/**
 * Create a new user with permissions
 */
export async function createUser(
  username: string,
  email: string,
  password: string,
  phone1: string,
  phone2: string | undefined,
  subsiteId: number | undefined,
  sectionId: number | undefined,
  specialDivisionId: number | undefined,
  userType: 'regular-user' | 'admin-user' | 'super-user',
  validity: 'manager' | 'supervisor' | 'coordinator',
  notes: string | undefined,
  isActive: boolean,
  permissions: Omit<UserPermissions, 'id' | 'userId' | 'createdAt' | 'updatedAt'>
): Promise<UserWithPermissions> {
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');

    // Hash password
    const passwordHash = hashPassword(password);

    // Create user
    const userResult = await client.query(`
      INSERT INTO users (
        username, email, password_hash, phone1, phone2, 
        subsite_id, section_id, special_division_id,
        user_type, validity, notes, is_active
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
      RETURNING id
    `, [
      username, email, passwordHash, phone1, phone2 || null,
      subsiteId || null, sectionId || null, specialDivisionId || null,
      userType, validity, notes || null, isActive
    ]);

    const userId = userResult.rows[0].id;

    // Create permissions
    await client.query(`
      INSERT INTO user_permissions (
        user_id,
        add_modify_accounts, view_accounts, delete_accounts,
        add_modify_ads, display_ads, delete_ads,
        add_modify_sites, view_sites, delete_sites,
        notification_sending, notification_viewing, notification_deletion
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
    `, [
      userId,
      permissions.addModifyAccounts, permissions.viewAccounts, permissions.deleteAccounts,
      permissions.addModifyAds, permissions.displayAds, permissions.deleteAds,
      permissions.addModifySites, permissions.viewSites, permissions.deleteSites,
      permissions.notificationSending, permissions.notificationViewing, permissions.notificationDeletion
    ]);

    await client.query('COMMIT');

    // Return created user
    const createdUser = await getUserById(userId);
    if (!createdUser) {
      throw new Error('Failed to retrieve created user');
    }

    return createdUser;
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error creating user:', error);
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Update a user and their permissions
 */
export async function updateUser(
  id: number,
  username: string,
  email: string,
  password: string | undefined,
  phone1: string,
  phone2: string | undefined,
  subsiteId: number | undefined,
  sectionId: number | undefined,
  specialDivisionId: number | undefined,
  userType: 'regular-user' | 'admin-user' | 'super-user',
  validity: 'manager' | 'supervisor' | 'coordinator',
  notes: string | undefined,
  isActive: boolean,
  permissions: Omit<UserPermissions, 'id' | 'userId' | 'createdAt' | 'updatedAt'>
): Promise<UserWithPermissions> {
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');

    // Build update query - conditionally include password
    let updateQuery = `
      UPDATE users
      SET username = $1,
          email = $2,
          phone1 = $3,
          phone2 = $4,
          subsite_id = $5,
          section_id = $6,
          special_division_id = $7,
          user_type = $8,
          validity = $9,
          notes = $10,
          is_active = $11,
          updated_at = CURRENT_TIMESTAMP
    `;
    
    const queryParams: any[] = [
      username, email, phone1, phone2 || null,
      subsiteId || null, sectionId || null, specialDivisionId || null,
      userType, validity, notes || null, isActive
    ];
    
    // If password is provided, hash it and include in update
    if (password && password.trim() !== '') {
      const passwordHash = hashPassword(password);
      updateQuery = updateQuery.replace('updated_at = CURRENT_TIMESTAMP', 
        `password_hash = $${queryParams.length + 1}, updated_at = CURRENT_TIMESTAMP`);
      queryParams.push(passwordHash);
    }
    
    queryParams.push(id);
    updateQuery += ` WHERE id = $${queryParams.length}`;
    
    await client.query(updateQuery, queryParams);

    // Update or create permissions
    const permResult = await client.query(
      'SELECT id FROM user_permissions WHERE user_id = $1',
      [id]
    );

    if (permResult.rows.length > 0) {
      // Update existing permissions
      await client.query(`
        UPDATE user_permissions
        SET add_modify_accounts = $1,
            view_accounts = $2,
            delete_accounts = $3,
            add_modify_ads = $4,
            display_ads = $5,
            delete_ads = $6,
            add_modify_sites = $7,
            view_sites = $8,
            delete_sites = $9,
            notification_sending = $10,
            notification_viewing = $11,
            notification_deletion = $12,
            updated_at = CURRENT_TIMESTAMP
        WHERE user_id = $13
      `, [
        permissions.addModifyAccounts, permissions.viewAccounts, permissions.deleteAccounts,
        permissions.addModifyAds, permissions.displayAds, permissions.deleteAds,
        permissions.addModifySites, permissions.viewSites, permissions.deleteSites,
        permissions.notificationSending, permissions.notificationViewing, permissions.notificationDeletion,
        id
      ]);
    } else {
      // Create new permissions
      await client.query(`
        INSERT INTO user_permissions (
          user_id,
          add_modify_accounts, view_accounts, delete_accounts,
          add_modify_ads, display_ads, delete_ads,
          add_modify_sites, view_sites, delete_sites,
          notification_sending, notification_viewing, notification_deletion
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
      `, [
        id,
        permissions.addModifyAccounts, permissions.viewAccounts, permissions.deleteAccounts,
        permissions.addModifyAds, permissions.displayAds, permissions.deleteAds,
        permissions.addModifySites, permissions.viewSites, permissions.deleteSites,
        permissions.notificationSending, permissions.notificationViewing, permissions.notificationDeletion
      ]);
    }

    await client.query('COMMIT');

    // Return updated user
    const updatedUser = await getUserById(id);
    if (!updatedUser) {
      throw new Error('Failed to retrieve updated user');
    }

    return updatedUser;
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error updating user:', error);
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Delete a user
 */
export async function deleteUser(id: number): Promise<void> {
  try {
    const result = await pool.query('DELETE FROM users WHERE id = $1', [id]);
    
    if (result.rowCount === 0) {
      throw new Error('User not found');
    }
  } catch (error) {
    console.error('Error deleting user:', error);
    throw error;
  }
}

/**
 * Authenticate user with username/email and password
 */
export async function loginUser(usernameOrEmail: string, password: string): Promise<UserWithPermissions | null> {
  try {
    // Find user by username or email
    const result = await pool.query(`
      SELECT 
        u.id,
        u.username,
        u.email,
        u.password_hash,
        u.two_factor_enabled as "twoFactorEnabled",
        u.phone1,
        u.phone2,
        u.subsite_id as "subsiteId",
        u.section_id as "sectionId",
        u.special_division_id as "specialDivisionId",
        u.user_type as "userType",
        u.validity,
        u.notes,
        u.is_active as "isActive",
        u.created_at as "createdAt",
        u.updated_at as "updatedAt",
        s.name as subsite_name,
        sec.name as section_name,
        sd.name as special_division_name,
        up.id as permission_id,
        up.add_modify_accounts as "addModifyAccounts",
        up.view_accounts as "viewAccounts",
        up.delete_accounts as "deleteAccounts",
        up.add_modify_ads as "addModifyAds",
        up.display_ads as "displayAds",
        up.delete_ads as "deleteAds",
        up.add_modify_sites as "addModifySites",
        up.view_sites as "viewSites",
        up.delete_sites as "deleteSites",
        up.notification_sending as "notificationSending",
        up.notification_viewing as "notificationViewing",
        up.notification_deletion as "notificationDeletion"
      FROM users u
      LEFT JOIN subsites s ON u.subsite_id = s.id
      LEFT JOIN sections sec ON u.section_id = sec.id
      LEFT JOIN special_divisions sd ON u.special_division_id = sd.id
      LEFT JOIN user_permissions up ON u.id = up.user_id
      WHERE (u.username = $1 OR u.email = $1) AND u.is_active = true
    `, [usernameOrEmail]);

    if (result.rows.length === 0) {
      console.log('Login attempt: User not found for username/email:', usernameOrEmail);
      return null;
    }

    const row = result.rows[0];
    console.log('Login attempt: User found -', {
      id: row.id,
      username: row.username,
      email: row.email,
      isActive: row.is_active,
      hasPasswordHash: !!row.password_hash,
      passwordHashLength: row.password_hash ? row.password_hash.length : 0
    });

    // Verify password
    if (!row.password_hash) {
      console.log('Login attempt: User has no password hash');
      return null;
    }
    
    const passwordValid = verifyPassword(password, row.password_hash);
    if (!passwordValid) {
      console.log('Login attempt: Password verification failed for user:', row.username);
      return null;
    }
    
    console.log('Login attempt: Password verified successfully for user:', row.username);

    // Return user with permissions
    return {
      id: row.id,
      username: row.username,
      email: row.email,
      twoFactorEnabled: !!row.twoFactorEnabled,
      phone1: row.phone1,
      phone2: row.phone2 || undefined,
      subsiteId: row.subsiteId || undefined,
      sectionId: row.sectionId || undefined,
      specialDivisionId: row.specialDivisionId || undefined,
      userType: row.userType,
      validity: row.validity,
      notes: row.notes || undefined,
      isActive: row.isActive,
      createdAt: new Date(row.createdAt),
      updatedAt: new Date(row.updatedAt),
      subsiteName: row.subsite_name || undefined,
      sectionName: row.section_name || undefined,
      specialDivisionName: row.special_division_name || undefined,
      permissions: row.permission_id ? {
        id: row.permission_id,
        userId: row.id,
        addModifyAccounts: row.addModifyAccounts,
        viewAccounts: row.viewAccounts,
        deleteAccounts: row.deleteAccounts,
        addModifyAds: row.addModifyAds,
        displayAds: row.displayAds,
        deleteAds: row.deleteAds,
        addModifySites: row.addModifySites,
        viewSites: row.viewSites,
        deleteSites: row.deleteSites,
        notificationSending: row.notificationSending,
        notificationViewing: row.notificationViewing,
        notificationDeletion: row.notificationDeletion,
        createdAt: new Date(row.createdAt),
        updatedAt: new Date(row.updatedAt)
      } : undefined
    };
  } catch (error) {
    console.error('Error during login:', error);
    throw error;
  }
}

