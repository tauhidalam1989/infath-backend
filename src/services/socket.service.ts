import { Server, Socket } from 'socket.io';
import { Screen } from '../types/device.types';
import * as screenService from './screen.service';
import * as screenRegionsService from './screen-regions.service';
import * as advertisementSchedulesService from './advertisement-schedules.service';

// Store connected players: one deviceId can have multiple tabs (multiple socket ids)
const connectedPlayers = new Map<string, Set<string>>();
// Store socketId -> deviceId mapping (for disconnect cleanup)
const socketToDevice = new Map<string, string>();
// Store all device keys for this socket (deviceId + deviceIP when different) so we can find player by IP when screen is created with that IP
const socketToDeviceKeys = new Map<string, string[]>();
// Screen ID -> set of device keys that have this screen connected (so we find player even if DB device_id is stale)
const screenIdToDeviceKeys = new Map<number, Set<string>>();
// Socket ID -> screen ID (set when player registers and we match a screen; used on disconnect)
const socketToScreenId = new Map<string, number>();

// Grace period for disconnect - wait before marking offline (handles network fluctuations)
const DISCONNECT_GRACE_PERIOD_MS = 240000; // 4 minutes
// Pending offline timers: screenId -> timeout handle
const pendingOfflineTimers = new Map<number, NodeJS.Timeout>();
// Track devices waiting for grace period: screenId -> deviceId that disconnected
const pendingDisconnects = new Map<number, string>();

function getSocketIdsForDevice(deviceKey: string): string[] {
  const set = connectedPlayers.get(deviceKey);
  return set ? Array.from(set) : [];
}

/** Client IP as seen by the server (stable; used when browser WebRTC IP detection fails). */
function getClientIp(socket: Socket): string | null {
  const forwarded = socket.handshake.headers['x-forwarded-for'];
  if (typeof forwarded === 'string' && forwarded.trim()) {
    const first = forwarded.split(',')[0].trim();
    if (first) return first;
  }
  let addr = socket.handshake.address || '';
  if (addr.startsWith('::ffff:')) addr = addr.slice(7);
  if (addr.startsWith('::1')) return '127.0.0.1';
  return addr || null;
}

/** Filter stale schedules and split assigned ads into playlist vs schedule-only playback. */
async function preparePlayerAdvertisementPayload(
  screenId: number,
  rawAssigned: any[],
  activeSchedules: any[]
): Promise<{
  assignedAdvertisements: any[];
  defaultAd: any | null;
  activeSchedules: any[];
  scheduledAdIds: number[];
}> {
  const allowedAdIds = new Set((rawAssigned || []).map((ad: any) => ad.id));
  let filteredActive = (activeSchedules || []).filter(
    (item) => item.advertisement && allowedAdIds.has(item.advertisement.id)
  );
  if (activeSchedules.length > 0 && filteredActive.length !== activeSchedules.length) {
    console.log(
      `🔁 Filtered stale schedules: ${activeSchedules.length - filteredActive.length} removed because ads are no longer assigned`
    );
  }

  const adPayload = await advertisementSchedulesService.buildPlayerAdvertisementPayload(
    screenId,
    rawAssigned || [],
    filteredActive
  );

  if (adPayload.scheduledAdIds.length > 0) {
    console.log(
      `📅 ${adPayload.scheduledAdIds.length} scheduled ad(s) excluded from playlist; ${adPayload.assignedAdvertisements.length} in series loop`
    );
  }

  return {
    assignedAdvertisements: adPayload.assignedAdvertisements,
    defaultAd: adPayload.defaultAd,
    activeSchedules: filteredActive,
    scheduledAdIds: adPayload.scheduledAdIds
  };
}

// Store io instance globally
let ioInstance: Server | null = null;

