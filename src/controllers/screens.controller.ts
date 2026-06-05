import { Request, Response } from 'express';
import * as networkScanner from '../services/networkScanner.service';
import * as screenService from '../services/screen.service';
import * as videoPlayback from '../services/videoPlayback.service';
import * as screenRegionsService from '../services/screen-regions.service';
import * as advertisementSchedulesService from '../services/advertisement-schedules.service';
import * as socketService from '../services/socket.service';
import { CreateScreenRequest, UpdateScreenRequest } from '../types/device.types';

// Store active scans
const activeScans = new Map<string, { progress: number; status: string; devices: any[] }>();

// Helper: format a Date to local YYYY-MM-DD string for API responses
function formatLocalDate(date: Date | null): string | null {
  if (!date) return null;
  const d = new Date(date);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * POST /api/screens/scan
 * Start network scanning
 */
export const startScan = async (req: Request, res: Response) => {
  try {
    const scanId = `scan-${Date.now()}`;
    
    // Initialize scan
    activeScans.set(scanId, {
      progress: 0,
      status: 'scanning',
      devices: []
    });

    // Start scanning in background
    networkScanner.scanNetwork(scanId, activeScans).catch(err => {
      console.error('Scan error:', err);
      const scan = activeScans.get(scanId);
      if (scan) {
        scan.status = 'error';
      }
    });

    res.json({
      scanId,
      status: 'started'
    });
  } catch (error: any) {
    res.status(500).json({
      error: error.message || 'Failed to start scan'
    });
  }
};

/**
 * GET /api/screens/scan/:scanId/status
 * Get scan progress
 */
export const getScanStatus = async (req: Request, res: Response) => {
  try {
    const { scanId } = req.params;
    const scan = activeScans.get(scanId);

    if (!scan) {
      return res.status(404).json({
        error: 'Scan not found'
      });
    }

    res.json({
      progress: scan.progress,
      status: scan.status
    });
  } catch (error: any) {
    res.status(500).json({
      error: error.message || 'Failed to get scan status'
    });
  }
};

/**
 * GET /api/screens/discover
 * Get discovered devices
 */
export const getDiscoveredDevices = async (req: Request, res: Response) => {
  try {
    // Get all devices from all active scans
    const allDevices: any[] = [];
    
    activeScans.forEach((scan) => {
      allDevices.push(...scan.devices);
    });

    // Also get from database/storage
    const storedDevices = await screenService.getDiscoveredDevices();
    allDevices.push(...storedDevices);

    // Remove duplicates based on IP address
    const uniqueDevices = Array.from(
      new Map(allDevices.map(device => [device.ipAddress, device])).values()
    );

    res.json(uniqueDevices);
  } catch (error: any) {
    res.status(500).json({
      error: error.message || 'Failed to get discovered devices'
    });
  }
};

/**
 * POST /api/screens/register
 * Register a discovered device as a screen
 */
export const registerScreen = async (req: Request, res: Response) => {
  try {
    const { deviceId, name, location } = req.body;

    if (!deviceId || !name || !location) {
      return res.status(400).json({
        error: 'deviceId, name, and location are required'
      });
    }

    const screen = await screenService.registerScreen(deviceId, name, location);
    res.json(screen);
  } catch (error: any) {
    res.status(500).json({
      error: error.message || 'Failed to register screen'
    });
  }
};

/**
 * GET /api/screens
 * Get all registered screens
 */
export const getScreens = async (req: Request, res: Response) => {
  try {
    const screens = await screenService.getScreens();
    res.json(screens);
  } catch (error: any) {
    res.status(500).json({
      error: error.message || 'Failed to get screens'
    });
  }
};

/**
 * GET /api/screens/:id
 * Get screen by ID
 */
export const getScreenById = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const screen = await screenService.getScreenById(parseInt(id));
    res.json(screen);
  } catch (error: any) {
    if (error.message === 'Screen not found') {
      return res.status(404).json({
        error: 'Screen not found'
      });
    }
    res.status(500).json({
      error: error.message || 'Failed to get screen'
    });
  }
};

