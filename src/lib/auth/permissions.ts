/**
 * Matriz de permissões por perfil.
 *
 * Fonte da verdade: tabela `public.role_permissions` (migration 0100). Esta
 * cópia serve para o frontend decidir o que exibir; a autorização real é
 * sempre feita no banco (RLS + funções). O teste `permissions.test.ts`
 * garante que as duas listas estejam idênticas.
 */

export const ROLES = ["admin", "manager", "seller", "stockist"] as const;
export type Role = (typeof ROLES)[number];

export const ROLE_LABELS: Record<Role, string> = {
  admin: "Administrador",
  manager: "Gerente",
  seller: "Vendedor",
  stockist: "Estoquista",
};

export const PERMISSIONS = [
  "dashboard.view",
  "company.configure",
  "users.manage",
  "audit.view",
  "products.view",
  "products.manage",
  "stock.view",
  "stock.move",
  "stock.adjust",
  "stock.inventory",
  "customers.view",
  "customers.manage",
  "customers.delete",
  "suppliers.view",
  "suppliers.manage",
  "purchases.view",
  "purchases.manage",
  "purchases.receive",
  "sales.create",
  "sales.view_own",
  "sales.view_all",
  "sales.discount",
  "sales.discount_unlimited",
  "sales.cancel",
  "sales.return",
  "cash.operate",
  "cash.manage_all",
  "fiscal.view",
  "fiscal.emit",
  "fiscal.cancel",
  "fiscal.configure",
  "finance.view",
  "finance.manage",
  "reports.view",
] as const;
export type Permission = (typeof PERMISSIONS)[number];

const MANAGER: readonly Permission[] = [
  "dashboard.view",
  "products.view",
  "products.manage",
  "stock.view",
  "stock.move",
  "stock.adjust",
  "stock.inventory",
  "customers.view",
  "customers.manage",
  "customers.delete",
  "suppliers.view",
  "suppliers.manage",
  "purchases.view",
  "purchases.manage",
  "purchases.receive",
  "sales.create",
  "sales.view_own",
  "sales.view_all",
  "sales.discount",
  "sales.discount_unlimited",
  "sales.cancel",
  "sales.return",
  "cash.operate",
  "cash.manage_all",
  "fiscal.view",
  "fiscal.emit",
  "fiscal.cancel",
  "reports.view",
];

export const ROLE_PERMISSIONS: Record<Role, readonly Permission[]> = {
  admin: PERMISSIONS,
  manager: MANAGER,
  seller: [
    "dashboard.view",
    "products.view",
    "customers.view",
    "customers.manage",
    "sales.create",
    "sales.view_own",
    "sales.discount",
    "cash.operate",
    "fiscal.view",
    "fiscal.emit",
  ],
  stockist: [
    "dashboard.view",
    "products.view",
    "products.manage",
    "stock.view",
    "stock.move",
    "stock.inventory",
    "suppliers.view",
    "purchases.view",
    "purchases.receive",
  ],
};

export function roleHasPermission(role: Role, permission: Permission): boolean {
  return ROLE_PERMISSIONS[role].includes(permission);
}
