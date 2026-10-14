/**
 * Estado da demonstração (somente em memória — recarregar a página restaura
 * os dados iniciais). As regras replicam as funções do banco real:
 * finalize_sale, cancel_sale, receive_purchase, register_stock_movement.
 * Os cálculos de venda usam o MESMO módulo do sistema (@erp/domain/sale).
 */
import { createContext, useCallback, useContext, useState, type ReactNode } from "react";

import { ROLE_PERMISSIONS, type Permission, type Role } from "@erp/auth/permissions";
import { fromCents, toCents } from "@erp/domain/money";
import { computeSaleTotals, splitInstallments, summarizePayments } from "@erp/domain/sale";

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
  SalePayment,
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
  quantity: number;
  discount: number;
}

interface Store {
  user: User;
  setUserId: (id: string) => void;
  can: (p: Permission) => boolean;
  allowNegativeStock: boolean;
  setAllowNegativeStock: (v: boolean) => void;
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
  saveProduct: (p: Omit<Product, "id" | "code" | "stock"> & { id?: string; initialStock?: number }) => void;
  saveCustomer: (c: Omit<Customer, "id" | "createdAt"> & { id?: string }) => Customer;
  saveSupplier: (s: Omit<Supplier, "id"> & { id?: string }) => void;
  moveStock: (productId: string, type: "manual_entry" | "manual_exit" | "adjustment", quantity: number, reason: string) => void;
  savePurchaseOrder: (o: Omit<PurchaseOrder, "id" | "number" | "status"> & { id?: string }) => PurchaseOrder;
  setPurchaseStatus: (id: string, status: PurchaseStatus) => void;
  receivePurchase: (id: string, quantities: Record<string, number>, invoice: string) => void;
  finalizeSale: (args: {
    lines: CartLine[];
    generalDiscount: number;
    payments: SalePayment[];
    customerId: string | null;
  }) => Sale;
  cancelSale: (id: string, reason: string) => void;
  settleTitle: (id: string) => void;
  openCash: (amount: number) => void;
  closeCash: (declared: number) => { expected: number; difference: number };
  cashMovement: (type: "supply" | "withdrawal", amount: number, description: string) => void;
}

