import { pool } from '../config/database';

export interface ScreenRegion {
  id: number;
  screenId: number;
  regionType: 'split_horizontal' | 'split_vertical' | 'custom';
  regionPosition: 'left' | 'right' | 'top' | 'bottom' | 'custom';
  widthPercentage: number;
  heightPercentage: number;
  xPosition: number;
  yPosition: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateScreenRegionRequest {
  screenId: number;
  regionType?: 'split_horizontal' | 'split_vertical' | 'custom';
  regionPosition: 'left' | 'right' | 'top' | 'bottom' | 'custom';
  widthPercentage?: number;
  heightPercentage?: number;
  xPosition?: number;
  yPosition?: number;
}

/**
 * Get regions for a screen
 */
export async function getScreenRegions(screenId: number): Promise<ScreenRegion[]> {
  try {
    const result = await pool.query(`
      SELECT 
        id,
        screen_id as "screenId",
        region_type as "regionType",
        region_position as "regionPosition",
        width_percentage as "widthPercentage",
        height_percentage as "heightPercentage",
        x_position as "xPosition",
        y_position as "yPosition",
        created_at as "createdAt",
        updated_at as "updatedAt"
      FROM screen_regions
      WHERE screen_id = $1
      ORDER BY region_position
    `, [screenId]);

    return result.rows;
  } catch (error) {
    console.error('Error fetching screen regions:', error);
    throw error;
  }
}

/**
 * Create a screen region
 */
export async function createScreenRegion(data: CreateScreenRegionRequest): Promise<ScreenRegion> {
  try {
    const result = await pool.query(`
      INSERT INTO screen_regions (
        screen_id,
        region_type,
        region_position,
        width_percentage,
        height_percentage,
        x_position,
        y_position
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING 
        id,
        screen_id as "screenId",
        region_type as "regionType",
        region_position as "regionPosition",
        width_percentage as "widthPercentage",
        height_percentage as "heightPercentage",
        x_position as "xPosition",
        y_position as "yPosition",
        created_at as "createdAt",
        updated_at as "updatedAt"
    `, [
      data.screenId,
      data.regionType || 'split_horizontal',
      data.regionPosition,
      data.widthPercentage || 50.00,
      data.heightPercentage || 50.00,
      data.xPosition || 0.00,
      data.yPosition || 0.00
    ]);

    return result.rows[0];
  } catch (error) {
    console.error('Error creating screen region:', error);
    throw error;
  }
}

/**
 * Update a screen region
 */
export async function updateScreenRegion(
  id: number,
  data: Partial<CreateScreenRegionRequest>
): Promise<ScreenRegion> {
  try {
    const updates: string[] = [];
    const values: any[] = [];
    let paramIndex = 1;

    if (data.regionType !== undefined) {
      updates.push(`region_type = $${paramIndex++}`);
      values.push(data.regionType);
    }
    if (data.regionPosition !== undefined) {
      updates.push(`region_position = $${paramIndex++}`);
      values.push(data.regionPosition);
    }
    if (data.widthPercentage !== undefined) {
      updates.push(`width_percentage = $${paramIndex++}`);
      values.push(data.widthPercentage);
    }
    if (data.heightPercentage !== undefined) {
      updates.push(`height_percentage = $${paramIndex++}`);
      values.push(data.heightPercentage);
    }
    if (data.xPosition !== undefined) {
      updates.push(`x_position = $${paramIndex++}`);
      values.push(data.xPosition);
    }
    if (data.yPosition !== undefined) {
      updates.push(`y_position = $${paramIndex++}`);
      values.push(data.yPosition);
    }

    updates.push(`updated_at = CURRENT_TIMESTAMP`);
    values.push(id);

    const result = await pool.query(`
      UPDATE screen_regions
      SET ${updates.join(', ')}
      WHERE id = $${paramIndex}
      RETURNING 
        id,
        screen_id as "screenId",
        region_type as "regionType",
        region_position as "regionPosition",
        width_percentage as "widthPercentage",
        height_percentage as "heightPercentage",
        x_position as "xPosition",
        y_position as "yPosition",
        created_at as "createdAt",
        updated_at as "updatedAt"
    `, values);

    if (result.rows.length === 0) {
      throw new Error('Screen region not found');
    }

    return result.rows[0];
  } catch (error) {
    console.error('Error updating screen region:', error);
    throw error;
  }
}

/**
 * Delete a screen region
 */
export async function deleteScreenRegion(id: number): Promise<void> {
  try {
    await pool.query('DELETE FROM screen_regions WHERE id = $1', [id]);
  } catch (error) {
    console.error('Error deleting screen region:', error);
    throw error;
  }
}

/**
 * Delete all regions for a screen
 */
export async function deleteScreenRegions(screenId: number): Promise<void> {
  try {
    await pool.query('DELETE FROM screen_regions WHERE screen_id = $1', [screenId]);
  } catch (error) {
    console.error('Error deleting screen regions:', error);
    throw error;
  }
}

/**
 * Create a default full-screen region (1x1) for a screen
 * This is called automatically when a screen is created
 */
export async function createDefaultScreenRegion(screenId: number): Promise<ScreenRegion> {
  try {
    // Check if any regions already exist for this screen
    const existingRegions = await getScreenRegions(screenId);
    
    // If regions already exist, don't create default region
    if (existingRegions.length > 0) {
      console.log(`Screen ${screenId} already has ${existingRegions.length} region(s), skipping default region creation`);
      return existingRegions[0]; // Return first existing region
    }

    // Create default full-screen region (1x1)
    // Use 'default' as regionPosition to mark it as the default region
    const defaultRegion = await createScreenRegion({
      screenId,
      regionType: 'custom',
      regionPosition: 'default' as any, // Using 'default' to mark as default full-screen region
      widthPercentage: 100.00,
      heightPercentage: 100.00,
      xPosition: 0.00,
      yPosition: 0.00
    });

    console.log(`✅ Created default full-screen region for screen ${screenId}`);
    
    // Fetch and return the updated region
    const result = await pool.query(`
      SELECT 
        id,
        screen_id as "screenId",
        region_type as "regionType",
        region_position as "regionPosition",
        width_percentage as "widthPercentage",
        height_percentage as "heightPercentage",
        x_position as "xPosition",
        y_position as "yPosition",
        created_at as "createdAt",
        updated_at as "updatedAt"
      FROM screen_regions
      WHERE id = $1
    `, [defaultRegion.id]);

    return result.rows[0];
  } catch (error) {
    console.error('Error creating default screen region:', error);
    throw error;
  }
}

