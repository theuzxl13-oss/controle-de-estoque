import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

import { PERMISSIONS, ROLE_PERMISSIONS, ROLES, roleHasPermission } from "./permissions";

function permissionsFromMigration(): Record<string, string[]> {
  const sql = readFileSync(
    path.resolve(__dirname, "../../../supabase/migrations/20261014000100_core.sql"),
    "utf8",
  );
  const result: Record<string, string[]> = {};
  const re = /select '(\w+)'(?:::public\.app_role)?, p from unnest\(array\[([\s\S]*?)\]\)/g;
  for (const match of sql.matchAll(re)) {
    result[match[1]] = [...match[2].matchAll(/'([a-z_.]+)'/g)].map((m) => m[1]).sort();
  }
  return result;
}

describe("matriz de permissões", () => {
  it("é idêntica à semeada no banco", () => {
    const fromSql = permissionsFromMigration();
    expect(Object.keys(fromSql).sort()).toEqual([...ROLES].sort());
    for (const role of ROLES) {
      expect(fromSql[role], role).toEqual([...ROLE_PERMISSIONS[role]].sort());
    }
  });

  it("administrador tem todas as permissões", () => {
    for (const p of PERMISSIONS) expect(roleHasPermission("admin", p)).toBe(true);
  });

  it("vendedor não gerencia produtos, financeiro nem cancela vendas", () => {
    expect(roleHasPermission("seller", "products.manage")).toBe(false);
    expect(roleHasPermission("seller", "finance.view")).toBe(false);
    expect(roleHasPermission("seller", "sales.cancel")).toBe(false);
    expect(roleHasPermission("seller", "sales.create")).toBe(true);
  });

  it("estoquista recebe mercadorias mas não vende", () => {
    expect(roleHasPermission("stockist", "purchases.receive")).toBe(true);
    expect(roleHasPermission("stockist", "sales.create")).toBe(false);
  });

  it("gerente não acessa configuração fiscal nem usuários", () => {
    expect(roleHasPermission("manager", "fiscal.configure")).toBe(false);
    expect(roleHasPermission("manager", "users.manage")).toBe(false);
  });
});
