import {
  AlertTriangle,
  ArrowDownCircle,
  ArrowUpCircle,
  ClipboardList,
  DollarSign,
  Package,
  PackageX,
  ShoppingBag,
  Truck,
  Users,
} from "lucide-react";
import { useMemo, useState } from "react";
import { Area, AreaChart, Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

import { Badge, brl, Card, CardHeader, dateTime, Kpi, num, PageHeader, Tabs } from "../components/ui";
import { MOVEMENT_LABELS } from "../labels";
import { navigate } from "../router";
import { useStore } from "../store";

type Period = "7" | "30" | "90";
type Grain = "day" | "week" | "month";

const dayKey = (d: Date) => d.toISOString().slice(0, 10);
const short = (n: number) =>
  n >= 1000 ? `${(n / 1000).toLocaleString("pt-BR", { maximumFractionDigits: n >= 10000 ? 0 : 1 })} mil` : n.toLocaleString("pt-BR");

function ChartTooltip({ active, payload, label, money = true }: { active?: boolean; payload?: { value: number }[]; label?: string; money?: boolean }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border border-line bg-surface px-3 py-2 text-xs shadow-lg">
      <p className="text-fg-3">{label}</p>
      <p className="tabular mt-0.5 font-semibold text-fg">{money ? brl(payload[0].value) : num(payload[0].value)}</p>
    </div>
  );
}

const axis = { stroke: "var(--text-3)", fontSize: 11, tickLine: false, axisLine: false } as const;

