# IIS Deployment Script for Screening Backend
# Run this script in PowerShell as Administrator

param(
    [string]$NodePort = "3000",
    [string]$IISPort = "80",
    [string]$SiteName = "Screening Backend API",
    [string]$AppPoolName = "ScreeningBackend",
    [string]$PhysicalPath = "C:\inetpub\screening-backend"
)

Write-Host "=== Screening Backend IIS Deployment ===" -ForegroundColor Green

# Check if running as Administrator
$isAdmin = ([Security.Principal.WindowsPrincipal] [Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
if (-not $isAdmin) {
    Write-Host "✗ This script must be run as Administrator" -ForegroundColor Red
    Write-Host "Right-click PowerShell and select 'Run as Administrator'" -ForegroundColor Yellow
    exit 1
}

# Check if Node.js is installed
Write-Host "`nChecking Node.js installation..." -ForegroundColor Yellow
try {
    $nodeVersion = node --version
    Write-Host "✓ Node.js found: $nodeVersion" -ForegroundColor Green
} catch {
    Write-Host "✗ Node.js is not installed. Please install Node.js from https://nodejs.org/" -ForegroundColor Red
    exit 1
}

# Check if IIS is installed
Write-Host "`nChecking IIS installation..." -ForegroundColor Yellow
try {
    $iisFeature = Get-WindowsFeature -Name Web-Server
    if ($iisFeature.InstallState -eq "Installed") {
        Write-Host "✓ IIS is installed" -ForegroundColor Green
    } else {
        Write-Host "✗ IIS is not installed. Installing IIS..." -ForegroundColor Yellow
        Install-WindowsFeature -Name Web-Server -IncludeManagementTools
        Write-Host "✓ IIS installed" -ForegroundColor Green
    }
} catch {
    Write-Host "✗ Could not check IIS installation. Please install IIS manually." -ForegroundColor Red
    exit 1
}

# Check if URL Rewrite module is installed
Write-Host "`nChecking URL Rewrite module..." -ForegroundColor Yellow
$urlRewritePath = "${env:ProgramFiles}\IIS\URL Rewrite\Rewrite.dll"
if (Test-Path $urlRewritePath) {
    Write-Host "✓ URL Rewrite module found" -ForegroundColor Green
} else {
    Write-Host "⚠ URL Rewrite module not found" -ForegroundColor Yellow
    Write-Host "Please download and install from: https://www.iis.net/downloads/microsoft/url-rewrite" -ForegroundColor Cyan
    Write-Host "Press any key to continue after installing URL Rewrite..." -ForegroundColor Yellow
    $null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")
}

# Check if ARR is installed
Write-Host "`nChecking Application Request Routing (ARR)..." -ForegroundColor Yellow
$arrPath = "${env:ProgramFiles}\IIS\Application Request Routing\Microsoft.ApplicationRequestRouting.dll"
if (Test-Path $arrPath) {
    Write-Host "✓ ARR module found" -ForegroundColor Green
} else {
    Write-Host "⚠ ARR module not found" -ForegroundColor Yellow
    Write-Host "Please download and install from: https://www.iis.net/downloads/microsoft/application-request-routing" -ForegroundColor Cyan
    Write-Host "Press any key to continue after installing ARR..." -ForegroundColor Yellow
    $null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")
}

# Check if .env file exists
Write-Host "`nChecking .env file..." -ForegroundColor Yellow
if (Test-Path ".env") {
    Write-Host "✓ .env file found" -ForegroundColor Green
} else {
    Write-Host "✗ .env file not found. Creating template..." -ForegroundColor Yellow
    @"
PORT=$NodePort
DB_HOST=localhost
DB_PORT=5432
DB_NAME=screen
DB_USER=screen
DB_PASSWORD=your_password_here
NODE_ENV=production
FRONTEND_URL=http://localhost
JWT_SECRET=your_jwt_secret_key_here
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

# Create physical path if it doesn't exist
Write-Host "`nCreating IIS physical path..." -ForegroundColor Yellow
if (-not (Test-Path $PhysicalPath)) {
    New-Item -ItemType Directory -Path $PhysicalPath -Force | Out-Null
    Write-Host "✓ Directory created: $PhysicalPath" -ForegroundColor Green
} else {
    Write-Host "✓ Directory exists: $PhysicalPath" -ForegroundColor Green
}

# Copy web.config to physical path
Write-Host "`nCopying web.config..." -ForegroundColor Yellow
$webConfigPath = Join-Path $PSScriptRoot "web.config"
if (Test-Path $webConfigPath) {
    Copy-Item -Path $webConfigPath -Destination $PhysicalPath -Force
    Write-Host "✓ web.config copied" -ForegroundColor Green
    
    # Update port in web.config if needed
    $webConfigContent = Get-Content (Join-Path $PhysicalPath "web.config") -Raw
    if ($webConfigContent -notmatch "localhost:$NodePort") {
        $webConfigContent = $webConfigContent -replace "localhost:3000", "localhost:$NodePort"
        Set-Content -Path (Join-Path $PhysicalPath "web.config") -Value $webConfigContent -NoNewline
        Write-Host "✓ Updated web.config with port $NodePort" -ForegroundColor Green
    }
} else {
    Write-Host "⚠ web.config not found. Creating default..." -ForegroundColor Yellow
    $webConfigContent = @"
<?xml version="1.0" encoding="UTF-8"?>
<configuration>
  <system.webServer>
    <rewrite>
      <rules>
        <rule name="API Proxy" stopProcessing="true">
          <match url="api/(.*)" />
          <action type="Rewrite" url="http://localhost:$NodePort/api/{R:1}" />
          <serverVariables>
            <set name="HTTP_X_FORWARDED_PROTO" value="http" />
            <set name="HTTP_X_FORWARDED_FOR" value="{REMOTE_ADDR}" />
          </serverVariables>
        </rule>
        <rule name="Socket.IO Proxy" stopProcessing="true">
          <match url="socket.io/(.*)" />
          <action type="Rewrite" url="http://localhost:$NodePort/socket.io/{R:1}" />
          <serverVariables>
            <set name="HTTP_X_FORWARDED_PROTO" value="http" />
            <set name="HTTP_X_FORWARDED_FOR" value="{REMOTE_ADDR}" />
            <set name="HTTP_UPGRADE" value="{HTTP_UPGRADE}" />
            <set name="HTTP_CONNECTION" value="{HTTP_CONNECTION}" />
          </serverVariables>
        </rule>
      </rules>
    </rewrite>
    <security>
      <requestFiltering>
        <requestLimits maxAllowedContentLength="209715200" />
      </requestFiltering>
    </security>
  </system.webServer>
</configuration>
"@
    Set-Content -Path (Join-Path $PhysicalPath "web.config") -Value $webConfigContent
    Write-Host "✓ Default web.config created" -ForegroundColor Green
}

# Import WebAdministration module
Import-Module WebAdministration -ErrorAction SilentlyContinue

# Create Application Pool
Write-Host "`nCreating Application Pool..." -ForegroundColor Yellow
if (Test-Path "IIS:\AppPools\$AppPoolName") {
    Write-Host "✓ Application Pool already exists: $AppPoolName" -ForegroundColor Green
} else {
    New-WebAppPool -Name $AppPoolName -Force | Out-Null
    Set-ItemProperty -Path "IIS:\AppPools\$AppPoolName" -Name managedRuntimeVersion -Value ""
    Set-ItemProperty -Path "IIS:\AppPools\$AppPoolName" -Name processModel.idleTimeout -Value ([TimeSpan]::FromMinutes(0))
    Write-Host "✓ Application Pool created: $AppPoolName" -ForegroundColor Green
}

# Create or update Website
Write-Host "`nCreating/Updating Website..." -ForegroundColor Yellow
if (Get-Website -Name $SiteName -ErrorAction SilentlyContinue) {
    Write-Host "✓ Website already exists: $SiteName" -ForegroundColor Green
    Set-ItemProperty -Path "IIS:\Sites\$SiteName" -Name physicalPath -Value $PhysicalPath
    Set-ItemProperty -Path "IIS:\Sites\$SiteName" -Name applicationPool -Value $AppPoolName
    Write-Host "✓ Website updated" -ForegroundColor Green
} else {
    New-Website -Name $SiteName -PhysicalPath $PhysicalPath -Port $IISPort -ApplicationPool $AppPoolName -Force | Out-Null
    Write-Host "✓ Website created: $SiteName" -ForegroundColor Green
}

# Enable ARR Proxy
Write-Host "`nConfiguring ARR Proxy..." -ForegroundColor Yellow
try {
    $arrConfig = Get-WebConfigurationProperty -Filter "system.webServer/proxy" -Name enabled -ErrorAction SilentlyContinue
    if ($null -eq $arrConfig -or $arrConfig.Value -eq $false) {
        Set-WebConfigurationProperty -PSPath "MACHINE/WEBROOT/APPHOST" -Filter "system.webServer/proxy" -Name enabled -Value $true
        Write-Host "✓ ARR Proxy enabled" -ForegroundColor Green
    } else {
        Write-Host "✓ ARR Proxy already enabled" -ForegroundColor Green
    }
} catch {
    Write-Host "⚠ Could not configure ARR Proxy. Please enable manually in IIS Manager." -ForegroundColor Yellow
}

# Configure URL Rewrite Server Variables
Write-Host "`nConfiguring URL Rewrite Server Variables..." -ForegroundColor Yellow
$serverVariables = @("HTTP_X_FORWARDED_PROTO", "HTTP_X_FORWARDED_FOR", "HTTP_UPGRADE", "HTTP_CONNECTION")
foreach ($variable in $serverVariables) {
    try {
        Add-WebConfigurationProperty -PSPath "MACHINE/WEBROOT/APPHOST" -Filter "system.webServer/rewrite/allowedServerVariables" -Name "." -Value @{name=$variable} -ErrorAction SilentlyContinue
    } catch {
        # Variable might already exist, which is fine
    }
}
Write-Host "✓ Server variables configured" -ForegroundColor Green

# Check if NSSM is available
Write-Host "`nChecking for NSSM (Windows Service Manager)..." -ForegroundColor Yellow
$nssmPath = Get-Command nssm -ErrorAction SilentlyContinue
if ($nssmPath) {
    Write-Host "✓ NSSM found" -ForegroundColor Green
    Write-Host "`nTo install Node.js as Windows Service:" -ForegroundColor Cyan
    Write-Host "  nssm install ScreeningBackend" -ForegroundColor White
    Write-Host "  Path: C:\Program Files\nodejs\node.exe" -ForegroundColor White
    Write-Host "  Startup directory: $PSScriptRoot" -ForegroundColor White
    Write-Host "  Arguments: dist/server.js" -ForegroundColor White
} else {
    Write-Host "⚠ NSSM not found. Install from: https://nssm.cc/download" -ForegroundColor Yellow
    Write-Host "  Or use PM2: npm install -g pm2 pm2-windows-startup" -ForegroundColor Cyan
}

Write-Host "`n=== IIS Configuration Complete ===" -ForegroundColor Green
Write-Host "`nNext Steps:" -ForegroundColor Cyan
Write-Host "1. Ensure Node.js backend is running on port $NodePort" -ForegroundColor White
Write-Host "2. Test the API: http://localhost:$IISPort/api/health" -ForegroundColor White
Write-Host "3. Configure Node.js as Windows Service (NSSM or PM2)" -ForegroundColor White
Write-Host "4. Configure firewall if needed" -ForegroundColor White
Write-Host "`nFor detailed instructions, see: IIS_BACKEND_DEPLOYMENT.md" -ForegroundColor Cyan