/**
 * GET /api/screens/:id/status
 * Get screen status
 */
export const getScreenStatus = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const status = await screenService.getScreenStatus(parseInt(id));
    res.json(status);
  } catch (error: any) {
    res.status(500).json({
      error: error.message || 'Failed to get screen status'
    });
  }
};

/**
 * DELETE /api/screens/:id
 * Delete a screen
 */
export const deleteScreen = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    await screenService.deleteScreen(parseInt(id));
    res.json({ success: true });
  } catch (error: any) {
    res.status(500).json({
      error: error.message || 'Failed to delete screen'
    });
  }
};

/**
 * POST /api/screens/:id/reset
 * Reset all screen-related data (schedules, ad assignments, regions) for this screen.
 * Clears ghost playback state and leaves screen with one default full-screen region.
 */
export const resetScreen = async (req: Request, res: Response) => {
  try {
    const screenId = parseInt(req.params.id);
    if (isNaN(screenId)) {
      return res.status(400).json({ error: 'Invalid screen ID' });
    }
    const screen = (await screenService.getScreens()).find(s => s.id === screenId);
    if (!screen) {
      return res.status(404).json({ error: 'Screen not found' });
    }
    await advertisementSchedulesService.deleteScreenSchedules(screenId);
    await screenService.clearScreenAds(screenId);
    await screenRegionsService.deleteScreenRegions(screenId);
    try {
      await videoPlayback.stopVideoOnDevice(screenId);
    } catch (e) {
      // Device may be offline; continue reset
    }
    await screenRegionsService.createDefaultScreenRegion(screenId);
    await socketService.emitScreenResetToPlayer(screenId);
    await socketService.emitScreenLayoutToPlayer(screenId);
    res.json({
      success: true,
      message: 'Screen reset: schedules, ads, and regions cleared; default region created.'
    });
  } catch (error: any) {
    res.status(500).json({
      error: error.message || 'Failed to reset screen'
    });
  }
};

/**
 * POST /api/screens/:id/refresh
 * Send command to player (index.html) to hard-refresh the page
 */
export const refreshPlayer = async (req: Request, res: Response) => {
  try {
    const screenId = parseInt(req.params.id);
    if (isNaN(screenId)) {
      return res.status(400).json({ error: 'Invalid screen ID' });
    }
    const body = (req.body || {}) as { deviceId?: string; ipAddress?: string };
    const sentCount = await socketService.emitRefreshToPlayer(screenId, {
      deviceId: body.deviceId ?? null,
      ipAddress: body.ipAddress ?? null
    });
    if (sentCount === 0) {
      return res.json({
        success: false,
        message: 'No player connected for this screen. Open the player (index.html) on the device first, then click Refresh.'
      });
    }
    res.json({ success: true, message: 'Refresh command sent to player' });
  } catch (error: any) {
    res.status(500).json({
      error: error.message || 'Failed to send refresh command'
    });
  }
};

/**
 * POST /api/screens/:id/play
 * Play video on a screen
 */
export const playVideo = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { videoUrl, videoTitle, regionId, muted, imagePlaylist } = req.body;

    if (!videoUrl) {
      return res.status(400).json({
        error: 'videoUrl is required'
      });
    }

    const result = await videoPlayback.playVideoOnDevice(
      parseInt(id),
      videoUrl,
      videoTitle,
      regionId || null,
      muted === true,
      Array.isArray(imagePlaylist) && imagePlaylist.length > 0 ? imagePlaylist : null
    );

    if (result.success) {
      // Video info is already stored in database by videoPlayback service

      res.json(result);
    } else {
      res.status(500).json(result);
    }
  } catch (error: any) {
    res.status(500).json({
      error: error.message || 'Failed to play video'
    });
  }
};

/**
 * POST /api/screens/:id/stop
 * Stop video playback on a screen
 */
