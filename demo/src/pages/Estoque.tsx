import { ArrowLeftRight, Download } from "lucide-react";
import { useMemo, useState } from "react";

import { Badge, Button, Card, dateTime, Field, Input, Modal, Notice, num, PageHeader, SearchInput, Select, Table, useFeedback, usePagination } from "../components/ui";
import { downloadCsv } from "../csv";
import type { MovementType } from "../data/types";
import { MOVEMENT_LABELS } from "../labels";
import { useStore } from "../store";

type ManualType = "manual_entry" | "manual_exit" | "adjustment";

export function Estoque() {
  const { movements, products, can } = useStore();
  const [q, setQ] = useState("");
  const [type, setType] = useState<MovementType | "">("");
  const [open, setOpen] = useState(false);

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    return movements.filter((m) => {
      const p = products.find((x) => x.id === m.productId);
      return (!type || m.type === type) && (!term || p?.name.toLowerCase().includes(term) || m.reason.toLowerCase().includes(term));
    });
  }, [movements, products, q, type]);
  const { slice, control } = usePagination(filtered, 15);

  return (
    <>
      <PageHeader
        title="Movimentações de estoque"
        description="Histórico completo: data, usuário, quantidade, motivo e operação de origem."
        actions={
          <>
            <Button
              onClick={() =>
                downloadCsv(
                  "movimentacoes.csv",
                  ["data", "produto", "tipo", "quantidade", "saldo_apos", "motivo", "referencia", "usuario"],
                  filtered.map((m) => [
                    dateTime(m.at), products.find((p) => p.id === m.productId)?.name ?? "", MOVEMENT_LABELS[m.type],
                    m.quantity, m.after, m.reason, m.reference, m.user,
                  ]),
                )
              }
            >
              <Download className="size-4" /> Exportar CSV
            </Button>
            {(can("stock.move") || can("stock.adjust")) && (
              <Button variant="primary" onClick={() => setOpen(true)}>
                <ArrowLeftRight className="size-4" /> Nova movimentação
              </Button>
            )}
          </>
        }
      />
      <Card>
        <div className="flex flex-wrap gap-2 border-b border-line p-3">
          <SearchInput value={q} onChange={setQ} placeholder="Produto ou motivo" />
          <Select value={type} onChange={(e) => setType(e.target.value as MovementType | "")} className="w-auto">
            <option value="">Todos os tipos</option>
            {Object.entries(MOVEMENT_LABELS).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </Select>
        </div>
        <Table
          empty={filtered.length === 0}
          head={
            <>
              <th>Data</th>
              <th>Produto</th>
              <th>Tipo</th>
              <th className="text-right">Qtd.</th>
              <th>Motivo / referência</th>
              <th>Usuário</th>
            </>
          }
        >
          {slice.map((m) => (
            <tr key={m.id}>
              <td className="tabular whitespace-nowrap text-fg-2">{dateTime(m.at)}</td>
              <td className="font-medium">{products.find((p) => p.id === m.productId)?.name}</td>
              <td>
                <Badge tone={m.quantity > 0 ? "good" : "bad"}>{MOVEMENT_LABELS[m.type]}</Badge>
              </td>
              <td className={`tabular text-right font-medium ${m.quantity > 0 ? "text-good" : "text-bad"}`}>
                {m.quantity > 0 ? "+" : ""}
                {num(m.quantity)}
              </td>
              <td className="text-fg-2">
                {m.reason}
                <span className="block text-xs text-fg-3">{m.reference}</span>
              </td>
              <td className="whitespace-nowrap text-fg-2">{m.user}</td>
            </tr>
          ))}
        </Table>
        {control}
      </Card>
      {open && <MovementForm onClose={() => setOpen(false)} />}
    </>
  );
}

function MovementForm({ onClose }: { onClose: () => void }) {
  const { products, moveStock, can, allowNegativeStock } = useStore();
  const { run } = useFeedback();
  const types: { value: ManualType; label: string }[] = [
    ...(can("stock.move")
      ? [
          { value: "manual_entry" as const, label: "Entrada de mercadoria" },
          { value: "manual_exit" as const, label: "Saída (perda, avaria, consumo)" },
        ]
      : []),
    ...(can("stock.adjust") ? [{ value: "adjustment" as const, label: "Ajuste de saldo (inventário)" }] : []),
  ];
  const [type, setType] = useState<ManualType>(types[0].value);
  const [productId, setProductId] = useState(products[0].id);
  const [qty, setQty] = useState(1);
  const [reason, setReason] = useState("");
  const product = products.find((p) => p.id === productId)!;
  const after = type === "adjustment" ? qty : type === "manual_entry" ? product.stock + qty : product.stock - qty;

  return (
    <Modal
      open
      title="Nova movimentação"
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose}>Cancelar</Button>
          <Button variant="primary" onClick={() => run(() => moveStock(productId, type, qty, reason), "Movimentação registrada.") && onClose()}>
            Registrar
          </Button>
        </>
      }
    >
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field label="Tipo" className="sm:col-span-2">
          <Select value={type} onChange={(e) => setType(e.target.value as ManualType)}>
            {types.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Produto" className="sm:col-span-2">
          <Select value={productId} onChange={(e) => setProductId(e.target.value)}>
            {products.filter((p) => p.active).map((p) => (
              <option key={p.id} value={p.id}>
                {p.code} — {p.name} (saldo {num(p.stock)})
              </option>
            ))}
          </Select>
        </Field>
        <Field label={type === "adjustment" ? "Novo saldo (contado)" : "Quantidade"}>
          <Input type="number" min={0} step="1" value={qty} onChange={(e) => setQty(Number(e.target.value))} />
        </Field>
        <Field label="Saldo após a movimentação">
          <Input value={`${num(after)} ${product.unit}`} disabled className={after < 0 ? "text-bad" : ""} />
        </Field>
        <Field label="Motivo *" className="sm:col-span-2">
          <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Ex.: avaria no transporte" />
        </Field>
      </div>
      {after < 0 && (
        <div className="mt-3">
          <Notice tone="warn">
            {allowNegativeStock
              ? "O saldo ficará negativo (permitido pela configuração da empresa)."
              : "Estoque negativo não é permitido — a movimentação será bloqueada."}
          </Notice>
        </div>
      )}
    </Modal>
  );
}
