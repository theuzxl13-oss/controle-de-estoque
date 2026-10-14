/**
 * Dados FICTÍCIOS para a demonstração. Gerados de forma determinística (mesma
 * semente → mesmos dados) a partir da data atual, para que o painel tenha
 * histórico recente. Nenhuma pessoa ou empresa real é representada.
 */
import { computeSaleTotals } from "@erp/domain/sale";
import { fromCents } from "@erp/domain/money";

import type {
  AuditEntry,
  CashSession,
  Customer,
  FinancialTitle,
  Movement,
  Product,
  PurchaseOrder,
  Sale,
  Supplier,
  Transaction,
  User,
} from "./types";

export const COMPANY = {
  legalName: "Comercial Exemplo Ltda",
  tradeName: "Loja Exemplo (demonstração)",
  document: "11.222.333/0001-81",
  stateRegistration: "123.456.789.110",
  address: "Rua das Amostras, 100 — Centro — São Paulo/SP — 01001-000",
  phone: "(11) 3000-0000",
  email: "contato@exemplo.com.br",
  maxSellerDiscount: 5,
};

function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

const rand = rng(20261014);
const pick = <T,>(arr: readonly T[]) => arr[Math.floor(rand() * arr.length)];
const uid = (p: string, n: number) => `${p}-${n.toString().padStart(4, "0")}`;
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

