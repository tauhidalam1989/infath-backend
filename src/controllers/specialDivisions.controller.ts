import { Request, Response } from 'express';
import * as specialDivisionsService from '../services/specialDivisions.service';
import { logLocationOperation } from '../utils/logger.util';

/**
 * GET /api/special-divisions
 * Get all special divisions
 */
export const getSpecialDivisions = async (req: Request, res: Response) => {
  try {
    const divisions = await specialDivisionsService.getSpecialDivisions();
    res.json(divisions);
  } catch (error: any) {
    res.status(500).json({
      error: error.message || 'Failed to get special divisions'
    });
  }
};

/**
 * GET /api/special-divisions/:id
 * Get special division by ID
 */
export const getSpecialDivisionById = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const division = await specialDivisionsService.getSpecialDivisionById(parseInt(id));
    
    if (!division) {
      return res.status(404).json({
        error: 'Special division not found'
      });
    }
    
    res.json(division);
  } catch (error: any) {
    res.status(500).json({
      error: error.message || 'Failed to get special division'
    });
  }
};

/**
 * POST /api/special-divisions
 * Create a new special division
 */
export const createSpecialDivision = async (req: Request, res: Response) => {
  try {
    const { name, code, category, priority, description, location } = req.body;

    if (!name || !code || !category || !priority || !description || !location) {
      return res.status(400).json({
        error: 'name, code, category, priority, description, and location are required'
      });
    }

    const division = await specialDivisionsService.createSpecialDivision(
      name,
      code,
      category,
      priority,
      description,
      location
    );

    // Log special division creation
    await logLocationOperation('info', 'special_divisions', 'create', name, division.id, (req as any).user?.id, req);

    res.status(201).json(division);
  } catch (error: any) {
    if (error.message.includes('already exists')) {
      return res.status(409).json({
        error: error.message
      });
    }
    res.status(500).json({
      error: error.message || 'Failed to create special division'
    });
  }
};

/**
 * PUT /api/special-divisions/:id
 * Update a special division
 */
export const updateSpecialDivision = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { name, code, category, priority, description, location } = req.body;

    if (!name || !code || !category || !priority || !description || !location) {
      return res.status(400).json({
        error: 'name, code, category, priority, description, and location are required'
      });
    }

    const division = await specialDivisionsService.updateSpecialDivision(
      parseInt(id),
      name,
      code,
      category,
      priority,
      description,
      location
    );

    // Log special division update
    await logLocationOperation('info', 'special_divisions', 'update', name, parseInt(id), (req as any).user?.id, req);

    res.json(division);
  } catch (error: any) {
    if (error.message === 'Special division not found') {
      return res.status(404).json({
        error: error.message
      });
    }
    if (error.message.includes('already exists')) {
      return res.status(409).json({
        error: error.message
      });
    }
    res.status(500).json({
      error: error.message || 'Failed to update special division'
    });
  }
};

/**
 * DELETE /api/special-divisions/:id
 * Delete a special division
 */
export const deleteSpecialDivision = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const divisionId = parseInt(id);
    
    // Get division info before deletion for logging
    const division = await specialDivisionsService.getSpecialDivisionById(divisionId);
    const name = division?.name || 'Unknown';
    
    await specialDivisionsService.deleteSpecialDivision(divisionId);
    
    // Log special division deletion
    await logLocationOperation('warning', 'special_divisions', 'delete', name, divisionId, (req as any).user?.id, req);
    
    res.json({ success: true, message: 'Special division deleted successfully' });
  } catch (error: any) {
    if (error.message === 'Special division not found') {
      return res.status(404).json({
        error: error.message
      });
    }
    res.status(500).json({
      error: error.message || 'Failed to delete special division'
    });
  }
};

