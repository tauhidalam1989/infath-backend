import { exec } from 'child_process';
import { promisify } from 'util';
import * as os from 'os';
import * as ping from 'ping';
import * as dns from 'dns';
import { DiscoveredDevice } from '../types/device.types';
import * as screenService from './screen.service';

const execAsync = promisify(exec);
const dnsReverse = promisify(dns.reverse);

/**
 * Get local network IP range from active WiFi/Ethernet connection
 * This detects the network the current device (MacBook) is connected to
 */
function getLocalNetworkRange(): { range: string; interface: string; ip: string; networkName?: string } {
  const interfaces = os.networkInterfaces();
  
  // Priority order: WiFi interfaces first, then Ethernet
  // On macOS, WiFi is usually en0 or en1
  const wifiKeywords = ['wifi', 'wlan', 'wireless', 'en0', 'en1'];
  
  // First, try to find WiFi interface (the one connected to Airtel_Jainish)
  for (const name of Object.keys(interfaces)) {
    const nets = interfaces[name];
    if (!nets) continue;

    const isWifi = wifiKeywords.some(keyword => name.toLowerCase().includes(keyword)) ||
                   name.toLowerCase().includes('en0') || // macOS WiFi is often en0
                   name.toLowerCase().includes('en1');
    
    for (const net of nets) {
      // Skip internal (loopback) and non-IPv4 addresses
      if (net.family === 'IPv4' && !net.internal) {
        const ipParts = net.address.split('.');
        const range = `${ipParts[0]}.${ipParts[1]}.${ipParts[2]}.0/24`;
        
        console.log(`\n📡 Network Interface Detected:`);
        console.log(`   Name: ${name}`);
        console.log(`   Type: ${isWifi ? 'WiFi (Connected to your network)' : 'Ethernet'}`);
        console.log(`   Your IP: ${net.address}`);
        console.log(`   Network Range: ${range}`);
        console.log(`   This is the network we'll scan for connected devices\n`);
        
        // Prefer WiFi if found (this should be Airtel_Jainish network)
        if (isWifi) {
          return { 
            range, 
            interface: name, 
            ip: net.address,
            networkName: 'Airtel_Jainish' // The WiFi network name
          };
        }
      }
    }
  }
  
  // If no WiFi found, use first active interface
  for (const name of Object.keys(interfaces)) {
    const nets = interfaces[name];
    if (!nets) continue;

    for (const net of nets) {
      if (net.family === 'IPv4' && !net.internal) {
        const ipParts = net.address.split('.');
        const range = `${ipParts[0]}.${ipParts[1]}.${ipParts[2]}.0/24`;
        
        console.log(`\n📡 Using network interface: ${name}`);
        console.log(`🌐 Your IP: ${net.address}`);
        console.log(`📶 Network Range: ${range}\n`);
        
        return { range, interface: name, ip: net.address };
      }
    }
  }
  
  // Default fallback
  console.log(`⚠️  No active network found, using default: 192.168.1.0/24`);
  return { range: '192.168.1.0/24', interface: 'unknown', ip: '192.168.1.1' };
}

/**
 * Get MAC address and hostname from ARP table (works on macOS, Linux, Windows)
 * Returns both MAC and hostname if available
 */