export const stopVideo = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { regionId } = req.body;
    const result = await videoPlayback.stopVideoOnDevice(parseInt(id), regionId || null);

    if (result.success) {
      // Video info is already cleared in database by videoPlayback service

      res.json(result);
    } else {
      res.status(500).json(result);
    }
  } catch (error: any) {
    res.status(500).json({
      error: error.message || 'Failed to stop video'
    });
  }
};

/**
 * GET /api/screens/:id/playing
 * Get currently playing video info
 */
export const getPlayingVideo = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const result = await videoPlayback.getPlayingVideo(parseInt(id));
    res.json(result);
  } catch (error: any) {
    res.status(500).json({
      error: error.message || 'Failed to get playing video'
    });
  }
};

/**
 * POST /api/screens/:id/pause
 * Pause video playback on a screen
 */
export const pauseVideo = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { regionId } = req.body;
    const result = await videoPlayback.pauseVideoOnDevice(parseInt(id), regionId || null);

    if (result.success) {
      res.json(result);
    } else {
      res.status(500).json(result);
    }
  } catch (error: any) {
    res.status(500).json({
      error: error.message || 'Failed to pause video'
    });
  }
};

/**
 * POST /api/screens/:id/resume
 * Resume video playback on a screen
 */
export const resumeVideo = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { regionId } = req.body;
    const result = await videoPlayback.resumeVideoOnDevice(parseInt(id), regionId || null);

    if (result.success) {
      res.json(result);
    } else {
      res.status(500).json(result);
    }
  } catch (error: any) {
    res.status(500).json({
      error: error.message || 'Failed to resume video'
    });
  }
};

/**
 * POST /api/screens/:id/fullscreen
 * Set fullscreen mode on a screen
 */
export const setFullscreen = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { regionId, enabled = true } = req.body;
    const result = await videoPlayback.setFullscreenOnDevice(parseInt(id), regionId || null, enabled);

    if (result.success) {
      res.json(result);
    } else {
      res.status(500).json(result);
    }
  } catch (error: any) {
    res.status(500).json({
      error: error.message || 'Failed to set fullscreen'
    });
  }
};

/**
 * POST /api/screens
 * Create a screen manually (without device discovery)
 */
export const createScreen = async (req: Request, res: Response) => {
  try {
    const screenData: CreateScreenRequest = {
      name: req.body.name,
      deviceId: req.body.deviceId || null,
      ipAddress: req.body.ipAddress || null,
      macAddress: req.body.macAddress || null,
      location: req.body.location || null,
      groupId: req.body.groupId || null,
      subsiteId: req.body.subsiteId || null,
      sectionId: req.body.sectionId || null,
      specialDivisionId: req.body.specialDivisionId || null,
      assignedUserId: req.body.assignedUserId || null,
      assignedUserIds: req.body.assignedUserIds || null,
      startDate: req.body.startDate || null,
      endDate: req.body.endDate || null,
      startTime: req.body.startTime || null,
      endTime: req.body.endTime || null,
      advertisementIds: req.body.advertisementIds || []
    };

    if (!screenData.name) {
      return res.status(400).json({
        error: 'Screen name is required'
      });
    }

    const screen = await screenService.createScreen(screenData);
    // If a player is already connected with this IP/deviceId, push layout so it auto-plays without refresh
    await socketService.emitScreenLayoutToPlayer(screen.id);
    res.status(201).json(screen);
  } catch (error: any) {
    res.status(500).json({
      error: error.message || 'Failed to create screen'
    });
  }
};

/**
 * PUT /api/screens/:id
 * Update a screen
 */
