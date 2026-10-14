import type { PaymentMethod } from "@erp/domain/sale";

export type Id = string;

export interface Product {
  id: Id;
  code: number;
  barcode: string;
  name: string;
  description: string;
  category: string;
  brand: string;
  supplierId: Id | null;
  cost: number;
  price: number;
  stock: number;
  minStock: number;
  unit: string;
  location: string;
  active: boolean;
  ncm: string;
  cest: string;
  origin: number;
  cfop: string;
}

export interface Customer {
  id: Id;
  personType: "PF" | "PJ";
  document: string;
  name: string;
  tradeName: string;
  phone: string;
  whatsapp: string;
  email: string;
  zip: string;
  street: string;
  number: string;
  district: string;
  city: string;
  state: string;
  notes: string;
  createdAt: string;
}

export interface Supplier {
  id: Id;
  document: string;
  legalName: string;
  tradeName: string;
  stateRegistration: string;
  representative: string;
  phone: string;
  whatsapp: string;
  email: string;
  city: string;
  state: string;
  leadDays: number;
  paymentTerms: string;
  notes: string;
}

export type MovementType =
  | "purchase_receipt"
  | "sale"
  | "sale_cancellation"
  | "manual_entry"
  | "manual_exit"
  | "adjustment"
  | "inventory";

export interface Movement {
  id: Id;
  productId: Id;
  type: MovementType;
  quantity: number;
  before: number;
  after: number;
  reason: string;
  reference: string;
  user: string;
  at: string;
}

export type PurchaseStatus = "draft" | "sent" | "confirmed" | "partially_received" | "received" | "cancelled";

export interface PurchaseItem {
  productId: Id;
  quantity: number;
  unitPrice: number;
  received: number;
}

export interface PurchaseOrder {
  id: Id;
  number: number;
  supplierId: Id;
  status: PurchaseStatus;
  issueDate: string;
  expectedDate: string;
  paymentMethod: string;
  paymentTerms: string;
  dueDays: number;
  discount: number;
  freight: number;
  notes: string;
  items: PurchaseItem[];
}

export interface SaleItem {
  productId: Id;
  name: string;
  unit: string;
  quantity: number;
  unitPrice: number;
  discount: number;
  total: number;
  unitCost: number;
}

export interface SalePayment {
  method: PaymentMethod;
  amount: number;
  tendered?: number;
  installments?: number;
}

export interface Sale {
  id: Id;
  number: number;
  customerId: Id | null;
  seller: string;
  at: string;
  items: SaleItem[];
  subtotal: number;
  discount: number;
  total: number;
  change: number;
  payments: SalePayment[];
  status: "completed" | "cancelled";
  cancelReason?: string;
}

export interface FinancialTitle {
  id: Id;
  kind: "payable" | "receivable";
  description: string;
  party: string;
  amount: number;
  paid: number;
  dueDate: string;
  status: "open" | "partially_paid" | "paid" | "cancelled";
  source: string;
}

export interface Transaction {
  id: Id;
  direction: "in" | "out";
  amount: number;
  method: PaymentMethod | null;
  description: string;
  at: string;
}

export interface CashMovement {
  id: Id;
  type: "opening" | "sale" | "supply" | "withdrawal" | "refund";
  amount: number;
  description: string;
  at: string;
}

export interface CashSession {
  number: number;
  status: "open" | "closed";
  openedAt: string;
  operator: string;
  movements: CashMovement[];
  declared?: number;
  expected?: number;
}

export interface User {
  id: Id;
  name: string;
  email: string;
  role: "admin" | "manager" | "seller" | "stockist";
  active: boolean;
}

export interface AuditEntry {
  id: Id;
  at: string;
  user: string;
  action: string;
  detail: string;
}