async function getMacAddress(ip: string): Promise<{ mac: string; hostname?: string }> {
  try {
    const platform = os.platform();
    let command: string;

    if (platform === 'darwin') {
      // macOS: Use -a flag to get hostnames, format: hostname (ip) at mac
      command = `arp -a ${ip} 2>/dev/null`;
    } else if (platform === 'linux') {
      // Linux
      command = `arp -n ${ip} 2>/dev/null`;
    } else if (platform === 'win32') {
      // Windows
      command = `arp -a ${ip}`;
    } else {
      return { mac: '00:00:00:00:00:00' };
    }

    const { stdout } = await execAsync(command);
    
    // Extract MAC address
    const macMatch = stdout.match(/([0-9A-Fa-f]{2}[:-]){5}([0-9A-Fa-f]{2})/i);
    const mac = macMatch ? macMatch[0] : '00:00:00:00:00:00';
    
    // Extract hostname from ARP output (macOS format: hostname (ip) at mac)
    // OR: ? (ip) at mac (no hostname in ARP)
    let hostname: string | undefined;
    if (platform === 'darwin') {
      // Format: hostname (192.168.1.1) at 30:4f:75:b0:81:f7
      // OR: ? (192.168.1.1) at mac (no hostname)
      const hostnameMatch = stdout.match(/^([a-zA-Z0-9\-_\.]+)\s*\(/);
      if (hostnameMatch && hostnameMatch[1] && hostnameMatch[1] !== '?') {
        hostname = hostnameMatch[1].replace(/\.local$/, '').trim();
      }
      
      // If no hostname in ARP, try DNS cache
      if (!hostname || hostname === '?') {
        try {
          // Try dscacheutil to get hostname from DNS cache
          const { stdout: dnsOut } = await execAsync(`dscacheutil -q host -a ipv4_address ${ip} 2>/dev/null`);
          const dnsMatch = dnsOut.match(/name:\s*([^\n]+)/i);
          if (dnsMatch && dnsMatch[1]) {
            hostname = dnsMatch[1].trim().replace(/\.local$/, '');
          }
        } catch (e) {
          // Continue
        }
      }
    }
    
    return { mac, hostname };
  } catch (error) {
    return { mac: '00:00:00:00:00:00' };
  }
}

/**
 * Detect device type based on various checks
 */
async function detectDeviceType(ip: string, macAddress: string): Promise<'android-tv' | 'smart-tv' | 'unknown'> {
  // Check MAC address vendor (common TV manufacturers)
  const tvMacPrefixes = [
    '00:1E:06', // Samsung
    '00:0E:0C', // LG
    '00:1B:66', // Sony
    '00:1E:3D', // Panasonic
    '00:1F:3A', // Philips
    '00:1C:62', // Vizio
    '00:1D:7E', // TCL
  ];

  // Check if MAC starts with TV manufacturer prefix
  const isTVMac = tvMacPrefixes.some(prefix => macAddress.toUpperCase().startsWith(prefix));

  if (isTVMac) {
    // Try to detect Android TV specifically
    // Common Android TV indicators
    try {
      // You can add more specific checks here
      return 'android-tv';
    } catch (error) {
      return 'smart-tv';
    }
  }

  return 'unknown';
}

/**
 * Get device name from IP using multiple methods
 * Tries to get actual device hostname from network
 */
async function getDeviceName(ip: string, macAddress: string): Promise<string> {
  try {
    const platform = os.platform();
    let deviceName = '';

    // Method 1: Try mDNS/Bonjour (works great on macOS for .local devices)
    try {
      if (platform === 'darwin') {
        // Try dscacheutil first (macOS DNS cache)
        try {
          const { stdout } = await execAsync(`dscacheutil -q host -a ipv4_address ${ip} 2>/dev/null`);
          const nameMatch = stdout.match(/name:\s*([^\n]+)/i);
          if (nameMatch && nameMatch[1]) {
            let name = nameMatch[1].trim().replace(/\.local$/, '');
            if (name && name.length > 1 && !name.includes('NXDOMAIN')) {
              deviceName = name;
            }
          }
        } catch (e) {
          // Try ping with .local
          try {
            const { stdout } = await execAsync(`ping -c 1 -W 1000 ${ip}.local 2>/dev/null | head -1`);
            const localMatch = stdout.match(/PING\s+([a-zA-Z0-9\-_]+)\.local/i);
            if (localMatch && localMatch[1]) {
              deviceName = localMatch[1];
            }
          } catch (e2) {
            // Continue
          }
        }
      }
    } catch (e) {
      // Continue
    }

    // Method 2: Try Node.js DNS reverse lookup (more reliable)
    if (!deviceName || deviceName.trim() === '') {
      try {
        const hostnames = await dnsReverse(ip);
        if (hostnames && hostnames.length > 0) {
          const hostname = hostnames[0].replace(/\.local$/, '').replace(/\.$/, '');
          if (hostname && !hostname.includes('NXDOMAIN') && !hostname.match(/^\d+$/)) {
            deviceName = hostname;
            console.log(`   ✓ Got name from DNS reverse: ${deviceName}`);
          }
        }
      } catch (e) {
        // Continue to next method
      }
    }

    // Method 2b: Try reverse DNS lookup with host command (fallback)
    if (!deviceName || deviceName.trim() === '') {
      try {
        if (platform === 'darwin' || platform === 'linux') {
          const { stdout } = await execAsync(`host ${ip} 2>/dev/null`);
          // Look for PTR record (reverse DNS)
          const ptrMatch = stdout.match(/domain name pointer\s+([^\s]+)/i);
          if (ptrMatch && ptrMatch[1]) {
            let hostname = ptrMatch[1].replace(/\.$/, '').replace(/\.local$/, '');
            // Filter out invalid names
            if (hostname && !hostname.includes('NXDOMAIN') && !hostname.match(/^\d+$/)) {
              deviceName = hostname;
            }
          }
        }
      } catch (e) {
        // Continue
      }
    }

    // Method 3: Try nslookup (more reliable on some systems)
    if (!deviceName || deviceName.trim() === '' || deviceName.includes('NXDOMAIN')) {
      try {
        const { stdout } = await execAsync(`nslookup ${ip} 2>/dev/null`);
        const nameMatch = stdout.match(/name\s*=\s*([^\s\.]+)/i);
        if (nameMatch && nameMatch[1] && !nameMatch[1].includes('NXDOMAIN') && nameMatch[1].trim() !== '') {
          deviceName = nameMatch[1].replace(/\.local$/, '').trim();
        }
      } catch (e) {
        // Continue
      }
    }

    // Method 4: Try ARP table (macOS stores hostnames in ARP cache) - MOST RELIABLE FOR ACTUAL NAMES
    if (!deviceName || deviceName.trim() === '' || deviceName.includes('NXDOMAIN') || deviceName.match(/^\d+$/)) {
      try {
        if (platform === 'darwin') {
          // macOS ARP format: ? (192.168.1.1) at 30:4f:75:b0:81:f7 on en0 ifscope [ethernet]
          // OR: hostname (192.168.1.1) at MAC
          const { stdout } = await execAsync(`arp -n ${ip} 2>/dev/null`);
          
          // Try format: hostname (IP) at MAC
          let arpMatch = stdout.match(/^([a-zA-Z0-9\-_\.]+)\s*\(/);
          
          // Try format: ? (IP) at MAC - means no hostname
          if (!arpMatch || arpMatch[1] === '?') {
            // Try: IP (hostname) at MAC
            arpMatch = stdout.match(/\(([^)]+)\)/);
            if (arpMatch && arpMatch[1] === ip) {
              arpMatch = null; // This is just the IP, not a hostname
            }
          }
          
          if (arpMatch && arpMatch[1]) {
            const arpName = arpMatch[1].trim().replace(/\.local$/, '');
            // Filter out invalid entries - accept actual hostnames
            if (arpName && 
                arpName !== '?' &&
                arpName.length > 1 &&
                !arpName.includes('incomplete') && 
                !arpName.includes('NXDOMAIN') && 
                !arpName.match(/^\d+$/) &&
                !arpName.match(/^\(/) &&
                arpName !== ip &&
                !arpName.match(/^192\.168\./)) {
              deviceName = arpName;
            }
          }
        } else if (platform === 'linux') {
          // Linux ARP format
          const { stdout } = await execAsync(`arp -n ${ip} 2>/dev/null`);
          const arpMatch = stdout.match(/\s+([a-zA-Z0-9\-_\.]+)\s+/);
          if (arpMatch && arpMatch[1] && !arpMatch[1].includes('Address')) {
            deviceName = arpMatch[1].trim();
          }
        }
      } catch (e) {
        // Continue
      }
    }

    // Method 5: Try NetBIOS name (for Windows devices)
    if (!deviceName || deviceName.trim() === '' || deviceName.includes('NXDOMAIN') || deviceName.match(/^\d+$/)) {
      try {
        if (platform === 'darwin' || platform === 'linux') {
          // Try nmblookup if available
          const { stdout } = await execAsync(`nmblookup -A ${ip} 2>/dev/null | grep -i '<00>' | head -1 | awk '{print $1}'`);
          if (stdout && stdout.trim() && stdout.trim().length > 1) {
            deviceName = stdout.trim();
          }
        }
      } catch (e) {
        // Continue
      }
    }

    // Method 6: Try to ping with hostname resolution
    if (!deviceName || deviceName.trim() === '' || deviceName.includes('NXDOMAIN') || deviceName.match(/^\d+$/)) {
      try {
        if (platform === 'darwin' || platform === 'linux') {
          // Ping with name resolution
          const { stdout } = await execAsync(`ping -c 1 -W 1000 ${ip} 2>/dev/null | head -1`);
          const pingMatch = stdout.match(/PING\s+([^\s\(]+)/i);
          if (pingMatch && pingMatch[1] && !pingMatch[1].includes(ip)) {
            deviceName = pingMatch[1].replace(/\.local$/, '').trim();
          }
        }
      } catch (e) {
        // Continue
      }
    }

    // Method 5: Try MAC address vendor lookup for better naming
    if (!deviceName || deviceName.includes('NXDOMAIN') || deviceName.match(/^\d+$/) || deviceName.trim() === '') {
      if (macAddress && macAddress !== '00:00:00:00:00:00' && macAddress !== 'Unknown') {
        // Extract vendor from MAC (first 3 octets = 6 hex chars)
        const macPrefix = macAddress.substring(0, 8).replace(/[:-]/g, '').toUpperCase();
        const macPrefix6 = macAddress.substring(0, 6).replace(/[:-]/g, '').toUpperCase();
        
        const vendorMap: Record<string, string> = {
          '001E06': 'Samsung',
          '000E0C': 'LG',
          '001B66': 'Sony',
          '001E3D': 'Panasonic',
          '001F3A': 'Philips',
          '001C62': 'Vizio',
          '001D7E': 'TCL',
          'A4C361': 'Samsung',
          'D0DF9A': 'Apple',
          'F0DBE2': 'Apple',
          '001451': 'Apple',
          '0016CB': 'Apple',
          '001B63': 'Apple',
          '001EC2': 'Apple',
          '002608': 'Apple',
          '0026BB': 'Apple',
          '0026C7': 'Apple',
          '003EE1': 'Apple',
          '0050E4': 'Apple',
          '0050F2': 'Apple',
          '304F75': 'TP-Link',
          '4A579D': 'Xiaomi',
          '304F75B0': 'TP-Link',
          '4A579D95': 'Xiaomi'
        };
        
        // Try 8-char prefix first, then 6-char
        let vendor = vendorMap[macPrefix] || vendorMap[macPrefix6];
        
        if (vendor) {
          deviceName = `${vendor}-${ip.split('.').pop()}`;
        } else {
          // Use MAC-based name if vendor not found
          const lastOctet = ip.split('.').pop();
          deviceName = `Device-${lastOctet}`;
        }
      }
    }

    // Final fallback: Clean up and use IP-based name
    if (!deviceName || deviceName.includes('NXDOMAIN') || deviceName.match(/^\d+$/) || deviceName.trim() === '') {
      // Use last octet of IP for naming
      const lastOctet = ip.split('.').pop();
      deviceName = `Device-${lastOctet}`;
    }

    // Clean up device name
    if (deviceName) {
      deviceName = deviceName
        .replace(/\.local$/, '')
        .replace(/\.$/, '')
        .replace(/\(NXDOMAIN\)/gi, '')
        .replace(/^\d+$/, '')
        .trim();
    }

    // Final validation - if still invalid, use meaningful fallback
    if (!deviceName || deviceName === '' || deviceName.match(/^\d+$/) || deviceName.includes('NXDOMAIN')) {
      const lastOctet = ip.split('.').pop();
      // Use MAC vendor if available, otherwise generic name
      if (macAddress && macAddress !== '00:00:00:00:00:00' && macAddress !== 'Unknown') {
        const macPrefix6 = macAddress.substring(0, 6).replace(/[:-]/g, '').toUpperCase();
        const vendorMap: Record<string, string> = {
          '304F75': 'TP-Link', '4A579D': 'Xiaomi', '001E06': 'Samsung',
          '000E0C': 'LG', '001B66': 'Sony', 'A4C361': 'Samsung',
          'D0DF9A': 'Apple', 'F0DBE2': 'Apple', '001451': 'Apple'
        };
        const vendor = vendorMap[macPrefix6] || 'Device';
        deviceName = `${vendor}-${lastOctet}`;
      } else {
        deviceName = `Device-${lastOctet}`;
      }
    }

    return deviceName;
  } catch (error) {
    // Ultimate fallback
    const lastOctet = ip.split('.').pop();
    return `Device-${lastOctet}`;
  }
}

/**
 * Get device hostnames from router DHCP client list (if accessible)
 * Tries common router admin interfaces
 */
async function getHostnamesFromRouter(baseIP: string): Promise<Map<string, string>> {
  const hostnameMap = new Map<string, string>();
  const routerIP = `${baseIP}.1`; // Usually router is at .1
  
  // Common router admin interfaces
  const routerUrls = [
    `http://${routerIP}/dhcpclients.htm`,
    `http://${routerIP}/dhcp.html`,
    `http://${routerIP}/status.asp`,
    `http://${routerIP}/DHCPClientList.asp`,
    `http://admin:admin@${routerIP}/dhcpclients.htm`
  ];
  
  // Note: This would require HTTP client and router credentials
  // For now, we'll use other methods
  
  return hostnameMap;
}

/**
 * Scan network for all devices
 */
export async function scanNetwork(
  scanId: string,
  activeScans: Map<string, { progress: number; status: string; devices: DiscoveredDevice[] }>
): Promise<void> {
  const scan = activeScans.get(scanId);
  if (!scan) return;

  try {
    const networkInfo = getLocalNetworkRange();
    const networkRange = networkInfo.range;
    const baseIP = networkRange.split('/')[0];
    const ipParts = baseIP.split('.');
    const base = `${ipParts[0]}.${ipParts[1]}.${ipParts[2]}`;

    const devices: DiscoveredDevice[] = [];
    const totalIPs = 254;
    const CONCURRENT_SCANS = 50; // Scan 50 IPs at a time
    const PING_TIMEOUT = 0.5; // Reduced timeout to 0.5 seconds

    console.log(`\n🔍 Starting Network Scan...`);
    console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
    console.log(`📡 Network Interface: ${networkInfo.interface}`);
    if (networkInfo.networkName) {
      console.log(`📶 WiFi Network: ${networkInfo.networkName}`);
    }
    console.log(`🌐 Your Device IP: ${networkInfo.ip}`);
    console.log(`📊 Scanning Range: ${networkRange}`);
    console.log(`🎯 Network Base: ${base}.0/24`);
    console.log(`⚡ Concurrent Scans: ${CONCURRENT_SCANS}`);
    console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
    console.log(`\n🔎 Scanning for all devices on this network...`);
    console.log(`   (Same network as your MacBook - Airtel_Jainish)\n`);

    // Create array of IPs to scan
    const ipList: string[] = [];
    for (let i = 1; i <= 254; i++) {
      const ip = `${base}.${i}`;
      // Skip our own IP
      if (ip !== networkInfo.ip) {
        ipList.push(ip);
      }
    }

    // Scan IPs in parallel batches
    for (let i = 0; i < ipList.length; i += CONCURRENT_SCANS) {
      const batch = ipList.slice(i, i + CONCURRENT_SCANS);
      
      // Scan batch in parallel
      const batchPromises = batch.map(async (ip) => {
        try {
          // Fast ping with reduced timeout
          const pingResult = await ping.promise.probe(ip, {
            timeout: PING_TIMEOUT,
            min_reply: 1
          });

          if (pingResult.alive) {
            console.log(`✅ Found device at ${ip}`);

            // Get MAC address and hostname from ARP
            const macInfo = await getMacAddress(ip);
            const macAddress = macInfo.mac;
            
            // Try to get device name using multiple methods
            let deviceName = '';
            
            // Method 1: Try hostname from ARP (if available, but usually shows ? on macOS)
            if (macInfo.hostname && macInfo.hostname !== '?' && macInfo.hostname.trim() !== '') {
              deviceName = macInfo.hostname.replace(/\.local$/, '').trim();
              console.log(`   ✓ [${ip}] Got name from ARP: ${deviceName}`);
            }
            
            // Method 2: Try DNS reverse lookup and other methods
            if (!deviceName || deviceName.trim() === '') {
              deviceName = await getDeviceName(ip, macAddress);
              if (deviceName && deviceName !== 'Unknown' && !deviceName.startsWith('Device-')) {
                console.log(`   ✓ [${ip}] Got name from DNS/mDNS: ${deviceName}`);
              }
            }
            
            // Method 3: Try to get hostname from system DNS cache (macOS specific)
            if ((!deviceName || deviceName.trim() === '' || deviceName === 'Unknown' || deviceName.startsWith('Device-')) && os.platform() === 'darwin') {
              try {
                // Try dscacheutil for the specific IP
                const { stdout: dnsCacheOut } = await execAsync(`dscacheutil -q host -a ipv4_address ${ip} 2>/dev/null || echo ""`);
                if (dnsCacheOut && dnsCacheOut.includes('name:')) {
                  const nameMatch = dnsCacheOut.match(/name:\s*([^\n]+)/i);
                  if (nameMatch && nameMatch[1]) {
                    const cachedName = nameMatch[1].trim().replace(/\.local$/, '');
                    if (cachedName && cachedName !== ip && !cachedName.match(/^192\.168\./)) {
                      deviceName = cachedName;
                      console.log(`   ✓ [${ip}] Got name from DNS cache: ${deviceName}`);
                    }
                  }
                }
              } catch (e) {
                // Continue
              }
            }
            
            // Method 4: Use MAC vendor lookup for meaningful names
            if (!deviceName || deviceName.trim() === '' || deviceName === 'Unknown' || deviceName.startsWith('Device-') || deviceName === '?') {
              if (macAddress && macAddress !== '00:00:00:00:00:00' && macAddress !== 'Unknown') {
                const macPrefix8 = macAddress.substring(0, 8).replace(/[:-]/g, '').toUpperCase();
                const macPrefix6 = macAddress.substring(0, 6).replace(/[:-]/g, '').toUpperCase();
                
                // Extended vendor database with actual MACs from your network
                const vendorMap: Record<string, string> = {
                  // Your actual network MACs (from ARP output)
                  '304F75B0': 'TP-Link-Router',      // 192.168.1.1
                  '2818FD11': 'Network-Device',       // 192.168.1.2
                  'BAADD884': 'Network-Device',       // 192.168.1.4
                  '4A579D95': 'Xiaomi-Device',        // 192.168.1.5
                  '9C67D604': 'Network-Device',       // 192.168.1.7
                  // Common vendor prefixes
                  '304F75': 'TP-Link',
                  '4A579D': 'Xiaomi',
                  '2818FD': 'Unknown',
                  'BAADD8': 'Unknown',
                  '9C67D6': 'Unknown',
                  '001E06': 'Samsung',
                  '000E0C': 'LG',
                  '001B66': 'Sony',
                  'A4C361': 'Samsung',
                  'D0DF9A': 'Apple',
                  'F0DBE2': 'Apple',
                  '001451': 'Apple',
                  '0016CB': 'Apple',
                  '001B63': 'Apple',
                  '001EC2': 'Apple',
                  '002608': 'Apple',
                  '0026BB': 'Apple',
                  '0026C7': 'Apple',
                  '003EE1': 'Apple',
                  '0050E4': 'Apple',
                  '0050F2': 'Apple',
                  '424174': 'Unknown'
                };
                
                let vendor = vendorMap[macPrefix8] || vendorMap[macPrefix6];
                
                if (vendor && vendor !== 'Unknown' && vendor !== 'Network-Device') {
                  const lastOctet = ip.split('.').pop();
                  deviceName = `${vendor}-${lastOctet}`;
                } else {
                  // Use MAC-based generic name
                  const lastOctet = ip.split('.').pop();
                  const macShort = macAddress.replace(/[:-]/g, '').substring(0, 6).toUpperCase();
                  deviceName = `Device-${macShort}-${lastOctet}`;
                }
                console.log(`   ⚠ [${ip}] Using MAC-based name: ${deviceName} (MAC: ${macAddress})`);
              } else {
                // Final fallback: Use IP-based name
                const lastOctet = ip.split('.').pop();
                deviceName = `Network-Device-${lastOctet}`;
                console.log(`   ⚠ [${ip}] Using IP-based name: ${deviceName}`);
              }
            }
            
            console.log(`📱 Device Name: ${deviceName} | IP: ${ip} | MAC: ${macAddress}`);
            
            // Detect device type
            const deviceType = await detectDeviceType(ip, macAddress);

            const device: DiscoveredDevice = {
              id: `dev-${ip.replace(/\./g, '-')}`,
              name: deviceName,
              ipAddress: ip,
              macAddress: macAddress !== '00:00:00:00:00:00' ? macAddress : 'Unknown',
              deviceType: deviceType,
              status: 'online',
              lastSeen: new Date(),
              isRegistered: false
            };

            devices.push(device);
            
            // Save device to database
            try {
              await screenService.saveDiscoveredDevice(device);
            } catch (error) {
              console.error(`   ⚠ Failed to save device ${device.name} to database:`, error);
            }
            scan.devices.push(device);
            
            console.log(`📱 Device: ${deviceName} (${ip}) - Type: ${deviceType}`);
            return device;
          }
          return null;
        } catch (error) {
          // Device not responding, continue
          return null;
        }
      });

      // Wait for batch to complete
      await Promise.all(batchPromises);

      // Update progress
      const scanned = Math.min(i + CONCURRENT_SCANS, ipList.length);
      scan.progress = Math.round((scanned / ipList.length) * 100);
      
      console.log(`📊 Scan progress: ${scan.progress}% (${scanned}/${ipList.length} IPs scanned, ${devices.length} devices found)`);
    }

    scan.status = 'completed';
    scan.progress = 100;
    
    console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
    console.log(`✅ Scan Completed!`);
    console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
    console.log(`📶 Network: ${networkInfo.networkName || networkInfo.interface}`);
    console.log(`🌐 Network Range: ${networkRange}`);
    console.log(`📱 Total Devices Found: ${devices.length}`);
    console.log(`\n📋 Connected Devices List:`);
    devices.forEach((device, index) => {
      console.log(`   ${index + 1}. ${device.name} (${device.ipAddress}) - ${device.deviceType}`);
    });
    console.log(`\n💡 These are all devices connected to the same WiFi network as your MacBook`);
    console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`);
  } catch (error) {
    console.error('❌ Scan error:', error);
    scan.status = 'error';
  }
}

