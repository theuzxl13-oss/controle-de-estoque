import type { PaymentMethod } from "@erp/domain/sale";

export type Id = string;

/** Tipo de produto da revenda. Gás e água usam vasilhame retornável. */
export type ProductKind = "gas" | "agua" | "acessorio" | "outro";

export interface Product {
  id: Id;
  code: number;
  kind: ProductKind;
  name: string;
  /** Ex.: "13 kg", "20 L". */
  capacity: string;
  /** Tem vasilhame retornável (botijão/galão): controla cheios e vazios. */
  returnable: boolean;
  /** Preço na troca (cliente entrega o vazio) — ou preço único se não retornável. */
  priceExchange: number;
  /** Preço completo (cliente leva o vasilhame). */
  priceFull: number;
  /** Custo do conteúdo (recarga) — ou custo unitário se não retornável. */
  costExchange: number;
  /** Custo do vasilhame vazio. */
  costShell: number;
  /** Estoque cheio (ou estoque simples se não retornável). */
  stockFull: number;
  /** Vasilhames vazios em estoque. */
  stockEmpty: number;
  minStock: number;
  active: boolean;
  barcode: string;
  ncm: string;
  anpCode: string;
}

/** Como o item foi vendido. */
export type SaleMode = "troca" | "completo" | "unidade";

export interface Customer {
  id: Id;
  name: string;
  phone: string;
  document: string;
  street: string;
  number: string;
  district: string;
  reference: string;
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

export type StockBucket = "cheio" | "vazio";

export type MovementType =
  | "purchase_receipt"
  | "shell_return"
  | "sale"
  | "shell_in"
  | "sale_cancellation"
  | "manual_entry"
  | "manual_exit"
  | "adjustment";

export interface Movement {
  id: Id;
  productId: Id;
  bucket: StockBucket;
  type: MovementType;
  quantity: number;
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
  mode: SaleMode;
  quantity: number;
  unitPrice: number;
  total: number;
  unitCost: number;
}

export type DeliveryStatus = "pendente" | "em_rota" | "entregue";

export interface Delivery {
  status: DeliveryStatus;
  address: string;
  reference: string;
  driver: string | null;
  /** Troco para (pagamento em dinheiro na entrega). */
  changeFor?: number;
  dispatchedAt?: string;
  deliveredAt?: string;
}

export interface Sale {
  id: Id;
  number: number;
  customerId: Id | null;
  seller: string;
  at: string;
  channel: "balcao" | "entrega";
  items: SaleItem[];
  deliveryFee: number;
  subtotal: number;
  discount: number;
  total: number;
  /** Troco devolvido no balcão. */
  change?: number;
  method: PaymentMethod;
  /** Pagamento já recebido? Em entregas, o entregador recebe na porta. */
  paid: boolean;
  status: "completed" | "cancelled";
  cancelReason?: string;
  delivery?: Delivery;
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
