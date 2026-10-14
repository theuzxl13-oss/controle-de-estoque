import { Banknote, CreditCard, Lock, Minus, Plus, Printer, QrCode, ScanBarcode, Trash2, UserPlus, Wallet, X } from "lucide-react";
import { useMemo, useRef, useState } from "react";

import { toCents, fromCents } from "@erp/domain/money";
import { computeSaleTotals, discountNeedsManager, PAYMENT_METHOD_LABELS, type PaymentMethod, SaleValidationError } from "@erp/domain/sale";
import { formatDocument } from "@erp/validation/documents";

import { Badge, brl, Button, Card, cx, dateTime, Field, Input, Modal, Notice, num, Select, useFeedback } from "../components/ui";
import { COMPANY } from "../data/seed";
import type { Sale, SalePayment } from "../data/types";
import { type CartLine, useStore } from "../store";
import { CustomerForm, emptyCustomer } from "./Clientes";

const METHOD_ICONS: Record<PaymentMethod, typeof Banknote> = {
  cash: Banknote,
  pix: QrCode,
  credit_card: CreditCard,
  debit_card: CreditCard,
  bank_transfer: Wallet,
  store_credit: Wallet,
};

export function Pdv() {
  const store = useStore();
  const { products, customers, cash, can, finalizeSale, saveCustomer } = store;
  const { run, toast } = useFeedback();
  const [q, setQ] = useState("");
  const [cart, setCart] = useState<CartLine[]>([]);
  const [customerId, setCustomerId] = useState<string | null>(null);
  const [generalDiscount, setGeneralDiscount] = useState(0);
  const [payments, setPayments] = useState<SalePayment[]>([]);
  const [method, setMethod] = useState<PaymentMethod>("pix");
  const [amount, setAmount] = useState("");
  const [tendered, setTendered] = useState("");
  const [installments, setInstallments] = useState(1);
  const [receipt, setReceipt] = useState<Sale | null>(null);
  const [newCustomer, setNewCustomer] = useState(false);
  const [cashOpen, setCashOpen] = useState<"open" | "close" | "supply" | "withdrawal" | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  const results = useMemo(() => {
    const t = q.trim().toLowerCase();
    const active = products.filter((p) => p.active);
    if (!t) return active.slice(0, 12);
    return active.filter((p) => p.name.toLowerCase().includes(t) || p.barcode.includes(t) || String(p.code) === t).slice(0, 12);
  }, [products, q]);

  let totals: ReturnType<typeof computeSaleTotals> | null = null;
  let totalsError = "";
  try {
    if (cart.length) {
      totals = computeSaleTotals(
        cart.map((l) => ({ quantity: l.quantity, unitPrice: products.find((p) => p.id === l.productId)!.price, discount: l.discount })),
        generalDiscount,
      );
    }
  } catch (e) {
    totalsError = e instanceof SaleValidationError ? e.message : String(e);
  }
  const totalCents = totals?.totalCents ?? 0;
  const paidCents = payments.reduce((a, p) => a + toCents(p.amount), 0);
  const remainingCents = totalCents - paidCents;
  const changeCents = payments.reduce((a, p) => a + (p.tendered ? toCents(p.tendered) - toCents(p.amount) : 0), 0);

  const add = (productId: string) => {
    const p = products.find((x) => x.id === productId)!;
    const inCart = cart.find((l) => l.productId === productId)?.quantity ?? 0;
    if (inCart + 1 > p.stock && !store.allowNegativeStock) {
      toast("bad", `Estoque insuficiente para "${p.name}" (disponível: ${num(p.stock)}).`);
      return;
    }
    setCart((c) =>
      c.some((l) => l.productId === productId)
        ? c.map((l) => (l.productId === productId ? { ...l, quantity: l.quantity + 1 } : l))
        : [...c, { productId, quantity: 1, discount: 0 }],
    );
    setPayments([]);
  };

  const onScan = () => {
    const t = q.trim();
    if (!t) return;
    const exact = products.find((p) => p.active && (p.barcode === t || String(p.code) === t));
    const target = exact ?? (results.length === 1 ? results[0] : null);
    if (target) {
      add(target.id);
      setQ("");
    } else toast("info", "Nenhum produto com este código. Selecione na lista.");
  };

  const addPayment = () => {
    const value = amount ? Number(amount.replace(",", ".")) : fromCents(remainingCents);
    const tenderedValue = method === "cash" && tendered ? Number(tendered.replace(",", ".")) : undefined;
    run(() => {
      if (!(value > 0)) throw new Error("Informe o valor.");
      if (toCents(value) > remainingCents) throw new Error("Valor maior que o restante da venda.");
      if (tenderedValue !== undefined && tenderedValue < value) throw new Error("Valor recebido menor que o valor pago em dinheiro.");
      if (method === "store_credit" && !customerId) throw new Error("Venda a prazo exige cliente identificado.");
      setPayments([...payments, { method, amount: value, tendered: tenderedValue, installments: ["credit_card", "store_credit"].includes(method) ? installments : 1 }]);
      setAmount("");
      setTendered("");
      setInstallments(1);
    });
  };

  const finish = () => {
    let sale: Sale | null = null;
    const ok = run(() => {
      sale = finalizeSale({ lines: cart, generalDiscount, payments, customerId });
    }, "Venda finalizada. Estoque e financeiro atualizados.");
    if (ok && sale) {
      setReceipt(sale);
      setCart([]);
      setPayments([]);
      setGeneralDiscount(0);
      setCustomerId(null);
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
              Último fechamento (caixa nº {cash.number}): esperado {brl(cash.expected)}, declarado {brl(cash.declared ?? 0)}.
            </p>
          )}
          <Button variant="primary" className="mt-5" onClick={() => setCashOpen("open")} disabled={!can("cash.operate")}>
            Abrir caixa
          </Button>
        </Card>
        {cashOpen && <CashDialog mode={cashOpen} onClose={() => setCashOpen(null)} />}
      </div>
    );
  }

  const discountWarn = totals && discountNeedsManager(totals, COMPANY.maxSellerDiscount) && !can("sales.discount_unlimited");

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Frente de caixa</h1>
          <p className="text-sm text-fg-2">
            Caixa nº {cash.number} aberto por {cash.operator} · em dinheiro: {brl(cash.movements.reduce((a, m) => a + m.amount, 0))}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" onClick={() => setCashOpen("supply")}>Suprimento</Button>
          <Button size="sm" onClick={() => setCashOpen("withdrawal")}>Sangria</Button>
          <Button size="sm" variant="ghost" onClick={() => setCashOpen("close")}>Fechar caixa</Button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-5">
        <Card className="lg:col-span-3">
          <div className="border-b border-line p-3">
            <div className="relative">
              <ScanBarcode className="pointer-events-none absolute left-3 top-1/2 size-5 -translate-y-1/2 text-fg-3" />
              <Input
                ref={searchRef}
                autoFocus
                value={q}
                onChange={(e) => setQ(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && onScan()}
                placeholder="Leia o código de barras ou pesquise o produto (Enter adiciona)"
                className="h-11 pl-10 text-base"
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2 p-3 sm:grid-cols-3">
            {results.map((p) => (
              <button
                key={p.id}
                onClick={() => {
                  add(p.id);
                  searchRef.current?.focus();
                }}
                className="rounded-lg border border-line p-3 text-left transition hover:border-accent hover:bg-accent-soft/40"
              >
                <span className="line-clamp-2 text-sm font-medium">{p.name}</span>
                <span className="tabular mt-1 block text-base font-semibold text-accent">{brl(p.price)}</span>
                <span className={cx("tabular text-xs", p.stock <= 0 ? "text-bad" : "text-fg-3")}>
                  Estoque: {num(p.stock)} · cód. {p.code}
                </span>
              </button>
            ))}
            {results.length === 0 && <p className="col-span-full py-8 text-center text-sm text-fg-3">Nenhum produto encontrado.</p>}
          </div>
        </Card>

        <div className="space-y-4 lg:col-span-2">
          <Card>
            <div className="flex items-end gap-2 border-b border-line p-3">
              <Field label="Cliente" className="min-w-0 flex-1">
                <Select value={customerId ?? ""} onChange={(e) => setCustomerId(e.target.value || null)}>
                  <option value="">Consumidor não identificado</option>
                  {customers.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name} {c.document ? `— ${formatDocument(c.document)}` : ""}
                    </option>
                  ))}
                </Select>
              </Field>
              {can("customers.manage") && (
                <Button aria-label="Cadastrar cliente" onClick={() => setNewCustomer(true)}>
                  <UserPlus className="size-4" />
                </Button>
              )}
            </div>
            <ul className="max-h-72 divide-y divide-line overflow-y-auto">
              {cart.map((l) => {
                const p = products.find((x) => x.id === l.productId)!;
                const setQty = (n: number) => {
                  setPayments([]);
                  setCart((c) => (n <= 0 ? c.filter((x) => x.productId !== l.productId) : c.map((x) => (x.productId === l.productId ? { ...x, quantity: n } : x))));
                };
                return (
                  <li key={l.productId} className="flex items-center gap-2 px-3 py-2">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{p.name}</p>
                      <p className="tabular text-xs text-fg-3">{brl(p.price)} × {num(l.quantity)}</p>
                    </div>
                    <div className="flex items-center gap-1">
                      <Button size="sm" variant="ghost" aria-label="Diminuir" onClick={() => setQty(l.quantity - 1)}>
                        <Minus className="size-3.5" />
                      </Button>
                      <span className="tabular w-6 text-center text-sm">{l.quantity}</span>
                      <Button size="sm" variant="ghost" aria-label="Aumentar" onClick={() => add(l.productId)}>
                        <Plus className="size-3.5" />
                      </Button>
                    </div>
                    <span className="tabular w-20 text-right text-sm font-medium">{brl(p.price * l.quantity)}</span>
                    <Button size="sm" variant="ghost" aria-label="Remover item" onClick={() => setQty(0)}>
                      <Trash2 className="size-3.5" />
                    </Button>
                  </li>
                );
              })}
              {cart.length === 0 && <li className="px-3 py-10 text-center text-sm text-fg-3">Carrinho vazio. Leia um código ou clique em um produto.</li>}
            </ul>
            <div className="space-y-1.5 border-t border-line p-3 text-sm">
              <div className="flex justify-between text-fg-2">
                <span>Subtotal</span>
                <span className="tabular">{brl(fromCents(totals?.subtotalCents ?? 0))}</span>
              </div>
              <div className="flex items-center justify-between gap-2 text-fg-2">
                <span>Desconto (R$)</span>
                <Input
                  aria-label="Desconto em reais"
                  type="number"
                  min={0}
                  step="0.01"
                  value={generalDiscount || ""}
                  disabled={!can("sales.discount") || cart.length === 0}
                  onChange={(e) => {
                    setGeneralDiscount(Number(e.target.value));
                    setPayments([]);
                  }}
                  className="h-8 !w-28 text-right"
                />
              </div>
              {totalsError && <p className="text-xs text-bad">{totalsError}</p>}
              {discountWarn && (
                <p className="text-xs text-warn">
                  Desconto de {totals!.discountPercent.toFixed(1)}% acima do limite do vendedor ({COMPANY.maxSellerDiscount}%) — precisa de gerente.
                </p>
              )}
              <div className="flex justify-between pt-1 text-lg font-semibold">
                <span>Total</span>
                <span className="tabular">{brl(fromCents(totalCents))}</span>
              </div>
            </div>
          </Card>

          <Card className="p-3">
            <p className="mb-2 text-xs font-medium text-fg-2">Forma de pagamento</p>
            <div className="grid grid-cols-3 gap-1.5">
              {(Object.keys(PAYMENT_METHOD_LABELS) as PaymentMethod[]).map((m) => {
                const Icon = METHOD_ICONS[m];
                return (
                  <button
                    key={m}
                    onClick={() => setMethod(m)}
                    className={cx(
                      "flex flex-col items-center gap-1 rounded-lg border px-1 py-2 text-[11px] font-medium transition",
                      method === m ? "border-accent bg-accent-soft text-accent" : "border-line text-fg-2 hover:bg-surface-2",
                    )}
                  >
                    <Icon className="size-4" />
                    {PAYMENT_METHOD_LABELS[m]}
                  </button>
                );
              })}
            </div>
            <div className="mt-3 grid grid-cols-2 gap-2">
              <Field label="Valor">
                <Input inputMode="decimal" placeholder={fromCents(Math.max(remainingCents, 0)).toFixed(2).replace(".", ",")} value={amount} onChange={(e) => setAmount(e.target.value)} />
              </Field>
              {method === "cash" ? (
                <Field label="Valor recebido (troco)">
                  <Input inputMode="decimal" value={tendered} onChange={(e) => setTendered(e.target.value)} placeholder="Ex.: 100,00" />
                </Field>
              ) : ["credit_card", "store_credit"].includes(method) ? (
                <Field label="Parcelas">
                  <Select value={installments} onChange={(e) => setInstallments(Number(e.target.value))}>
                    {Array.from({ length: 12 }, (_, i) => (
                      <option key={i} value={i + 1}>
                        {i + 1}x
                      </option>
                    ))}
                  </Select>
                </Field>
              ) : (
                <div />
              )}
            </div>
            <Button className="mt-2 w-full" disabled={cart.length === 0 || remainingCents <= 0} onClick={addPayment}>
              Adicionar pagamento
            </Button>
            {payments.length > 0 && (
              <ul className="mt-3 space-y-1 text-sm">
                {payments.map((p, i) => (
                  <li key={i} className="flex items-center justify-between gap-2 rounded-md bg-surface-2 px-2 py-1">
                    <span>
                      {PAYMENT_METHOD_LABELS[p.method]}
                      {p.installments && p.installments > 1 ? ` (${p.installments}x)` : ""}
                      {p.tendered ? ` · recebido ${brl(p.tendered)}` : ""}
                    </span>
                    <span className="flex items-center gap-1">
                      <span className="tabular font-medium">{brl(p.amount)}</span>
                      <button aria-label="Remover pagamento" className="rounded p-1 text-fg-3 hover:text-bad" onClick={() => setPayments(payments.filter((_, j) => j !== i))}>
                        <X className="size-3.5" />
                      </button>
                    </span>
                  </li>
                ))}
              </ul>
            )}
            <div className="mt-3 flex justify-between text-sm">
              <span className="text-fg-2">{remainingCents > 0 ? "Falta pagar" : "Troco"}</span>
              <span className={cx("tabular text-base font-semibold", remainingCents > 0 ? "text-warn" : "text-good")}>
                {brl(fromCents(remainingCents > 0 ? remainingCents : changeCents))}
              </span>
            </div>
            <Button variant="primary" className="mt-3 h-11 w-full text-base" disabled={cart.length === 0 || remainingCents !== 0 || !!totalsError} onClick={finish}>
              Finalizar venda
            </Button>
          </Card>
        </div>
      </div>

      {newCustomer && (
        <CustomerForm
          draft={{ ...emptyCustomer }}
          onClose={() => setNewCustomer(false)}
          onSave={(d) => {
            let created: { id: string } | null = null;
            if (run(() => { created = saveCustomer(d); }, "Cliente cadastrado.") && created) {
              setCustomerId((created as { id: string }).id);
              setNewCustomer(false);
            }
          }}
        />
      )}
      {receipt && <Receipt sale={receipt} onClose={() => setReceipt(null)} />}
      {cashOpen && <CashDialog mode={cashOpen} onClose={() => setCashOpen(null)} />}
    </>
  );
}