export const updateScreen = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    
    // Log incoming request data
    console.log(`[updateScreen] Updating screen ${id} with data:`, {
      advertisementIds: req.body.advertisementIds,
      name: req.body.name,
      ipAddress: req.body.ipAddress,
      deviceId: req.body.deviceId,
      orientation: req.body.orientation,
      screenSize: req.body.screenSize
    });
    
    const screenData: UpdateScreenRequest = {
      name: req.body.name,
      // Only pass deviceId/ipAddress when explicitly sent (avoid overwriting on ad/settings-only updates)
      ...(req.body.deviceId !== undefined && { deviceId: req.body.deviceId }),
      ...(req.body.ipAddress !== undefined && { ipAddress: req.body.ipAddress }),
      macAddress: req.body.macAddress,
      location: req.body.location,
      groupId: req.body.groupId,
      subsiteId: req.body.subsiteId,
      sectionId: req.body.sectionId,
      specialDivisionId: req.body.specialDivisionId,
      assignedUserId: req.body.assignedUserId,
      assignedUserIds: req.body.assignedUserIds,
      startDate: req.body.startDate,
      endDate: req.body.endDate,
      startTime: req.body.startTime,
      endTime: req.body.endTime,
      // Explicitly handle advertisementIds - if it's provided (even as empty array), use it
      advertisementIds: req.body.advertisementIds !== undefined ? req.body.advertisementIds : undefined,
      advertisementPlaylist:
        req.body.advertisementPlaylist !== undefined ? req.body.advertisementPlaylist : undefined,
      // Display settings
      orientation: req.body.orientation,
      screenSize: req.body.screenSize,
      screenWidth: req.body.screenWidth,
      screenHeight: req.body.screenHeight
    };

    console.log(`[updateScreen] Screen data prepared:`, {
      advertisementIds: screenData.advertisementIds,
      hasAdvertisementIds: screenData.advertisementIds !== undefined
    });

    const screen = await screenService.updateScreen(parseInt(id), screenData);
    
    console.log(`[updateScreen] Screen updated successfully:`, {
      id: screen.id,
      assignedAds: screen.assignedAds,
      assignedAdvertisementsCount: screen.assignedAdvertisements?.length || 0
    });
    
    // Push new settings to connected player (uses live connection map so we find player even if DB device_id is stale)
    const settingsPayload = {
      orientation: screen.orientation ?? null,
      screenSize: screen.screenSize ?? null,
      screenWidth: screen.screenWidth ?? null,
      screenHeight: screen.screenHeight ?? null,
      startDate: screen.startDate ?? null,
      endDate: screen.endDate ?? null,
      startTime: screen.startTime ?? null,
      endTime: screen.endTime ?? null
    };
    await socketService.emitScreenSettingsToPlayerByScreenId(screen.id, settingsPayload);

    // Always push current layout/schedules to player so it plays with latest regions + assigned ads (e.g. after Save Settings or region change)
    await socketService.emitScreenLayoutToPlayer(screen.id);

    res.json(screen);
  } catch (error: any) {
    res.status(500).json({
      error: error.message || 'Failed to update screen'
    });
  }
};

/**
 * POST /api/screens/:id/apply-to-group
 * Apply this screen's layout (regions, ads, schedules, orientation, size) to all other screens in the same group
 */
export const applyScreenLayoutToGroup = async (req: Request, res: Response) => {
  try {
    const screenId = parseInt(req.params.id, 10);
    if (isNaN(screenId)) {
      return res.status(400).json({ error: 'Invalid screen ID' });
    }
    const result = await screenService.applyScreenLayoutToGroup(screenId);
    res.json(result);
  } catch (error: any) {
    const status = error.message?.includes('no group') ? 400 : 500;
    res.status(status).json({
      error: error.message || 'Failed to apply layout to group'
    });
  }
};

/**
 * GET /api/screens/groups
 * Get all screen groups
 */
export const getScreenGroups = async (req: Request, res: Response) => {
  try {
    const groups = await screenService.getScreenGroups();
    res.json(groups);
  } catch (error: any) {
    res.status(500).json({
      error: error.message || 'Failed to get screen groups'
    });
  }
};

/**
 * POST /api/screens/groups
 * Create a screen group
 */
