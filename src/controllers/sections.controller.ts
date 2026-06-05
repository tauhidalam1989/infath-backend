import { Request, Response } from 'express';
import * as sectionsService from '../services/sections.service';
import { logLocationOperation } from '../utils/logger.util';

/**
 * GET /api/sections
 * Get all sections
 */
export const getSections = async (req: Request, res: Response) => {
  try {
    const sections = await sectionsService.getSections();
    res.json(sections);
  } catch (error: any) {
    res.status(500).json({
      error: error.message || 'Failed to get sections'
    });
  }
};

/**
 * GET /api/sections/:id
 * Get section by ID
 */
export const getSectionById = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const section = await sectionsService.getSectionById(parseInt(id));
    
    if (!section) {
      return res.status(404).json({
        error: 'Section not found'
      });
    }
    
    res.json(section);
  } catch (error: any) {
    res.status(500).json({
      error: error.message || 'Failed to get section'
    });
  }
};

/**
 * POST /api/sections
 * Create a new section
 */
export const createSection = async (req: Request, res: Response) => {
  try {
    const { name, code, type, status, description, location } = req.body;

    if (!name || !code || !type || !status || !description || !location) {
      return res.status(400).json({
        error: 'name, code, type, status, description, and location are required'
      });
    }

    const section = await sectionsService.createSection(
      name,
      code,
      type,
      status,
      description,
      location
    );

    // Log section creation
    await logLocationOperation('info', 'sections', 'create', name, section.id, (req as any).user?.id, req);

    res.status(201).json(section);
  } catch (error: any) {
    if (error.message.includes('already exists')) {
      return res.status(409).json({
        error: error.message
      });
    }
    res.status(500).json({
      error: error.message || 'Failed to create section'
    });
  }
};

/**
 * PUT /api/sections/:id
 * Update a section
 */
export const updateSection = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { name, code, type, status, description, location } = req.body;

    if (!name || !code || !type || !status || !description || !location) {
      return res.status(400).json({
        error: 'name, code, type, status, description, and location are required'
      });
    }

    const section = await sectionsService.updateSection(
      parseInt(id),
      name,
      code,
      type,
      status,
      description,
      location
    );

    // Log section update
    await logLocationOperation('info', 'sections', 'update', name, parseInt(id), (req as any).user?.id, req);

    res.json(section);
  } catch (error: any) {
    if (error.message === 'Section not found') {
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
      error: error.message || 'Failed to update section'
    });
  }
};

/**
 * DELETE /api/sections/:id
 * Delete a section
 */
export const deleteSection = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const sectionId = parseInt(id);
    
    // Get section info before deletion for logging
    const section = await sectionsService.getSectionById(sectionId);
    const name = section?.name || 'Unknown';
    
    await sectionsService.deleteSection(sectionId);
    
    // Log section deletion
    await logLocationOperation('warning', 'sections', 'delete', name, sectionId, (req as any).user?.id, req);
    
    res.json({ success: true, message: 'Section deleted successfully' });
  } catch (error: any) {
    if (error.message === 'Section not found') {
      return res.status(404).json({
        error: error.message
      });
    }
    res.status(500).json({
      error: error.message || 'Failed to delete section'
    });
  }
};

