import { DiscoveredDevice, Screen, ScreenGroup, CreateScreenRequest, UpdateScreenRequest } from '../types/device.types';
import { Advertisement } from '../types/advertisement.types';
import { normalizeFileUrl } from './advertisements.service';
import * as advertisementSchedulesService from './advertisement-schedules.service';
import * as screenRegionsService from './screen-regions.service';
import { pool } from '../config/database';
import { ensureUtf8FileName } from '../utils/encoding.util';
import { logEvent } from '../utils/logger.util';

/**
 * Get discovered devices from database
 */
export async function getDiscoveredDevices(): Promise<DiscoveredDevice[]> {
  try {
    const result = await pool.query(`
      SELECT 
        d.id,
        d.name,
        d.ip_address as "ipAddress",
        d.mac_address as "macAddress",
        d.device_type as "deviceType",
        d.status,
        d.last_seen as "lastSeen",
        CASE WHEN s.id IS NOT NULL THEN TRUE ELSE FALSE END as "isRegistered"
      FROM discovered_devices d
      LEFT JOIN screens s ON d.id = s.device_id
      ORDER BY d.last_seen DESC
    `);

    return result.rows.map(row => ({
      id: row.id,
      name: row.name,
      ipAddress: row.ipAddress,
      macAddress: row.macAddress,
      deviceType: row.deviceType,
      status: row.status,
      lastSeen: new Date(row.lastSeen),
      isRegistered: row.isRegistered
    }));
  } catch (error) {
    console.error('Error fetching discovered devices:', error);
    return [];
  }
}

/**
 * Save or update discovered device in database
 */
export async function saveDiscoveredDevice(device: DiscoveredDevice): Promise<void> {
  try {
    await pool.query(`
      INSERT INTO discovered_devices (
        id, name, ip_address, mac_address, device_type, status, last_seen, is_registered
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      ON CONFLICT (id) DO UPDATE SET
        name = EXCLUDED.name,
        ip_address = EXCLUDED.ip_address,
        mac_address = EXCLUDED.mac_address,
        device_type = EXCLUDED.device_type,
        status = EXCLUDED.status,
        last_seen = EXCLUDED.last_seen,
        updated_at = CURRENT_TIMESTAMP
    `, [
      device.id,
      device.name,
      device.ipAddress,
      device.macAddress,
      device.deviceType,
      device.status,
      device.lastSeen,
      device.isRegistered || false
    ]);
  } catch (error) {
    console.error('Error saving discovered device:', error);
    throw error;
  }
}

/**
 * Register a device as a screen
 */
export async function registerScreen(
  deviceId: string,
  name: string,
  location: string
): Promise<Screen> {
  try {
    // Find device in discovered devices
    const deviceResult = await pool.query(
      'SELECT * FROM discovered_devices WHERE id = $1',
      [deviceId]
    );

    if (deviceResult.rows.length === 0) {
      throw new Error('Device not found');
    }

    const device = deviceResult.rows[0];

    // Check if screen already exists
    const existingScreen = await pool.query(
      'SELECT * FROM screens WHERE device_id = $1',
      [deviceId]
    );

    let screen: Screen;

    if (existingScreen.rows.length > 0) {
      // Update existing screen
      const result = await pool.query(`
        UPDATE screens SET
          name = $1,
          location = $2,
          status = 'online',
          last_connected = CURRENT_TIMESTAMP,
          updated_at = CURRENT_TIMESTAMP
        WHERE device_id = $3
        RETURNING *
      `, [name || device.name, location, deviceId]);

      screen = mapRowToScreen(result.rows[0]);
    } else {
      // Create new screen
      const result = await pool.query(`
        INSERT INTO screens (
          device_id, name, ip_address, mac_address, location, status, last_connected
        ) VALUES ($1, $2, $3, $4, $5, 'online', CURRENT_TIMESTAMP)
        RETURNING *
      `, [
        deviceId,
        name || device.name,
        device.ip_address,
        device.mac_address,
        location
      ]);

      screen = mapRowToScreen(result.rows[0]);

      // Create default full-screen region (1x1) for the new screen
      try {
        const { createDefaultScreenRegion } = await import('./screen-regions.service');
        await createDefaultScreenRegion(screen.id);
      } catch (error) {
        console.error('Error creating default screen region:', error);
        // Don't fail screen registration if default region creation fails
      }
    }

    // Mark device as registered
    await pool.query(
      'UPDATE discovered_devices SET is_registered = TRUE, updated_at = CURRENT_TIMESTAMP WHERE id = $1',
      [deviceId]
    );

    // Log screen registration
    await logEvent(
      'success',
      'screens',
      'register',
      `Screen "${screen.name}" was registered from discovered device`,
      {
        screenId: screen.id,
        screenName: screen.name,
        deviceId,
        ipAddress: screen.ipAddress,
        macAddress: screen.macAddress,
        location
      }
    );

    return screen;
  } catch (error) {
    console.error('Error registering screen:', error);
    throw error;
  }
}

