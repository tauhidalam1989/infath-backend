import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { createServer as createHttpServer } from 'http';
import { createServer as createHttpsServer } from 'https';
import { readFileSync, existsSync } from 'fs';
import * as path from 'path';
import * as fs from 'fs';
import { Server } from 'socket.io';
import * as os from 'os';
import screensRouter from './routes/screens.routes';
import subsitesRouter from './routes/subsites.routes';
import sectionsRouter from './routes/sections.routes';
import specialDivisionsRouter from './routes/specialDivisions.routes';
import usersRouter from './routes/users.routes';
import authRouter from './routes/auth.routes';
import notificationSettingsRouter from './routes/notificationSettings.routes';
import notificationsRouter from './routes/notifications.routes';
import whatsappTemplatesRouter from './routes/whatsappTemplates.routes';
import whatsappMessagesRouter from './routes/whatsapp-messages.routes';
import notificationConfigRouter from './routes/notification-config.routes';
import systemLogsRouter from './routes/system-logs.routes';
import advertisementsRouter from './routes/advertisements.routes';
import cloudStorageRouter from './routes/cloud-storage.routes';
import { testConnection, initializeDatabase, runGrantPermissions } from './config/database';
import { getUploadsDir } from './config/uploads';
import { setupSocketIO } from './services/socket.service';

// Project root (when running from dist/, __dirname is dist/) - so .env and ssl/ work with any cwd
const projectRoot = path.join(__dirname, '..');
dotenv.config({ path: path.join(projectRoot, '.env') });

const app = express();

function resolveSslPath(envPath: string | undefined): string | null {
  if (!envPath) return null;
  if (path.isAbsolute(envPath)) return existsSync(envPath) ? envPath : null;
  const resolved = path.join(projectRoot, envPath);
  return existsSync(resolved) ? resolved : null;
}

// Under IIS/iisnode, PORT is a named pipe; IIS does SSL termination, so Node must use HTTP only
const PORT_RAW = process.env.PORT || '';
const IS_IIS_PIPE = PORT_RAW.startsWith('\\\\.\\') || PORT_RAW.includes('\\pipe\\');

const sslKeyPath = resolveSslPath(process.env.SSL_KEY_PATH);
const sslCertPath = resolveSslPath(process.env.SSL_CERT_PATH);
const useSSL = !IS_IIS_PIPE && !!(sslKeyPath && sslCertPath);

let server: import('http').Server | import('https').Server;

if (useSSL) {
  try {
    const key = readFileSync(sslKeyPath!, 'utf8');
    const cert = readFileSync(sslCertPath!, 'utf8');
    server = createHttpsServer({ key, cert }, app);
    console.log('🔒 SSL enabled:', sslCertPath);
  } catch (err) {
    console.error('❌ Failed to load SSL certs:', err);
    process.exit(1);
  }
} else {
  server = createHttpServer(app);
  if (IS_IIS_PIPE) {
    console.log('🌐 Running behind IIS (iisnode); using HTTP (IIS handles SSL).');
  } else if (process.env.SSL_KEY_PATH || process.env.SSL_CERT_PATH) {
    console.warn('⚠️ SSL env set but cert/key not found. Serving HTTP only.');
  }
}

const io = new Server(server, {
  cors: {
    origin: '*', // Allow all origins (including production) for mobile/web players
    methods: ['GET', 'POST'],
    credentials: true,
    allowedHeaders: ['*']
  },
  transports: ['websocket', 'polling'],
  allowEIO3: true
});

const PORT_OR_PIPE = process.env.PORT;
const PORT = IS_IIS_PIPE ? 0 : (() => {
  const p = parseInt(PORT_OR_PIPE || '3000', 10);
  return Number.isFinite(p) && p > 0 && p < 65536 ? p : 3000;
})();

// Middleware - Allow all origins for mobile devices and web players
app.use(cors({
  origin: '*',
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With']
}));
// Ensure JSON responses are explicitly UTF-8 (fixes Arabic and other non-ASCII in API responses)
app.use((_req, res, next) => {
  const originalJson = res.json.bind(res);
  res.json = function (body: unknown) {
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    return originalJson(body);
  };
  next();
});
app.use(express.json({ limit: '200mb' }));
app.use(express.urlencoded({ extended: true, limit: '200mb' }));

// Serve static files (uploads) - same path as local file uploads (config/uploads.ts)
app.use('/uploads', express.static(getUploadsDir()));

// Serve web player: from dist/player when running from dist, else from backend/player (dev)
const playerDir = fs.existsSync(path.join(__dirname, 'player'))
  ? path.join(__dirname, 'player')
  : path.join(__dirname, '..', 'player');