export function setupSocketIO(io: Server) {
  ioInstance = io;
  io.on('connection', (socket: Socket) => {
    console.log(`🔌 New client connected: ${socket.id}`);
    const observedIp = getClientIp(socket);
    if (observedIp) {
      socket.emit('player:network-info', { observedIp });
    }

    // Player registers itself with deviceId (which can be IP address)
    socket.on('player:register', async (data: { deviceId: string; deviceIP?: string; deviceName?: string }) => {
      // Wrap in try-catch to handle database errors gracefully
      try {
        const { deviceId, deviceIP, deviceName } = data;
        
        if (!deviceId) {
          socket.emit('error', { message: 'deviceId is required' });
          return;
        }

        // Store connection under deviceId (and under deviceIP when different, so we find player by IP when screen is created with that IP)
        const keysToStore: string[] = [deviceId];
        if (deviceIP && deviceIP.trim() !== '' && deviceIP !== deviceId) {
          keysToStore.push(deviceIP.trim());
        }
        keysToStore.forEach((key) => {
          let set = connectedPlayers.get(key);
          if (!set) {
            set = new Set<string>();
            connectedPlayers.set(key, set);
          }
          set.add(socket.id);
        });
        socketToDevice.set(socket.id, deviceId);
        socketToDeviceKeys.set(socket.id, keysToStore);

        console.log(`📱 Player registered: ${deviceId} (IP: ${deviceIP || deviceId}) (${deviceName || 'Unknown'}) - Socket: ${socket.id}`);

        // Find screen in database - match by deviceId first, then by IP address
        let screens;
        try {
          screens = await screenService.getScreens();
        } catch (dbError: any) {
          // Log error but don't show full stack trace for connection timeouts
          const errorMessage = dbError.message || 'Unknown database error';
          if (errorMessage.includes('timeout') || errorMessage.includes('Connection terminated')) {
            console.warn(`⚠️ Database connection timeout while fetching screens for player ${deviceId}. Player will register without screen matching.`);
          } else {
            console.error('❌ Error fetching screens:', errorMessage);
          }
          
          // If database error, still allow registration but without screen matching
          socket.emit('player:registered', {
            success: true,
            deviceId,
            observedIp: getClientIp(socket) || undefined,
            message: 'Player registered successfully (database connection issue - screen matching unavailable)'
          });
          // Notify all clients about new player even if database fails
          io.emit('player:connected', {
            deviceId,
            deviceName: deviceName || 'Unknown Device',
            socketId: socket.id
          });
          return;
        }
        
        let screen = screens.find(s => s.deviceId === deviceId);
        
        // If not found by deviceId, try matching by IP address
        if (!screen && deviceIP) {
          screen = screens.find(s => s.ipAddress === deviceIP);
          // If found by IP, update screen's device_id to current client deviceId so play/refresh find this socket
          if (screen) {
            try {
              const { pool } = await import('../config/database');
              await pool.query(
                'UPDATE screens SET device_id = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
                [deviceId, screen.id]
              );
              screen.deviceId = deviceId;
            } catch (updateErr: any) {
              console.warn(`⚠️ Could not update screen device_id for screen ${screen.id} (player still registered):`, updateErr.message);
            }
          }
        }

        if (screen) {
          // Track this screen's connected device key so refresh/layout find player even if DB device_id is stale
          let keysSet = screenIdToDeviceKeys.get(screen.id);
          if (!keysSet) {
            keysSet = new Set<string>();
            screenIdToDeviceKeys.set(screen.id, keysSet);
          }
          keysSet.add(deviceId);
          socketToScreenId.set(socket.id, screen.id);
          
          // Cancel any pending offline timer for this screen (reconnected within grace period)
          const pendingTimer = pendingOfflineTimers.get(screen.id);
          if (pendingTimer) {
            clearTimeout(pendingTimer);
            pendingOfflineTimers.delete(screen.id);
            pendingDisconnects.delete(screen.id);
            console.log(`🔄 Player ${deviceId} reconnected within grace period - cancelled offline timer for screen ${screen.id}`);
          }
          
          // Update screen status to online
          const { pool } = await import('../config/database');
          await pool.query(
            'UPDATE screens SET status = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
            ['online', screen.id]
          );
          
          // Load screen regions
          try {
            const regions = await screenRegionsService.getScreenRegions(screen.id);
            console.log(`📐 Loaded ${regions.length} regions for screen ${screen.id}`);
            
            // Load active schedules with advertisement details
            let activeSchedules: any[] = [];
            try {
              const schedulesWithAds = await advertisementSchedulesService.getActiveSchedulesWithAds(screen.id);
              activeSchedules = schedulesWithAds.map(item => ({
                schedule: item.schedule,
                advertisement: item.advertisement
              }));
              console.log(`📅 Found ${activeSchedules.length} active schedules for screen ${screen.id}`);
              // Log schedule details for debugging
              activeSchedules.forEach((item, index) => {
                console.log(`📋 Schedule ${index + 1}:`, {
                  scheduleId: item.schedule.id,
                  adId: item.schedule.adId,
                  regionId: item.schedule.regionId,
                  hasRegionId: !!item.schedule.regionId,
                  advertisementTitle: item.advertisement?.title,
                  advertisementFileUrl: item.advertisement?.fileUrl
                });
              });
            } catch (scheduleError) {
              console.error('Error loading active schedules:', scheduleError);
            }

            // When no active schedule, or to filter stale schedules, look at assigned advertisements
            let defaultAd: any = null;
            let assignedAdvertisements: any[] = [];
            let scheduledAdIds: number[] = [];
            try {
              const screenWithAds = await screenService.getScreenById(screen.id);
              if (screenWithAds.assignedAdvertisements && screenWithAds.assignedAdvertisements.length > 0) {
                const adPayload = await preparePlayerAdvertisementPayload(
                  screen.id,
                  screenWithAds.assignedAdvertisements,
                  activeSchedules
                );
                assignedAdvertisements = adPayload.assignedAdvertisements;
                defaultAd = adPayload.defaultAd;
                activeSchedules = adPayload.activeSchedules;
                scheduledAdIds = adPayload.scheduledAdIds;
                if (defaultAd) {
                  console.log(`📌 No active schedule; default playlist ad: ${defaultAd.title}`);
                }
              }
            } catch (e) {
              console.error('Error fetching assigned advertisements/default ad:', e);
            }

            // For 1x1 grid: if a schedule has no regionId, use the only region
            const normalizedSchedules = activeSchedules.map((item: any) => {
              const schedule = { ...item.schedule };
              if ((schedule.regionId == null || schedule.regionId === undefined) && regions.length === 1) {
                schedule.regionId = regions[0].id;
              }
              return { schedule, advertisement: item.advertisement };
            });
            
            // Send confirmation with screenId, regions, active schedules, optional defaultAd, and screen settings
            socket.emit('player:registered', {
              success: true,
              deviceId,
              observedIp: getClientIp(socket) || undefined,
              screenId: screen.id,
              regions: regions,
              activeSchedules: normalizedSchedules,
              defaultAd: defaultAd || undefined,
              assignedAdvertisements: assignedAdvertisements,
              scheduledAdIds: scheduledAdIds,
              // Screen-level settings so players (web/mobile) can reflect configuration
              orientation: screen.orientation || null,
              screenSize: screen.screenSize || null,
              screenWidth: screen.screenWidth || null,
              screenHeight: screen.screenHeight || null,
              startDate: screen.startDate || null,
              endDate: screen.endDate || null,
              startTime: screen.startTime || null,
              endTime: screen.endTime || null,
              message: 'Player registered successfully'
            });
            
            // Auto-play active schedules in their assigned regions
            if (normalizedSchedules.length > 0 && regions.length > 0) {
              setTimeout(async () => {
                for (const item of normalizedSchedules) {
                  const { schedule, advertisement } = item;
                  
                  // Only play if schedule has a regionId assigned
                  if (schedule.regionId && advertisement && advertisement.fileUrl) {
                    try {
                      console.log(`🎬 Auto-playing advertisement ${advertisement.id} in region ${schedule.regionId}`);
                      await sendPlayCommandToDevice(
                        deviceId,
                        advertisement.fileUrl,
                        advertisement.title || 'Advertisement',
                        schedule.regionId
                      );
                      // Small delay between plays
                      await new Promise(resolve => setTimeout(resolve, 500));
                    } catch (playError) {
                      console.error(`Error auto-playing advertisement ${advertisement.id}:`, playError);
                    }
                  }
                }
              }, 2000); // Wait 2 seconds after registration before auto-playing
            }
          } catch (error) {
            console.error('Error loading screen regions:', error);
            // Send confirmation without regions if error
            socket.emit('player:registered', {
              success: true,
              deviceId,
              observedIp: getClientIp(socket) || undefined,
              screenId: screen.id,
              message: 'Player registered successfully'
            });
          }
        } else {
          // Send confirmation without screenId if screen not found
          socket.emit('player:registered', {
            success: true,
            deviceId,
            observedIp: getClientIp(socket) || undefined,
            message: 'Player registered successfully (screen not found in database)'
          });
        }

        // Notify all clients about new player
        io.emit('player:connected', {
          deviceId,
          deviceName: deviceName || 'Unknown Device',
          socketId: socket.id
        });
      } catch (error: any) {
        console.error('Error registering player:', error);
        socket.emit('error', { message: error.message || 'Failed to register player' });
      }
    });

    // Handle play video command
    socket.on('player:play', async (data: { videoUrl: string; videoTitle?: string }) => {
      try {
        const deviceId = socketToDevice.get(socket.id);
        
        if (!deviceId) {
          socket.emit('error', { message: 'Player not registered. Please register first.' });
          return;
        }

        const { videoUrl, videoTitle } = data;

        if (!videoUrl) {
          socket.emit('error', { message: 'videoUrl is required' });
          return;
        }

        console.log(`🎬 Play command received for device ${deviceId}: ${videoUrl}`);

        // Find screen in database
        const screens = await screenService.getScreens();
        const screen = screens.find(s => s.deviceId === deviceId);

        if (screen) {
          // Update screen status in database
          const { pool } = await import('../config/database');
          await pool.query(
            'UPDATE screens SET status = $1, current_video_url = $2, current_video_title = $3, video_started_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = $4',
            ['playing', videoUrl, videoTitle || null, screen.id]
          );
        }

        // Send play command to player
        socket.emit('play', {
          videoUrl,
          videoTitle: videoTitle || 'Untitled',
          timestamp: new Date().toISOString()
        });

        // Notify all clients
        io.emit('player:playing', {
          deviceId,
          videoUrl,
          videoTitle: videoTitle || 'Untitled'
        });
      } catch (error: any) {
        console.error('Error handling play command:', error);
        socket.emit('error', { message: error.message || 'Failed to play video' });
      }
    });

    // Handle stop video command
    socket.on('player:stop', async () => {
      try {
        const deviceId = socketToDevice.get(socket.id);
        
        if (!deviceId) {
          socket.emit('error', { message: 'Player not registered. Please register first.' });
          return;
        }

        console.log(`⏹ Stop command received for device ${deviceId}`);

        // Find screen in database
        const screens = await screenService.getScreens();
        const screen = screens.find(s => s.deviceId === deviceId);

        if (screen) {
          // Update screen status in database
          const { pool } = await import('../config/database');
          await pool.query(
            'UPDATE screens SET status = $1, current_video_url = NULL, current_video_title = NULL, video_started_at = NULL, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
            ['online', screen.id]
          );
        }

        // Send stop command to player
        socket.emit('stop', {
          timestamp: new Date().toISOString()
        });

        // Notify all clients
        io.emit('player:stopped', {
          deviceId
        });
      } catch (error: any) {
        console.error('Error handling stop command:', error);
        socket.emit('error', { message: error.message || 'Failed to stop video' });
      }
    });

    // Player requests current schedules (for time-based switching – e.g. every minute)
    socket.on('schedules:getCurrent', async () => {
      try {
        // Prefer screenId we already resolved at registration time.
        const screenId = socketToScreenId.get(socket.id);

        // Fallback to any registered device keys (deviceId + deviceIP).
        const keys = socketToDeviceKeys.get(socket.id) || [];
        const primaryKey = socketToDevice.get(socket.id);
        const candidateKeys = [
          ...(primaryKey ? [primaryKey] : []),
          ...keys
        ].filter((v, i, arr) => !!v && arr.indexOf(v) === i) as string[];

        if (!screenId && candidateKeys.length === 0) {
          socket.emit('schedules:current', { activeSchedules: [], defaultAd: null, regions: [] });
          return;
        }
        let resolvedScreen: Screen | null = null;
        if (screenId) {
          try {
            // getScreenById returns the "full" screen shape; we only need id here.
            const full = await screenService.getScreenById(screenId);
            resolvedScreen = full as any;
          } catch {
            resolvedScreen = null;
          }
        }
        if (!resolvedScreen) {
          const screens = await screenService.getScreens();
          resolvedScreen =
            screens.find((s: Screen) => candidateKeys.some((k) => s.deviceId === k || s.ipAddress === k)) || null;
        }
        if (!resolvedScreen) {
          socket.emit('schedules:current', { activeSchedules: [], defaultAd: null, regions: [] });
          return;
        }

        const regions = await screenRegionsService.getScreenRegions(resolvedScreen.id);
        let activeSchedules: any[] = [];
        try {
          const schedulesWithAds = await advertisementSchedulesService.getActiveSchedulesWithAds(resolvedScreen.id);
          activeSchedules = schedulesWithAds.map((item: any) => ({
            schedule: item.schedule,
            advertisement: item.advertisement
          }));
        } catch (e) {
          console.error('Error loading active schedules for getCurrent:', e);
        }
        let defaultAd: any = null;
        let assignedAdvertisements: any[] = [];
        let scheduledAdIds: number[] = [];
        try {
          const screenWithAds = await screenService.getScreenById(resolvedScreen.id);
          if (screenWithAds.assignedAdvertisements && screenWithAds.assignedAdvertisements.length > 0) {
            const adPayload = await preparePlayerAdvertisementPayload(
              resolvedScreen.id,
              screenWithAds.assignedAdvertisements,
              activeSchedules
            );
            assignedAdvertisements = adPayload.assignedAdvertisements;
            defaultAd = adPayload.defaultAd;
            activeSchedules = adPayload.activeSchedules;
            scheduledAdIds = adPayload.scheduledAdIds;
          }
        } catch (_) {}
        const normalizedSchedules = activeSchedules.map((item: any) => {
          const schedule = { ...item.schedule };
          if ((schedule.regionId == null || schedule.regionId === undefined) && regions.length === 1) {
            schedule.regionId = regions[0].id;
          }
          return { schedule, advertisement: item.advertisement };
        });
        socket.emit('schedules:current', {
          activeSchedules: normalizedSchedules,
          defaultAd: defaultAd || undefined,
          regions,
          assignedAdvertisements,
          scheduledAdIds
        });
      } catch (err: any) {
        console.error('schedules:getCurrent error:', err);
        socket.emit('schedules:current', { activeSchedules: [], defaultAd: null, regions: [] });
      }
    });

    // Handle player status updates
    socket.on('player:status', (data: { status: 'playing' | 'paused' | 'stopped' | 'error'; currentTime?: number; duration?: number }) => {
      const deviceId = socketToDevice.get(socket.id);
      if (deviceId) {
        console.log(`📊 Status update from ${deviceId}: ${data.status}`);
        io.emit('player:status-update', {
          deviceId,
          ...data
        });
      }
    });

    // Handle disconnection with grace period to handle network fluctuations
    socket.on('disconnect', async () => {
      const deviceId = socketToDevice.get(socket.id);
      const allKeys = socketToDeviceKeys.get(socket.id);
      const screenId = socketToScreenId.get(socket.id);
      
      if (deviceId || (allKeys && allKeys.length > 0)) {
        console.log(`🔌 Player disconnected: ${deviceId || allKeys?.[0]} (${socket.id}) - starting ${DISCONNECT_GRACE_PERIOD_MS/1000}s grace period`);
        
        // Clean up socket mappings immediately
        (allKeys || (deviceId ? [deviceId] : [])).forEach((key) => {
          const set = connectedPlayers.get(key);
          if (set) {
            set.delete(socket.id);
            if (set.size === 0) connectedPlayers.delete(key);
          }
        });
        socketToDevice.delete(socket.id);
        socketToDeviceKeys.delete(socket.id);
        if (screenId != null) {
          const keysSet = screenIdToDeviceKeys.get(screenId);
          if (keysSet && deviceId) {
            keysSet.delete(deviceId);
            if (allKeys) allKeys.forEach((k) => keysSet.delete(k));
            if (keysSet.size === 0) screenIdToDeviceKeys.delete(screenId);
          }
          socketToScreenId.delete(socket.id);
        }

        // Check if device has other active connections (multiple tabs scenario)
        const hasOtherConnections = deviceId && connectedPlayers.has(deviceId) && connectedPlayers.get(deviceId)!.size > 0;
        
        if (hasOtherConnections) {
          console.log(`📱 Device ${deviceId} still has other active connections - skipping offline timer`);
          return;
        }

        // Use grace period before marking offline (to handle network fluctuations)
        const targetScreenId = screenId;
        
        if (targetScreenId != null) {
          // Cancel any existing timer for this screen
          const existingTimer = pendingOfflineTimers.get(targetScreenId);
          if (existingTimer) {
            clearTimeout(existingTimer);
          }
          
          // Store pending disconnect info
          pendingDisconnects.set(targetScreenId, deviceId || allKeys?.[0] || 'unknown');
          
          // Set new timer with grace period
          const offlineTimer = setTimeout(async () => {
            // Check again if device reconnected during grace period
            const reconnectedDeviceId = pendingDisconnects.get(targetScreenId);
            if (reconnectedDeviceId && connectedPlayers.has(reconnectedDeviceId) && connectedPlayers.get(reconnectedDeviceId)!.size > 0) {
              console.log(`🔄 Device ${reconnectedDeviceId} reconnected during grace period - not marking offline`);
              pendingOfflineTimers.delete(targetScreenId);
              pendingDisconnects.delete(targetScreenId);
              return;
            }
            
            console.log(`⏱️ Grace period expired for screen ${targetScreenId} - marking offline`);
            
            try {
              const { pool } = await import('../config/database');
              await pool.query(
                'UPDATE screens SET status = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
                ['offline', targetScreenId]
              );
            } catch (error) {
              console.error('Error updating screen status on disconnect:', error);
            }
            
            // Clean up
            pendingOfflineTimers.delete(targetScreenId);
            pendingDisconnects.delete(targetScreenId);
            
            // Notify all clients about offline status
            io.emit('player:disconnected', {
              deviceId: reconnectedDeviceId
            });
          }, DISCONNECT_GRACE_PERIOD_MS);
          
          pendingOfflineTimers.set(targetScreenId, offlineTimer);
        } else {
          // No screenId - try to find screen by deviceId with grace period
          const offlineTimer = setTimeout(async () => {
            // Check if device reconnected
            if (deviceId && connectedPlayers.has(deviceId) && connectedPlayers.get(deviceId)!.size > 0) {
              console.log(`🔄 Device ${deviceId} reconnected during grace period - not marking offline`);
              return;
            }
            
            try {
              const screens = await screenService.getScreens();
              const screen = screens.find(s => s.deviceId === deviceId);
              if (screen) {
                console.log(`⏱️ Grace period expired for device ${deviceId} (screen ${screen.id}) - marking offline`);
                const { pool } = await import('../config/database');
                await pool.query(
                  'UPDATE screens SET status = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
                  ['offline', screen.id]
                );
                
                // Notify all clients
                io.emit('player:disconnected', {
                  deviceId
                });
              }
            } catch (error) {
              console.error('Error updating screen status on disconnect:', error);
            }
          }, DISCONNECT_GRACE_PERIOD_MS);
          
          // Note: We don't track this timer by screenId since we don't have one
          // In worst case, reconnection will happen naturally
        }
      } else {
        socketToScreenId.delete(socket.id);
        console.log(`🔌 Client disconnected: ${socket.id}`);
      }
    });
  });

  console.log('✅ Socket.IO server initialized');
}