/**
 * Map database row to Screen object
 */
function mapRowToScreen(row: any): Screen {
  // Handle both camelCase (from SQL alias) and snake_case (fallback)
  const assignedAds = row.assignedAds || row.assigned_ads || [];
  
  return {
    id: row.id,
    deviceId: row.deviceId ?? row.device_id ?? null,
    name: row.name,
    ipAddress: row.ipAddress ?? row.ip_address ?? null,
    macAddress: row.macAddress ?? row.mac_address ?? null,
    location: row.location ?? null,
    status: row.status,
    lastConnected: row.lastConnected ? new Date(row.lastConnected) : (row.last_connected ? new Date(row.last_connected) : new Date()),
    assignedAds: Array.isArray(assignedAds) ? assignedAds : [],
    // Group
    groupId: row.group_id ?? null,
    groupName: row.group_name ?? null,
    // Location assignment
    subsiteId: row.subsite_id ?? null,
    sectionId: row.section_id ?? null,
    specialDivisionId: row.special_division_id ?? null,
    subsiteName: row.subsite_name ?? null,
    sectionName: row.section_name ?? null,
    specialDivisionName: row.special_division_name ?? null,
    // User assignment
    assignedUserId: row.assigned_user_id ?? null,
    assignedUserIds: row.assigned_user_ids ? JSON.parse(row.assigned_user_ids) : (row.assigned_user_id ? [row.assigned_user_id] : null),
    assignedUserName: row.assigned_user_name ?? null,
    // Date and time
    startDate: row.start_date ? new Date(row.start_date) : null,
    endDate: row.end_date ? new Date(row.end_date) : null,
    startTime: row.start_time ?? null,
    endTime: row.end_time ?? null,
    // Display settings
    orientation: row.orientation ?? null,
    screenSize: row.screen_size ?? null,
    screenWidth: row.screen_width ?? null,
    screenHeight: row.screen_height ?? null
  };
}

/**
 * Get all registered screens
 */
export async function getScreens(): Promise<Screen[]> {
  try {
    const result = await pool.query(`
      SELECT 
        s.id,
        s.device_id as "deviceId",
        s.name,
        s.ip_address as "ipAddress",
        s.mac_address as "macAddress",
        s.location,
        s.status,
        s.last_connected as "lastConnected",
        s.current_video_url as "currentVideoUrl",
        s.current_video_title as "currentVideoTitle",
        s.video_started_at as "videoStartedAt",
        -- Display settings so socket/player gets same config as REST API
        s.orientation as "orientation",
        s.screen_size as "screenSize",
        s.screen_width as "screenWidth",
        s.screen_height as "screenHeight",
        s.group_id as "group_id",
        sg.name as "group_name",
        s.subsite_id as "subsite_id",
        s.section_id as "section_id",
        s.special_division_id as "special_division_id",
        sub.name as "subsite_name",
        sec.name as "section_name",
        sd.name as "special_division_name",
        s.assigned_user_id as "assigned_user_id",
        u.username as "assigned_user_name",
        s.start_date as "start_date",
        s.end_date as "end_date",
        s.start_time as "start_time",
        s.end_time as "end_time",
        COALESCE(
          ARRAY_AGG(sa.ad_id ORDER BY sa.sort_order ASC, sa.id ASC) FILTER (WHERE sa.ad_id IS NOT NULL),
          ARRAY[]::INTEGER[]
        ) as "assignedAds"
      FROM screens s
      LEFT JOIN screen_ads sa ON s.id = sa.screen_id
      LEFT JOIN screen_groups sg ON s.group_id = sg.id
      LEFT JOIN subsites sub ON s.subsite_id = sub.id
      LEFT JOIN sections sec ON s.section_id = sec.id
      LEFT JOIN special_divisions sd ON s.special_division_id = sd.id
      LEFT JOIN users u ON s.assigned_user_id = u.id
      GROUP BY s.id, sg.name, sub.name, sec.name, sd.name, u.username
      ORDER BY s.created_at DESC
    `);

    return result.rows.map(row => mapRowToScreen(row));
  } catch (error) {
    console.error('Error fetching screens:', error);
    return [];
  }
}

/**
 * Get screen status
 */
export async function getScreenStatus(screenId: number): Promise<{ status: string; isOnline: boolean }> {
  try {
    const result = await pool.query(
      'SELECT status FROM screens WHERE id = $1',
      [screenId]
    );

    if (result.rows.length === 0) {
      throw new Error('Screen not found');
    }

    const status = result.rows[0].status;

    return {
      status: status,
      isOnline: status === 'online' || status === 'playing'
    };
  } catch (error) {
    console.error('Error fetching screen status:', error);
    throw error;
  }
}

