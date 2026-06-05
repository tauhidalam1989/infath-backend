import { pool } from '../config/database';
import { WhatsAppMessage, SendMessageRequest } from '../types/whatsapp-message.types';
import * as whatsappTemplatesService from './whatsappTemplates.service';
import * as usersService from './users.service';

/**
 * Replace variables in template content
 */
function replaceVariables(content: string, variables: Record<string, string> = {}): string {
  let result = content;
  for (const [key, value] of Object.entries(variables)) {
    const regex = new RegExp(`\\{\\{${key}\\}\\}`, 'g');
    result = result.replace(regex, value);
  }
  return result;
}

/**
 * Get all WhatsApp messages with optional filters
 */
export async function getMessages(filters?: {
  status?: string;
  messageType?: string;
  templateId?: number;
  recipientUserId?: number;
  search?: string;
  limit?: number;
  offset?: number;
  page?: number;
}): Promise<{ messages: WhatsAppMessage[]; total: number }> {
  try {
    const limit = filters?.limit || 10;
    const page = filters?.page || 1;
    const offset = (page - 1) * limit;

    let query = `
      SELECT 
        wm.id,
        wm.template_id as "templateId",
        wm.recipient_phone as "recipientPhone",
        wm.recipient_name as "recipientName",
        wm.recipient_user_id as "recipientUserId",
        wm.message_type as "messageType",
        wm.message_content as "messageContent",
        wm.variables,
        wm.status,
        wm.sent_at as "sentAt",
        wm.delivered_at as "deliveredAt",
        wm.failed_at as "failedAt",
        wm.error_message as "errorMessage",
        wm.created_by as "createdBy",
        wm.created_at as "createdAt",
        wm.updated_at as "updatedAt",
        wt.name as template_name,
        u.username as recipient_user_name
      FROM whatsapp_messages wm
      LEFT JOIN whatsapp_templates wt ON wm.template_id = wt.id
      LEFT JOIN users u ON wm.recipient_user_id = u.id
      WHERE 1=1
    `;
    const queryParams: any[] = [];
    let paramIndex = 1;

    if (filters?.status) {
      query += ` AND wm.status = $${paramIndex}`;
      queryParams.push(filters.status);
      paramIndex++;
    }

    if (filters?.messageType) {
      query += ` AND wm.message_type = $${paramIndex}`;
      queryParams.push(filters.messageType);
      paramIndex++;
    }

    if (filters?.templateId) {
      query += ` AND wm.template_id = $${paramIndex}`;
      queryParams.push(filters.templateId);
      paramIndex++;
    }

    if (filters?.recipientUserId) {
      query += ` AND wm.recipient_user_id = $${paramIndex}`;
      queryParams.push(filters.recipientUserId);
      paramIndex++;
    }

    if (filters?.search) {
      query += ` AND (
        wm.recipient_phone ILIKE $${paramIndex} OR
        wm.recipient_name ILIKE $${paramIndex} OR
        wm.message_content ILIKE $${paramIndex} OR
        u.username ILIKE $${paramIndex}
      )`;
      queryParams.push(`%${filters.search}%`);
      paramIndex++;
    }

    // Get total count
    const countQuery = query.replace(/SELECT[\s\S]*?FROM/, 'SELECT COUNT(*) as total FROM');
    const countResult = await pool.query(countQuery, queryParams);
    const total = parseInt(countResult.rows[0].total);

    // Add pagination
    query += ` ORDER BY wm.created_at DESC LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
    queryParams.push(limit, offset);

    const result = await pool.query(query, queryParams);

    return {
      messages: result.rows.map(row => ({
        id: row.id,
        templateId: row.templateId ?? null,
        recipientPhone: row.recipientPhone,
        recipientName: row.recipientName ?? null,
        recipientUserId: row.recipientUserId ?? null,
        messageType: row.messageType,
        messageContent: row.messageContent,
        variables: row.variables ?? null,
        status: row.status,
        sentAt: row.sentAt ? new Date(row.sentAt) : null,
        deliveredAt: row.deliveredAt ? new Date(row.deliveredAt) : null,
        failedAt: row.failedAt ? new Date(row.failedAt) : null,
        errorMessage: row.errorMessage ?? null,
        createdBy: row.createdBy ?? null,
        createdAt: new Date(row.createdAt),
        updatedAt: new Date(row.updatedAt),
        templateName: row.template_name ?? null,
        recipientUserName: row.recipient_user_name ?? null
      })),
      total
    };
  } catch (error) {
    console.error('Error fetching WhatsApp messages:', error);
    throw error;
  }
}

/**
 * Get message by ID
 */
export async function getMessageById(id: number): Promise<WhatsAppMessage | null> {
  try {
    const result = await pool.query(`
      SELECT 
        wm.id,
        wm.template_id as "templateId",
        wm.recipient_phone as "recipientPhone",
        wm.recipient_name as "recipientName",
        wm.recipient_user_id as "recipientUserId",
        wm.message_type as "messageType",
        wm.message_content as "messageContent",
        wm.variables,
        wm.status,
        wm.sent_at as "sentAt",
        wm.delivered_at as "deliveredAt",
        wm.failed_at as "failedAt",
        wm.error_message as "errorMessage",
        wm.created_by as "createdBy",
        wm.created_at as "createdAt",
        wm.updated_at as "updatedAt",
        wt.name as template_name,
        u.username as recipient_user_name
      FROM whatsapp_messages wm
      LEFT JOIN whatsapp_templates wt ON wm.template_id = wt.id
      LEFT JOIN users u ON wm.recipient_user_id = u.id
      WHERE wm.id = $1
    `, [id]);

    if (result.rows.length === 0) {
      return null;
    }

    const row = result.rows[0];
    return {
      id: row.id,
      templateId: row.templateId ?? null,
      recipientPhone: row.recipientPhone,
      recipientName: row.recipientName ?? null,
      recipientUserId: row.recipientUserId ?? null,
      messageType: row.messageType,
      messageContent: row.messageContent,
      variables: row.variables ?? null,
      status: row.status,
      sentAt: row.sentAt ? new Date(row.sentAt) : null,
      deliveredAt: row.deliveredAt ? new Date(row.deliveredAt) : null,
      failedAt: row.failedAt ? new Date(row.failedAt) : null,
      errorMessage: row.errorMessage ?? null,
      createdBy: row.createdBy ?? null,
      createdAt: new Date(row.createdAt),
      updatedAt: new Date(row.updatedAt),
      templateName: row.template_name ?? null,
      recipientUserName: row.recipient_user_name ?? null
    };
  } catch (error) {
    console.error('Error fetching WhatsApp message:', error);
    throw error;
  }
}

/**
 * Send WhatsApp message(s) - individual or bulk
 */
export async function sendMessages(
  request: SendMessageRequest,
  createdBy?: number
): Promise<{ messages: WhatsAppMessage[]; totalSent: number; totalFailed: number }> {
  try {
    const messages: WhatsAppMessage[] = [];
    let totalSent = 0;
    let totalFailed = 0;

    // Get template if templateId is provided
    let template = null;
    if (request.templateId) {
      template = await whatsappTemplatesService.getWhatsAppTemplateById(request.templateId);
      if (!template) {
        throw new Error('Template not found');
      }
      // Increment template usage
      await whatsappTemplatesService.incrementTemplateUsage(request.templateId);
    }

    // Determine recipients
    let recipients: Array<{ phone: string; name?: string; userId?: number }> = [];

    if (request.sendToAll) {
      // Get all active users with phone numbers
      const users = await usersService.getUsers();
      recipients = users
        .filter(u => u.isActive && (u.phone1 || u.phone2))
        .map(u => ({
          phone: u.phone1 || u.phone2 || '',
          name: u.username,
          userId: u.id
        }));
    } else if (request.recipientUserIds && request.recipientUserIds.length > 0) {
      // Get selected users
      for (const userId of request.recipientUserIds) {
        const user = await usersService.getUserById(userId);
        if (user && user.isActive && (user.phone1 || user.phone2)) {
          recipients.push({
            phone: user.phone1 || user.phone2 || '',
            name: user.username,
            userId: user.id
          });
        }
      }
    } else if (request.recipientPhone) {
      // Single recipient
      recipients.push({
        phone: request.recipientPhone,
        name: request.recipientPhone
      });
    }

    if (recipients.length === 0) {
      throw new Error('No valid recipients found');
    }

    // Create messages for each recipient
    for (const recipient of recipients) {
      try {
        let messageContent = '';

        if (request.messageType === 'template' && template) {
          // Replace variables in template
          messageContent = replaceVariables(template.content, request.variables || {});
        } else if (request.messageType === 'text' && request.messageContent) {
          messageContent = request.messageContent;
        } else {
          throw new Error('Invalid message type or missing content');
        }

        // Insert message into database
        const result = await pool.query(`
          INSERT INTO whatsapp_messages (
            template_id,
            recipient_phone,
            recipient_name,
            recipient_user_id,
            message_type,
            message_content,
            variables,
            status,
            created_by,
            created_at,
            updated_at
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
          RETURNING *
        `, [
          request.templateId ?? null,
          recipient.phone,
          recipient.name ?? null,
          recipient.userId ?? null,
          request.messageType,
          messageContent,
          request.variables ? JSON.stringify(request.variables) : null,
          'pending',
          createdBy ?? null
        ]);

        const row = result.rows[0];
        const message: WhatsAppMessage = {
          id: row.id,
          templateId: row.template_id ?? null,
          recipientPhone: row.recipient_phone,
          recipientName: row.recipient_name ?? null,
          recipientUserId: row.recipient_user_id ?? null,
          messageType: row.message_type,
          messageContent: row.message_content,
          variables: row.variables ? JSON.parse(row.variables) : null,
          status: row.status,
          sentAt: null,
          deliveredAt: null,
          failedAt: null,
          errorMessage: null,
          createdBy: row.created_by ?? null,
          createdAt: new Date(row.created_at),
          updatedAt: new Date(row.updated_at),
          templateName: template?.name ?? null
        };

        messages.push(message);
        totalSent++;

        // TODO: Here you would integrate with actual WhatsApp API (Twilio, WhatsApp Business API, etc.)
        // For now, we'll simulate sending by updating status after a delay
        // In production, you would call the WhatsApp API here
        
      } catch (error: any) {
        console.error(`Error creating message for ${recipient.phone}:`, error);
        totalFailed++;
        
        // Create failed message record
        try {
          await pool.query(`
            INSERT INTO whatsapp_messages (
              template_id,
              recipient_phone,
              recipient_name,
              recipient_user_id,
              message_type,
              message_content,
              variables,
              status,
              error_message,
              failed_at,
              created_by,
              created_at,
              updated_at
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, CURRENT_TIMESTAMP, $10, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
          `, [
            request.templateId ?? null,
            recipient.phone,
            recipient.name ?? null,
            recipient.userId ?? null,
            request.messageType,
            request.messageContent || '',
            request.variables ? JSON.stringify(request.variables) : null,
            'failed',
            error.message || 'Failed to send message',
            createdBy ?? null
          ]);
        } catch (insertError) {
          console.error('Error inserting failed message:', insertError);
        }
      }
    }

    return { messages, totalSent, totalFailed };
  } catch (error) {
    console.error('Error sending WhatsApp messages:', error);
    throw error;
  }
}

/**
 * Update message status
 */
export async function updateMessageStatus(
  id: number,
  status: 'sent' | 'delivered' | 'failed',
  errorMessage?: string
): Promise<void> {
  try {
    const updateFields: string[] = ['status = $1', 'updated_at = CURRENT_TIMESTAMP'];
    const params: any[] = [status];
    let paramIndex = 2;

    if (status === 'sent') {
      updateFields.push('sent_at = CURRENT_TIMESTAMP');
    } else if (status === 'delivered') {
      updateFields.push('delivered_at = CURRENT_TIMESTAMP');
    } else if (status === 'failed') {
      updateFields.push('failed_at = CURRENT_TIMESTAMP');
      if (errorMessage) {
        updateFields.push(`error_message = $${paramIndex}`);
        params.push(errorMessage);
        paramIndex++;
      }
    }

    params.push(id);
    await pool.query(
      `UPDATE whatsapp_messages SET ${updateFields.join(', ')} WHERE id = $${paramIndex}`,
      params
    );
  } catch (error) {
    console.error('Error updating message status:', error);
    throw error;
  }
}

/**
 * Delete message
 */
export async function deleteMessage(id: number): Promise<void> {
  try {
    await pool.query('DELETE FROM whatsapp_messages WHERE id = $1', [id]);
  } catch (error) {
    console.error('Error deleting WhatsApp message:', error);
    throw error;
  }
}

