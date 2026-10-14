import { Banknote, Bike, CreditCard, History, Lock, MapPin, MessageCircle, Minus, Phone, Plus, Printer, QrCode, Store, Trash2, UserPlus, Wallet, X } from "lucide-react";
import { useMemo, useState } from "react";

import { fromCents } from "@erp/domain/money";
import { computeSaleTotals, type PaymentMethod, SaleValidationError } from "@erp/domain/sale";

import { Badge, brl, Button, buttonClass, Card, cx, date, dateTime, Field, Input, Modal, Notice, num, Select, useFeedback } from "../components/ui";
import { COMPANY } from "../data/seed";
import type { Customer, Product, Sale, SaleMode } from "../data/types";
import { type CartLine, unitPriceFor, useStore } from "../store";

export const METHOD_LABELS: Record<PaymentMethod, string> = {
  cash: "Dinheiro",
  pix: "Pix",
  debit_card: "Débito",
  credit_card: "Crédito",
  bank_transfer: "Transferência",
  store_credit: "Fiado",
};
const METHODS: { m: PaymentMethod; icon: typeof Banknote }[] = [
  { m: "cash", icon: Banknote },
  { m: "pix", icon: QrCode },
  { m: "debit_card", icon: CreditCard },
  { m: "credit_card", icon: CreditCard },
  { m: "store_credit", icon: Wallet },
];
export const MODE_LABELS: Record<SaleMode, string> = { troca: "Troca", completo: "Completo", unidade: "" };

const digits = (s: string) => s.replace(/\D/g, "");
const parseMoney = (s: string) => Number(s.replace(/\./g, "").replace(",", ".") || "0");

/** Última compra e intervalo médio entre compras do cliente. */
export function customerHistory(sales: Sale[], customerId: string) {
  const mine = sales.filter((s) => s.customerId === customerId && s.status === "completed").sort((a, b) => a.at.localeCompare(b.at));
  const last = mine[mine.length - 1];
  let avg: number | null = null;
  if (mine.length >= 2) {
    const span = (new Date(last.at).getTime() - new Date(mine[0].at).getTime()) / 86400000;
    avg = Math.round(span / (mine.length - 1));
  }
  return { count: mine.length, last, avgDays: avg, total: mine.reduce((a, s) => a + s.total, 0) };
}

