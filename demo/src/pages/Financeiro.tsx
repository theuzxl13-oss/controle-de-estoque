import { useMemo, useState } from "react";
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

import { PAYMENT_METHOD_LABELS } from "@erp/domain/sale";

import { Badge, brl, Button, Card, CardHeader, date, dateTime, Kpi, PageHeader, Table, Tabs, useFeedback } from "../components/ui";
import { TITLE_STATUS } from "../labels";
import { useStore } from "../store";
import { ArrowDownCircle, ArrowUpCircle, Landmark, TrendingUp } from "lucide-react";

const axis = { stroke: "var(--text-3)", fontSize: 11, tickLine: false, axisLine: false } as const;

export function Financeiro() {
  const { titles, transactions, sales, can, settleTitle } = useStore();
  const { run, confirm } = useFeedback();
  const [tab, setTab] = useState<"receivable" | "payable" | "flow">("receivable");
  const todayKey = new Date().toISOString().slice(0, 10);

  const monthStart = new Date();
  monthStart.setDate(1);
  monthStart.setHours(0, 0, 0, 0);
  const monthSales = sales.filter((s) => s.status === "completed" && new Date(s.at) >= monthStart);
  const revenue = monthSales.reduce((a, s) => a + s.total, 0);
  const grossProfit = monthSales.reduce((a, s) => a + s.items.reduce((b, i) => b + i.total - i.unitCost * i.quantity, 0), 0);
  const monthTrx = transactions.filter((t) => new Date(t.at) >= monthStart);
  const received = monthTrx.filter((t) => t.direction === "in").reduce((a, t) => a + t.amount, 0);
  const paid = monthTrx.filter((t) => t.direction === "out").reduce((a, t) => a + t.amount, 0);

  const flow = useMemo(() => {
    const m = new Map<string, { label: string; entradas: number; saidas: number }>();
    for (let i = 29; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const key = d.toISOString().slice(0, 10);
      m.set(key, { label: d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" }), entradas: 0, saidas: 0 });
    }
    for (const t of transactions) {
      const b = m.get(t.at.slice(0, 10));
      if (!b) continue;
      if (t.direction === "in") b.entradas += t.amount;
      else b.saidas += t.amount;
    }
    return [...m.values()].map((b) => ({ ...b, entradas: Math.round(b.entradas * 100) / 100, saidas: Math.round(b.saidas * 100) / 100 }));
  }, [transactions]);

  const list = titles
    .filter((t) => t.kind === tab)
    .sort((a, b) => Number(a.status === "paid" || a.status === "cancelled") - Number(b.status === "paid" || b.status === "cancelled") || a.dueDate.localeCompare(b.dueDate));

  return (
    <>
      <PageHeader title="Financeiro" description="Contas a pagar e a receber, recebimentos, fluxo de caixa e lucro bruto." />
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Kpi icon={TrendingUp} label="Faturamento do mês" value={brl(revenue)} hint="Vendas concluídas" />
        <Kpi icon={Landmark} tone="good" label="Lucro bruto do mês" value={brl(grossProfit)} hint={`Margem ${revenue ? ((grossProfit / revenue) * 100).toFixed(1) : 0}%`} />
        <Kpi icon={ArrowUpCircle} label="Recebido no mês" value={brl(received)} hint="Entradas efetivas (não inclui cartão a receber)" />
        <Kpi icon={ArrowDownCircle} tone="warn" label="Pago no mês" value={brl(paid)} hint={`Saldo do mês: ${brl(received - paid)}`} />
      </div>

      <Card className="mt-4">
        <div className="border-b border-line p-3">
          <Tabs
            value={tab}
            onChange={setTab}
            items={[
              { value: "receivable", label: "Contas a receber" },
              { value: "payable", label: "Contas a pagar" },
              { value: "flow", label: "Fluxo de caixa" },
            ]}
          />
        </div>
        {tab === "flow" ? (
          <>
            <CardHeader title="Entradas e saídas — últimos 30 dias" subtitle="Lançamentos efetivamente recebidos e pagos" />
            <div className="h-72 px-2 pt-4 pb-2">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={flow} margin={{ left: 4, right: 8 }} barGap={2}>
                  <CartesianGrid vertical={false} stroke="var(--grid)" />
                  <XAxis dataKey="label" {...axis} minTickGap={14} />
                  <YAxis {...axis} width={60} tickFormatter={(v: number) => (v >= 1000 ? `${(v / 1000).toFixed(1)} mil` : String(v))} />
                  <Tooltip
                    cursor={{ fill: "var(--surface-2)" }}
                    contentStyle={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 8, fontSize: 12, color: "var(--text)" }}
                    formatter={(v) => brl(Number(v))}
                  />
                  <Legend wrapperStyle={{ fontSize: 12, color: "var(--text-2)" }} formatter={(v: string) => <span style={{ color: "var(--text-2)" }}>{v === "entradas" ? "Entradas" : "Saídas"}</span>} />
                  <Bar dataKey="entradas" fill="var(--series-1)" radius={[4, 4, 0, 0]} maxBarSize={16} />
                  <Bar dataKey="saidas" fill="var(--series-2)" radius={[4, 4, 0, 0]} maxBarSize={16} />
                </BarChart>
              </ResponsiveContainer>
            </div>
            <Table
              head={
                <>
                  <th>Data</th>
                  <th>Descrição</th>
                  <th>Forma</th>
                  <th className="text-right">Valor</th>
                </>
              }
            >
              {transactions.slice(0, 15).map((t) => (
                <tr key={t.id}>
                  <td className="tabular text-fg-2">{dateTime(t.at)}</td>
                  <td>{t.description}</td>
                  <td className="text-fg-2">{t.method ? PAYMENT_METHOD_LABELS[t.method] : "—"}</td>
                  <td className={`tabular text-right font-medium ${t.direction === "in" ? "text-good" : "text-bad"}`}>
                    {t.direction === "in" ? "+" : "−"} {brl(t.amount)}
                  </td>
                </tr>
              ))}
            </Table>
          </>
        ) : (
          <Table
            empty={list.length === 0}
            head={
              <>
                <th>Vencimento</th>
                <th>Descrição</th>
                <th>{tab === "payable" ? "Fornecedor / credor" : "Cliente / pagador"}</th>
                <th className="text-right">Valor</th>
                <th>Situação</th>
                <th />
              </>
            }
          >
            {list.map((t) => {
              const overdue = t.status === "open" && t.dueDate < todayKey;
              return (
                <tr key={t.id}>
                  <td className="tabular whitespace-nowrap">
                    {date(t.dueDate)} {overdue && <Badge tone="bad">Vencido</Badge>}
                  </td>
                  <td>
                    {t.description}
                    <span className="block text-xs text-fg-3">Origem: {t.source}</span>
                  </td>
                  <td className="text-fg-2">{t.party}</td>
                  <td className="tabular text-right font-medium">{brl(t.amount)}</td>
                  <td>
                    <Badge tone={TITLE_STATUS[t.status].tone}>{TITLE_STATUS[t.status].label}</Badge>
                  </td>
                  <td className="text-right">
                    {can("finance.manage") && (t.status === "open" || t.status === "partially_paid") && (
                      <Button
                        size="sm"
                        onClick={async () => {
                          if (await confirm({ title: tab === "payable" ? "Registrar pagamento" : "Registrar recebimento", message: `${t.description} — ${brl(t.amount - t.paid)} via Pix, hoje.` }))
                            run(() => settleTitle(t.id), "Baixa registrada no fluxo de caixa.");
                        }}
                      >
                        {tab === "payable" ? "Pagar" : "Receber"}
                      </Button>
                    )}
                  </td>
                </tr>
              );
            })}
          </Table>
        )}
      </Card>
    </>
  );
}
