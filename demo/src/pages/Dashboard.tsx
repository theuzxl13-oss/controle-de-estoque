import { AlertTriangle, Bike, Clock, DollarSign, Flame, MessageCircle, Receipt, ShoppingCart, Wallet } from "lucide-react";
import { useMemo, useState } from "react";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

import { Badge, brl, Button, buttonClass, Card, CardHeader, Kpi, num, PageHeader, Tabs } from "../components/ui";
import { COMPANY } from "../data/seed";
import type { Sale } from "../data/types";
import { navigate } from "../router";
import { useStore } from "../store";
import { customerHistory, METHOD_LABELS } from "./Pdv";

type Period = "7" | "30" | "90";
type Metric = "valor" | "unidades";

const dayKey = (d: Date) => d.toISOString().slice(0, 10);
const axis = { stroke: "var(--text-3)", fontSize: 11, tickLine: false, axisLine: false } as const;
const shortMoney = (n: number) => (n >= 1000 ? `${(n / 1000).toLocaleString("pt-BR", { maximumFractionDigits: n >= 10000 ? 0 : 1 })} mil` : String(Math.round(n)));
const gasUnits = (s: Sale, productIds: Set<string>) => s.items.filter((i) => productIds.has(i.productId)).reduce((a, i) => a + i.quantity, 0);

function ChartTooltip({ active, payload, label, metric }: { active?: boolean; payload?: { value: number }[]; label?: string; metric: Metric }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border border-line bg-surface px-3 py-2 text-xs shadow-lg">
      <p className="text-fg-3">{label}</p>
      <p className="tabular mt-0.5 font-semibold text-fg">{metric === "valor" ? brl(payload[0].value) : `${num(payload[0].value)} botijões`}</p>
    </div>
  );
}

