import { Ban, Bike, Download, Eye, Store } from "lucide-react";
import { useMemo, useState } from "react";

import { Badge, brl, Button, Card, dateTime, Field, Input, Modal, PageHeader, SearchInput, Table, Tabs, useFeedback, usePagination } from "../components/ui";
import { downloadCsv } from "../csv";
import type { Sale } from "../data/types";
import { useStore } from "../store";
import { METHOD_LABELS, MODE_LABELS, Receipt } from "./Pdv";

export function Vendas() {
  const { sales, customers, can, user, cancelSale } = useStore();
  const { run, confirm } = useFeedback();
  const [q, setQ] = useState("");
  const [status, setStatus] = useState<"all" | "balcao" | "entrega" | "cancelled">("all");
  const [view, setView] = useState<Sale | null>(null);
  const [cancelling, setCancelling] = useState<Sale | null>(null);
  const [reason, setReason] = useState("");
  const own = !can("sales.view_all");

  const list = useMemo(() => {
    const t = q.trim().toLowerCase();
    return sales
      .filter((s) => !own || s.seller === user.name)
      .filter((s) => (status === "all" ? true : status === "cancelled" ? s.status === "cancelled" : s.channel === status && s.status === "completed"))
      .filter((s) => {
        if (!t) return true;
        const c = customers.find((x) => x.id === s.customerId);
        const d = t.replace(/\D/g, "");
        if (/^\d{1,7}$/.test(t)) return String(s.number) === t;
        if (d.length >= 8) return !!c?.phone.replace(/\D/g, "").includes(d);
        return !!c?.name.toLowerCase().includes(t);
      })
      .sort((a, b) => b.number - a.number);
  }, [sales, customers, q, status, own, user.name]);
  const { slice, control } = usePagination(list, 15);
  const total = list.filter((s) => s.status === "completed").reduce((a, s) => a + s.total, 0);
  const describe = (s: Sale) => s.items.map((i) => `${i.quantity}× ${i.name.split(" (")[0]}${i.mode !== "unidade" ? ` ${MODE_LABELS[i.mode].toLowerCase()}` : ""}`).join(", ");

  return (
    <>
      <PageHeader
        title={own ? "Minhas vendas" : "Vendas"}
        description="Balcão e entregas. Cancelamento devolve o estoque (cheios e vazios) e estorna os valores."
        actions={
          <Button
            onClick={() =>
              downloadCsv(
                "vendas.csv",
                ["numero", "data", "canal", "cliente", "itens", "pagamento", "total", "situacao"],
                list.map((s) => [s.number, dateTime(s.at), s.channel, customers.find((c) => c.id === s.customerId)?.name ?? "Balcão", describe(s), METHOD_LABELS[s.method], s.total, s.status === "completed" ? "Concluída" : "Cancelada"]),
              )
            }
          >
            <Download className="size-4" /> Exportar
          </Button>
        }
      />
      <Card>
        <div className="flex flex-wrap items-center gap-2 border-b border-line p-3">
          <SearchInput value={q} onChange={setQ} placeholder="Nº da venda, cliente ou telefone" />
          <Tabs
            value={status}
            onChange={setStatus}
            items={[
              { value: "all", label: "Todas" },
              { value: "balcao", label: "Balcão" },
              { value: "entrega", label: "Entregas" },
              { value: "cancelled", label: "Canceladas" },
            ]}
          />
          <span className="ml-auto text-sm text-fg-2">
            Total: <b className="tabular text-fg">{brl(total)}</b>
          </span>
        </div>
        <Table
          empty={list.length === 0}
          head={
            <>
              <th>Venda</th>
              <th>Data</th>
              <th>Cliente</th>
              <th>Itens</th>
              <th>Pagamento</th>
              <th className="text-right">Total</th>
              <th />
            </>
          }
        >
          {slice.map((s) => (
            <tr key={s.id} className={s.status === "cancelled" ? "opacity-60" : ""}>
              <td className="whitespace-nowrap">
                <span className="tabular font-medium">nº {s.number}</span>
                <span className="mt-0.5 flex items-center gap-1 text-xs text-fg-3">
                  {s.channel === "entrega" ? <Bike className="size-3" /> : <Store className="size-3" />}
                  {s.channel === "entrega" ? (s.delivery?.status === "entregue" ? "entregue" : s.delivery?.status === "em_rota" ? "em rota" : "aguardando") : "balcão"}
                </span>
              </td>
              <td className="tabular whitespace-nowrap text-fg-2">{dateTime(s.at)}</td>
              <td className="text-fg-2">{customers.find((c) => c.id === s.customerId)?.name ?? "—"}</td>
              <td className="text-fg-2">{describe(s)}</td>
              <td className="text-fg-2">{METHOD_LABELS[s.method]}</td>
              <td className="tabular text-right font-medium">
                {brl(s.total)}
                {s.status === "cancelled" && <span className="block"><Badge tone="bad">Cancelada</Badge></span>}
              </td>
              <td className="whitespace-nowrap text-right">
                <Button size="sm" variant="ghost" aria-label="Ver comprovante" onClick={() => setView(s)}>
                  <Eye className="size-4" />
                </Button>
                {can("sales.cancel") && s.status === "completed" && (
                  <Button size="sm" variant="ghost" aria-label="Cancelar venda" onClick={() => { setReason(""); setCancelling(s); }}>
                    <Ban className="size-4" />
                  </Button>
                )}
              </td>
            </tr>
          ))}
        </Table>
        {control}
      </Card>

      {view && <Receipt sale={view} onClose={() => setView(null)} />}
      {cancelling && (
        <Modal
          open
          size="sm"
          title={`Cancelar venda nº ${cancelling.number}`}
          onClose={() => setCancelling(null)}
          footer={
            <>
              <Button onClick={() => setCancelling(null)}>Voltar</Button>
              <Button
                variant="danger"
                onClick={async () => {
                  if (!(await confirm({ title: "Confirmar cancelamento", message: "O estoque volta (cheios e vazios) e os valores recebidos são estornados. Fica registrado na auditoria.", confirmLabel: "Cancelar venda", danger: true }))) return;
                  if (run(() => cancelSale(cancelling.id, reason), "Venda cancelada.")) setCancelling(null);
                }}
              >
                Cancelar venda
              </Button>
            </>
          }
        >
          <p className="mb-3 text-sm text-fg-2">{describe(cancelling)} — {brl(cancelling.total)}</p>
          <Field label="Motivo do cancelamento *">
            <Input autoFocus value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Mínimo 5 caracteres" />
          </Field>
        </Modal>
      )}
    </>
  );
}
