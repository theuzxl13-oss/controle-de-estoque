import { Download, FileSpreadsheet, FileText, ShieldCheck } from "lucide-react";

import { ROLE_LABELS, ROLE_PERMISSIONS, PERMISSIONS, type Role } from "@erp/auth/permissions";

import { Badge, brl, Button, Card, CardHeader, dateTime, Field, Input, Notice, num, PageHeader, Select, Table } from "../components/ui";
import { downloadCsv } from "../csv";
import { COMPANY } from "../data/seed";
import { useStore } from "../store";

export function Fiscal() {
  const { can } = useStore();
  return (
    <>
      <PageHeader title="Notas fiscais" description="NF-e (modelo 55) e NFC-e (modelo 65) via provedor fiscal autorizado." />
      <Notice tone="warn">
        <b>Nenhuma nota é emitida nesta demonstração.</b> A emissão real depende de: contratação de um provedor fiscal (Focus NFe, PlugNotas,
        NFE.io ou Nuvem Fiscal), certificado digital A1, credenciamento de NFC-e na SEFAZ (CSC) e regras tributárias validadas pelo contador.
        Ela será implementada na Etapa 6, começando pelo ambiente de homologação.
      </Notice>
      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader title="Configuração fiscal" subtitle={can("fiscal.configure") ? "Somente administradores alteram" : "Somente leitura para o seu perfil"} />
          <div className="grid grid-cols-1 gap-3 p-4 sm:grid-cols-2">
            <Field label="Razão social">
              <Input value={COMPANY.legalName} disabled />
            </Field>
            <Field label="CNPJ">
              <Input value={COMPANY.document} disabled />
            </Field>
            <Field label="Regime tributário">
              <Select disabled value="sn">
                <option value="sn">Simples Nacional (CRT 1)</option>
              </Select>
            </Field>
            <Field label="Ambiente">
              <Select disabled value="h">
                <option value="h">Homologação</option>
              </Select>
            </Field>
            <Field label="Provedor fiscal">
              <Input value="Não configurado" disabled />
            </Field>
            <Field label="Certificado digital">
              <Input value="Não enviado" disabled />
            </Field>
            <Field label="NFC-e — série / próximo número">
              <Input value="1 / 1" disabled />
            </Field>
            <Field label="NF-e — série / próximo número">
              <Input value="1 / 1" disabled />
            </Field>
          </div>
        </Card>
        <Card>
          <CardHeader title="Fluxo de emissão (sistema real)" />
          <ol className="list-decimal space-y-1.5 py-4 pr-4 pl-9 text-sm text-fg-2">
            <li>Venda finalizada no PDV.</li>
            <li>Identifica o documento aplicável (NFC-e ao consumidor; NF-e para destinatário PJ/contribuinte).</li>
            <li>Valida dados do emitente, do cliente e dos produtos (NCM, CFOP, CST/CSOSN).</li>
            <li>Calcula tributos pelas regras configuradas.</li>
            <li>Envia ao provedor pelo servidor (credenciais nunca vão ao navegador).</li>
            <li>Consulta o retorno: autorizada, rejeitada, denegada ou contingência.</li>
            <li>Registra chave de acesso, protocolo, XML autorizado e DANFE em PDF.</li>
            <li>Cancelamento dentro do prazo legal antes de cancelar a venda.</li>
          </ol>
        </Card>
      </div>
      <Card className="mt-4">
        <CardHeader title="Documentos fiscais emitidos" />
        <p className="px-4 py-10 text-center text-sm text-fg-3">Nenhum documento — a emissão ainda não está habilitada.</p>
      </Card>
    </>
  );
}

