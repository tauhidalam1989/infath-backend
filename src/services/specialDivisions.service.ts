import { pool } from '../config/database';
import { SpecialDivision } from '../types/location.types';

/**
 * Get all special divisions
 */
export async function getSpecialDivisions(): Promise<SpecialDivision[]> {
  try {
    const result = await pool.query(`
      SELECT 
        id,
        name,
        code,
        category,
        priority,
        description,
        location,
        created_at as "createdAt",
        updated_at as "updatedAt"
      FROM special_divisions
      ORDER BY 
        CASE priority
          WHEN 'high' THEN 1
          WHEN 'medium' THEN 2
          WHEN 'low' THEN 3
        END,
        created_at DESC
    `);

    return result.rows.map(row => ({
      id: row.id,
      name: row.name,
      code: row.code,
      category: row.category,
      priority: row.priority,
      description: row.description || undefined,
      location: row.location,
      createdAt: new Date(row.createdAt),
      updatedAt: new Date(row.updatedAt)
    }));
  } catch (error) {
    console.error('Error fetching special divisions:', error);
    throw error;
  }
}

/**
 * Get special division by ID
 */
export async function getSpecialDivisionById(id: number): Promise<SpecialDivision | null> {
  try {
    const result = await pool.query(`
      SELECT 
        id,
        name,
        code,
        category,
        priority,
        description,
        location,
        created_at as "createdAt",
        updated_at as "updatedAt"
      FROM special_divisions
      WHERE id = $1
    `, [id]);

    if (result.rows.length === 0) {
      return null;
    }

    const row = result.rows[0];
    return {
      id: row.id,
      name: row.name,
      code: row.code,
      category: row.category,
      priority: row.priority,
      description: row.description || undefined,
      location: row.location,
      createdAt: new Date(row.createdAt),
      updatedAt: new Date(row.updatedAt)
    };
  } catch (error) {
    console.error('Error fetching special division:', error);
    throw error;
  }
}

/**
 * Create a new special division
 */
export async function createSpecialDivision(
  name: string,
  code: string,
  category: 'government' | 'educational' | 'healthcare' | 'religious' | 'recreational',
  priority: 'high' | 'medium' | 'low',
  description: string,
  location: string
): Promise<SpecialDivision> {
  try {
    const result = await pool.query(`
      INSERT INTO special_divisions (name, code, category, priority, description, location)
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING 
        id,
        name,
        code,
        category,
        priority,
        description,
        location,
        created_at as "createdAt",
        updated_at as "updatedAt"
    `, [name, code, category, priority, description, location]);

    const row = result.rows[0];
    return {
      id: row.id,
      name: row.name,
      code: row.code,
      category: row.category,
      priority: row.priority,
      description: row.description || undefined,
      location: row.location,
      createdAt: new Date(row.createdAt),
      updatedAt: new Date(row.updatedAt)
    };
  } catch (error: any) {
    console.error('Error creating special division:', error);
    if (error.code === '23505') { // Unique violation
      throw new Error('Special division code already exists');
    }
    throw error;
  }
}

/**
 * Update a special division
 */
export async function updateSpecialDivision(
  id: number,
  name: string,
  code: string,
  category: 'government' | 'educational' | 'healthcare' | 'religious' | 'recreational',
  priority: 'high' | 'medium' | 'low',
  description: string,
  location: string
): Promise<SpecialDivision> {
  try {
    const result = await pool.query(`
      UPDATE special_divisions
      SET name = $1,
          code = $2,
          category = $3,
          priority = $4,
          description = $5,
          location = $6,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = $7
      RETURNING 
        id,
        name,
        code,
        category,
        priority,
        description,
        location,
        created_at as "createdAt",
        updated_at as "updatedAt"
    `, [name, code, category, priority, description, location, id]);

    if (result.rows.length === 0) {
      throw new Error('Special division not found');
    }

    const row = result.rows[0];
    return {
      id: row.id,
      name: row.name,
      code: row.code,
      category: row.category,
      priority: row.priority,
      description: row.description || undefined,
      location: row.location,
      createdAt: new Date(row.createdAt),
      updatedAt: new Date(row.updatedAt)
    };
  } catch (error: any) {
    console.error('Error updating special division:', error);
    if (error.code === '23505') { // Unique violation
      throw new Error('Special division code already exists');
    }
    throw error;
  }
}

/**
 * Delete a special division
 */
export async function deleteSpecialDivision(id: number): Promise<void> {
  try {
    const result = await pool.query('DELETE FROM special_divisions WHERE id = $1', [id]);
    
    if (result.rowCount === 0) {
      throw new Error('Special division not found');
    }
  } catch (error) {
    console.error('Error deleting special division:', error);
    throw error;
  }
}

