import { Request, Response } from 'express';
import * as advertisementsService from '../services/advertisements.service';
import * as cloudStorageService from '../services/cloud-storage.service';
import { logEvent } from '../utils/logger.util';
import { ensureUtf8FileName } from '../utils/encoding.util';

/**
 * GET /api/advertisements
 * Get all advertisements with optional filters
 */
export const getAdvertisements = async (req: Request, res: Response) => {
  try {
    const filters = {
      type: req.query.type as string | undefined,
      status: req.query.status as string | undefined,
      subsiteId: req.query.subsiteId ? parseInt(req.query.subsiteId as string) : undefined,
      sectionId: req.query.sectionId ? parseInt(req.query.sectionId as string) : undefined,
      specialDivisionId: req.query.specialDivisionId ? parseInt(req.query.specialDivisionId as string) : undefined,
      search: req.query.search as string | undefined,
      limit: req.query.limit ? parseInt(req.query.limit as string) : 50,
      page: req.query.page ? parseInt(req.query.page as string) : 1
    };

    const result = await advertisementsService.getAdvertisements(filters);
    res.json({
      success: true,
      advertisements: result.advertisements,
      total: result.total
    });
  } catch (error: any) {
    console.error('Error getting advertisements:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to get advertisements'
    });
  }
};

/**
 * GET /api/advertisements/:id
 * Get advertisement by ID
 */
export const getAdvertisementById = async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid advertisement ID'
      });
    }

    const advertisement = await advertisementsService.getAdvertisementById(id);
    if (!advertisement) {
      return res.status(404).json({
        success: false,
        error: 'Advertisement not found'
      });
    }

    res.json({
      success: true,
      advertisement
    });
  } catch (error: any) {
    console.error('Error getting advertisement:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to get advertisement'
    });
  }
};

/**
 * POST /api/advertisements
 * Create new advertisement
 */
export const createAdvertisement = async (req: Request, res: Response) => {
  try {
    const file = req.file;
    const fileUrl = req.body.fileUrl;
    const fileName = ensureUtf8FileName(req.body.fileName);
    // Parse fileSize - handle both string and number, and allow 0 (for URLs where size is unknown)
    const fileSize = req.body.fileSize !== undefined && req.body.fileSize !== null 
      ? parseInt(req.body.fileSize.toString()) 
      : null;
    const mimeType = req.body.mimeType;

    // Check if file was uploaded directly (fileUrl provided) or needs server upload
    let uploadResult;
    let type: 'image' | 'video' | 'presentation' | 'document' = 'document';

    // Check for URL-based upload: fileUrl, fileName, mimeType are required; fileSize can be 0
    if (fileUrl && fileName && fileSize !== null && mimeType) {
      // File was uploaded directly to cloud storage (direct upload)
      uploadResult = {
        url: fileUrl,
        fileName: ensureUtf8FileName(fileName),
        fileSize: fileSize,
        mimeType: mimeType
      };

      // Determine type from mimeType
      if (mimeType.startsWith('image/')) {
        type = 'image';
      } else if (mimeType.startsWith('video/')) {
        type = 'video';
      } else if (
        mimeType.includes('presentation') ||
        mimeType.includes('powerpoint') ||
        mimeType.includes('pptx') ||
        mimeType.includes('ppt')
      ) {
        type = 'presentation';
      }
    } else if (file) {
      // Upload file to cloud storage via server (fileName from upload is normalized to UTF-8 in service)
      uploadResult = await cloudStorageService.uploadFile(file, 'advertisements');

      // Determine advertisement type based on mime type
      if (file.mimetype.startsWith('image/')) {
        type = 'image';
      } else if (file.mimetype.startsWith('video/')) {
        type = 'video';
      } else if (
        file.mimetype.includes('presentation') ||
        file.mimetype.includes('powerpoint') ||
        file.mimetype.includes('pptx') ||
        file.mimetype.includes('ppt')
      ) {
        type = 'presentation';
      }
    } else {
      return res.status(400).json({
        success: false,
        error: 'File is required'
      });
    }

    const advertisementData = {
      title: req.body.title || fileName || ensureUtf8FileName(uploadResult.fileName),
      description: req.body.description || null,
      type,
      fileUrl: uploadResult.url,
      fileName: ensureUtf8FileName(uploadResult.fileName),
      fileSize: uploadResult.fileSize,
      mimeType: uploadResult.mimeType,
      thumbnailUrl: type === 'image' ? uploadResult.url : null,
      status: req.body.status || 'draft'
    };

    const createdBy = (req as any).user?.id;
    const advertisement = await advertisementsService.createAdvertisement(advertisementData, createdBy);

    // Log advertisement creation
    await logEvent(
      'info',
      'advertisements',
      'create',
      `Advertisement "${advertisement.title}" created`,
      { advertisementId: advertisement.id, type },
      createdBy,
      req.ip || req.connection?.remoteAddress,
      req.get('user-agent')
    );

    res.status(201).json({
      success: true,
      message: 'Advertisement created successfully',
      advertisement
    });
  } catch (error: any) {
    console.error('Error creating advertisement:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to create advertisement'
    });
  }
};

/**
 * PUT /api/advertisements/:id
 * Update advertisement
 */
