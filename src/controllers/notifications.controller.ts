import { Request, Response } from 'express';
import {
  getNotifications,
  getNotificationById,
  createNotification,
  updateNotification,
  deleteNotification,
  sendNotification,
  scheduleNotification
} from '../services/notifications.service';
import { logNotificationOperation, logError } from '../utils/logger.util';

/**
 * Get all notifications with optional filters
 * GET /api/notifications
 */
export async function getAllNotifications(req: Request, res: Response): Promise<void> {
  try {
    // Get userId from query params or from authenticated user session
    // TODO: Get userId from authenticated user session/token when auth is implemented
    const userId = req.query.userId ? parseInt(req.query.userId as string) : undefined;
    
    const filters = {
      status: req.query.status as string,
      type: req.query.type as string,
      category: req.query.category as string,
      search: req.query.search as string,
      limit: req.query.limit ? parseInt(req.query.limit as string) : 10,
      offset: req.query.offset ? parseInt(req.query.offset as string) : undefined,
      page: req.query.page ? parseInt(req.query.page as string) : undefined,
      userId: userId // Add userId filter
    };

    const result = await getNotifications(filters);
    
    res.json({
      success: true,
      notifications: result.notifications,
      total: result.total
    });
  } catch (error: any) {
    console.error('Error in getAllNotifications controller:', error);
    res.status(500).json({ 
      error: 'Internal server error while fetching notifications' 
    });
  }
}

/**
 * Get a single notification by ID
 * GET /api/notifications/:id
 */
export async function getNotification(req: Request, res: Response): Promise<void> {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) {
      res.status(400).json({ error: 'Invalid notification ID' });
      return;
    }

    const notification = await getNotificationById(id);
    
    if (!notification) {
      res.status(404).json({ error: 'Notification not found' });
      return;
    }

    res.json({
      success: true,
      notification
    });
  } catch (error: any) {
    console.error('Error in getNotification controller:', error);
    res.status(500).json({ 
      error: 'Internal server error while fetching notification' 
    });
  }
}

/**
 * Create a new notification
 * POST /api/notifications
 */
export async function create(req: Request, res: Response): Promise<void> {
  try {
    // TODO: Get userId from authenticated user session/token
    const createdBy = req.body.createdBy ? parseInt(req.body.createdBy) : undefined;

    const notificationData = {
      title: req.body.title,
      type: req.body.type || 'normal',
      message: req.body.message,
      category: req.body.category || 'general',
      priority: req.body.priority || 'medium',
      status: req.body.status || 'draft',
      content: req.body.content || '',
      sendToAll: req.body.sendToAll || req.body.send_to_all || false,
      subsiteId: req.body.subsiteId || req.body.subsite_id || undefined,
      sectionId: req.body.sectionId || req.body.section_id || undefined,
      specialDivisionId: req.body.specialDivisionId || req.body.special_division_id || undefined,
      scheduledDate: req.body.scheduledDate || req.body.scheduled_date ? new Date(req.body.scheduledDate || req.body.scheduled_date) : undefined,
      scheduledTime: req.body.scheduledTime || req.body.scheduled_time || undefined,
      createdBy
    };

    // Validate required fields
    if (!notificationData.title || !notificationData.message) {
      res.status(400).json({ error: 'Title and message are required' });
      return;
    }

    const notification = await createNotification(notificationData);
    
    // Log notification creation
    await logNotificationOperation('info', 'create', notificationData.title, notification.id, createdBy, req);
    
    res.status(201).json({
      success: true,
      message: 'Notification created successfully',
      notification
    });
  } catch (error: any) {
    console.error('Error in create controller:', error);
    res.status(500).json({ 
      error: 'Internal server error while creating notification' 
    });
  }
}

/**
 * Update a notification
 * PUT /api/notifications/:id
 */
