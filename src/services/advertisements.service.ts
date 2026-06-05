import { pool } from '../config/database';
import { ensureUtf8FileName } from '../utils/encoding.util';
import { Advertisement, CreateAdvertisementRequest } from '../types/advertisement.types';

/**
 * Get public base URL for serving files.
 *
 * IMPORTANT:
 * - Always prefer BACKEND_PUBLIC_URL when set.
 * - Otherwise, default to the deployed backend domain so we never leak localhost URLs
 *   in responses used by web/mobile players.
 * - If you need pure localhost URLs in a local dev environment, set BACKEND_PUBLIC_URL
 *   to http://localhost:3000 explicitly.
 */
export function getPublicBaseUrl(): string {
  const envUrl = process.env.BACKEND_PUBLIC_URL;
  if (envUrl && envUrl.trim().length > 0) {
    return envUrl;
  }

  // Safe default for this project (production domain)
  return 'https://screening-backend.infath.gov.sa';
}

/**
 * Normalize a stored fileUrl so that:
 * - localhost/127.0.0.1 hosts are replaced with BACKEND_PUBLIC_URL origin
 * - relative paths (/uploads/...) are converted to absolute URLs with BACKEND_PUBLIC_URL
 */
export function normalizeFileUrl(fileUrl: string | null | undefined): string | null {
  if (!fileUrl) return null;

  const base = getPublicBaseUrl();

  try {
    const baseUrl = new URL(base);
    const parsed = new URL(fileUrl, baseUrl);

    // If hostname is localhost/127.0.0.1, rewrite to public base origin
    if (parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1') {
      return `${baseUrl.origin}${parsed.pathname}`;
    }

    // If original was relative (e.g. /uploads/...), new URL() already applied base origin
    if (!fileUrl.startsWith('http://') && !fileUrl.startsWith('https://')) {
      return `${baseUrl.origin}${parsed.pathname}`;
    }

    // Otherwise, keep as-is
    return parsed.toString();
  } catch {
    // Fallback: if it's a plain path, prefix with base origin
    if (fileUrl.startsWith('/')) {
      try {
        const baseUrl = new URL(base);
        return `${baseUrl.origin}${fileUrl}`;
      } catch {
        return fileUrl;
      }
    }
    return fileUrl;
  }
}
import * as notificationService from './notifications.service';
import * as notificationSettingsService from './notificationSettings.service';

/**
 * Get all advertisements with optional filters
 */
