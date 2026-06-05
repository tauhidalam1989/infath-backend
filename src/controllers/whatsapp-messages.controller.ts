import { Request, Response } from 'express';
import * as whatsappMessagesService from '../services/whatsapp-messages.service';
import { logWhatsAppMessageSent, logEvent } from '../utils/logger.util';

/**
 * GET /api/whatsapp-messages
 * Get all WhatsApp messages with optional filters
 */
export const getMessages = async (req: Request, res: Response) => {
  try {
    const filters = {
      status: req.query.status as string | undefined,
      messageType: req.query.messageType as string | undefined,
      templateId: req.query.templateId ? parseInt(req.query.templateId as string) : undefined,
      recipientUserId: req.query.recipientUserId ? parseInt(req.query.recipientUserId as string) : undefined,
      search: req.query.search as string | undefined,
      limit: req.query.limit ? parseInt(req.query.limit as string) : 10,
      page: req.query.page ? parseInt(req.query.page as string) : 1
    };

    const result = await whatsappMessagesService.getMessages(filters);
    res.json({
      success: true,
      messages: result.messages,
      total: result.total
    });
  } catch (error: any) {
    console.error('Error getting WhatsApp messages:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to get WhatsApp messages'
    });
  }
};

/**
 * GET /api/whatsapp-messages/:id
 * Get message by ID
 */
export const getMessageById = async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid message ID'
      });
    }

    const message = await whatsappMessagesService.getMessageById(id);
    if (!message) {
      return res.status(404).json({
        success: false,
        error: 'Message not found'
      });
    }

    res.json({
      success: true,
      message
    });
  } catch (error: any) {
    console.error('Error getting WhatsApp message:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to get WhatsApp message'
    });
  }
};

/**
 * POST /api/whatsapp-messages
 * Send WhatsApp message(s) - individual or bulk
 */
export const sendMessages = async (req: Request, res: Response) => {
  try {
    const { templateId, recipientPhone, recipientUserIds, messageType, messageContent, variables, sendToAll } = req.body;

    // Validation
    if (!messageType || !['template', 'text'].includes(messageType)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid message type. Must be "template" or "text"'
      });
    }

    if (messageType === 'template' && !templateId) {
      return res.status(400).json({
        success: false,
        error: 'Template ID is required for template messages'
      });
    }

    if (messageType === 'text' && !messageContent) {
      return res.status(400).json({
        success: false,
        error: 'Message content is required for text messages'
      });
    }

    if (!sendToAll && !recipientPhone && (!recipientUserIds || recipientUserIds.length === 0)) {
      return res.status(400).json({
        success: false,
        error: 'At least one recipient is required'
      });
    }

    const request = {
      templateId: templateId ? parseInt(templateId) : undefined,
      recipientPhone: recipientPhone as string | undefined,
      recipientUserIds: recipientUserIds ? (Array.isArray(recipientUserIds) ? recipientUserIds.map((id: any) => parseInt(id)) : [parseInt(recipientUserIds)]) : undefined,
      messageType: messageType as 'template' | 'text',
      messageContent: messageContent as string | undefined,
      variables: variables as Record<string, string> | undefined,
      sendToAll: Boolean(sendToAll)
    };

    // Get createdBy from request (you might want to get this from auth token)
    const createdBy = (req as any).user?.id;

    const result = await whatsappMessagesService.sendMessages(request, createdBy);

    // Log WhatsApp message sent
    const sendMode = request.sendToAll || (request.recipientUserIds && request.recipientUserIds.length > 1) ? 'bulk' : 'individual';
    const recipientCount = request.sendToAll ? result.totalSent : (request.recipientUserIds?.length || (request.recipientPhone ? 1 : 0));
    await logWhatsAppMessageSent(sendMode, recipientCount, createdBy, req);

    res.json({
      success: true,
      message: `Messages sent successfully. ${result.totalSent} sent, ${result.totalFailed} failed.`,
      messages: result.messages,
      totalSent: result.totalSent,
      totalFailed: result.totalFailed
    });
  } catch (error: any) {
    console.error('Error sending WhatsApp messages:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to send WhatsApp messages'
    });
  }
};

/**
 * PUT /api/whatsapp-messages/:id/status
 * Update message status
 */
export const updateMessageStatus = async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid message ID'
      });
    }

    const { status, errorMessage } = req.body;
    if (!status || !['sent', 'delivered', 'failed'].includes(status)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid status. Must be "sent", "delivered", or "failed"'
      });
    }

    await whatsappMessagesService.updateMessageStatus(id, status, errorMessage);

    res.json({
      success: true,
      message: 'Message status updated successfully'
    });
  } catch (error: any) {
    console.error('Error updating message status:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to update message status'
    });
  }
};

/**
 * DELETE /api/whatsapp-messages/:id
 * Delete message
 */
export const deleteMessage = async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid message ID'
      });
    }

    await whatsappMessagesService.deleteMessage(id);

    res.json({
      success: true,
      message: 'Message deleted successfully'
    });
  } catch (error: any) {
    console.error('Error deleting WhatsApp message:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to delete WhatsApp message'
    });
  }
};

