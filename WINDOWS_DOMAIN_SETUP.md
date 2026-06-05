# Windows Server Domain Setup Guide
## screening-backend.infath.gov.sa → localhost:3000

यह guide Windows Server पर IIS के साथ domain mapping setup करने में help करेगा।

## Prerequisites

1. **Windows Server** (2012 R2 या बाद)
2. **IIS installed** with:
   - Application Request Routing (ARR) module
   - URL Rewrite module
3. **Node.js backend** running on `localhost:3000`
4. **Domain DNS** configured to point to your server IP

## Step 1: Install Required IIS Modules

### Install ARR (Application Request Routing)

1. Download from: https://www.iis.net/downloads/microsoft/application-request-routing
2. Install **Application Request Routing 3.0**
3. Restart IIS

### Install URL Rewrite

1. Download from: https://www.iis.net/downloads/microsoft/url-rewrite
2. Install **URL Rewrite Module 2.1**
3. Restart IIS

## Step 2: Enable ARR Proxy

1. Open **IIS Manager**
2. Select **server node** (top level, not a website)
3. Double-click **Application Request Routing Cache**
4. Click **Server Proxy Settings** (right panel)
5. Check **Enable proxy**
6. Click **Apply**

## Step 3: Create Website in IIS

### Option A: Using PowerShell Script

```powershell
# Run the deployment script
cd C:\path\to\screening-backend
.\deploy-iis.ps1
```

### Option B: Manual Setup

1. **Create Application Pool:**
   - Open IIS Manager
   - Right-click **Application Pools** → **Add Application Pool**
   - **Name:** `ScreeningBackend`
   - **.NET CLR Version:** **No Managed Code**
   - **Managed Pipeline Mode:** **Integrated**
   - Click **OK**

2. **Configure Application Pool:**
   - Select `ScreeningBackend` pool
   - Click **Advanced Settings**
   - Set **Idle Time-out** to `0` (prevent shutdown)
   - Set **Start Mode** to `AlwaysRunning` (optional)

3. **Create Website:**
   - Right-click **Sites** → **Add Website**
   - **Site name:** `Screening Backend`
   - **Application pool:** `ScreeningBackend`
   - **Physical path:** `C:\inetpub\screening-backend` (create folder first)
   - **Binding:**
     - **Type:** HTTP
     - **IP address:** All Unassigned
     - **Port:** 80
     - **Host name:** `screening-backend.infath.gov.sa` ⬅️ **Important!**
   - Click **OK**

## Step 4: Copy web.config

1. Copy `web.config` file to website root directory:
   ```
   C:\inetpub\screening-backend\web.config
   ```

2. Verify the file contains all proxy rules (already configured in the file)

## Step 5: Configure URL Rewrite Server Variables

1. In IIS Manager, select your **website** (`Screening Backend`)
2. Double-click **URL Rewrite**
3. Click **View Server Variables** (right panel)
4. Click **Add** and add these variables:
   - `HTTP_X_FORWARDED_PROTO`
   - `HTTP_X_FORWARDED_FOR`
   - `HTTP_UPGRADE`
   - `HTTP_CONNECTION`
5. Click **Apply**

## Step 6: Configure DNS

Domain का DNS record configure करें:

1. **DNS A Record:**
   ```
   screening-backend.infath.gov.sa  A  YOUR_SERVER_IP
   ```

2. **Verify DNS:**
   ```powershell
   # In PowerShell
   nslookup screening-backend.infath.gov.sa
   ```

## Step 7: Configure Firewall

1. Open **Windows Firewall with Advanced Security**
2. Create **Inbound Rules:**
   - **Port 80** (HTTP) - TCP - Allow
   - **Port 443** (HTTPS) - TCP - Allow (if using SSL)
   - **Port 3000** - TCP - Block (for security, only allow localhost)

## Step 8: Test the Setup

### Test from Server:

```powershell
# Test root URL
Invoke-WebRequest -Uri "http://screening-backend.infath.gov.sa/" -UseBasicParsing

# Test API
Invoke-WebRequest -Uri "http://screening-backend.infath.gov.sa/api/health" -UseBasicParsing

# Test from browser
# Open: http://screening-backend.infath.gov.sa/
```

### Test from Remote:

```bash
# From another machine
curl http://screening-backend.infath.gov.sa/
curl http://screening-backend.infath.gov.sa/api/health
```

## Step 9: SSL Certificate (Optional but Recommended)

### Option A: Using Win-ACME (Let's Encrypt)