/**
 * Delete a screen
 */
export async function deleteScreen(screenId: number): Promise<void> {
  try {
    // Get screen info before deleting
    const screenResult = await pool.query(
      'SELECT device_id FROM screens WHERE id = $1',
      [screenId]
    );

    if (screenResult.rows.length === 0) {
      throw new Error('Screen not found');
    }

    const deviceId = screenResult.rows[0].device_id;

    // Delete screen (cascade will delete screen_ads)
    await pool.query('DELETE FROM screens WHERE id = $1', [screenId]);

    // Mark device as unregistered
    await pool.query(
      'UPDATE discovered_devices SET is_registered = FALSE, updated_at = CURRENT_TIMESTAMP WHERE id = $1',
      [deviceId]
    );
  } catch (error) {
    console.error('Error deleting screen:', error);
    throw error;
  }
}

/**
 * Clear all advertisement assignments for a screen (used by reset)
 */
export async function clearScreenAds(screenId: number): Promise<void> {
  await pool.query('DELETE FROM screen_ads WHERE screen_id = $1', [screenId]);
}

/**
 * Create a screen manually (without device discovery)
 */
export async function createScreen(
  data: CreateScreenRequest,
  createdBy?: number
): Promise<Screen> {
  try {
    // Combine date and time if provided
    let startDateTime: Date | null = null;
    let endDateTime: Date | null = null;

    if (data.startDate && data.startTime) {
      const [hours, minutes] = data.startTime.split(':');
      startDateTime = new Date(data.startDate);
      startDateTime.setHours(parseInt(hours), parseInt(minutes), 0, 0);
    } else if (data.startDate) {
      startDateTime = new Date(data.startDate);
    }

    if (data.endDate && data.endTime) {
      const [hours, minutes] = data.endTime.split(':');
      endDateTime = new Date(data.endDate);
      endDateTime.setHours(parseInt(hours), parseInt(minutes), 0, 0);
    } else if (data.endDate) {
      endDateTime = new Date(data.endDate);
    }

    // If IP address is provided but deviceId is not, use IP as deviceId
    const deviceIdToUse = data.deviceId || data.ipAddress || null;
    
    const result = await pool.query(`
      INSERT INTO screens (
        device_id, name, ip_address, mac_address, location,
        group_id, subsite_id, section_id, special_division_id, assigned_user_id,
        start_date, end_date, start_time, end_time,
        status, last_connected
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, 'offline', CURRENT_TIMESTAMP)
      RETURNING *
    `, [
      deviceIdToUse,
      data.name,
      data.ipAddress || null,
      data.macAddress || null,
      data.location || null,
      data.groupId || null,
      data.subsiteId || null,
      data.sectionId || null,
      data.specialDivisionId || null,
      (data.assignedUserIds && data.assignedUserIds.length > 0) 
        ? data.assignedUserIds[0] 
        : (data.assignedUserId || null),
      startDateTime,
      endDateTime,
      data.startTime || null,
      data.endTime || null
    ]);

    const screen = mapRowToScreen(result.rows[0]);

    // Create default full-screen region (1x1) for the new screen
    try {
      const { createDefaultScreenRegion } = await import('./screen-regions.service');
      await createDefaultScreenRegion(screen.id);
    } catch (error) {
      console.error('Error creating default screen region:', error);
      // Don't fail screen creation if default region creation fails
    }

    // Assign advertisements if provided (ordered; default 5s slide duration)
    if (data.advertisementIds && data.advertisementIds.length > 0) {
      let sortOrder = 0;
      for (const adId of data.advertisementIds) {
        await pool.query(
          `
          INSERT INTO screen_ads (screen_id, ad_id, sort_order, slide_duration_seconds)
          VALUES ($1, $2, $3, $4)
        `,
          [screen.id, adId, sortOrder++, 5]
        );
      }
    }

    // Send notifications to all assigned users
    const userIdsToNotify = (data.assignedUserIds && data.assignedUserIds.length > 0) 
      ? data.assignedUserIds 
      : (data.assignedUserId ? [data.assignedUserId] : []);
    
    for (const userId of userIdsToNotify) {
      if (userId) {
        await sendScreenAssignmentNotification(screen.id, userId);
      }
    }

    return await getScreenById(screen.id);
  } catch (error) {
    console.error('Error creating screen:', error);
    throw error;
  }
}

/**
 * Update a screen
 */
