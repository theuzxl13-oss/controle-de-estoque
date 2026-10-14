import { describe, expect, it } from "vitest";

import { customerSchema, productSchema, purchaseOrderSchema, supplierSchema } from "./schemas";

describe("cadastro de clientes", () => {
  it("normaliza documento, telefone e CEP", () => {
    const r = customerSchema.parse({
      person_type: "PF",
      document: "529.982.247-25",
      legal_name: "  Maria da Silva ",
      phone: "(11) 98765-4321",
      zip_code: "01310-100",
      email: "",
      state: "SP",
    });
    expect(r).toMatchObject({
      document: "52998224725",
      legal_name: "Maria da Silva",
      phone: "11987654321",
      zip_code: "01310100",
      email: null,
    });
  });

  it("permite cliente sem documento (consumidor)", () => {
    expect(customerSchema.safeParse({ person_type: "PF", legal_name: "Consumidor" }).success).toBe(true);
  });

  it("rejeita CPF inválido e e-mail inválido", () => {
    const r = customerSchema.safeParse({
      person_type: "PF",
      document: "123.456.789-00",
      legal_name: "Fulano",
      email: "x@",
    });
    expect(r.success).toBe(false);
    const paths = r.error!.issues.map((i) => i.path.join("."));
    expect(paths).toContain("document");
    expect(paths).toContain("email");
  });
});

describe("cadastro de fornecedores", () => {
  it("exige CNPJ/CPF", () => {
    const r = supplierSchema.safeParse({ person_type: "PJ", legal_name: "Fornecedor" });
    expect(r.success).toBe(false);
  });
  it("aceita CNPJ alfanumérico", () => {
    const r = supplierSchema.safeParse({ person_type: "PJ", document: "12.ABC.345/01DE-35", legal_name: "Fornecedor" });
    expect(r.success).toBe(true);
  });
});

describe("cadastro de produtos", () => {
  it("aplica padrões e valida dados fiscais", () => {
    const r = productSchema.parse({ name: "Caneta", cost_price: "1.5", sale_price: "3", unit: "un", ncm: "9608.10.00" });
    expect(r).toMatchObject({ unit: "UN", ncm: "96081000", origin: 0, active: true, min_stock: 0 });
    expect(productSchema.safeParse({ name: "Caneta", cost_price: 1, sale_price: -1 }).success).toBe(false);
    expect(productSchema.safeParse({ name: "Caneta", cost_price: 1, sale_price: 1, ncm: "123" }).success).toBe(false);
  });
});

describe("pedido de compra", () => {
  const supplier = "4b1f6f0e-8f3e-4d0b-9a57-2b1c6c2f9e11";
  const product = "0c6f8a52-1d0f-4b7a-8f2a-6c5d3b2a1e00";
  it("exige itens e impede produto repetido", () => {
    expect(purchaseOrderSchema.safeParse({ supplier_id: supplier, items: [] }).success).toBe(false);
    const dup = purchaseOrderSchema.safeParse({
      supplier_id: supplier,
      items: [
        { product_id: product, quantity: 1, unit_price: 1 },
        { product_id: product, quantity: 2, unit_price: 1 },
      ],
    });
    expect(dup.success).toBe(false);
  });
});
