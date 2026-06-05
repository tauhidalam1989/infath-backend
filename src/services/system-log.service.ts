import { pool } from '../config/database';
import { SystemLog, LogLevel, CreateLogRequest } from '../types/system-log.types';
import { forwardSystemLogToSim } from '../utils/syslog.util';

/**
 * Create a system log entry
 */
export async function createLog(request: CreateLogRequest): Promise<SystemLog> {
  try {
    const result = await pool.query(`
      INSERT INTO system_logs (
        level,
        module,
        action,
        message,
        details,
        user_id,
        ip_address,
        user_agent,
        created_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, CURRENT_TIMESTAMP)
      RETURNING *
    `, [
      request.level,
      request.module,
      request.action,
      request.message,
      request.details ? JSON.stringify(request.details) : null,
      request.userId ?? null,
      request.ipAddress ?? null,
      request.userAgent ?? null
    ]);

    const row = result.rows[0];
    // Handle details - PostgreSQL JSONB returns as object, not string
    let details = null;
    if (row.details) {
      if (typeof row.details === 'string') {
        try {
          details = JSON.parse(row.details);
        } catch (e) {
          details = row.details;
        }
      } else {
        details = row.details;
      }
    }

    const log: SystemLog = {
      id: row.id,
      level: row.level,
      module: row.module,
      action: row.action,
      message: row.message,
      details: details,
      userId: row.user_id ?? null,
      ipAddress: row.ip_address ?? null,
      userAgent: row.user_agent ?? null,
      createdAt: new Date(row.created_at)
    };

    // Best-effort forwarding to external SIM via Syslog over TCP
    forwardSystemLogToSim(log);

    return log;
  } catch (error) {
    console.error('Error creating system log:', error);
    throw error;
  }
}

/**
 * Get all system logs with optional filters
 */