export async function updateScreen(
  screenId: number,
  data: UpdateScreenRequest
): Promise<Screen> {
  try {
    // Combine date and time if provided
    let startDateTime: Date | null = null;
    let endDateTime: Date | null = null;

    if (data.startDate && data.startTime) {
      const [hours, minutes] = data.startTime.split(':');
      startDateTime = new Date(data.startDate);
      startDateTime.setHours(parseInt(hours), parseInt(minutes), 0, 0);
    } else if (data.startDate) {
      startDateTime = new Date(data.startDate);
    }

    if (data.endDate && data.endTime) {
      const [hours, minutes] = data.endTime.split(':');
      endDateTime = new Date(data.endDate);
      endDateTime.setHours(parseInt(hours), parseInt(minutes), 0, 0);
    } else if (data.endDate) {
      endDateTime = new Date(data.endDate);
    }

    const updateFields: string[] = [];
    const updateValues: any[] = [];
    let paramIndex = 1;

    if (data.name !== undefined) {
      updateFields.push(`name = $${paramIndex++}`);
      updateValues.push(data.name);
    }
    // Handle deviceId and ipAddress: only update when a non-empty string is provided.
    // Never overwrite with null/empty when doing ad/settings updates (keeps connected device intact).
    const hasValidIp = typeof data.ipAddress === 'string' && data.ipAddress.trim() !== '';
    const hasValidDeviceId = typeof data.deviceId === 'string' && data.deviceId.trim() !== '';
    if (hasValidIp) {
      updateFields.push(`ip_address = $${paramIndex++}`);
      updateValues.push(data.ipAddress!.trim());
      if (hasValidDeviceId) {
        updateFields.push(`device_id = $${paramIndex++}`);
        updateValues.push(data.deviceId!.trim());
      } else {
        updateFields.push(`device_id = $${paramIndex++}`);
        updateValues.push(data.ipAddress!.trim());
      }
    } else if (hasValidDeviceId) {
      updateFields.push(`device_id = $${paramIndex++}`);
      updateValues.push(data.deviceId!.trim());
    }
    if (data.macAddress !== undefined) {
      updateFields.push(`mac_address = $${paramIndex++}`);
      updateValues.push(data.macAddress);
    }
    if (data.location !== undefined) {
      updateFields.push(`location = $${paramIndex++}`);
      updateValues.push(data.location);
    }
    if (data.groupId !== undefined) {
      updateFields.push(`group_id = $${paramIndex++}`);
      updateValues.push(data.groupId);
    }
    if (data.subsiteId !== undefined) {
      updateFields.push(`subsite_id = $${paramIndex++}`);
      updateValues.push(data.subsiteId);
    }
    if (data.sectionId !== undefined) {
      updateFields.push(`section_id = $${paramIndex++}`);
      updateValues.push(data.sectionId);
    }
    if (data.specialDivisionId !== undefined) {
      updateFields.push(`special_division_id = $${paramIndex++}`);
      updateValues.push(data.specialDivisionId);
    }
    if (data.assignedUserIds !== undefined && data.assignedUserIds && data.assignedUserIds.length > 0) {
      updateFields.push(`assigned_user_id = $${paramIndex++}`);
      updateValues.push(data.assignedUserIds[0]); // Store first user ID for backward compatibility
    } else if (data.assignedUserId !== undefined) {
      updateFields.push(`assigned_user_id = $${paramIndex++}`);
      updateValues.push(data.assignedUserId);
    }
    if (startDateTime !== null) {
      updateFields.push(`start_date = $${paramIndex++}`);
      updateValues.push(startDateTime);
    }
    if (endDateTime !== null) {
      updateFields.push(`end_date = $${paramIndex++}`);
      updateValues.push(endDateTime);
    }
    if (data.startTime !== undefined) {
      updateFields.push(`start_time = $${paramIndex++}`);
      updateValues.push(data.startTime);
    }
    if (data.endTime !== undefined) {
      updateFields.push(`end_time = $${paramIndex++}`);
      updateValues.push(data.endTime);
    }
    // Display settings - allow null values to be set
    if (data.orientation !== undefined) {
      updateFields.push(`orientation = $${paramIndex++}`);
      updateValues.push(data.orientation);
    }
    if (data.screenSize !== undefined) {
      updateFields.push(`screen_size = $${paramIndex++}`);
      updateValues.push(data.screenSize);
    }
    if (data.screenWidth !== undefined) {
      updateFields.push(`screen_width = $${paramIndex++}`);
      updateValues.push(data.screenWidth);
    }
    if (data.screenHeight !== undefined) {
      updateFields.push(`screen_height = $${paramIndex++}`);
      updateValues.push(data.screenHeight);
    }

    updateFields.push(`updated_at = CURRENT_TIMESTAMP`);
    updateValues.push(screenId);

    if (updateFields.length === 1) {
      // Only updated_at, no other fields to update
      return await getScreenById(screenId);
    }

    const query = `
      UPDATE screens 
      SET ${updateFields.join(', ')}
      WHERE id = $${paramIndex}
      RETURNING *
    `;

    console.log(`[updateScreen] Update query:`, query);
    console.log(`[updateScreen] Update values:`, updateValues);
    console.log(`[updateScreen] Update fields:`, updateFields);

    let result;
    try {
      result = await pool.query(query, updateValues);
      console.log(`[updateScreen] Query executed successfully. Rows updated:`, result.rows.length);
    } catch (error: any) {
      // Handle foreign key constraint error for device_id
      if (error.code === '23503' && error.constraint === 'screens_device_id_fkey') {
        console.log('⚠️ Foreign key constraint detected. Attempting to drop constraint...');
        try {
          // Try to drop the constraint
          await pool.query(`
            ALTER TABLE screens DROP CONSTRAINT IF EXISTS screens_device_id_fkey
          `);
          console.log('✅ Successfully dropped screens_device_id_fkey constraint');
          // Retry the update
          result = await pool.query(query, updateValues);
        } catch (dropError: any) {
          console.error('❌ Failed to drop constraint:', dropError.message);
          throw new Error(
            'Cannot update device_id: Foreign key constraint exists. ' +
            'Please run migration script: node scripts/drop-device-id-fk.js'
          );
        }
      } else {
        throw error;
      }
    }

    if (result.rows.length === 0) {
      throw new Error('Screen not found');
    }

    // Update advertisements if provided (ordered playlist + per-slide duration, or legacy advertisementIds)
    const playlistFromRequest =
      data.advertisementPlaylist !== undefined
        ? data.advertisementPlaylist
        : data.advertisementIds !== undefined
          ? data.advertisementIds.map((adId) => ({ adId, durationSeconds: 5 }))
          : undefined;

    if (playlistFromRequest !== undefined) {
      const newAdIds = playlistFromRequest.map((p) => p.adId);
      console.log(`Updating advertisements for screen ${screenId}:`, newAdIds);

      const currentAdsResult = await pool.query<{ ad_id: number }>(
        'SELECT ad_id FROM screen_ads WHERE screen_id = $1',
        [screenId]
      );
      const currentAdIds = currentAdsResult.rows.map((r) => r.ad_id);
      const removedAdIds = currentAdIds.filter((id) => !newAdIds.includes(id));
      for (const adId of removedAdIds) {
        try {
          await advertisementSchedulesService.deleteAdvertisementSchedule(screenId, adId);
          console.log(`[updateScreen] Reset unselected ad ${adId}: deleted schedule for screen ${screenId}`);
        } catch (e) {
          console.warn(`[updateScreen] Could not delete schedule for ad ${adId}:`, e);
        }
      }

      const deleteResult = await pool.query('DELETE FROM screen_ads WHERE screen_id = $1', [screenId]);
      console.log(`Deleted ${deleteResult.rowCount} existing advertisement assignments`);

      if (playlistFromRequest.length > 0) {
        const adIdsCheck = await pool.query<{ id: number }>(
          `SELECT id FROM advertisements WHERE id = ANY($1::INTEGER[])`,
          [newAdIds]
        );
        const validSet = new Set(adIdsCheck.rows.map((r) => r.id));

        let sortOrder = 0;
        for (const item of playlistFromRequest) {
          if (!validSet.has(item.adId)) {
            console.warn(`[updateScreen] Skip unknown advertisement id ${item.adId}`);
            continue;
          }
          const dur = Math.min(600, Math.max(1, Math.round(Number(item.durationSeconds ?? 5))));
          await pool.query(
            `
            INSERT INTO screen_ads (screen_id, ad_id, sort_order, slide_duration_seconds)
            VALUES ($1, $2, $3, $4)
          `,
            [screenId, item.adId, sortOrder++, dur]
          );
        }

        const verifyResult = await pool.query(`SELECT ad_id FROM screen_ads WHERE screen_id = $1 ORDER BY sort_order`, [
          screenId
        ]);
        console.log(
          `Verified: Screen ${screenId} now has ${verifyResult.rows.length} advertisement assignments:`,
          verifyResult.rows.map((r) => r.ad_id)
        );
      } else {
        console.log(`No advertisements to assign - all assignments cleared`);
      }
    }

    // Send notifications to all assigned users
    const userIdsToNotify = (data.assignedUserIds && data.assignedUserIds.length > 0) 
      ? data.assignedUserIds 
      : (data.assignedUserId !== undefined && data.assignedUserId !== null ? [data.assignedUserId] : []);
    
    for (const userId of userIdsToNotify) {
      if (userId) {
        await sendScreenAssignmentNotification(screenId, userId);
      }
    }

    return await getScreenById(screenId);
  } catch (error) {
    console.error('Error updating screen:', error);
    throw error;
  }
}

