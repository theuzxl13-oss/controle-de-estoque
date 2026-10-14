/**
 * Estado da demonstração da revenda de gás (somente em memória — recarregar a
 * página restaura os dados). Regras principais:
 *  - Venda na TROCA: sai 1 cheio e entra 1 vazio (o do cliente). Em entregas,
 *    o vazio entra quando o entregador confirma a entrega.
 *  - Venda COMPLETA: sai 1 cheio; o vasilhame vai junto com o cliente.
 *  - Carga da distribuidora: entram cheios e saem os vazios devolvidos.
 *  - Em entregas, o pagamento é recebido na porta (lançado na confirmação).
 * Os cálculos de valores usam o MESMO módulo do sistema real (@erp/domain).
 */
import { createContext, useCallback, useContext, useState, type ReactNode } from "react";

import { ROLE_PERMISSIONS, type Permission, type Role } from "@erp/auth/permissions";
import { fromCents, toCents } from "@erp/domain/money";
import { computeSaleTotals, type PaymentMethod } from "@erp/domain/sale";

import * as seed from "./data/seed";
import type {
  AuditEntry,
  CashSession,
  Customer,
  FinancialTitle,
  Movement,
  MovementType,
  Product,
  PurchaseOrder,
  PurchaseStatus,
  Sale,
  SaleMode,
  StockBucket,
  Supplier,
  Transaction,
  User,
} from "./data/types";

export class BusinessError extends Error {}

const nowIso = () => new Date().toISOString();
let seq = 1000;
const newId = (p: string) => `${p}-n${++seq}`;
const round2 = (n: number) => Math.round(n * 100) / 100;

export interface CartLine {
  productId: string;
  mode: SaleMode;
  quantity: number;
}

export const unitPriceFor = (p: Product, mode: SaleMode) => (mode === "completo" ? p.priceFull : p.priceExchange);
export const unitCostFor = (p: Product, mode: SaleMode) => (mode === "completo" ? p.costExchange + p.costShell : p.costExchange);

export interface SaleInput {
  lines: CartLine[];
  channel: "balcao" | "entrega";
  customerId: string | null;
  method: PaymentMethod;
  discount: number;
  deliveryFee: number;
  /** Valor entregue em dinheiro no balcão. */
  tendered?: number;
  /** Troco para (entrega em dinheiro). */
  changeFor?: number;
  driver?: string | null;
}

export type ProductDraft = Omit<Product, "id" | "code" | "stockFull" | "stockEmpty"> & {
  id?: string;
  initialFull?: number;
  initialEmpty?: number;
};

interface Store {
  user: User;
  setUserId: (id: string) => void;
  can: (p: Permission) => boolean;
  allowNegativeStock: boolean;
  setAllowNegativeStock: (v: boolean) => void;
  drivers: string[];
  products: Product[];
  customers: Customer[];
  suppliers: Supplier[];
  movements: Movement[];
  purchaseOrders: PurchaseOrder[];
  sales: Sale[];
  titles: FinancialTitle[];
  transactions: Transaction[];
  cash: CashSession;
  users: User[];
  audit: AuditEntry[];
  saveProduct: (p: ProductDraft) => Product;
  saveCustomer: (c: Omit<Customer, "id" | "createdAt"> & { id?: string }) => Customer;
  saveSupplier: (s: Omit<Supplier, "id"> & { id?: string }) => void;
  moveStock: (productId: string, bucket: StockBucket, type: "manual_entry" | "manual_exit" | "adjustment", quantity: number, reason: string) => void;
  savePurchaseOrder: (o: Omit<PurchaseOrder, "id" | "number" | "status"> & { id?: string }) => PurchaseOrder;
  setPurchaseStatus: (id: string, status: PurchaseStatus) => void;
  receivePurchase: (id: string, quantities: Record<string, number>, invoice: string, returnEmpties: boolean) => void;
  registerSale: (input: SaleInput) => Sale;
  dispatchDelivery: (saleId: string, driver: string) => void;
  confirmDelivery: (saleId: string) => void;
  cancelSale: (id: string, reason: string) => void;
  settleTitle: (id: string) => void;
  openCash: (amount: number) => void;
  closeCash: (declared: number) => { expected: number; difference: number };
  cashMovement: (type: "supply" | "withdrawal", amount: number, description: string) => void;
}