/** Gera CPF/CNPJ fictício com dígitos verificadores válidos (para testes). */
function withCheckDigits(base: string, weights: (d: number) => number[], cpf: boolean) {
  let doc = base;
  for (let d = 1; d <= 2; d++) {
    const w = weights(d);
    const sum = [...doc].reduce((acc, ch, i) => acc + (ch.charCodeAt(0) - 48) * w[i], 0);
    const dv = cpf ? ((sum * 10) % 11) % 10 : sum % 11 < 2 ? 0 : 11 - (sum % 11);
    doc += String(dv);
  }
  return doc;
}
const fakeCpf = (base9: string) => {
  const v = withCheckDigits(base9, (d) => Array.from({ length: 8 + d }, (_, i) => 9 + d - i), true);
  return v.replace(/^(\d{3})(\d{3})(\d{3})(\d{2})$/, "$1.$2.$3-$4");
};
const fakeCnpj = (base12: string) => {
  const all = [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
  const v = withCheckDigits(base12, (d) => all.slice(d === 1 ? 1 : 0), false);
  return v.replace(/^(.{2})(.{3})(.{3})(.{4})(.{2})$/, "$1.$2.$3/$4-$5");
};

export const users: User[] = [
  { id: "u1", name: "Ana Administradora", email: "ana@exemplo.com.br", role: "admin", active: true },
  { id: "u2", name: "Bruno Gerente", email: "bruno@exemplo.com.br", role: "manager", active: true },
  { id: "u3", name: "Carla Vendedora", email: "carla@exemplo.com.br", role: "seller", active: true },
  { id: "u4", name: "Diego Vendedor", email: "diego@exemplo.com.br", role: "seller", active: true },
  { id: "u5", name: "Eva Estoquista", email: "eva@exemplo.com.br", role: "stockist", active: true },
];

export const suppliers: Supplier[] = [
  ["11.444.777/0001-61", "Distribuidora Alfa Ltda", "Alfa Distribuição", "Marcos", "São Paulo", "SP", 5, "28 dias"],
  ["12.ABC.345/01DE-35", "Beta Têxtil S.A.", "Beta Têxtil", "Juliana", "Blumenau", "SC", 10, "30/60 dias"],
  [fakeCnpj("907010010001"), "Gama Papelaria Atacado Ltda", "Gama Atacado", "Roberto", "Campinas", "SP", 3, "À vista com 3% desc."],
  [fakeCnpj("907010020001"), "Delta Utilidades do Lar Ltda", "Delta Lar", "Patrícia", "Belo Horizonte", "MG", 7, "21 dias"],
  [fakeCnpj("907010030001"), "Ômega Eletrônicos Ltda", "Ômega", "Felipe", "Curitiba", "PR", 12, "30 dias"],
].map(([document, legalName, tradeName, representative, city, state, leadDays, paymentTerms], i) => ({
  id: uid("sup", i + 1),
  document: document as string,
  legalName: legalName as string,
  tradeName: tradeName as string,
  stateRegistration: "",
  representative: representative as string,
  phone: `(11) 4000-${(1000 + i * 37).toString()}`,
  whatsapp: `(11) 9${(8000 + i * 113).toString()}-${(1000 + i * 71).toString()}`,
  email: `vendas@${(tradeName as string).toLowerCase().split(" ")[0].normalize("NFD").replace(/[̀-ͯ]/g, "")}.com.br`,
  city: city as string,
  state: state as string,
  leadDays: leadDays as number,
  paymentTerms: paymentTerms as string,
  notes: "",
}));

const productDefs: [string, string, string, number, number, number, string, number][] = [
  // nome, categoria, marca, custo, preço, mínimo, NCM, fornecedor
  ["Camiseta básica algodão P", "Vestuário", "Beta", 18.5, 39.9, 10, "61091000", 1],
  ["Camiseta básica algodão M", "Vestuário", "Beta", 18.5, 39.9, 10, "61091000", 1],
  ["Camiseta básica algodão G", "Vestuário", "Beta", 18.5, 39.9, 10, "61091000", 1],
  ["Meia esportiva (par)", "Vestuário", "Beta", 4.2, 12.9, 20, "61159600", 1],
  ["Boné aba curva", "Acessórios", "Beta", 15, 44.9, 5, "65050090", 1],
  ["Caderno universitário 10 matérias", "Papelaria", "Gama", 14.8, 29.9, 15, "48202000", 2],
  ["Caneta esferográfica azul (cx 50)", "Papelaria", "Gama", 32, 64.9, 4, "96081000", 2],
  ["Lápis grafite HB (cx 12)", "Papelaria", "Gama", 6.9, 14.9, 8, "96091000", 2],
  ["Mochila escolar reforçada", "Papelaria", "Gama", 62, 139.9, 3, "42029200", 2],
  ["Garrafa térmica 1L", "Utilidades", "Delta", 38, 79.9, 6, "96170010", 3],
  ["Jogo de copos de vidro (6 un)", "Utilidades", "Delta", 22, 49.9, 5, "70133700", 3],
  ["Pote hermético 1,2L", "Utilidades", "Delta", 9.5, 21.9, 12, "39241000", 3],
  ["Pano de prato (kit 3)", "Utilidades", "Delta", 8, 19.9, 10, "63026000", 3],
  ["Fone de ouvido Bluetooth", "Eletrônicos", "Ômega", 54, 119.9, 4, "85183000", 4],
  ["Carregador USB-C 20W", "Eletrônicos", "Ômega", 28, 69.9, 6, "85044010", 4],
  ["Cabo USB-C 1m", "Eletrônicos", "Ômega", 7.5, 24.9, 15, "85444200", 4],
  ["Pilha alcalina AA (4 un)", "Eletrônicos", "Ômega", 9.8, 19.9, 12, "85061019", 4],
  ["Lâmpada LED 9W", "Utilidades", "Delta", 5.4, 13.9, 20, "85395000", 3],
  ["Café torrado e moído 500g", "Mercearia", "Alfa", 14.2, 24.9, 20, "09012100", 0],
  ["Açúcar refinado 1kg", "Mercearia", "Alfa", 3.9, 6.49, 30, "17019900", 0],
  ["Biscoito recheado 140g", "Mercearia", "Alfa", 1.9, 4.29, 40, "19053100", 0],
  ["Água mineral 500ml", "Mercearia", "Alfa", 0.85, 2.5, 48, "22011000", 0],
  ["Detergente líquido 500ml", "Limpeza", "Alfa", 1.6, 3.49, 24, "34022000", 0],
  ["Sabão em pó 1kg", "Limpeza", "Alfa", 8.9, 17.9, 10, "34022000", 0],
];

const initialStock = [14, 3, 22, 61, 9, 26, 2, 0, 5, 11, 7, 30, 18, 6, 0, 40, 25, 52, 33, 70, 96, 140, 44, 4];

export const products: Product[] = productDefs.map(([name, category, brand, cost, price, minStock, ncm, sup], i) => ({
  id: uid("prd", i + 1),
  code: i + 1,
  barcode: `789${(1000000000 + i * 7919).toString().slice(0, 10)}`,
  name,
  description: "",
  category,
  brand,
  supplierId: suppliers[sup].id,
  cost,
  price,
  stock: initialStock[i],
  minStock,
  unit: "UN",
  location: `${String.fromCharCode(65 + (i % 5))}-${Math.floor(i / 5) + 1}`,
  active: true,
  ncm,
  cest: "",
  origin: 0,
  cfop: "5102",
}));

const firstNames = ["Mariana", "João", "Fernanda", "Rafael", "Beatriz", "Lucas", "Camila", "Pedro", "Larissa", "Gustavo"];
const lastNames = ["Souza", "Oliveira", "Santos", "Pereira", "Lima", "Costa", "Almeida", "Ribeiro"];
// CPFs gerados apenas para teste (dígitos verificadores válidos).
const testCpfs = firstNames.map((_, i) => fakeCpf(`90801${(1000 + i * 37).toString()}`));

export const customers: Customer[] = [
  ...firstNames.map((f, i) => ({
    id: uid("cli", i + 1),
    personType: "PF" as const,
    document: testCpfs[i],
    name: `${f} ${pick(lastNames)} (fictício)`,
    tradeName: "",
    phone: "",
    whatsapp: `(11) 9${(7000 + i * 131).toString()}-${(2000 + i * 97).toString()}`,
    email: `${f.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "")}@exemplo.com`,
    zip: "01001000",
    street: "Rua de Teste",
    number: String(10 + i * 7),
    district: "Centro",
    city: "São Paulo",
    state: "SP",
    notes: "",
    createdAt: daysAgo(120 - i * 9),
  })),
  {
    id: uid("cli", 11),
    personType: "PJ",
    document: fakeCnpj("907010040001"),
    name: "Escritório Modelo Ltda (fictício)",
    tradeName: "Escritório Modelo",
    phone: "(11) 3555-0101",
    whatsapp: "",
    email: "compras@escritoriomodelo.com.br",
    zip: "04538133",
    street: "Av. Exemplo",
    number: "1500",
    district: "Itaim",
    city: "São Paulo",
    state: "SP",
    notes: "Compra material de escritório mensalmente.",
    createdAt: daysAgo(80),
  },
];

const sellers = ["Carla Vendedora", "Diego Vendedor", "Bruno Gerente"];
const methods = ["cash", "pix", "pix", "debit_card", "credit_card", "credit_card"] as const;

export const sales: Sale[] = [];
const salesMovements: Movement[] = [];
let saleNumber = 0;
for (let d = 89; d >= 0; d--) {
  const weekday = new Date(daysAgo(d)).getDay();
  const base = weekday === 0 ? 2 : weekday === 6 ? 9 : 6;
  const count = Math.max(1, Math.round(base + rand() * 5 - (d > 60 ? 2 : 0)));
  for (let k = 0; k < count; k++) {
    const nItems = 1 + Math.floor(rand() * 3);
    const chosen = new Set<number>();
    while (chosen.size < nItems) chosen.add(Math.floor(rand() * products.length));
    const lines = [...chosen].map((idx) => ({ p: products[idx], q: 1 + Math.floor(rand() * (products[idx].price < 10 ? 6 : 2)) }));
    const discount = rand() < 0.15 ? round2(lines.reduce((s, l) => s + l.p.price * l.q, 0) * 0.03) : 0;
    const totals = computeSaleTotals(lines.map((l) => ({ quantity: l.q, unitPrice: l.p.price })), discount);
    const total = fromCents(totals.totalCents);
    const method = pick(methods);
    saleNumber++;
    const hour = 9 + Math.floor(rand() * 9);
    const at = daysAgo(d, hour, Math.floor(rand() * 60));
    const tendered = method === "cash" ? Math.ceil(total / 10) * 10 : undefined;
    sales.push({
      id: uid("ven", saleNumber),
      number: saleNumber,
      customerId: rand() < 0.45 ? pick(customers).id : null,
      seller: pick(sellers),
      at,
      items: lines.map((l, i) => ({
        productId: l.p.id,
        name: l.p.name,
        unit: l.p.unit,
        quantity: l.q,
        unitPrice: l.p.price,
        discount: fromCents(totals.lines[i].discountCents),
        total: fromCents(totals.lines[i].totalCents),
        unitCost: l.p.cost,
      })),
      subtotal: fromCents(totals.subtotalCents),
      discount: fromCents(totals.discountTotalCents),
      total,
      change: tendered ? round2(tendered - total) : 0,
      payments: [{ method, amount: total, tendered }],
      status: d > 3 && rand() < 0.015 ? "cancelled" : "completed",
      cancelReason: undefined,
    });
  }
}
for (const s of sales) if (s.status === "cancelled") s.cancelReason = "Cliente desistiu da compra";

// Movimentações das vendas recentes (últimos 7 dias) para o histórico.
for (const s of sales.filter((x) => new Date(x.at) >= new Date(daysAgo(7)))) {
  for (const it of s.items) {
    salesMovements.push({
      id: `mov-s-${s.number}-${it.productId}`,
      productId: it.productId,
      type: "sale" as const,
      quantity: -it.quantity,
      before: 0,
      after: 0,
      reason: `Venda nº ${s.number}`,
      reference: `Venda ${s.number}`,
      user: s.seller,
      at: s.at,
    });
  }
}

export const purchaseOrders: PurchaseOrder[] = [
  { n: 1, sup: 1, status: "received", issue: 40, exp: 30, items: [[0, 30, 18.5, 30], [1, 30, 18.5, 30], [2, 30, 18.5, 30], [3, 60, 4.2, 60]] },
  { n: 2, sup: 0, status: "received", issue: 25, exp: 20, items: [[18, 60, 14.2, 60], [19, 100, 3.9, 100], [21, 240, 0.85, 240]] },
  { n: 3, sup: 2, status: "partially_received", issue: 12, exp: 5, items: [[5, 40, 14.8, 20], [6, 10, 32, 10], [7, 24, 6.9, 0]] },
  { n: 4, sup: 4, status: "confirmed", issue: 6, exp: -6, items: [[13, 10, 54, 0], [14, 15, 28, 0], [15, 30, 7.5, 0]] },
  { n: 5, sup: 3, status: "sent", issue: 2, exp: -5, items: [[9, 12, 38, 0], [10, 10, 22, 0]] },
  { n: 6, sup: 0, status: "draft", issue: 0, exp: -7, items: [[22, 48, 1.6, 0], [23, 20, 8.9, 0]] },
].map((o) => ({
  id: uid("ped", o.n),
  number: o.n,
  supplierId: suppliers[o.sup].id,
  status: o.status as PurchaseOrder["status"],
  issueDate: isoDate(o.issue),
  expectedDate: isoDate(o.exp),
  paymentMethod: "Boleto",
  paymentTerms: suppliers[o.sup].paymentTerms,
  dueDays: 28,
  discount: o.n === 3 ? 15 : 0,
  freight: o.n % 2 === 0 ? 35 : 0,
  notes: o.n === 4 ? "Entregar no período da manhã." : "",
  items: o.items.map(([pi, q, price, rec]) => ({ productId: products[pi].id, quantity: q, unitPrice: price, received: rec })),
}));

export const movements: Movement[] = [
  ...salesMovements,
  ...purchaseOrders
    .filter((o) => o.items.some((i) => i.received > 0))
    .flatMap((o) =>
      o.items
        .filter((i) => i.received > 0)
        .map((i) => ({
          id: `mov-p-${o.number}-${i.productId}`,
          productId: i.productId,
          type: "purchase_receipt" as const,
          quantity: i.received,
          before: 0,
          after: 0,
          reason: `Recebimento do pedido nº ${o.number}`,
          reference: `Pedido ${o.number}`,
          user: "Eva Estoquista",
          at: daysAgo(o.number === 3 ? 4 : o.number === 2 ? 21 : 31, 10),
        })),
    ),
  {
    id: "mov-a-1", productId: products[7].id, type: "adjustment" as const, quantity: -3, before: 3, after: 0,
    reason: "Divergência no inventário mensal", reference: "Manual", user: "Bruno Gerente", at: daysAgo(3, 17),
  },
  {
    id: "mov-a-2", productId: products[10].id, type: "manual_exit" as const, quantity: -1, before: 8, after: 7,
    reason: "Avaria — copo quebrado", reference: "Manual", user: "Eva Estoquista", at: daysAgo(1, 15),
  },
].sort((a, b) => b.at.localeCompare(a.at));

const receivedValue = (o: PurchaseOrder) => round2(o.items.reduce((s, i) => s + i.received * i.unitPrice, 0));

export const titles: FinancialTitle[] = [
  ...purchaseOrders
    .filter((o) => o.items.some((i) => i.received > 0))
    .map((o, i) => ({
      id: uid("tit-p", o.number),
      kind: "payable" as const,
      description: `Pedido de compra nº ${o.number} — recebimento`,
      party: suppliers.find((s) => s.id === o.supplierId)!.tradeName,
      amount: round2(receivedValue(o) + o.freight - o.discount),
      paid: i === 0 ? round2(receivedValue(o) + o.freight - o.discount) : 0,
      dueDate: isoDate(i === 0 ? 2 : i === 1 ? -7 : -24),
      status: (i === 0 ? "paid" : "open") as FinancialTitle["status"],
      source: `Pedido ${o.number}`,
    })),
  { id: "tit-x-1", kind: "payable", description: "Aluguel da loja", party: "Imobiliária Exemplo", amount: 3200, paid: 0, dueDate: isoDate(-3), status: "open", source: "Manual" },
  { id: "tit-x-2", kind: "payable", description: "Energia elétrica", party: "Concessionária", amount: 486.32, paid: 0, dueDate: isoDate(2), status: "open", source: "Manual" },
  { id: "tit-x-3", kind: "payable", description: "Internet e telefone", party: "Operadora", amount: 189.9, paid: 189.9, dueDate: isoDate(10), status: "paid", source: "Manual" },
  ...sales
    .filter((s) => s.status === "completed" && s.payments[0].method === "credit_card" && new Date(s.at) > new Date(daysAgo(30)))
    .slice(-12)
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
    id: "tit-r-cred-1", kind: "receivable", description: "Venda nº 12 — crediário 2/3", party: customers[10].name,
    amount: 216.6, paid: 0, dueDate: isoDate(-12), status: "open", source: "Venda 12",
  },
  {
    id: "tit-r-cred-2", kind: "receivable", description: "Venda nº 12 — crediário 1/3", party: customers[10].name,
    amount: 216.6, paid: 0, dueDate: isoDate(5), status: "open", source: "Venda 12",
  },
];