/**
 * Send play command to a specific device via socket
 */
export async function sendPlayCommandToDevice(
  deviceId: string,
  videoUrl: string,
  videoTitle?: string,
  regionId?: number | null,
  muted: boolean = false,
  imagePlaylist?: string[]
): Promise<{ success: boolean; message: string }> {
  if (!ioInstance) {
    return {
      success: false,
      message: 'Socket.IO server not initialized'
    };
  }

  const socketIds = getSocketIdsForDevice(deviceId);
  if (socketIds.length === 0) {
    return {
      success: false,
      message: `Device ${deviceId} is not connected via socket`
    };
  }
  const io = ioInstance;

  // Find screen in database - match by deviceId or IP address
  try {
    const screens = await screenService.getScreens();
    let screen = screens.find(s => s.deviceId === deviceId);
    
    // If not found by deviceId, try matching by IP address
    if (!screen) {
      screen = screens.find(s => s.ipAddress === deviceId);
    }

    if (screen) {
      // Update screen status in database
      const { pool } = await import('../config/database');
      await pool.query(
        'UPDATE screens SET status = $1, current_video_url = $2, current_video_title = $3, video_started_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = $4',
        ['playing', videoUrl, videoTitle || null, screen.id]
      );
    }

    // Send play command to player
    const playCommand: any = {
      videoUrl,
      videoTitle: videoTitle || 'Untitled',
      timestamp: new Date().toISOString(),
      regionId: regionId || undefined,
      muted: muted === true
    };
    if (imagePlaylist && imagePlaylist.length > 0) {
      playCommand.imagePlaylist = imagePlaylist;
    }
    
    console.log(`📤 Sending play command to device ${deviceId}:`, {
      videoUrl,
      videoTitle: videoTitle || 'Untitled',
      regionId: regionId || undefined,
      hasRegionId: !!regionId,
      muted: muted === true,
      imagePlaylistLength: imagePlaylist ? imagePlaylist.length : 0
    });
    
    socketIds.forEach((sid) => io.to(sid).emit('play', playCommand));

    // Notify all clients
    io.emit('player:playing', {
      deviceId,
      videoUrl,
      videoTitle: videoTitle || 'Untitled'
    });

    return {
      success: true,
      message: `Play command sent to device ${deviceId} via socket`
    };
  } catch (error: any) {
    return {
      success: false,
      message: error.message || 'Failed to send play command'
    };
  }
}

