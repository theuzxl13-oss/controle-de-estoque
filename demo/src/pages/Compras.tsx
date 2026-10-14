import { CheckCircle2, FilePlus2, FileText, Mail, MessageCircle, PackageCheck, Printer, Send, Trash2, XCircle } from "lucide-react";
import { useMemo, useState } from "react";

import { formatDocument } from "@erp/validation/documents";

import { Badge, brl, Button, buttonClass, Card, date, Field, Input, Modal, Notice, num, PageHeader, Select, Table, Tabs, Textarea, useFeedback } from "../components/ui";
import { COMPANY, productSupplier } from "../data/seed";
import type { PurchaseItem, PurchaseOrder, PurchaseStatus } from "../data/types";
import { PURCHASE_STATUS } from "../labels";
import { useStore } from "../store";

const orderTotals = (o: Pick<PurchaseOrder, "items" | "discount" | "freight">) => {
  const subtotal = o.items.reduce((a, i) => a + Math.round(i.quantity * i.unitPrice * 100) / 100, 0);
  return { subtotal, total: subtotal - o.discount + o.freight };
};

export function Compras() {
  const { purchaseOrders, suppliers, can } = useStore();
  const [status, setStatus] = useState<"open" | "all" | PurchaseStatus>("open");
  const [editing, setEditing] = useState<PurchaseOrder | "new" | null>(null);
  const [viewId, setViewId] = useState<string | null>(null);

  const list = useMemo(
    () =>
      purchaseOrders
        .filter((o) =>
          status === "all" ? true : status === "open" ? !["received", "cancelled"].includes(o.status) : o.status === status,
        )
        .sort((a, b) => b.number - a.number),
    [purchaseOrders, status],
  );
  const viewing = purchaseOrders.find((o) => o.id === viewId) ?? null;

  return (
    <>
      <PageHeader
        title="Pedidos de compra"
        description="Cargas da distribuidora: pedido com PDF, recebimento (parcial ou total) com entrada de cheios e devolução de vazios."
        actions={
          can("purchases.manage") && (
            <Button variant="primary" onClick={() => setEditing("new")}>
              <FilePlus2 className="size-4" /> Novo pedido
            </Button>
          )
        }
      />
      <Card>
        <div className="border-b border-line p-3">
          <Tabs
            value={status}
            onChange={setStatus}
            items={[
              { value: "open", label: "Em andamento" },
              { value: "draft", label: "Rascunhos" },
              { value: "received", label: "Recebidos" },
              { value: "cancelled", label: "Cancelados" },
              { value: "all", label: "Todos" },
            ]}
          />
        </div>
        <Table
          empty={list.length === 0}
          head={
            <>
              <th>Pedido</th>
              <th>Fornecedor</th>
              <th>Emissão</th>
              <th>Previsão</th>
              <th>Situação</th>
              <th className="text-right">Recebido</th>
              <th className="text-right">Total</th>
            </>
          }
        >
          {list.map((o) => {
            const s = suppliers.find((x) => x.id === o.supplierId)!;
            const q = o.items.reduce((a, i) => a + i.quantity, 0);
            const r = o.items.reduce((a, i) => a + i.received, 0);
            const late = o.expectedDate < new Date().toISOString().slice(0, 10) && ["sent", "confirmed", "partially_received"].includes(o.status);
            return (
              <tr key={o.id} className="cursor-pointer hover:bg-surface-2/60" onClick={() => setViewId(o.id)}>
                <td className="tabular font-medium">nº {o.number}</td>
                <td>{s.tradeName || s.legalName}</td>
                <td className="tabular text-fg-2">{date(o.issueDate)}</td>
                <td className="tabular text-fg-2">
                  {date(o.expectedDate)} {late && <Badge tone="bad">Atrasado</Badge>}
                </td>
                <td>
                  <Badge tone={PURCHASE_STATUS[o.status].tone}>{PURCHASE_STATUS[o.status].label}</Badge>
                </td>
                <td className="tabular text-right text-fg-2">{Math.round((r / q) * 100)}%</td>
                <td className="tabular text-right font-medium">{brl(orderTotals(o).total)}</td>
              </tr>
            );
          })}
        </Table>
      </Card>

      {editing && <OrderForm order={editing === "new" ? null : editing} onClose={() => setEditing(null)} onSaved={(o) => { setEditing(null); setViewId(o.id); }} />}
      {viewing && (
        <OrderDetail
          order={viewing}
          onClose={() => setViewId(null)}
          onEdit={() => {
            setEditing(viewing);
            setViewId(null);
          }}
        />
      )}
    </>
  );
}

