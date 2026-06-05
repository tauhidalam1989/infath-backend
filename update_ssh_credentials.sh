#!/bin/bash

# Update SSH credentials in PostgreSQL database
# Database connection details from .env file

DB_HOST=88.222.244.10
DB_PORT=5432
DB_NAME=screen
DB_USER=screen
DB_PASSWORD=screen

echo "Updating SSH credentials in database..."

psql -h $DB_HOST -p $DB_PORT -U $DB_USER -d $DB_NAME <<EOF
UPDATE screens 
SET ssh_username = 'jainishali', 
    ssh_password = 'jaaai@19',
    updated_at = CURRENT_TIMESTAMP
WHERE ip_address = '192.168.1.7';

-- Verify the update
SELECT id, name, ip_address, ssh_username, 
       CASE WHEN ssh_password IS NOT NULL THEN '***' ELSE NULL END as password_set
FROM screens 
WHERE ip_address = '192.168.1.7';
EOF

echo "✅ SSH credentials updated!"

