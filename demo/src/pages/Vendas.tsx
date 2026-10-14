import { Ban, Download, Eye } from "lucide-react";
import { useMemo, useState } from "react";

import { PAYMENT_METHOD_LABELS } from "@erp/domain/sale";

import { Badge, brl, Button, Card, dateTime, Field, Input, Modal, PageHeader, SearchInput, Table, Tabs, useFeedback, usePagination } from "../components/ui";
import { downloadCsv } from "../csv";
import type { Sale } from "../data/types";
import { useStore } from "../store";
import { Receipt } from "./Pdv";

export function Vendas() {
  const { sales, customers, can, user, cancelSale } = useStore();
  const { run, confirm } = useFeedback();
  const [q, setQ] = useState("");
  const [status, setStatus] = useState<"all" | "completed" | "cancelled">("all");
  const [view, setView] = useState<Sale | null>(null);
  const [cancelling, setCancelling] = useState<Sale | null>(null);
  const [reason, setReason] = useState("");
  const own = !can("sales.view_all");

  const list = useMemo(() => {
    const t = q.trim().toLowerCase();
    return sales
      .filter((s) => !own || s.seller === user.name)
      .filter((s) => status === "all" || s.status === status)
      .filter((s) => {
        if (!t) return true;
        const c = customers.find((x) => x.id === s.customerId);
        return String(s.number) === t || c?.name.toLowerCase().includes(t) || s.seller.toLowerCase().includes(t);
      })
      .sort((a, b) => b.number - a.number);
  }, [sales, customers, q, status, own, user.name]);
  const { slice, control } = usePagination(list, 15);
  const total = list.filter((s) => s.status === "completed").reduce((a, s) => a + s.total, 0);

  return (
    <>
      <PageHeader
        title={own ? "Minhas vendas" : "Vendas"}
        description={own ? "Seu perfil vê apenas as vendas feitas por você." : "Todas as vendas, com cancelamento controlado por permissão."}
        actions={
          <Button
            onClick={() =>
              downloadCsv(
                "vendas.csv",
                ["numero", "data", "cliente", "vendedor", "total", "pagamento", "situacao"],
                list.map((s) => [
                  s.number, dateTime(s.at), customers.find((c) => c.id === s.customerId)?.name ?? "Consumidor", s.seller, s.total,
                  s.payments.map((p) => PAYMENT_METHOD_LABELS[p.method]).join(" + "), s.status === "completed" ? "Concluída" : "Cancelada",
                ]),
              )
            }
          >
            <Download className="size-4" /> Exportar
          </Button>
        }
      />
      <Card>
        <div className="flex flex-wrap items-center gap-2 border-b border-line p-3">
          <SearchInput value={q} onChange={setQ} placeholder="Nº da venda, cliente ou vendedor" />
          <Tabs
            value={status}
            onChange={setStatus}
            items={[
              { value: "all", label: "Todas" },
              { value: "completed", label: "Concluídas" },
              { value: "cancelled", label: "Canceladas" },
            ]}
          />
          <span className="ml-auto text-sm text-fg-2">
            Total concluído: <b className="tabular text-fg">{brl(total)}</b>
          </span>
        </div>
        <Table
          empty={list.length === 0}
          head={
            <>
              <th>Venda</th>
              <th>Data</th>
              <th>Cliente</th>
              <th>Vendedor</th>
              <th>Pagamento</th>
              <th className="text-right">Total</th>
              <th>Situação</th>
              <th />
            </>
          }
        >
          {slice.map((s) => (
            <tr key={s.id}>
              <td className="tabular font-medium">nº {s.number}</td>
              <td className="tabular whitespace-nowrap text-fg-2">{dateTime(s.at)}</td>
              <td className="text-fg-2">{customers.find((c) => c.id === s.customerId)?.name ?? "Consumidor"}</td>
              <td className="text-fg-2">{s.seller}</td>
              <td className="text-fg-2">{s.payments.map((p) => PAYMENT_METHOD_LABELS[p.method]).join(" + ")}</td>
              <td className="tabular text-right font-medium">{brl(s.total)}</td>
              <td>{s.status === "completed" ? <Badge tone="good">Concluída</Badge> : <Badge tone="bad">Cancelada</Badge>}</td>
              <td className="whitespace-nowrap text-right">
                <Button size="sm" variant="ghost" aria-label="Ver comprovante" onClick={() => setView(s)}>
                  <Eye className="size-4" />
                </Button>
                {can("sales.cancel") && s.status === "completed" && (
                  <Button
                    size="sm"
                    variant="ghost"
                    aria-label="Cancelar venda"
                    onClick={() => {
                      setReason("");
                      setCancelling(s);
                    }}
                  >
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
                  if (!(await confirm({ title: "Confirmar cancelamento", message: "O estoque será devolvido e os recebimentos estornados. Esta ação fica registrada na auditoria.", confirmLabel: "Cancelar venda", danger: true }))) return;
                  if (run(() => cancelSale(cancelling.id, reason), "Venda cancelada. Estoque devolvido e valores estornados.")) setCancelling(null);
                }}
              >
                Cancelar venda
              </Button>
            </>
          }
        >
          <p className="mb-3 text-sm text-fg-2">
            Total {brl(cancelling.total)}. Se houver NFC-e autorizada, ela precisa ser cancelada no provedor fiscal antes (regra do sistema real).
          </p>
          <Field label="Motivo do cancelamento *">
            <Input autoFocus value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Mínimo 5 caracteres" />
          </Field>
        </Modal>
      )}
    </>
  );
}