export function Pdv() {
  const store = useStore();
  const { products, customers, sales, cash, can, drivers, registerSale, saveCustomer } = store;
  const { run, toast } = useFeedback();

  const [phone, setPhone] = useState("");
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [newCustomer, setNewCustomer] = useState(false);
  const [channel, setChannel] = useState<"balcao" | "entrega">("balcao");
  const [cart, setCart] = useState<CartLine[]>([]);
  const [discount, setDiscount] = useState("");
  const [fee, setFee] = useState(String(COMPANY.deliveryFee || ""));
  const [method, setMethod] = useState<PaymentMethod>("pix");
  const [cashValue, setCashValue] = useState("");
  const [driver, setDriver] = useState("");
  const [done, setDone] = useState<Sale | null>(null);
  const [cashDialog, setCashDialog] = useState<"open" | "close" | "supply" | "withdrawal" | null>(null);

  const matches = useMemo(() => {
    const d = digits(phone);
    const t = phone.trim().toLowerCase();
    if (!t || customer) return [];
    return customers.filter((c) => (d.length >= 3 && digits(c.phone).includes(d)) || (!d && c.name.toLowerCase().includes(t))).slice(0, 6);
  }, [phone, customers, customer]);

  const history = customer ? customerHistory(sales, customer.id) : null;
  const active = products.filter((p) => p.active);
  const returnables = active.filter((p) => p.returnable);
  const others = active.filter((p) => !p.returnable);

  const deliveryFee = channel === "entrega" ? parseMoney(fee) : 0;
  let totals: ReturnType<typeof computeSaleTotals> | null = null;
  let totalsError = "";
  try {
    if (cart.length) {
      totals = computeSaleTotals(
        [
          ...cart.map((l) => ({ quantity: l.quantity, unitPrice: unitPriceFor(products.find((p) => p.id === l.productId)!, l.mode) })),
          ...(deliveryFee > 0 ? [{ quantity: 1, unitPrice: deliveryFee }] : []),
        ],
        parseMoney(discount),
      );
    }
  } catch (e) {
    totalsError = e instanceof SaleValidationError ? e.message : String(e);
  }
  const total = totals ? fromCents(totals.totalCents) : 0;
  const cashNum = parseMoney(cashValue);
  const change = method === "cash" && cashNum > total ? cashNum - total : 0;

  const selectCustomer = (c: Customer) => {
    setCustomer(c);
    setPhone(c.phone);
    setChannel("entrega");
  };
  const clearCustomer = () => {
    setCustomer(null);
    setPhone("");
    setChannel("balcao");
  };

  const add = (p: Product, mode: SaleMode, qty = 1) => {
    const inCart = cart.filter((l) => l.productId === p.id).reduce((a, l) => a + l.quantity, 0);
    if (inCart + qty > p.stockFull && !store.allowNegativeStock) {
      toast("bad", `Sem estoque suficiente de ${p.name} (${p.returnable ? "cheios" : "disponível"}: ${p.stockFull}).`);
      return;
    }
    setCart((c) =>
      c.some((l) => l.productId === p.id && l.mode === mode)
        ? c.map((l) => (l.productId === p.id && l.mode === mode ? { ...l, quantity: l.quantity + qty } : l))
        : [...c, { productId: p.id, mode, quantity: qty }],
    );
  };

  const repeatLast = () => {
    if (!history?.last) return;
    setCart([]);
    for (const it of history.last.items) {
      const p = products.find((x) => x.id === it.productId);
      if (p) add(p, it.mode, it.quantity);
    }
    setMethod(history.last.method);
  };

  const finish = () => {
    let sale: Sale | null = null;
    const ok = run(
      () => {
        sale = registerSale({
          lines: cart,
          channel,
          customerId: customer?.id ?? null,
          method,
          discount: parseMoney(discount),
          deliveryFee,
          tendered: channel === "balcao" && method === "cash" && cashValue ? cashNum : undefined,
          changeFor: channel === "entrega" && method === "cash" && cashValue ? cashNum : undefined,
          driver: channel === "entrega" && driver ? driver : null,
        });
      },
      channel === "entrega" ? "Pedido de entrega registrado." : "Venda finalizada.",
    );
    if (ok && sale) {
      setDone(sale);
      setCart([]);
      setDiscount("");
      setCashValue("");
      setDriver("");
      clearCustomer();
    }
  };

  if (cash.status !== "open") {
    return (
      <div className="mx-auto max-w-md pt-10">
        <Card className="p-6 text-center">
          <Lock className="mx-auto size-8 text-fg-3" />
          <h1 className="mt-3 text-lg font-semibold">Caixa fechado</h1>
          <p className="mt-1 text-sm text-fg-2">Abra o caixa informando o fundo de troco para começar a vender.</p>
          {cash.expected !== undefined && (
            <p className="mt-3 text-xs text-fg-3">
              Último fechamento (caixa nº {cash.number}): esperado {brl(cash.expected)}, contado {brl(cash.declared ?? 0)}.
            </p>
          )}
          <Button variant="primary" className="mt-5" onClick={() => setCashDialog("open")} disabled={!can("cash.operate")}>
            Abrir caixa
          </Button>
        </Card>
        {cashDialog && <CashDialog mode={cashDialog} onClose={() => setCashDialog(null)} />}
      </div>
    );
  }

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Vender</h1>
          <p className="text-sm text-fg-2">
            Caixa nº {cash.number} · dinheiro na gaveta: {brl(cash.movements.reduce((a, m) => a + m.amount, 0))}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" onClick={() => setCashDialog("supply")}>Suprimento</Button>
          <Button size="sm" onClick={() => setCashDialog("withdrawal")}>Sangria</Button>
          <Button size="sm" variant="ghost" onClick={() => setCashDialog("close")}>Fechar caixa</Button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-5">
        <div className="space-y-4 lg:col-span-3">
          {/* 1. Cliente */}
          <Card className="p-4">
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-fg-3">1. Cliente</p>
            {customer ? (
              <div className="flex flex-wrap items-start gap-3">
                <div className="min-w-0 flex-1">
                  <p className="font-semibold">{customer.name}</p>
                  <p className="mt-0.5 flex items-center gap-1.5 text-sm text-fg-2">
                    <Phone className="size-3.5" /> {customer.phone}
                  </p>
                  <p className="mt-0.5 flex items-start gap-1.5 text-sm text-fg-2">
                    <MapPin className="mt-0.5 size-3.5 shrink-0" />
                    <span>
                      {customer.street}, {customer.number} — {customer.district}
                      {customer.reference && <span className="text-fg-3"> · {customer.reference}</span>}
                    </span>
                  </p>
                  {history?.last && (
                    <p className="mt-1.5 flex items-center gap-1.5 text-xs text-fg-3">
                      <History className="size-3.5" />
                      Última compra {date(history.last.at)}: {history.last.items.map((i) => `${i.quantity}× ${i.name.split(" (")[0]}`).join(", ")}
                      {history.avgDays && ` · compra a cada ~${history.avgDays} dias`}
                    </p>
                  )}
                </div>
                <div className="flex gap-2">
                  {history?.last && (
                    <Button variant="primary" size="sm" onClick={repeatLast}>
                      Repetir último pedido
                    </Button>
                  )}
                  <Button size="sm" variant="ghost" aria-label="Trocar cliente" onClick={clearCustomer}>
                    <X className="size-4" />
                  </Button>
                </div>
              </div>
            ) : (
              <div className="relative">
                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <Phone className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-fg-3" />
                    <Input
                      autoFocus
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      placeholder="Telefone ou nome do cliente (deixe vazio para balcão)"
                      className="h-11 pl-9 text-base"
                      inputMode="tel"
                    />
                  </div>
                  {can("customers.manage") && (
                    <Button className="h-11" onClick={() => setNewCustomer(true)}>
                      <UserPlus className="size-4" /> Novo
                    </Button>
                  )}
                </div>
                {matches.length > 0 && (
                  <ul className="absolute inset-x-0 top-12 z-20 overflow-hidden rounded-lg border border-line bg-surface shadow-lg">
                    {matches.map((c) => (
                      <li key={c.id}>
                        <button className="w-full px-3 py-2 text-left hover:bg-surface-2" onClick={() => selectCustomer(c)}>
                          <span className="block text-sm font-medium">{c.name}</span>
                          <span className="block text-xs text-fg-3">
                            {c.phone} · {c.street}, {c.number} — {c.district}
                          </span>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
                {phone && matches.length === 0 && digits(phone).length >= 8 && (
                  <p className="mt-2 text-sm text-fg-2">
                    Nenhum cliente com esse telefone.{" "}
                    <button className="font-medium text-accent hover:underline" onClick={() => setNewCustomer(true)}>
                      Cadastrar agora
                    </button>
                  </p>
                )}
              </div>
            )}
          </Card>

          {/* 2. Produtos */}
          <Card className="p-4">
            <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-fg-3">2. Produtos</p>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {returnables.map((p) => (
                <div key={p.id} className="rounded-xl border border-line p-3">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="font-semibold leading-tight">{p.name.split(" (")[0]}</p>
                      <p className="text-xs text-fg-3">{p.name.includes("(") ? p.name.split("(")[1].replace(")", "") + " · " : ""}{p.capacity}</p>
                    </div>
                    <Badge tone={p.stockFull <= 0 ? "bad" : p.stockFull <= p.minStock ? "warn" : "neutral"}>{p.stockFull} cheios</Badge>
                  </div>
                  <div className="mt-3 grid grid-cols-2 gap-2">
                    <button
                      onClick={() => add(p, "troca")}
                      className="rounded-lg bg-accent px-2 py-2.5 text-center text-accent-fg transition hover:brightness-110 active:scale-[.98]"
                    >
                      <span className="block text-[11px] font-medium opacity-90">Troca</span>
                      <span className="tabular block text-base font-bold">{brl(p.priceExchange)}</span>
                    </button>
                    <button
                      onClick={() => add(p, "completo")}
                      className="rounded-lg border border-line bg-surface-2 px-2 py-2.5 text-center transition hover:border-accent active:scale-[.98]"
                    >
                      <span className="block text-[11px] font-medium text-fg-2">Completo</span>
                      <span className="tabular block text-base font-bold">{brl(p.priceFull)}</span>
                    </button>
                  </div>
                </div>
              ))}
            </div>
            {others.length > 0 && (
              <>
                <p className="mt-4 mb-2 text-xs font-medium text-fg-3">Acessórios e outros</p>
                <div className="flex flex-wrap gap-2">
                  {others.map((p) => (
                    <button
                      key={p.id}
                      onClick={() => add(p, "unidade")}
                      className="rounded-lg border border-line px-3 py-2 text-left text-sm transition hover:border-accent"
                    >
                      <span className="font-medium">{p.name}</span>
                      <span className="tabular ml-2 text-accent">{brl(p.priceExchange)}</span>
                      <span className={cx("ml-2 text-xs", p.stockFull <= 0 ? "text-bad" : "text-fg-3")}>({p.stockFull})</span>
                    </button>
                  ))}
                </div>
              </>
            )}
          </Card>
        </div>

        {/* 3. Pedido */}
        <Card className="h-fit scroll-mt-28 p-4 lg:col-span-2 lg:sticky lg:top-24">
          <span id="pedido" />
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-fg-3">3. Pedido</p>
          <div className="grid grid-cols-2 gap-1 rounded-lg bg-surface-2 p-1">
            {(["balcao", "entrega"] as const).map((c) => (
              <button
                key={c}
                onClick={() => setChannel(c)}
                className={cx("flex items-center justify-center gap-1.5 rounded-md py-2 text-sm font-medium transition", channel === c ? "bg-surface shadow-sm" : "text-fg-2")}
              >
                {c === "balcao" ? <Store className="size-4" /> : <Bike className="size-4" />}
                {c === "balcao" ? "Balcão" : "Entrega"}
              </button>
            ))}
          </div>
          {channel === "entrega" && !customer && <p className="mt-2 text-xs text-warn">Selecione ou cadastre o cliente para entrega.</p>}

          <ul className="mt-3 divide-y divide-line">
            {cart.map((l, idx) => {
              const p = products.find((x) => x.id === l.productId)!;
              const price = unitPriceFor(p, l.mode);
              const setQty = (n: number) =>
                setCart((c) => (n <= 0 ? c.filter((_, i) => i !== idx) : c.map((x, i) => (i === idx ? { ...x, quantity: n } : x))));
              return (
                <li key={`${l.productId}-${l.mode}`} className="flex items-center gap-2 py-2">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{p.name.split(" (")[0]}</p>
                    <p className="text-xs text-fg-3">
                      {l.mode !== "unidade" && <Badge tone={l.mode === "troca" ? "info" : "warn"}>{MODE_LABELS[l.mode]}</Badge>} {brl(price)}
                    </p>
                  </div>
                  <Button size="sm" variant="ghost" aria-label="Diminuir" onClick={() => setQty(l.quantity - 1)}>
                    <Minus className="size-3.5" />
                  </Button>
                  <span className="tabular w-5 text-center text-sm font-semibold">{l.quantity}</span>
                  <Button size="sm" variant="ghost" aria-label="Aumentar" onClick={() => add(p, l.mode)}>
                    <Plus className="size-3.5" />
                  </Button>
                  <span className="tabular w-20 text-right text-sm font-medium">{brl(price * l.quantity)}</span>
                  <button aria-label="Remover" className="p-1 text-fg-3 hover:text-bad" onClick={() => setQty(0)}>
                    <Trash2 className="size-3.5" />
                  </button>
                </li>
              );
            })}
            {cart.length === 0 && <li className="py-8 text-center text-sm text-fg-3">Toque em “Troca” ou “Completo” para adicionar.</li>}
          </ul>

          <div className="mt-2 grid grid-cols-2 gap-2">
            {channel === "entrega" && (
              <Field label="Taxa de entrega (R$)">
                <Input inputMode="decimal" value={fee} onChange={(e) => setFee(e.target.value)} placeholder="0,00" />
              </Field>
            )}
            <Field label="Desconto (R$)">
              <Input inputMode="decimal" value={discount} disabled={!can("sales.discount")} onChange={(e) => setDiscount(e.target.value)} placeholder="0,00" />
            </Field>
          </div>
          {totalsError && <p className="mt-1 text-xs text-bad">{totalsError}</p>}

          <p className="mt-4 mb-1.5 text-xs font-medium text-fg-2">Pagamento {channel === "entrega" && "(recebido pelo entregador)"}</p>
          <div className="grid grid-cols-5 gap-1">
            {METHODS.map(({ m, icon: Icon }) => (
              <button
                key={m}
                onClick={() => setMethod(m)}
                className={cx(
                  "flex flex-col items-center gap-1 rounded-lg border px-1 py-2 text-[11px] font-medium transition",
                  method === m ? "border-accent bg-accent-soft text-accent" : "border-line text-fg-2 hover:bg-surface-2",
                )}
              >
                <Icon className="size-4" />
                {METHOD_LABELS[m]}
              </button>
            ))}
          </div>
          {method === "cash" && (
            <Field label={channel === "balcao" ? "Valor recebido (R$)" : "Troco para (R$)"} className="mt-2">
              <Input inputMode="decimal" value={cashValue} onChange={(e) => setCashValue(e.target.value)} placeholder={channel === "balcao" ? "Ex.: 150,00" : "Ex.: 200,00"} />
            </Field>
          )}
          {channel === "entrega" && (
            <Field label="Entregador" className="mt-2">
              <Select value={driver} onChange={(e) => setDriver(e.target.value)}>
                <option value="">Definir depois (fica pendente)</option>
                {drivers.map((d) => (
                  <option key={d}>{d}</option>
                ))}
              </Select>
            </Field>
          )}

          <div className="mt-4 space-y-1 border-t border-line pt-3 text-sm">
            {totals && totals.discountTotalCents > 0 && (
              <div className="flex justify-between text-fg-2">
                <span>Desconto</span>
                <span className="tabular">− {brl(fromCents(totals.discountTotalCents))}</span>
              </div>
            )}
            <div className="flex items-baseline justify-between">
              <span className="font-medium">Total</span>
              <span className="tabular text-2xl font-bold">{brl(total)}</span>
            </div>
            {change > 0 && (
              <div className="flex justify-between font-medium text-good">
                <span>{channel === "balcao" ? "Troco" : "Levar de troco"}</span>
                <span className="tabular">{brl(change)}</span>
              </div>
            )}
          </div>
          <Button
            variant="primary"
            className="mt-3 h-12 w-full text-base"
            disabled={cart.length === 0 || !!totalsError || (channel === "entrega" && !customer)}
            onClick={finish}
          >
            {channel === "entrega" ? "Registrar entrega" : "Finalizar venda"}
          </Button>
        </Card>
      </div>

      {cart.length > 0 && (
        <div className="no-print fixed inset-x-0 bottom-0 z-30 flex items-center gap-3 border-t border-line bg-surface px-4 py-3 shadow-[0_-4px_12px_rgba(0,0,0,.08)] lg:hidden">
          <div className="min-w-0 flex-1">
            <p className="text-xs text-fg-3">{cart.reduce((a, l) => a + l.quantity, 0)} item(ns)</p>
            <p className="tabular text-lg font-bold">{brl(total)}</p>
          </div>
          <Button variant="primary" className="h-11" onClick={() => document.getElementById("pedido")?.scrollIntoView({ behavior: "smooth", block: "start" })}>
            Ver pedido e pagar
          </Button>
        </div>
      )}
      {newCustomer && (
        <QuickCustomer
          phone={phone}
          onClose={() => setNewCustomer(false)}
          onSave={(d) => {
            let created: Customer | null = null;
            if (run(() => { created = saveCustomer(d); }, "Cliente cadastrado.") && created) {
              selectCustomer(created);
              setNewCustomer(false);
            }
          }}
        />
      )}
      {done && <Receipt sale={done} onClose={() => setDone(null)} />}
      {cashDialog && <CashDialog mode={cashDialog} onClose={() => setCashDialog(null)} />}
    </>
  );
}

export function QuickCustomer({
  phone = "",
  initial,
  onClose,
  onSave,
}: {
  phone?: string;
  initial?: Customer;
  onClose: () => void;
  onSave: (c: Omit<Customer, "id" | "createdAt"> & { id?: string }) => void;
}) {
  const [d, setD] = useState<Omit<Customer, "id" | "createdAt"> & { id?: string }>(
    initial ?? { name: "", phone: digits(phone).length >= 8 ? phone : "", document: "", street: "", number: "", district: "", reference: "", notes: "" },
  );
  const set = (k: keyof typeof d, v: string) => setD((x) => ({ ...x, [k]: v }));
  return (
    <Modal
      open
      title={initial ? "Editar cliente" : "Novo cliente"}
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose}>Cancelar</Button>
          <Button variant="primary" onClick={() => onSave(d)}>
            Salvar
          </Button>
        </>
      }
    >
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-6">
        <Field label="Telefone / WhatsApp *" className="sm:col-span-3">
          <Input autoFocus={!d.phone} inputMode="tel" value={d.phone} onChange={(e) => set("phone", e.target.value)} placeholder="(11) 90000-0000" />
        </Field>
        <Field label="Nome *" className="sm:col-span-3">
          <Input autoFocus={!!d.phone} value={d.name} onChange={(e) => set("name", e.target.value)} />
        </Field>
        <Field label="Rua" className="sm:col-span-4">
          <Input value={d.street} onChange={(e) => set("street", e.target.value)} />
        </Field>
        <Field label="Número" className="sm:col-span-2">
          <Input value={d.number} onChange={(e) => set("number", e.target.value)} />
        </Field>
        <Field label="Bairro" className="sm:col-span-3">
          <Input value={d.district} onChange={(e) => set("district", e.target.value)} />
        </Field>
        <Field label="Ponto de referência" className="sm:col-span-3">
          <Input value={d.reference} onChange={(e) => set("reference", e.target.value)} placeholder="Ex.: portão azul" />
        </Field>
        <Field label="CPF/CNPJ (opcional, para nota)" className="sm:col-span-3">
          <Input value={d.document} onChange={(e) => set("document", e.target.value)} />
        </Field>
        <Field label="Observações" className="sm:col-span-3">
          <Input value={d.notes} onChange={(e) => set("notes", e.target.value)} placeholder="Ex.: entregar pela manhã" />
        </Field>
      </div>
    </Modal>
  );
}

