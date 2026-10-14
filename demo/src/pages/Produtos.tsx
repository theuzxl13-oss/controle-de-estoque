import { Download, PackagePlus, Pencil, Upload } from "lucide-react";
import { useMemo, useRef, useState } from "react";

import { Badge, brl, Button, Card, Field, Input, Modal, num, PageHeader, SearchInput, Select, Table, Tabs, Textarea, useFeedback, usePagination } from "../components/ui";
import type { Product } from "../data/types";
import { useStore } from "../store";
import { downloadCsv, parseCsv } from "../csv";

type Draft = Omit<Product, "id" | "code" | "stock"> & { id?: string; initialStock?: number };

const empty: Draft = {
  barcode: "", name: "", description: "", category: "", brand: "", supplierId: null, cost: 0, price: 0,
  minStock: 0, unit: "UN", location: "", active: true, ncm: "", cest: "", origin: 0, cfop: "5102", initialStock: 0,
};

export function Produtos() {
  const { products, suppliers, can, saveProduct } = useStore();
  const { run } = useFeedback();
  const [q, setQ] = useState("");
  const [category, setCategory] = useState("");
  const [stockFilter, setStockFilter] = useState<"all" | "low" | "out" | "inactive">("all");
  const [editing, setEditing] = useState<Draft | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const categories = [...new Set(products.map((p) => p.category))].sort();
  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    return products
      .filter((p) =>
        !term || p.name.toLowerCase().includes(term) || p.barcode.includes(term) || String(p.code) === term,
      )
      .filter((p) => !category || p.category === category)
      .filter((p) =>
        stockFilter === "all" ? p.active
          : stockFilter === "low" ? p.active && p.stock > 0 && p.stock <= p.minStock
          : stockFilter === "out" ? p.active && p.stock <= 0
          : !p.active,
      )
      .sort((a, b) => a.code - b.code);
  }, [products, q, category, stockFilter]);
  const { slice, control } = usePagination(filtered, 12);

  const exportCsv = () =>
    downloadCsv(
      "produtos.csv",
      ["codigo", "codigo_barras", "nome", "categoria", "marca", "preco_custo", "preco_venda", "estoque", "estoque_minimo", "unidade", "ncm"],
      filtered.map((p) => [p.code, p.barcode, p.name, p.category, p.brand, p.cost, p.price, p.stock, p.minStock, p.unit, p.ncm]),
    );

  const importCsv = async (file: File) => {
    const rows = parseCsv(await file.text());
    let ok = 0;
    for (const r of rows) {
      const done = run(() =>
        saveProduct({
          ...empty,
          name: r.nome ?? "",
          barcode: r.codigo_barras ?? "",
          category: r.categoria ?? "",
          brand: r.marca ?? "",
          cost: Number((r.preco_custo ?? "0").replace(",", ".")),
          price: Number((r.preco_venda ?? "0").replace(",", ".")),
          minStock: Number(r.estoque_minimo ?? 0),
          unit: (r.unidade || "UN").toUpperCase(),
          ncm: r.ncm ?? "",
        }),
      );
      if (done) ok++;
    }
    run(() => {
      if (rows.length === 0) throw new Error("Arquivo vazio ou sem cabeçalho (nome;preco_venda;…).");
    }, `${ok} de ${rows.length} produto(s) importado(s).`);
  };

  return (
    <>
      <PageHeader
        title="Produtos"
        description="Cadastro, preços, saldo e dados fiscais."
        actions={
          <>
            <Button onClick={exportCsv}>
              <Download className="size-4" /> Exportar CSV
            </Button>
            {can("products.manage") && (
              <>
                <Button onClick={() => fileRef.current?.click()}>
                  <Upload className="size-4" /> Importar CSV
                </Button>
                <input
                  ref={fileRef}
                  type="file"
                  accept=".csv,text/csv"
                  hidden
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) void importCsv(f);
                    e.target.value = "";
                  }}
                />
                <Button variant="primary" onClick={() => setEditing({ ...empty })}>
                  <PackagePlus className="size-4" /> Novo produto
                </Button>
              </>
            )}
          </>
        }
      />
      <Card>
        <div className="flex flex-wrap items-center gap-2 border-b border-line p-3">
          <SearchInput value={q} onChange={setQ} placeholder="Nome, código ou código de barras" />
          <Select value={category} onChange={(e) => setCategory(e.target.value)} className="w-auto">
            <option value="">Todas as categorias</option>
            {categories.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </Select>
          <Tabs
            value={stockFilter}
            onChange={setStockFilter}
            items={[
              { value: "all", label: "Ativos" },
              { value: "low", label: "Estoque baixo" },
              { value: "out", label: "Sem estoque" },
              { value: "inactive", label: "Inativos" },
            ]}
          />
        </div>
        <Table
          empty={filtered.length === 0}
          head={
            <>
              <th>Cód.</th>
              <th>Produto</th>
              <th>Categoria</th>
              <th className="text-right">Custo</th>
              <th className="text-right">Venda</th>
              <th className="text-right">Margem</th>
              <th className="text-right">Estoque</th>
              <th>Local</th>
              <th />
            </>
          }
        >
          {slice.map((p) => {
            const margin = p.price > 0 ? ((p.price - p.cost) / p.price) * 100 : 0;
            return (
              <tr key={p.id} className="hover:bg-surface-2/60">
                <td className="tabular text-fg-3">{p.code}</td>
                <td>
                  <div className="font-medium">{p.name}</div>
                  <div className="tabular text-xs text-fg-3">{p.barcode} · {p.brand}</div>
                </td>
                <td className="text-fg-2">{p.category}</td>
                <td className="tabular text-right text-fg-2">{brl(p.cost)}</td>
                <td className="tabular text-right font-medium">{brl(p.price)}</td>
                <td className="tabular text-right text-fg-2">{margin.toFixed(1)}%</td>
                <td className="text-right">
                  <Badge tone={p.stock <= 0 ? "bad" : p.stock <= p.minStock ? "warn" : "neutral"}>
                    {num(p.stock)} {p.unit}
                  </Badge>
                </td>
                <td className="text-fg-3">{p.location}</td>
                <td className="text-right">
                  {can("products.manage") && (
                    <Button size="sm" variant="ghost" aria-label={`Editar ${p.name}`} onClick={() => setEditing({ ...p })}>
                      <Pencil className="size-4" />
                    </Button>
                  )}
                </td>
              </tr>
            );
          })}
        </Table>
        {control}
      </Card>

      {editing && (
        <ProductForm
          draft={editing}
          categories={categories}
          suppliers={suppliers.map((s) => ({ id: s.id, name: s.tradeName || s.legalName }))}
          onClose={() => setEditing(null)}
          onSave={(d) => run(() => saveProduct(d), d.id ? "Produto atualizado." : "Produto cadastrado.") && setEditing(null)}
        />
      )}
    </>
  );
}

