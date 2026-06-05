import { pool } from '../config/database';
import { Notification } from '../types/notification.types';

/**
 * Get all notifications with optional filters
 */
export async function getNotifications(filters?: {
  status?: string;
  type?: string;
  category?: string;
  search?: string;
  limit?: number;
  offset?: number;
  page?: number;
  userId?: number; // Filter by specific user
}): Promise<{ notifications: Notification[]; total: number }> {
  try {
    const queryParams: any[] = [];
    let paramIndex = 1;
    
    // If userId is provided, only show notifications for that user
    // This includes: notifications sent to all, notifications linked to user via user_notifications, 
    // and notifications matching user's location
    let query = `
      SELECT DISTINCT
        n.id,
        n.title,
        n.type,
        n.message,
        n.category,
        n.priority,
        n.status,
        n.content,
        n.send_to_all as "sendToAll",
        n.subsite_id as "subsiteId",
        n.section_id as "sectionId",
        n.special_division_id as "specialDivisionId",
        n.scheduled_date as "scheduledDate",
        n.scheduled_time as "scheduledTime",
        n.sent_at as "sentAt",
        n.created_by as "createdBy",
        n.created_at as "createdAt",
        n.updated_at as "updatedAt",
        s.name as subsite_name,
        sec.name as section_name,
        sd.name as special_division_name
      FROM notifications n
      LEFT JOIN subsites s ON n.subsite_id = s.id
      LEFT JOIN sections sec ON n.section_id = sec.id
      LEFT JOIN special_divisions sd ON n.special_division_id = sd.id
    `;
    
    // Add user_notifications join if userId is provided
    if (filters?.userId) {
      query += `
        LEFT JOIN user_notifications un ON n.id = un.notification_id AND un.user_id = $${paramIndex}
        LEFT JOIN users u ON u.id = $${paramIndex}
      `;
      queryParams.push(filters.userId);
      const userIdParam = paramIndex;
      paramIndex++;
      
      query += ` WHERE (
        n.send_to_all = true 
        OR un.user_id = $${userIdParam}
        OR (n.subsite_id IS NOT NULL AND n.subsite_id = u.subsite_id)
        OR (n.section_id IS NOT NULL AND n.section_id = u.section_id)
        OR (n.special_division_id IS NOT NULL AND n.special_division_id = u.special_division_id)
      )`;
    } else {
      query += ` WHERE 1=1`;
    }

    if (filters?.status && filters.status !== 'all') {
      query += ` AND n.status = $${paramIndex}`;
      queryParams.push(filters.status);
      paramIndex++;
    }

    if (filters?.type && filters.type !== 'all') {
      query += ` AND n.type = $${paramIndex}`;
      queryParams.push(filters.type);
      paramIndex++;
    }

    if (filters?.category && filters.category !== 'all') {
      query += ` AND n.category = $${paramIndex}`;
      queryParams.push(filters.category);
      paramIndex++;
    }

    if (filters?.search) {
      query += ` AND (n.title ILIKE $${paramIndex} OR n.message ILIKE $${paramIndex})`;
      queryParams.push(`%${filters.search}%`);
      paramIndex++;
    }

    // Get total count
    const countQuery = query.replace(/SELECT[\s\S]*?FROM/, 'SELECT COUNT(*) as total FROM');
    const countResult = await pool.query(countQuery, queryParams);
    const total = parseInt(countResult.rows[0].total);

    // Add ordering and pagination
    query += ` ORDER BY n.created_at DESC`;
    
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
    
    const notifications: Notification[] = result.rows.map(row => ({
      id: row.id,
      title: row.title,
      type: row.type,
      message: row.message,
      category: row.category,
      priority: row.priority,
      status: row.status,
      content: row.content ?? null,
      sendToAll: row.sendToAll,
      subsiteId: row.subsiteId ?? null,
      sectionId: row.sectionId ?? null,
      specialDivisionId: row.specialDivisionId ?? null,
      subsiteName: row.subsite_name ?? null,
      sectionName: row.section_name ?? null,
      specialDivisionName: row.special_division_name ?? null,
      scheduledDate: row.scheduledDate ? new Date(row.scheduledDate) : null,
      scheduledTime: row.scheduledTime ?? null,
      sentAt: row.sentAt ? new Date(row.sentAt) : null,
      createdBy: row.createdBy ?? null,
      createdAt: new Date(row.createdAt),
      updatedAt: new Date(row.updatedAt)
    }));

    return { notifications, total };
  } catch (error) {
    console.error('Error fetching notifications:', error);
    throw error;
  }
}