function OrderForm({ order, onClose, onSaved }: { order: PurchaseOrder | null; onClose: () => void; onSaved: (o: PurchaseOrder) => void }) {
  const { suppliers, products, savePurchaseOrder } = useStore();
  const { run } = useFeedback();
  const [supplierId, setSupplierId] = useState(order?.supplierId ?? suppliers[0].id);
  const [items, setItems] = useState<PurchaseItem[]>(order?.items ?? []);
  const [discount, setDiscount] = useState(order?.discount ?? 0);
  const [freight, setFreight] = useState(order?.freight ?? 0);
  const supplier = suppliers.find((s) => s.id === supplierId)!;
  const [paymentMethod, setPaymentMethod] = useState(order?.paymentMethod ?? "Boleto");
  const [paymentTerms, setPaymentTerms] = useState(order?.paymentTerms ?? supplier.paymentTerms);
  const [dueDays, setDueDays] = useState(order?.dueDays ?? 28);
  const defaultDate = new Date(Date.now() + supplier.leadDays * 86400000).toISOString().slice(0, 10);
  const [expectedDate, setExpectedDate] = useState(order?.expectedDate ?? defaultDate);
  const [notes, setNotes] = useState(order?.notes ?? "");
  const [pick, setPick] = useState("");

  const suggestions = products.filter((p) => p.active && !items.some((i) => i.productId === p.id));
  const sorted = [...suggestions].sort((a, b) => Number(productSupplier[b.id] === supplierId) - Number(productSupplier[a.id] === supplierId));
  const totals = orderTotals({ items, discount, freight });

  const save = () => {
    let saved: PurchaseOrder | null = null;
    const ok = run(() => {
      if (discount > totals.subtotal + freight) throw new Error("Desconto maior que o valor do pedido.");
      saved = savePurchaseOrder({
        id: order?.id, supplierId, items, discount, freight, paymentMethod, paymentTerms, dueDays,
        expectedDate, notes, issueDate: order?.issueDate ?? new Date().toISOString().slice(0, 10),
      });
    }, "Pedido salvo como rascunho.");
    if (ok && saved) onSaved(saved);
  };

  return (
    <Modal
      open
      size="xl"
      title={order ? `Editar pedido nº ${order.number}` : "Novo pedido de compra"}
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose}>Cancelar</Button>
          <Button variant="primary" onClick={save}>
            Salvar pedido
          </Button>
        </>
      }
    >
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-4">
        <Field label="Fornecedor *" className="sm:col-span-2">
          <Select
            value={supplierId}
            onChange={(e) => {
              setSupplierId(e.target.value);
              setPaymentTerms(suppliers.find((s) => s.id === e.target.value)!.paymentTerms);
            }}
          >
            {suppliers.map((s) => (
              <option key={s.id} value={s.id}>
                {s.tradeName || s.legalName}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Previsão de entrega">
          <Input type="date" value={expectedDate} onChange={(e) => setExpectedDate(e.target.value)} />
        </Field>
        <Field label="Forma de pagamento">
          <Select value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value)}>
            {["Boleto", "Pix", "Transferência", "Cartão"].map((m) => (
              <option key={m}>{m}</option>
            ))}
          </Select>
        </Field>
        <Field label="Condições de pagamento" className="sm:col-span-2">
          <Input value={paymentTerms} onChange={(e) => setPaymentTerms(e.target.value)} />
        </Field>
        <Field label="Vencimento (dias após receber)">
          <Input type="number" min={0} value={dueDays} onChange={(e) => setDueDays(Number(e.target.value))} />
        </Field>
      </div>

      <div className="mt-5 flex flex-wrap items-end gap-2">
        <Field label="Adicionar produto" className="min-w-0 flex-1">
          <Select value={pick} onChange={(e) => setPick(e.target.value)}>
            <option value="">Selecione…</option>
            {sorted.map((p) => (
              <option key={p.id} value={p.id}>
                {p.code} — {p.name} {productSupplier[p.id] === supplierId ? "★" : ""} (cheios {num(p.stockFull)}{p.returnable ? `, vazios ${p.stockEmpty}` : ""})
              </option>
            ))}
          </Select>
        </Field>
        <Button
          disabled={!pick}
          onClick={() => {
            const p = products.find((x) => x.id === pick)!;
            setItems([...items, { productId: p.id, quantity: Math.max(p.returnable ? p.stockEmpty : p.minStock * 2 - p.stockFull, 1), unitPrice: p.costExchange, received: 0 }]);
            setPick("");
          }}
        >
          Adicionar
        </Button>
      </div>
      <p className="mt-1 text-xs text-fg-3">★ produtos deste fornecedor. Para botijões e galões, a quantidade sugerida é o número de vazios em estoque (troca 1 por 1).</p>

      <div className="mt-3 rounded-lg border border-line">
        <Table
          empty={items.length === 0}
          head={
            <>
              <th>Produto</th>
              <th className="w-28">Qtd.</th>
              <th className="w-36">Valor unit. (R$)</th>
              <th className="text-right">Total</th>
              <th />
            </>
          }
        >
          {items.map((it, idx) => {
            const p = products.find((x) => x.id === it.productId)!;
            const update = (patch: Partial<PurchaseItem>) => setItems(items.map((x, i) => (i === idx ? { ...x, ...patch } : x)));
            return (
              <tr key={it.productId}>
                <td>
                  {p.name}
                  <span className="block text-xs text-fg-3">Custo atual {brl(p.costExchange)}{p.returnable ? ` · ${p.stockEmpty} vazios para devolver` : ""}</span>
                </td>
                <td>
                  <Input type="number" min={1} value={it.quantity} onChange={(e) => update({ quantity: Number(e.target.value) })} />
                </td>
                <td>
                  <Input type="number" min={0} step="0.01" value={it.unitPrice} onChange={(e) => update({ unitPrice: Number(e.target.value) })} />
                </td>
                <td className="tabular text-right">{brl(it.quantity * it.unitPrice)}</td>
                <td className="text-right">
                  <Button size="sm" variant="ghost" aria-label="Remover" onClick={() => setItems(items.filter((_, i) => i !== idx))}>
                    <Trash2 className="size-4" />
                  </Button>
                </td>
              </tr>
            );
          })}
        </Table>
      </div>

      <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-4">
        <Field label="Observações" className="sm:col-span-2">
          <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} />
        </Field>
        <div className="space-y-3">
          <Field label="Desconto (R$)">
            <Input type="number" min={0} step="0.01" value={discount} onChange={(e) => setDiscount(Number(e.target.value))} />
          </Field>
          <Field label="Frete (R$)">
            <Input type="number" min={0} step="0.01" value={freight} onChange={(e) => setFreight(Number(e.target.value))} />
          </Field>
        </div>
        <div className="rounded-lg bg-surface-2 p-3 text-sm">
          <Row label="Subtotal" value={brl(totals.subtotal)} />
          <Row label="Desconto" value={`− ${brl(discount)}`} />
          <Row label="Frete" value={brl(freight)} />
          <div className="mt-2 border-t border-line pt-2">
            <Row label="Total" value={brl(totals.total)} strong />
          </div>
        </div>
      </div>
    </Modal>
  );
}

