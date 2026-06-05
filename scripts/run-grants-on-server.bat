@echo off
REM Run this ON THE BACKEND SERVER (where screening-backend.infath.gov.sa runs).
REM It fixes "permission denied for table screen_regions" by granting the app user access.
REM
REM 1. Set your PostgreSQL superuser password (replace YourPostgresPassword):
set POSTGRES_PASSWORD=YourPostgresPassword
REM 2. If your DB is on another machine, set it (optional):
REM set DB_HOST=your-db-server-ip
REM
cd /d "%~dp0.."
node scripts/run-grant-permissions.js
pause