export function Receipt({ sale, onClose }: { sale: Sale; onClose: () => void }) {
  const { customers } = useStore();
  const customer = customers.find((c) => c.id === sale.customerId);
  return (
    <Modal
      open
      size="sm"
      title={`Venda nº ${sale.number}`}
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose}>Nova venda</Button>
          <Button variant="primary" onClick={() => window.print()}>
            <Printer className="size-4" /> Imprimir comprovante
          </Button>
        </>
      }
    >
      <div className="no-print mb-3">
        <Notice tone="warn">
          Emissão de NFC-e: no sistema real a nota é enviada ao provedor fiscal conforme a configuração. Nesta demonstração nenhuma nota é emitida.
        </Notice>
      </div>
      <div className="print-area mx-auto max-w-[300px] bg-white p-3 font-mono text-[11px] leading-snug text-neutral-900">
        <p className="text-center font-bold">{COMPANY.tradeName}</p>
        <p className="text-center">{COMPANY.legalName}</p>
        <p className="text-center">CNPJ {COMPANY.document}</p>
        <p className="mt-1 border-y border-dashed border-neutral-500 py-1 text-center font-bold">
          COMPROVANTE DE VENDA — NÃO É DOCUMENTO FISCAL
        </p>
        <p>Venda nº {sale.number} · {dateTime(sale.at)}</p>
        <p>Vendedor: {sale.seller}</p>
        {customer && <p>Cliente: {customer.name}</p>}
        <div className="my-1 border-b border-dashed border-neutral-500" />
        {sale.items.map((i) => (
          <div key={i.productId}>
            <p>{i.name}</p>
            <p className="flex justify-between">
              <span>{num(i.quantity)} {i.unit} × {brl(i.unitPrice)}</span>
              <span>{brl(i.total + i.discount)}</span>
            </p>
          </div>
        ))}
        <div className="my-1 border-b border-dashed border-neutral-500" />
        <p className="flex justify-between"><span>Subtotal</span><span>{brl(sale.subtotal)}</span></p>
        {sale.discount > 0 && <p className="flex justify-between"><span>Desconto</span><span>− {brl(sale.discount)}</span></p>}
        <p className="flex justify-between text-[13px] font-bold"><span>TOTAL</span><span>{brl(sale.total)}</span></p>
        {sale.payments.map((p, i) => (
          <p key={i} className="flex justify-between">
            <span>{PAYMENT_METHOD_LABELS[p.method]}{p.installments && p.installments > 1 ? ` ${p.installments}x` : ""}</span>
            <span>{brl(p.tendered ?? p.amount)}</span>
          </p>
        ))}
        {sale.change > 0 && <p className="flex justify-between"><span>Troco</span><span>{brl(sale.change)}</span></p>}
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
  const v = Number(value.replace(",", ".") || "0");
  const expected = cash.movements.reduce((a, m) => a + m.amount, 0);
  const titles = { open: "Abrir caixa", close: "Fechar caixa", supply: "Suprimento", withdrawal: "Sangria" };
  const submit = () => {
    if (mode === "open") {
      if (run(() => openCash(v), "Caixa aberto.")) onClose();
    }
    else if (mode === "close") {
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
            Esperado em dinheiro na gaveta: <b>{brl(expected)}</b> (abertura + vendas em dinheiro + suprimentos − sangrias − estornos). Conte e informe o valor.
          </Notice>
        )}
        <Field label={mode === "open" ? "Fundo de troco (R$)" : mode === "close" ? "Valor contado na gaveta (R$)" : "Valor (R$)"}>
          <Input autoFocus inputMode="decimal" value={value} onChange={(e) => setValue(e.target.value)} />
        </Field>
        {(mode === "supply" || mode === "withdrawal") && (
          <Field label="Descrição">
            <Input value={desc} onChange={(e) => setDesc(e.target.value)} placeholder={mode === "withdrawal" ? "Ex.: depósito no cofre" : "Ex.: reforço de troco"} />
          </Field>
        )}
      </div>
    </Modal>
  );
}
