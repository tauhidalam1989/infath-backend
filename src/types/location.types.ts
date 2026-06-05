export interface Subsite {
  id: number;
  name: string;
  address: string;
  type: 'main-center' | 'branch' | 'office';
  status: 'active' | 'inactive';
  createdAt: Date;
  updatedAt: Date;
}

export interface Section {
  id: number;
  name: string;
  code: string;
  type: 'residential' | 'commercial' | 'industrial' | 'mixed';
  status: 'active' | 'inactive' | 'under-construction';
  description?: string;
  location: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface SpecialDivision {
  id: number;
  name: string;
  code: string;
  category: 'government' | 'educational' | 'healthcare' | 'religious' | 'recreational';
  priority: 'high' | 'medium' | 'low';
  description?: string;
  location: string;
  createdAt: Date;
  updatedAt: Date;
}

