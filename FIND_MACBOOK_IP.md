# Find Your MacBook IP Address

## Quick Method

Run this command on your MacBook:

```bash
ifconfig | grep "inet " | grep -v 127.0.0.1
```

Or:

```bash
ipconfig getifaddr en0
```

## Your MacBook IP

Based on your network, your MacBook IP should be something like:
- `192.168.1.X` (where X is your device number)

## In the Frontend

1. **Start Network Scan** from the frontend
2. **Look for your MacBook** in the discovered devices list
3. **Register it** with a name like "My MacBook" or "MacBook Pro"
4. **Select that device** to play videos

## Alternative: Register Manually

If your MacBook doesn't appear in the scan, you can manually add it to the database:

```sql
-- First, add as discovered device
INSERT INTO discovered_devices (id, name, ip_address, mac_address, device_type, status, last_seen, is_registered)
VALUES ('dev-macbook', 'My MacBook', 'YOUR_IP_HERE', 'YOUR_MAC_HERE', 'unknown', 'online', CURRENT_TIMESTAMP, false);

-- Then register as screen
INSERT INTO screens (device_id, name, ip_address, mac_address, location, status)
VALUES ('dev-macbook', 'My MacBook', 'YOUR_IP_HERE', 'YOUR_MAC_HERE', 'Local', 'online');
```

Replace `YOUR_IP_HERE` with your actual IP address.