function Row({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className={`flex justify-between gap-2 py-0.5 ${strong ? "font-semibold" : "text-fg-2"}`}>
      <span>{label}</span>
      <span className="tabular">{value}</span>
    </div>
  );
}

function OrderDetail({ order, onClose, onEdit }: { order: PurchaseOrder; onClose: () => void; onEdit: () => void }) {
  const { suppliers, products, can, setPurchaseStatus, receivePurchase } = useStore();
  const { run, confirm } = useFeedback();
  const [mode, setMode] = useState<"view" | "receive" | "pdf">("view");
  const [qty, setQty] = useState<Record<string, number>>({});
  const [invoice, setInvoice] = useState("");
  const [returnEmpties, setReturnEmpties] = useState(true);
  const supplier = suppliers.find((s) => s.id === order.supplierId)!;
  const t = orderTotals(order);
  const canReceive = can("purchases.receive") && ["sent", "confirmed", "partially_received"].includes(order.status);

  const setStatus = async (s: PurchaseStatus, msg: string) => {
    if (s === "cancelled" && !(await confirm({ title: "Cancelar pedido", message: `Cancelar o pedido nº ${order.number}? Itens já recebidos permanecem no estoque.`, confirmLabel: "Cancelar pedido", danger: true }))) return;
    run(() => setPurchaseStatus(order.id, s), msg);
  };

  if (mode === "pdf") return <OrderPdf order={order} onBack={() => setMode("view")} onClose={onClose} />;

  return (
    <Modal
      open
      size="xl"
      title={`Pedido de compra nº ${order.number}`}
      onClose={onClose}
      footer={
        mode === "receive" ? (
          <>
            <Button onClick={() => setMode("view")}>Voltar</Button>
            <Button
              variant="primary"
              onClick={() => run(() => receivePurchase(order.id, qty, invoice, returnEmpties), "Recebimento registrado e estoque atualizado.") && setMode("view")}
            >
              <PackageCheck className="size-4" /> Confirmar recebimento
            </Button>
          </>
        ) : (
          <>
            <Button onClick={() => setMode("pdf")}>
              <FileText className="size-4" /> Gerar PDF
            </Button>
            {can("purchases.manage") && (order.status === "draft" || order.status === "sent") && <Button onClick={onEdit}>Editar</Button>}
            {can("purchases.manage") && ["draft", "sent", "confirmed", "partially_received"].includes(order.status) && (
              <Button variant="ghost" onClick={() => setStatus("cancelled", "Pedido cancelado.")}>
                <XCircle className="size-4" /> Cancelar
              </Button>
            )}
            {can("purchases.manage") && order.status === "draft" && (
              <Button onClick={() => setStatus("sent", "Pedido marcado como enviado.")}>
                <Send className="size-4" /> Marcar como enviado
              </Button>
            )}
            {can("purchases.manage") && (order.status === "draft" || order.status === "sent") && (
              <Button onClick={() => setStatus("confirmed", "Pedido confirmado pelo fornecedor.")}>
                <CheckCircle2 className="size-4" /> Confirmar
              </Button>
            )}
            {canReceive && (
              <Button
                variant="primary"
                onClick={() => {
                  setQty(Object.fromEntries(order.items.map((i) => [i.productId, i.quantity - i.received])));
                  setMode("receive");
                }}
              >
                <PackageCheck className="size-4" /> Receber mercadorias
              </Button>
            )}
          </>
        )
      }
    >
      <div className="flex flex-wrap items-center gap-2">
        <Badge tone={PURCHASE_STATUS[order.status].tone}>{PURCHASE_STATUS[order.status].label}</Badge>
        <span className="text-sm text-fg-2">
          {supplier.tradeName || supplier.legalName} · emitido em {date(order.issueDate)} · previsão {date(order.expectedDate)}
        </span>
      </div>
      {mode === "receive" && (
        <div className="mt-3 space-y-3">
          <Notice>Confira as quantidades efetivamente entregues. O estoque de cheios só aumenta com esta confirmação; o restante continua pendente.</Notice>
          <label className="flex items-start gap-2 text-sm">
            <input type="checkbox" className="mt-0.5 size-4" checked={returnEmpties} onChange={(e) => setReturnEmpties(e.target.checked)} />
            <span>
              <b>Devolvi os vazios na troca</b> (botijões/galões)
              <span className="block text-xs text-fg-3">Desmarque se comprou vasilhames novos — aí os vazios não saem do estoque.</span>
            </span>
          </label>
          <Field label="Nº da nota fiscal do fornecedor" className="max-w-xs">
            <Input value={invoice} onChange={(e) => setInvoice(e.target.value)} />
          </Field>
        </div>
      )}
      <div className="mt-3 rounded-lg border border-line">
        <Table
          head={
            <>
              <th>Produto</th>
              <th className="text-right">Pedido</th>
              <th className="text-right">Recebido</th>
              <th className="text-right">Pendente</th>
              {mode === "receive" && <th className="w-32">Receber agora</th>}
              <th className="text-right">Unitário</th>
              <th className="text-right">Total</th>
            </>
          }
        >
          {order.items.map((it) => {
            const p = products.find((x) => x.id === it.productId)!;
            const pending = it.quantity - it.received;
            return (
              <tr key={it.productId}>
                <td>{p.name}</td>
                <td className="tabular text-right">{num(it.quantity)}</td>
                <td className="tabular text-right">{num(it.received)}</td>
                <td className="tabular text-right">{pending > 0 ? <Badge tone="warn">{num(pending)}</Badge> : "—"}</td>
                {mode === "receive" && (
                  <td>
                    <Input
                      type="number"
                      min={0}
                      max={pending}
                      disabled={pending === 0}
                      value={qty[it.productId] ?? 0}
                      onChange={(e) => setQty({ ...qty, [it.productId]: Number(e.target.value) })}
                    />
                  </td>
                )}
                <td className="tabular text-right text-fg-2">{brl(it.unitPrice)}</td>
                <td className="tabular text-right">{brl(it.quantity * it.unitPrice)}</td>
              </tr>
            );
          })}
        </Table>
      </div>
      <div className="mt-3 flex flex-wrap justify-between gap-4 text-sm">
        <div className="text-fg-2">
          <p>Pagamento: {order.paymentMethod} — {order.paymentTerms}</p>
          {order.notes && <p className="mt-1">Obs.: {order.notes}</p>}
        </div>
        <div className="w-56">
          <Row label="Subtotal" value={brl(t.subtotal)} />
          <Row label="Desconto" value={`− ${brl(order.discount)}`} />
          <Row label="Frete" value={brl(order.freight)} />
          <Row label="Total" value={brl(t.total)} strong />
        </div>
      </div>
    </Modal>
  );
}

