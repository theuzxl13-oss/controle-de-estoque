import { ChevronDown, Download, Droplets, Flame, PackagePlus, Pencil, Wrench } from "lucide-react";
import { useState } from "react";

import { Badge, brl, Button, Card, cx, Field, Input, Modal, Notice, PageHeader, Table, useFeedback } from "../components/ui";
import { downloadCsv } from "../csv";
import type { Product, ProductKind } from "../data/types";
import { type ProductDraft, useStore } from "../store";

const KINDS: { value: ProductKind; label: string; icon: typeof Flame }[] = [
  { value: "gas", label: "Gás (GLP)", icon: Flame },
  { value: "agua", label: "Água", icon: Droplets },
  { value: "acessorio", label: "Acessório", icon: Wrench },
  { value: "outro", label: "Outro", icon: PackagePlus },
];

const blank: ProductDraft = {
  kind: "gas", name: "", capacity: "", returnable: true, priceExchange: 0, priceFull: 0, costExchange: 0, costShell: 0,
  minStock: 0, active: true, barcode: "", ncm: "27111910", anpCode: "210203001", initialFull: 0, initialEmpty: 0,
};

/** Modelos para cadastrar em um clique (preços sugeridos editáveis). */
const PRESETS: { label: string; draft: Partial<ProductDraft> }[] = [
  { label: "P13", draft: { kind: "gas", name: "Gás P13 (botijão de cozinha)", capacity: "13 kg", returnable: true, minStock: 20 } },
  { label: "P45", draft: { kind: "gas", name: "Gás P45 (cilindro)", capacity: "45 kg", returnable: true, minStock: 5 } },
  { label: "P20", draft: { kind: "gas", name: "Gás P20 (empilhadeira)", capacity: "20 kg", returnable: true, minStock: 3 } },
  { label: "P8", draft: { kind: "gas", name: "Gás P8", capacity: "8 kg", returnable: true, minStock: 3 } },
  { label: "P5", draft: { kind: "gas", name: "Gás P5 (camping)", capacity: "5 kg", returnable: true, minStock: 3 } },
  { label: "Água 20 L", draft: { kind: "agua", name: "Água mineral galão", capacity: "20 L", returnable: true, ncm: "22011000", anpCode: "", minStock: 15 } },
  { label: "Água 10 L", draft: { kind: "agua", name: "Água mineral galão 10 L", capacity: "10 L", returnable: true, ncm: "22011000", anpCode: "", minStock: 10 } },
  { label: "Acessório", draft: { kind: "acessorio", name: "", capacity: "un", returnable: false, ncm: "", anpCode: "", minStock: 5 } },
];

