import { ShieldOff } from "lucide-react";

import { Layout, NAV } from "./components/Layout";
import { Card } from "./components/ui";
import { useRoute } from "./router";
import { useStore } from "./store";
import { Clientes } from "./pages/Clientes";
import { Compras } from "./pages/Compras";
import { Dashboard } from "./pages/Dashboard";
import { Estoque } from "./pages/Estoque";
import { Financeiro } from "./pages/Financeiro";
import { Fornecedores } from "./pages/Fornecedores";
import { Fiscal, Relatorios, Usuarios } from "./pages/Outros";
import { Pdv } from "./pages/Pdv";
import { Produtos } from "./pages/Produtos";
import { Vendas } from "./pages/Vendas";

const PAGES: Record<string, () => React.ReactElement> = {
  dashboard: Dashboard,
  pdv: Pdv,
  vendas: Vendas,
  clientes: Clientes,
  produtos: Produtos,
  estoque: Estoque,
  compras: Compras,
  fornecedores: Fornecedores,
  financeiro: Financeiro,
  fiscal: Fiscal,
  relatorios: Relatorios,
  usuarios: Usuarios,
};

export default function App() {
  const route = useRoute();
  const { can } = useStore();
  const nav = NAV.find((n) => n.route === route) ?? NAV[0];
  const Page = PAGES[nav.route];
  return (
    <Layout route={nav.route}>
      {can(nav.permission) ? (
        <Page key={nav.route} />
      ) : (
        <Card className="mx-auto mt-10 max-w-md p-6 text-center">
          <ShieldOff className="mx-auto size-8 text-fg-3" />
          <h1 className="mt-3 font-semibold">Acesso não permitido</h1>
          <p className="mt-1 text-sm text-fg-2">
            Seu perfil não tem a permissão <code className="font-mono">{nav.permission}</code>. No sistema real, essa regra também é aplicada
            pelo banco de dados.
          </p>
        </Card>
      )}
    </Layout>
  );
}