export async function getLogs(filters?: {
  level?: LogLevel;
  module?: string;
  action?: string;
  userId?: number;
  search?: string;
  startDate?: Date;
  endDate?: Date;
  limit?: number;
  offset?: number;
  page?: number;
}): Promise<{ logs: SystemLog[]; total: number }> {
  try {
    const limit = filters?.limit || 50;
    const page = filters?.page || 1;
    const offset = (page - 1) * limit;

    let query = `
      SELECT 
        sl.id,
        sl.level,
        sl.module,
        sl.action,
        sl.message,
        sl.details,
        sl.user_id as "userId",
        sl.ip_address as "ipAddress",
        sl.user_agent as "userAgent",
        sl.created_at as "createdAt",
        u.username as user_name
      FROM system_logs sl
      LEFT JOIN users u ON sl.user_id = u.id
      WHERE 1=1
    `;
    const queryParams: any[] = [];
    let paramIndex = 1;

    if (filters?.level) {
      query += ` AND sl.level = $${paramIndex}`;
      queryParams.push(filters.level);
      paramIndex++;
    }

    if (filters?.module) {
      query += ` AND sl.module = $${paramIndex}`;
      queryParams.push(filters.module);
      paramIndex++;
    }

    if (filters?.action) {
      query += ` AND sl.action = $${paramIndex}`;
      queryParams.push(filters.action);
      paramIndex++;
    }

    if (filters?.userId) {
      query += ` AND sl.user_id = $${paramIndex}`;
      queryParams.push(filters.userId);
      paramIndex++;
    }

    if (filters?.search) {
      query += ` AND (
        sl.message ILIKE $${paramIndex} OR
        sl.module ILIKE $${paramIndex} OR
        sl.action ILIKE $${paramIndex} OR
        u.username ILIKE $${paramIndex}
      )`;
      queryParams.push(`%${filters.search}%`);
      paramIndex++;
    }

    if (filters?.startDate) {
      query += ` AND sl.created_at >= $${paramIndex}`;
      queryParams.push(filters.startDate);
      paramIndex++;
    }

    if (filters?.endDate) {
      query += ` AND sl.created_at <= $${paramIndex}`;
      queryParams.push(filters.endDate);
      paramIndex++;
    }

    // Get total count
    const countQuery = query.replace(/SELECT[\s\S]*?FROM/, 'SELECT COUNT(*) as total FROM');
    const countResult = await pool.query(countQuery, queryParams);
    const total = parseInt(countResult.rows[0].total);

    // Add ordering and pagination
    query += ` ORDER BY sl.created_at DESC LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
    queryParams.push(limit, offset);

    const result = await pool.query(query, queryParams);

    return {
      logs: result.rows.map(row => {
        // Handle details - PostgreSQL JSONB returns as object, not string
        let details = null;
        if (row.details) {
          if (typeof row.details === 'string') {
            try {
              details = JSON.parse(row.details);
            } catch (e) {
              details = row.details;
            }
          } else {
            details = row.details;
          }
        }
        
        return {
          id: row.id,
          level: row.level,
          module: row.module,
          action: row.action,
          message: row.message,
          details: details,
          userId: row.userId ?? null,
          ipAddress: row.ipAddress ?? null,
          userAgent: row.userAgent ?? null,
          createdAt: new Date(row.createdAt),
          userName: row.user_name ?? null
        };
      }),
      total
    };
  } catch (error) {
    console.error('Error fetching system logs:', error);
    throw error;
  }
}

/**
 * Get log by ID
 */
export async function getLogById(id: number): Promise<SystemLog | null> {
  try {
    const result = await pool.query(`
      SELECT 
        sl.id,
        sl.level,
        sl.module,
        sl.action,
        sl.message,
        sl.details,
        sl.user_id as "userId",
        sl.ip_address as "ipAddress",
        sl.user_agent as "userAgent",
        sl.created_at as "createdAt",
        u.username as user_name
      FROM system_logs sl
      LEFT JOIN users u ON sl.user_id = u.id
      WHERE sl.id = $1
    `, [id]);

    if (result.rows.length === 0) {
      return null;
    }

    const row = result.rows[0];
    // Handle details - PostgreSQL JSONB returns as object, not string
    let details = null;
    if (row.details) {
      if (typeof row.details === 'string') {
        try {
          details = JSON.parse(row.details);
        } catch (e) {
          details = row.details;
        }
      } else {
        details = row.details;
      }
    }
    
    return {
      id: row.id,
      level: row.level,
      module: row.module,
      action: row.action,
      message: row.message,
      details: details,
      userId: row.userId ?? null,
      ipAddress: row.ipAddress ?? null,
      userAgent: row.userAgent ?? null,
      createdAt: new Date(row.createdAt),
      userName: row.user_name ?? null
    };
  } catch (error) {
    console.error('Error fetching system log:', error);
    throw error;
  }
}

/**
 * Get unique modules for filtering
 */
export async function getUniqueModules(): Promise<string[]> {
  try {
    const result = await pool.query(`
      SELECT DISTINCT module
      FROM system_logs
      ORDER BY module
    `);

    return result.rows.map(row => row.module);
  } catch (error) {
    console.error('Error fetching unique modules:', error);
    throw error;
  }
}

/**
 * Get unique actions for filtering
 */
export async function getUniqueActions(): Promise<string[]> {
  try {
    const result = await pool.query(`
      SELECT DISTINCT action
      FROM system_logs
      ORDER BY action
    `);

    return result.rows.map(row => row.action);
  } catch (error) {
    console.error('Error fetching unique actions:', error);
    throw error;
  }
}

/**
 * Delete old logs (cleanup)
 */
export async function deleteOldLogs(daysToKeep: number = 90): Promise<number> {
  try {
    const result = await pool.query(`
      DELETE FROM system_logs
      WHERE created_at < NOW() - INTERVAL '${daysToKeep} days'
    `);

    return result.rowCount || 0;
  } catch (error) {
    console.error('Error deleting old logs:', error);
    throw error;
  }
}

/**
 * Delete log by ID
 */
export async function deleteLog(id: number): Promise<void> {
  try {
    await pool.query('DELETE FROM system_logs WHERE id = $1', [id]);
  } catch (error) {
    console.error('Error deleting system log:', error);
    throw error;
  }
}

