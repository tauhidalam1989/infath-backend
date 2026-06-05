import * as net from 'net';
import { SystemLog, LogLevel } from '../types/system-log.types';

function isSyslogEnabled(): boolean {
  return (process.env.SYSLOG_ENABLED || '').toLowerCase() === 'true';
}

function getSyslogHost(): string | null {
  return process.env.SYSLOG_HOST || '10.201.101.9';
}

function getSyslogPort(): number | null {
  const raw = process.env.SYSLOG_PORT || '1521';
  const port = parseInt(raw, 10);
  if (!Number.isFinite(port) || port <= 0 || port > 65535) {
    return null;
  }
  return port;
}

function mapLevelToSeverity(level: LogLevel): number {
  // Syslog severities: 0=emerg,1=alert,2=crit,3=err,4=warn,5=notice,6=info,7=debug
  switch (level) {
    case 'error':
      return 3;
    case 'warning':
      return 4;
    case 'success':
    case 'info':
      return 6;
    case 'debug':
    default:
      return 7;
  }
}

/**
 * Forward a system log entry to external SIM via Syslog over TCP.
 * Non-blocking and best-effort: failures are logged to console but do not throw.
 */
export function forwardSystemLogToSim(log: SystemLog): void {
  try {
    if (!isSyslogEnabled()) {
      return;
    }

    const host = getSyslogHost();
    const port = getSyslogPort();

    if (!host || !port) {
      console.error('Syslog forwarding enabled but SYSLOG_HOST or SYSLOG_PORT is invalid.');
      return;
    }

    const severity = mapLevelToSeverity(log.level);
    const facility = 13; // user-level messages (1) or custom; keep 13 as generic app
    const pri = facility * 8 + severity;

    const now = log.createdAt instanceof Date ? log.createdAt : new Date();
    const timestamp = now.toISOString();

    const hostName = process.env.HOSTNAME || process.env.COMPUTERNAME || 'screen-backend';
    const appName = 'screen-backend';

    // Send main fields and details as JSON payload
    const payload = {
      id: log.id,
      level: log.level,
      module: log.module,
      action: log.action,
      message: log.message,
      details: log.details || null,
      userId: log.userId ?? null,
      ipAddress: log.ipAddress ?? null,
      userAgent: log.userAgent ?? null,
      createdAt: now.toISOString()
    };

    const msg = `<${pri}> ${timestamp} ${hostName} ${appName} - - - ${JSON.stringify(payload)}`;

    const socket = new net.Socket();

    socket.on('error', (err) => {
      console.error('Failed to forward system log to SIM via syslog:', err.message);
      try {
        socket.destroy();
      } catch {
        // ignore
      }
    });

    socket.connect(port, host, () => {
      socket.write(msg + '\n', () => {
        socket.end();
      });
    });
  } catch (err) {
    console.error('Unexpected error while forwarding system log to SIM:', (err as Error).message);
  }
}

