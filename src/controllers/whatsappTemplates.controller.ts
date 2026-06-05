import { Request, Response } from 'express';
import {
  getWhatsAppTemplates,
  getWhatsAppTemplateById,
  createWhatsAppTemplate,
  updateWhatsAppTemplate,
  deleteWhatsAppTemplate,
  incrementTemplateUsage
} from '../services/whatsappTemplates.service';
import { logWhatsAppTemplateOperation } from '../utils/logger.util';

/**
 * Get all WhatsApp templates with optional filters
 * GET /api/whatsapp-templates
 */
export async function getAllTemplates(req: Request, res: Response): Promise<void> {
  try {
    const filters = {
      category: req.query.category as string,
      status: req.query.status as string,
      search: req.query.search as string,
      limit: req.query.limit ? parseInt(req.query.limit as string) : 10,
      offset: req.query.offset ? parseInt(req.query.offset as string) : undefined,
      page: req.query.page ? parseInt(req.query.page as string) : undefined
    };

    const result = await getWhatsAppTemplates(filters);
    
    res.json({
      success: true,
      templates: result.templates,
      total: result.total
    });
  } catch (error: any) {
    console.error('Error in getAllTemplates controller:', error);
    res.status(500).json({ 
      success: false,
      error: 'Internal server error while fetching templates' 
    });
  }
}

/**
 * Get a single WhatsApp template by ID
 * GET /api/whatsapp-templates/:id
 */
export async function getTemplate(req: Request, res: Response): Promise<void> {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) {
      res.status(400).json({ 
        success: false,
        error: 'Invalid template ID' 
      });
      return;
    }

    const template = await getWhatsAppTemplateById(id);
    
    if (!template) {
      res.status(404).json({ 
        success: false,
        error: 'Template not found' 
      });
      return;
    }

    res.json({
      success: true,
      template
    });
  } catch (error: any) {
    console.error('Error in getTemplate controller:', error);
    res.status(500).json({ 
      success: false,
      error: 'Internal server error while fetching template' 
    });
  }
}

/**
 * Create a new WhatsApp template
 * POST /api/whatsapp-templates
 */
export async function createTemplate(req: Request, res: Response): Promise<void> {
  try {
    // TODO: Get userId from authenticated user session/token
    const createdBy = req.body.createdBy ? parseInt(req.body.createdBy) : undefined;

    // Extract variables from content (simple regex to find {{variable}} patterns)
    const variableRegex = /\{\{(\w+)\}\}/g;
    const variables: string[] = [];
    let match;
    const content = req.body.content || '';
    while ((match = variableRegex.exec(content)) !== null) {
      if (!variables.includes(match[1])) {
        variables.push(match[1]);
      }
    }

    const templateData = {
      name: req.body.name,
      category: req.body.category || 'system-updates',
      content: content,
      variables: variables,
      status: req.body.status || 'active',
      usageCount: 0,
      createdBy
    };

    // Validate required fields
    if (!templateData.name || !templateData.content) {
      res.status(400).json({ 
        success: false,
        error: 'Name and content are required' 
      });
      return;
    }

    const template = await createWhatsAppTemplate(templateData);
    
    // Log template creation
    await logWhatsAppTemplateOperation('info', 'create', templateData.name, template.id, createdBy, req);
    
    res.status(201).json({
      success: true,
      message: 'Template created successfully',
      template
    });
  } catch (error: any) {
    console.error('Error in createTemplate controller:', error);
    res.status(500).json({ 
      success: false,
      error: 'Internal server error while creating template' 
    });
  }
}

/**
 * Update a WhatsApp template
 * PUT /api/whatsapp-templates/:id
 */
export async function updateTemplate(req: Request, res: Response): Promise<void> {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) {
      res.status(400).json({ 
        success: false,
        error: 'Invalid template ID' 
      });
      return;
    }

    const templateData: any = {};
    
    if (req.body.name !== undefined) templateData.name = req.body.name;
    if (req.body.category !== undefined) templateData.category = req.body.category;
    if (req.body.content !== undefined) {
      templateData.content = req.body.content;
      // Re-extract variables if content is updated
      const variableRegex = /\{\{(\w+)\}\}/g;
      const variables: string[] = [];
      let match;
      while ((match = variableRegex.exec(req.body.content)) !== null) {
        if (!variables.includes(match[1])) {
          variables.push(match[1]);
        }
      }
      templateData.variables = variables;
    }
    if (req.body.status !== undefined) templateData.status = req.body.status;
    if (req.body.usageCount !== undefined) templateData.usageCount = req.body.usageCount;
    if (req.body.lastUsed !== undefined) {
      templateData.lastUsed = req.body.lastUsed ? new Date(req.body.lastUsed) : null;
    }

    const template = await updateWhatsAppTemplate(id, templateData);
    
    // Log template update
    await logWhatsAppTemplateOperation('info', 'update', templateData.name || template.name || 'Unknown', id, (req as any).user?.id, req);
    
    res.json({
      success: true,
      message: 'Template updated successfully',
      template
    });
  } catch (error: any) {
    console.error('Error in updateTemplate controller:', error);
    res.status(500).json({ 
      success: false,
      error: 'Internal server error while updating template' 
    });
  }
}

/**
 * Delete a WhatsApp template
 * DELETE /api/whatsapp-templates/:id
 */
export async function deleteTemplate(req: Request, res: Response): Promise<void> {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) {
      res.status(400).json({ 
        success: false,
        error: 'Invalid template ID' 
      });
      return;
    }

    // Get template info before deletion for logging
    const template = await getWhatsAppTemplateById(id);
    const name = template?.name || 'Unknown';
    
    const deleted = await deleteWhatsAppTemplate(id);
    
    if (!deleted) {
      res.status(404).json({ 
        success: false,
        error: 'Template not found' 
      });
      return;
    }

    // Log template deletion
    await logWhatsAppTemplateOperation('warning', 'delete', name, id, (req as any).user?.id, req);

    res.json({
      success: true,
      message: 'Template deleted successfully'
    });
  } catch (error: any) {
    console.error('Error in deleteTemplate controller:', error);
    res.status(500).json({ 
      success: false,
      error: 'Internal server error while deleting template' 
    });
  }
}

/**
 * Increment template usage count
 * POST /api/whatsapp-templates/:id/use
 */
export async function useTemplate(req: Request, res: Response): Promise<void> {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) {
      res.status(400).json({ 
        success: false,
        error: 'Invalid template ID' 
      });
      return;
    }

    await incrementTemplateUsage(id);
    
    res.json({
      success: true,
      message: 'Template usage incremented'
    });
  } catch (error: any) {
    console.error('Error in useTemplate controller:', error);
    res.status(500).json({ 
      success: false,
      error: 'Internal server error while incrementing usage' 
    });
  }
}

