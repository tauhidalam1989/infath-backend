# PM2 Commands for Windows Server

## PM2 Installation

```powershell
# Install PM2 globally
npm install -g pm2

# Install PM2 Windows startup (optional - for auto-start on boot)
npm install -g pm2-windows-startup
```

## PM2 Commands for Backend

### Start Backend with PM2

```powershell
# Navigate to backend directory
cd C:\path\to\screening-backend

# Start backend with PM2
pm2 start dist/server.js --name screening-backend

# Or if using TypeScript directly
pm2 start src/server.ts --name screening-backend --interpreter ts-node

# Save PM2 configuration
pm2 save
```

### PM2 Management Commands

```powershell
# View all running processes
pm2 list

# View logs
pm2 logs screening-backend

# View logs (last 100 lines)
pm2 logs screening-backend --lines 100

# Stop backend
pm2 stop screening-backend

# Restart backend
pm2 restart screening-backend

# Delete from PM2
pm2 delete screening-backend

# Monitor (real-time)
pm2 monit

# View process info
pm2 show screening-backend

# Reload (zero-downtime restart)
pm2 reload screening-backend
```

### PM2 Startup (Auto-start on Windows Boot)

```powershell
# Setup PM2 to start on Windows boot
pm2-startup install

# After running above command, save current PM2 processes
pm2 save
```

## Domain Mapping Setup

**Important:** Domain mapping is done through **IIS** (not PM2). PM2 only runs the Node.js backend.

### Step 1: Ensure Backend is Running with PM2

```powershell
# Start backend
cd C:\path\to\screening-backend
pm2 start dist/server.js --name screening-backend
pm2 save

# Verify it's running
pm2 list
pm2 logs screening-backend
```

### Step 2: Verify Backend is Accessible

```powershell
# Test localhost:3000
Invoke-WebRequest -Uri "http://localhost:3000/" -UseBasicParsing
Invoke-WebRequest -Uri "http://localhost:3000/api/health" -UseBasicParsing
```

### Step 3: Domain Mapping (Already Configured in web.config)

Domain mapping is handled by IIS using the `web.config` file we already created.

**Verify web.config is in place:**
```
C:\inetpub\screening-backend\web.config
```

**The web.config already maps:**
- `screening-backend.infath.gov.sa` → `localhost:3000`
- All routes are proxied through IIS

### Step 4: Test Domain

```powershell
# Test domain
Invoke-WebRequest -Uri "http://screening-backend.infath.gov.sa/" -UseBasicParsing
Invoke-WebRequest -Uri "http://screening-backend.infath.gov.sa/api/health" -UseBasicParsing
```

## Complete Setup Workflow

### 1. Build Backend (if needed)

```powershell
cd C:\path\to\screening-backend
npm install
npm run build
```

### 2. Start with PM2

```powershell
pm2 start dist/server.js --name screening-backend
pm2 save
```

### 3. Verify PM2 Status

```powershell
pm2 list
pm2 logs screening-backend
```

### 4. Verify IIS Configuration

```powershell
# Check if IIS website is running
Get-Website -Name "Screening Backend"

# Restart IIS if needed
iisreset
```

### 5. Test Everything

```powershell
# Test localhost
Invoke-WebRequest -Uri "http://localhost:3000/api/health" -UseBasicParsing

# Test domain
Invoke-WebRequest -Uri "http://screening-backend.infath.gov.sa/api/health" -UseBasicParsing
```

## Troubleshooting

### Backend Not Starting

```powershell
# Check PM2 logs
pm2 logs screening-backend --err

# Check if port 3000 is in use
netstat -ano | findstr :3000

# Kill process on port 3000 (if needed)
# Find PID from above command, then:
taskkill /PID <PID> /F
```

### Domain Not Working

```powershell
# Check IIS website status
Get-Website -Name "Screening Backend"

# Check web.config exists
Test-Path C:\inetpub\screening-backend\web.config

# View IIS logs
Get-Content C:\inetpub\logs\LogFiles\W3SVC1\*.log -Tail 50

# Restart IIS
iisreset
```

### PM2 Process Crashed

```powershell
# View error logs
pm2 logs screening-backend --err

# Restart
pm2 restart screening-backend

# Check if backend code has errors
cd C:\path\to\screening-backend
node dist/server.js
```

## Quick Reference

```powershell
# Start
pm2 start dist/server.js --name screening-backend

# Stop
pm2 stop screening-backend

# Restart
pm2 restart screening-backend

# Logs
pm2 logs screening-backend

# List
pm2 list

# Delete
pm2 delete screening-backend

# Save configuration
pm2 save
```

## Summary

✅ **PM2** = Runs Node.js backend on `localhost:3000`
✅ **IIS** = Maps domain `screening-backend.infath.gov.sa` to `localhost:3000`
✅ **web.config** = Already configured for domain mapping

**Flow:**
```
User → screening-backend.infath.gov.sa → IIS → localhost:3000 (PM2) → Node.js Backend
```



