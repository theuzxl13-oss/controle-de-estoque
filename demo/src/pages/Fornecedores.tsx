import { Pencil, Plus } from "lucide-react";
import { useMemo, useState } from "react";

import { formatDocument, isValidCnpj, isValidCpf, normalizeDocument } from "@erp/validation/documents";

import { Badge, brl, Button, Card, date, Field, Input, Modal, PageHeader, SearchInput, Table, Textarea, useFeedback } from "../components/ui";
import type { Supplier } from "../data/types";
import { PURCHASE_STATUS } from "../labels";
import { useStore } from "../store";

type Draft = Omit<Supplier, "id"> & { id?: string };
const empty: Draft = {
  document: "", legalName: "", tradeName: "", stateRegistration: "", representative: "", phone: "", whatsapp: "",
  email: "", city: "", state: "", leadDays: 7, paymentTerms: "", notes: "",
};

export function Fornecedores() {
  const { suppliers, products, purchaseOrders, can, saveSupplier } = useStore();
  const { run } = useFeedback();
  const [q, setQ] = useState("");
  const [editing, setEditing] = useState<Draft | null>(null);
  const [detail, setDetail] = useState<Supplier | null>(null);

  const filtered = useMemo(() => {
    const t = q.trim().toLowerCase();
    return suppliers.filter((s) => !t || `${s.legalName} ${s.tradeName} ${s.document}`.toLowerCase().includes(t));
  }, [suppliers, q]);

  return (
    <>
      <PageHeader
        title="Fornecedores"
        description="Cadastro, produtos fornecidos e histórico de pedidos."
        actions={
          can("suppliers.manage") && (
            <Button variant="primary" onClick={() => setEditing({ ...empty })}>
              <Plus className="size-4" /> Novo fornecedor
            </Button>
          )
        }
      />
      <Card>
        <div className="border-b border-line p-3">
          <SearchInput value={q} onChange={setQ} placeholder="Razão social, fantasia ou CNPJ" />
        </div>
        <Table
          empty={filtered.length === 0}
          head={
            <>
              <th>Fornecedor</th>
              <th>CNPJ/CPF</th>
              <th>Representante</th>
              <th>Prazo de entrega</th>
              <th>Condições</th>
              <th className="text-right">Produtos</th>
              <th />
            </>
          }
        >
          {filtered.map((s) => (
            <tr key={s.id} className="cursor-pointer hover:bg-surface-2/60" onClick={() => setDetail(s)}>
              <td>
                <div className="font-medium">{s.tradeName || s.legalName}</div>
                <div className="text-xs text-fg-3">{s.legalName} · {s.city}/{s.state}</div>
              </td>
              <td className="tabular text-fg-2">{formatDocument(s.document)}</td>
              <td className="text-fg-2">
                {s.representative}
                <span className="block text-xs text-fg-3">{s.whatsapp || s.phone}</span>
              </td>
              <td className="text-fg-2">{s.leadDays} dias</td>
              <td className="text-fg-2">{s.paymentTerms}</td>
              <td className="tabular text-right">{products.filter((p) => p.supplierId === s.id).length}</td>
              <td className="text-right">
                {can("suppliers.manage") && (
                  <Button
                    size="sm"
                    variant="ghost"
                    aria-label="Editar"
                    onClick={(e) => {
                      e.stopPropagation();
                      setEditing({ ...s });
                    }}
                  >
                    <Pencil className="size-4" />
                  </Button>
                )}
              </td>
            </tr>
          ))}
        </Table>
      </Card>

      {editing && <SupplierForm draft={editing} onClose={() => setEditing(null)} onSave={(d) => run(() => saveSupplier(d), "Fornecedor salvo.") && setEditing(null)} />}

      {detail && (
        <Modal open size="lg" title={detail.tradeName || detail.legalName} onClose={() => setDetail(null)}>
          <p className="text-sm text-fg-2">
            {detail.legalName} · {formatDocument(detail.document)} · {detail.email}
          </p>
          <h3 className="mt-4 mb-2 text-sm font-semibold">Produtos fornecidos</h3>
          <div className="flex flex-wrap gap-1.5">
            {products.filter((p) => p.supplierId === detail.id).map((p) => (
              <Badge key={p.id}>{p.name}</Badge>
            ))}
          </div>
          <h3 className="mt-5 mb-2 text-sm font-semibold">Pedidos e recebimentos</h3>
          <div className="rounded-lg border border-line">
            <Table
              empty={!purchaseOrders.some((o) => o.supplierId === detail.id)}
              head={
                <>
                  <th>Pedido</th>
                  <th>Emissão</th>
                  <th>Situação</th>
                  <th className="text-right">Total</th>
                </>
              }
            >
              {purchaseOrders
                .filter((o) => o.supplierId === detail.id)
                .map((o) => (
                  <tr key={o.id}>
                    <td>
                      <a className="text-accent hover:underline" href={`#/compras`}>
                        nº {o.number}
                      </a>
                    </td>
                    <td className="tabular text-fg-2">{date(o.issueDate)}</td>
                    <td>
                      <Badge tone={PURCHASE_STATUS[o.status].tone}>{PURCHASE_STATUS[o.status].label}</Badge>
                    </td>
                    <td className="tabular text-right">
                      {brl(o.items.reduce((a, i) => a + i.quantity * i.unitPrice, 0) - o.discount + o.freight)}
                    </td>
                  </tr>
                ))}
            </Table>
          </div>
        </Modal>
      )}
    </>
  );
}

