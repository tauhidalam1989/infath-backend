import { Advertisement } from './advertisement.types';

export interface DiscoveredDevice {
  id: string;
  name: string;
  ipAddress: string;
  macAddress: string;
  deviceType: 'android-tv' | 'smart-tv' | 'unknown';
  status: 'online' | 'offline';
  lastSeen: Date;
  isRegistered: boolean;
}

export interface Screen {
  id: number;
  deviceId: string | null;
  name: string;
  ipAddress: string | null;
  macAddress: string | null;
  location: string | null;
  status: 'online' | 'offline' | 'playing' | 'paused';
  lastConnected: Date;
  assignedAds: number[];
  assignedAdvertisements?: Advertisement[]; // Full advertisement objects (when fetched with details)
  // Group
  groupId: number | null;
  groupName: string | null;
  // Location assignment
  subsiteId: number | null;
  sectionId: number | null;
  specialDivisionId: number | null;
  subsiteName: string | null;
  sectionName: string | null;
  specialDivisionName: string | null;
  // User assignment
  assignedUserId: number | null;
  assignedUserIds: number[] | null;
  assignedUserName: string | null;
  // Date and time
  startDate: Date | null;
  endDate: Date | null;
  startTime: string | null; // HH:mm format
  endTime: string | null; // HH:mm format
  // Display settings
  orientation?: 'portrait' | 'landscape' | 'auto' | null;
  screenSize?: 'small' | 'medium' | 'large' | 'custom' | null;
  screenWidth?: number | null;
  screenHeight?: number | null;
}

export interface ScreenGroup {
  id: number;
  name: string;
  description: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateScreenRequest {
  name: string;
  deviceId?: string | null;
  ipAddress?: string | null;
  macAddress?: string | null;
  location?: string | null;
  groupId?: number | null;
  subsiteId?: number | null;
  sectionId?: number | null;
  specialDivisionId?: number | null;
  assignedUserId?: number | null;
  assignedUserIds?: number[] | null;
  startDate?: string | null;
  endDate?: string | null;
  startTime?: string | null;
  endTime?: string | null;
  advertisementIds?: number[];
  // Display settings
  orientation?: 'portrait' | 'landscape' | 'auto' | null;
  screenSize?: 'small' | 'medium' | 'large' | 'custom' | null;
  screenWidth?: number | null;
  screenHeight?: number | null;
}

/** Ordered playlist entry when saving assigned ads (order + optional slide duration in seconds). */
export interface ScreenAdvertisementAssignment {
  adId: number;
  durationSeconds?: number;
}

export interface UpdateScreenRequest {
  name?: string;
  deviceId?: string | null;
  ipAddress?: string | null;
  macAddress?: string | null;
  location?: string | null;
  groupId?: number | null;
  subsiteId?: number | null;
  sectionId?: number | null;
  specialDivisionId?: number | null;
  assignedUserId?: number | null;
  assignedUserIds?: number[] | null;
  startDate?: string | null;
  endDate?: string | null;
  startTime?: string | null;
  endTime?: string | null;
  advertisementIds?: number[];
  /** If set, replaces assignments with this order and per-ad slide duration (seconds). */
  advertisementPlaylist?: ScreenAdvertisementAssignment[];
  // Display settings
  orientation?: 'portrait' | 'landscape' | 'auto' | null;
  screenSize?: 'small' | 'medium' | 'large' | 'custom' | null;
  screenWidth?: number | null;
  screenHeight?: number | null;
}

