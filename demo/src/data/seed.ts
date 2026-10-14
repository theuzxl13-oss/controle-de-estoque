/**
 * Dados FICTÍCIOS de uma revenda de gás e água, gerados de forma
 * determinística a partir da data atual. Nenhuma pessoa, empresa ou marca
 * real é representada.
 */
import type {
  AuditEntry,
  CashSession,
  Customer,
  FinancialTitle,
  Movement,
  Product,
  PurchaseOrder,
  Sale,
  SaleItem,
  SaleMode,
  Supplier,
  Transaction,
  User,
} from "./types";
import type { PaymentMethod } from "@erp/domain/sale";

export const COMPANY = {
  legalName: "Gás Exemplo Comércio de GLP Ltda",
  tradeName: "Gás Exemplo (demonstração)",
  document: "11.222.333/0001-81",
  stateRegistration: "123.456.789.110",
  address: "Av. das Amostras, 500 — Vila Nova — São Paulo/SP — 01001-000",
  phone: "(11) 3000-0000",
  email: "pedidos@gasexemplo.com.br",
  maxSellerDiscount: 5,
  deliveryFee: 0,
};

export const DRIVERS = ["Marcos (moto 1)", "Tiago (moto 2)", "Sérgio (caminhonete)"];

function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}
const rand = rng(20261015);
const pick = <T,>(arr: readonly T[]) => arr[Math.floor(rand() * arr.length)];
const round2 = (n: number) => Math.round(n * 100) / 100;

export const today = new Date();
today.setHours(12, 0, 0, 0);
export function daysAgo(n: number, hour = 12, minute = 0) {
  const d = new Date(today);
  d.setDate(d.getDate() - n);
  d.setHours(hour, minute, 0, 0);
  return d.toISOString();
}
const isoDate = (n: number) => daysAgo(n).slice(0, 10);

