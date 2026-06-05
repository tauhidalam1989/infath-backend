export interface WhatsAppTemplate {
  id?: number;
  name: string;
  category: 'system-updates' | 'security-alerts' | 'new-messages' | 'reminders' | 'marketing';
  content: string;
  variables: string[];
  status: 'active' | 'inactive';
  usageCount: number;
  lastUsed?: Date | null;
  createdBy?: number | null;
  createdAt?: Date;
  updatedAt?: Date;
}

export interface WhatsAppTemplateListResponse {
  success: boolean;
  templates: WhatsAppTemplate[];
  total: number;
}

export interface WhatsAppTemplateResponse {
  success: boolean;
  template: WhatsAppTemplate;
  message?: string;
}