if (fs.existsSync(playerDir)) {
  app.get('/player', (_req, res) => res.redirect('/player/index.html'));
  app.get('/player/', (_req, res) => res.redirect('/player/index.html'));
  app.use('/player', express.static(playerDir));
  console.log('📱 Web player served at /player (from ' + playerDir + ')');
} else {
  console.warn('📱 Web player folder not found at', playerDir, '- deploy backend/player/ or dist/player/ with index.html for /player to work');
}

// Routes
app.use('/api/auth', authRouter);
app.use('/api/screens', screensRouter);
app.use('/api/subsites', subsitesRouter);
app.use('/api/sections', sectionsRouter);
app.use('/api/special-divisions', specialDivisionsRouter);
app.use('/api/users', usersRouter);
app.use('/api/notification-settings', notificationSettingsRouter);
app.use('/api/notifications', notificationsRouter);
app.use('/api/whatsapp-templates', whatsappTemplatesRouter);
app.use('/api/whatsapp-messages', whatsappMessagesRouter);
app.use('/api/notification-configs', notificationConfigRouter);
app.use('/api/system-logs', systemLogsRouter);
app.use('/api/advertisements', advertisementsRouter);
app.use('/api/cloud-storage', cloudStorageRouter);

// Root route
app.get('/', (req, res) => {
  const protocol = useSSL ? 'https' : 'http';
  const host = req.headers.host || (IS_IIS_PIPE ? 'localhost' : `localhost:${PORT}`);
  res.json({
    message: 'Screening Backend API',
    version: '1.0.0',
    status: 'running',
    endpoints: {
      health: '/api/health',
      api: '/api',
      screens: '/api/screens',
      advertisements: '/api/advertisements',
      users: '/api/users',
      auth: '/api/auth',
      socketIO: `${protocol}://${host}`
    },
    documentation: 'API endpoints are available under /api/*'
  });
});

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', message: 'Screening Backend API is running' });
});

// One-time fix for "permission denied for table screen_regions" – run grants as postgres on the DB this app uses
app.get('/api/admin/grant-db', async (req, res) => {
  const secret = process.env.GRANT_DB_SECRET;
  const provided = (req.query.secret as string) || (req.headers['x-grant-secret'] as string);
  if (!secret || provided !== secret) {
    res.status(403).json({ error: 'Forbidden' });
    return;
  }
  try {
    const result = await runGrantPermissions();
    res.status(result.ok ? 200 : 500).json(result);
  } catch (e) {
    res.status(500).json({ ok: false, message: (e as Error).message });
  }
});

// Initialize database and start server
async function startServer() {
  try {
    const dbConnected = await testConnection();
    if (!dbConnected) {
      console.error('❌ Failed to connect to database. Server will start but database operations may fail.');
      console.warn('⚠️ Socket.IO and API endpoints will work, but database-dependent features may not function.');
      console.warn('⚠️ The server will continue running and attempt to reconnect automatically.');
    } else {
      try {
        await initializeDatabase();
      } catch (error: unknown) {
        const err = error as Error;
        console.error('❌ Error initializing database tables:', err.message);
        console.warn('⚠️ Server will continue, but database operations may fail.');
      }
    }

    setupSocketIO(io);

    const HOST = process.env.HOST || '0.0.0.0';
    const protocol = useSSL ? 'https' : 'http';

    const networkInterfaces = os.networkInterfaces();
    let localIP = 'localhost';
    for (const interfaceName in networkInterfaces) {
      const addresses = networkInterfaces[interfaceName];
      if (addresses) {
        for (const address of addresses) {
          if (address.family === 'IPv4' && !address.internal) {
            localIP = address.address;
            break;
          }
        }
        if (localIP !== 'localhost') break;
      }
    }

    const listenCallback = () => {
      const listenAddr = IS_IIS_PIPE ? '(IIS named pipe)' : `${protocol}://${HOST}:${PORT}`;
      console.log('🚀 Server running on', listenAddr);
      if (!IS_IIS_PIPE) {
        console.log('📡 API available at', `${protocol}://${HOST}:${PORT}/api`);
        console.log('🔌 Socket.IO available at', `${protocol}://${HOST}:${PORT}`);
        console.log('📁 Uploads served from:', getUploadsDir());
        console.log('💾 Database:', `${process.env.DB_NAME}@${process.env.DB_HOST}:${process.env.DB_PORT}`);
        console.log('\n📱 Mobile Access URLs:');
        console.log('   API:', `${protocol}://${localIP}:${PORT}/api`);
        console.log('   Socket.IO:', `${protocol}://${localIP}:${PORT}`);
        console.log('\n💡 Update your mobile app config.ts with:', `${protocol}://${localIP}:${PORT}`);
      }
    };

    if (IS_IIS_PIPE && PORT_OR_PIPE) {
      server.listen(PORT_OR_PIPE, listenCallback);
    } else {
      server.listen(PORT, HOST, listenCallback);
    }
  } catch (error) {
    console.error('❌ Failed to start server:', error);
    process.exit(1);
  }
}

startServer();
