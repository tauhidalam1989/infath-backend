import { exec } from 'child_process';
import { promisify } from 'util';
import * as os from 'os';
import * as http from 'http';
import * as url from 'url';
import { Client } from 'ssh2';
import { Screen } from '../types/device.types';
import * as screenService from './screen.service';
import { sendPlayCommandToDevice, sendStopCommandToDevice, sendPauseCommandToDevice, sendResumeCommandToDevice, isDeviceConnected } from './socket.service';

const execAsync = promisify(exec);

/**
 * Play video on Android TV device using ADB (Android Debug Bridge)
 * Requires network ADB to be enabled on the device
 */
export async function playVideoOnDevice(
  screenId: number,
  videoUrl: string,
  videoTitle?: string,
  regionId?: number | null,
  muted: boolean = false,
  imagePlaylist: string[] | null = null
): Promise<{ success: boolean; message: string }> {
  try {
    const screen = (await screenService.getScreens()).find(s => s.id === screenId);
    
    if (!screen) {
      throw new Error('Screen not found');
    }

    // Update screen status to 'playing' in database
    const { pool } = await import('../config/database');
    await pool.query(
      'UPDATE screens SET status = $1, current_video_url = $2, current_video_title = $3, video_started_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = $4',
      ['playing', videoUrl, videoTitle || null, screenId]
    );
    
    screen.status = 'playing';

    console.log(`🎬 Playing video on ${screen.name} (${screen.ipAddress})`);
    console.log(`   Video URL: ${videoUrl}`);
    console.log(`   Title: ${videoTitle || 'Untitled'}`);
    console.log(`   Muted: ${muted}`);
    if (imagePlaylist && imagePlaylist.length > 0) {
      console.log(`   Image playlist length: ${imagePlaylist.length}`);
    }

    // Method 0: Try Socket.IO first (for React Native Expo apps)
    // Try matching by deviceId first, then by IP address
    const deviceIdToTry = screen.deviceId || screen.ipAddress;

    if (deviceIdToTry && !isDeviceConnected(deviceIdToTry) && !isDeviceConnected(screen.ipAddress || '')) {
      // Player app is expected but not connected – return clear error so UI can show it
      const msg = screen.ipAddress
        ? `Screen "${screen.name}" is not connected. Open the player app on the device and ensure it shows "Connected" / "Registered". If the device is on a different network (e.g. WiFi), set the screen's Device IP in screen settings to the IP shown in the player app, then reopen the player so it re-registers. (Server expects ${screen.ipAddress} or ${screen.deviceId || 'deviceId'}).`
        : `Screen "${screen.name}" has no IP/deviceId. Add the device IP in screen settings (use the IP shown in the player app) and ensure the player app is running and connected.`;
      console.log(`   ⚠ ${msg}`);
      return { success: false, message: msg };
    }

    if (deviceIdToTry && isDeviceConnected(deviceIdToTry)) {
      console.log(`   📱 Device ${deviceIdToTry} is connected via Socket.IO, trying socket method...`);
      if (regionId) {
        console.log(`   📐 Playing in region ${regionId}`);
      }
      const socketResult = await sendPlayCommandToDevice(deviceIdToTry, videoUrl, videoTitle, regionId, muted, imagePlaylist || undefined);

      if (socketResult.success) {
        return {
          success: true,
          message: `Video playing on ${screen.name} via Socket.IO (React Native App)${regionId ? ` in region ${regionId}` : ''}`
        };
      } else {
        console.log(`   ⚠ Socket.IO method failed: ${socketResult.message}`);
        // Continue to other methods
      }
    } else if (screen.ipAddress && isDeviceConnected(screen.ipAddress)) {
      console.log(`   🔍 Sending via IP address: ${screen.ipAddress}`);
      const socketResult = await sendPlayCommandToDevice(screen.ipAddress, videoUrl, videoTitle, regionId, muted, imagePlaylist || undefined);
      if (socketResult.success) {
        return {
          success: true,
          message: `Video playing on ${screen.name} via Socket.IO (matched by IP)${regionId ? ` in region ${regionId}` : ''}`
        };
      }
    }

    // Check if it's a YouTube URL
    const isYouTubeUrl = videoUrl.includes('youtube.com') || videoUrl.includes('youtu.be');
    const isVimeoUrl = videoUrl.includes('vimeo.com');
    const isStreamingUrl = isYouTubeUrl || isVimeoUrl;

    // Detect device type based on name or try different methods
    const isLinuxDevice = screen.name.toLowerCase().includes('ubuntu') || 
                          screen.name.toLowerCase().includes('linux') ||
                          screen.name.toLowerCase().includes('debian');
    
    const isMacDevice = screen.name.toLowerCase().includes('mac') || 
                        screen.name.toLowerCase().includes('macbook') ||
                        (screen.ipAddress && (screen.ipAddress === '127.0.0.1' || screen.ipAddress === 'localhost'));
    
    // Method 1: For local MacBook, use macOS commands
    if (isMacDevice || os.platform() === 'darwin') {
      const macResult = await tryMacPlay(videoUrl, isStreamingUrl);
      
      if (macResult.success) {
        return {
          success: true,
          message: `Video playing on ${screen.name} (local MacBook)`
        };
      }
    }
    
    // Check if IP address is available
    if (!screen.ipAddress) {
      return {
        success: false,
        message: `Cannot play video: Screen ${screen.name} does not have an IP address`
      };
    }

    // Method 2: For Linux devices, try SSH/VLC remote control
    if (isLinuxDevice) {
      const linuxResult = await tryLinuxPlay(screen.ipAddress, videoUrl, isStreamingUrl);
      
      if (linuxResult.success) {
        return {
          success: true,
          message: `Video playing on ${screen.name} via Linux remote control`
        };
      }
    }

    // Method 2: Try ADB (Android Debug Bridge) - requires network ADB enabled
    const adbResult = await tryAdbPlay(screen.ipAddress, videoUrl, isStreamingUrl);
    
    if (adbResult.success) {
      return {
        success: true,
        message: `Video playing on ${screen.name} via ADB`
      };
    }

    // Method 3: Try HTTP API (if device has web server)
    const httpResult = await tryHttpPlay(screen.ipAddress, videoUrl);
    
    if (httpResult.success) {
      return {
        success: true,
        message: `Video playing on ${screen.name} via HTTP API`
      };
    }

    // Method 4: Try casting via VLC or other media player
    const castResult = await tryCastPlay(screen.ipAddress, videoUrl);
    
    if (castResult.success) {
      return {
        success: true,
        message: `Video casting to ${screen.name}`
      };
    }

    // If all methods fail, return error with helpful message
    let errorMessage: string;
    const expectsExpoPlayer = !!(screen.deviceId || screen.ipAddress);

    if (expectsExpoPlayer) {
      errorMessage = `Screen "${screen.name}" is not connected. It was playing earlier via the Screening Player app – the app may have closed or lost connection. Open the Screening Player app on the device (${screen.ipAddress || screen.deviceId || 'this screen'}), ensure it is on the same network and shows "Connected" / "Registered", then try again.`;
    } else if (isLinuxDevice) {
      errorMessage = `Could not play video on ${screen.name}. This is a Linux device. Please enable SSH on the device (port 22) or configure VLC HTTP interface. See LINUX_DEVICE_SETUP.md for instructions.`;
    } else {
      errorMessage = `Could not play video on ${screen.name}. Please ensure the device has network ADB enabled (Android devices) or SSH enabled (Linux devices).`;
    }

    return {
      success: false,
      message: errorMessage
    };

  } catch (error: any) {
    console.error('Error playing video:', error);
    return {
      success: false,
      message: error.message || 'Failed to play video'
    };
  }
}