/**
 * Send stop command to a specific device via socket
 */
export async function sendStopCommandToDevice(
  deviceId: string,
  regionId?: number | null
): Promise<{ success: boolean; message: string }> {
  if (!ioInstance) {
    return {
      success: false,
      message: 'Socket.IO server not initialized'
    };
  }

  const socketIds = getSocketIdsForDevice(deviceId);
  if (socketIds.length === 0) {
    return {
      success: false,
      message: `Device ${deviceId} is not connected via socket`
    };
  }
  const io = ioInstance;

  try {
    // Find screen in database
    const screens = await screenService.getScreens();
    const screen = screens.find(s => s.deviceId === deviceId);

    if (screen) {
      // Update screen status in database
      const { pool } = await import('../config/database');
      await pool.query(
        'UPDATE screens SET status = $1, current_video_url = NULL, current_video_title = NULL, video_started_at = NULL, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
        ['online', screen.id]
      );
    }

    // Send stop command to all tabs for this device
    socketIds.forEach((sid) => io.to(sid).emit('stop', {
      timestamp: new Date().toISOString(),
      regionId: regionId || undefined
    }));

    // Notify all clients
    io.emit('player:stopped', {
      deviceId
    });

    return {
      success: true,
      message: `Stop command sent to device ${deviceId} via socket`
    };
  } catch (error: any) {
    return {
      success: false,
      message: error.message || 'Failed to send stop command'
    };
  }
}

