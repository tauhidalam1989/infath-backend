import { pool } from '../config/database';
import { Subsite } from '../types/location.types';

/**
 * Get all subsites
 */
export async function getSubsites(): Promise<Subsite[]> {
  try {
    const result = await pool.query(`
      SELECT 
        id,
        name,
        address,
        type,
        status,
        created_at as "createdAt",
        updated_at as "updatedAt"
      FROM subsites
      ORDER BY created_at DESC
    `);

    return result.rows.map(row => ({
      id: row.id,
      name: row.name,
      address: row.address,
      type: row.type,
      status: row.status,
      createdAt: new Date(row.createdAt),
      updatedAt: new Date(row.updatedAt)
    }));
  } catch (error) {
    console.error('Error fetching subsites:', error);
    throw error;
  }
}

/**
 * Get subsite by ID
 */
export async function getSubsiteById(id: number): Promise<Subsite | null> {
  try {
    const result = await pool.query(`
      SELECT 
        id,
        name,
        address,
        type,
        status,
        created_at as "createdAt",
        updated_at as "updatedAt"
      FROM subsites
      WHERE id = $1
    `, [id]);

    if (result.rows.length === 0) {
      return null;
    }

    const row = result.rows[0];
    return {
      id: row.id,
      name: row.name,
      address: row.address,
      type: row.type,
      status: row.status,
      createdAt: new Date(row.createdAt),
      updatedAt: new Date(row.updatedAt)
    };
  } catch (error) {
    console.error('Error fetching subsite:', error);
    throw error;
  }
}

/**
 * Create a new subsite
 */
export async function createSubsite(
  name: string,
  address: string,
  type: 'main-center' | 'branch' | 'office',
  status: 'active' | 'inactive' = 'active'
): Promise<Subsite> {
  try {
    const result = await pool.query(`
      INSERT INTO subsites (name, address, type, status)
      VALUES ($1, $2, $3, $4)
      RETURNING 
        id,
        name,
        address,
        type,
        status,
        created_at as "createdAt",
        updated_at as "updatedAt"
    `, [name, address, type, status]);

    const row = result.rows[0];
    return {
      id: row.id,
      name: row.name,
      address: row.address,
      type: row.type,
      status: row.status,
      createdAt: new Date(row.createdAt),
      updatedAt: new Date(row.updatedAt)
    };
  } catch (error) {
    console.error('Error creating subsite:', error);
    throw error;
  }
}

/**
 * Update a subsite
 */
export async function updateSubsite(
  id: number,
  name: string,
  address: string,
  type: 'main-center' | 'branch' | 'office',
  status: 'active' | 'inactive'
): Promise<Subsite> {
  try {
    const result = await pool.query(`
      UPDATE subsites
      SET name = $1,
          address = $2,
          type = $3,
          status = $4,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = $5
      RETURNING 
        id,
        name,
        address,
        type,
        status,
        created_at as "createdAt",
        updated_at as "updatedAt"
    `, [name, address, type, status, id]);

    if (result.rows.length === 0) {
      throw new Error('Subsite not found');
    }

    const row = result.rows[0];
    return {
      id: row.id,
      name: row.name,
      address: row.address,
      type: row.type,
      status: row.status,
      createdAt: new Date(row.createdAt),
      updatedAt: new Date(row.updatedAt)
    };
  } catch (error) {
    console.error('Error updating subsite:', error);
    throw error;
  }
}

/**
 * Delete a subsite
 */
export async function deleteSubsite(id: number): Promise<void> {
  try {
    const result = await pool.query('DELETE FROM subsites WHERE id = $1', [id]);
    
    if (result.rowCount === 0) {
      throw new Error('Subsite not found');
    }
  } catch (error) {
    console.error('Error deleting subsite:', error);
    throw error;
  }
}