export function Dashboard() {
  const { products, customers, suppliers, sales, purchaseOrders, titles, movements, can, user } = useStore();
  const [period, setPeriod] = useState<Period>("30");
  const [grain, setGrain] = useState<Grain>("day");
  const onlyOwn = !can("sales.view_all");

  const data = useMemo(() => {
    const since = new Date();
    since.setHours(0, 0, 0, 0);
    since.setDate(since.getDate() - (Number(period) - 1));
    const completed = sales.filter((s) => s.status === "completed" && (!onlyOwn || s.seller === user.name));
    const inPeriod = completed.filter((s) => new Date(s.at) >= since);
    const todayKey = dayKey(new Date());
    const today = completed.filter((s) => s.at.slice(0, 10) === todayKey);
    const monthStart = new Date();
    monthStart.setDate(1);
    monthStart.setHours(0, 0, 0, 0);
    const month = completed.filter((s) => new Date(s.at) >= monthStart);

    // Série temporal pela granularidade escolhida
    const buckets = new Map<string, { label: string; total: number }>();
    for (let d = new Date(since); d <= new Date(); d.setDate(d.getDate() + 1)) {
      let key: string;
      let label: string;
      if (grain === "day") {
        key = dayKey(d);
        label = d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
      } else if (grain === "week") {
        const monday = new Date(d);
        monday.setDate(d.getDate() - ((d.getDay() + 6) % 7));
        key = dayKey(monday);
        label = `sem. ${monday.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" })}`;
      } else {
        key = d.toISOString().slice(0, 7);
        label = d.toLocaleDateString("pt-BR", { month: "short", year: "2-digit" });
      }
      if (!buckets.has(key)) buckets.set(key, { label, total: 0 });
    }
    for (const s of inPeriod) {
      const d = new Date(s.at);
      let key: string;
      if (grain === "day") key = dayKey(d);
      else if (grain === "week") {
        const monday = new Date(d);
        monday.setHours(12, 0, 0, 0);
        monday.setDate(d.getDate() - ((d.getDay() + 6) % 7));
        key = dayKey(monday);
      } else key = s.at.slice(0, 7);
      const b = buckets.get(key);
      if (b) b.total += s.total;
    }
    const series = [...buckets.values()].map((b) => ({ ...b, total: Math.round(b.total * 100) / 100 }));
    let acc = 0;
    const cumulative = series.map((b) => ({ label: b.label, total: Math.round((acc += b.total) * 100) / 100 }));

    const byProduct = new Map<string, { name: string; qty: number; revenue: number }>();
    for (const s of inPeriod)
      for (const it of s.items) {
        const cur = byProduct.get(it.productId) ?? { name: it.name, qty: 0, revenue: 0 };
        cur.qty += it.quantity;
        cur.revenue += it.total;
        byProduct.set(it.productId, cur);
      }
    const top = [...byProduct.values()].sort((a, b) => b.revenue - a.revenue).slice(0, 6);

    const revenue = inPeriod.reduce((a, s) => a + s.total, 0);
    const cost = inPeriod.reduce((a, s) => a + s.items.reduce((b, i) => b + i.unitCost * i.quantity, 0), 0);
    return {
      today: { count: today.length, total: today.reduce((a, s) => a + s.total, 0) },
      monthTotal: month.reduce((a, s) => a + s.total, 0),
      revenue,
      grossProfit: revenue - cost,
      count: inPeriod.length,
      ticket: inPeriod.length ? revenue / inPeriod.length : 0,
      series,
      cumulative,
      top,
    };
  }, [sales, period, grain, onlyOwn, user.name]);

  const active = products.filter((p) => p.active);
  const low = active.filter((p) => p.stock > 0 && p.stock <= p.minStock);
  const out = active.filter((p) => p.stock <= 0);
  const pendingPO = purchaseOrders.filter((o) => ["sent", "confirmed", "partially_received"].includes(o.status));
  const open = (k: "payable" | "receivable") =>
    titles.filter((t) => t.kind === k && (t.status === "open" || t.status === "partially_paid")).reduce((a, t) => a + t.amount - t.paid, 0);
  const overdue = (k: "payable" | "receivable") =>
    titles.filter((t) => t.kind === k && t.status === "open" && t.dueDate < dayKey(new Date())).length;

  return (
    <>
      <PageHeader
        title={`Olá, ${user.name.split(" ")[0]}`}
        description={onlyOwn ? "Indicadores das suas vendas." : "Visão geral da operação."}
        actions={
          <Tabs<Period>
            value={period}
            onChange={setPeriod}
            items={[
              { value: "7", label: "7 dias" },
              { value: "30", label: "30 dias" },
              { value: "90", label: "90 dias" },
            ]}
          />
        }
      />

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Kpi icon={ShoppingBag} label="Vendas hoje" value={brl(data.today.total)} hint={`${data.today.count} venda(s)`} />
        <Kpi icon={DollarSign} label={`Faturamento (${period} dias)`} value={brl(data.revenue)} hint={`${data.count} vendas · ticket médio ${brl(data.ticket)}`} />
        <Kpi icon={DollarSign} label="Faturamento do mês" value={brl(data.monthTotal)} hint={can("finance.view") ? `Lucro bruto no período: ${brl(data.grossProfit)}` : undefined} />
        <Kpi icon={Package} label="Produtos ativos" value={num(active.length)} hint={`${products.length} cadastrados`} onClick={() => navigate("produtos")} />
        <Kpi icon={AlertTriangle} tone="warn" label="Estoque baixo" value={num(low.length)} hint="No mínimo ou abaixo" onClick={() => navigate("produtos")} />
        <Kpi icon={PackageX} tone="bad" label="Sem estoque" value={num(out.length)} hint="Saldo zerado" onClick={() => navigate("produtos")} />
        {can("customers.view") && <Kpi icon={Users} label="Clientes" value={num(customers.length)} onClick={() => navigate("clientes")} />}
        {can("suppliers.view") && <Kpi icon={Truck} label="Fornecedores" value={num(suppliers.length)} onClick={() => navigate("fornecedores")} />}
        {can("purchases.view") && (
          <Kpi icon={ClipboardList} tone="info" label="Pedidos de compra pendentes" value={num(pendingPO.length)} hint="Enviados, confirmados ou parciais" onClick={() => navigate("compras")} />
        )}
        {can("finance.view") && (
          <>
            <Kpi icon={ArrowUpCircle} label="A receber (em aberto)" value={brl(open("receivable"))} hint={`${overdue("receivable")} vencido(s)`} onClick={() => navigate("financeiro")} />
            <Kpi icon={ArrowDownCircle} tone="warn" label="A pagar (em aberto)" value={brl(open("payable"))} hint={`${overdue("payable")} vencido(s)`} onClick={() => navigate("financeiro")} />
          </>
        )}
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 xl:grid-cols-3">
        <Card className="flex flex-col xl:col-span-2">
          <CardHeader
            title="Vendas"
            subtitle="Valor vendido por período (vendas concluídas)"
            actions={
              <Tabs<Grain>
                value={grain}
                onChange={setGrain}
                items={[
                  { value: "day", label: "Diário" },
                  { value: "week", label: "Semanal" },
                  { value: "month", label: "Mensal" },
                ]}
              />
            }
          />
          <div className="h-64 flex-1 px-2 pt-4 pb-2 xl:h-auto xl:min-h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data.series} margin={{ left: 4, right: 8 }}>
                <CartesianGrid vertical={false} stroke="var(--grid)" />
                <XAxis dataKey="label" {...axis} minTickGap={12} />
                <YAxis {...axis} width={64} tickFormatter={short} />
                <Tooltip cursor={{ fill: "var(--surface-2)" }} content={<ChartTooltip />} />
                <Bar dataKey="total" fill="var(--series-1)" radius={[4, 4, 0, 0]} maxBarSize={28} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>

        <Card>
          <CardHeader title="Produtos mais vendidos" subtitle={`Por faturamento, últimos ${period} dias`} />
          <ul className="divide-y divide-line">
            {data.top.map((p, i) => {
              const max = data.top[0]?.revenue || 1;
              return (
                <li key={p.name} className="px-4 py-2.5">
                  <div className="flex items-baseline justify-between gap-2 text-sm">
                    <span className="truncate">
                      <span className="mr-1.5 text-fg-3">{i + 1}.</span>
                      {p.name}
                    </span>
                    <span className="tabular shrink-0 font-medium">{brl(p.revenue)}</span>
                  </div>
                  <div className="mt-1.5 flex items-center gap-2">
                    <div className="h-1.5 flex-1 rounded-full bg-surface-2">
                      <div className="h-1.5 rounded-full bg-[var(--series-1)]" style={{ width: `${(p.revenue / max) * 100}%` }} />
                    </div>
                    <span className="tabular w-14 text-right text-xs text-fg-3">{num(p.qty)} un</span>
                  </div>
                </li>
              );
            })}
            {data.top.length === 0 && <li className="px-4 py-8 text-center text-sm text-fg-3">Sem vendas no período.</li>}
          </ul>
        </Card>

        <Card className="xl:col-span-2">
          <CardHeader title="Evolução do faturamento" subtitle="Faturamento acumulado no período" />
          <div className="h-56 px-2 pt-4 pb-2">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={data.cumulative} margin={{ left: 4, right: 8 }}>
                <defs>
                  <linearGradient id="fat" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="var(--series-1)" stopOpacity={0.25} />
                    <stop offset="100%" stopColor="var(--series-1)" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid vertical={false} stroke="var(--grid)" />
                <XAxis dataKey="label" {...axis} minTickGap={16} />
                <YAxis {...axis} width={64} tickFormatter={short} />
                <Tooltip cursor={{ stroke: "var(--text-3)", strokeDasharray: "3 3" }} content={<ChartTooltip />} />
                <Area type="monotone" dataKey="total" stroke="var(--series-1)" strokeWidth={2} fill="url(#fat)" activeDot={{ r: 4, strokeWidth: 2, stroke: "var(--surface)" }} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </Card>

        <Card>
          <CardHeader title="Alertas de estoque" subtitle="Produtos no mínimo ou zerados" />
          <ul className="max-h-56 divide-y divide-line overflow-y-auto">
            {[...out, ...low].map((p) => (
              <li key={p.id} className="flex items-center justify-between gap-2 px-4 py-2 text-sm">
                <span className="truncate">{p.name}</span>
                <Badge tone={p.stock <= 0 ? "bad" : "warn"}>
                  {p.stock <= 0 ? "Sem estoque" : `${num(p.stock)} / mín. ${num(p.minStock)}`}
                </Badge>
              </li>
            ))}
          </ul>
        </Card>
      </div>

      {can("stock.view") && (
        <Card className="mt-4">
          <CardHeader
            title="Últimas movimentações de estoque"
            actions={
              <a href="#/estoque" className="text-xs font-medium text-accent hover:underline">
                Ver histórico
              </a>
            }
          />
          <ul className="divide-y divide-line">
            {movements.slice(0, 6).map((m) => {
              const p = products.find((x) => x.id === m.productId);
              return (
                <li key={m.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2.5 text-sm">
                  <span className={`tabular w-14 font-medium ${m.quantity > 0 ? "text-good" : "text-bad"}`}>
                    {m.quantity > 0 ? "+" : ""}
                    {num(m.quantity)}
                  </span>
                  <span className="min-w-0 flex-1 truncate">{p?.name}</span>
                  <span className="text-xs text-fg-3">{MOVEMENT_LABELS[m.type]}</span>
                  <span className="text-xs text-fg-3">{m.user}</span>
                  <span className="tabular text-xs text-fg-3">{dateTime(m.at)}</span>
                </li>
              );
            })}
          </ul>
        </Card>
      )}
    </>
  );
}
