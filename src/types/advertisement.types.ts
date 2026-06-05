export type AdvertisementType = 'image' | 'video' | 'presentation' | 'document';
export type AdvertisementStatus = 'draft' | 'active' | 'inactive' | 'expired';

export interface Advertisement {
  id?: number;
  title: string;
  description?: string | null;
  type: AdvertisementType;
  fileUrl: string;
  fileName: string;
  fileSize: number;
  mimeType: string;
  thumbnailUrl?: string | null;
  status: AdvertisementStatus;
  /** When ad is assigned to a screen: seconds this slide shows in the player slider (dashboard). */
  slideDurationSeconds?: number;
  createdBy?: number | null;
  createdAt?: Date;
  updatedAt?: Date;
}

export interface AdvertisementListResponse {
  success: boolean;
  advertisements: Advertisement[];
  total: number;
}

export interface AdvertisementResponse {
  success: boolean;
  advertisement: Advertisement;
}

export interface CreateAdvertisementRequest {
  title: string;
  description?: string | null;
  type: AdvertisementType;
  fileUrl: string;
  fileName: string;
  fileSize: number;
  mimeType: string;
  thumbnailUrl?: string | null;
  status?: AdvertisementStatus;
}

