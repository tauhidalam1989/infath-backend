import { pool } from '../config/database';
import { WhatsAppTemplate } from '../types/whatsapp.types';

/**
 * Get all WhatsApp templates with optional filters
 */
export async function getWhatsAppTemplates(filters?: {
  category?: string;
  status?: string;
  search?: string;
  limit?: number;
  offset?: number;
  page?: number;
}): Promise<{ templates: WhatsAppTemplate[]; total: number }> {
  try {
    let query = `
      SELECT 
        id,
        name,
        category,
        content,
        variables,
        status,
        usage_count as "usageCount",
        last_used as "lastUsed",
        created_by as "createdBy",
        created_at as "createdAt",
        updated_at as "updatedAt"
      FROM whatsapp_templates
      WHERE 1=1
    `;
    
    const queryParams: any[] = [];
    let paramIndex = 1;

    if (filters?.category && filters.category !== 'all') {
      query += ` AND category = $${paramIndex}`;
      queryParams.push(filters.category);
      paramIndex++;
    }

    if (filters?.status && filters.status !== 'all') {
      query += ` AND status = $${paramIndex}`;
      queryParams.push(filters.status);
      paramIndex++;
    }

    if (filters?.search) {
      query += ` AND (name ILIKE $${paramIndex} OR content ILIKE $${paramIndex})`;
      queryParams.push(`%${filters.search}%`);
      paramIndex++;
    }

    // Get total count
    const countQuery = query.replace(/SELECT[\s\S]*?FROM/, 'SELECT COUNT(*) as total FROM');
    const countResult = await pool.query(countQuery, queryParams);
    const total = parseInt(countResult.rows[0].total);

    // Add ordering and pagination
    query += ` ORDER BY created_at DESC`;
    
    // Support both page-based and offset-based pagination
    const limit = filters?.limit || 10;
    let offset = filters?.offset;
    
    // If page is provided, calculate offset from page
    if (filters?.page !== undefined) {
      offset = (filters.page - 1) * limit;
    }
    
    if (limit) {
      query += ` LIMIT $${paramIndex}`;
      queryParams.push(limit);
      paramIndex++;
    }
    
    if (offset !== undefined) {
      query += ` OFFSET $${paramIndex}`;
      queryParams.push(offset);
      paramIndex++;
    }

    const result = await pool.query(query, queryParams);
    
    const templates: WhatsAppTemplate[] = result.rows.map(row => ({
      id: row.id,
      name: row.name,
      category: row.category,
      content: row.content,
      variables: row.variables || [],
      status: row.status,
      usageCount: row.usageCount || 0,
      lastUsed: row.lastUsed ? new Date(row.lastUsed) : null,
      createdBy: row.createdBy ?? null,
      createdAt: row.createdAt ? new Date(row.createdAt) : undefined,
      updatedAt: row.updatedAt ? new Date(row.updatedAt) : undefined
    }));

    return { templates, total };
  } catch (error) {
    console.error('Error fetching WhatsApp templates:', error);
    throw error;
  }
}

/**
 * Get a single WhatsApp template by ID
 */
export async function getWhatsAppTemplateById(id: number): Promise<WhatsAppTemplate | null> {
  try {
    const result = await pool.query(`
      SELECT 
        id,
        name,
        category,
        content,
        variables,
        status,
        usage_count as "usageCount",
        last_used as "lastUsed",
        created_by as "createdBy",
        created_at as "createdAt",
        updated_at as "updatedAt"
      FROM whatsapp_templates
      WHERE id = $1
    `, [id]);

    if (result.rows.length === 0) {
      return null;
    }

    const row = result.rows[0];
    return {
      id: row.id,
      name: row.name,
      category: row.category,
      content: row.content,
      variables: row.variables || [],
      status: row.status,
      usageCount: row.usageCount || 0,
      lastUsed: row.lastUsed ? new Date(row.lastUsed) : null,
      createdBy: row.createdBy ?? null,
      createdAt: row.createdAt ? new Date(row.createdAt) : undefined,
      updatedAt: row.updatedAt ? new Date(row.updatedAt) : undefined
    };
  } catch (error) {
    console.error('Error fetching WhatsApp template:', error);
    throw error;
  }
}

