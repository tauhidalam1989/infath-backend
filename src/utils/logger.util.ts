import * as systemLogService from '../services/system-log.service';
import { LogLevel } from '../types/system-log.types';

/**
 * Utility function to create system logs
 * This can be used throughout the application to log important events
 */
export async function logEvent(
  level: LogLevel,
  module: string,
  action: string,
  message: string,
  details?: Record<string, any>,
  userId?: number,
  ipAddress?: string,
  userAgent?: string
): Promise<void> {
  try {
    await systemLogService.createLog({
      level,
      module,
      action,
      message,
      details,
      userId: userId || undefined,
      ipAddress: ipAddress || undefined,
      userAgent: userAgent || undefined
    });
  } catch (error) {
    // Don't throw error if logging fails - just log to console
    console.error('Failed to create system log:', error);
  }
}

/**
 * Helper function to extract user info from request
 */
export function getUserInfo(req: any): { userId?: number; ipAddress?: string; userAgent?: string } {
  return {
    userId: req.user?.id || req.body?.userId || undefined,
    ipAddress: req.ip || req.connection?.remoteAddress || req.headers['x-forwarded-for'] || undefined,
    userAgent: req.get('user-agent') || undefined
  };
}

/**
 * Log successful login
 */
export async function logLoginSuccess(
  username: string,
  userId: number,
  req: any
): Promise<void> {
  const userInfo = getUserInfo(req);
  await logEvent(
    'success',
    'authentication',
    'login',
    `User ${username} logged in successfully`,
    { username, userId },
    userId,
    userInfo.ipAddress,
    userInfo.userAgent
  );
}

/**
 * Log failed login attempt
 */
export async function logLoginFailure(
  username: string,
  reason: string,
  req: any
): Promise<void> {
  const userInfo = getUserInfo(req);
  await logEvent(
    'warning',
    'authentication',
    'login_failed',
    `Failed login attempt for ${username}: ${reason}`,
    { username, reason },
    undefined,
    userInfo.ipAddress,
    userInfo.userAgent
  );
}

/**
 * Log user creation
 */
export async function logUserCreated(
  username: string,
  createdBy?: number,
  req?: any
): Promise<void> {
  const userInfo = req ? getUserInfo(req) : {};
  await logEvent(
    'info',
    'users',
    'create',
    `User ${username} was created`,
    { username, createdBy },
    createdBy || userInfo.userId,
    userInfo.ipAddress,
    userInfo.userAgent
  );
}

/**
 * Log user update
 */
export async function logUserUpdated(
  userId: number,
  username: string,
  updatedBy?: number,
  req?: any
): Promise<void> {
  const userInfo = req ? getUserInfo(req) : {};
  await logEvent(
    'info',
    'users',
    'update',
    `User ${username} (ID: ${userId}) was updated`,
    { userId, username, updatedBy },
    updatedBy || userInfo.userId,
    userInfo.ipAddress,
    userInfo.userAgent
  );
}

/**
 * Log user deletion
 */
export async function logUserDeleted(
  userId: number,
  username: string,
  deletedBy?: number,
  req?: any
): Promise<void> {
  const userInfo = req ? getUserInfo(req) : {};
  await logEvent(
    'warning',
    'users',
    'delete',
    `User ${username} (ID: ${userId}) was deleted`,
    { userId, username, deletedBy },
    deletedBy || userInfo.userId,
    userInfo.ipAddress,
    userInfo.userAgent
  );
}

/**
 * Log location operation (subsite, section, special division)
 */
export async function logLocationOperation(
  level: LogLevel,
  module: 'subsites' | 'sections' | 'special_divisions',
  action: 'create' | 'update' | 'delete',
  name: string,
  id?: number,
  userId?: number,
  req?: any
): Promise<void> {
  const userInfo = req ? getUserInfo(req) : {};
  await logEvent(
    level,
    module,
    action,
    `${module.replace('_', ' ')} ${name}${id ? ` (ID: ${id})` : ''} was ${action}d`,
    { id, name, module, action },
    userId || userInfo.userId,
    userInfo.ipAddress,
    userInfo.userAgent
  );
}

/**
 * Log notification operation
 */
export async function logNotificationOperation(
  level: LogLevel,
  action: 'create' | 'update' | 'delete' | 'send',
  title: string,
  id?: number,
  userId?: number,
  req?: any
): Promise<void> {
  const userInfo = req ? getUserInfo(req) : {};
  await logEvent(
    level,
    'notifications',
    action,
    `Notification "${title}"${id ? ` (ID: ${id})` : ''} was ${action}d`,
    { id, title, action },
    userId || userInfo.userId,
    userInfo.ipAddress,
    userInfo.userAgent
  );
}

/**
 * Log WhatsApp template operation
 */
export async function logWhatsAppTemplateOperation(
  level: LogLevel,
  action: 'create' | 'update' | 'delete',
  name: string,
  id?: number,
  userId?: number,
  req?: any
): Promise<void> {
  const userInfo = req ? getUserInfo(req) : {};
  await logEvent(
    level,
    'whatsapp_templates',
    action,
    `WhatsApp template "${name}"${id ? ` (ID: ${id})` : ''} was ${action}d`,
    { id, name, action },
    userId || userInfo.userId,
    userInfo.ipAddress,
    userInfo.userAgent
  );
}

/**
 * Log WhatsApp message sent
 */
export async function logWhatsAppMessageSent(
  messageType: 'individual' | 'bulk',
  recipientCount: number,
  userId?: number,
  req?: any
): Promise<void> {
  const userInfo = req ? getUserInfo(req) : {};
  await logEvent(
    'info',
    'whatsapp_messages',
    'send',
    `${messageType === 'individual' ? 'Individual' : 'Bulk'} WhatsApp message sent to ${recipientCount} recipient(s)`,
    { messageType, recipientCount },
    userId || userInfo.userId,
    userInfo.ipAddress,
    userInfo.userAgent
  );
}

/**
 * Log error
 */
export async function logError(
  module: string,
  action: string,
  error: Error | string,
  userId?: number,
  req?: any
): Promise<void> {
  const userInfo = req ? getUserInfo(req) : {};
  const errorMessage = error instanceof Error ? error.message : error;
  const errorStack = error instanceof Error ? error.stack : undefined;
  
  await logEvent(
    'error',
    module,
    action,
    `Error in ${module}/${action}: ${errorMessage}`,
    { error: errorMessage, stack: errorStack },
    userId || userInfo.userId,
    userInfo.ipAddress,
    userInfo.userAgent
  );
}