/**
 * Get screen by ID with full advertisement details
 */
export async function getScreenById(screenId: number): Promise<Screen> {
  try {
    // First get the screen basic data
    const screenResult = await pool.query(`
      SELECT 
        s.id,
        s.device_id as "deviceId",
        s.name,
        s.ip_address as "ipAddress",
        s.mac_address as "macAddress",
        s.location,
        s.status,
        s.last_connected as "lastConnected",
        s.group_id as "group_id",
        sg.name as "group_name",
        s.subsite_id as "subsite_id",
        s.section_id as "section_id",
        s.special_division_id as "special_division_id",
        sub.name as "subsite_name",
        sec.name as "section_name",
        sd.name as "special_division_name",
        s.assigned_user_id as "assigned_user_id",
        u.username as "assigned_user_name",
        s.start_date as "start_date",
        s.end_date as "end_date",
        s.start_time as "start_time",
        s.end_time as "end_time",
        s.orientation,
        s.screen_size,
        s.screen_width,
        s.screen_height,
        COALESCE(
          ARRAY_AGG(sa.ad_id ORDER BY sa.sort_order ASC, sa.id ASC) FILTER (WHERE sa.ad_id IS NOT NULL),
          ARRAY[]::INTEGER[]
        ) as "assignedAds"
      FROM screens s
      LEFT JOIN screen_ads sa ON s.id = sa.screen_id
      LEFT JOIN screen_groups sg ON s.group_id = sg.id
      LEFT JOIN subsites sub ON s.subsite_id = sub.id
      LEFT JOIN sections sec ON s.section_id = sec.id
      LEFT JOIN special_divisions sd ON s.special_division_id = sd.id
      LEFT JOIN users u ON s.assigned_user_id = u.id
      WHERE s.id = $1
      GROUP BY 
        s.id, s.device_id, s.name, s.ip_address, s.mac_address, s.location, s.status, s.last_connected,
        s.group_id, sg.name, s.subsite_id, s.section_id, s.special_division_id,
        sub.name, sec.name, sd.name,
        s.assigned_user_id, u.username,
        s.start_date, s.end_date, s.start_time, s.end_time,
        s.orientation, s.screen_size, s.screen_width, s.screen_height
    `, [screenId]);

    if (screenResult.rows.length === 0) {
      throw new Error('Screen not found');
    }

    const row = screenResult.rows[0];
    console.log(`getScreenById - Raw row data for screen ${screenId}:`, {
      deviceId: row.deviceId,
      device_id: row.device_id,
      ipAddress: row.ipAddress,
      ip_address: row.ip_address,
      assignedAds: row.assignedAds,
      assigned_ads: row.assigned_ads,
      hasAssignedAds: !!row.assignedAds,
      assignedAdsType: typeof row.assignedAds,
      assignedAdsLength: Array.isArray(row.assignedAds) ? row.assignedAds.length : 'not an array',
      allKeys: Object.keys(row).filter(k => k.toLowerCase().includes('assigned') || k.toLowerCase().includes('ad') || k.toLowerCase().includes('ip') || k.toLowerCase().includes('device'))
    });
    
    const screen = mapRowToScreen(row);
    console.log(`getScreenById - Screen ${screenId} after mapping:`, {
      deviceId: screen.deviceId,
      ipAddress: screen.ipAddress,
      assignedAds: screen.assignedAds
    });

    // Fetch full advertisement details in playlist order (screen_ads.sort_order)
    if (screen.assignedAds && screen.assignedAds.length > 0) {
      const orderResult = await pool.query<{
        adId: number;
        slideDurationSeconds: number;
      }>(
        `
        SELECT sa.ad_id AS "adId", sa.slide_duration_seconds AS "slideDurationSeconds"
        FROM screen_ads sa
        WHERE sa.screen_id = $1
        ORDER BY sa.sort_order ASC, sa.id ASC
      `,
        [screenId]
      );
      const ordered = orderResult.rows;
      const adIds = ordered.map((r) => r.adId);
      console.log(`getScreenById - Fetching full details for advertisement IDs (ordered):`, adIds);

      const adsResult = await pool.query(
        `
        SELECT 
          a.id,
          a.title,
          a.description,
          a.type,
          a.file_url as "fileUrl",
          a.file_name as "fileName",
          a.file_size as "fileSize",
          a.mime_type as "mimeType",
          a.thumbnail_url as "thumbnailUrl",
          a.status,
          a.created_by as "createdBy",
          a.created_at as "createdAt",
          a.updated_at as "updatedAt"
        FROM advertisements a
        WHERE a.id = ANY($1::INTEGER[])
      `,
        [adIds]
      );

      const byId = new Map(
        adsResult.rows.map((row: any) => [
          row.id,
          row
        ])
      );

      console.log(`getScreenById - Found ${adsResult.rows.length} advertisements`);

      const list: Advertisement[] = [];
      for (const o of ordered) {
        const row = byId.get(o.adId);
        if (!row) continue;
        list.push({
          id: row.id,
          title: row.title,
          description: row.description ?? null,
          type: row.type,
          fileUrl: normalizeFileUrl(row.fileUrl) || row.fileUrl,
          fileName: ensureUtf8FileName(row.fileName),
          fileSize: row.fileSize,
          mimeType: row.mimeType,
          thumbnailUrl: row.thumbnailUrl ?? null,
          status: row.status,
          createdBy: row.createdBy ?? null,
          createdAt: new Date(row.createdAt),
          updatedAt: new Date(row.updatedAt),
          slideDurationSeconds: Math.min(600, Math.max(1, Number(o.slideDurationSeconds) || 5))
        });
      }
      screen.assignedAdvertisements = list;
    } else {
      screen.assignedAdvertisements = [];
      console.log(`getScreenById - No assigned advertisements for screen ${screenId}`);
    }

    return screen;
  } catch (error) {
    console.error('Error fetching screen:', error);
    throw error;
  }
}