export function Produtos() {
  const { products, can, saveProduct } = useStore();
  const { run } = useFeedback();
  const [editing, setEditing] = useState<ProductDraft | null>(null);
  const [showInactive, setShowInactive] = useState(false);
  const list = products.filter((p) => p.active || showInactive).sort((a, b) => Number(b.returnable) - Number(a.returnable) || a.code - b.code);
  const manage = can("products.manage");

  const savePrice = (p: Product, field: "priceExchange" | "priceFull", value: number) =>
    run(() => saveProduct({ ...p, [field]: value }), `Preço de ${p.name.split(" (")[0]} atualizado para ${brl(value)}.`);

  return (
    <>
      <PageHeader
        title="Produtos"
        description="Gás, água e acessórios. Botijões e galões controlam estoque de cheios e vazios."
        actions={
          <>
            <Button
              onClick={() =>
                downloadCsv(
                  "produtos.csv",
                  ["codigo", "produto", "capacidade", "preco_troca", "preco_completo", "custo", "cheios", "vazios", "minimo"],
                  list.map((p) => [p.code, p.name, p.capacity, p.priceExchange, p.returnable ? p.priceFull : "", p.costExchange, p.stockFull, p.returnable ? p.stockEmpty : "", p.minStock]),
                )
              }
            >
              <Download className="size-4" /> Exportar
            </Button>
            {manage && (
              <Button variant="primary" onClick={() => setEditing({ ...blank })}>
                <PackagePlus className="size-4" /> Novo produto
              </Button>
            )}
          </>
        }
      />
      {manage && (
        <Card className="mb-4 p-3">
          <p className="mb-2 text-xs font-medium text-fg-2">Cadastro rápido — escolha um modelo:</p>
          <div className="flex flex-wrap gap-2">
            {PRESETS.map((pr) => (
              <Button key={pr.label} size="sm" onClick={() => setEditing({ ...blank, ...pr.draft })}>
                {pr.draft.kind === "agua" ? <Droplets className="size-3.5" /> : pr.draft.kind === "gas" ? <Flame className="size-3.5" /> : <Wrench className="size-3.5" />}
                {pr.label}
              </Button>
            ))}
          </div>
        </Card>
      )}
      <Card>
        <Table
          empty={list.length === 0}
          head={
            <>
              <th>Produto</th>
              <th className="text-right">Troca / preço</th>
              <th className="text-right">Completo</th>
              <th className="text-right">Margem troca</th>
              <th className="text-center">Cheios</th>
              <th className="text-center">Vazios</th>
              <th />
            </>
          }
        >
          {list.map((p) => {
            const margin = p.priceExchange > 0 ? ((p.priceExchange - p.costExchange) / p.priceExchange) * 100 : 0;
            return (
              <tr key={p.id} className={cx(!p.active && "opacity-60")}>
                <td>
                  <div className="font-medium">{p.name}</div>
                  <div className="text-xs text-fg-3">
                    {KINDS.find((k) => k.value === p.kind)?.label} · {p.capacity} · cód. {p.code}
                    {!p.active && " · inativo"}
                  </div>
                </td>
                <td className="text-right">
                  <PriceCell value={p.priceExchange} editable={manage} onSave={(v) => savePrice(p, "priceExchange", v)} />
                </td>
                <td className="text-right">
                  {p.returnable ? <PriceCell value={p.priceFull} editable={manage} onSave={(v) => savePrice(p, "priceFull", v)} /> : <span className="text-fg-3">—</span>}
                </td>
                <td className="tabular text-right text-fg-2">{margin.toFixed(0)}%</td>
                <td className="text-center">
                  <Badge tone={p.stockFull <= 0 ? "bad" : p.stockFull <= p.minStock ? "warn" : "good"}>{p.stockFull}</Badge>
                  <span className="block text-[11px] text-fg-3">mín. {p.minStock}</span>
                </td>
                <td className="tabular text-center text-fg-2">{p.returnable ? p.stockEmpty : "—"}</td>
                <td className="text-right">
                  {manage && (
                    <Button size="sm" variant="ghost" aria-label={`Editar ${p.name}`} onClick={() => setEditing({ ...p })}>
                      <Pencil className="size-4" />
                    </Button>
                  )}
                </td>
              </tr>
            );
          })}
        </Table>
        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-line px-4 py-2.5 text-xs text-fg-3">
          <span>{manage ? "Dica: clique no preço para reajustar na hora." : "Somente consulta para o seu perfil."}</span>
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={showInactive} onChange={(e) => setShowInactive(e.target.checked)} /> Mostrar inativos
          </label>
        </div>
      </Card>

      {editing && (
        <ProductForm draft={editing} onClose={() => setEditing(null)} onSave={(d) => run(() => saveProduct(d), d.id ? "Produto atualizado." : "Produto cadastrado.") && setEditing(null)} />
      )}
    </>
  );
}

function PriceCell({ value, editable, onSave }: { value: number; editable: boolean; onSave: (v: number) => void }) {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState("");
  if (!editable) return <span className="tabular font-medium">{brl(value)}</span>;
  if (!editing)
    return (
      <button
        className="tabular rounded px-1.5 py-0.5 font-medium hover:bg-accent-soft hover:text-accent"
        title="Clique para alterar o preço"
        onClick={() => {
          setText(value.toFixed(2).replace(".", ","));
          setEditing(true);
        }}
      >
        {brl(value)}
      </button>
    );
  const commit = () => {
    const v = Number(text.replace(",", "."));
    setEditing(false);
    if (v > 0 && v !== value) onSave(v);
  };
  return (
    <Input
      autoFocus
      inputMode="decimal"
      value={text}
      onChange={(e) => setText(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === "Enter") commit();
        if (e.key === "Escape") setEditing(false);
      }}
      className="ml-auto h-8 !w-24 text-right"
    />
  );
}

