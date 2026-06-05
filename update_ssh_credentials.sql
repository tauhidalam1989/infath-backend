-- Update SSH credentials for Linux device
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

