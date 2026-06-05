import { pool } from '../config/database';
import * as advertisementsService from './advertisements.service';

export interface AdvertisementSchedule {
  id: number;
  screenId: number;
  adId: number;
  regionId: number | null;
  startDate: Date | null;
  endDate: Date | null;
  startTime: string | null;
  endTime: string | null;
  isActive: boolean;
  priority: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateAdvertisementScheduleRequest {
  screenId: number;
  adId: number;
  regionId?: number | null;
  startDate?: string | null;
  endDate?: string | null;
  startTime?: string | null;
  endTime?: string | null;
  isActive?: boolean;
  priority?: number;
}

/**
 * Get schedules for a screen
 */
export async function getScreenSchedules(screenId: number): Promise<AdvertisementSchedule[]> {
  try {
    const result = await pool.query(`
      SELECT 
        id,
        screen_id as "screenId",
        ad_id as "adId",
        region_id as "regionId",
        start_date as "startDate",
        end_date as "endDate",
        start_time as "startTime",
        end_time as "endTime",
        is_active as "isActive",
        priority,
        created_at as "createdAt",
        updated_at as "updatedAt"
      FROM advertisement_schedules
      WHERE screen_id = $1
      ORDER BY priority DESC, created_at ASC
    `, [screenId]);

    return result.rows;
  } catch (error) {
    console.error('Error fetching advertisement schedules:', error);
    throw error;
  }
}

/**
 * Get schedule for a specific advertisement on a screen
 */
export async function getAdvertisementSchedule(
  screenId: number,
  adId: number
): Promise<AdvertisementSchedule | null> {
  try {
    const result = await pool.query(`
      SELECT 
        id,
        screen_id as "screenId",
        ad_id as "adId",
        region_id as "regionId",
        start_date as "startDate",
        end_date as "endDate",
        start_time as "startTime",
        end_time as "endTime",
        is_active as "isActive",
        priority,
        created_at as "createdAt",
        updated_at as "updatedAt"
      FROM advertisement_schedules
      WHERE screen_id = $1 AND ad_id = $2
      LIMIT 1
    `, [screenId, adId]);

    return result.rows.length > 0 ? result.rows[0] : null;
  } catch (error) {
    console.error('Error fetching advertisement schedule:', error);
    throw error;
  }
}

/**
 * Create an advertisement schedule
 */
export async function createAdvertisementSchedule(
  data: CreateAdvertisementScheduleRequest
): Promise<AdvertisementSchedule> {
  try {
    const result = await pool.query(`
      INSERT INTO advertisement_schedules (
        screen_id,
        ad_id,
        region_id,
        start_date,
        end_date,
        start_time,
        end_time,
        is_active,
        priority
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      ON CONFLICT DO NOTHING
      RETURNING 
        id,
        screen_id as "screenId",
        ad_id as "adId",
        region_id as "regionId",
        start_date as "startDate",
        end_date as "endDate",
        start_time as "startTime",
        end_time as "endTime",
        is_active as "isActive",
        priority,
        created_at as "createdAt",
        updated_at as "updatedAt"
    `, [
      data.screenId,
      data.adId,
      data.regionId || null,
      data.startDate || null,
      data.endDate || null,
      data.startTime || null,
      data.endTime || null,
      data.isActive !== undefined ? data.isActive : true,
      data.priority || 0
    ]);

    if (result.rows.length === 0) {
      // Schedule already exists, update it instead
      return await updateAdvertisementSchedule(
        data.screenId,
        data.adId,
        data
      );
    }

    return result.rows[0];
  } catch (error) {
    console.error('Error creating advertisement schedule:', error);
    throw error;
  }
}

/**
 * Update an advertisement schedule
 */
export async function updateAdvertisementSchedule(
  screenId: number,
  adId: number,
  data: Partial<CreateAdvertisementScheduleRequest>
): Promise<AdvertisementSchedule> {
  try {
    const updates: string[] = [];
    const values: any[] = [];
    let paramIndex = 1;

    if (data.regionId !== undefined) {
      updates.push(`region_id = $${paramIndex++}`);
      values.push(data.regionId);
    }
    if (data.startDate !== undefined) {
      updates.push(`start_date = $${paramIndex++}`);
      values.push(data.startDate);
    }
    if (data.endDate !== undefined) {
      updates.push(`end_date = $${paramIndex++}`);
      values.push(data.endDate);
    }
    if (data.startTime !== undefined) {
      updates.push(`start_time = $${paramIndex++}`);
      values.push(data.startTime);
    }
    if (data.endTime !== undefined) {
      updates.push(`end_time = $${paramIndex++}`);
      values.push(data.endTime);
    }
    if (data.isActive !== undefined) {
      updates.push(`is_active = $${paramIndex++}`);
      values.push(data.isActive);
    }
    if (data.priority !== undefined) {
      updates.push(`priority = $${paramIndex++}`);
      values.push(data.priority);
    }

    updates.push(`updated_at = CURRENT_TIMESTAMP`);
    values.push(screenId, adId);

    const result = await pool.query(`
      UPDATE advertisement_schedules
      SET ${updates.join(', ')}
      WHERE screen_id = $${paramIndex} AND ad_id = $${paramIndex + 1}
      RETURNING 
        id,
        screen_id as "screenId",
        ad_id as "adId",
        region_id as "regionId",
        start_date as "startDate",
        end_date as "endDate",
        start_time as "startTime",
        end_time as "endTime",
        is_active as "isActive",
        priority,
        created_at as "createdAt",
        updated_at as "updatedAt"
    `, values);

    if (result.rows.length === 0) {
      // Schedule doesn't exist, create it
      return await createAdvertisementSchedule({
        screenId,
        adId,
        ...data
      });
    }

    return result.rows[0];
  } catch (error) {
    console.error('Error updating advertisement schedule:', error);
    throw error;
  }
}

/**
 * Delete an advertisement schedule
 */
export async function deleteAdvertisementSchedule(
  screenId: number,
  adId: number
): Promise<void> {
  try {
    await pool.query(
      'DELETE FROM advertisement_schedules WHERE screen_id = $1 AND ad_id = $2',
      [screenId, adId]
    );
  } catch (error) {
    console.error('Error deleting advertisement schedule:', error);
    throw error;
  }
}

/**
 * Delete all schedules for a screen
 */
export async function deleteScreenSchedules(screenId: number): Promise<void> {
  try {
    await pool.query('DELETE FROM advertisement_schedules WHERE screen_id = $1', [screenId]);
  } catch (error) {
    console.error('Error deleting screen schedules:', error);
    throw error;
  }
}

/**
 * Get active schedules for a screen with advertisement details
 * Returns schedules that are currently active based on date/time
 */
export async function getActiveSchedulesWithAds(screenId: number): Promise<Array<{
  schedule: AdvertisementSchedule;
  advertisement: any;
}>> {
  try {
    // Get all schedules for the screen
    const schedules = await getScreenSchedules(screenId);

    // Use server local time
    const now = new Date();
    const currentTime = now.getHours() * 60 + now.getMinutes(); // Minutes since midnight

    // Parse DATE-only values safely (avoid UTC/local offset shifting the day)
    const parseDateOnlyLocal = (value: unknown): Date | null => {
      if (!value) return null;
      if (value instanceof Date) {
        // Convert to local date-only
        return new Date(value.getFullYear(), value.getMonth(), value.getDate(), 0, 0, 0, 0);
      }
      if (typeof value === 'string') {
        // Common Postgres DATE string: YYYY-MM-DD
        const m = value.match(/^(\d{4})-(\d{2})-(\d{2})/);
        if (m) {
          const y = Number(m[1]);
          const mo = Number(m[2]) - 1;
          const d = Number(m[3]);
          return new Date(y, mo, d, 0, 0, 0, 0);
        }
        const dt = new Date(value);
        if (!Number.isNaN(dt.getTime())) {
          return new Date(dt.getFullYear(), dt.getMonth(), dt.getDate(), 0, 0, 0, 0);
        }
      }
      return null;
    };
    
    // Filter active schedules by date/time window
    const activeSchedules = schedules.filter(schedule => {
      if (!schedule.isActive) return false;
      
      // Check date range
      if (schedule.startDate) {
        const startDate = parseDateOnlyLocal(schedule.startDate);
        if (!startDate) return false;
        if (now < startDate) return false;
      }
      
      if (schedule.endDate) {
        const endDate = parseDateOnlyLocal(schedule.endDate);
        if (!endDate) return false;
        endDate.setHours(23, 59, 59, 999);
        if (now > endDate) return false;
      }
      
      // Check time range
      if (schedule.startTime) {
        const [startHour, startMin] = schedule.startTime.split(':').map(Number);
        const startMinutes = startHour * 60 + startMin;
        if (currentTime < startMinutes) return false;
      }
      
      if (schedule.endTime) {
        const [endHour, endMin] = schedule.endTime.split(':').map(Number);
        const endMinutes = endHour * 60 + endMin;
        // End time is exclusive: at exactly endTime, schedule should stop
        if (currentTime >= endMinutes) return false;
      }
      
      return true;
    });

    // Return ALL active schedules (so multiple images in same region can play as slideshow on the player)
    const finalSchedules = activeSchedules;

    // Fetch advertisement details for active schedules
    const schedulesWithAds = await Promise.all(
      finalSchedules.map(async (schedule) => {
        const advertisement = await advertisementsService.getAdvertisementById(schedule.adId);
        return {
          schedule,
          advertisement
        };
      })
    );
    
    // Filter out null advertisements and return
    return schedulesWithAds.filter(item => item.advertisement !== null);
  } catch (error) {
    console.error('Error fetching active schedules with ads:', error);
    throw error;
  }
}

/** Ad IDs on this screen that have an enabled schedule record (time-controlled, not playlist). */
export async function getScheduledAdIdsForScreen(screenId: number): Promise<number[]> {
  const schedules = await getScreenSchedules(screenId);
  return schedules.filter((s) => s.isActive).map((s) => s.adId);
}

export interface PlayerAdvertisementPayload {
  /** Assigned ads that may play in the drag-order playlist (excludes scheduled ads). */
  assignedAdvertisements: any[];
  /** First playlist ad when no schedule is active right now. */
  defaultAd: any | null;
  /** Ad IDs with an active schedule record — play only via activeSchedules when in time window. */
  scheduledAdIds: number[];
}

/**
 * Split assigned ads into playlist vs schedule-only.
 * Scheduled ads never appear in the series loop; they play only when activeSchedules includes them.
 */
export async function buildPlayerAdvertisementPayload(
  screenId: number,
  assignedAdvertisements: any[],
  activeSchedules: Array<{ schedule: AdvertisementSchedule; advertisement: any }>
): Promise<PlayerAdvertisementPayload> {
  const scheduledAdIds = await getScheduledAdIdsForScreen(screenId);
  const scheduledSet = new Set(scheduledAdIds);

  const playlistAds = (assignedAdvertisements || []).filter(
    (ad) => ad && ad.id != null && !scheduledSet.has(ad.id)
  );

  let defaultAd: any | null = null;
  if (activeSchedules.length === 0 && playlistAds.length > 0) {
    defaultAd = playlistAds[0];
  }

  return {
    assignedAdvertisements: playlistAds,
    defaultAd,
    scheduledAdIds
  };
}