function ProductForm({
  draft,
  categories,
  suppliers,
  onClose,
  onSave,
}: {
  draft: Draft;
  categories: string[];
  suppliers: { id: string; name: string }[];
  onClose: () => void;
  onSave: (d: Draft) => void;
}) {
  const [d, setD] = useState(draft);
  const [tab, setTab] = useState<"geral" | "estoque" | "fiscal">("geral");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setD((x) => ({ ...x, [k]: v }));
  const margin = d.price > 0 ? ((d.price - d.cost) / d.price) * 100 : 0;

  const submit = () => {
    const e: Record<string, string> = {};
    if (d.name.trim().length < 2) e.name = "Informe o nome do produto.";
    if (!(d.price >= 0)) e.price = "Preço inválido.";
    if (!(d.cost >= 0)) e.cost = "Custo inválido.";
    if (d.ncm && !/^\d{8}$/.test(d.ncm)) e.ncm = "NCM deve ter 8 dígitos.";
    if (d.cest && !/^\d{7}$/.test(d.cest)) e.cest = "CEST deve ter 7 dígitos.";
    if (d.barcode && !/^[0-9A-Za-z]{1,30}$/.test(d.barcode)) e.barcode = "Código de barras inválido.";
    setErrors(e);
    if (Object.keys(e).length) {
      setTab(e.ncm || e.cest ? "fiscal" : "geral");
      return;
    }
    onSave({ ...d, name: d.name.trim() });
  };

  return (
    <Modal
      open
      size="lg"
      title={d.id ? `Editar produto` : "Novo produto"}
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
      <Tabs
        value={tab}
        onChange={setTab}
        items={[
          { value: "geral", label: "Dados gerais" },
          { value: "estoque", label: "Preço e estoque" },
          { value: "fiscal", label: "Fiscal" },
        ]}
      />
      <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
        {tab === "geral" && (
          <>
            <Field label="Nome *" error={errors.name} className="sm:col-span-2">
              <Input value={d.name} onChange={(e) => set("name", e.target.value)} autoFocus />
            </Field>
            <Field label="Código de barras (EAN/GTIN)" error={errors.barcode}>
              <Input value={d.barcode} onChange={(e) => set("barcode", e.target.value.trim())} inputMode="numeric" />
            </Field>
            <Field label="Código interno" hint="Gerado automaticamente">
              <Input value={d.id ? "—" : "Automático"} disabled />
            </Field>
            <Field label="Categoria">
              <Input list="cats" value={d.category} onChange={(e) => set("category", e.target.value)} />
              <datalist id="cats">
                {categories.map((c) => (
                  <option key={c} value={c} />
                ))}
              </datalist>
            </Field>
            <Field label="Marca">
              <Input value={d.brand} onChange={(e) => set("brand", e.target.value)} />
            </Field>
            <Field label="Fornecedor principal">
              <Select value={d.supplierId ?? ""} onChange={(e) => set("supplierId", e.target.value || null)}>
                <option value="">—</option>
                {suppliers.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Situação">
              <Select value={d.active ? "1" : "0"} onChange={(e) => set("active", e.target.value === "1")}>
                <option value="1">Ativo</option>
                <option value="0">Inativo</option>
              </Select>
            </Field>
            <Field label="Descrição" className="sm:col-span-2">
              <Textarea value={d.description} onChange={(e) => set("description", e.target.value)} />
            </Field>
          </>
        )}
        {tab === "estoque" && (
          <>
            <Field label="Preço de custo (R$)" error={errors.cost}>
              <Input type="number" min={0} step="0.01" value={d.cost} onChange={(e) => set("cost", Number(e.target.value))} />
            </Field>
            <Field label="Preço de venda (R$)" error={errors.price} hint={`Margem sobre a venda: ${margin.toFixed(1)}%`}>
              <Input type="number" min={0} step="0.01" value={d.price} onChange={(e) => set("price", Number(e.target.value))} />
            </Field>
            <Field label="Unidade de medida">
              <Select value={d.unit} onChange={(e) => set("unit", e.target.value)}>
                {["UN", "CX", "KG", "G", "L", "ML", "M", "PCT", "PAR"].map((u) => (
                  <option key={u}>{u}</option>
                ))}
              </Select>
            </Field>
            <Field label="Estoque mínimo">
              <Input type="number" min={0} value={d.minStock} onChange={(e) => set("minStock", Number(e.target.value))} />
            </Field>
            <Field label="Localização no estoque" hint="Ex.: corredor A, prateleira 3">
              <Input value={d.location} onChange={(e) => set("location", e.target.value)} />
            </Field>
            {!d.id && (
              <Field label="Estoque inicial" hint="Lançado como movimentação de entrada">
                <Input type="number" min={0} value={d.initialStock ?? 0} onChange={(e) => set("initialStock", Number(e.target.value))} />
              </Field>
            )}
            {d.id && (
              <p className="text-xs text-fg-3 sm:col-span-2">
                O saldo só muda por movimentações (entrada, saída, ajuste, venda, recebimento) — use a tela de Movimentações.
              </p>
            )}
          </>
        )}
        {tab === "fiscal" && (
          <>
            <Field label="NCM" error={errors.ncm} hint="8 dígitos">
              <Input value={d.ncm} onChange={(e) => set("ncm", e.target.value.replace(/\D/g, ""))} inputMode="numeric" />
            </Field>
            <Field label="CEST" error={errors.cest} hint="7 dígitos, quando aplicável">
              <Input value={d.cest} onChange={(e) => set("cest", e.target.value.replace(/\D/g, ""))} inputMode="numeric" />
            </Field>
            <Field label="Origem da mercadoria">
              <Select value={d.origin} onChange={(e) => set("origin", Number(e.target.value))}>
                <option value={0}>0 — Nacional</option>
                <option value={1}>1 — Estrangeira, importação direta</option>
                <option value={2}>2 — Estrangeira, mercado interno</option>
              </Select>
            </Field>
            <Field label="Regra tributária (CFOP)" hint="Definida com o contador">
              <Select value={d.cfop} onChange={(e) => set("cfop", e.target.value)}>
                <option value="5102">5102 — Venda de mercadoria (Simples: CSOSN 102)</option>
                <option value="5405">5405 — Venda com ST (CSOSN 500)</option>
              </Select>
            </Field>
          </>
        )}
      </div>
    </Modal>
  );
}