/**
 * Try to play video on macOS (local system)
 */
async function tryMacPlay(videoUrl: string, isStreamingUrl: boolean = false): Promise<{ success: boolean }> {
  try {
    console.log(`   🍎 Attempting macOS local playback`);
    
    if (isStreamingUrl && (videoUrl.includes('youtube.com') || videoUrl.includes('youtu.be'))) {
      // For YouTube URLs, open in default browser
      try {
        await execAsync(`open "${videoUrl}"`, { timeout: 5000 });
        console.log(`   ✓ YouTube URL opened in default browser`);
        return { success: true };
      } catch (e: any) {
        console.log(`   ⚠ Failed to open in browser: ${e.message}`);
      }
      
      // Try specific browsers
      const browsers = [
        '/Applications/Google Chrome.app',
        '/Applications/Google Chrome Canary.app',
        '/Applications/Firefox.app',
        '/Applications/Safari.app',
        '/Applications/Opera.app'
      ];
      
      for (const browser of browsers) {
        try {
          await execAsync(`open -a "${browser}" "${videoUrl}"`, { timeout: 5000 });
          console.log(`   ✓ YouTube URL opened in ${browser}`);
          return { success: true };
        } catch (e: any) {
          continue;
        }
      }
    } else {
      // For direct video URLs, use QuickTime or VLC
      try {
        // Try QuickTime Player first
        await execAsync(`open -a "QuickTime Player" "${videoUrl}"`, { timeout: 5000 });
        console.log(`   ✓ Video opened in QuickTime Player`);
        return { success: true };
      } catch (e: any) {
        // Try VLC if available
        try {
          await execAsync(`open -a "VLC" "${videoUrl}"`, { timeout: 5000 });
          console.log(`   ✓ Video opened in VLC`);
          return { success: true };
        } catch (e2: any) {
          // Fallback to default app
          try {
            await execAsync(`open "${videoUrl}"`, { timeout: 5000 });
            console.log(`   ✓ Video opened in default app`);
            return { success: true };
          } catch (e3: any) {
            console.log(`   ⚠ Failed to open video: ${e3.message}`);
          }
        }
      }
    }
    
    return { success: false };
  } catch (error: any) {
    console.log(`   ⚠ macOS playback failed: ${error.message}`);
    return { success: false };
  }
}

/**
 * Try to play video on Linux devices using SSH/VLC
 */