export async function update(req: Request, res: Response): Promise<void> {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) {
      res.status(400).json({ error: 'Invalid notification ID' });
      return;
    }

    const notificationData: any = {};
    
    if (req.body.title !== undefined) notificationData.title = req.body.title;
    if (req.body.type !== undefined) notificationData.type = req.body.type;
    if (req.body.message !== undefined) notificationData.message = req.body.message;
    if (req.body.category !== undefined) notificationData.category = req.body.category;
    if (req.body.priority !== undefined) notificationData.priority = req.body.priority;
    if (req.body.status !== undefined) notificationData.status = req.body.status;
    if (req.body.content !== undefined) notificationData.content = req.body.content;
    if (req.body.sendToAll !== undefined || req.body.send_to_all !== undefined) {
      notificationData.sendToAll = req.body.sendToAll !== undefined ? req.body.sendToAll : req.body.send_to_all;
    }
    if (req.body.subsiteId !== undefined || req.body.subsite_id !== undefined) {
      // Explicitly handle null values - use null if provided, otherwise use the other field
      notificationData.subsiteId = req.body.subsiteId !== undefined ? req.body.subsiteId : req.body.subsite_id;
    }
    if (req.body.sectionId !== undefined || req.body.section_id !== undefined) {
      notificationData.sectionId = req.body.sectionId !== undefined ? req.body.sectionId : req.body.section_id;
    }
    if (req.body.specialDivisionId !== undefined || req.body.special_division_id !== undefined) {
      notificationData.specialDivisionId = req.body.specialDivisionId !== undefined ? req.body.specialDivisionId : req.body.special_division_id;
    }
    if (req.body.scheduledDate !== undefined || req.body.scheduled_date !== undefined) {
      notificationData.scheduledDate = req.body.scheduledDate || req.body.scheduled_date 
        ? new Date(req.body.scheduledDate || req.body.scheduled_date) 
        : undefined;
    }
    if (req.body.scheduledTime !== undefined || req.body.scheduled_time !== undefined) {
      notificationData.scheduledTime = req.body.scheduledTime || req.body.scheduled_time;
    }

    const notification = await updateNotification(id, notificationData);
    
    // Log notification update
    await logNotificationOperation('info', 'update', notification.title || req.body.title || 'Unknown', id, (req as any).user?.id, req);
    
    res.json({
      success: true,
      message: 'Notification updated successfully',
      notification
    });
  } catch (error: any) {
    console.error('Error in update controller:', error);
    res.status(500).json({ 
      error: 'Internal server error while updating notification' 
    });
  }
}

/**
 * Delete a notification
 * DELETE /api/notifications/:id
 */
export async function remove(req: Request, res: Response): Promise<void> {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) {
      res.status(400).json({ error: 'Invalid notification ID' });
      return;
    }

    // Get notification info before deletion for logging
    const notification = await getNotificationById(id);
    const title = notification?.title || 'Unknown';
    
    const deleted = await deleteNotification(id);
    
    if (!deleted) {
      res.status(404).json({ error: 'Notification not found' });
      return;
    }

    // Log notification deletion
    await logNotificationOperation('warning', 'delete', title, id, (req as any).user?.id, req);

    res.json({
      success: true,
      message: 'Notification deleted successfully'
    });
  } catch (error: any) {
    console.error('Error in remove controller:', error);
    res.status(500).json({ 
      error: 'Internal server error while deleting notification' 
    });
  }
}

/**
 * Send a notification
 * POST /api/notifications/:id/send
 */
export async function send(req: Request, res: Response): Promise<void> {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) {
      res.status(400).json({ error: 'Invalid notification ID' });
      return;
    }

    const notification = await sendNotification(id);
    
    res.json({
      success: true,
      message: 'Notification sent successfully',
      notification
    });
  } catch (error: any) {
    console.error('Error in send controller:', error);
    res.status(500).json({ 
      error: 'Internal server error while sending notification' 
    });
  }
}

/**
 * Schedule a notification
 * POST /api/notifications/:id/schedule
 */
export async function schedule(req: Request, res: Response): Promise<void> {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) {
      res.status(400).json({ error: 'Invalid notification ID' });
      return;
    }

    const scheduledDate = req.body.scheduledDate || req.body.scheduled_date 
      ? new Date(req.body.scheduledDate || req.body.scheduled_date) 
      : new Date();
    const scheduledTime = req.body.scheduledTime || req.body.scheduled_time;

    if (!scheduledDate || isNaN(scheduledDate.getTime())) {
      res.status(400).json({ error: 'Invalid scheduled date' });
      return;
    }

    const notification = await scheduleNotification(id, scheduledDate, scheduledTime);
    
    res.json({
      success: true,
      message: 'Notification scheduled successfully',
      notification
    });
  } catch (error: any) {
    console.error('Error in schedule controller:', error);
    res.status(500).json({ 
      error: 'Internal server error while scheduling notification' 
    });
  }
}