/**
 * Get all screen groups
 */
export async function getScreenGroups(): Promise<ScreenGroup[]> {
  try {
    const result = await pool.query(`
      SELECT 
        id,
        name,
        description,
        created_at as "createdAt",
        updated_at as "updatedAt"
      FROM screen_groups
      ORDER BY created_at DESC
    `);

    return result.rows.map(row => ({
      id: row.id,
      name: row.name,
      description: row.description,
      createdAt: new Date(row.createdAt),
      updatedAt: new Date(row.updatedAt)
    }));
  } catch (error) {
    console.error('Error fetching screen groups:', error);
    return [];
  }
}

/**
 * Create a screen group
 */
export async function createScreenGroup(
  name: string,
  description?: string
): Promise<ScreenGroup> {
  try {
    const result = await pool.query(`
      INSERT INTO screen_groups (name, description)
      VALUES ($1, $2)
      RETURNING *
    `, [name, description || null]);

    const group = {
      id: result.rows[0].id,
      name: result.rows[0].name,
      description: result.rows[0].description,
      createdAt: new Date(result.rows[0].created_at),
      updatedAt: new Date(result.rows[0].updated_at)
    };

    // Log screen group creation
    await logEvent(
      'success',
      'screen_groups',
      'create',
      `Screen group "${name}" was created`,
      {
        groupId: group.id,
        groupName: name,
        description
      }
    );

    return group;
  } catch (error) {
    console.error('Error creating screen group:', error);
    throw error;
  }
}

