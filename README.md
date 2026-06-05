# Screening Backend API

Node.js backend for Screening System with real network scanning capabilities.

## Features

- ✅ Real network scanning for Android TV devices
- ✅ Device discovery using ping and ARP
- ✅ Screen registration and management
- ✅ RESTful API endpoints
- ✅ TypeScript support

## Installation

```bash
npm install
```

## Development

```bash
npm run dev
```

Server will run on `http://localhost:3000`

## Production

```bash
npm run build
npm start
```

## API Endpoints

### Network Scanning
- `POST /api/screens/scan` - Start network scan
- `GET /api/screens/scan/:scanId/status` - Get scan progress
- `GET /api/screens/discover` - Get discovered devices

### Screen Management
- `POST /api/screens/register` - Register a screen
- `GET /api/screens` - Get all screens
- `GET /api/screens/:id/status` - Get screen status
- `DELETE /api/screens/:id` - Delete screen

## Network Scanning

The scanner:
1. Detects local network IP range automatically
2. Pings all IPs in the range (1-254)
3. Gets MAC addresses from ARP table
4. Identifies Android TV devices
5. Returns discovered devices

**Note:** Network scanning requires appropriate system permissions. On macOS/Linux, you may need to run with sudo for ARP access.

## Environment Variables

Create `.env` file:
```
PORT=3000
NODE_ENV=development
FRONTEND_URL=http://localhost:4200
```

## Technology Stack

- Node.js + Express
- TypeScript
- ping (for device detection)
- Built-in OS modules (for network interfaces)