/**
 * Send pause command to a specific device via socket
 */
export async function sendPauseCommandToDevice(
  deviceId: string,
  regionId?: number | null
): Promise<{ success: boolean; message: string }> {
  if (!ioInstance) {
    return {
      success: false,
      message: 'Socket.IO server not initialized'
    };
  }

  const socketIds = getSocketIdsForDevice(deviceId);
  if (socketIds.length === 0) {
    return {
      success: false,
      message: `Device ${deviceId} is not connected via socket`
    };
  }
  const io = ioInstance;

  try {
    // Send pause command to all tabs for this device
    socketIds.forEach((sid) => io.to(sid).emit('pause', {
      timestamp: new Date().toISOString(),
      regionId: regionId || undefined
    }));

    // Notify all clients
    io.emit('player:paused', {
      deviceId
    });

    return {
      success: true,
      message: `Pause command sent to device ${deviceId} via socket`
    };
  } catch (error: any) {
    return {
      success: false,
      message: error.message || 'Failed to send pause command'
    };
  }
}

/**
 * Send resume command to a specific device via socket
 */
export async function sendResumeCommandToDevice(
  deviceId: string,
  regionId?: number | null
): Promise<{ success: boolean; message: string }> {
  if (!ioInstance) {
    return {
      success: false,
      message: 'Socket.IO server not initialized'
    };
  }

  const socketIds = getSocketIdsForDevice(deviceId);
  if (socketIds.length === 0) {
    return {
      success: false,
      message: `Device ${deviceId} is not connected via socket`
    };
  }
  const io = ioInstance;

  try {
    // Send resume command to all tabs for this device
    socketIds.forEach((sid) => io.to(sid).emit('resume', {
      timestamp: new Date().toISOString(),
      regionId: regionId || undefined
    }));

    // Notify all clients
    io.emit('player:resumed', {
      deviceId
    });

    return {
      success: true,
      message: `Resume command sent to device ${deviceId} via socket`
    };
  } catch (error: any) {
    return {
      success: false,
      message: error.message || 'Failed to send resume command'
    };
  }
}