export function Receipt({ sale, onClose }: { sale: Sale; onClose: () => void }) {
  const { customers } = useStore();
  const c = customers.find((x) => x.id === sale.customerId);
  const msg = c
    ? `Olá, ${c.name.split(" ")[0]}! Recebemos seu pedido nº ${sale.number} (${sale.items.map((i) => `${i.quantity}× ${i.name.split(" (")[0]}`).join(", ")}), total ${brl(sale.total)}. ${sale.channel === "entrega" ? "Já já chega aí!" : "Obrigado!"} — ${COMPANY.tradeName}`
    : "";
  return (
    <Modal
      open
      size="sm"
      title={`${sale.channel === "entrega" ? "Pedido de entrega" : "Venda"} nº ${sale.number}`}
      onClose={onClose}
      footer={
        <>
          {c && (
            <a className={buttonClass()} href={`https://wa.me/55${digits(c.phone)}?text=${encodeURIComponent(msg)}`} target="_blank" rel="noreferrer">
              <MessageCircle className="size-4" /> Avisar no WhatsApp
            </a>
          )}
          <Button variant="primary" onClick={() => window.print()}>
            <Printer className="size-4" /> Imprimir
          </Button>
        </>
      }
    >
      <div className="no-print mb-3">
        <Notice tone="warn">Nesta demonstração nenhuma NFC-e é emitida. No sistema real a nota é enviada ao provedor fiscal.</Notice>
      </div>
      <div className="print-area mx-auto max-w-[300px] bg-white p-3 font-mono text-[11px] leading-snug text-neutral-900">
        <p className="text-center font-bold">{COMPANY.tradeName}</p>
        <p className="text-center">CNPJ {COMPANY.document} · {COMPANY.phone}</p>
        <p className="mt-1 border-y border-dashed border-neutral-500 py-1 text-center font-bold">COMPROVANTE — NÃO É DOCUMENTO FISCAL</p>
        <p>
          {sale.channel === "entrega" ? "ENTREGA" : "BALCÃO"} nº {sale.number} · {dateTime(sale.at)}
        </p>
        <p>Atendente: {sale.seller}</p>
        {c && (
          <>
            <p className="mt-1 font-bold">{c.name}</p>
            <p>{c.phone}</p>
            {sale.delivery && (
              <>
                <p>{sale.delivery.address}</p>
                {sale.delivery.reference && <p>Ref.: {sale.delivery.reference}</p>}
              </>
            )}
          </>
        )}
        <div className="my-1 border-b border-dashed border-neutral-500" />
        {sale.items.map((i) => (
          <p key={`${i.productId}-${i.mode}`} className="flex justify-between gap-2">
            <span>
              {num(i.quantity)}× {i.name.split(" (")[0]} {i.mode !== "unidade" && `(${MODE_LABELS[i.mode]})`}
            </span>
            <span>{brl(i.unitPrice * i.quantity)}</span>
          </p>
        ))}
        {sale.deliveryFee > 0 && (
          <p className="flex justify-between"><span>Taxa de entrega</span><span>{brl(sale.deliveryFee)}</span></p>
        )}
        {sale.discount > 0 && <p className="flex justify-between"><span>Desconto</span><span>− {brl(sale.discount)}</span></p>}
        <p className="mt-1 flex justify-between text-[13px] font-bold"><span>TOTAL</span><span>{brl(sale.total)}</span></p>
        <p className="flex justify-between"><span>Pagamento</span><span>{METHOD_LABELS[sale.method]}{sale.channel === "entrega" && !sale.paid ? " (na entrega)" : ""}</span></p>
        {sale.change ? <p className="flex justify-between"><span>Troco</span><span>{brl(sale.change)}</span></p> : null}
        {sale.delivery?.changeFor ? (
          <p className="flex justify-between font-bold"><span>Levar troco p/ {brl(sale.delivery.changeFor)}</span><span>{brl(sale.delivery.changeFor - sale.total)}</span></p>
        ) : null}
        {sale.delivery?.driver && <p>Entregador: {sale.delivery.driver}</p>}
        <p className="mt-2 text-center">Obrigado pela preferência!</p>
      </div>
      {sale.status === "cancelled" && (
        <div className="mt-2 text-center">
          <Badge tone="bad">Venda cancelada</Badge>
        </div>
      )}
    </Modal>
  );
}