async function tryLinuxPlay(deviceIP: string, videoUrl: string, isStreamingUrl: boolean = false): Promise<{ success: boolean }> {
  try {
    console.log(`   🐧 Attempting Linux device playback on ${deviceIP}`);
    
    // Get SSH credentials from screen or use defaults
    const { pool } = await import('../config/database');
    const screenResult = await pool.query(
      'SELECT ssh_username, ssh_password FROM screens WHERE ip_address = $1 LIMIT 1',
      [deviceIP]
    );
    
    const sshUser = screenResult.rows[0]?.ssh_username || 'jainishali';
    const sshPassword = screenResult.rows[0]?.ssh_password;
    
    console.log(`   🔐 SSH Credentials: User=${sshUser}, Password=${sshPassword ? '***' : 'not set'}`);
    
    if (!sshPassword) {
      console.log(`   ⚠ No SSH password found in database for ${deviceIP}`);
      console.log(`   💡 Tip: Update database with: UPDATE screens SET ssh_password='jaaai@19' WHERE ip_address='${deviceIP}'`);
    }
    
    // Execute SSH command with password support using ssh2 library
    const executeSSHCommand = async (command: string): Promise<{ success: boolean; output?: string; error?: string }> => {
      return new Promise((resolve) => {
        const conn = new Client();
        
        conn.on('ready', () => {
          console.log(`   ✓ SSH connection established to ${deviceIP}`);
          conn.exec(command, (err: Error | undefined, stream: any) => {
            if (err) {
              conn.end();
              resolve({ success: false, error: err.message });
              return;
            }
            
            let output = '';
            stream.on('close', (code: number) => {
              conn.end();
              if (code === 0) {
                resolve({ success: true, output });
              } else {
                resolve({ success: false, error: `Command exited with code ${code}` });
              }
            });
            
            stream.on('data', (data: Buffer) => {
              output += data.toString();
            });
            
            stream.stderr.on('data', (data: Buffer) => {
              // Ignore stderr for background commands
            });
          });
        });
        
        conn.on('error', (err: Error) => {
          console.log(`   ❌ SSH connection error: ${err.message}`);
          resolve({ success: false, error: err.message });
        });
        
        // Handle keyboard-interactive authentication (some servers require this)
        conn.on('keyboard-interactive', (name, instructions, instructionsLang, prompts, finish) => {
          console.log(`   ⌨️  Keyboard-interactive authentication requested`);
          if (sshPassword && prompts.length > 0) {
            finish([sshPassword]);
          } else {
            finish([]);
          }
        });
        
        // Connect with password authentication
        console.log(`   🔌 Connecting to ${sshUser}@${deviceIP}:22...`);
        conn.connect({
          host: deviceIP,
          port: 22,
          username: sshUser,
          password: sshPassword,
          readyTimeout: 10000,
          tryKeyboard: true, // Enable keyboard-interactive as fallback
          debug: (info: string) => {
            // Uncomment for debugging: console.log(`   🔍 SSH Debug: ${info}`);
          }
        });
      });
    };
    
    // For YouTube URLs on Linux, open in browser
    if (isStreamingUrl && (videoUrl.includes('youtube.com') || videoUrl.includes('youtu.be'))) {
      // Try to open in browser using xdg-open (works on most Linux desktops)
      try {
        const result = await executeSSHCommand(`export DISPLAY=:0 && xdg-open '${videoUrl}' 2>/dev/null &`);
        if (result.success) {
          console.log(`   ✓ YouTube URL opened in browser via SSH`);
          return { success: true };
        } else {
          console.log(`   ⚠ SSH xdg-open failed: ${result.error}`);
        }
      } catch (e: any) {
        console.log(`   ⚠ SSH xdg-open error: ${e.message}`);
      }
      
      // Try with specific browser
      const browsers = ['google-chrome', 'chromium-browser', 'firefox', 'opera'];
      for (const browser of browsers) {
        try {
          const result = await executeSSHCommand(`export DISPLAY=:0 && ${browser} '${videoUrl}' 2>/dev/null &`);
          if (result.success) {
            console.log(`   ✓ YouTube URL opened in ${browser} via SSH`);
            return { success: true };
          }
        } catch (e2: any) {
          continue;
        }
      }
    }
    
    // For direct video URLs, try VLC remote control
    if (!isStreamingUrl) {
      try {
        // Try VLC HTTP interface (default port 8080)
        const vlcResult = await tryVlcRemote(deviceIP, videoUrl);
        if (vlcResult.success) {
          return vlcResult;
        }
      } catch (e: any) {
        console.log(`   ⚠ VLC remote failed: ${e.message}`);
      }
      
      // Try SSH + VLC command line
      try {
        const result = await executeSSHCommand(`export DISPLAY=:0 && vlc '${videoUrl}' --fullscreen 2>/dev/null &`);
        if (result.success) {
          console.log(`   ✓ Video opened in VLC via SSH`);
          return { success: true };
        } else {
          console.log(`   ⚠ SSH VLC failed: ${result.error}`);
        }
      } catch (e: any) {
        console.log(`   ⚠ SSH VLC error: ${e.message}`);
      }
    }
    
    return { success: false };
  } catch (error: any) {
    console.log(`   ⚠ Linux playback method failed: ${error.message}`);
    return { success: false };
  }
}

/**
 * Try VLC HTTP remote interface
 */
async function tryVlcRemote(deviceIP: string, videoUrl: string): Promise<{ success: boolean }> {
  try {
    const vlcPort = 8080;
    const vlcPassword = ''; // Default empty password
    
    // VLC HTTP interface commands
    const commands = [
      `http://${deviceIP}:${vlcPort}/requests/status.xml?command=pl_empty`, // Clear playlist
      `http://${deviceIP}:${vlcPort}/requests/status.xml?command=in_play&input=${encodeURIComponent(videoUrl)}` // Play video
    ];
    
    for (const cmd of commands) {
      try {
        const http = await import('http');
        const url = await import('url');
        
        const parsedUrl = url.parse(cmd);
        const auth = Buffer.from(`:${vlcPassword}`).toString('base64');
        
        const options = {
          hostname: parsedUrl.hostname,
          port: parsedUrl.port || vlcPort,
          path: parsedUrl.path,
          method: 'GET',
          headers: {
            'Authorization': `Basic ${auth}`
          },
          timeout: 3000
        };
        
        await new Promise((resolve, reject) => {
          const req = http.request(options, (res) => {
            if (res.statusCode === 200 || res.statusCode === 401) {
              resolve(true);
            } else {
              reject(new Error(`Status: ${res.statusCode}`));
            }
          });
          
          req.on('error', reject);
          req.on('timeout', () => {
            req.destroy();
            reject(new Error('Timeout'));
          });
          
          req.end();
        });
      } catch (e: any) {
        if (cmd.includes('pl_empty')) {
          // First command might fail if VLC not running, continue
          continue;
        }
        throw e;
      }
    }
    
    console.log(`   ✓ Video playing via VLC HTTP interface`);
    return { success: true };
  } catch (error: any) {
    return { success: false };
  }
}

