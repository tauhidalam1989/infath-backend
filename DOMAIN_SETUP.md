# Domain Setup Guide: screening-backend.infath.gov.sa

यह guide आपको domain `screening-backend.infath.gov.sa` को `localhost:3000` से map करने में help करेगा।

## Prerequisites

1. **Nginx installed** on your server
2. **Domain DNS configured** - Domain should point to your server's IP address
3. **Node.js backend running** on `localhost:3000`

## Step 1: Copy Nginx Configuration

```bash
# Copy the configuration file to Nginx sites-available
sudo cp nginx-screening-backend.conf /etc/nginx/sites-available/screening-backend.infath.gov.sa

# Or create it directly
sudo nano /etc/nginx/sites-available/screening-backend.infath.gov.sa
```

## Step 2: Update Configuration

Configuration file में domain name check करें:
- `server_name screening-backend.infath.gov.sa;` - यह सही है

## Step 3: Enable the Site

```bash
# Create symbolic link to enable the site
sudo ln -s /etc/nginx/sites-available/screening-backend.infath.gov.sa /etc/nginx/sites-enabled/

# Test Nginx configuration
sudo nginx -t

# If test passes, reload Nginx
sudo systemctl reload nginx
```

## Step 4: Verify DNS Configuration

Domain का DNS record check करें:

```bash
# Check if domain points to your server IP
nslookup screening-backend.infath.gov.sa

# या
dig screening-backend.infath.gov.sa
```

DNS में **A record** होना चाहिए:
```
screening-backend.infath.gov.sa  A  YOUR_SERVER_IP
```

## Step 5: Test the Setup

```bash
# Test from server
curl http://screening-backend.infath.gov.sa/

# Test API endpoint
curl http://screening-backend.infath.gov.sa/api/health

# Test from browser
# Open: http://screening-backend.infath.gov.sa/
```

## Step 6: SSL Certificate (Optional but Recommended)

अगर HTTPS चाहिए:

```bash
# Install Certbot (if not installed)
sudo apt-get update
sudo apt-get install certbot python3-certbot-nginx

# Get SSL certificate
sudo certbot --nginx -d screening-backend.infath.gov.sa

# Auto-renewal setup
sudo certbot renew --dry-run
```

SSL certificate मिलने के बाद, configuration file में HTTPS section uncomment करें।

## Step 7: Firewall Configuration

```bash
# Allow HTTP (port 80)
sudo ufw allow 80/tcp

# Allow HTTPS (port 443) - if using SSL
sudo ufw allow 443/tcp

# Check firewall status
sudo ufw status
```

## Troubleshooting

### 1. 502 Bad Gateway Error
- Check if Node.js backend is running: `pm2 list` or `ps aux | grep node`
- Check backend logs: `pm2 logs screening-backend`
- Verify port 3000 is accessible: `curl http://localhost:3000/api/health`

### 2. Domain Not Resolving
- Check DNS: `nslookup screening-backend.infath.gov.sa`
- Verify DNS A record points to correct IP
- Wait for DNS propagation (can take up to 48 hours)

### 3. Connection Refused
- Check Nginx is running: `sudo systemctl status nginx`
- Check Nginx error logs: `sudo tail -f /var/log/nginx/error.log`
- Verify configuration: `sudo nginx -t`

### 4. Socket.IO Not Working
- Check WebSocket headers in Nginx config
- Verify `proxy_set_header Upgrade` and `Connection` headers
- Check Socket.IO logs in backend

## Configuration Files Location

- **Nginx config:** `/etc/nginx/sites-available/screening-backend.infath.gov.sa`
- **Enabled site:** `/etc/nginx/sites-enabled/screening-backend.infath.gov.sa`
- **Nginx logs:** `/var/log/nginx/error.log` and `/var/log/nginx/access.log`

## Update Frontend Configuration

Frontend में API URL update करें:

```typescript
// screening-frontend/src/environments/environment.prod.ts
export const environment = {
  production: true,
  apiUrl: 'http://screening-backend.infath.gov.sa/api',
  // या HTTPS के लिए:
  // apiUrl: 'https://screening-backend.infath.gov.sa/api',
};
```

## Update Mobile App Configuration

Mobile app में server URL update करें:

```typescript
// screening-player/config.ts
export const CONFIG = {
  SERVER_URL: 'http://screening-backend.infath.gov.sa',
  // या HTTPS के लिए:
  // SERVER_URL: 'https://screening-backend.infath.gov.sa',
};
```

## Summary

✅ Domain `screening-backend.infath.gov.sa` अब `localhost:3000` से map होगा
✅ सभी requests automatically backend को forward होंगी
✅ Socket.IO भी काम करेगा
✅ File uploads (200MB तक) support होगा

## Quick Commands

```bash
# Restart Nginx
sudo systemctl restart nginx

# Check Nginx status
sudo systemctl status nginx

# View Nginx logs
sudo tail -f /var/log/nginx/error.log

# Test configuration
sudo nginx -t

# Reload configuration
sudo systemctl reload nginx
```