function SupplierForm({ draft, onClose, onSave }: { draft: Draft; onClose: () => void; onSave: (d: Draft) => void }) {
  const [d, setD] = useState(draft);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setD((x) => ({ ...x, [k]: v }));
  const submit = () => {
    const e: Record<string, string> = {};
    const doc = normalizeDocument(d.document);
    if (!(doc.length === 11 ? isValidCpf(doc) : isValidCnpj(doc))) e.document = "CNPJ/CPF inválido.";
    if (d.legalName.trim().length < 2) e.legalName = "Informe a razão social.";
    setErrors(e);
    if (!Object.keys(e).length) onSave({ ...d, document: doc });
  };
  return (
    <Modal
      open
      size="lg"
      title={d.id ? "Editar fornecedor" : "Novo fornecedor"}
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
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field label="CNPJ ou CPF *" error={errors.document} hint="Aceita CNPJ alfanumérico">
          <Input value={d.document} onChange={(e) => set("document", e.target.value)} />
        </Field>
        <Field label="Inscrição estadual">
          <Input value={d.stateRegistration} onChange={(e) => set("stateRegistration", e.target.value)} />
        </Field>
        <Field label="Razão social *" error={errors.legalName}>
          <Input value={d.legalName} onChange={(e) => set("legalName", e.target.value)} />
        </Field>
        <Field label="Nome fantasia">
          <Input value={d.tradeName} onChange={(e) => set("tradeName", e.target.value)} />
        </Field>
        <Field label="Representante">
          <Input value={d.representative} onChange={(e) => set("representative", e.target.value)} />
        </Field>
        <Field label="E-mail">
          <Input value={d.email} onChange={(e) => set("email", e.target.value)} />
        </Field>
        <Field label="Telefone">
          <Input value={d.phone} onChange={(e) => set("phone", e.target.value)} />
        </Field>
        <Field label="WhatsApp">
          <Input value={d.whatsapp} onChange={(e) => set("whatsapp", e.target.value)} />
        </Field>
        <Field label="Cidade">
          <Input value={d.city} onChange={(e) => set("city", e.target.value)} />
        </Field>
        <Field label="UF">
          <Input maxLength={2} value={d.state} onChange={(e) => set("state", e.target.value.toUpperCase())} />
        </Field>
        <Field label="Prazo de entrega (dias)">
          <Input type="number" min={0} value={d.leadDays} onChange={(e) => set("leadDays", Number(e.target.value))} />
        </Field>
        <Field label="Condições de pagamento">
          <Input value={d.paymentTerms} onChange={(e) => set("paymentTerms", e.target.value)} placeholder="Ex.: 30/60 dias" />
        </Field>
        <Field label="Observações" className="sm:col-span-2">
          <Textarea value={d.notes} onChange={(e) => set("notes", e.target.value)} />
        </Field>
      </div>
    </Modal>
  );
}
