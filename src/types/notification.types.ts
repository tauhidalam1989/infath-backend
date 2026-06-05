export interface NotificationSettings {
  id?: number;
  userId?: number;
  systemUpdatesEmail: boolean;
  systemUpdatesSms: boolean;
  systemUpdatesPush: boolean;
  systemUpdatesWhatsapp: boolean;
  securityAlertsEmail: boolean;
  securityAlertsSms: boolean;
  securityAlertsPush: boolean;
  securityAlertsWhatsapp: boolean;
  newMessagesEmail: boolean;
  newMessagesSms: boolean;
  newMessagesPush: boolean;
  newMessagesWhatsapp: boolean;
  remindersEmail: boolean;
  remindersSms: boolean;
  remindersPush: boolean;
  remindersWhatsapp: boolean;
  marketingEmail: boolean;
  marketingSms: boolean;
  marketingPush: boolean;
  marketingWhatsapp: boolean;
  createdAt?: Date;
  updatedAt?: Date;
}

export interface Notification {
  id?: number;
  title: string;
  type: 'normal' | 'urgent' | 'important' | 'info';
  message: string;
  category: string;
  priority: 'low' | 'medium' | 'high';
  status: 'draft' | 'scheduled' | 'sent';
  content?: string | null;
  sendToAll: boolean;
  subsiteId?: number | null;
  sectionId?: number | null;
  specialDivisionId?: number | null;
  subsiteName?: string | null;
  sectionName?: string | null;
  specialDivisionName?: string | null;
  scheduledDate?: Date | null;
  scheduledTime?: string | null;
  sentAt?: Date | null;
  createdBy?: number | null;
  createdAt?: Date;
  updatedAt?: Date;
}