/** Gera CNPJ fictício com dígitos verificadores válidos (para testes). */
function fakeCnpj(base12: string) {
  const all = [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
  let doc = base12;
  for (let d = 1; d <= 2; d++) {
    const w = all.slice(d === 1 ? 1 : 0);
    const sum = [...doc].reduce((acc, ch, i) => acc + (ch.charCodeAt(0) - 48) * w[i], 0);
    doc += String(sum % 11 < 2 ? 0 : 11 - (sum % 11));
  }
  return doc.replace(/^(.{2})(.{3})(.{3})(.{4})(.{2})$/, "$1.$2.$3/$4-$5");
}

export const users: User[] = [
  { id: "u1", name: "Ana Administradora", email: "ana@gasexemplo.com.br", role: "admin", active: true },
  { id: "u2", name: "Bruno Gerente", email: "bruno@gasexemplo.com.br", role: "manager", active: true },
  { id: "u3", name: "Carla Atendente", email: "carla@gasexemplo.com.br", role: "seller", active: true },
  { id: "u5", name: "Eva Estoquista", email: "eva@gasexemplo.com.br", role: "stockist", active: true },
];

export const suppliers: Supplier[] = [
  [fakeCnpj("907020010001"), "Distribuidora de GLP Alfa Ltda", "GLP Alfa", "Roberto", "Barueri", "SP", 1, "Boleto 14 dias"],
  [fakeCnpj("907020020001"), "Beta Gás Distribuidora S.A.", "Beta Gás", "Juliana", "Paulínia", "SP", 2, "Boleto 21 dias"],
  [fakeCnpj("907020030001"), "Águas Serra Azul Ltda", "Serra Azul", "Felipe", "Atibaia", "SP", 2, "À vista"],
  [fakeCnpj("907020040001"), "Comercial de Acessórios Gama Ltda", "Gama Acessórios", "Patrícia", "São Paulo", "SP", 5, "28 dias"],
].map(([document, legalName, tradeName, representative, city, state, leadDays, paymentTerms], i) => ({
  id: `sup-${i + 1}`,
  document: document as string,
  legalName: legalName as string,
  tradeName: tradeName as string,
  stateRegistration: "",
  representative: representative as string,
  phone: `(11) 4000-${1000 + i * 37}`,
  whatsapp: `(11) 98${100 + i * 7}-${2000 + i * 71}`,
  email: `pedidos@${(tradeName as string).toLowerCase().replace(/[^a-z]/g, "")}.com.br`,
  city: city as string,
  state: state as string,
  leadDays: leadDays as number,
  paymentTerms: paymentTerms as string,
  notes: "",
}));

const GLP_NCM = "27111910";
const GLP_ANP = "210203001";

type Def = [Product["kind"], string, string, boolean, number, number, number, number, number, number, number, number, string, string];
// tipo, nome, capacidade, retornável, troca, completo, custo, custo vasilhame, cheios, vazios, mínimo, fornecedor(idx), NCM, ANP
const defs: Def[] = [
  ["gas", "Gás P13 (botijão de cozinha)", "13 kg", true, 115, 335, 88, 210, 46, 58, 30, 0, GLP_NCM, GLP_ANP],
  ["gas", "Gás P45 (cilindro)", "45 kg", true, 435, 1090, 345, 640, 7, 11, 6, 0, GLP_NCM, GLP_ANP],
  ["gas", "Gás P20 (empilhadeira)", "20 kg", true, 215, 590, 168, 360, 4, 6, 3, 1, GLP_NCM, GLP_ANP],
  ["gas", "Gás P5 (camping)", "5 kg", true, 58, 189, 41, 125, 9, 4, 4, 1, GLP_NCM, GLP_ANP],
  ["gas", "Gás P2 (fogareiro)", "2 kg", true, 38, 125, 26, 82, 3, 5, 4, 1, GLP_NCM, GLP_ANP],
  ["agua", "Água mineral galão", "20 L", true, 14, 42, 7.5, 24, 34, 41, 20, 2, "22011000", ""],
  ["acessorio", "Regulador de gás (registro)", "un", false, 45, 0, 24, 0, 12, 0, 5, 3, "84818099", ""],
  ["acessorio", "Mangueira de gás 1,2 m", "un", false, 22, 0, 9.5, 0, 18, 0, 8, 3, "40093100", ""],
  ["acessorio", "Kit regulador + mangueira", "kit", false, 59, 0, 31, 0, 6, 0, 4, 3, "84818099", ""],
  ["acessorio", "Abraçadeira", "un", false, 4, 0, 1.2, 0, 40, 0, 15, 3, "73269090", ""],
];

export const products: Product[] = defs.map(([kind, name, capacity, returnable, ex, full, cost, shell, cheios, vazios, min, , ncm, anp], i) => ({
  id: `prd-${i + 1}`,
  code: i + 1,
  kind,
  name,
  capacity,
  returnable,
  priceExchange: ex,
  priceFull: full,
  costExchange: cost,
  costShell: shell,
  stockFull: cheios,
  stockEmpty: vazios,
  minStock: min,
  active: true,
  barcode: "",
  ncm,
  anpCode: anp,
}));
export const productSupplier: Record<string, string> = Object.fromEntries(defs.map((d, i) => [`prd-${i + 1}`, `sup-${d[11] + 1}`]));

const first = ["Maria", "José", "Ana", "João", "Francisca", "Antônio", "Juliana", "Carlos", "Patrícia", "Paulo", "Aline", "Lucas",
  "Sandra", "Marcelo", "Fernanda", "Rafael", "Cláudia", "Eduardo", "Renata", "Fábio", "Luciana", "Ricardo", "Vanessa", "Rodrigo",
  "Simone", "André", "Débora", "Gustavo", "Tatiane", "Leandro", "Camila", "Diego"];
const last = ["Silva", "Santos", "Oliveira", "Souza", "Lima", "Pereira", "Ferreira", "Costa", "Rodrigues", "Almeida", "Nascimento", "Gomes"];
const streets = ["Rua das Acácias", "Rua dos Ipês", "Rua Projetada 3", "Av. Central", "Rua São Benedito", "Rua da Paz", "Travessa do Sol", "Rua das Palmeiras", "Rua Sete", "Rua Bela Vista"];
const districts = ["Vila Nova", "Jardim das Flores", "Centro", "Parque Industrial", "Jardim Primavera", "Vila Esperança"];
const references = ["Portão azul", "Ao lado da padaria", "Casa dos fundos", "Em frente à escola", "Sobrado amarelo", "Apto 12, interfone", ""];

interface Profile { customer: Customer; productIdx: number; interval: number; channel: "entrega" | "balcao"; method: PaymentMethod }

const profiles: Profile[] = first.map((f, i) => {
  const isBusiness = i % 11 === 5;
  const name = isBusiness ? `${pick(["Restaurante", "Lanchonete", "Pastelaria"])} ${f} (fictício)` : `${f} ${pick(last)} (fictício)`;
  return {
    customer: {
      id: `cli-${i + 1}`,
      name,
      phone: `(11) 9${(7000 + i * 113).toString().slice(0, 4)}-${(1000 + i * 271).toString().slice(0, 4)}`,
      document: "",
      street: pick(streets),
      number: String(10 + Math.floor(rand() * 900)),
      district: pick(districts),
      reference: pick(references),
      notes: isBusiness ? "Cliente comercial — entrega pela manhã." : "",
      createdAt: daysAgo(200 - i * 5),
    },
    productIdx: isBusiness ? 1 : i % 9 === 3 ? 5 : 0,
    interval: isBusiness ? 6 + Math.floor(rand() * 3) : i % 9 === 3 ? 10 + Math.floor(rand() * 6) : 28 + Math.floor(rand() * 22),
    channel: rand() < 0.8 ? "entrega" : "balcao",
    method: pick(["cash", "cash", "pix", "pix", "pix", "debit_card", "credit_card"] as const),
  };
});
export const customers: Customer[] = profiles.map((p) => p.customer);

export const sales: Sale[] = [];
let saleNumber = 0;

function makeSale(at: string, items: { idx: number; mode: SaleMode; qty: number }[], opts: { customer?: Profile; channel: "balcao" | "entrega"; method: PaymentMethod; seller?: string; deliveredMinutes?: number | null; driver?: string }) {
  const saleItems: SaleItem[] = items.map(({ idx, mode, qty }) => {
    const p = products[idx];
    const unitPrice = mode === "completo" ? p.priceFull : p.priceExchange;
    const unitCost = mode === "completo" ? p.costExchange + p.costShell : p.costExchange;
    return { productId: p.id, name: p.name, mode, quantity: qty, unitPrice, total: round2(unitPrice * qty), unitCost };
  });
  const subtotal = round2(saleItems.reduce((a, i) => a + i.total, 0));
  saleNumber++;
  const c = opts.customer?.customer;
  const delivered = opts.deliveredMinutes;
  const sale: Sale = {
    id: `ven-${saleNumber}`,
    number: saleNumber,
    customerId: c?.id ?? null,
    seller: opts.seller ?? pick(["Carla Atendente", "Bruno Gerente"]),
    at,
    channel: opts.channel,
    items: saleItems,
    deliveryFee: 0,
    subtotal,
    discount: 0,
    total: subtotal,
    method: opts.method,
    paid: opts.channel === "balcao" || delivered !== null,
    status: "completed",
  };
  if (opts.channel === "entrega" && c) {
    const dispatched = new Date(new Date(at).getTime() + 8 * 60000).toISOString();
    sale.delivery = {
      status: delivered === null ? (opts.driver ? "em_rota" : "pendente") : "entregue",
      address: `${c.street}, ${c.number} — ${c.district}`,
      reference: c.reference,
      driver: opts.driver ?? (delivered === null ? null : pick(DRIVERS)),
      changeFor: opts.method === "cash" ? Math.ceil((subtotal + 1) / 50) * 50 : undefined,
      dispatchedAt: delivered === null && !opts.driver ? undefined : dispatched,
      deliveredAt: delivered === null || delivered === undefined ? undefined : new Date(new Date(at).getTime() + delivered * 60000).toISOString(),
    };
    if (sale.delivery.status === "entregue" && !sale.delivery.driver) sale.delivery.driver = pick(DRIVERS);
  }
  sales.push(sale);
  return sale;
}

// Compras recorrentes dos clientes nos últimos 120 dias
const events: { at: string; run: () => void }[] = [];
for (const p of profiles) {
  let d = 120 - Math.floor(rand() * p.interval);
  while (d > 0) {
    const day = d;
    const hour = 8 + Math.floor(rand() * 10);
    const at = daysAgo(day, hour, Math.floor(rand() * 60));
    events.push({
      at,
      run: () =>
        makeSale(at, [{ idx: p.productIdx, mode: "troca", qty: p.productIdx === 1 ? 2 : p.productIdx === 5 ? 2 : 1 }], {
          customer: p, channel: p.channel, method: p.method, deliveredMinutes: 20 + Math.floor(rand() * 40),
        }),
    });
    d -= p.interval + Math.floor(rand() * 7) - 3;
  }
}
// Vendas de balcão avulsas (consumidor não identificado)
for (let d = 89; d >= 1; d--) {
  const n = 1 + Math.floor(rand() * 4);
  for (let k = 0; k < n; k++) {
    const at = daysAgo(d, 8 + Math.floor(rand() * 10), Math.floor(rand() * 60));
    const r = rand();
    const items =
      r < 0.5 ? [{ idx: 0, mode: (rand() < 0.12 ? "completo" : "troca") as SaleMode, qty: 1 }]
        : r < 0.7 ? [{ idx: 5, mode: "troca" as SaleMode, qty: 1 + Math.floor(rand() * 2) }]
        : r < 0.8 ? [{ idx: 3 + Math.floor(rand() * 2), mode: "troca" as SaleMode, qty: 1 }]
        : [{ idx: 6 + Math.floor(rand() * 4), mode: "unidade" as SaleMode, qty: 1 }];
    events.push({ at, run: () => makeSale(at, items, { channel: "balcao", method: pick(["cash", "pix", "pix", "debit_card", "credit_card"] as const) }) });
  }
}
events.sort((a, b) => a.at.localeCompare(b.at)).forEach((e) => e.run());

// Hoje: vendas concluídas, entregas em rota e pendentes
const now = new Date();
const hNow = Math.max(9, Math.min(now.getHours(), 18));
const todayAt = (h: number, m: number) => {
  const d = new Date(today);
  d.setHours(Math.min(h, hNow), m, 0, 0);
  const limit = Date.now() - 60 * 60000;
  return (d.getTime() > limit ? new Date(limit) : d).toISOString();
};
makeSale(todayAt(8, 12), [{ idx: 0, mode: "troca", qty: 1 }], { customer: profiles[2], channel: "entrega", method: "pix", deliveredMinutes: 31 });
makeSale(todayAt(8, 40), [{ idx: 0, mode: "troca", qty: 1 }, { idx: 7, mode: "unidade", qty: 1 }], { channel: "balcao", method: "cash" });
makeSale(todayAt(9, 5), [{ idx: 1, mode: "troca", qty: 2 }], { customer: profiles[5], channel: "entrega", method: "pix", deliveredMinutes: 44 });
makeSale(todayAt(9, 30), [{ idx: 5, mode: "troca", qty: 2 }], { customer: profiles[12], channel: "entrega", method: "cash", deliveredMinutes: 25 });
makeSale(todayAt(10, 2), [{ idx: 0, mode: "completo", qty: 1 }, { idx: 8, mode: "unidade", qty: 1 }], { channel: "balcao", method: "credit_card" });
const minutesAgo = (m: number) => new Date(Date.now() - m * 60000).toISOString();
makeSale(minutesAgo(38), [{ idx: 0, mode: "troca", qty: 1 }], { customer: profiles[18], channel: "entrega", method: "cash", deliveredMinutes: null, driver: DRIVERS[0] });
makeSale(minutesAgo(14), [{ idx: 0, mode: "troca", qty: 1 }], { customer: profiles[21], channel: "entrega", method: "pix", deliveredMinutes: null });
makeSale(minutesAgo(6), [{ idx: 5, mode: "troca", qty: 3 }], { customer: profiles[26], channel: "entrega", method: "cash", deliveredMinutes: null });

// Algumas vendas antigas canceladas
for (const s of sales) if (s.number % 97 === 13 && s.at < daysAgo(5)) {
  s.status = "cancelled";
  s.cancelReason = "Cliente desistiu do pedido";
}

export const movements: Movement[] = [];
let mv = 0;
for (const s of sales.filter((x) => x.at >= daysAgo(7) && x.status === "completed")) {
  for (const it of s.items) {
    movements.push({ id: `mov-${++mv}`, productId: it.productId, bucket: "cheio", type: "sale", quantity: -it.quantity, reason: `Venda nº ${s.number}`, reference: `Venda ${s.number}`, user: s.seller, at: s.at });
    if (it.mode === "troca" && (s.channel === "balcao" || s.delivery?.status === "entregue")) {
      movements.push({ id: `mov-${++mv}`, productId: it.productId, bucket: "vazio", type: "shell_in", quantity: it.quantity, reason: `Vasilhame recebido — venda nº ${s.number}`, reference: `Venda ${s.number}`, user: s.seller, at: s.delivery?.deliveredAt ?? s.at });
    }
  }
}

export const purchaseOrders: PurchaseOrder[] = [
  { n: 1, sup: 0, status: "received", issue: 9, exp: 8, items: [[0, 80, 88, 80], [1, 10, 345, 10]] },
  { n: 2, sup: 2, status: "received", issue: 6, exp: 5, items: [[5, 60, 7.5, 60]] },
  { n: 3, sup: 0, status: "partially_received", issue: 3, exp: 2, items: [[0, 80, 88, 50], [2, 6, 168, 6]] },
  { n: 4, sup: 3, status: "confirmed", issue: 2, exp: -3, items: [[6, 12, 24, 0], [7, 20, 9.5, 0], [9, 50, 1.2, 0]] },
  { n: 5, sup: 1, status: "draft", issue: 0, exp: -1, items: [[0, 60, 87, 0], [3, 10, 41, 0]] },
].map((o) => ({
  id: `ped-${o.n}`,
  number: o.n,
  supplierId: suppliers[o.sup].id,
  status: o.status as PurchaseOrder["status"],
  issueDate: isoDate(o.issue),
  expectedDate: isoDate(o.exp),
  paymentMethod: "Boleto",
  paymentTerms: suppliers[o.sup].paymentTerms,
  dueDays: 14,
  discount: 0,
  freight: 0,
  notes: o.n === 3 ? "Restante do P13 na próxima carga." : "",
  items: o.items.map(([pi, q, price, rec]) => ({ productId: products[pi].id, quantity: q, unitPrice: price, received: rec })),
}));
for (const o of purchaseOrders.filter((x) => x.items.some((i) => i.received > 0))) {
  for (const i of o.items.filter((x) => x.received > 0)) {
    const at = daysAgo(o.number === 3 ? 2 : o.number === 2 ? 5 : 8, 7, 30);
    movements.push({ id: `mov-${++mv}`, productId: i.productId, bucket: "cheio", type: "purchase_receipt", quantity: i.received, reason: `Carga do pedido nº ${o.number}`, reference: `Pedido ${o.number}`, user: "Eva Estoquista", at });
    if (products.find((p) => p.id === i.productId)?.returnable) {
      movements.push({ id: `mov-${++mv}`, productId: i.productId, bucket: "vazio", type: "shell_return", quantity: -i.received, reason: `Vazios devolvidos à distribuidora — pedido nº ${o.number}`, reference: `Pedido ${o.number}`, user: "Eva Estoquista", at });
    }
  }
}
movements.push({ id: `mov-${++mv}`, productId: products[0].id, bucket: "vazio", type: "manual_exit", quantity: -1, reason: "Botijão vazio condenado (amassado) — descarte", reference: "Manual", user: "Bruno Gerente", at: daysAgo(1, 16) });
movements.sort((a, b) => b.at.localeCompare(a.at));

const received = (o: PurchaseOrder) => round2(o.items.reduce((s, i) => s + i.received * i.unitPrice, 0));
const receivedOrders = purchaseOrders.filter((o) => o.items.some((i) => i.received > 0));

export const titles: FinancialTitle[] = [
  ...receivedOrders.map((o, i) => ({
    id: `tit-p-${o.number}`,
    kind: "payable" as const,
    description: `Pedido de compra nº ${o.number} — carga recebida`,
    party: suppliers.find((s) => s.id === o.supplierId)!.tradeName,
    amount: received(o),
    paid: i === 1 ? received(o) : 0,
    dueDate: isoDate(i === 0 ? -5 : i === 1 ? 5 : -12),
    status: (i === 1 ? "paid" : "open") as FinancialTitle["status"],
    source: `Pedido ${o.number}`,
  })),
  { id: "tit-x-1", kind: "payable", description: "Aluguel do depósito", party: "Imobiliária Exemplo", amount: 2800, paid: 0, dueDate: isoDate(-4), status: "open", source: "Manual" },
  { id: "tit-x-2", kind: "payable", description: "Combustível das motos", party: "Posto Exemplo", amount: 640, paid: 0, dueDate: isoDate(1), status: "open", source: "Manual" },
  ...sales
    .filter((s) => s.status === "completed" && s.method === "credit_card" && s.at > daysAgo(30))
    .slice(-10)
    .map((s) => ({
      id: `tit-r-${s.number}`,
      kind: "receivable" as const,
      description: `Venda nº ${s.number} — cartão de crédito`,
      party: "Adquirente do cartão",
      amount: s.total,
      paid: 0,
      dueDate: new Date(new Date(s.at).getTime() + 30 * 86400000).toISOString().slice(0, 10),
      status: "open" as const,
      source: `Venda ${s.number}`,
    })),
  {
    id: "tit-r-fiado-1", kind: "receivable", description: "Venda nº 41 — fiado", party: customers[5].name,
    amount: 870, paid: 0, dueDate: isoDate(3), status: "open", source: "Venda 41",
  },
];

export const transactions: Transaction[] = [
  ...sales
    .filter((s) => s.status === "completed" && s.paid && !["credit_card", "store_credit"].includes(s.method))
    .map((s) => ({
      id: `trx-${s.number}`,
      direction: "in" as const,
      amount: s.total,
      method: s.method,
      description: `Venda nº ${s.number}`,
      at: s.delivery?.deliveredAt ?? s.at,
    })),
  ...[
    [28, 2800, "Aluguel do depósito"],
    [20, 610, "Combustível das motos"],
    [14, 7040, "Pedido de compra nº anterior — GLP Alfa"],
    [10, 450, "Manutenção da caminhonete"],
    [5, 2100, "Salários entregadores (adiantamento)"],
  ].map(([d, amount, description], i) => ({
    id: `trx-o-${i}`,
    direction: "out" as const,
    amount: amount as number,
    method: "pix" as const,
    description: description as string,
    at: daysAgo(d as number, 11),
  })),
].sort((a, b) => b.at.localeCompare(a.at));

const todayKey = today.toISOString().slice(0, 10);
export const cash: CashSession = {
  number: 212,
  status: "open",
  openedAt: daysAgo(0, 7, 50),
  operator: "Carla Atendente",
  movements: [
    { id: "cx-0", type: "opening", amount: 200, description: "Abertura de caixa (fundo de troco)", at: daysAgo(0, 7, 50) },
    ...sales
      .filter((s) => s.method === "cash" && s.paid && (s.delivery?.deliveredAt ?? s.at).slice(0, 10) === todayKey)
      .map((s) => ({ id: `cx-${s.number}`, type: "sale" as const, amount: s.total, description: `Venda nº ${s.number}`, at: s.delivery?.deliveredAt ?? s.at })),
  ],
};

export const audit: AuditEntry[] = [
  { id: "a1", at: daysAgo(0, 7, 50), user: "Carla Atendente", action: "cash.opened", detail: "Caixa nº 212 aberto com R$ 200,00" },
  { id: "a2", at: daysAgo(1, 16), user: "Bruno Gerente", action: "stock.manual_exit", detail: "P13 vazio: −1 (vasilhame condenado)" },
  { id: "a3", at: daysAgo(2, 7, 30), user: "Eva Estoquista", action: "purchase.received", detail: "Carga parcial do pedido nº 3 (50 P13)" },
  { id: "a4", at: daysAgo(6, 9), user: "Ana Administradora", action: "update", detail: "Preço de troca do P13: 110,00 → 115,00" },
];