1. Download Win-ACME: https://www.win-acme.com/
2. Run `wacs.exe`
3. Follow wizard:
   - Select your IIS website
   - Choose validation method
   - Win-ACME will auto-configure IIS

### Option B: Using IIS Manager

1. **Create Self-Signed Certificate:**
   - IIS Manager → Server node
   - Double-click **Server Certificates**
   - Click **Create Self-Signed Certificate**
   - Name: `screening-backend`
   - Store: **Personal**

2. **Add HTTPS Binding:**
   - Select your website
   - Click **Bindings** → **Add**
   - **Type:** HTTPS
   - **Port:** 443
   - **SSL certificate:** `screening-backend`
   - **Host name:** `screening-backend.infath.gov.sa`
   - Click **OK**

3. **Update web.config:**
   - Change `HTTP_X_FORWARDED_PROTO` value to `https` in web.config

## Troubleshooting

### 1. 502 Bad Gateway

**Check:**
- Node.js backend running: `Get-Process node` or `pm2 list`
- Port 3000 accessible: `Test-NetConnection localhost -Port 3000`
- Backend logs: `pm2 logs` or check Node.js console

**Fix:**
```powershell
# Start backend if not running
cd C:\path\to\screening-backend
pm2 start dist/server.js --name screening-backend
```

### 2. 404 Not Found

**Check:**
- web.config file exists in website root
- URL Rewrite module installed
- ARR proxy enabled

**Fix:**
```powershell
# Verify web.config
Get-Content C:\inetpub\screening-backend\web.config

# Restart IIS
iisreset
```

### 3. Domain Not Resolving

**Check:**
```powershell
# Check DNS
nslookup screening-backend.infath.gov.sa

# Check if domain points to correct IP
Resolve-DnsName screening-backend.infath.gov.sa
```

**Fix:**
- Update DNS A record to point to server IP
- Wait for DNS propagation (up to 48 hours)

### 4. Socket.IO Not Working

**Check:**
- WebSocket enabled in ARR
- HTTP_UPGRADE and HTTP_CONNECTION server variables added

**Fix:**
1. IIS Manager → Server node
2. Application Request Routing → Server Proxy Settings
3. Check **Enable WebSocket**
4. Click **Apply**

### 5. CORS Errors

**Check:**
- web.config में CORS headers configured हैं
- Backend में CORS enabled है

**Fix:**
- web.config में CORS headers already configured हैं
- Backend server.ts में CORS already enabled है

## Configuration Files

- **web.config:** `C:\inetpub\screening-backend\web.config`
- **IIS Logs:** `C:\inetpub\logs\LogFiles\W3SVC1\`
- **Application Pool:** `ScreeningBackend`

## Update Frontend Configuration

Frontend में API URL update करें:

```typescript
// screening-frontend/src/environments/environment.prod.ts
export const environment = {
  production: true,
  apiUrl: 'http://screening-backend.infath.gov.sa/api',
  // या HTTPS:
  // apiUrl: 'https://screening-backend.infath.gov.sa/api',
};
```

## Update Mobile App Configuration

Mobile app में server URL update करें:

```typescript
// screening-player/config.ts
export const CONFIG = {
  SERVER_URL: 'http://screening-backend.infath.gov.sa',
  // या HTTPS:
  // SERVER_URL: 'https://screening-backend.infath.gov.sa',
};
```

## Quick Commands

```powershell
# Restart IIS
iisreset

# Check IIS status
Get-Service W3SVC

# View IIS logs
Get-Content C:\inetpub\logs\LogFiles\W3SVC1\*.log -Tail 50

# Test website
Invoke-WebRequest -Uri "http://screening-backend.infath.gov.sa/" -UseBasicParsing

# Check Node.js backend
pm2 list
pm2 logs screening-backend
```

## Summary

✅ Domain `screening-backend.infath.gov.sa` → `localhost:3000` mapped
✅ IIS reverse proxy configured
✅ Socket.IO support enabled
✅ File uploads (200MB) supported
✅ Root path (`/`) handled
✅ All API routes proxied

## Important Notes

1. **Host Name Binding:** Website binding में `screening-backend.infath.gov.sa` host name add करना जरूरी है
2. **Server Variables:** URL Rewrite server variables add करना जरूरी है
3. **ARR Proxy:** Application Request Routing proxy enable करना जरूरी है
4. **DNS:** Domain का DNS record server IP पर point करना होगा

Setup complete होने के बाद domain से backend access होगा! 🎉



