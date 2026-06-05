import { Request, Response } from 'express';
import * as systemLogService from '../services/system-log.service';
import { LogLevel } from '../types/system-log.types';

/**
 * GET /api/system-logs
 * Get all system logs with optional filters
 */
export const getLogs = async (req: Request, res: Response) => {
  try {
    const filters = {
      level: req.query.level as LogLevel | undefined,
      module: req.query.module as string | undefined,
      action: req.query.action as string | undefined,
      userId: req.query.userId ? parseInt(req.query.userId as string) : undefined,
      search: req.query.search as string | undefined,
      startDate: req.query.startDate ? new Date(req.query.startDate as string) : undefined,
      endDate: req.query.endDate ? new Date(req.query.endDate as string) : undefined,
      limit: req.query.limit ? parseInt(req.query.limit as string) : 50,
      page: req.query.page ? parseInt(req.query.page as string) : 1
    };

    const result = await systemLogService.getLogs(filters);
    res.json({
      success: true,
      logs: result.logs,
      total: result.total
    });
  } catch (error: any) {
    console.error('Error getting system logs:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to get system logs'
    });
  }
};

/**
 * GET /api/system-logs/:id
 * Get log by ID
 */
export const getLogById = async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid log ID'
      });
    }

    const log = await systemLogService.getLogById(id);
    if (!log) {
      return res.status(404).json({
        success: false,
        error: 'Log not found'
      });
    }

    res.json({
      success: true,
      log
    });
  } catch (error: any) {
    console.error('Error getting system log:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to get system log'
    });
  }
};

/**
 * POST /api/system-logs
 * Create a new log entry
 */
export const createLog = async (req: Request, res: Response) => {
  try {
    const { level, module, action, message, details, userId, ipAddress, userAgent } = req.body;

    if (!level || !module || !action || !message) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: level, module, action, message'
      });
    }

    if (!['info', 'warning', 'error', 'success', 'debug'].includes(level)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid log level'
      });
    }

    const log = await systemLogService.createLog({
      level,
      module,
      action,
      message,
      details,
      userId: userId || (req as any).user?.id,
      ipAddress: ipAddress || req.ip,
      userAgent: userAgent || req.get('user-agent')
    });

    res.json({
      success: true,
      message: 'Log created successfully',
      log
    });
  } catch (error: any) {
    console.error('Error creating system log:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to create system log'
    });
  }
};

/**
 * GET /api/system-logs/modules/list
 * Get unique modules
 */
export const getUniqueModules = async (req: Request, res: Response) => {
  try {
    const modules = await systemLogService.getUniqueModules();
    res.json({
      success: true,
      modules
    });
  } catch (error: any) {
    console.error('Error getting unique modules:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to get unique modules'
    });
  }
};

/**
 * GET /api/system-logs/actions/list
 * Get unique actions
 */
export const getUniqueActions = async (req: Request, res: Response) => {
  try {
    const actions = await systemLogService.getUniqueActions();
    res.json({
      success: true,
      actions
    });
  } catch (error: any) {
    console.error('Error getting unique actions:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to get unique actions'
    });
  }
};

/**
 * DELETE /api/system-logs/:id
 * Delete log by ID
 */
export const deleteLog = async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid log ID'
      });
    }

    await systemLogService.deleteLog(id);

    res.json({
      success: true,
      message: 'Log deleted successfully'
    });
  } catch (error: any) {
    console.error('Error deleting system log:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to delete system log'
    });
  }
};

/**
 * DELETE /api/system-logs/cleanup
 * Delete old logs
 */
export const cleanupOldLogs = async (req: Request, res: Response) => {
  try {
    const daysToKeep = req.query.days ? parseInt(req.query.days as string) : 90;
    const deletedCount = await systemLogService.deleteOldLogs(daysToKeep);

    res.json({
      success: true,
      message: `Deleted ${deletedCount} old log entries`,
      deletedCount
    });
  } catch (error: any) {
    console.error('Error cleaning up old logs:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to cleanup old logs'
    });
  }
};

