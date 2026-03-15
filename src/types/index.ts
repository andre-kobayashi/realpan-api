export type Locale = 'pt' | 'ja';

export type CustomerType = 'pj' | 'pf';

export type StorageType = 'frozen' | 'refrigerated' | 'ambient';

export type OrderStatus = 
  | 'pending' 
  | 'confirmed' 
  | 'processing' 
  | 'shipped' 
  | 'delivered' 
  | 'cancelled';

export type PaymentStatus = 
  | 'pending' 
  | 'paid' 
  | 'failed' 
  | 'refunded';

export type UserRole = 'admin' | 'manager' | 'staff';