/**
 * Get a single notification by ID
 */
export async function getNotificationById(id: number): Promise<Notification | null> {
  try {
    const result = await pool.query(`
      SELECT 
        n.id,
        n.title,
        n.type,
        n.message,
        n.category,
        n.priority,
        n.status,
        n.content,
        n.send_to_all as "sendToAll",
        n.subsite_id as "subsiteId",
        n.section_id as "sectionId",
        n.special_division_id as "specialDivisionId",
        n.scheduled_date as "scheduledDate",
        n.scheduled_time as "scheduledTime",
        n.sent_at as "sentAt",
        n.created_by as "createdBy",
        n.created_at as "createdAt",
        n.updated_at as "updatedAt",
        s.name as subsite_name,
        sec.name as section_name,
        sd.name as special_division_name
      FROM notifications n
      LEFT JOIN subsites s ON n.subsite_id = s.id
      LEFT JOIN sections sec ON n.section_id = sec.id
      LEFT JOIN special_divisions sd ON n.special_division_id = sd.id
      WHERE n.id = $1
    `, [id]);

    if (result.rows.length === 0) {
      return null;
    }

    const row = result.rows[0];
    return {
      id: row.id,
      title: row.title,
      type: row.type,
      message: row.message,
      category: row.category,
      priority: row.priority,
      status: row.status,
      content: row.content || null,
      sendToAll: row.sendToAll,
      subsiteId: row.subsiteId ?? null,
      sectionId: row.sectionId ?? null,
      specialDivisionId: row.specialDivisionId ?? null,
      subsiteName: row.subsite_name ?? null,
      sectionName: row.section_name ?? null,
      specialDivisionName: row.special_division_name ?? null,
      scheduledDate: row.scheduledDate ? new Date(row.scheduledDate) : null,
      scheduledTime: row.scheduledTime ?? null,
      sentAt: row.sentAt ? new Date(row.sentAt) : null,
      createdBy: row.createdBy ?? null,
      createdAt: new Date(row.createdAt),
      updatedAt: new Date(row.updatedAt)
    };
  } catch (error) {
    console.error('Error fetching notification:', error);
    throw error;
  }
}

/**
 * Create a new notification
 */
export async function createNotification(
  notification: Omit<Notification, 'id' | 'createdAt' | 'updatedAt'>,
  recipientUserIds?: number[] // Optional: specific user IDs to send notification to
): Promise<Notification> {
  try {
    const result = await pool.query(`
      INSERT INTO notifications (
        title,
        type,
        message,
        category,
        priority,
        status,
        content,
        send_to_all,
        subsite_id,
        section_id,
        special_division_id,
        scheduled_date,
        scheduled_time,
        created_by
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
      RETURNING id, created_at, updated_at
    `, [
      notification.title,
      notification.type,
      notification.message,
      notification.category,
      notification.priority,
      notification.status || 'draft',
      notification.content || null,
      notification.sendToAll || false,
      notification.subsiteId || null,
      notification.sectionId || null,
      notification.specialDivisionId || null,
      notification.scheduledDate || null,
      notification.scheduledTime || null,
      notification.createdBy || null
    ]);

    const notificationId = result.rows[0].id;

    // If specific user IDs are provided, create user_notification entries
    if (recipientUserIds && recipientUserIds.length > 0) {
      for (const userId of recipientUserIds) {
        await pool.query(`
          INSERT INTO user_notifications (notification_id, user_id)
          VALUES ($1, $2)
          ON CONFLICT (notification_id, user_id) DO NOTHING
        `, [notificationId, userId]);
      }
    }

    const createdNotification = await getNotificationById(notificationId);
    if (!createdNotification) {
      throw new Error('Failed to retrieve created notification');
    }
    return createdNotification;
  } catch (error) {
    console.error('Error creating notification:', error);
    throw error;
  }
}

