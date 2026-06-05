# Windows Deployment Script for Backend
# Run this script in PowerShell as Administrator

Write-Host "=== Screening Backend Windows Deployment ===" -ForegroundColor Green

# Check if Node.js is installed
Write-Host "`nChecking Node.js installation..." -ForegroundColor Yellow
try {
    $nodeVersion = node --version
    Write-Host "✓ Node.js found: $nodeVersion" -ForegroundColor Green
} catch {
    Write-Host "✗ Node.js is not installed. Please install Node.js from https://nodejs.org/" -ForegroundColor Red
    exit 1
}

# Check if npm is installed
Write-Host "`nChecking npm installation..." -ForegroundColor Yellow
try {
    $npmVersion = npm --version
    Write-Host "✓ npm found: $npmVersion" -ForegroundColor Green
} catch {
    Write-Host "✗ npm is not installed." -ForegroundColor Red
    exit 1
}

# Check if .env file exists
Write-Host "`nChecking .env file..." -ForegroundColor Yellow
if (Test-Path ".env") {
    Write-Host "✓ .env file found" -ForegroundColor Green
} else {
    Write-Host "✗ .env file not found. Creating template..." -ForegroundColor Yellow
    @"
PORT=3000
DB_HOST=localhost
DB_PORT=5432
DB_NAME=screen
DB_USER=screen
DB_PASSWORD=your_password_here
NODE_ENV=production
FRONTEND_URL=http://localhost
"@ | Out-File -FilePath ".env" -Encoding utf8
    Write-Host "✓ Template .env file created. Please update with your database credentials." -ForegroundColor Yellow
}

# Install dependencies
Write-Host "`nInstalling dependencies..." -ForegroundColor Yellow
npm install
if ($LASTEXITCODE -ne 0) {
    Write-Host "✗ Failed to install dependencies" -ForegroundColor Red
    exit 1
}
Write-Host "✓ Dependencies installed" -ForegroundColor Green

# Build the project
Write-Host "`nBuilding TypeScript project..." -ForegroundColor Yellow
npm run build
if ($LASTEXITCODE -ne 0) {
    Write-Host "✗ Build failed" -ForegroundColor Red
    exit 1
}
Write-Host "✓ Build completed successfully" -ForegroundColor Green

# Check if PM2 is installed
Write-Host "`nChecking PM2 installation..." -ForegroundColor Yellow
try {
    $pm2Version = pm2 --version
    Write-Host "✓ PM2 found: $pm2Version" -ForegroundColor Green
    
    Write-Host "`nStarting application with PM2..." -ForegroundColor Yellow
    pm2 start dist/server.js --name screening-backend
    pm2 save
    Write-Host "✓ Application started with PM2" -ForegroundColor Green
    Write-Host "`nUse 'pm2 logs screening-backend' to view logs" -ForegroundColor Cyan
    Write-Host "Use 'pm2 restart screening-backend' to restart" -ForegroundColor Cyan
    Write-Host "Use 'pm2 stop screening-backend' to stop" -ForegroundColor Cyan
} catch {
    Write-Host "⚠ PM2 not found. Starting with node directly..." -ForegroundColor Yellow
    Write-Host "To install PM2: npm install -g pm2" -ForegroundColor Cyan
    Write-Host "`nStarting application..." -ForegroundColor Yellow
    Start-Process node -ArgumentList "dist/server.js" -WindowStyle Normal
    Write-Host "✓ Application started" -ForegroundColor Green
}

Write-Host "`n=== Deployment Complete ===" -ForegroundColor Green
Write-Host "Backend should be running on http://localhost:3000" -ForegroundColor Cyan
Write-Host "API available at http://localhost:3000/api" -ForegroundColor Cyan









