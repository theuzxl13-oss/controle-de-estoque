import {
  BarChart3,
  Boxes,
  FileText,
  LayoutDashboard,
  Menu,
  Moon,
  Package,
  PanelLeftClose,
  PanelLeftOpen,
  Receipt,
  ShoppingCart,
  Store,
  Sun,
  Truck,
  Users,
  UserCog,
  Wallet,
  ClipboardList,
} from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";

import { ROLE_LABELS, type Permission } from "@erp/auth/permissions";

import { useStore } from "../store";
import { cx } from "./ui";

export const NAV: { route: string; label: string; icon: typeof Package; permission: Permission; group: string }[] = [
  { route: "dashboard", label: "Painel", icon: LayoutDashboard, permission: "dashboard.view", group: "Geral" },
  { route: "pdv", label: "PDV — Frente de caixa", icon: ShoppingCart, permission: "sales.create", group: "Vendas" },
  { route: "vendas", label: "Vendas", icon: Receipt, permission: "sales.view_own", group: "Vendas" },
  { route: "clientes", label: "Clientes", icon: Users, permission: "customers.view", group: "Vendas" },
  { route: "produtos", label: "Produtos", icon: Package, permission: "products.view", group: "Estoque" },
  { route: "estoque", label: "Movimentações", icon: Boxes, permission: "stock.view", group: "Estoque" },
  { route: "compras", label: "Pedidos de compra", icon: ClipboardList, permission: "purchases.view", group: "Compras" },
  { route: "fornecedores", label: "Fornecedores", icon: Truck, permission: "suppliers.view", group: "Compras" },
  { route: "financeiro", label: "Financeiro", icon: Wallet, permission: "finance.view", group: "Gestão" },
  { route: "fiscal", label: "Notas fiscais", icon: FileText, permission: "fiscal.view", group: "Gestão" },
  { route: "relatorios", label: "Relatórios", icon: BarChart3, permission: "reports.view", group: "Gestão" },
  { route: "usuarios", label: "Usuários e empresa", icon: UserCog, permission: "users.manage", group: "Gestão" },
];

function useTheme() {
  const [dark, setDark] = useState(() => document.documentElement.classList.contains("dark"));
  useEffect(() => {
    document.documentElement.classList.toggle("dark", dark);
    try {
      localStorage.setItem("erp-demo-theme", dark ? "dark" : "light");
    } catch {
      /* preferência apenas visual */
    }
  }, [dark]);
  return [dark, setDark] as const;
}

export function Layout({ route, children }: { route: string; children: ReactNode }) {
  const { user, users, setUserId, can } = useStore();
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [dark, setDark] = useTheme();
  const items = NAV.filter((n) => can(n.permission));
  const groups = [...new Set(items.map((i) => i.group))];

  useEffect(() => setMobileOpen(false), [route]);

  const sidebar = (
    <nav className="flex h-full flex-col gap-4 overflow-y-auto px-3 py-4" aria-label="Menu principal">
      <div className={cx("flex items-center gap-2 px-2", collapsed && "lg:justify-center lg:px-0")}>
        <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-accent text-accent-fg">
          <Store className="size-4.5" />
        </span>
        <span className={cx("leading-tight", collapsed && "lg:hidden")}>
          <span className="block text-sm font-semibold">ERP Gestão</span>
          <span className="block text-[11px] text-fg-3">Loja Exemplo</span>
        </span>
      </div>
      {groups.map((g) => (
        <div key={g}>
          <p className={cx("mb-1 px-2 text-[11px] font-medium uppercase tracking-wider text-fg-3", collapsed && "lg:hidden")}>{g}</p>
          <ul className="space-y-0.5">
            {items
              .filter((i) => i.group === g)
              .map((i) => {
                const active = route === i.route;
                return (
                  <li key={i.route}>
                    <a
                      href={`#/${i.route}`}
                      title={i.label}
                      aria-current={active ? "page" : undefined}
                      className={cx(
                        "flex items-center gap-2.5 rounded-lg px-2 py-2 text-sm transition",
                        collapsed && "lg:justify-center",
                        active ? "bg-accent-soft font-medium text-accent" : "text-fg-2 hover:bg-surface-2 hover:text-fg",
                      )}
                    >
                      <i.icon className="size-4 shrink-0" />
                      <span className={cx("truncate", collapsed && "lg:hidden")}>{i.label}</span>
                    </a>
                  </li>
                );
              })}
          </ul>
        </div>
      ))}
    </nav>
  );

  return (
    <div className="min-h-screen">
      <div className="no-print sticky top-0 z-40 bg-warn-soft px-4 py-1.5 text-center text-xs font-medium text-warn">
        DEMONSTRAÇÃO — dados fictícios, nada é gravado (recarregar a página restaura os dados). Notas fiscais não são emitidas.
      </div>
      <div className="flex">
        <aside
          className={cx(
            "no-print sticky top-[30px] hidden h-[calc(100vh-30px)] shrink-0 border-r border-line bg-surface transition-[width] lg:block",
            collapsed ? "w-[68px]" : "w-64",
          )}
        >
          {sidebar}
        </aside>
        {mobileOpen && (
          <div className="no-print fixed inset-0 z-50 lg:hidden" onClick={() => setMobileOpen(false)}>
            <div className="absolute inset-0 bg-black/40" />
            <aside className="absolute inset-y-0 left-0 w-72 bg-surface shadow-xl" onClick={(e) => e.stopPropagation()}>
              {sidebar}
            </aside>
          </div>
        )}
        <div className="min-w-0 flex-1">
          <header className="no-print sticky top-[30px] z-30 flex h-14 items-center gap-2 border-b border-line bg-surface/90 px-4 backdrop-blur">
            <button className="rounded-lg p-2 text-fg-2 hover:bg-surface-2 lg:hidden" aria-label="Abrir menu" onClick={() => setMobileOpen(true)}>
              <Menu className="size-5" />
            </button>
            <button
              className="hidden rounded-lg p-2 text-fg-2 hover:bg-surface-2 lg:block"
              aria-label={collapsed ? "Expandir menu" : "Recolher menu"}
              onClick={() => setCollapsed(!collapsed)}
            >
              {collapsed ? <PanelLeftOpen className="size-5" /> : <PanelLeftClose className="size-5" />}
            </button>
            <div className="flex-1" />
            <label className="flex items-center gap-2 text-xs text-fg-3">
              <span className="hidden sm:inline">Entrar como</span>
              <select
                value={user.id}
                onChange={(e) => {
                  setUserId(e.target.value);
                  window.location.hash = "/dashboard";
                }}
                className="h-8 max-w-[52vw] rounded-lg border border-line bg-surface px-2 text-xs text-fg"
                aria-label="Simular usuário"
              >
                {users.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.name} — {ROLE_LABELS[u.role]}
                  </option>
                ))}
              </select>
            </label>
            <button
              className="rounded-lg p-2 text-fg-2 hover:bg-surface-2"
              aria-label={dark ? "Usar tema claro" : "Usar tema escuro"}
              onClick={() => setDark(!dark)}
            >
              {dark ? <Sun className="size-5" /> : <Moon className="size-5" />}
            </button>
          </header>
          <main className="mx-auto w-full max-w-7xl px-4 py-6 sm:px-6">{children}</main>
        </div>
      </div>
    </div>
  );
}