export const updateAdvertisement = async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid advertisement ID'
      });
    }

    console.log(`[updateAdvertisement] Updating advertisement ${id}`);
    console.log(`[updateAdvertisement] Request body:`, {
      title: req.body.title,
      description: req.body.description,
      status: req.body.status,
      fileUrl: req.body.fileUrl,
      fileName: req.body.fileName,
      fileSize: req.body.fileSize,
      mimeType: req.body.mimeType,
      hasFile: !!req.file
    });

    const updateData: any = {};
    
    if (req.body.title !== undefined) updateData.title = req.body.title;
    if (req.body.description !== undefined) updateData.description = req.body.description;
    if (req.body.type !== undefined) updateData.type = req.body.type;
    if (req.body.status !== undefined) updateData.status = req.body.status;

    // Handle file update - check for URL first, then file upload
    const fileUrl = req.body.fileUrl;
    const fileName = ensureUtf8FileName(req.body.fileName);
    const fileSize = req.body.fileSize ? parseInt(req.body.fileSize) : null;
    const mimeType = req.body.mimeType;

    if (fileUrl && fileName && fileSize !== null && mimeType) {
      // URL provided directly (from URL input or direct upload)
      console.log(`[updateAdvertisement] Using URL update:`, { fileUrl, fileName, fileSize, mimeType });
      updateData.fileUrl = fileUrl;
      updateData.fileName = ensureUtf8FileName(fileName);
      updateData.fileSize = fileSize;
      updateData.mimeType = mimeType;
      
      // Set thumbnail for images
      if (mimeType.startsWith('image/')) {
        updateData.thumbnailUrl = fileUrl;
      }
      
      // Update type if not explicitly provided
      if (!updateData.type) {
        if (mimeType.startsWith('image/')) {
          updateData.type = 'image';
        } else if (mimeType.startsWith('video/')) {
          updateData.type = 'video';
        } else if (
          mimeType.includes('presentation') ||
          mimeType.includes('powerpoint') ||
          mimeType.includes('pptx') ||
          mimeType.includes('ppt')
        ) {
          updateData.type = 'presentation';
        }
      }
    } else if (req.file) {
      console.log(`[updateAdvertisement] Using file upload`);
      // File uploaded via form (fileName normalized to UTF-8 in cloud-storage service)
      const uploadResult = await cloudStorageService.uploadFile(req.file, 'advertisements');
      updateData.fileUrl = uploadResult.url;
      updateData.fileName = ensureUtf8FileName(uploadResult.fileName);
      updateData.fileSize = uploadResult.fileSize;
      updateData.mimeType = uploadResult.mimeType;
      
      if (uploadResult.mimeType.startsWith('image/')) {
        updateData.thumbnailUrl = uploadResult.url;
      }
      
      // Update type if not explicitly provided
      if (!updateData.type) {
        if (uploadResult.mimeType.startsWith('image/')) {
          updateData.type = 'image';
        } else if (uploadResult.mimeType.startsWith('video/')) {
          updateData.type = 'video';
        } else if (
          uploadResult.mimeType.includes('presentation') ||
          uploadResult.mimeType.includes('powerpoint') ||
          uploadResult.mimeType.includes('pptx') ||
          uploadResult.mimeType.includes('ppt')
        ) {
          updateData.type = 'presentation';
        }
      }
    }

    console.log(`[updateAdvertisement] Update data to be saved:`, updateData);
    const advertisement = await advertisementsService.updateAdvertisement(id, updateData);
    console.log(`[updateAdvertisement] Advertisement updated successfully:`, {
      id: advertisement.id,
      fileUrl: advertisement.fileUrl,
      fileName: advertisement.fileName
    });

    // Log advertisement update
    await logEvent(
      'info',
      'advertisements',
      'update',
      `Advertisement "${advertisement.title}" updated`,
      { advertisementId: id },
      (req as any).user?.id,
      req.ip || req.connection?.remoteAddress,
      req.get('user-agent')
    );

    res.json({
      success: true,
      message: 'Advertisement updated successfully',
      advertisement
    });
  } catch (error: any) {
    console.error('Error updating advertisement:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to update advertisement'
    });
  }
};

/**
 * DELETE /api/advertisements/:id
 * Delete advertisement
 */
export const deleteAdvertisement = async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid advertisement ID'
      });
    }

    // Get advertisement before deletion for logging
    const advertisement = await advertisementsService.getAdvertisementById(id);
    if (!advertisement) {
      return res.status(404).json({
        success: false,
        error: 'Advertisement not found'
      });
    }

    // Delete file from cloud storage
    try {
      await cloudStorageService.deleteFile(advertisement.fileUrl);
    } catch (error) {
      console.error('Error deleting file from cloud storage:', error);
      // Continue with advertisement deletion even if file deletion fails
    }

    const deleted = await advertisementsService.deleteAdvertisement(id);

    if (!deleted) {
      return res.status(404).json({
        success: false,
        error: 'Advertisement not found'
      });
    }

    // Log advertisement deletion
    await logEvent(
      'warning',
      'advertisements',
      'delete',
      `Advertisement "${advertisement.title}" deleted`,
      { advertisementId: id },
      (req as any).user?.id,
      req.ip || req.connection?.remoteAddress,
      req.get('user-agent')
    );

    res.json({
      success: true,
      message: 'Advertisement deleted successfully'
    });
  } catch (error: any) {
    console.error('Error deleting advertisement:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to delete advertisement'
    });
  }
};