/**
 * Try to play video using ADB (Android Debug Bridge)
 */
async function tryAdbPlay(deviceIP: string, videoUrl: string, isStreamingUrl: boolean = false): Promise<{ success: boolean }> {
  try {
    // Check if ADB is available
    try {
      await execAsync('which adb');
    } catch {
      console.log('   ⚠ ADB not found in PATH');
      return { success: false };
    }

    // Connect to device via network ADB (port 5555 is default)
    const adbPort = 5555;
    
    // Try to connect
    try {
      const connectResult = await execAsync(`adb connect ${deviceIP}:${adbPort}`, { timeout: 5000 });
      console.log(`   📱 ADB Connection: ${connectResult.stdout.trim()}`);
      
      // Check if connection was successful
      if (connectResult.stdout.includes('connected') || connectResult.stdout.includes('already connected')) {
        console.log(`   ✓ ADB connected to ${deviceIP}:${adbPort}`);
      } else {
        console.log(`   ⚠ ADB connection status unclear: ${connectResult.stdout}`);
      }
    } catch (e: any) {
      console.log(`   ⚠ Could not connect to ${deviceIP}:${adbPort} via ADB: ${e.message}`);
      // Continue anyway, device might already be connected
    }
    
    // Verify device is connected
    try {
      const devicesResult = await execAsync(`adb devices`, { timeout: 3000 });
      console.log(`   📋 Connected ADB devices:\n${devicesResult.stdout}`);
      
      if (!devicesResult.stdout.includes(deviceIP)) {
        console.log(`   ⚠ Device ${deviceIP} not found in ADB devices list`);
        return { success: false };
      }
    } catch (e: any) {
      console.log(`   ⚠ Could not list ADB devices: ${e.message}`);
      return { success: false };
    }

    // Handle streaming URLs (YouTube, Vimeo) differently
    if (isStreamingUrl) {
      try {
        // For YouTube URLs, try to open in YouTube app or browser
        if (videoUrl.includes('youtube.com') || videoUrl.includes('youtu.be')) {
          // Extract video ID from YouTube URL
          let youtubeVideoId = '';
          const youtubeMatch = videoUrl.match(/(?:youtube\.com\/(?:[^\/]+\/.+\/|(?:v|e(?:mbed)?)\/|.*[?&]v=)|youtu\.be\/)([^"&?\/\s]{11})/);
          if (youtubeMatch && youtubeMatch[1]) {
            youtubeVideoId = youtubeMatch[1];
          }

          // Try YouTube app first (multiple package names for different Android TV versions)
          try {
            if (youtubeVideoId) {
              // Try different YouTube TV app package names
              const youtubePackages = [
                'com.google.android.youtube.tv/.app.honeycomb.Shell$HomeActivity',
                'com.google.android.youtube.tv/.app.honeycomb.Shell\\$HomeActivity',
                'com.google.android.youtube.tv/.MainActivity',
                'com.google.android.youtube/.app.honeycomb.Shell$HomeActivity'
              ];
              
              for (const pkg of youtubePackages) {
                try {
                  await execAsync(
                    `adb -s ${deviceIP}:${adbPort} shell am start -a android.intent.action.VIEW -d "vnd.youtube:${youtubeVideoId}" -n ${pkg}`,
                    { timeout: 5000 }
                  );
                  console.log(`   ✓ YouTube video opened in YouTube TV app (${pkg})`);
                  return { success: true };
                } catch (e: any) {
                  console.log(`   ⚠ Failed with package ${pkg}: ${e.message}`);
                  continue;
                }
              }
              
              // Try with just the video ID (let Android choose the app)
              try {
                await execAsync(
                  `adb -s ${deviceIP}:${adbPort} shell am start -a android.intent.action.VIEW -d "vnd.youtube:${youtubeVideoId}"`,
                  { timeout: 5000 }
                );
                console.log(`   ✓ YouTube video opened via intent`);
                return { success: true };
              } catch (e: any) {
                console.log(`   ⚠ YouTube intent failed: ${e.message}`);
              }
            }
          } catch (e: any) {
            console.log(`   ⚠ YouTube app not available: ${e.message}, trying browser...`);
          }

          // Try browser as fallback (multiple browser packages)
          const browserPackages = [
            { name: 'Chrome', pkg: 'com.android.chrome/.Main' },
            { name: 'Chrome Beta', pkg: 'com.chrome.beta/.Main' },
            { name: 'Android Browser', pkg: 'com.android.browser/.BrowserActivity' },
            { name: 'Firefox', pkg: 'org.mozilla.firefox/.App' },
            { name: 'Opera', pkg: 'com.opera.browser/.Main' }
          ];
          
          for (const browser of browserPackages) {
            try {
              await execAsync(
                `adb -s ${deviceIP}:${adbPort} shell am start -a android.intent.action.VIEW -d "${videoUrl}" -n ${browser.pkg}`,
                { timeout: 5000 }
              );
              console.log(`   ✓ YouTube URL opened in ${browser.name}`);
              return { success: true };
            } catch (e: any) {
              console.log(`   ⚠ ${browser.name} failed: ${e.message}`);
              continue;
            }
          }
          
          // Try generic browser intent (let Android choose)
          try {
            const result = await execAsync(
              `adb -s ${deviceIP}:${adbPort} shell am start -a android.intent.action.VIEW -d "${videoUrl}"`,
              { timeout: 5000 }
            );
            console.log(`   ✓ YouTube URL opened via generic intent`);
            console.log(`   📋 Intent result: ${result.stdout}`);
            return { success: true };
          } catch (e: any) {
            console.log(`   ⚠ Generic browser intent failed: ${e.message}`);
            console.log(`   📋 Error details: ${e.stderr || e.stdout || 'No details'}`);
          }
          
          // Last resort: Try opening YouTube mobile site
          try {
            const mobileUrl = videoUrl.replace('youtube.com', 'm.youtube.com');
            await execAsync(
              `adb -s ${deviceIP}:${adbPort} shell am start -a android.intent.action.VIEW -d "${mobileUrl}"`,
              { timeout: 5000 }
            );
            console.log(`   ✓ YouTube mobile URL opened`);
            return { success: true };
          } catch (e: any) {
            console.log(`   ⚠ Could not open YouTube URL (all methods failed)`);
            console.log(`   💡 Tip: Ensure ADB is enabled on device and device is on same network`);
            return { success: false };
          }
        } else if (videoUrl.includes('vimeo.com')) {
          // For Vimeo, open in browser
          try {
            await execAsync(
              `adb -s ${deviceIP}:${adbPort} shell am start -a android.intent.action.VIEW -d "${videoUrl}"`,
              { timeout: 5000 }
            );
            console.log(`   ✓ Vimeo URL opened in browser`);
            return { success: true };
          } catch (e) {
            console.log(`   ⚠ Could not open Vimeo URL`);
            return { success: false };
          }
        }
      } catch (error: any) {
        console.log(`   ⚠ Error handling streaming URL: ${error.message}`);
        return { success: false };
      }
    }

    // For direct video URLs (MP4, WebM, etc.), use video player apps
    try {
      // Try with VLC
      await execAsync(
        `adb -s ${deviceIP}:${adbPort} shell am start -a android.intent.action.VIEW -d "${videoUrl}" -n org.videolan.vlc/.gui.video.VideoPlayerActivity`,
        { timeout: 5000 }
      );
      console.log(`   ✓ Video sent via ADB to VLC`);
      return { success: true };
    } catch (e) {
      // Try with MX Player
      try {
        await execAsync(
          `adb -s ${deviceIP}:${adbPort} shell am start -a android.intent.action.VIEW -d "${videoUrl}" -n com.mxtech.videoplayer.ad/.ActivityScreen`,
          { timeout: 5000 }
        );
        console.log(`   ✓ Video sent via ADB to MX Player`);
        return { success: true };
      } catch (e2) {
        // Try with default video player
        try {
          await execAsync(
            `adb -s ${deviceIP}:${adbPort} shell am start -a android.intent.action.VIEW -d "${videoUrl}" -t "video/*"`,
            { timeout: 5000 }
          );
          console.log(`   ✓ Video sent via ADB to default player`);
          return { success: true };
        } catch (e3) {
          console.log(`   ⚠ Could not play video via ADB intent`);
          return { success: false };
        }
      }
    }
  } catch (error: any) {
    console.log(`   ⚠ ADB method failed: ${error.message}`);
    return { success: false };
  }
}

/**
 * Try to play video using HTTP API (if device has web server)
 */
async function tryHttpPlay(deviceIP: string, videoUrl: string): Promise<{ success: boolean }> {
  try {
    // Try common Android TV web server ports
    const ports = [8080, 8081, 8888, 3000];
    
    for (const port of ports) {
      try {
        const requestUrl = `http://${deviceIP}:${port}/play`;
        const parsedUrl = url.parse(requestUrl);
        const postData = JSON.stringify({ url: videoUrl });
        
        const options = {
          hostname: parsedUrl.hostname,
          port: parsedUrl.port,
          path: parsedUrl.path,
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Content-Length': Buffer.byteLength(postData)
          },
          timeout: 3000
        };
        
        return new Promise((resolve) => {
          const req = http.request(options, (res) => {
            if (res.statusCode === 200 || res.statusCode === 201) {
              console.log(`   ✓ Video sent via HTTP API on port ${port}`);
              resolve({ success: true });
            } else {
              resolve({ success: false });
            }
          });
          
          req.on('error', () => {
            resolve({ success: false });
          });
          
          req.on('timeout', () => {
            req.destroy();
            resolve({ success: false });
          });
          
          req.write(postData);
          req.end();
        });
      } catch (e) {
        // Continue to next port
      }
    }
    
    return { success: false };
  } catch (error: any) {
    return { success: false };
  }
}

/**
 * Try to cast video using casting protocols
 */
async function tryCastPlay(deviceIP: string, videoUrl: string): Promise<{ success: boolean }> {
  try {
    // This would require casting libraries like node-castv2 or similar
    // For now, return false as casting requires more setup
    return { success: false };
  } catch (error: any) {
    return { success: false };
  }
}

/**
 * Stop video playback on device
 */
export async function stopVideoOnDevice(screenId: number, regionId?: number | null): Promise<{ success: boolean; message: string }> {
  try {
    const screen = (await screenService.getScreens()).find(s => s.id === screenId);
    
    if (!screen) {
      throw new Error('Screen not found');
    }

    console.log(`⏹ Stopping video on ${screen.name} (${screen.ipAddress})`);

    // Try Socket.IO first (for React Native / web players)
    // Match logic with playVideoOnDevice: try deviceId first, then fall back to IP
    const deviceIdToTry = screen.deviceId || screen.ipAddress;

    if (deviceIdToTry && !isDeviceConnected(deviceIdToTry) && !isDeviceConnected(screen.ipAddress || '')) {
      const msg = screen.ipAddress
        ? `Screen "${screen.name}" is not connected. Open the player app/web player on the device and ensure it shows "Connected" / "Registered". If the device is on a different network, set the screen's Device IP in screen settings to the IP shown in the player, then reopen the player so it re-registers. (Server expects ${screen.ipAddress} or ${screen.deviceId || 'deviceId'}).`
        : `Screen "${screen.name}" has no IP/deviceId. Add the device IP in screen settings (use the IP shown in the player) and ensure the player is running and connected.`;
      console.log(`   ⚠ ${msg}`);
      return { success: false, message: msg };
    }

    if (deviceIdToTry && isDeviceConnected(deviceIdToTry)) {
      console.log(`   📱 Device ${deviceIdToTry} is connected via Socket.IO, trying socket stop method...`);
      if (regionId) {
        console.log(`   📐 Stopping video in region ${regionId}`);
      }
      const socketResult = await sendStopCommandToDevice(deviceIdToTry, regionId);
      
      if (socketResult.success) {
        // Status already updated in socket service
        return {
          success: true,
          message: `Video stopped on ${screen.name} via Socket.IO${regionId ? ` in region ${regionId}` : ''}`
        };
      } else {
        console.log(`   ⚠ Socket.IO stop method failed: ${socketResult.message}`);
        // Continue to other methods
      }
    } else if (screen.ipAddress && isDeviceConnected(screen.ipAddress)) {
      console.log(`   🔍 Sending stop via IP address: ${screen.ipAddress}`);
      const socketResult = await sendStopCommandToDevice(screen.ipAddress, regionId);
      if (socketResult.success) {
        return {
          success: true,
          message: `Video stopped on ${screen.name} via Socket.IO (matched by IP)${regionId ? ` in region ${regionId}` : ''}`
        };
      }
    }

    // Update screen status to 'online' in database
    const { pool } = await import('../config/database');
    await pool.query(
      'UPDATE screens SET status = $1, current_video_url = NULL, current_video_title = NULL, video_started_at = NULL, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
      ['online', screenId]
    );
    
    screen.status = 'online';

    // Try ADB to stop playback
    try {
      await execAsync('which adb');
      
      const adbPort = 5555;
      try {
        await execAsync(`adb connect ${screen.ipAddress}:${adbPort}`, { timeout: 5000 });
        
        // Send back button or home button to stop video
        await execAsync(`adb -s ${screen.ipAddress}:${adbPort} shell input keyevent KEYCODE_BACK`);
        console.log(`   ✓ Video stopped via ADB`);
        
        return {
          success: true,
          message: `Video stopped on ${screen.name}`
        };
      } catch (e) {
        // ADB connection failed
      }
    } catch (e) {
      // ADB not available
    }

    return {
      success: true,
      message: `Stop command sent to ${screen.name}`
    };

  } catch (error: any) {
    console.error('Error stopping video:', error);
    return {
      success: false,
      message: error.message || 'Failed to stop video'
    };
  }
}

/**
 * Pause video playback on device
 */
export async function pauseVideoOnDevice(screenId: number, regionId?: number | null): Promise<{ success: boolean; message: string }> {
  try {
    const screen = (await screenService.getScreens()).find(s => s.id === screenId);
    
    if (!screen) {
      throw new Error('Screen not found');
    }

    console.log(`⏸ Pausing video on ${screen.name} (${screen.ipAddress})${regionId ? ` in region ${regionId}` : ' (full-screen)'}`);

    // Try Socket.IO first (for React Native / web players)
    const deviceIdToTry = screen.deviceId || screen.ipAddress;

    if (deviceIdToTry && !isDeviceConnected(deviceIdToTry) && !isDeviceConnected(screen.ipAddress || '')) {
      const msg = screen.ipAddress
        ? `Screen "${screen.name}" is not connected. Open the player app/web player on the device and ensure it shows "Connected" / "Registered". If the device is on a different network, set the screen's Device IP in screen settings to the IP shown in the player, then reopen the player so it re-registers. (Server expects ${screen.ipAddress} or ${screen.deviceId || 'deviceId'}).`
        : `Screen "${screen.name}" has no IP/deviceId. Add the device IP in screen settings (use the IP shown in the player) and ensure the player is running and connected.`;
      console.log(`   ⚠ ${msg}`);
      return { success: false, message: msg };
    }

    if (deviceIdToTry && isDeviceConnected(deviceIdToTry)) {
      console.log(`   📱 Device ${deviceIdToTry} is connected via Socket.IO, trying socket pause method...`);
      const socketResult = await sendPauseCommandToDevice(deviceIdToTry, regionId);
      
      if (socketResult.success) {
        // Update screen status in database
        const { pool } = await import('../config/database');
        await pool.query(
          'UPDATE screens SET status = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
          ['paused', screenId]
        );
        
        return {
          success: true,
          message: `Video paused on ${screen.name} via Socket.IO${regionId ? ` in region ${regionId}` : ''}`
        };
      } else {
        console.log(`   ⚠ Socket.IO pause method failed: ${socketResult.message}`);
      }
    } else if (screen.ipAddress && isDeviceConnected(screen.ipAddress)) {
      console.log(`   🔍 Sending pause via IP address: ${screen.ipAddress}`);
      const socketResult = await sendPauseCommandToDevice(screen.ipAddress, regionId);
      if (socketResult.success) {
        const { pool } = await import('../config/database');
        await pool.query(
          'UPDATE screens SET status = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
          ['paused', screenId]
        );
        return {
          success: true,
          message: `Video paused on ${screen.name} via Socket.IO (matched by IP)${regionId ? ` in region ${regionId}` : ''}`
        };
      }
    }

    // Update screen status to 'paused' in database
    const { pool } = await import('../config/database');
    await pool.query(
      'UPDATE screens SET status = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
      ['paused', screenId]
    );
    
    screen.status = 'paused';

    return {
      success: true,
      message: `Pause command sent to ${screen.name}`
    };
  } catch (error: any) {
    console.error('Error pausing video:', error);
    return {
      success: false,
      message: error.message || 'Failed to pause video'
    };
  }
}

/**
 * Resume video playback on device
 */
export async function resumeVideoOnDevice(screenId: number, regionId?: number | null): Promise<{ success: boolean; message: string }> {
  try {
    const screen = (await screenService.getScreens()).find(s => s.id === screenId);
    
    if (!screen) {
      throw new Error('Screen not found');
    }

    console.log(`▶️ Resuming video on ${screen.name} (${screen.ipAddress})${regionId ? ` in region ${regionId}` : ' (full-screen)'}`);

    // Try Socket.IO first (for React Native / web players)
    const deviceIdToTry = screen.deviceId || screen.ipAddress;

    if (deviceIdToTry && !isDeviceConnected(deviceIdToTry) && !isDeviceConnected(screen.ipAddress || '')) {
      const msg = screen.ipAddress
        ? `Screen "${screen.name}" is not connected. Open the player app/web player on the device and ensure it shows "Connected" / "Registered". If the device is on a different network, set the screen's Device IP in screen settings to the IP shown in the player, then reopen the player so it re-registers. (Server expects ${screen.ipAddress} or ${screen.deviceId || 'deviceId'}).`
        : `Screen "${screen.name}" has no IP/deviceId. Add the device IP in screen settings (use the IP shown in the player) and ensure the player is running and connected.`;
      console.log(`   ⚠ ${msg}`);
      return { success: false, message: msg };
    }

    if (deviceIdToTry && isDeviceConnected(deviceIdToTry)) {
      console.log(`   📱 Device ${deviceIdToTry} is connected via Socket.IO, trying socket resume method...`);
      const socketResult = await sendResumeCommandToDevice(deviceIdToTry, regionId);
      
      if (socketResult.success) {
        // Update screen status in database
        const { pool } = await import('../config/database');
        await pool.query(
          'UPDATE screens SET status = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
          ['playing', screenId]
        );
        
        return {
          success: true,
          message: `Video resumed on ${screen.name} via Socket.IO${regionId ? ` in region ${regionId}` : ''}`
        };
      } else {
        console.log(`   ⚠ Socket.IO resume method failed: ${socketResult.message}`);
      }
    } else if (screen.ipAddress && isDeviceConnected(screen.ipAddress)) {
      console.log(`   🔍 Sending resume via IP address: ${screen.ipAddress}`);
      const socketResult = await sendResumeCommandToDevice(screen.ipAddress, regionId);
      if (socketResult.success) {
        const { pool } = await import('../config/database');
        await pool.query(
          'UPDATE screens SET status = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
          ['playing', screenId]
        );
        return {
          success: true,
          message: `Video resumed on ${screen.name} via Socket.IO (matched by IP)${regionId ? ` in region ${regionId}` : ''}`
        };
      }
    }

    // Update screen status to 'playing' in database
    const { pool } = await import('../config/database');
    await pool.query(
      'UPDATE screens SET status = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
      ['playing', screenId]
    );
    
    screen.status = 'playing';

    return {
      success: true,
      message: `Resume command sent to ${screen.name}`
    };
  } catch (error: any) {
    console.error('Error resuming video:', error);
    return {
      success: false,
      message: error.message || 'Failed to resume video'
    };
  }
}

/**
 * Get currently playing video info
 */
export async function setFullscreenOnDevice(
  screenId: number,
  regionId?: number | null,
  enabled: boolean = true
): Promise<{ success: boolean; message: string }> {
  try {
    const screen = (await screenService.getScreens()).find(s => s.id === screenId);
    
    if (!screen) {
      throw new Error('Screen not found');
    }

    console.log(`🖥 Setting fullscreen on ${screen.name} (${screen.ipAddress})${regionId ? ` for region ${regionId}` : ''} - ${enabled ? 'enabled' : 'disabled'}`);

    // Try Socket.IO first (for React Native / web players)
    const deviceIdToTry = screen.deviceId || screen.ipAddress;

    if (deviceIdToTry && !isDeviceConnected(deviceIdToTry) && !isDeviceConnected(screen.ipAddress || '')) {
      const msg = screen.ipAddress
        ? `Screen "${screen.name}" is not connected. Open the player app/web player on the device and ensure it shows "Connected" / "Registered". If the device is on a different network, set the screen's Device IP in screen settings to the IP shown in the player, then reopen the player so it re-registers. (Server expects ${screen.ipAddress} or ${screen.deviceId || 'deviceId'}).`
        : `Screen "${screen.name}" has no IP/deviceId. Add the device IP in screen settings (use the IP shown in the player) and ensure the player is running and connected.`;
      console.log(`   ⚠ ${msg}`);
      return { success: false, message: msg };
    }

    if (deviceIdToTry) {
      const { sendFullscreenCommandToDevice, sendPlayCommandToDevice } = await import('./socket.service');
      const socketResult = await sendFullscreenCommandToDevice(deviceIdToTry, regionId, enabled);
      
      if (socketResult.success) {
        // If fullscreen is being disabled, resume all region videos by sending play commands
        if (!enabled && deviceIdToTry) {
          const deviceId = deviceIdToTry;
          
          // Wait for mobile app to process fullscreen disable and show all regions
          // Use setTimeout to make this non-blocking and don't await it
          setTimeout(async () => {
            try {
              console.log(`🔄 Fullscreen disabled - fetching active schedules for screen ${screenId}...`);
              
              // Get active schedules for this screen
              const advertisementSchedulesService = await import('./advertisement-schedules.service');
              const activeSchedules = await advertisementSchedulesService.getActiveSchedulesWithAds(screenId);
              
              console.log(`📋 Found ${activeSchedules.length} active schedules`);
              
              // Log schedule details
              activeSchedules.forEach((item, index) => {
                console.log(`📋 Schedule ${index + 1}:`, {
                  scheduleId: item.schedule.id,
                  regionId: item.schedule.regionId,
                  hasRegionId: !!item.schedule.regionId,
                  adId: item.advertisement?.id,
                  adTitle: item.advertisement?.title,
                  hasFileUrl: !!item.advertisement?.fileUrl
                });
              });
              
              // Wait for regions to be visible in mobile app (increased delay)
              console.log(`⏳ Waiting 1.5 seconds for regions to be visible...`);
              await new Promise(resolve => setTimeout(resolve, 1500));
              
              // Send play command for each active schedule with a regionId
              let resumedCount = 0;
              let skippedCount = 0;
              
              for (const item of activeSchedules) {
                const { schedule, advertisement } = item;
                
                // Only play if schedule has a regionId and advertisement has a fileUrl
                const fileUrl = advertisement?.fileUrl;
                if (schedule.regionId && advertisement && fileUrl) {
                  try {
                    console.log(`▶️ Sending play command for region ${schedule.regionId} (ad: ${advertisement.title || advertisement.id})`);
                    const playResult = await sendPlayCommandToDevice(
                      deviceId,
                      fileUrl as string, // Type assertion: we've checked fileUrl is not null in the if condition
                      advertisement.title || 'Advertisement',
                      schedule.regionId
                    );
                    
                    if (playResult.success) {
                      resumedCount++;
                      console.log(`✅ Play command sent successfully for region ${schedule.regionId}`);
                    } else {
                      console.error(`❌ Failed to send play command for region ${schedule.regionId}: ${playResult.message}`);
                    }
                    
                    // Delay between commands to avoid overwhelming the device
                    await new Promise(resolve => setTimeout(resolve, 600));
                  } catch (playError: any) {
                    console.error(`❌ Error resuming video in region ${schedule.regionId}:`, playError);
                  }
                } else {
                  skippedCount++;
                  console.log(`⏭️ Skipping schedule ${schedule.id} - missing regionId or fileUrl`);
                }
              }
              
              console.log(`✅ Resume complete: ${resumedCount} videos resumed, ${skippedCount} skipped`);
            } catch (resumeError: any) {
              console.error('⚠️ Error resuming region videos after fullscreen disable:', resumeError);
              console.error('⚠️ Error stack:', resumeError.stack);
            }
          }, 800); // Initial delay before starting resume process
        }
        
        return {
          success: true,
          message: `Fullscreen ${enabled ? 'enabled' : 'disabled'} on ${screen.name} via Socket.IO${!enabled ? ' - region videos resumed' : ''}`
        };
      } else {
        console.log(`   ⚠ Socket.IO fullscreen method failed: ${socketResult.message}`);
      }
    }

    return {
      success: false,
      message: `Failed to send fullscreen command to ${screen.name} (device not connected via Socket.IO)`
    };
  } catch (error: any) {
    console.error('Error setting fullscreen:', error);
    return {
      success: false,
      message: error.message || 'Failed to set fullscreen'
    };
  }
}

export async function getPlayingVideo(screenId: number): Promise<{ 
  isPlaying: boolean; 
  videoUrl?: string; 
  videoTitle?: string;
  startedAt?: Date;
  isPaused?: boolean;
}> {
  try {
    const screen = (await screenService.getScreens()).find(s => s.id === screenId);
    
    if (!screen) {
      throw new Error('Screen not found');
    }

    // Query database for current playback status
    const { pool } = await import('../config/database');
    const result = await pool.query(
      'SELECT status, current_video_url, current_video_title, video_started_at FROM screens WHERE id = $1',
      [screenId]
    );

    if (result.rows.length > 0) {
      const row = result.rows[0];
      if ((row.status === 'playing' || row.status === 'paused') && row.current_video_url) {
        return {
          isPlaying: true,
          isPaused: row.status === 'paused',
          videoUrl: row.current_video_url,
          videoTitle: row.current_video_title,
          startedAt: row.video_started_at ? new Date(row.video_started_at) : undefined
        };
      }
    }

    return {
      isPlaying: false
    };

  } catch (error: any) {
    console.error('Error getting playing video:', error);
    return {
      isPlaying: false
    };
  }
}