function OrderPdf({ order, onBack, onClose }: { order: PurchaseOrder; onBack: () => void; onClose: () => void }) {
  const { suppliers, products } = useStore();
  const s = suppliers.find((x) => x.id === order.supplierId)!;
  const t = orderTotals(order);
  const shareText = `Olá, ${s.representative}! Segue o pedido de compra nº ${order.number} da ${COMPANY.legalName}, total ${brl(t.total)}, previsão de entrega ${date(order.expectedDate)}.`;
  const phone = s.whatsapp.replace(/\D/g, "");

  return (
    <Modal
      open
      size="xl"
      title={`PDF — Pedido nº ${order.number}`}
      onClose={onClose}
      footer={
        <>
          <Button onClick={onBack}>Voltar</Button>
          <a className={buttonClass()} href={`https://wa.me/55${phone}?text=${encodeURIComponent(shareText)}`} target="_blank" rel="noreferrer">
            <MessageCircle className="size-4" /> WhatsApp
          </a>
          <a className={buttonClass()} href={`mailto:${s.email}?subject=${encodeURIComponent(`Pedido de compra nº ${order.number}`)}&body=${encodeURIComponent(shareText)}`}>
            <Mail className="size-4" /> E-mail
          </a>
          <Button variant="primary" onClick={() => window.print()}>
            <Printer className="size-4" /> Imprimir / salvar PDF
          </Button>
        </>
      }
    >
      <p className="no-print mb-3 text-xs text-fg-3">
        Em “Imprimir / salvar PDF”, escolha “Salvar como PDF”. No sistema final o PDF é gerado no servidor e o link é anexado ao WhatsApp/e-mail.
      </p>
      <div className="print-area mx-auto w-full max-w-[794px] rounded-lg border border-line bg-white p-8 text-[12px] leading-relaxed text-neutral-900 shadow-sm">
        <div className="flex items-start justify-between gap-4 border-b-2 border-neutral-800 pb-4">
          <div className="flex items-start gap-3">
            <div className="grid size-12 place-items-center rounded-lg bg-[#2a78d6] text-lg font-bold text-white">LE</div>
            <div>
              <p className="text-base font-bold">{COMPANY.legalName}</p>
              <p>CNPJ {COMPANY.document} · IE {COMPANY.stateRegistration}</p>
              <p>{COMPANY.address}</p>
              <p>{COMPANY.phone} · {COMPANY.email}</p>
            </div>
          </div>
          <div className="text-right">
            <p className="text-[11px] uppercase tracking-wide text-neutral-500">Pedido de compra</p>
            <p className="text-2xl font-bold">nº {String(order.number).padStart(6, "0")}</p>
            <p>Emissão: {date(order.issueDate)}</p>
          </div>
        </div>

        <div className="mt-4 rounded border border-neutral-300 p-3">
          <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-neutral-500">Fornecedor</p>
          <p className="font-semibold">{s.legalName}</p>
          <p>CNPJ {formatDocument(s.document)}{s.stateRegistration && ` · IE ${s.stateRegistration}`}</p>
          <p>{s.city}/{s.state} · {s.phone} · {s.email}</p>
          <p>A/C: {s.representative}</p>
        </div>

        <table className="mt-4 w-full border-collapse">
          <thead>
            <tr className="bg-neutral-100 text-left">
              <th className="border border-neutral-300 px-2 py-1.5">Código</th>
              <th className="border border-neutral-300 px-2 py-1.5">Descrição</th>
              <th className="border border-neutral-300 px-2 py-1.5 text-right">Qtd.</th>
              <th className="border border-neutral-300 px-2 py-1.5 text-right">Valor unit.</th>
              <th className="border border-neutral-300 px-2 py-1.5 text-right">Valor total</th>
            </tr>
          </thead>
          <tbody>
            {order.items.map((it) => {
              const p = products.find((x) => x.id === it.productId)!;
              return (
                <tr key={it.productId}>
                  <td className="border border-neutral-300 px-2 py-1.5">{p.code}</td>
                  <td className="border border-neutral-300 px-2 py-1.5">{p.name}</td>
                  <td className="border border-neutral-300 px-2 py-1.5 text-right">{num(it.quantity)} {p.returnable ? "cheios" : "un"}</td>
                  <td className="border border-neutral-300 px-2 py-1.5 text-right">{brl(it.unitPrice)}</td>
                  <td className="border border-neutral-300 px-2 py-1.5 text-right">{brl(it.quantity * it.unitPrice)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>

        <div className="mt-4 flex justify-between gap-6">
          <div className="flex-1 space-y-1">
            <p><b>Forma de pagamento:</b> {order.paymentMethod} — {order.paymentTerms}</p>
            <p><b>Prazo de entrega:</b> {date(order.expectedDate)}</p>
            {order.notes && <p><b>Observações:</b> {order.notes}</p>}
          </div>
          <table className="w-60">
            <tbody>
              <tr><td>Subtotal</td><td className="text-right">{brl(t.subtotal)}</td></tr>
              <tr><td>Descontos</td><td className="text-right">− {brl(order.discount)}</td></tr>
              <tr><td>Frete</td><td className="text-right">{brl(order.freight)}</td></tr>
              <tr className="border-t-2 border-neutral-800 text-sm font-bold"><td className="pt-1">Valor total</td><td className="pt-1 text-right">{brl(t.total)}</td></tr>
            </tbody>
          </table>
        </div>

        <div className="mt-14 grid grid-cols-2 gap-10 text-center">
          <div className="border-t border-neutral-500 pt-1">{COMPANY.legalName}</div>
          <div className="border-t border-neutral-500 pt-1">De acordo — {s.tradeName || s.legalName}</div>
        </div>
        <p className="mt-6 text-center text-[10px] text-neutral-500">Documento gerado na demonstração do ERP — dados fictícios.</p>
      </div>
    </Modal>
  );
}
