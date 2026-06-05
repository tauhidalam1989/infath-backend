export type ChannelType = 'email' | 'sms' | 'push' | 'whatsapp';

export interface EmailConfig {
  smtp_host: string;
  smtp_port: number;
  smtp_secure: boolean;
  smtp_user: string;
  smtp_password: string;
  from_email: string;
  from_name: string;
}

export interface SMSConfig {
  provider: string;
  api_key: string;
  api_secret: string;
  sender_id: string;
}

export interface PushConfig {
  provider: string;
  server_key: string;
  project_id: string;
  service_account: string;
}

export interface WhatsAppConfig {
  provider: string;
  api_key: string;
  api_secret: string;
  phone_number_id: string;
  business_account_id: string;
}

export type ChannelConfig = EmailConfig | SMSConfig | PushConfig | WhatsAppConfig;

export interface NotificationChannelConfig {
  id?: number;
  channelType: ChannelType;
  isEnabled: boolean;
  configData: ChannelConfig;
  createdAt?: Date;
  updatedAt?: Date;
  createdBy?: number | null;
}

export interface NotificationChannelConfigResponse {
  success: boolean;
  config?: NotificationChannelConfig;
  message?: string;
}

export interface NotificationChannelConfigListResponse {
  success: boolean;
  configs: NotificationChannelConfig[];
}