export async function getAdvertisements(filters?: {
  type?: string;
  status?: string;
  search?: string;
  limit?: number;
  page?: number;
}): Promise<{ advertisements: Advertisement[]; total: number }> {
  try {
    const limit = filters?.limit || 50;
    const page = filters?.page || 1;
    const offset = (page - 1) * limit;

    let query = `
      SELECT 
        a.id,
        a.title,
        a.description,
        a.type,
        a.file_url as "fileUrl",
        a.file_name as "fileName",
        a.file_size as "fileSize",
        a.mime_type as "mimeType",
        a.thumbnail_url as "thumbnailUrl",
        a.status,
        a.created_by as "createdBy",
        a.created_at as "createdAt",
        a.updated_at as "updatedAt"
      FROM advertisements a
      WHERE 1=1
    `;
    const queryParams: any[] = [];
    let paramIndex = 1;

    if (filters?.type) {
      query += ` AND a.type = $${paramIndex}`;
      queryParams.push(filters.type);
      paramIndex++;
    }

    if (filters?.status) {
      query += ` AND a.status = $${paramIndex}`;
      queryParams.push(filters.status);
      paramIndex++;
    }

    if (filters?.search) {
      query += ` AND (
        a.title ILIKE $${paramIndex} OR
        a.description ILIKE $${paramIndex} OR
        a.file_name ILIKE $${paramIndex}
      )`;
      queryParams.push(`%${filters.search}%`);
      paramIndex++;
    }

    // Get total count
    const countQuery = query.replace(/SELECT[\s\S]*?FROM/, 'SELECT COUNT(*) as total FROM');
    const countResult = await pool.query(countQuery, queryParams);
    const total = parseInt(countResult.rows[0].total);

    // Add ordering and pagination
    query += ` ORDER BY a.created_at DESC LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
    queryParams.push(limit, offset);

    const result = await pool.query(query, queryParams);

    return {
      advertisements: result.rows.map(row => ({
        id: row.id,
        title: row.title,
        description: row.description ?? null,
        type: row.type,
        fileUrl: normalizeFileUrl(row.fileUrl) || row.fileUrl,
        fileName: ensureUtf8FileName(row.fileName),
        fileSize: row.fileSize,
        mimeType: row.mimeType,
        thumbnailUrl: row.thumbnailUrl ?? null,
        status: row.status,
        createdBy: row.createdBy ?? null,
        createdAt: new Date(row.createdAt),
        updatedAt: new Date(row.updatedAt)
      })),
      total
    };
  } catch (error) {
    console.error('Error fetching advertisements:', error);
    throw error;
  }
}

/**
 * Get advertisement by ID
 */
export async function getAdvertisementById(id: number): Promise<Advertisement | null> {
  try {
    const result = await pool.query(`
      SELECT 
        a.id,
        a.title,
        a.description,
        a.type,
        a.file_url as "fileUrl",
        a.file_name as "fileName",
        a.file_size as "fileSize",
        a.mime_type as "mimeType",
        a.thumbnail_url as "thumbnailUrl",
        a.status,
        a.created_by as "createdBy",
        a.created_at as "createdAt",
        a.updated_at as "updatedAt"
      FROM advertisements a
      WHERE a.id = $1
    `, [id]);

    if (result.rows.length === 0) {
      return null;
    }

    const row = result.rows[0];
    return {
      id: row.id,
      title: row.title,
      description: row.description ?? null,
      type: row.type,
      fileUrl: normalizeFileUrl(row.fileUrl) || row.fileUrl,
      fileName: ensureUtf8FileName(row.fileName),
      fileSize: row.fileSize,
      mimeType: row.mimeType,
      thumbnailUrl: row.thumbnailUrl ?? null,
      status: row.status,
      createdBy: row.createdBy ?? null,
      createdAt: new Date(row.createdAt),
      updatedAt: new Date(row.updatedAt)
    };
  } catch (error) {
    console.error('Error fetching advertisement:', error);
    throw error;
  }
}

/**
 * Create advertisement
 */
export async function createAdvertisement(
  data: CreateAdvertisementRequest,
  createdBy?: number
): Promise<Advertisement> {
  try {
    const result = await pool.query(`
      INSERT INTO advertisements (
        title,
        description,
        type,
        file_url,
        file_name,
        file_size,
        mime_type,
        thumbnail_url,
        status,
        created_by,
        created_at,
        updated_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
      RETURNING id
    `, [
      data.title,
      data.description ?? null,
      data.type,
      data.fileUrl,
      data.fileName,
      data.fileSize,
      data.mimeType,
      data.thumbnailUrl ?? null,
      data.status || 'draft',
      createdBy ?? null
    ]);

    const id = result.rows[0].id;
    const advertisement = await getAdvertisementById(id);

    if (!advertisement) {
      throw new Error('Failed to retrieve created advertisement');
    }

    return advertisement;
  } catch (error) {
    console.error('Error creating advertisement:', error);
    throw error;
  }
}

/**
 * Update advertisement
 */
export async function updateAdvertisement(
  id: number,
  data: Partial<CreateAdvertisementRequest>
): Promise<Advertisement> {
  try {
    const existing = await getAdvertisementById(id);
    if (!existing) {
      throw new Error('Advertisement not found');
    }

    const updates: string[] = [];
    const values: any[] = [];
    let paramIndex = 1;

    if (data.title !== undefined) {
      updates.push(`title = $${paramIndex}`);
      values.push(data.title);
      paramIndex++;
    }
    if (data.description !== undefined) {
      updates.push(`description = $${paramIndex}`);
      values.push(data.description);
      paramIndex++;
    }
    if (data.type !== undefined) {
      updates.push(`type = $${paramIndex}`);
      values.push(data.type);
      paramIndex++;
    }
    if (data.fileUrl !== undefined) {
      updates.push(`file_url = $${paramIndex}`);
      values.push(data.fileUrl);
      paramIndex++;
    }
    if (data.fileName !== undefined) {
      updates.push(`file_name = $${paramIndex}`);
      values.push(data.fileName);
      paramIndex++;
    }
    if (data.fileSize !== undefined) {
      updates.push(`file_size = $${paramIndex}`);
      values.push(data.fileSize);
      paramIndex++;
    }
    if (data.mimeType !== undefined) {
      updates.push(`mime_type = $${paramIndex}`);
      values.push(data.mimeType);
      paramIndex++;
    }
    if (data.thumbnailUrl !== undefined) {
      updates.push(`thumbnail_url = $${paramIndex}`);
      values.push(data.thumbnailUrl);
      paramIndex++;
    }
    if (data.status !== undefined) {
      updates.push(`status = $${paramIndex}`);
      values.push(data.status);
      paramIndex++;
    }

    if (updates.length === 0) {
      return existing;
    }

    updates.push(`updated_at = CURRENT_TIMESTAMP`);
    values.push(id);

    await pool.query(`
      UPDATE advertisements
      SET ${updates.join(', ')}
      WHERE id = $${paramIndex}
    `, values);

    const updated = await getAdvertisementById(id);
    if (!updated) {
      throw new Error('Failed to retrieve updated advertisement');
    }

    return updated;
  } catch (error) {
    console.error('Error updating advertisement:', error);
    throw error;
  }
}

/**
 * Delete advertisement
 */
export async function deleteAdvertisement(id: number): Promise<boolean> {
  try {
    const result = await pool.query('DELETE FROM advertisements WHERE id = $1', [id]);
    return (result.rowCount || 0) > 0;
  } catch (error) {
    console.error('Error deleting advertisement:', error);
    throw error;
  }
}