/**
 * Send fullscreen command to a specific device via socket
 */
export async function sendFullscreenCommandToDevice(
  deviceId: string,
  regionId?: number | null,
  enabled: boolean = true
): Promise<{ success: boolean; message: string }> {
  if (!ioInstance) {
    return {
      success: false,
      message: 'Socket.IO server not initialized'
    };
  }

  const socketIds = getSocketIdsForDevice(deviceId);
  if (socketIds.length === 0) {
    return {
      success: false,
      message: `Device ${deviceId} is not connected via socket`
    };
  }
  const io = ioInstance;

  try {
    // Send fullscreen command to all tabs for this device
    socketIds.forEach((sid) => io.to(sid).emit('fullscreen', {
      timestamp: new Date().toISOString(),
      regionId: regionId || undefined,
      enabled: enabled
    }));

    // Notify all clients
    io.emit('player:fullscreen', {
      deviceId,
      regionId: regionId || undefined,
      enabled
    });

    return {
      success: true,
      message: `Fullscreen command sent to device ${deviceId} via socket`
    };
  } catch (error: any) {
    return {
      success: false,
      message: error.message || 'Failed to send fullscreen command'
    };
  }
}

/**
 * Get list of connected players
 */
export function getConnectedPlayers(): Array<{ deviceId: string; socketId: string }> {
  const result: Array<{ deviceId: string; socketId: string }> = [];
  connectedPlayers.forEach((socketIdSet, deviceId) => {
    socketIdSet.forEach((socketId) => result.push({ deviceId, socketId }));
  });
  return result;
}

