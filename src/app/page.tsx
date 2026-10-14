const STAGES = [
  { n: 1, title: "Arquitetura", status: "concluída", detail: "Modelagem, migrations, RLS, regras de negócio e testes" },
  { n: 2, title: "Fundação", status: "próxima", detail: "Autenticação, layout administrativo e dashboard" },
  { n: 3, title: "Cadastros", status: "pendente", detail: "Produtos, clientes e fornecedores" },
  { n: 4, title: "Estoque e compras", status: "pendente", detail: "Movimentações, pedidos, recebimentos e PDF" },
  { n: 5, title: "Vendas", status: "pendente", detail: "PDV, pagamentos, comprovantes e devoluções" },
  { n: 6, title: "Fiscal", status: "pendente", detail: "NF-e/NFC-e via provedor, começando em homologação" },
  { n: 7, title: "Financeiro e relatórios", status: "pendente", detail: "Contas, fluxo de caixa e indicadores" },
  { n: 8, title: "Validação e deploy", status: "pendente", detail: "Testes ponta a ponta, revisão de segurança, Vercel" },
];

export default function Home() {
  return (
    <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-12">
      <h1 className="text-2xl font-semibold">ERP — Gestão Empresarial</h1>
      <p className="mt-2 text-sm opacity-70">
        Sistema em desenvolvimento. Esta página será substituída pelo login e pelo painel na Etapa 2.
      </p>
      <ol className="mt-8 space-y-3">
        {STAGES.map((s) => (
          <li key={s.n} className="flex items-start gap-3 rounded-lg border border-black/10 p-4 dark:border-white/15">
            <span className="font-mono text-sm opacity-60">{s.n}</span>
            <div className="flex-1">
              <div className="flex items-center justify-between gap-2">
                <span className="font-medium">{s.title}</span>
                <span className="text-xs uppercase tracking-wide opacity-60">{s.status}</span>
              </div>
              <p className="mt-1 text-sm opacity-70">{s.detail}</p>
            </div>
          </li>
        ))}
      </ol>
    </main>
  );
}