export const createScreenGroup = async (req: Request, res: Response) => {
  try {
    const { name, description } = req.body;

    if (!name) {
      return res.status(400).json({
        error: 'Group name is required'
      });
    }

    const group = await screenService.createScreenGroup(name, description);
    res.status(201).json(group);
  } catch (error: any) {
    res.status(500).json({
      error: error.message || 'Failed to create screen group'
    });
  }
};

/**
 * PUT /api/screens/groups/:id
 * Update a screen group
 */
export const updateScreenGroup = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { name, description } = req.body;

    if (!name) {
      return res.status(400).json({
        error: 'Group name is required'
      });
    }

    const group = await screenService.updateScreenGroup(parseInt(id), name, description);
    res.json(group);
  } catch (error: any) {
    res.status(500).json({
      error: error.message || 'Failed to update screen group'
    });
  }
};

/**
 * DELETE /api/screens/groups/:id
 * Delete a screen group
 */
export const deleteScreenGroup = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    await screenService.deleteScreenGroup(parseInt(id));
    res.json({ success: true });
  } catch (error: any) {
    res.status(500).json({
      error: error.message || 'Failed to delete screen group'
    });
  }
};

// ========== Screen Regions Controllers ==========

/**
 * GET /api/screens/:id/regions
 * Get regions for a screen
 */
export const getScreenRegions = async (req: Request, res: Response) => {
  try {
    const screenId = parseInt(req.params.id);
    if (isNaN(screenId)) {
      return res.status(400).json({ error: 'Invalid screen ID' });
    }

    const regions = await screenRegionsService.getScreenRegions(screenId);
    res.json({ success: true, regions });
  } catch (error: any) {
    
    res.status(500).json({
      error: error.message || 'Failed to get screen regions'
    });
  }
};

/**
 * POST /api/screens/:id/regions
 * Create a region for a screen
 */
export const createScreenRegion = async (req: Request, res: Response) => {
  try {
    const screenId = parseInt(req.params.id);
    if (isNaN(screenId)) {
      return res.status(400).json({ error: 'Invalid screen ID' });
    }

    const region = await screenRegionsService.createScreenRegion({
      screenId,
      ...req.body
    });

    // Push updated layout to connected player for this screen
    await socketService.emitScreenLayoutToPlayer(screenId);

    res.status(201).json({ success: true, region });
  } catch (error: any) {
    console.error('Error creating screen region:', error);
    res.status(500).json({
      error: error.message || 'Failed to create screen region'
    });
  }
};

/**
 * PUT /api/screens/:id/regions/:regionId
 * Update a screen region
 */
export const updateScreenRegion = async (req: Request, res: Response) => {
  try {
    const regionId = parseInt(req.params.regionId);
    if (isNaN(regionId)) {
      return res.status(400).json({ error: 'Invalid region ID' });
    }

    const region = await screenRegionsService.updateScreenRegion(regionId, req.body);

    // Push updated layout to connected player for this screen
    if (region.screenId) {
      await socketService.emitScreenLayoutToPlayer(region.screenId);
    }

    res.json({ success: true, region });
  } catch (error: any) {
    console.error('Error updating screen region:', error);
    res.status(500).json({
      error: error.message || 'Failed to update screen region'
    });
  }
};

/**
 * DELETE /api/screens/:id/regions/:regionId
 * Delete a screen region
 */
export const deleteScreenRegion = async (req: Request, res: Response) => {
  try {
    const regionId = parseInt(req.params.regionId);
    if (isNaN(regionId)) {
      return res.status(400).json({ error: 'Invalid region ID' });
    }

    // Find screenId before delete so we can refresh layout on player
    // Simple approach: load all regions and find the one we're deleting
    let screenIdForLayout: number | null = null;
    try {
      const result = await screenRegionsService.getScreenRegions(parseInt(req.params.id));
      const regionToDelete = result.find(r => r.id === regionId);
      if (regionToDelete) {
        screenIdForLayout = regionToDelete.screenId;
      }
    } catch {
      // ignore lookup errors; deletion will still proceed
    }

    await screenRegionsService.deleteScreenRegion(regionId);

    if (screenIdForLayout != null) {
      await socketService.emitScreenLayoutToPlayer(screenIdForLayout);
    }

    res.json({ success: true });
  } catch (error: any) {
    console.error('Error deleting screen region:', error);
    res.status(500).json({
      error: error.message || 'Failed to delete screen region'
    });
  }
};