const Ctx = createContext<Store | null>(null);

interface StockEntry {
  productId: string;
  bucket: StockBucket;
  quantity: number;
  type: MovementType;
  reason: string;
  reference: string;
}

export function StoreProvider({ children }: { children: ReactNode }) {
  const [userId, setUserId] = useState("u1");
  const [allowNegativeStock, setAllowNegativeStock] = useState(false);
  const [products, setProducts] = useState(seed.products);
  const [customers, setCustomers] = useState(seed.customers);
  const [suppliers, setSuppliers] = useState(seed.suppliers);
  const [movements, setMovements] = useState(seed.movements);
  const [purchaseOrders, setPurchaseOrders] = useState(seed.purchaseOrders);
  const [sales, setSales] = useState(seed.sales);
  const [titles, setTitles] = useState(seed.titles);
  const [transactions, setTransactions] = useState(seed.transactions);
  const [cash, setCash] = useState(seed.cash);
  const [audit, setAudit] = useState(seed.audit);

  const user = seed.users.find((u) => u.id === userId)!;
  const can = useCallback((p: Permission) => ROLE_PERMISSIONS[user.role as Role].includes(p), [user.role]);

  const require = (p: Permission) => {
    if (!can(p)) throw new BusinessError(`Permissão negada (${p}) para o perfil atual.`);
  };
  const log = (action: string, detail: string) =>
    setAudit((a) => [{ id: newId("aud"), at: nowIso(), user: user.name, action, detail }, ...a]);

  /** Aplica movimentações em cheios/vazios com a regra de estoque negativo. */
  const applyStock = (current: Product[], entries: StockEntry[]) => {
    const next = current.map((p) => ({ ...p }));
    const created: Movement[] = [];
    for (const e of entries) {
      if (e.quantity === 0) continue;
      const p = next.find((x) => x.id === e.productId);
      if (!p) throw new BusinessError("Produto não encontrado.");
      const key = e.bucket === "cheio" ? "stockFull" : "stockEmpty";
      const after = p[key] + e.quantity;
      if (e.quantity < 0 && after < 0 && !allowNegativeStock) {
        const what = e.bucket === "cheio" ? (p.returnable ? "cheios" : "em estoque") : "vazios";
        throw new BusinessError(`Estoque insuficiente de "${p.name}" (${what}: ${p[key]}, necessário: ${-e.quantity}).`);
      }
      p[key] = after;
      created.push({ id: newId("mov"), productId: p.id, bucket: e.bucket, type: e.type, quantity: e.quantity, reason: e.reason, reference: e.reference, user: user.name, at: nowIso() });
    }
    return { next, created };
  };

  const receivePayment = (s: Sale) => {
    if (s.method === "credit_card") {
      setTitles((t) => [
        { id: newId("tit"), kind: "receivable", description: `Venda nº ${s.number} — cartão de crédito`, party: "Adquirente do cartão",
          amount: s.total, paid: 0, dueDate: new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10), status: "open", source: `Venda ${s.number}` },
        ...t,
      ]);
      return;
    }
    if (s.method === "store_credit") return; // título criado na venda
    setTransactions((t) => [{ id: newId("trx"), direction: "in", amount: s.total, method: s.method, description: `Venda nº ${s.number}`, at: nowIso() }, ...t]);
    if (s.method === "cash") {
      setCash((c) => ({ ...c, movements: [...c.movements, { id: newId("cx"), type: "sale", amount: s.total, description: `Venda nº ${s.number}`, at: nowIso() }] }));
    }
  };

  const store: Store = {
    user,
    setUserId,
    can,
    allowNegativeStock,
    setAllowNegativeStock,
    drivers: seed.DRIVERS,
    products,
    customers,
    suppliers,
    movements,
    purchaseOrders,
    sales,
    titles,
    transactions,
    cash,
    users: seed.users,
    audit,

    saveProduct(input) {
      require("products.manage");
      if (input.name.trim().length < 2) throw new BusinessError("Informe o nome do produto.");
      if (!(input.priceExchange > 0)) throw new BusinessError(input.returnable ? "Informe o preço da troca." : "Informe o preço de venda.");
      if (input.returnable && !(input.priceFull > input.priceExchange)) {
        throw new BusinessError("O preço completo (com vasilhame) deve ser maior que o preço da troca.");
      }
      if (input.barcode && products.some((p) => p.barcode === input.barcode && p.id !== input.id)) {
        throw new BusinessError("Já existe um produto com este código de barras.");
      }
      const { initialFull, initialEmpty, ...rest } = input;
      if (input.id) {
        const updated = { ...products.find((p) => p.id === input.id)!, ...rest } as Product;
        setProducts((ps) => ps.map((p) => (p.id === input.id ? updated : p)));
        log("update", `Produto alterado: ${input.name}`);
        return updated;
      }
      const id = newId("prd");
      const created: Product = { ...rest, id, code: Math.max(0, ...products.map((p) => p.code)) + 1, stockFull: 0, stockEmpty: 0 };
      const r = applyStock([...products, created], [
        { productId: id, bucket: "cheio", quantity: initialFull ?? 0, type: "manual_entry", reason: "Saldo inicial", reference: "Cadastro" },
        { productId: id, bucket: "vazio", quantity: input.returnable ? (initialEmpty ?? 0) : 0, type: "manual_entry", reason: "Saldo inicial de vasilhames", reference: "Cadastro" },
      ]);
      setProducts(r.next);
      setMovements((m) => [...r.created, ...m]);
      log("insert", `Produto cadastrado: ${input.name}`);
      return created;
    },

    saveCustomer(input) {
      require("customers.manage");
      if (input.name.trim().length < 2) throw new BusinessError("Informe o nome do cliente.");
      const digits = input.phone.replace(/\D/g, "");
      if (digits.length < 10) throw new BusinessError("Informe o telefone com DDD.");
      if (customers.some((c) => c.phone.replace(/\D/g, "") === digits && c.id !== input.id)) {
        throw new BusinessError("Já existe um cliente com este telefone.");
      }
      if (input.id) {
        const updated = { ...customers.find((c) => c.id === input.id)!, ...input } as Customer;
        setCustomers((cs) => cs.map((c) => (c.id === input.id ? updated : c)));
        return updated;
      }
      const created: Customer = { ...input, id: newId("cli"), createdAt: nowIso() };
      setCustomers((cs) => [created, ...cs]);
      log("insert", `Cliente cadastrado: ${input.name}`);
      return created;
    },

    saveSupplier(input) {
      require("suppliers.manage");
      if (suppliers.some((s) => s.document === input.document && s.id !== input.id)) {
        throw new BusinessError("Já existe um fornecedor com este CNPJ/CPF.");
      }
      if (input.id) {
        setSuppliers((ss) => ss.map((s) => (s.id === input.id ? { ...s, ...input } : s)));
        return;
      }
      setSuppliers((ss) => [{ ...input, id: newId("sup") }, ...ss]);
      log("insert", `Fornecedor cadastrado: ${input.legalName}`);
    },

    moveStock(productId, bucket, type, quantity, reason) {
      require(type === "adjustment" ? "stock.adjust" : "stock.move");
      if (reason.trim().length < 3) throw new BusinessError("Informe o motivo da movimentação.");
      if (!(quantity >= 0) || (type !== "adjustment" && quantity === 0)) throw new BusinessError("Quantidade inválida.");
      const p = products.find((x) => x.id === productId)!;
      if (bucket === "vazio" && !p.returnable) throw new BusinessError("Este produto não tem vasilhame.");
      const current = bucket === "cheio" ? p.stockFull : p.stockEmpty;
      const delta = type === "adjustment" ? quantity - current : type === "manual_entry" ? quantity : -quantity;
      if (delta === 0) throw new BusinessError("O saldo informado é igual ao saldo atual.");
      const r = applyStock(products, [{ productId, bucket, quantity: delta, type, reason, reference: "Manual" }]);
      setProducts(r.next);
      setMovements((m) => [...r.created, ...m]);
      log(`stock.${type}`, `${p.name} (${bucket}): ${delta > 0 ? "+" : ""}${delta} — ${reason}`);
    },

    savePurchaseOrder(input) {
      require("purchases.manage");
      if (input.items.length === 0) throw new BusinessError("Adicione ao menos um produto.");
      if (input.id) {
        const current = purchaseOrders.find((o) => o.id === input.id)!;
        if (current.status !== "draft" && current.status !== "sent") {
          throw new BusinessError("Itens e valores só podem ser alterados em rascunho ou enviado.");
        }
        const updated = { ...current, ...input };
        setPurchaseOrders((os) => os.map((o) => (o.id === input.id ? updated : o)));
        return updated;
      }
      const created: PurchaseOrder = { ...input, id: newId("ped"), number: Math.max(0, ...purchaseOrders.map((o) => o.number)) + 1, status: "draft" };
      setPurchaseOrders((os) => [created, ...os]);
      log("insert", `Pedido de compra nº ${created.number} criado`);
      return created;
    },

    setPurchaseStatus(id, status) {
      require("purchases.manage");
      const o = purchaseOrders.find((x) => x.id === id)!;
      const allowed: Record<PurchaseStatus, PurchaseStatus[]> = {
        draft: ["sent", "confirmed", "cancelled"],
        sent: ["draft", "confirmed", "cancelled"],
        confirmed: ["cancelled"],
        partially_received: ["cancelled"],
        received: [],
        cancelled: [],
      };
      if (!allowed[o.status].includes(status)) throw new BusinessError(`Transição de status inválida: ${o.status} → ${status}.`);
      setPurchaseOrders((os) => os.map((x) => (x.id === id ? { ...x, status } : x)));
      log("update", `Pedido nº ${o.number}: ${o.status} → ${status}`);
    },

    receivePurchase(id, quantities, invoice, returnEmpties) {
      require("purchases.receive");
      const o = purchaseOrders.find((x) => x.id === id)!;
      if (!["sent", "confirmed", "partially_received"].includes(o.status)) {
        throw new BusinessError(`Pedido com status "${o.status}" não pode receber mercadorias.`);
      }
      const entries = o.items.map((it) => ({ it, q: quantities[it.productId] ?? 0 })).filter((x) => x.q > 0);
      if (entries.length === 0) throw new BusinessError("Informe ao menos uma quantidade recebida.");
      for (const { it, q } of entries) {
        if (q > it.quantity - it.received) throw new BusinessError(`Quantidade recebida (${q}) excede o saldo pendente (${it.quantity - it.received}).`);
      }
      const goodsBefore = o.items.reduce((s, i) => s + round2(i.received * i.unitPrice), 0);
      const items = o.items.map((it) => {
        const e = entries.find((x) => x.it.productId === it.productId);
        return e ? { ...it, received: it.received + e.q } : it;
      });
      const goodsAfter = items.reduce((s, i) => s + round2(i.received * i.unitPrice), 0);
      const all = items.every((i) => i.received === i.quantity);
      const subtotal = items.reduce((s, i) => s + round2(i.quantity * i.unitPrice), 0);
      const extra = o.freight - o.discount;
      const alloc = subtotal > 0 ? round2((goodsAfter / subtotal) * extra) - round2((goodsBefore / subtotal) * extra) : 0;
      const amount = round2(goodsAfter - goodsBefore + alloc);

      const stockEntries: StockEntry[] = entries.flatMap(({ it, q }) => {
        const p = products.find((x) => x.id === it.productId)!;
        const list: StockEntry[] = [{ productId: p.id, bucket: "cheio", quantity: q, type: "purchase_receipt", reason: `Carga do pedido nº ${o.number}${invoice ? ` (NF ${invoice})` : ""}`, reference: `Pedido ${o.number}` }];
        if (p.returnable && returnEmpties) {
          list.push({ productId: p.id, bucket: "vazio", quantity: -q, type: "shell_return", reason: `Vazios devolvidos à distribuidora — pedido nº ${o.number}`, reference: `Pedido ${o.number}` });
        }
        return list;
      });
      // Custo médio do conteúdo
      const withCost = products.map((p) => {
        const e = entries.find((x) => x.it.productId === p.id);
        if (!e) return p;
        const base = Math.max(p.stockFull, 0);
        return { ...p, costExchange: Math.round(((base * p.costExchange + e.q * e.it.unitPrice) / (base + e.q)) * 100) / 100 };
      });
      const r = applyStock(withCost, stockEntries);
      setProducts(r.next);
      setMovements((m) => [...r.created, ...m]);
      setPurchaseOrders((os) => os.map((x) => (x.id === id ? { ...x, items, status: all ? "received" : "partially_received" } : x)));
      if (amount > 0) {
        const supplier = suppliers.find((s) => s.id === o.supplierId)!;
        const due = new Date();
        due.setDate(due.getDate() + o.dueDays);
        setTitles((t) => [
          { id: newId("tit"), kind: "payable", description: `Pedido de compra nº ${o.number} — carga recebida`, party: supplier.tradeName || supplier.legalName,
            amount, paid: 0, dueDate: due.toISOString().slice(0, 10), status: "open", source: `Pedido ${o.number}` },
          ...t,
        ]);
      }
      log("purchase.received", `Pedido nº ${o.number}: ${all ? "recebido" : "recebimento parcial"}`);
    },

    registerSale(input) {
      require("sales.create");
      if (cash.status !== "open") throw new BusinessError("Abra o caixa antes de vender.");
      if (input.lines.length === 0) throw new BusinessError("Adicione ao menos um produto.");
      const customer = customers.find((c) => c.id === input.customerId) ?? null;
      if (input.channel === "entrega" && !customer) throw new BusinessError("Para entrega, informe o cliente (telefone e endereço).");
      if (input.method === "store_credit" && !customer) throw new BusinessError("Venda fiado exige cliente identificado.");
      const prods = input.lines.map((l) => {
        const p = products.find((x) => x.id === l.productId);
        if (!p || !p.active) throw new BusinessError("Produto inválido ou inativo.");
        return p;
      });
      const totals = computeSaleTotals(
        [
          ...input.lines.map((l, i) => ({ quantity: l.quantity, unitPrice: unitPriceFor(prods[i], l.mode) })),
          ...(input.deliveryFee > 0 ? [{ quantity: 1, unitPrice: input.deliveryFee }] : []),
        ],
        input.discount,
      );
      if (totals.discountTotalCents > 0) {
        require("sales.discount");
        if (totals.discountPercent > seed.COMPANY.maxSellerDiscount && !can("sales.discount_unlimited")) {
          throw new BusinessError(`Desconto acima do limite permitido (${seed.COMPANY.maxSellerDiscount}%). Peça autorização ao gerente.`);
        }
      }
      const total = fromCents(totals.totalCents);
      let change = 0;
      if (input.channel === "balcao" && input.method === "cash" && input.tendered !== undefined) {
        if (toCents(input.tendered) < totals.totalCents) throw new BusinessError("Valor recebido menor que o total.");
        change = fromCents(toCents(input.tendered) - totals.totalCents);
      }
      if (input.changeFor !== undefined && input.changeFor < total) throw new BusinessError("O valor do “troco para” é menor que o total.");

      const number = Math.max(0, ...sales.map((s) => s.number)) + 1;
      const reference = `Venda ${number}`;
      const stockEntries: StockEntry[] = input.lines.flatMap((l, i) => {
        const list: StockEntry[] = [{ productId: l.productId, bucket: "cheio", quantity: -l.quantity, type: "sale", reason: `Venda nº ${number}`, reference }];
        if (prods[i].returnable && l.mode === "troca" && input.channel === "balcao") {
          list.push({ productId: l.productId, bucket: "vazio", quantity: l.quantity, type: "shell_in", reason: `Vasilhame recebido — venda nº ${number}`, reference });
        }
        return list;
      });
      const r = applyStock(products, stockEntries);

      const sale: Sale = {
        id: newId("ven"),
        number,
        customerId: customer?.id ?? null,
        seller: user.name,
        at: nowIso(),
        channel: input.channel,
        items: input.lines.map((l, i) => ({
          productId: l.productId, name: prods[i].name, mode: l.mode, quantity: l.quantity,
          unitPrice: unitPriceFor(prods[i], l.mode), total: fromCents(totals.lines[i].totalCents), unitCost: unitCostFor(prods[i], l.mode),
        })),
        deliveryFee: input.deliveryFee,
        subtotal: fromCents(totals.subtotalCents),
        discount: fromCents(totals.discountTotalCents),
        total,
        method: input.method,
        paid: input.channel === "balcao",
        status: "completed",
        delivery:
          input.channel === "entrega" && customer
            ? {
                status: input.driver ? "em_rota" : "pendente",
                address: `${customer.street}, ${customer.number} — ${customer.district}`,
                reference: customer.reference,
                driver: input.driver ?? null,
                changeFor: input.method === "cash" ? input.changeFor : undefined,
                dispatchedAt: input.driver ? nowIso() : undefined,
              }
            : undefined,
      };
      if (change > 0) sale.change = change;

      setProducts(r.next);
      setMovements((m) => [...r.created, ...m]);
      setSales((s) => [...s, sale]);
      if (input.method === "store_credit") {
        setTitles((t) => [
          { id: newId("tit"), kind: "receivable", description: `Venda nº ${number} — fiado`, party: customer?.name ?? "",
            amount: total, paid: 0, dueDate: new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10), status: "open", source: reference },
          ...t,
        ]);
      }
      if (sale.paid) receivePayment(sale);
      log("sale.registered", `Venda nº ${number} (${input.channel === "entrega" ? "entrega" : "balcão"}) — ${total.toFixed(2)}`);
      return sale;
    },

    dispatchDelivery(saleId, driver) {
      require("sales.create");
      const s = sales.find((x) => x.id === saleId)!;
      if (s.status !== "completed" || s.delivery?.status !== "pendente") throw new BusinessError("Entrega não está pendente.");
      setSales((ss) => ss.map((x) => (x.id === saleId ? { ...x, delivery: { ...x.delivery!, status: "em_rota", driver, dispatchedAt: nowIso() } } : x)));
      log("delivery.dispatched", `Venda nº ${s.number} saiu com ${driver}`);
    },

    confirmDelivery(saleId) {
      require("sales.create");
      const s = sales.find((x) => x.id === saleId)!;
      if (s.status !== "completed" || !s.delivery || s.delivery.status === "entregue") throw new BusinessError("Entrega já concluída ou inválida.");
      if (cash.status !== "open" && s.method === "cash") throw new BusinessError("Abra o caixa para receber o dinheiro da entrega.");
      const shells: StockEntry[] = s.items
        .filter((i) => i.mode === "troca" && products.find((p) => p.id === i.productId)?.returnable)
        .map((i) => ({ productId: i.productId, bucket: "vazio", quantity: i.quantity, type: "shell_in", reason: `Vasilhame recebido na entrega — venda nº ${s.number}`, reference: `Venda ${s.number}` }));
      const r = applyStock(products, shells);
      setProducts(r.next);
      setMovements((m) => [...r.created, ...m]);
      const updated: Sale = { ...s, paid: true, delivery: { ...s.delivery, status: "entregue", driver: s.delivery.driver ?? "—", deliveredAt: nowIso() } };
      setSales((ss) => ss.map((x) => (x.id === saleId ? updated : x)));
      receivePayment(updated);
      log("delivery.completed", `Venda nº ${s.number} entregue`);
    },

    cancelSale(id, reason) {
      require("sales.cancel");
      const s = sales.find((x) => x.id === id)!;
      if (s.status !== "completed") throw new BusinessError("Somente vendas concluídas podem ser canceladas.");
      if (reason.trim().length < 5) throw new BusinessError("Informe o motivo do cancelamento (mínimo 5 caracteres).");
      const refundCash = s.paid && s.method === "cash";
      if (refundCash && cash.status !== "open") throw new BusinessError("Abra um caixa para devolver o valor em dinheiro.");
      const shellsBack = s.channel === "balcao" || s.delivery?.status === "entregue";
      const entries: StockEntry[] = s.items.flatMap((it) => {
        const p = products.find((x) => x.id === it.productId)!;
        const list: StockEntry[] = [{ productId: it.productId, bucket: "cheio", quantity: it.quantity, type: "sale_cancellation", reason: `Cancelamento da venda nº ${s.number}`, reference: `Venda ${s.number}` }];
        if (p.returnable && it.mode === "troca" && shellsBack) {
          list.push({ productId: it.productId, bucket: "vazio", quantity: -it.quantity, type: "sale_cancellation", reason: `Vasilhame devolvido ao cliente — cancelamento nº ${s.number}`, reference: `Venda ${s.number}` });
        }
        return list;
      });
      const r = applyStock(products, entries);
      setProducts(r.next);
      setMovements((m) => [...r.created, ...m]);
      setSales((ss) => ss.map((x) => (x.id === id ? { ...x, status: "cancelled", cancelReason: reason } : x)));
      setTitles((ts) => ts.map((t) => (t.source === `Venda ${s.number}` && t.status !== "paid" ? { ...t, status: "cancelled" } : t)));
      if (s.paid && !["credit_card", "store_credit"].includes(s.method)) {
        setTransactions((t) => [{ id: newId("trx"), direction: "out", amount: s.total, method: s.method, description: `Estorno — cancelamento da venda nº ${s.number}`, at: nowIso() }, ...t]);
      }
      if (refundCash) {
        setCash((c) => ({ ...c, movements: [...c.movements, { id: newId("cx"), type: "refund", amount: -s.total, description: `Estorno venda nº ${s.number}`, at: nowIso() }] }));
      }
      log("sale.cancelled", `Venda nº ${s.number}: ${reason}`);
    },

    settleTitle(id) {
      require("finance.manage");
      const t = titles.find((x) => x.id === id)!;
      if (t.status !== "open" && t.status !== "partially_paid") throw new BusinessError("Título não pode receber baixa.");
      const remaining = round2(t.amount - t.paid);
      setTitles((ts) => ts.map((x) => (x.id === id ? { ...x, paid: x.amount, status: "paid" } : x)));
      setTransactions((tr) => [
        { id: newId("trx"), direction: t.kind === "receivable" ? "in" : "out", amount: remaining, method: "pix", description: `Baixa: ${t.description}`, at: nowIso() },
        ...tr,
      ]);
      log("finance.settled", `${t.description}: ${remaining.toFixed(2)}`);
    },

    openCash(amount) {
      require("cash.operate");
      if (cash.status === "open") throw new BusinessError("Já existe um caixa aberto.");
      if (!(amount >= 0)) throw new BusinessError("Valor de abertura inválido.");
      setCash({ number: cash.number + 1, status: "open", openedAt: nowIso(), operator: user.name,
        movements: [{ id: newId("cx"), type: "opening", amount, description: "Abertura de caixa", at: nowIso() }] });
      log("cash.opened", `Caixa nº ${cash.number + 1} aberto`);
    },

    closeCash(declared) {
      require("cash.operate");
      if (cash.status !== "open") throw new BusinessError("O caixa já está fechado.");
      const expected = round2(cash.movements.reduce((a, m) => a + m.amount, 0));
      setCash((c) => ({ ...c, status: "closed", declared, expected }));
      log("cash.closed", `Caixa nº ${cash.number}: esperado ${expected.toFixed(2)}, declarado ${declared.toFixed(2)}`);
      return { expected, difference: round2(declared - expected) };
    },

    cashMovement(type, amount, description) {
      require("cash.operate");
      if (cash.status !== "open") throw new BusinessError("O caixa está fechado.");
      if (!(amount > 0)) throw new BusinessError("Valor inválido.");
      if (description.trim().length < 3) throw new BusinessError("Informe a descrição.");
      const balance = cash.movements.reduce((a, m) => a + m.amount, 0);
      if (type === "withdrawal" && amount > balance) throw new BusinessError(`Saldo em dinheiro insuficiente no caixa (disponível: ${balance.toFixed(2)}).`);
      setCash((c) => ({ ...c, movements: [...c.movements, { id: newId("cx"), type, amount: type === "withdrawal" ? -amount : amount, description, at: nowIso() }] }));
      log(`cash.${type}`, `${description}: ${amount.toFixed(2)}`);
    },
  };

  return <Ctx.Provider value={store}>{children}</Ctx.Provider>;
}

export function useStore() {
  const s = useContext(Ctx);
  if (!s) throw new Error("StoreProvider ausente");
  return s;
}
