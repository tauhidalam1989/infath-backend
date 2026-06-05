import { pool } from '../config/database';
import { Section } from '../types/location.types';

/**
 * Get all sections
 */
export async function getSections(): Promise<Section[]> {
  try {
    const result = await pool.query(`
      SELECT 
        id,
        name,
        code,
        type,
        status,
        description,
        location,
        created_at as "createdAt",
        updated_at as "updatedAt"
      FROM sections
      ORDER BY created_at DESC
    `);

    return result.rows.map(row => ({
      id: row.id,
      name: row.name,
      code: row.code,
      type: row.type,
      status: row.status,
      description: row.description || undefined,
      location: row.location,
      createdAt: new Date(row.createdAt),
      updatedAt: new Date(row.updatedAt)
    }));
  } catch (error) {
    console.error('Error fetching sections:', error);
    throw error;
  }
}

/**
 * Get section by ID
 */
export async function getSectionById(id: number): Promise<Section | null> {
  try {
    const result = await pool.query(`
      SELECT 
        id,
        name,
        code,
        type,
        status,
        description,
        location,
        created_at as "createdAt",
        updated_at as "updatedAt"
      FROM sections
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
      type: row.type,
      status: row.status,
      description: row.description || undefined,
      location: row.location,
      createdAt: new Date(row.createdAt),
      updatedAt: new Date(row.updatedAt)
    };
  } catch (error) {
    console.error('Error fetching section:', error);
    throw error;
  }
}

/**
 * Create a new section
 */
export async function createSection(
  name: string,
  code: string,
  type: 'residential' | 'commercial' | 'industrial' | 'mixed',
  status: 'active' | 'inactive' | 'under-construction',
  description: string,
  location: string
): Promise<Section> {
  try {
    const result = await pool.query(`
      INSERT INTO sections (name, code, type, status, description, location)
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING 
        id,
        name,
        code,
        type,
        status,
        description,
        location,
        created_at as "createdAt",
        updated_at as "updatedAt"
    `, [name, code, type, status, description, location]);

    const row = result.rows[0];
    return {
      id: row.id,
      name: row.name,
      code: row.code,
      type: row.type,
      status: row.status,
      description: row.description || undefined,
      location: row.location,
      createdAt: new Date(row.createdAt),
      updatedAt: new Date(row.updatedAt)
    };
  } catch (error: any) {
    console.error('Error creating section:', error);
    if (error.code === '23505') { // Unique violation
      throw new Error('Section code already exists');
    }
    throw error;
  }
}

/**
 * Update a section
 */
export async function updateSection(
  id: number,
  name: string,
  code: string,
  type: 'residential' | 'commercial' | 'industrial' | 'mixed',
  status: 'active' | 'inactive' | 'under-construction',
  description: string,
  location: string
): Promise<Section> {
  try {
    const result = await pool.query(`
      UPDATE sections
      SET name = $1,
          code = $2,
          type = $3,
          status = $4,
          description = $5,
          location = $6,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = $7
      RETURNING 
        id,
        name,
        code,
        type,
        status,
        description,
        location,
        created_at as "createdAt",
        updated_at as "updatedAt"
    `, [name, code, type, status, description, location, id]);

    if (result.rows.length === 0) {
      throw new Error('Section not found');
    }

    const row = result.rows[0];
    return {
      id: row.id,
      name: row.name,
      code: row.code,
      type: row.type,
      status: row.status,
      description: row.description || undefined,
      location: row.location,
      createdAt: new Date(row.createdAt),
      updatedAt: new Date(row.updatedAt)
    };
  } catch (error: any) {
    console.error('Error updating section:', error);
    if (error.code === '23505') { // Unique violation
      throw new Error('Section code already exists');
    }
    throw error;
  }
}

/**
 * Delete a section
 */
export async function deleteSection(id: number): Promise<void> {
  try {
    const result = await pool.query('DELETE FROM sections WHERE id = $1', [id]);
    
    if (result.rowCount === 0) {
      throw new Error('Section not found');
    }
  } catch (error) {
    console.error('Error deleting section:', error);
    throw error;
  }
}