function ProductForm({ draft, onClose, onSave }: { draft: ProductDraft; onClose: () => void; onSave: (d: ProductDraft) => void }) {
  const [d, setD] = useState(draft);
  const [advanced, setAdvanced] = useState(false);
  const set = <K extends keyof ProductDraft>(k: K, v: ProductDraft[K]) => setD((x) => ({ ...x, [k]: v }));
  const n = (s: string) => Number(s.replace(",", ".") || "0");
  const marginEx = d.priceExchange > 0 ? ((d.priceExchange - d.costExchange) / d.priceExchange) * 100 : 0;

  return (
    <Modal
      open
      title={d.id ? "Editar produto" : "Novo produto"}
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose}>Cancelar</Button>
          <Button variant="primary" onClick={() => onSave({ ...d, name: d.name.trim() })}>
            Salvar
          </Button>
        </>
      }
    >
      <div className="grid grid-cols-4 gap-1.5">
        {KINDS.map((k) => (
          <button
            key={k.value}
            onClick={() => {
              const ret = k.value === "gas" || k.value === "agua";
              setD((x) => ({ ...x, kind: k.value, returnable: ret, ncm: k.value === "gas" ? "27111910" : k.value === "agua" ? "22011000" : x.ncm, anpCode: k.value === "gas" ? "210203001" : "" }));
            }}
            className={cx(
              "flex flex-col items-center gap-1 rounded-lg border py-2.5 text-xs font-medium transition",
              d.kind === k.value ? "border-accent bg-accent-soft text-accent" : "border-line text-fg-2 hover:bg-surface-2",
            )}
          >
            <k.icon className="size-4" />
            {k.label}
          </button>
        ))}
      </div>

      <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Field label="Nome do produto *" className="sm:col-span-2">
          <Input autoFocus value={d.name} onChange={(e) => set("name", e.target.value)} placeholder={d.kind === "gas" ? "Ex.: Gás P13" : "Ex.: Regulador de gás"} />
        </Field>
        <Field label="Capacidade / unidade">
          <Input value={d.capacity} onChange={(e) => set("capacity", e.target.value)} placeholder="13 kg, 20 L, un" />
        </Field>
      </div>

      <label className="mt-3 flex items-start gap-2.5 rounded-lg bg-surface-2 p-3 text-sm">
        <input type="checkbox" className="mt-0.5 size-4" checked={d.returnable} onChange={(e) => set("returnable", e.target.checked)} />
        <span>
          <b>Tem vasilhame retornável</b> (botijão ou galão)
          <span className="block text-xs text-fg-3">Vende na troca ou completo e controla cheios e vazios no estoque.</span>
        </span>
      </label>

      <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Field label={d.returnable ? "Preço na troca *" : "Preço de venda *"} hint={d.returnable ? "Cliente traz o vazio" : undefined}>
          <Input inputMode="decimal" defaultValue={d.priceExchange || ""} onChange={(e) => set("priceExchange", n(e.target.value))} placeholder="0,00" />
        </Field>
        {d.returnable && (
          <Field label="Preço completo *" hint="Leva o vasilhame">
            <Input inputMode="decimal" defaultValue={d.priceFull || ""} onChange={(e) => set("priceFull", n(e.target.value))} placeholder="0,00" />
          </Field>
        )}
        <Field label={d.returnable ? "Custo da recarga" : "Custo"} hint={`Margem: ${marginEx.toFixed(0)}%`}>
          <Input inputMode="decimal" defaultValue={d.costExchange || ""} onChange={(e) => set("costExchange", n(e.target.value))} placeholder="0,00" />
        </Field>
        {d.returnable && (
          <Field label="Custo do vasilhame">
            <Input inputMode="decimal" defaultValue={d.costShell || ""} onChange={(e) => set("costShell", n(e.target.value))} placeholder="0,00" />
          </Field>
        )}
      </div>

      <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {!d.id && (
          <>
            <Field label={d.returnable ? "Cheios em estoque" : "Estoque inicial"}>
              <Input type="number" min={0} defaultValue={d.initialFull || ""} onChange={(e) => set("initialFull", Number(e.target.value))} placeholder="0" />
            </Field>
            {d.returnable && (
              <Field label="Vazios em estoque">
                <Input type="number" min={0} defaultValue={d.initialEmpty || ""} onChange={(e) => set("initialEmpty", Number(e.target.value))} placeholder="0" />
              </Field>
            )}
          </>
        )}
        <Field label="Avisar quando ficar com" hint="Estoque mínimo">
          <Input type="number" min={0} value={d.minStock} onChange={(e) => set("minStock", Number(e.target.value))} />
        </Field>
        {d.id && (
          <Field label="Situação">
            <select className="h-9 w-full rounded-lg border border-line bg-surface px-3 text-sm" value={d.active ? "1" : "0"} onChange={(e) => set("active", e.target.value === "1")}>
              <option value="1">Ativo</option>
              <option value="0">Inativo</option>
            </select>
          </Field>
        )}
      </div>
      {d.id && <p className="mt-2 text-xs text-fg-3">O estoque muda pelas vendas, cargas recebidas e movimentações (tela Estoque).</p>}

      <button className="mt-4 flex items-center gap-1 text-sm font-medium text-accent" onClick={() => setAdvanced(!advanced)}>
        <ChevronDown className={cx("size-4 transition", advanced && "rotate-180")} /> Dados fiscais (opcional)
      </button>
      {advanced && (
        <div className="mt-3 space-y-3">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <Field label="NCM">
              <Input value={d.ncm} onChange={(e) => set("ncm", e.target.value.replace(/\D/g, ""))} />
            </Field>
            <Field label="Código ANP" hint="GLP: 210203001">
              <Input value={d.anpCode} onChange={(e) => set("anpCode", e.target.value.replace(/\D/g, ""))} />
            </Field>
            <Field label="Código de barras">
              <Input value={d.barcode} onChange={(e) => set("barcode", e.target.value.trim())} />
            </Field>
          </div>
          {d.kind === "gas" && (
            <Notice>A NF-e/NFC-e de GLP exige código ANP e tributação monofásica de ICMS — confirme CST e alíquotas com o contador.</Notice>
          )}
        </div>
      )}
    </Modal>
  );
}