/**
 * Check if a device is connected
 */
export function isDeviceConnected(deviceId: string): boolean {
  return connectedPlayers.has(deviceId);
}

/** Payload sent to player when screen settings are updated (no refresh needed) */
export interface ScreenSettingsPayload {
  orientation?: string | null;
  screenSize?: string | null;
  screenWidth?: number | null;
  screenHeight?: number | null;
  startDate?: string | Date | null;
  endDate?: string | Date | null;
  startTime?: string | null;
  endTime?: string | null;
}

/**
 * Push updated screen settings to all sockets for a screen (uses DB + live connection map).
 * Use this after updating a screen so we find the player even if DB device_id is stale.
 */
export async function emitScreenSettingsToPlayerByScreenId(screenId: number, settings: ScreenSettingsPayload): Promise<void> {
  if (!ioInstance) return;
  const io = ioInstance;
  const keys: string[] = [];
  try {
    const screen = await screenService.getScreenById(screenId).catch(() => null);
    if (screen?.deviceId) keys.push(screen.deviceId);
    if (screen?.ipAddress && !keys.includes(screen.ipAddress)) keys.push(screen.ipAddress);
  } catch (_) {}
  const liveKeys = screenIdToDeviceKeys.get(screenId);
  if (liveKeys) liveKeys.forEach((k) => { if (k && !keys.includes(k)) keys.push(k); });
  const allSocketIds = new Set<string>();
  keys.forEach((k) => getSocketIdsForDevice(k).forEach((sid) => allSocketIds.add(sid)));
  if (allSocketIds.size === 0) {
    console.log(`📤 No connected player for screen ${screenId} – skipping settings push`);
    return;
  }
  const payload = {
    orientation: settings.orientation ?? null,
    screenSize: settings.screenSize ?? null,
    screenWidth: settings.screenWidth ?? null,
    screenHeight: settings.screenHeight ?? null,
    startDate:
      settings.startDate != null
        ? typeof settings.startDate === 'string'
          ? settings.startDate
          : (settings.startDate as Date).toISOString?.()
        : null,
    endDate:
      settings.endDate != null
        ? typeof settings.endDate === 'string'
          ? settings.endDate
          : (settings.endDate as Date).toISOString?.()
        : null,
    startTime: settings.startTime ?? null,
    endTime: settings.endTime ?? null
  };
  allSocketIds.forEach((sid) => io.to(sid).emit('screen:settings-updated', payload));
  console.log(`📤 Pushed screen settings to ${allSocketIds.size} socket(s) for screen ${screenId}`);
}

/**
 * Push updated screen settings to a connected player so it can apply without refresh.
 * Call this after updating a screen (e.g. orientation, screenSize, time window).
 */
export function emitScreenSettingsToPlayer(deviceKey: string | null, settings: ScreenSettingsPayload): void {
  if (!ioInstance || !deviceKey) return;
  const socketIds = getSocketIdsForDevice(deviceKey);
  if (socketIds.length === 0) {
    console.log(`📤 No connected player for key "${deviceKey}" – skipping settings push`);
    return;
  }
  const io = ioInstance;

  const payload = {
    orientation: settings.orientation ?? null,
    screenSize: settings.screenSize ?? null,
    screenWidth: settings.screenWidth ?? null,
    screenHeight: settings.screenHeight ?? null,
    startDate:
      settings.startDate != null
        ? typeof settings.startDate === 'string'
          ? settings.startDate
          : (settings.startDate as Date).toISOString?.()
        : null,
    endDate:
      settings.endDate != null
        ? typeof settings.endDate === 'string'
          ? settings.endDate
          : (settings.endDate as Date).toISOString?.()
        : null,
    startTime: settings.startTime ?? null,
    endTime: settings.endTime ?? null
  };

  socketIds.forEach((sid) => io.to(sid).emit('screen:settings-updated', payload));
  console.log(`📤 Pushed screen settings to player ${deviceKey} (${socketIds.length} tab(s)):`, payload);
}

/**
 * Tell the player to clear display immediately (stop all video/regions).
 * Used when screen is reset so index.html clears and no ghost content remains.
 */
export async function emitScreenResetToPlayer(screenId: number): Promise<void> {
  if (!ioInstance) return;
  const io = ioInstance;
  try {
    const screen = await screenService.getScreenById(screenId).catch(() => null);
    const keys: string[] = [];
    if (screen?.deviceId) keys.push(screen.deviceId);
    if (screen?.ipAddress && !keys.includes(screen.ipAddress)) keys.push(screen.ipAddress);
    const liveKeys = screenIdToDeviceKeys.get(screenId);
    if (liveKeys) liveKeys.forEach((k) => { if (k && !keys.includes(k)) keys.push(k); });
    const allSocketIds = new Set<string>();
    keys.forEach((k) => getSocketIdsForDevice(k).forEach((sid) => allSocketIds.add(sid)));
    if (allSocketIds.size === 0) return;
    allSocketIds.forEach((sid) => io.to(sid).emit('screen:reset'));
    console.log(`📤 Sent screen:reset to ${allSocketIds.size} socket(s) for screen ${screenId}`);
  } catch (err) {
    console.error('emitScreenResetToPlayer error:', err);
  }
}

