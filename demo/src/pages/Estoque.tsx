import { ArrowLeftRight, Download } from "lucide-react";
import { useMemo, useState } from "react";

import { Badge, Button, Card, CardHeader, dateTime, Field, Input, Modal, Notice, num, PageHeader, SearchInput, Select, Table, useFeedback, usePagination } from "../components/ui";
import { downloadCsv } from "../csv";
import type { MovementType, StockBucket } from "../data/types";
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
  const active = products.filter((p) => p.active);

  return (
    <>
      <PageHeader
        title="Estoque"
        description="Cheios, vazios e histórico completo de movimentações (data, usuário, quantidade e motivo)."
        actions={
          <>
            <Button
              onClick={() =>
                downloadCsv(
                  "movimentacoes.csv",
                  ["data", "produto", "estoque", "tipo", "quantidade", "motivo", "referencia", "usuario"],
                  filtered.map((m) => [dateTime(m.at), products.find((p) => p.id === m.productId)?.name ?? "", m.bucket, MOVEMENT_LABELS[m.type], m.quantity, m.reason, m.reference, m.user]),
                )
              }
            >
              <Download className="size-4" /> Exportar
            </Button>
            {(can("stock.move") || can("stock.adjust")) && (
              <Button variant="primary" onClick={() => setOpen(true)}>
                <ArrowLeftRight className="size-4" /> Lançar movimentação
              </Button>
            )}
          </>
        }
      />

      <Card className="mb-4">
        <CardHeader title="Posição atual" subtitle="Vazios voltam para a distribuidora na próxima carga" />
        <Table
          head={
            <>
              <th>Produto</th>
              <th className="text-center">Cheios</th>
              <th className="text-center">Vazios</th>
              <th className="text-center">Total de vasilhames</th>
              <th className="text-center">Mínimo</th>
            </>
          }
        >
          {active.map((p) => (
            <tr key={p.id}>
              <td className="font-medium">{p.name}</td>
              <td className="text-center">
                <Badge tone={p.stockFull <= 0 ? "bad" : p.stockFull <= p.minStock ? "warn" : "good"}>{p.stockFull}</Badge>
              </td>
              <td className="tabular text-center text-fg-2">{p.returnable ? p.stockEmpty : "—"}</td>
              <td className="tabular text-center text-fg-2">{p.returnable ? p.stockFull + p.stockEmpty : "—"}</td>
              <td className="tabular text-center text-fg-3">{p.minStock}</td>
            </tr>
          ))}
        </Table>
      </Card>

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
              <td>
                <span className="font-medium">{products.find((p) => p.id === m.productId)?.name.split(" (")[0]}</span>
                <span className="block text-xs text-fg-3">{m.bucket === "cheio" ? "cheio" : "vasilhame vazio"}</span>
              </td>
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
          { value: "manual_entry" as const, label: "Entrada (ex.: vasilhame comprado, devolução)" },
          { value: "manual_exit" as const, label: "Saída (ex.: vazamento, vasilhame condenado, perda)" },
        ]
      : []),
    ...(can("stock.adjust") ? [{ value: "adjustment" as const, label: "Ajuste após contagem" }] : []),
  ];
  const active = products.filter((p) => p.active);
  const [type, setType] = useState<ManualType>(types[0].value);
  const [productId, setProductId] = useState(active[0].id);
  const [bucket, setBucket] = useState<StockBucket>("cheio");
  const [qty, setQty] = useState(1);
  const [reason, setReason] = useState("");
  const p = products.find((x) => x.id === productId)!;
  const current = bucket === "cheio" ? p.stockFull : p.stockEmpty;
  const after = type === "adjustment" ? qty : type === "manual_entry" ? current + qty : current - qty;

  return (
    <Modal
      open
      title="Lançar movimentação"
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose}>Cancelar</Button>
          <Button variant="primary" onClick={() => run(() => moveStock(productId, bucket, type, qty, reason), "Movimentação registrada.") && onClose()}>
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
        <Field label="Produto">
          <Select
            value={productId}
            onChange={(e) => {
              setProductId(e.target.value);
              if (!products.find((x) => x.id === e.target.value)?.returnable) setBucket("cheio");
            }}
          >
            {active.map((x) => (
              <option key={x.id} value={x.id}>
                {x.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Estoque de">
          <Select value={bucket} disabled={!p.returnable} onChange={(e) => setBucket(e.target.value as StockBucket)}>
            <option value="cheio">{p.returnable ? `Cheios (${p.stockFull})` : `Unidades (${p.stockFull})`}</option>
            {p.returnable && <option value="vazio">Vazios ({p.stockEmpty})</option>}
          </Select>
        </Field>
        <Field label={type === "adjustment" ? "Quantidade contada" : "Quantidade"}>
          <Input type="number" min={0} value={qty} onChange={(e) => setQty(Number(e.target.value))} />
        </Field>
        <Field label="Saldo após">
          <Input value={num(after)} disabled className={after < 0 ? "text-bad" : ""} />
        </Field>
        <Field label="Motivo *" className="sm:col-span-2">
          <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Ex.: botijão com vazamento devolvido à distribuidora" />
        </Field>
      </div>
      {after < 0 && (
        <div className="mt-3">
          <Notice tone="warn">{allowNegativeStock ? "O saldo ficará negativo (permitido pela configuração)." : "Estoque negativo não é permitido — será bloqueado."}</Notice>
        </div>
      )}
    </Modal>
  );
}
