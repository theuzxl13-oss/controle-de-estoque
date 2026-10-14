import { MessageCircle, Pencil, UserPlus } from "lucide-react";
import { useMemo, useState } from "react";

import { Badge, brl, Button, buttonClass, Card, date, dateTime, Modal, PageHeader, SearchInput, Table, useFeedback, usePagination } from "../components/ui";
import { downloadCsv } from "../csv";
import type { Customer } from "../data/types";
import { useStore } from "../store";
import { customerHistory, METHOD_LABELS, MODE_LABELS, QuickCustomer } from "./Pdv";

export function Clientes() {
  const { customers, sales, can, saveCustomer } = useStore();
  const { run } = useFeedback();
  const [q, setQ] = useState("");
  const [editing, setEditing] = useState<Customer | "new" | null>(null);
  const [detail, setDetail] = useState<Customer | null>(null);

  const rows = useMemo(() => {
    const t = q.trim().toLowerCase();
    const d = q.replace(/\D/g, "");
    return customers
      .filter((c) => !t || c.name.toLowerCase().includes(t) || (d.length >= 3 && c.phone.replace(/\D/g, "").includes(d)) || c.district.toLowerCase().includes(t))
      .map((c) => ({ c, h: customerHistory(sales, c.id) }))
      .sort((a, b) => (b.h.last?.at ?? "").localeCompare(a.h.last?.at ?? ""));
  }, [customers, sales, q]);
  const { slice, control } = usePagination(rows, 15);

  return (
    <>
      <PageHeader
        title="Clientes"
        description="Telefone e endereço para entrega, histórico e frequência de compra."
        actions={
          <>
            <Button
              onClick={() =>
                downloadCsv(
                  "clientes.csv",
                  ["nome", "telefone", "endereco", "bairro", "referencia", "compras", "total_gasto", "ultima_compra", "frequencia_dias"],
                  rows.map(({ c, h }) => [c.name, c.phone, `${c.street}, ${c.number}`, c.district, c.reference, h.count, Math.round(h.total * 100) / 100, h.last ? date(h.last.at) : "", h.avgDays ?? ""]),
                )
              }
            >
              Exportar
            </Button>
            {can("customers.manage") && (
              <Button variant="primary" onClick={() => setEditing("new")}>
                <UserPlus className="size-4" /> Novo cliente
              </Button>
            )}
          </>
        }
      />
      <Card>
        <div className="border-b border-line p-3">
          <SearchInput value={q} onChange={setQ} placeholder="Nome, telefone ou bairro" />
        </div>
        <Table
          empty={rows.length === 0}
          head={
            <>
              <th>Cliente</th>
              <th>Endereço</th>
              <th>Última compra</th>
              <th className="text-center">Frequência</th>
              <th className="text-right">Total gasto</th>
              <th />
            </>
          }
        >
          {slice.map(({ c, h }) => (
            <tr key={c.id} className="cursor-pointer hover:bg-surface-2/60" onClick={() => setDetail(c)}>
              <td>
                <div className="font-medium">{c.name}</div>
                <div className="text-xs text-fg-3">{c.phone}</div>
              </td>
              <td className="text-fg-2">
                {c.street}, {c.number}
                <span className="block text-xs text-fg-3">
                  {c.district}
                  {c.reference && ` · ${c.reference}`}
                </span>
              </td>
              <td className="text-fg-2">
                {h.last ? date(h.last.at) : "—"}
                {h.last && <span className="block text-xs text-fg-3">{h.last.items.map((i) => `${i.quantity}× ${i.name.split(" (")[0]}`).join(", ")}</span>}
              </td>
              <td className="text-center">{h.avgDays ? <Badge tone="info">a cada {h.avgDays} dias</Badge> : <span className="text-fg-3">—</span>}</td>
              <td className="tabular text-right font-medium">{brl(h.total)}</td>
              <td className="whitespace-nowrap text-right" onClick={(e) => e.stopPropagation()}>
                <a className={buttonClass("ghost", "sm")} href={`https://wa.me/55${c.phone.replace(/\D/g, "")}`} target="_blank" rel="noreferrer" aria-label="WhatsApp">
                  <MessageCircle className="size-4" />
                </a>
                {can("customers.manage") && (
                  <Button size="sm" variant="ghost" aria-label="Editar" onClick={() => setEditing(c)}>
                    <Pencil className="size-4" />
                  </Button>
                )}
              </td>
            </tr>
          ))}
        </Table>
        {control}
      </Card>

      {editing && (
        <QuickCustomer
          initial={editing === "new" ? undefined : editing}
          onClose={() => setEditing(null)}
          onSave={(d) => run(() => saveCustomer(d), "Cliente salvo.") && setEditing(null)}
        />
      )}
      {detail && <CustomerDetail customer={detail} onClose={() => setDetail(null)} />}
    </>
  );
}

function CustomerDetail({ customer, onClose }: { customer: Customer; onClose: () => void }) {
  const { sales } = useStore();
  const h = customerHistory(sales, customer.id);
  const list = sales.filter((s) => s.customerId === customer.id).sort((a, b) => b.at.localeCompare(a.at));
  return (
    <Modal open size="lg" title={customer.name} onClose={onClose}>
      <dl className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
        <div>
          <dt className="text-xs text-fg-3">Telefone</dt>
          <dd>{customer.phone}</dd>
        </div>
        <div>
          <dt className="text-xs text-fg-3">Compras</dt>
          <dd>{h.count}</dd>
        </div>
        <div>
          <dt className="text-xs text-fg-3">Total gasto</dt>
          <dd className="tabular font-semibold">{brl(h.total)}</dd>
        </div>
        <div>
          <dt className="text-xs text-fg-3">Frequência</dt>
          <dd>{h.avgDays ? `a cada ~${h.avgDays} dias` : "—"}</dd>
        </div>
        <div className="col-span-2 sm:col-span-4">
          <dt className="text-xs text-fg-3">Endereço</dt>
          <dd>
            {customer.street}, {customer.number} — {customer.district}
            {customer.reference && ` · ${customer.reference}`}
          </dd>
        </div>
        {customer.notes && (
          <div className="col-span-2 sm:col-span-4">
            <dt className="text-xs text-fg-3">Observações</dt>
            <dd>{customer.notes}</dd>
          </div>
        )}
      </dl>
      <h3 className="mt-5 mb-2 text-sm font-semibold">Histórico de compras</h3>
      <div className="rounded-lg border border-line">
        <Table
          empty={list.length === 0}
          head={
            <>
              <th>Venda</th>
              <th>Data</th>
              <th>Itens</th>
              <th>Pagamento</th>
              <th className="text-right">Total</th>
            </>
          }
        >
          {list.slice(0, 20).map((s) => (
            <tr key={s.id}>
              <td className="tabular">
                nº {s.number} {s.status === "cancelled" && <Badge tone="bad">Cancelada</Badge>}
              </td>
              <td className="tabular text-fg-2">{dateTime(s.at)}</td>
              <td className="text-fg-2">{s.items.map((i) => `${i.quantity}× ${i.name.split(" (")[0]}${i.mode !== "unidade" ? ` (${MODE_LABELS[i.mode]})` : ""}`).join(", ")}</td>
              <td className="text-fg-2">{METHOD_LABELS[s.method]}</td>
              <td className="tabular text-right">{brl(s.total)}</td>
            </tr>
          ))}
        </Table>
      </div>
    </Modal>
  );
}
