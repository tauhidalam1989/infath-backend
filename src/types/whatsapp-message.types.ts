export interface WhatsAppMessage {
  id?: number;
  templateId?: number | null;
  recipientPhone: string;
  recipientName?: string | null;
  recipientUserId?: number | null;
  messageType: 'template' | 'text' | 'image' | 'document';
  messageContent: string;
  variables?: Record<string, string> | null;
  status: 'pending' | 'sent' | 'delivered' | 'failed';
  sentAt?: Date | null;
  deliveredAt?: Date | null;
  failedAt?: Date | null;
  errorMessage?: string | null;
  createdBy?: number | null;
  createdAt?: Date;
  updatedAt?: Date;
  templateName?: string | null;
  recipientUserName?: string | null;
}

export interface SendMessageRequest {
  templateId?: number;
  recipientPhone?: string;
  recipientUserIds?: number[];
  messageType: 'template' | 'text';
  messageContent?: string;
  variables?: Record<string, string>;
  sendToAll?: boolean;
}

export interface SendMessageResponse {
  success: boolean;
  message: string;
  messages?: WhatsAppMessage[];
  totalSent?: number;
  totalFailed?: number;
}

export interface WhatsAppMessageListResponse {
  success: boolean;
  messages: WhatsAppMessage[];
  total: number;
}

export interface WhatsAppMessageResponse {
  success: boolean;
  message: WhatsAppMessage;
}

