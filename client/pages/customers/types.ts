export interface Owner {
  id: string;
  name: string;
}
export type CustomerStatus = 'potential' | 'active' | 'lost';
export interface Customer {
  id: string;
  companyName: string;
  industry: string | null;
  size: string | null;
  source: string | null;
  ownerId: string;
  owner: Owner | null;
  status: CustomerStatus;
  grade: 'A' | 'B' | 'C' | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
  createdById: string;
  version: number;
}
export interface Contact {
  id: string;
  customerId: string;
  name: string;
  position: string | null;
  phone: string | null;
  email: string | null;
  createdAt: string;
  updatedAt: string;
  createdById: string;
  version: number;
}
export interface ListResult<T> {
  data: T[];
  meta: { page: number; pageSize: number; total: number };
}
export interface CustomerContext {
  reload: () => void;
  onCustomerSaved: (customer: Customer, created?: boolean) => void;
  onContactSaved?: (contact: Contact, created: boolean) => void;
  customerId?: string;
}