/**
 * Update a notification
 */
export async function updateNotification(
  id: number,
  notification: Partial<Omit<Notification, 'id' | 'createdAt' | 'updatedAt' | 'createdBy'>>
): Promise<Notification> {
  try {
    const updates: string[] = [];
    const values: any[] = [];
    let paramIndex = 1;

    if (notification.title !== undefined) {
      updates.push(`title = $${paramIndex++}`);
      values.push(notification.title);
    }
    if (notification.type !== undefined) {
      updates.push(`type = $${paramIndex++}`);
      values.push(notification.type);
    }
    if (notification.message !== undefined) {
      updates.push(`message = $${paramIndex++}`);
      values.push(notification.message);
    }
    if (notification.category !== undefined) {
      updates.push(`category = $${paramIndex++}`);
      values.push(notification.category);
    }
    if (notification.priority !== undefined) {
      updates.push(`priority = $${paramIndex++}`);
      values.push(notification.priority);
    }
    if (notification.status !== undefined) {
      updates.push(`status = $${paramIndex++}`);
      values.push(notification.status);
      
      // If status is 'sent', set sent_at
      if (notification.status === 'sent') {
        updates.push(`sent_at = CURRENT_TIMESTAMP`);
      }
    }
    if (notification.content !== undefined) {
      updates.push(`content = $${paramIndex++}`);
      values.push(notification.content);
    }
    if (notification.sendToAll !== undefined) {
      updates.push(`send_to_all = $${paramIndex++}`);
      values.push(notification.sendToAll);
    }
    if (notification.subsiteId !== undefined) {
      updates.push(`subsite_id = $${paramIndex++}`);
      // Explicitly handle null - if null is provided, set to null, otherwise use the value
      values.push(notification.subsiteId);
    }
    if (notification.sectionId !== undefined) {
      updates.push(`section_id = $${paramIndex++}`);
      values.push(notification.sectionId);
    }
    if (notification.specialDivisionId !== undefined) {
      updates.push(`special_division_id = $${paramIndex++}`);
      values.push(notification.specialDivisionId);
    }
    if (notification.scheduledDate !== undefined) {
      updates.push(`scheduled_date = $${paramIndex++}`);
      values.push(notification.scheduledDate || null);
    }
    if (notification.scheduledTime !== undefined) {
      updates.push(`scheduled_time = $${paramIndex++}`);
      values.push(notification.scheduledTime || null);
    }

    if (updates.length === 0) {
      const existing = await getNotificationById(id);
      if (!existing) {
        throw new Error('Notification not found');
      }
      return existing;
    }

    updates.push(`updated_at = CURRENT_TIMESTAMP`);
    values.push(id);

    await pool.query(`
      UPDATE notifications
      SET ${updates.join(', ')}
      WHERE id = $${paramIndex}
    `, values);

    const updatedNotification = await getNotificationById(id);
    if (!updatedNotification) {
      throw new Error('Failed to retrieve updated notification');
    }
    return updatedNotification;
  } catch (error) {
    console.error('Error updating notification:', error);
    throw error;
  }
}

/**
 * Delete a notification
 */
export async function deleteNotification(id: number): Promise<boolean> {
  try {
    const result = await pool.query('DELETE FROM notifications WHERE id = $1', [id]);
    return result.rowCount !== null && result.rowCount > 0;
  } catch (error) {
    console.error('Error deleting notification:', error);
    throw error;
  }
}

/**
 * Send a notification (change status to 'sent')
 */
export async function sendNotification(id: number): Promise<Notification> {
  return await updateNotification(id, { status: 'sent' });
}

/**
 * Schedule a notification (change status to 'scheduled')
 */
export async function scheduleNotification(id: number, scheduledDate: Date, scheduledTime?: string): Promise<Notification> {
  return await updateNotification(id, { 
    status: 'scheduled',
    scheduledDate,
    scheduledTime
  });
}