const Ctx = createContext<Store | null>(null);

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

  /** Aplica movimentações com a mesma regra de estoque negativo do banco. */
  const applyMovements = (
    current: Product[],
    entries: { productId: string; quantity: number; type: MovementType; reason: string; reference: string }[],
  ) => {
    const next = current.map((p) => ({ ...p }));
    const created: Movement[] = [];
    for (const e of entries) {
      const p = next.find((x) => x.id === e.productId);
      if (!p) throw new BusinessError("Produto não encontrado.");
      const after = round3(p.stock + e.quantity);
      if (e.quantity < 0 && after < 0 && !allowNegativeStock) {
        throw new BusinessError(`Estoque insuficiente para "${p.name}": disponível ${p.stock}, solicitado ${-e.quantity}.`);
      }
      created.push({
        id: newId("mov"),
        productId: p.id,
        type: e.type,
        quantity: e.quantity,
        before: p.stock,
        after,
        reason: e.reason,
        reference: e.reference,
        user: user.name,
        at: nowIso(),
      });
      p.stock = after;
    }
    return { next, created };
  };

  const store: Store = {
    user,
    setUserId,
    can,
    allowNegativeStock,
    setAllowNegativeStock,
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
      if (input.barcode && products.some((p) => p.barcode === input.barcode && p.id !== input.id)) {
        throw new BusinessError("Já existe um produto com este código de barras.");
      }
      if (input.id) {
        setProducts((ps) => ps.map((p) => (p.id === input.id ? { ...p, ...input, stock: p.stock, code: p.code } : p)));
        log("update", `Produto alterado: ${input.name}`);
        return;
      }
      const id = newId("prd");
      const code = Math.max(0, ...products.map((p) => p.code)) + 1;
      const created: Product = { ...input, id, code, stock: 0 };
      let list = [...products, created];
      if (input.initialStock && input.initialStock > 0) {
        const r = applyMovements(list, [
          { productId: id, quantity: input.initialStock, type: "manual_entry", reason: "Saldo inicial", reference: "Cadastro" },
        ]);
        list = r.next;
        setMovements((m) => [...r.created, ...m]);
      }
      setProducts(list);
      log("insert", `Produto cadastrado: ${input.name} (código ${code})`);
    },

    saveCustomer(input) {
      require("customers.manage");
      if (input.document && customers.some((c) => c.document === input.document && c.id !== input.id)) {
        throw new BusinessError("Já existe um cliente com este CPF/CNPJ.");
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

    moveStock(productId, type, quantity, reason) {
      require(type === "adjustment" ? "stock.adjust" : "stock.move");
      if (reason.trim().length < 3) throw new BusinessError("Informe o motivo da movimentação.");
      if (!(quantity >= 0) || (type !== "adjustment" && quantity === 0)) throw new BusinessError("Quantidade inválida.");
      const p = products.find((x) => x.id === productId)!;
      const delta = type === "adjustment" ? round3(quantity - p.stock) : type === "manual_entry" ? quantity : -quantity;
      if (delta === 0) throw new BusinessError("O saldo informado é igual ao saldo atual.");
      const r = applyMovements(products, [{ productId, quantity: delta, type, reason, reference: "Manual" }]);
      setProducts(r.next);
      setMovements((m) => [...r.created, ...m]);
      log(`stock.${type}`, `${p.name}: ${delta > 0 ? "+" : ""}${delta} (${reason})`);
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
      const created: PurchaseOrder = {
        ...input,
        id: newId("ped"),
        number: Math.max(0, ...purchaseOrders.map((o) => o.number)) + 1,
        status: "draft",
      };
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
      if (!allowed[o.status].includes(status)) {
        throw new BusinessError(`Transição de status inválida: ${o.status} → ${status}.`);
      }
      setPurchaseOrders((os) => os.map((x) => (x.id === id ? { ...x, status } : x)));
      log("update", `Pedido nº ${o.number}: ${o.status} → ${status}`);
    },

    receivePurchase(id, quantities, invoice) {
      require("purchases.receive");
      const o = purchaseOrders.find((x) => x.id === id)!;
      if (!["sent", "confirmed", "partially_received"].includes(o.status)) {
        throw new BusinessError(`Pedido com status "${o.status}" não pode receber mercadorias.`);
      }
      const entries = o.items
        .map((it) => ({ it, q: round3(quantities[it.productId] ?? 0) }))
        .filter((x) => x.q > 0);
      if (entries.length === 0) throw new BusinessError("Informe ao menos uma quantidade recebida.");
      for (const { it, q } of entries) {
        if (q > it.quantity - it.received) {
          throw new BusinessError(`Quantidade recebida (${q}) excede o saldo pendente (${it.quantity - it.received}).`);
        }
      }
      const goodsBefore = o.items.reduce((s, i) => s + round2(i.received * i.unitPrice), 0);
      const items = o.items.map((it) => {
        const e = entries.find((x) => x.it.productId === it.productId);
        return e ? { ...it, received: round3(it.received + e.q) } : it;
      });
      const goodsAfter = items.reduce((s, i) => s + round2(i.received * i.unitPrice), 0);
      const all = items.every((i) => i.received === i.quantity);
      const subtotal = items.reduce((s, i) => s + round2(i.quantity * i.unitPrice), 0);
      const extra = o.freight - o.discount;
      const alloc = subtotal > 0 ? round2((goodsAfter / subtotal) * extra) - round2((goodsBefore / subtotal) * extra) : 0;
      const amount = round2(goodsAfter - goodsBefore + alloc);

      // Custo médio ponderado + entrada no estoque
      const withCost = products.map((p) => {
        const e = entries.find((x) => x.it.productId === p.id);
        if (!e) return p;
        const base = Math.max(p.stock, 0);
        return { ...p, cost: Math.round(((base * p.cost + e.q * e.it.unitPrice) / (base + e.q)) * 10000) / 10000 };
      });
      const r = applyMovements(
        withCost,
        entries.map(({ it, q }) => ({
          productId: it.productId,
          quantity: q,
          type: "purchase_receipt" as const,
          reason: `Recebimento do pedido nº ${o.number}${invoice ? ` (NF ${invoice})` : ""}`,
          reference: `Pedido ${o.number}`,
        })),
      );
      setProducts(r.next);
      setMovements((m) => [...r.created, ...m]);
      setPurchaseOrders((os) =>
        os.map((x) => (x.id === id ? { ...x, items, status: all ? "received" : "partially_received" } : x)),
      );
      if (amount > 0) {
        const supplier = suppliers.find((s) => s.id === o.supplierId)!;
        const due = new Date();
        due.setDate(due.getDate() + o.dueDays);
        setTitles((t) => [
          {
            id: newId("tit"),
            kind: "payable",
            description: `Pedido de compra nº ${o.number} — recebimento`,
            party: supplier.tradeName || supplier.legalName,
            amount,
            paid: 0,
            dueDate: due.toISOString().slice(0, 10),
            status: "open",
            source: `Pedido ${o.number}`,
          },
          ...t,
        ]);
      }
      log("purchase.received", `Pedido nº ${o.number}: ${all ? "recebido" : "recebimento parcial"}`);
    },

    finalizeSale({ lines, generalDiscount, payments, customerId }) {
      require("sales.create");
      if (cash.status !== "open") throw new BusinessError("Abra o caixa antes de vender.");
      const prods = lines.map((l) => {
        const p = products.find((x) => x.id === l.productId);
        if (!p || !p.active) throw new BusinessError("Produto inválido ou inativo.");
        return p;
      });
      const totals = computeSaleTotals(
        lines.map((l, i) => ({ quantity: l.quantity, unitPrice: prods[i].price, discount: l.discount })),
        generalDiscount,
      );
      if (totals.discountTotalCents > 0) {
        require("sales.discount");
        if (totals.discountPercent > seed.COMPANY.maxSellerDiscount && !can("sales.discount_unlimited")) {
          throw new BusinessError(
            `Desconto acima do limite permitido (${seed.COMPANY.maxSellerDiscount}%). Solicite autorização de um gerente.`,
          );
        }
      }
      const summary = summarizePayments(
        totals.totalCents,
        payments.map((p) => ({ method: p.method, amount: p.amount, tenderedAmount: p.tendered, installments: p.installments })),
        { hasCustomer: customerId !== null },
      );
      if (!summary.isComplete) {
        throw new BusinessError(
          `A soma dos pagamentos (${fromCents(summary.paidCents).toFixed(2)}) difere do total (${fromCents(totals.totalCents).toFixed(2)}).`,
        );
      }

      const number = Math.max(0, ...sales.map((s) => s.number)) + 1;
      const saleId = newId("ven");
      const r = applyMovements(
        products,
        lines.map((l) => ({
          productId: l.productId,
          quantity: -l.quantity,
          type: "sale" as const,
          reason: `Venda nº ${number}`,
          reference: `Venda ${number}`,
        })),
      );
      const sale: Sale = {
        id: saleId,
        number,
        customerId,
        seller: user.name,
        at: nowIso(),
        items: lines.map((l, i) => ({
          productId: l.productId,
          name: prods[i].name,
          unit: prods[i].unit,
          quantity: l.quantity,
          unitPrice: prods[i].price,
          discount: fromCents(totals.lines[i].discountCents),
          total: fromCents(totals.lines[i].totalCents),
          unitCost: prods[i].cost,
        })),
        subtotal: fromCents(totals.subtotalCents),
        discount: fromCents(totals.discountTotalCents),
        total: fromCents(totals.totalCents),
        change: fromCents(summary.changeCents),
        payments,
        status: "completed",
      };

      const newTrx: Transaction[] = [];
      const newTitles: FinancialTitle[] = [];
      const cashIn: CashSession["movements"] = [];
      const customer = customers.find((c) => c.id === customerId);
      for (const p of payments) {
        if (p.method === "credit_card") {
          newTitles.push({
            id: newId("tit"), kind: "receivable", description: `Venda nº ${number} — cartão de crédito`,
            party: "Adquirente do cartão", amount: p.amount, paid: 0,
            dueDate: new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10), status: "open", source: `Venda ${number}`,
          });
        } else if (p.method === "store_credit") {
          const n = p.installments ?? 1;
          splitInstallments(toCents(p.amount), n).forEach((c, i) =>
            newTitles.push({
              id: newId("tit"), kind: "receivable", description: `Venda nº ${number} — crediário ${i + 1}/${n}`,
              party: customer?.name ?? "", amount: fromCents(c), paid: 0,
              dueDate: new Date(Date.now() + 30 * (i + 1) * 86400000).toISOString().slice(0, 10), status: "open", source: `Venda ${number}`,
            }),
          );
        } else {
          newTrx.push({ id: newId("trx"), direction: "in", amount: p.amount, method: p.method, description: `Venda nº ${number}`, at: sale.at });
          if (p.method === "cash") {
            cashIn.push({ id: newId("cx"), type: "sale", amount: p.amount, description: `Venda nº ${number}`, at: sale.at });
          }
        }
      }

      setProducts(r.next);
      setMovements((m) => [...r.created, ...m]);
      setSales((s) => [...s, sale]);
      setTransactions((t) => [...newTrx, ...t]);
      setTitles((t) => [...newTitles, ...t]);
      setCash((c) => ({ ...c, movements: [...c.movements, ...cashIn] }));
      log("sale.finalized", `Venda nº ${number} — ${sale.total.toFixed(2)}`);
      return sale;
    },

    cancelSale(id, reason) {
      require("sales.cancel");
      const s = sales.find((x) => x.id === id)!;
      if (s.status !== "completed") throw new BusinessError("Somente vendas concluídas podem ser canceladas.");
      if (reason.trim().length < 5) throw new BusinessError("Informe o motivo do cancelamento (mínimo 5 caracteres).");
      const cashAmount = s.payments.filter((p) => p.method === "cash").reduce((a, p) => a + p.amount, 0);
      if (cashAmount > 0 && cash.status !== "open") throw new BusinessError("Abra um caixa para devolver o valor em dinheiro.");
      const r = applyMovements(
        products,
        s.items.map((it) => ({
          productId: it.productId, quantity: it.quantity, type: "sale_cancellation" as const,
          reason: `Cancelamento da venda nº ${s.number}`, reference: `Venda ${s.number}`,
        })),
      );
      setProducts(r.next);
      setMovements((m) => [...r.created, ...m]);
      setSales((ss) => ss.map((x) => (x.id === id ? { ...x, status: "cancelled", cancelReason: reason } : x)));
      setTitles((ts) => ts.map((t) => (t.source === `Venda ${s.number}` && t.status !== "paid" ? { ...t, status: "cancelled" } : t)));
      const received = s.payments.filter((p) => !["credit_card", "store_credit"].includes(p.method));
      setTransactions((t) => [
        ...received.map((p) => ({
          id: newId("trx"), direction: "out" as const, amount: p.amount, method: p.method,
          description: `Estorno — cancelamento da venda nº ${s.number}`, at: nowIso(),
        })),
        ...t,
      ]);
      if (cashAmount > 0) {
        setCash((c) => ({
          ...c,
          movements: [...c.movements, { id: newId("cx"), type: "refund", amount: -cashAmount, description: `Estorno venda nº ${s.number}`, at: nowIso() }],
        }));
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
        {
          id: newId("trx"), direction: t.kind === "receivable" ? "in" : "out", amount: remaining, method: "pix",
          description: `Baixa: ${t.description}`, at: nowIso(),
        },
        ...tr,
      ]);
      log("finance.settled", `${t.description}: ${remaining.toFixed(2)}`);
    },

    openCash(amount) {
      require("cash.operate");
      if (cash.status === "open") throw new BusinessError("Você já possui um caixa aberto.");
      if (!(amount >= 0)) throw new BusinessError("Valor de abertura inválido.");
      setCash({
        number: cash.number + 1, status: "open", openedAt: nowIso(), operator: user.name,
        movements: [{ id: newId("cx"), type: "opening", amount, description: "Abertura de caixa", at: nowIso() }],
      });
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
      if (type === "withdrawal" && amount > balance) {
        throw new BusinessError(`Saldo em dinheiro insuficiente no caixa (disponível: ${balance.toFixed(2)}).`);
      }
      setCash((c) => ({
        ...c,
        movements: [...c.movements, { id: newId("cx"), type, amount: type === "withdrawal" ? -amount : amount, description, at: nowIso() }],
      }));
      log(`cash.${type}`, `${description}: ${amount.toFixed(2)}`);
    },
  };

  return <Ctx.Provider value={store}>{children}</Ctx.Provider>;
}

function round3(n: number) {
  return Math.round(n * 1000) / 1000;
}

export function useStore() {
  const s = useContext(Ctx);
  if (!s) throw new Error("StoreProvider ausente");
  return s;
}