export function Dashboard() {
  const { products, sales, customers, titles, can, user } = useStore();
  const [period, setPeriod] = useState<Period>("30");
  const [metric, setMetric] = useState<Metric>("valor");
  const onlyOwn = !can("sales.view_all");
  const gasIds = useMemo(() => new Set(products.filter((p) => p.kind === "gas").map((p) => p.id)), [products]);

  const completed = sales.filter((s) => s.status === "completed" && (!onlyOwn || s.seller === user.name));
  const todayKey = dayKey(new Date());
  const today = completed.filter((s) => s.at.slice(0, 10) === todayKey);
  const todayTotal = today.reduce((a, s) => a + s.total, 0);
  const todayGas = today.reduce((a, s) => a + gasUnits(s, gasIds), 0);
  const p13 = products.find((p) => p.name.startsWith("Gás P13"));
  const todayP13 = p13 ? today.reduce((a, s) => a + s.items.filter((i) => i.productId === p13.id).reduce((b, i) => b + i.quantity, 0), 0) : 0;
  const openDeliveries = sales.filter((s) => s.status === "completed" && s.delivery && s.delivery.status !== "entregue");
  const pending = openDeliveries.filter((s) => s.delivery!.status === "pendente").length;
  const toCollect = openDeliveries.filter((s) => !s.paid).reduce((a, s) => a + s.total, 0);

  const chart = useMemo(() => {
    const days = Number(period);
    const rows: { label: string; key: string; valor: number; unidades: number }[] = [];
    for (let i = days - 1; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      rows.push({ key: dayKey(d), label: d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" }), valor: 0, unidades: 0 });
    }
    const idx = new Map(rows.map((r, i) => [r.key, i]));
    for (const s of completed) {
      const i = idx.get(s.at.slice(0, 10));
      if (i === undefined) continue;
      rows[i].valor += s.total;
      rows[i].unidades += gasUnits(s, gasIds);
    }
    rows.forEach((r) => (r.valor = Math.round(r.valor * 100) / 100));
    const inPeriod = completed.filter((s) => idx.has(s.at.slice(0, 10)));
    const total = inPeriod.reduce((a, s) => a + s.total, 0);
    const byProduct = new Map<string, { name: string; qty: number; revenue: number }>();
    for (const s of inPeriod)
      for (const it of s.items) {
        const cur = byProduct.get(it.productId) ?? { name: it.name.split(" (")[0], qty: 0, revenue: 0 };
        cur.qty += it.quantity;
        cur.revenue += it.total;
        byProduct.set(it.productId, cur);
      }
    const deliveries = inPeriod.filter((s) => s.channel === "entrega").length;
    return {
      rows,
      total,
      count: inPeriod.length,
      ticket: inPeriod.length ? total / inPeriod.length : 0,
      deliveryShare: inPeriod.length ? (deliveries / inPeriod.length) * 100 : 0,
      top: [...byProduct.values()].sort((a, b) => b.revenue - a.revenue).slice(0, 6),
    };
  }, [completed, period, gasIds]);

  const methodsToday = useMemo(() => {
    const m = new Map<string, number>();
    for (const s of today) m.set(s.method, (m.get(s.method) ?? 0) + s.total);
    return [...m.entries()].sort((a, b) => b[1] - a[1]);
  }, [today]);

  // Clientes que costumam comprar e já estão "na hora" de comprar de novo
  const reminders = useMemo(() => {
    const now = Date.now();
    return customers
      .map((c) => {
        const h = customerHistory(sales, c.id);
        if (!h.last || !h.avgDays || h.count < 2) return null;
        const since = Math.floor((now - new Date(h.last.at).getTime()) / 86400000);
        return { c, h, since, due: since - h.avgDays };
      })
      .filter((x): x is NonNullable<typeof x> => x !== null && x.due >= -2 && x.since >= 3)
      .sort((a, b) => b.due - a.due)
      .slice(0, 8);
  }, [customers, sales]);

  const returnables = products.filter((p) => p.active && p.returnable);
  const low = products.filter((p) => p.active && p.stockFull <= p.minStock);
  const overdue = titles.filter((t) => t.status === "open" && t.dueDate < todayKey);

  return (
    <>
      <PageHeader
        title={`${new Date().getHours() < 12 ? "Bom dia" : new Date().getHours() < 18 ? "Boa tarde" : "Boa noite"}, ${user.name.split(" ")[0]}!`}
        description={onlyOwn ? "Resumo das suas vendas." : "Resumo das vendas e do estoque da revenda."}
        actions={
          can("sales.create") && (
            <Button variant="primary" onClick={() => navigate("pdv")}>
              <ShoppingCart className="size-4" /> Nova venda
            </Button>
          )
        }
      />

      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <Kpi icon={DollarSign} label="Vendido hoje" value={brl(todayTotal)} hint={`${today.length} vendas`} />
        <Kpi icon={Flame} label="Botijões vendidos hoje" value={num(todayGas)} hint={p13 ? `${todayP13} P13` : undefined} />
        <Kpi icon={Bike} tone="info" label="Entregas em andamento" value={num(openDeliveries.length)} hint={`${pending} aguardando saída`} onClick={() => navigate("entregas")} />
        <Kpi icon={Wallet} tone="warn" label="A receber nas entregas" value={brl(toCollect)} hint="Pagamento na porta" onClick={() => navigate("entregas")} />
      </div>

      {(low.length > 0 || (can("finance.view") && overdue.length > 0)) && (
        <div className="mt-3 flex flex-wrap gap-2">
          {low.map((p) => (
            <button key={p.id} onClick={() => navigate("estoque")} className="flex items-center gap-1.5 rounded-lg bg-warn-soft px-3 py-1.5 text-xs font-medium text-warn">
              <AlertTriangle className="size-3.5" /> {p.name.split(" (")[0]}: {p.stockFull} {p.returnable ? "cheios" : "em estoque"} (mín. {p.minStock})
            </button>
          ))}
          {can("finance.view") && overdue.length > 0 && (
            <button onClick={() => navigate("financeiro")} className="flex items-center gap-1.5 rounded-lg bg-bad-soft px-3 py-1.5 text-xs font-medium text-bad">
              <Clock className="size-3.5" /> {overdue.length} conta(s) vencida(s)
            </button>
          )}
        </div>
      )}

      <div className="mt-4 grid grid-cols-1 gap-4 xl:grid-cols-3">
        <Card className="flex flex-col xl:col-span-2">
          <CardHeader
            title={metric === "valor" ? "Vendas por dia (R$)" : "Botijões de gás vendidos por dia"}
            subtitle={`${chart.count} vendas · ${brl(chart.total)} · ticket médio ${brl(chart.ticket)} · ${chart.deliveryShare.toFixed(0)}% por entrega`}
            actions={
              <div className="flex flex-wrap gap-2">
                <Tabs<Metric> value={metric} onChange={setMetric} items={[{ value: "valor", label: "R$" }, { value: "unidades", label: "Botijões" }]} />
                <Tabs<Period> value={period} onChange={setPeriod} items={[{ value: "7", label: "7 d" }, { value: "30", label: "30 d" }, { value: "90", label: "90 d" }]} />
              </div>
            }
          />
          <div className="h-64 flex-1 px-2 pt-4 pb-2 xl:h-auto xl:min-h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chart.rows} margin={{ left: 4, right: 8 }}>
                <CartesianGrid vertical={false} stroke="var(--grid)" />
                <XAxis dataKey="label" {...axis} minTickGap={12} />
                <YAxis {...axis} width={52} tickFormatter={metric === "valor" ? shortMoney : (v: number) => String(v)} allowDecimals={false} />
                <Tooltip cursor={{ fill: "var(--surface-2)" }} content={<ChartTooltip metric={metric} />} />
                <Bar dataKey={metric} fill="var(--series-1)" radius={[4, 4, 0, 0]} maxBarSize={28} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>

        <Card>
          <CardHeader title="Estoque de vasilhames" subtitle="Cheios prontos para venda × vazios aguardando carga" />
          <ul className="divide-y divide-line">
            {returnables.map((p) => {
              const max = Math.max(p.stockFull + p.stockEmpty, 1);
              return (
                <li key={p.id} className="px-4 py-2.5">
                  <div className="flex items-baseline justify-between gap-2 text-sm">
                    <span className="truncate font-medium">{p.name.split(" (")[0]}</span>
                    <span className="tabular shrink-0 text-xs text-fg-2">
                      <b className={p.stockFull <= p.minStock ? "text-warn" : "text-fg"}>{p.stockFull}</b> cheios · {p.stockEmpty} vazios
                    </span>
                  </div>
                  <div className="mt-1.5 flex h-2 gap-0.5 overflow-hidden rounded-full bg-surface-2">
                    <div className="h-2 rounded-full bg-[var(--series-1)]" style={{ width: `${(p.stockFull / max) * 100}%` }} />
                    <div className="h-2 rounded-full bg-[var(--text-3)] opacity-40" style={{ width: `${(p.stockEmpty / max) * 100}%` }} />
                  </div>
                </li>
              );
            })}
          </ul>
          <p className="flex gap-4 px-4 py-2 text-[11px] text-fg-3">
            <span className="flex items-center gap-1"><span className="size-2 rounded-full bg-[var(--series-1)]" /> Cheios</span>
            <span className="flex items-center gap-1"><span className="size-2 rounded-full bg-[var(--text-3)] opacity-40" /> Vazios</span>
          </p>
        </Card>

        <Card className="xl:col-span-2">
          <CardHeader title="Clientes para lembrar" subtitle="Pela frequência de compra, já devem estar precisando de gás ou água" />
          <ul className="divide-y divide-line">
            {reminders.map(({ c, h, since, due }) => {
              const msg = `Olá, ${c.name.split(" ")[0]}! Aqui é da ${COMPANY.tradeName}. Seu ${h.last!.items[0].name.split(" (")[0]} já está acabando? É só responder que a gente entrega! 🔥`;
              return (
                <li key={c.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2.5 text-sm">
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium">{c.name}</p>
                    <p className="text-xs text-fg-3">
                      {h.last!.items.map((i) => `${i.quantity}× ${i.name.split(" (")[0]}`).join(", ")} · compra a cada ~{h.avgDays} dias · última há {since} dias
                    </p>
                  </div>
                  <Badge tone={due > 3 ? "bad" : due >= 0 ? "warn" : "info"}>{due > 0 ? `${due} ${due === 1 ? "dia" : "dias"} de atraso` : due === 0 ? "hoje" : `em ${-due} dias`}</Badge>
                  <a className={buttonClass("secondary", "sm")} href={`https://wa.me/55${c.phone.replace(/\D/g, "")}?text=${encodeURIComponent(msg)}`} target="_blank" rel="noreferrer">
                    <MessageCircle className="size-3.5" /> Chamar
                  </a>
                </li>
              );
            })}
            {reminders.length === 0 && <li className="px-4 py-8 text-center text-sm text-fg-3">Nenhum cliente para lembrar agora.</li>}
          </ul>
        </Card>

        <div className="space-y-4">
          <Card>
            <CardHeader title="Mais vendidos" subtitle={`Últimos ${period} dias`} />
            <ul className="divide-y divide-line">
              {chart.top.map((p, i) => (
                <li key={p.name} className="flex items-center justify-between gap-2 px-4 py-2 text-sm">
                  <span className="truncate">
                    <span className="mr-1.5 text-fg-3">{i + 1}.</span>
                    {p.name}
                  </span>
                  <span className="tabular shrink-0 text-right">
                    <span className="font-medium">{brl(p.revenue)}</span>
                    <span className="block text-[11px] text-fg-3">{num(p.qty)} un</span>
                  </span>
                </li>
              ))}
            </ul>
          </Card>
          <Card>
            <CardHeader title="Vendido hoje por forma de pagamento" />
            <ul className="divide-y divide-line">
              {methodsToday.map(([m, v]) => (
                <li key={m} className="flex justify-between px-4 py-2 text-sm">
                  <span className="flex items-center gap-1.5">
                    <Receipt className="size-3.5 text-fg-3" /> {METHOD_LABELS[m as keyof typeof METHOD_LABELS]}
                  </span>
                  <span className="tabular font-medium">{brl(v)}</span>
                </li>
              ))}
              {methodsToday.length === 0 && <li className="px-4 py-6 text-center text-sm text-fg-3">Sem vendas hoje.</li>}
            </ul>
          </Card>
        </div>
      </div>
    </>
  );
}
