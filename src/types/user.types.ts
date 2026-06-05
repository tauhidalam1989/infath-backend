export interface User {
  id: number;
  username: string;
  email: string;
  phone1: string;
  phone2?: string;
  subsiteId?: number;
  sectionId?: number;
  specialDivisionId?: number;
  userType: 'regular-user' | 'admin-user' | 'super-user';
  validity: 'manager' | 'supervisor' | 'coordinator';
  notes?: string;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface UserPermissions {
  id: number;
  userId: number;
  addModifyAccounts: boolean;
  viewAccounts: boolean;
  deleteAccounts: boolean;
  addModifyAds: boolean;
  displayAds: boolean;
  deleteAds: boolean;
  addModifySites: boolean;
  viewSites: boolean;
  deleteSites: boolean;
  notificationSending: boolean;
  notificationViewing: boolean;
  notificationDeletion: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface UserWithPermissions extends User {
  permissions?: UserPermissions;
  subsiteName?: string;
  sectionName?: string;
  specialDivisionName?: string;
  twoFactorEnabled?: boolean;
}