export const transactions: Transaction[] = [
  ...sales
    .filter((s) => s.status === "completed" && s.payments[0].method !== "credit_card")
    .map((s) => ({
      id: `trx-${s.number}`,
      direction: "in" as const,
      amount: s.total,
      method: s.payments[0].method,
      description: `Venda nº ${s.number}`,
      at: s.at,
    })),
  ...[
    [28, 3200, "Aluguel da loja"],
    [20, 452.1, "Energia elétrica"],
    [15, 1450, "Pedido de compra nº 1"],
    [10, 189.9, "Internet e telefone"],
    [5, 830, "Comissões de vendas"],
  ].map(([d, amount, description], i) => ({
    id: `trx-o-${i}`,
    direction: "out" as const,
    amount: amount as number,
    method: "pix" as const,
    description: description as string,
    at: daysAgo(d as number, 11),
  })),
].sort((a, b) => b.at.localeCompare(a.at));

const todaysCash = sales.filter((s) => s.at.slice(0, 10) === today.toISOString().slice(0, 10) && s.payments[0].method === "cash" && s.status === "completed");
export const cash: CashSession = {
  number: 87,
  status: "open",
  openedAt: daysAgo(0, 8, 55),
  operator: "Carla Vendedora",
  movements: [
    { id: "cx-0", type: "opening", amount: 150, description: "Abertura de caixa (fundo de troco)", at: daysAgo(0, 8, 55) },
    ...todaysCash.map((s) => ({ id: `cx-${s.number}`, type: "sale" as const, amount: s.total, description: `Venda nº ${s.number}`, at: s.at })),
  ],
};

export const audit: AuditEntry[] = [
  { id: "a1", at: daysAgo(0, 8, 55), user: "Carla Vendedora", action: "cash.opened", detail: "Caixa nº 87 aberto com R$ 150,00" },
  { id: "a2", at: daysAgo(1, 15), user: "Eva Estoquista", action: "stock.manual_exit", detail: "Jogo de copos: −1 (avaria)" },
  { id: "a3", at: daysAgo(3, 17), user: "Bruno Gerente", action: "stock.adjustment", detail: "Lápis grafite: saldo 3 → 0" },
  { id: "a4", at: daysAgo(4, 10), user: "Eva Estoquista", action: "purchase.received", detail: "Recebimento parcial do pedido nº 3" },
  { id: "a5", at: daysAgo(6, 9), user: "Ana Administradora", action: "update", detail: "Preço de venda do Fone Bluetooth: 109,90 → 119,90" },
];
