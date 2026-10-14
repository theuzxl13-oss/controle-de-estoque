import { Bike, CheckCircle2, Clock, Map, MapPin, MessageCircle, Phone, Plus } from "lucide-react";
import { useEffect, useState } from "react";

import { Badge, brl, Button, buttonClass, Card, cx, PageHeader, Select, useFeedback } from "../components/ui";
import type { DeliveryStatus, Sale } from "../data/types";
import { navigate } from "../router";
import { useStore } from "../store";
import { METHOD_LABELS, MODE_LABELS } from "./Pdv";

const COLUMNS: { status: DeliveryStatus; title: string; tone: "warn" | "info" | "good" }[] = [
  { status: "pendente", title: "Aguardando saída", tone: "warn" },
  { status: "em_rota", title: "Em rota", tone: "info" },
  { status: "entregue", title: "Entregues hoje", tone: "good" },
];

function useNow() {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30000);
    return () => clearInterval(t);
  }, []);
  return now;
}

const minutes = (from: string, now: number) => Math.max(0, Math.round((now - new Date(from).getTime()) / 60000));
const elapsed = (m: number) => (m < 60 ? `${m} min` : `${Math.floor(m / 60)}h${String(m % 60).padStart(2, "0")}`);

export function Entregas() {
  const { sales, can } = useStore();
  const now = useNow();
  const todayKey = new Date().toISOString().slice(0, 10);
  const deliveries = sales.filter((s) => s.status === "completed" && s.delivery);
  const byStatus = (st: DeliveryStatus) =>
    deliveries
      .filter((s) => s.delivery!.status === st && (st !== "entregue" || (s.delivery!.deliveredAt ?? "").slice(0, 10) === todayKey))
      .sort((a, b) => (st === "entregue" ? b.at.localeCompare(a.at) : a.at.localeCompare(b.at)));

  return (
    <>
      <PageHeader
        title="Entregas"
        description="Acompanhe os pedidos: aguardando saída → em rota → entregue. O vasilhame vazio entra no estoque na confirmação."
        actions={
          can("sales.create") && (
            <Button variant="primary" onClick={() => navigate("pdv")}>
              <Plus className="size-4" /> Novo pedido
            </Button>
          )
        }
      />
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        {COLUMNS.map((col) => {
          const list = byStatus(col.status);
          return (
            <section key={col.status} className="min-w-0">
              <div className="mb-2 flex items-center gap-2">
                <h2 className="text-sm font-semibold">{col.title}</h2>
                <Badge tone={col.tone}>{list.length}</Badge>
              </div>
              <div className="space-y-3">
                {list.map((s) => (
                  <DeliveryCard key={s.id} sale={s} now={now} />
                ))}
                {list.length === 0 && <Card className="p-6 text-center text-sm text-fg-3">Nenhum pedido.</Card>}
              </div>
            </section>
          );
        })}
      </div>
    </>
  );
}

function DeliveryCard({ sale, now }: { sale: Sale; now: number }) {
  const { customers, drivers, dispatchDelivery, confirmDelivery, can } = useStore();
  const { run } = useFeedback();
  const [driver, setDriver] = useState(drivers[0]);
  const d = sale.delivery!;
  const c = customers.find((x) => x.id === sale.customerId);
  const waiting = minutes(sale.at, now);
  const late = d.status !== "entregue" && waiting > 45;
  const phone = c?.phone.replace(/\D/g, "") ?? "";
  const map = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${d.address}, São Paulo`)}`;

  return (
    <Card className={cx("p-3", late && "border-bad/60")}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-xs text-fg-3">Pedido nº {sale.number}</p>
          <p className="truncate font-semibold">{c?.name ?? "Cliente"}</p>
        </div>
        <span className={cx("flex shrink-0 items-center gap-1 text-xs font-medium", late ? "text-bad" : "text-fg-3")}>
          <Clock className="size-3.5" />
          {d.status === "entregue" && d.deliveredAt ? `entregue em ${elapsed(minutes(sale.at, new Date(d.deliveredAt).getTime()))}` : elapsed(waiting)}
        </span>
      </div>
      <p className="mt-1.5 flex items-start gap-1.5 text-sm text-fg-2">
        <MapPin className="mt-0.5 size-3.5 shrink-0" />
        <span>
          {d.address}
          {d.reference && <span className="block text-xs text-fg-3">{d.reference}</span>}
        </span>
      </p>
      <ul className="mt-2 space-y-0.5 text-sm">
        {sale.items.map((i) => (
          <li key={`${i.productId}-${i.mode}`} className="flex justify-between gap-2">
            <span>
              <b>{i.quantity}×</b> {i.name.split(" (")[0]} {i.mode !== "unidade" && <span className="text-xs text-fg-3">({MODE_LABELS[i.mode]})</span>}
            </span>
          </li>
        ))}
      </ul>
      <div className="mt-2 flex flex-wrap items-center justify-between gap-2 border-t border-line pt-2 text-sm">
        <span className="tabular font-semibold">{brl(sale.total)}</span>
        <span className="text-xs text-fg-2">
          {METHOD_LABELS[sale.method]}
          {d.changeFor ? ` · troco p/ ${brl(d.changeFor)} (levar ${brl(d.changeFor - sale.total)})` : ""}
          {sale.paid ? " · pago" : ""}
        </span>
      </div>
      {d.driver && d.status !== "pendente" && (
        <p className="mt-1 flex items-center gap-1.5 text-xs text-fg-3">
          <Bike className="size-3.5" /> {d.driver}
        </p>
      )}
      <div className="mt-3 flex flex-wrap gap-1.5">
        {phone && (
          <>
            <a className={buttonClass("secondary", "sm")} href={`tel:${phone}`} aria-label="Ligar">
              <Phone className="size-3.5" />
            </a>
            <a className={buttonClass("secondary", "sm")} href={`https://wa.me/55${phone}`} target="_blank" rel="noreferrer" aria-label="WhatsApp">
              <MessageCircle className="size-3.5" />
            </a>
          </>
        )}
        <a className={buttonClass("secondary", "sm")} href={map} target="_blank" rel="noreferrer" aria-label="Abrir no mapa">
          <Map className="size-3.5" />
        </a>
        {can("sales.create") && d.status === "pendente" && (
          <div className="flex min-w-0 flex-1 gap-1.5">
            <Select value={driver} onChange={(e) => setDriver(e.target.value)} className="h-8 min-w-0 flex-1 text-xs" aria-label="Entregador">
              {drivers.map((x) => (
                <option key={x}>{x}</option>
              ))}
            </Select>
            <Button size="sm" variant="primary" onClick={() => run(() => dispatchDelivery(sale.id, driver), `Pedido nº ${sale.number} saiu para entrega.`)}>
              <Bike className="size-3.5" /> Saiu
            </Button>
          </div>
        )}
        {can("sales.create") && d.status === "em_rota" && (
          <Button size="sm" variant="primary" className="ml-auto" onClick={() => run(() => confirmDelivery(sale.id), `Pedido nº ${sale.number} entregue. Vasilhame e pagamento registrados.`)}>
            <CheckCircle2 className="size-3.5" /> Confirmar entrega
          </Button>
        )}
      </div>
    </Card>
  );
}