/**
 * Update a screen group
 */
export async function updateScreenGroup(
  groupId: number,
  name: string,
  description?: string
): Promise<ScreenGroup> {
  try {
    const result = await pool.query(`
      UPDATE screen_groups
      SET name = $1, description = $2, updated_at = CURRENT_TIMESTAMP
      WHERE id = $3
      RETURNING *
    `, [name, description || null, groupId]);

    if (result.rows.length === 0) {
      throw new Error('Screen group not found');
    }

    const group = {
      id: result.rows[0].id,
      name: result.rows[0].name,
      description: result.rows[0].description,
      createdAt: new Date(result.rows[0].created_at),
      updatedAt: new Date(result.rows[0].updated_at)
    };

    // Log screen group update
    await logEvent(
      'info',
      'screen_groups',
      'update',
      `Screen group "${name}" (ID: ${groupId}) was updated`,
      {
        groupId,
        groupName: name,
        description
      }
    );

    return group;
  } catch (error) {
    console.error('Error updating screen group:', error);
    throw error;
  }
}

/**
 * Delete a screen group
 */
export async function deleteScreenGroup(groupId: number): Promise<void> {
  try {
    // Get group info before deleting
    const groupResult = await pool.query(
      'SELECT name FROM screen_groups WHERE id = $1',
      [groupId]
    );

    if (groupResult.rows.length === 0) {
      throw new Error('Screen group not found');
    }

    const groupName = groupResult.rows[0].name;

    // Remove group_id from screens in this group
    await pool.query(`
      UPDATE screens
      SET group_id = NULL, updated_at = CURRENT_TIMESTAMP
      WHERE group_id = $1
    `, [groupId]);

    // Delete the group
    await pool.query('DELETE FROM screen_groups WHERE id = $1', [groupId]);

    // Log screen group deletion
    await logEvent(
      'warning',
      'screen_groups',
      'delete',
      `Screen group "${groupName}" (ID: ${groupId}) was deleted`,
      {
        groupId,
        groupName
      }
    );
  } catch (error) {
    console.error('Error deleting screen group:', error);
    throw error;
  }
}

/**
 * Send notification when user is assigned to screen
 */