function CashDialog({ mode, onClose }: { mode: "open" | "close" | "supply" | "withdrawal"; onClose: () => void }) {
  const { cash, openCash, closeCash, cashMovement } = useStore();
  const { run, toast } = useFeedback();
  const [value, setValue] = useState("");
  const [desc, setDesc] = useState("");
  const v = parseMoney(value);
  const expected = cash.movements.reduce((a, m) => a + m.amount, 0);
  const titles = { open: "Abrir caixa", close: "Fechar caixa", supply: "Suprimento", withdrawal: "Sangria" };
  const submit = () => {
    if (mode === "open") {
      if (run(() => openCash(v), "Caixa aberto.")) onClose();
    } else if (mode === "close") {
      let r: { expected: number; difference: number } | null = null;
      if (run(() => { r = closeCash(v); })) {
        const res = r as unknown as { expected: number; difference: number };
        toast(res.difference === 0 ? "good" : "info", `Caixa fechado. Esperado ${brl(res.expected)}, diferença ${brl(res.difference)}.`);
        onClose();
      }
    } else if (run(() => cashMovement(mode, v, desc), "Movimentação registrada.")) onClose();
  };
  return (
    <Modal
      open
      size="sm"
      title={titles[mode]}
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose}>Cancelar</Button>
          <Button variant="primary" onClick={submit}>
            Confirmar
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        {mode === "close" && (
          <Notice>
            Esperado em dinheiro na gaveta: <b>{brl(expected)}</b> (abertura + vendas e entregas pagas em dinheiro + suprimentos − sangrias − estornos).
          </Notice>
        )}
        <Field label={mode === "open" ? "Fundo de troco (R$)" : mode === "close" ? "Valor contado na gaveta (R$)" : "Valor (R$)"}>
          <Input autoFocus inputMode="decimal" value={value} onChange={(e) => setValue(e.target.value)} />
        </Field>
        {(mode === "supply" || mode === "withdrawal") && (
          <Field label="Descrição">
            <Input value={desc} onChange={(e) => setDesc(e.target.value)} placeholder={mode === "withdrawal" ? "Ex.: pagamento de entregador" : "Ex.: reforço de troco"} />
          </Field>
        )}
      </div>
    </Modal>
  );
}
