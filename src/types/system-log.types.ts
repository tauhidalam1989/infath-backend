export type LogLevel = 'info' | 'warning' | 'error' | 'success' | 'debug';

export interface SystemLog {
  id?: number;
  level: LogLevel;
  module: string;
  action: string;
  message: string;
  details?: Record<string, any> | null;
  userId?: number | null;
  ipAddress?: string | null;
  userAgent?: string | null;
  createdAt?: Date;
  userName?: string | null;
}

export interface SystemLogListResponse {
  success: boolean;
  logs: SystemLog[];
  total: number;
}

export interface SystemLogResponse {
  success: boolean;
  log: SystemLog;
}

export interface CreateLogRequest {
  level: LogLevel;
  module: string;
  action: string;
  message: string;
  details?: Record<string, any>;
  userId?: number;
  ipAddress?: string;
  userAgent?: string;
}