async function sendScreenAssignmentNotification(
  screenId: number,
  userId: number
): Promise<void> {
  try {
    const screen = await getScreenById(screenId);
    
    // Import notification service
    const { createNotification } = await import('./notifications.service');
    
    // Create notification specifically for the assigned user
    await createNotification({
      title: 'Screen Assignment',
      message: `You have been assigned to screen "${screen.name}". ${screen.subsiteName ? `Location: ${screen.subsiteName}${screen.sectionName ? ` / ${screen.sectionName}` : ''}${screen.specialDivisionName ? ` / ${screen.specialDivisionName}` : ''}` : ''}`,
      type: 'info',
      category: 'system',
      priority: 'medium',
      status: 'sent', // Mark as sent immediately for system notifications
      sendToAll: false,
      subsiteId: screen.subsiteId || undefined,
      sectionId: screen.sectionId || undefined,
      specialDivisionId: screen.specialDivisionId || undefined
    }, [userId]); // Pass the specific user ID so only this user sees the notification
  } catch (error) {
    console.error('Error sending screen assignment notification:', error);
    // Don't throw - notification failure shouldn't break screen creation
  }
}

/**
 * Apply the layout (regions, ads, schedules, orientation, screen size) from a source screen
 * to all other screens in the same group.
 * API: POST /api/screens/:id/apply-to-group
 */
export async function applyScreenLayoutToGroup(sourceScreenId: number): Promise<{ success: boolean; message: string; screenCount: number }> {
  const sourceScreen = await getScreenById(sourceScreenId);
  const groupId = sourceScreen.groupId ?? (sourceScreen as any).group_id;
  if (groupId == null) {
    throw new Error('Screen has no group assigned');
  }

  const targetRows = await pool.query<{ id: number; name: string }>(
    'SELECT id, name FROM screens WHERE group_id = $1 AND id != $2',
    [groupId, sourceScreenId]
  );
  const targetScreens = targetRows.rows;
  if (targetScreens.length === 0) {
    return { success: true, message: 'No other screens in this group to apply to.', screenCount: 0 };
  }

  const sourceRegions = await screenRegionsService.getScreenRegions(sourceScreenId);
  const sourcePlaylist =
    sourceScreen.assignedAdvertisements && sourceScreen.assignedAdvertisements.length > 0
      ? sourceScreen.assignedAdvertisements.map((ad: any) => ({
          adId: ad.id as number,
          durationSeconds: ad.slideDurationSeconds ?? 5
        }))
      : (sourceScreen.assignedAds || []).map((adId: number) => ({ adId, durationSeconds: 5 }));
  const sourceSchedules = await advertisementSchedulesService.getScreenSchedules(sourceScreenId);
  const sourceOrientation = sourceScreen.orientation ?? undefined;
  const sourceScreenSize = sourceScreen.screenSize ?? undefined;

  // Sort source regions by id so we can map by index
  sourceRegions.sort((a, b) => a.id - b.id);

  for (const target of targetScreens) {
    const targetScreenId = target.id;

    await advertisementSchedulesService.deleteScreenSchedules(targetScreenId);
    await pool.query('DELETE FROM screen_ads WHERE screen_id = $1', [targetScreenId]);
    await screenRegionsService.deleteScreenRegions(targetScreenId);

    const regionIdMap = new Map<number, number>();
    for (const sr of sourceRegions) {
      const created = await screenRegionsService.createScreenRegion({
        screenId: targetScreenId,
        regionType: sr.regionType as any,
        regionPosition: sr.regionPosition as any,
        widthPercentage: sr.widthPercentage,
        heightPercentage: sr.heightPercentage,
        xPosition: sr.xPosition,
        yPosition: sr.yPosition
      });
      regionIdMap.set(sr.id, created.id);
    }

    await updateScreen(targetScreenId, {
      orientation: sourceOrientation,
      screenSize: sourceScreenSize,
      advertisementPlaylist: sourcePlaylist
    });

    for (const s of sourceSchedules) {
      await advertisementSchedulesService.createAdvertisementSchedule({
        screenId: targetScreenId,
        adId: s.adId,
        regionId: s.regionId != null ? (regionIdMap.get(s.regionId) ?? null) : null,
        startDate: s.startDate != null ? (typeof s.startDate === 'string' ? s.startDate : (s.startDate as Date).toISOString().split('T')[0]) : null,
        endDate: s.endDate != null ? (typeof s.endDate === 'string' ? s.endDate : (s.endDate as Date).toISOString().split('T')[0]) : null,
        startTime: s.startTime ?? null,
        endTime: s.endTime ?? null,
        isActive: s.isActive,
        priority: s.priority
      });
    }

    const socketService = await import('./socket.service');
    await socketService.emitScreenLayoutToPlayer(targetScreenId);
  }

  return {
    success: true,
    message: `Layout applied to ${targetScreens.length} screen(s) in the group.`,
    screenCount: targetScreens.length
  };
}