/**
 * Create a new WhatsApp template
 */
export async function createWhatsAppTemplate(template: Omit<WhatsAppTemplate, 'id' | 'createdAt' | 'updatedAt'>): Promise<WhatsAppTemplate> {
  try {
    const result = await pool.query(`
      INSERT INTO whatsapp_templates (
        name,
        category,
        content,
        variables,
        status,
        usage_count,
        created_by
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING id, created_at, updated_at
    `, [
      template.name,
      template.category,
      template.content,
      template.variables || [],
      template.status || 'active',
      template.usageCount || 0,
      template.createdBy || null
    ]);

    const createdTemplate = await getWhatsAppTemplateById(result.rows[0].id);
    if (!createdTemplate) {
      throw new Error('Failed to retrieve created template');
    }
    return createdTemplate;
  } catch (error) {
    console.error('Error creating WhatsApp template:', error);
    throw error;
  }
}

/**
 * Update a WhatsApp template
 */
export async function updateWhatsAppTemplate(
  id: number,
  template: Partial<Omit<WhatsAppTemplate, 'id' | 'createdAt' | 'updatedAt' | 'createdBy'>>
): Promise<WhatsAppTemplate> {
  try {
    const updates: string[] = [];
    const values: any[] = [];
    let paramIndex = 1;

    if (template.name !== undefined) {
      updates.push(`name = $${paramIndex++}`);
      values.push(template.name);
    }
    if (template.category !== undefined) {
      updates.push(`category = $${paramIndex++}`);
      values.push(template.category);
    }
    if (template.content !== undefined) {
      updates.push(`content = $${paramIndex++}`);
      values.push(template.content);
    }
    if (template.variables !== undefined) {
      updates.push(`variables = $${paramIndex++}`);
      values.push(template.variables);
    }
    if (template.status !== undefined) {
      updates.push(`status = $${paramIndex++}`);
      values.push(template.status);
    }
    if (template.usageCount !== undefined) {
      updates.push(`usage_count = $${paramIndex++}`);
      values.push(template.usageCount);
    }
    if (template.lastUsed !== undefined) {
      updates.push(`last_used = $${paramIndex++}`);
      values.push(template.lastUsed || null);
    }

    if (updates.length === 0) {
      const existing = await getWhatsAppTemplateById(id);
      if (!existing) {
        throw new Error('Template not found');
      }
      return existing;
    }

    updates.push(`updated_at = CURRENT_TIMESTAMP`);
    values.push(id);

    await pool.query(`
      UPDATE whatsapp_templates
      SET ${updates.join(', ')}
      WHERE id = $${paramIndex}
    `, values);

    const updatedTemplate = await getWhatsAppTemplateById(id);
    if (!updatedTemplate) {
      throw new Error('Failed to retrieve updated template');
    }
    return updatedTemplate;
  } catch (error) {
    console.error('Error updating WhatsApp template:', error);
    throw error;
  }
}

/**
 * Delete a WhatsApp template
 */
export async function deleteWhatsAppTemplate(id: number): Promise<boolean> {
  try {
    const result = await pool.query(
      'DELETE FROM whatsapp_templates WHERE id = $1',
      [id]
    );
    return result.rowCount !== null && result.rowCount > 0;
  } catch (error) {
    console.error('Error deleting WhatsApp template:', error);
    throw error;
  }
}

/**
 * Increment usage count for a template
 */
export async function incrementTemplateUsage(id: number): Promise<void> {
  try {
    await pool.query(`
      UPDATE whatsapp_templates
      SET usage_count = usage_count + 1,
          last_used = CURRENT_TIMESTAMP,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = $1
    `, [id]);
  } catch (error) {
    console.error('Error incrementing template usage:', error);
    throw error;
  }
}

