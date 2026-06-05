# Fix 500 on /api/screens/:id/regions and /api/screens/:id/schedules

The error **"permission denied for table screen_regions"** means the database user used by the backend does not have permission on that table. You must run the grant script **on the server that hosts the backend** (or from a machine that can connect to the **same** PostgreSQL instance the backend uses).

## On the production backend server

1. Open **Command Prompt** or **PowerShell** on the server (e.g. where `screening-backend.infath.gov.sa` / IIS runs).

2. Go to the app folder:
   ```cmd
   cd c:\inetpub\wwwroot\finalDeployment
   ```

3. Set the **PostgreSQL superuser password** (the `postgres` user, not the app user). Replace `YourPostgresPassword` with the real password:
   ```cmd
   set POSTGRES_PASSWORD=YourPostgresPassword
   ```
   If the database is on another server, also set:
   ```cmd
   set DB_HOST=your-database-server-ip
   ```

4. Run the grant script:
   ```cmd
   npm run grant-db
   ```
   Or:
   ```cmd
   node scripts/run-grant-permissions.js
   ```

5. You should see `OK:` for each grant and `Done. App user smg should now have access.`

6. (Optional) Recycle the app pool in IIS so the app picks up a clean state.

7. Try again in the browser:  
   https://screening-backend.infath.gov.sa/api/screens/24/regions  
   https://screening-backend.infath.gov.sa/api/screens/24/schedules  

## Using the batch file

1. Edit `scripts\run-grants-on-server.bat`.
2. Replace `YourPostgresPassword` with the real `postgres` user password.
3. Double‑click the batch file or run it from a command prompt (from the project root so `node` and `scripts` are found).

## If you don’t have the postgres password

Ask your DBA or server admin to run this SQL on the **same** database the backend uses (as a superuser):

```sql
\c screen
GRANT USAGE ON SCHEMA public TO smg;
GRANT SELECT, INSERT, UPDATE, DELETE ON screen_regions TO smg;
GRANT USAGE, SELECT ON SEQUENCE screen_regions_id_seq TO smg;
GRANT SELECT, INSERT, UPDATE, DELETE ON advertisement_schedules TO smg;
GRANT USAGE, SELECT ON SEQUENCE advertisement_schedules_id_seq TO smg;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO smg;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO smg;
```

(Use your actual DB user name instead of `smg` if your `.env` has a different `DB_USER`.)