export function Relatorios() {
  const { products, sales, customers } = useStore();
  const completed = sales.filter((s) => s.status === "completed");
  const stockValue = products.reduce((a, p) => a + Math.max(p.stock, 0) * p.cost, 0);
  const reports = [
    {
      title: "Posição de estoque",
      desc: `${products.length} produtos · valor em custo ${brl(stockValue)}`,
      run: () =>
        downloadCsv(
          "relatorio-estoque.csv",
          ["codigo", "produto", "categoria", "estoque", "minimo", "custo", "valor_em_estoque", "situacao"],
          products.map((p) => [p.code, p.name, p.category, p.stock, p.minStock, p.cost, Math.round(Math.max(p.stock, 0) * p.cost * 100) / 100,
            p.stock <= 0 ? "Sem estoque" : p.stock <= p.minStock ? "Abaixo do mínimo" : "OK"]),
        ),
    },
    {
      title: "Vendas por produto",
      desc: "Quantidade, faturamento e lucro bruto por produto",
      run: () => {
        const m = new Map<string, { name: string; q: number; r: number; c: number }>();
        for (const s of completed)
          for (const i of s.items) {
            const cur = m.get(i.productId) ?? { name: i.name, q: 0, r: 0, c: 0 };
            cur.q += i.quantity;
            cur.r += i.total;
            cur.c += i.unitCost * i.quantity;
            m.set(i.productId, cur);
          }
        downloadCsv("relatorio-vendas-produto.csv", ["produto", "quantidade", "faturamento", "custo", "lucro_bruto"],
          [...m.values()].map((v) => [v.name, v.q, Math.round(v.r * 100) / 100, Math.round(v.c * 100) / 100, Math.round((v.r - v.c) * 100) / 100]));
      },
    },
    {
      title: "Histórico de compras por cliente",
      desc: `${customers.length} clientes`,
      run: () =>
        downloadCsv("relatorio-clientes.csv", ["cliente", "compras", "total_gasto", "ultima_compra"],
          customers.map((c) => {
            const mine = completed.filter((s) => s.customerId === c.id);
            const last = mine.map((s) => s.at).sort().pop();
            return [c.name, mine.length, Math.round(mine.reduce((a, s) => a + s.total, 0) * 100) / 100, last ? dateTime(last) : ""];
          })),
    },
  ];
  return (
    <>
      <PageHeader title="Relatórios" description="Exportação em CSV (abre no Excel). PDF e XLSX gerados no servidor na versão final." />
      <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
        {reports.map((r) => (
          <Card key={r.title} className="flex flex-col p-4">
            <FileSpreadsheet className="size-6 text-accent" />
            <h3 className="mt-3 font-semibold">{r.title}</h3>
            <p className="mt-1 flex-1 text-sm text-fg-2">{r.desc}</p>
            <Button className="mt-4" onClick={r.run}>
              <Download className="size-4" /> Baixar CSV
            </Button>
          </Card>
        ))}
      </div>
      <Card className="mt-4 p-4 text-sm text-fg-2">
        <FileText className="mb-2 size-5 text-fg-3" />
        Totais do histórico da demonstração: {num(completed.length)} vendas concluídas, {brl(completed.reduce((a, s) => a + s.total, 0))} faturados.
      </Card>
    </>
  );
}

export function Usuarios() {
  const { users, audit, allowNegativeStock, setAllowNegativeStock } = useStore();
  return (
    <>
      <PageHeader title="Usuários e empresa" description="Perfis de acesso, parâmetros da empresa e auditoria." />
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader title="Usuários" subtitle="No sistema real, novos usuários são convidados por e-mail" />
          <Table
            head={
              <>
                <th>Nome</th>
                <th>Perfil</th>
                <th>Situação</th>
              </>
            }
          >
            {users.map((u) => (
              <tr key={u.id}>
                <td>
                  {u.name}
                  <span className="block text-xs text-fg-3">{u.email}</span>
                </td>
                <td>
                  <Badge tone="info">{ROLE_LABELS[u.role]}</Badge>
                </td>
                <td>
                  <Badge tone="good">Ativo</Badge>
                </td>
              </tr>
            ))}
          </Table>
        </Card>
        <Card>
          <CardHeader title="Parâmetros da empresa" />
          <div className="space-y-3 p-4 text-sm">
            <label className="flex items-start gap-3">
              <input type="checkbox" className="mt-1 size-4 accent-[var(--accent)]" checked={allowNegativeStock} onChange={(e) => setAllowNegativeStock(e.target.checked)} />
              <span>
                <b>Permitir estoque negativo</b>
                <span className="block text-fg-3">Desligado por padrão: vendas e saídas sem saldo são bloqueadas.</span>
              </span>
            </label>
            <p>
              <b>Desconto máximo do vendedor:</b> {COMPANY.maxSellerDiscount}% (acima disso, gerente ou administrador).
            </p>
            <p>
              <b>Prazo de recebimento do cartão de crédito:</b> 30 dias.
            </p>
          </div>
        </Card>
      </div>

      <Card className="mt-4">
        <CardHeader title="Matriz de permissões" subtitle="A mesma usada pelo banco de dados (RLS) no sistema real" />
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-line text-left text-fg-3">
                <th className="px-4 py-2 font-medium">Permissão</th>
                {(Object.keys(ROLE_LABELS) as Role[]).map((r) => (
                  <th key={r} className="px-3 py-2 text-center font-medium">
                    {ROLE_LABELS[r]}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {PERMISSIONS.map((p) => (
                <tr key={p}>
                  <td className="px-4 py-1.5 font-mono text-fg-2">{p}</td>
                  {(Object.keys(ROLE_LABELS) as Role[]).map((r) => (
                    <td key={r} className="px-3 py-1.5 text-center">
                      {ROLE_PERMISSIONS[r].includes(p) ? <ShieldCheck className="mx-auto size-4 text-good" aria-label="permitido" /> : <span className="text-fg-3">—</span>}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <Card className="mt-4">
        <CardHeader title="Auditoria" subtitle="Operações importantes registradas com usuário e horário" />
        <Table
          head={
            <>
              <th>Data</th>
              <th>Usuário</th>
              <th>Ação</th>
              <th>Detalhe</th>
            </>
          }
        >
          {audit.slice(0, 20).map((a) => (
            <tr key={a.id}>
              <td className="tabular whitespace-nowrap text-fg-2">{dateTime(a.at)}</td>
              <td>{a.user}</td>
              <td className="font-mono text-xs text-fg-2">{a.action}</td>
              <td className="text-fg-2">{a.detail}</td>
            </tr>
          ))}
        </Table>
      </Card>
    </>
  );
}