// ========== Advertisement Schedules Controllers ==========

/**
 * GET /api/screens/:id/schedules
 * Get schedules for a screen
 */
export const getScreenSchedules = async (req: Request, res: Response) => {
  try {
    const screenId = parseInt(req.params.id);
    if (isNaN(screenId)) {
      return res.status(400).json({ error: 'Invalid screen ID' });
    }

    const schedules = await advertisementSchedulesService.getScreenSchedules(screenId);

    // Convert startDate/endDate to local YYYY-MM-DD so UI sees the same date it sent,
    // regardless of how timestamps are stored internally.
    const formatted = schedules.map(schedule => ({
      ...schedule,
      startDate: formatLocalDate(schedule.startDate),
      endDate: formatLocalDate(schedule.endDate)
    }));

    res.json({ success: true, schedules: formatted });
  } catch (error: any) {
    console.error('Error getting screen schedules:', error);
    res.status(500).json({
      error: error.message || 'Failed to get screen schedules'
    });
  }
};

/**
 * POST /api/screens/:id/schedules
 * Create or update an advertisement schedule
 */
export const createAdvertisementSchedule = async (req: Request, res: Response) => {
  try {
    const screenId = parseInt(req.params.id);
    if (isNaN(screenId)) {
      return res.status(400).json({ error: 'Invalid screen ID' });
    }

    const { adId } = req.body;
    if (!adId) {
      return res.status(400).json({ error: 'Advertisement ID is required' });
    }

    const schedule = await advertisementSchedulesService.createAdvertisementSchedule({
      screenId,
      ...req.body
    });

    // Push updated schedules/layout to connected player for this screen
    await socketService.emitScreenLayoutToPlayer(screenId);

    res.status(201).json({ success: true, schedule });
  } catch (error: any) {
    res.status(500).json({
      error: error.message || 'Failed to create advertisement schedule'
    });
  }
};

/**
 * PUT /api/screens/:id/schedules/:adId
 * Update an advertisement schedule
 */
export const updateAdvertisementSchedule = async (req: Request, res: Response) => {
  try {
    const screenId = parseInt(req.params.id);
    const adId = parseInt(req.params.adId);
    
    if (isNaN(screenId) || isNaN(adId)) {
      return res.status(400).json({ error: 'Invalid screen ID or advertisement ID' });
    }

    const schedule = await advertisementSchedulesService.updateAdvertisementSchedule(
      screenId,
      adId,
      req.body
    );

    // Push updated schedules/layout to connected player for this screen
    await socketService.emitScreenLayoutToPlayer(screenId);

    res.json({ success: true, schedule });
  } catch (error: any) {
    console.error('Error updating advertisement schedule:', error);
    res.status(500).json({
      error: error.message || 'Failed to update advertisement schedule'
    });
  }
};

/**
 * DELETE /api/screens/:id/schedules/:adId
 * Delete an advertisement schedule
 */
export const deleteAdvertisementSchedule = async (req: Request, res: Response) => {
  try {
    const screenId = parseInt(req.params.id);
    const adId = parseInt(req.params.adId);
    
    if (isNaN(screenId) || isNaN(adId)) {
      return res.status(400).json({ error: 'Invalid screen ID or advertisement ID' });
    }

    await advertisementSchedulesService.deleteAdvertisementSchedule(screenId, adId);

    // Push updated schedules/layout to connected player for this screen
    await socketService.emitScreenLayoutToPlayer(screenId);

    res.json({ success: true });
  } catch (error: any) {
    console.error('Error deleting advertisement schedule:', error);
    res.status(500).json({
      error: error.message || 'Failed to delete advertisement schedule'
    });
  }
};

