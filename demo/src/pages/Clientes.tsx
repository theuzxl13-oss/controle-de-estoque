import { Download, Pencil, UserPlus } from "lucide-react";
import { useMemo, useState } from "react";

import { formatDocument, isValidDocument, normalizeDocument } from "@erp/validation/documents";

import { Badge, brl, Button, Card, date, dateTime, Field, Input, Modal, PageHeader, SearchInput, Select, Table, Textarea, useFeedback, usePagination } from "../components/ui";
import { downloadCsv } from "../csv";
import type { Customer } from "../data/types";
import { useStore } from "../store";

export type CustomerDraft = Omit<Customer, "id" | "createdAt"> & { id?: string };

export const emptyCustomer: CustomerDraft = {
  personType: "PF", document: "", name: "", tradeName: "", phone: "", whatsapp: "", email: "",
  zip: "", street: "", number: "", district: "", city: "", state: "", notes: "",
};

export function Clientes() {
  const { customers, sales, can, saveCustomer } = useStore();
  const { run } = useFeedback();
  const [q, setQ] = useState("");
  const [editing, setEditing] = useState<CustomerDraft | null>(null);
  const [detail, setDetail] = useState<Customer | null>(null);

  const stats = useMemo(() => {
    const m = new Map<string, { total: number; last: string | null; count: number }>();
    for (const s of sales) {
      if (!s.customerId || s.status !== "completed") continue;
      const cur = m.get(s.customerId) ?? { total: 0, last: null, count: 0 };
      cur.total += s.total;
      cur.count++;
      if (!cur.last || s.at > cur.last) cur.last = s.at;
      m.set(s.customerId, cur);
    }
    return m;
  }, [sales]);

  const filtered = useMemo(() => {
    const t = q.trim().toLowerCase();
    const d = normalizeDocument(q);
    return customers.filter(
      (c) => !t || c.name.toLowerCase().includes(t) || (d && normalizeDocument(c.document).includes(d)) || c.email.includes(t),
    );
  }, [customers, q]);
  const { slice, control } = usePagination(filtered, 12);

  return (
    <>
      <PageHeader
        title="Clientes"
        description="Pessoas físicas e jurídicas, com histórico de compras."
        actions={
          <>
            <Button
              onClick={() =>
                downloadCsv(
                  "clientes.csv",
                  ["nome", "tipo", "documento", "telefone", "whatsapp", "email", "cidade", "uf", "cadastro"],
                  filtered.map((c) => [c.name, c.personType, formatDocument(c.document), c.phone, c.whatsapp, c.email, c.city, c.state, date(c.createdAt)]),
                )
              }
            >
              <Download className="size-4" /> Exportar
            </Button>
            {can("customers.manage") && (
              <Button variant="primary" onClick={() => setEditing({ ...emptyCustomer })}>
                <UserPlus className="size-4" /> Novo cliente
              </Button>
            )}
          </>
        }
      />
      <Card>
        <div className="border-b border-line p-3">
          <SearchInput value={q} onChange={setQ} placeholder="Nome, CPF/CNPJ ou e-mail" />
        </div>
        <Table
          empty={filtered.length === 0}
          head={
            <>
              <th>Cliente</th>
              <th>CPF/CNPJ</th>
              <th>Contato</th>
              <th className="text-right">Total gasto</th>
              <th>Última compra</th>
              <th />
            </>
          }
        >
          {slice.map((c) => {
            const st = stats.get(c.id);
            return (
              <tr key={c.id} className="cursor-pointer hover:bg-surface-2/60" onClick={() => setDetail(c)}>
                <td>
                  <div className="font-medium">{c.name}</div>
                  <Badge>{c.personType === "PF" ? "Pessoa física" : "Pessoa jurídica"}</Badge>
                </td>
                <td className="tabular text-fg-2">{c.document ? formatDocument(c.document) : "—"}</td>
                <td className="text-fg-2">
                  {c.whatsapp || c.phone}
                  <span className="block text-xs text-fg-3">{c.email}</span>
                </td>
                <td className="tabular text-right font-medium">{brl(st?.total ?? 0)}</td>
                <td className="tabular text-fg-2">{st?.last ? date(st.last) : "—"}</td>
                <td className="text-right">
                  {can("customers.manage") && (
                    <Button
                      size="sm"
                      variant="ghost"
                      aria-label="Editar"
                      onClick={(e) => {
                        e.stopPropagation();
                        setEditing({ ...c });
                      }}
                    >
                      <Pencil className="size-4" />
                    </Button>
                  )}
                </td>
              </tr>
            );
          })}
        </Table>
        {control}
      </Card>

      {editing && (
        <CustomerForm
          draft={editing}
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
  const history = sales.filter((s) => s.customerId === customer.id).sort((a, b) => b.at.localeCompare(a.at));
  const total = history.filter((s) => s.status === "completed").reduce((a, s) => a + s.total, 0);
  return (
    <Modal open size="lg" title={customer.name} onClose={onClose}>
      <dl className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
        <div>
          <dt className="text-xs text-fg-3">Documento</dt>
          <dd className="tabular">{customer.document ? formatDocument(customer.document) : "Não informado"}</dd>
        </div>
        <div>
          <dt className="text-xs text-fg-3">Total gasto</dt>
          <dd className="tabular font-semibold">{brl(total)}</dd>
        </div>
        <div>
          <dt className="text-xs text-fg-3">Compras</dt>
          <dd>{history.length}</dd>
        </div>
        <div>
          <dt className="text-xs text-fg-3">Cliente desde</dt>
          <dd>{date(customer.createdAt)}</dd>
        </div>
        <div className="col-span-2 sm:col-span-4">
          <dt className="text-xs text-fg-3">Endereço</dt>
          <dd>
            {[customer.street, customer.number, customer.district, customer.city, customer.state].filter(Boolean).join(", ") || "—"}
          </dd>
        </div>
      </dl>
      <h3 className="mt-5 mb-2 text-sm font-semibold">Histórico de compras</h3>
      <div className="rounded-lg border border-line">
        <Table
          empty={history.length === 0}
          head={
            <>
              <th>Venda</th>
              <th>Data</th>
              <th>Itens</th>
              <th className="text-right">Total</th>
              <th>Situação</th>
            </>
          }
        >
          {history.slice(0, 15).map((s) => (
            <tr key={s.id}>
              <td className="tabular">nº {s.number}</td>
              <td className="tabular text-fg-2">{dateTime(s.at)}</td>
              <td className="text-fg-2">{s.items.map((i) => i.name).join(", ")}</td>
              <td className="tabular text-right">{brl(s.total)}</td>
              <td>{s.status === "completed" ? <Badge tone="good">Concluída</Badge> : <Badge tone="bad">Cancelada</Badge>}</td>
            </tr>
          ))}
        </Table>
      </div>
      <p className="mt-3 text-xs text-fg-3">Notas fiscais do cliente aparecerão aqui após a integração com o provedor fiscal (Etapa 6).</p>
    </Modal>
  );
}

export function CustomerForm({ draft, onClose, onSave }: { draft: CustomerDraft; onClose: () => void; onSave: (d: CustomerDraft) => void }) {
  const [d, setD] = useState(draft);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const set = <K extends keyof CustomerDraft>(k: K, v: CustomerDraft[K]) => setD((x) => ({ ...x, [k]: v }));

  const submit = () => {
    const e: Record<string, string> = {};
    if (d.name.trim().length < 2) e.name = "Informe o nome.";
    if (d.document && !isValidDocument(d.personType, d.document)) e.document = d.personType === "PF" ? "CPF inválido." : "CNPJ inválido.";
    if (d.email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(d.email)) e.email = "E-mail inválido.";
    setErrors(e);
    if (Object.keys(e).length === 0) onSave({ ...d, document: normalizeDocument(d.document) });
  };

  return (
    <Modal
      open
      size="lg"
      title={d.id ? "Editar cliente" : "Novo cliente"}
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose}>Cancelar</Button>
          <Button variant="primary" onClick={submit}>
            Salvar
          </Button>
        </>
      }
    >
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-6">
        <Field label="Tipo" className="sm:col-span-2">
          <Select value={d.personType} onChange={(e) => set("personType", e.target.value as "PF" | "PJ")}>
            <option value="PF">Pessoa física</option>
            <option value="PJ">Pessoa jurídica</option>
          </Select>
        </Field>
        <Field label={d.personType === "PF" ? "CPF" : "CNPJ"} error={errors.document} hint="Opcional para consumidor" className="sm:col-span-4">
          <Input value={d.document} onChange={(e) => set("document", e.target.value)} placeholder={d.personType === "PF" ? "000.000.000-00" : "00.000.000/0000-00"} />
        </Field>
        <Field label={d.personType === "PF" ? "Nome completo *" : "Razão social *"} error={errors.name} className="sm:col-span-6">
          <Input value={d.name} onChange={(e) => set("name", e.target.value)} />
        </Field>
        {d.personType === "PJ" && (
          <Field label="Nome fantasia" className="sm:col-span-6">
            <Input value={d.tradeName} onChange={(e) => set("tradeName", e.target.value)} />
          </Field>
        )}
        <Field label="Telefone" className="sm:col-span-2">
          <Input value={d.phone} onChange={(e) => set("phone", e.target.value)} />
        </Field>
        <Field label="WhatsApp" className="sm:col-span-2">
          <Input value={d.whatsapp} onChange={(e) => set("whatsapp", e.target.value)} />
        </Field>
        <Field label="E-mail" error={errors.email} className="sm:col-span-2">
          <Input type="email" value={d.email} onChange={(e) => set("email", e.target.value)} />
        </Field>
        <Field label="CEP" className="sm:col-span-2">
          <Input value={d.zip} onChange={(e) => set("zip", e.target.value)} />
        </Field>
        <Field label="Endereço" className="sm:col-span-3">
          <Input value={d.street} onChange={(e) => set("street", e.target.value)} />
        </Field>
        <Field label="Número" className="sm:col-span-1">
          <Input value={d.number} onChange={(e) => set("number", e.target.value)} />
        </Field>
        <Field label="Bairro" className="sm:col-span-2">
          <Input value={d.district} onChange={(e) => set("district", e.target.value)} />
        </Field>
        <Field label="Cidade" className="sm:col-span-3">
          <Input value={d.city} onChange={(e) => set("city", e.target.value)} />
        </Field>
        <Field label="UF" className="sm:col-span-1">
          <Input maxLength={2} value={d.state} onChange={(e) => set("state", e.target.value.toUpperCase())} />
        </Field>
        <Field label="Observações" className="sm:col-span-6">
          <Textarea value={d.notes} onChange={(e) => set("notes", e.target.value)} />
        </Field>
      </div>
    </Modal>
  );
}