/**
 * Push current regions + active schedules to a player.
 * Used when regions/schedules change so layout updates instantly without reload.
 */
export async function emitScreenLayoutToPlayer(screenId: number): Promise<void> {
  if (!ioInstance) return;
  const io = ioInstance;

  try {
    const screen = await screenService.getScreenById(screenId);
    const keys: string[] = [];
    if (screen?.deviceId) keys.push(screen.deviceId);
    if (screen?.ipAddress && !keys.includes(screen.ipAddress)) keys.push(screen.ipAddress);
    const liveKeys = screenIdToDeviceKeys.get(screenId);
    if (liveKeys) liveKeys.forEach((k) => { if (k && !keys.includes(k)) keys.push(k); });
    const allSocketIds = new Set<string>();
    keys.forEach((k) => getSocketIdsForDevice(k).forEach((sid) => allSocketIds.add(sid)));
    if (!screen || allSocketIds.size === 0) return;

    const regions = await screenRegionsService.getScreenRegions(screen.id);

    let activeSchedules: any[] = [];
    try {
      const schedulesWithAds = await advertisementSchedulesService.getActiveSchedulesWithAds(screen.id);
      activeSchedules = schedulesWithAds.map((item: any) => ({
        schedule: item.schedule,
        advertisement: item.advertisement
      }));
    } catch (e) {
      console.error('Error loading active schedules for emitScreenLayoutToPlayer:', e);
    }

    let defaultAd: any = null;
    let assignedAdvertisements: any[] = [];
    let scheduledAdIds: number[] = [];
    if (screen.assignedAdvertisements && screen.assignedAdvertisements.length > 0) {
      const adPayload = await preparePlayerAdvertisementPayload(
        screen.id,
        screen.assignedAdvertisements,
        activeSchedules
      );
      assignedAdvertisements = adPayload.assignedAdvertisements;
      defaultAd = adPayload.defaultAd;
      activeSchedules = adPayload.activeSchedules;
      scheduledAdIds = adPayload.scheduledAdIds;
    }

    const normalizedSchedules = activeSchedules.map((item: any) => {
      const schedule = { ...item.schedule };
      if ((schedule.regionId == null || schedule.regionId === undefined) && regions.length === 1) {
        schedule.regionId = regions[0].id;
      }
      return { schedule, advertisement: item.advertisement };
    });

    allSocketIds.forEach((sid) => io.to(sid).emit('schedules:current', {
      activeSchedules: normalizedSchedules,
      defaultAd: defaultAd || undefined,
      regions,
      assignedAdvertisements,
      scheduledAdIds
    }));

    console.log(`📤 Pushed layout/schedules to ${allSocketIds.size} socket(s) for screen ${screen.id}`);
  } catch (err) {
    console.error('emitScreenLayoutToPlayer error:', err);
  }
}

/**
 * Tell the player to hard-refresh the page (reload index.html).
 * Looks up sockets by: screen's deviceId, screen's ipAddress, and optionally
 * deviceId/ipAddress from the request (so we find the player even if DB is stale).
 * @returns number of sockets the refresh was sent to (0 if none connected).
 */
export async function emitRefreshToPlayer(
  screenId: number,
  options?: { deviceId?: string | null; ipAddress?: string | null }
): Promise<number> {
  if (!ioInstance) return 0;
  const io = ioInstance;
  try {
    const keys: string[] = [];
    const screen = await screenService.getScreenById(screenId).catch(() => null);
    if (screen) {
      if (screen.deviceId && typeof screen.deviceId === 'string') keys.push(screen.deviceId);
      if (screen.ipAddress && typeof screen.ipAddress === 'string' && !keys.includes(screen.ipAddress)) keys.push(screen.ipAddress);
    }
    if (options) {
      if (options.deviceId && typeof options.deviceId === 'string' && !keys.includes(options.deviceId)) keys.push(options.deviceId);
      if (options.ipAddress && typeof options.ipAddress === 'string' && !keys.includes(options.ipAddress)) keys.push(options.ipAddress);
    }
    // Use live connection map so we find player even if DB device_id is stale (e.g. player registered with UUID)
    const liveKeys = screenIdToDeviceKeys.get(screenId);
    if (liveKeys) {
      liveKeys.forEach((k) => { if (k && !keys.includes(k)) keys.push(k); });
    }
    if (keys.length === 0) {
      console.warn(`emitRefreshToPlayer: no deviceId or ipAddress for screen ${screenId} (screen or body)`);
      return 0;
    }
    const allSocketIds = new Set<string>();
    keys.forEach((k) => getSocketIdsForDevice(k).forEach((sid) => allSocketIds.add(sid)));
    if (allSocketIds.size === 0) {
      console.warn(`emitRefreshToPlayer: no connected player for screen ${screenId} (tried keys: ${keys.join(', ')})`);
      return 0;
    }
    allSocketIds.forEach((sid) => io.to(sid).emit('player:refresh'));
    console.log(`📤 Sent player:refresh to ${allSocketIds.size} socket(s) for screen ${screenId} (keys: ${keys.join(', ')})`);
    return allSocketIds.size;
  } catch (err) {
    console.error('emitRefreshToPlayer error:', err);
    return 0;
  }
}

