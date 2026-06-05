import { Request, Response } from 'express';
import * as subsitesService from '../services/subsites.service';
import { logLocationOperation } from '../utils/logger.util';

/**
 * GET /api/subsites
 * Get all subsites
 */
export const getSubsites = async (req: Request, res: Response) => {
  try {
    const subsites = await subsitesService.getSubsites();
    res.json(subsites);
  } catch (error: any) {
    res.status(500).json({
      error: error.message || 'Failed to get subsites'
    });
  }
};

/**
 * GET /api/subsites/:id
 * Get subsite by ID
 */
export const getSubsiteById = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const subsite = await subsitesService.getSubsiteById(parseInt(id));
    
    if (!subsite) {
      return res.status(404).json({
        error: 'Subsite not found'
      });
    }
    
    res.json(subsite);
  } catch (error: any) {
    res.status(500).json({
      error: error.message || 'Failed to get subsite'
    });
  }
};

/**
 * POST /api/subsites
 * Create a new subsite
 */
export const createSubsite = async (req: Request, res: Response) => {
  try {
    const { name, address, type, status } = req.body;

    if (!name || !address || !type) {
      return res.status(400).json({
        error: 'name, address, and type are required'
      });
    }

    const subsite = await subsitesService.createSubsite(
      name,
      address,
      type,
      status || 'active'
    );

    // Log subsite creation
    await logLocationOperation('info', 'subsites', 'create', name, subsite.id, (req as any).user?.id, req);

    res.status(201).json(subsite);
  } catch (error: any) {
    res.status(500).json({
      error: error.message || 'Failed to create subsite'
    });
  }
};

/**
 * PUT /api/subsites/:id
 * Update a subsite
 */
export const updateSubsite = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { name, address, type, status } = req.body;

    if (!name || !address || !type || !status) {
      return res.status(400).json({
        error: 'name, address, type, and status are required'
      });
    }

    const subsite = await subsitesService.updateSubsite(
      parseInt(id),
      name,
      address,
      type,
      status
    );

    // Log subsite update
    await logLocationOperation('info', 'subsites', 'update', name, parseInt(id), (req as any).user?.id, req);

    res.json(subsite);
  } catch (error: any) {
    if (error.message === 'Subsite not found') {
      return res.status(404).json({
        error: error.message
      });
    }
    res.status(500).json({
      error: error.message || 'Failed to update subsite'
    });
  }
};

/**
 * DELETE /api/subsites/:id
 * Delete a subsite
 */
export const deleteSubsite = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const subsiteId = parseInt(id);
    
    // Get subsite info before deletion for logging
    const subsite = await subsitesService.getSubsiteById(subsiteId);
    const name = subsite?.name || 'Unknown';
    
    await subsitesService.deleteSubsite(subsiteId);
    
    // Log subsite deletion
    await logLocationOperation('warning', 'subsites', 'delete', name, subsiteId, (req as any).user?.id, req);
    
    res.json({ success: true, message: 'Subsite deleted successfully' });
  } catch (error: any) {
    if (error.message === 'Subsite not found') {
      return res.status(404).json({
        error: error.message
      });
    }
    res.status(500).json({
      error: error.message || 'Failed to delete subsite'
    });
  }
};

