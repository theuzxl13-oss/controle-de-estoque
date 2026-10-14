import { describe, expect, it } from "vitest";

import { lineGrossCents, toCents } from "./money";
import {
  computeSaleTotals,
  discountNeedsManager,
  SaleValidationError,
  splitInstallments,
  summarizePayments,
} from "./sale";

describe("dinheiro", () => {
  it("converte sem erro de ponto flutuante", () => {
    expect(toCents(0.1 + 0.2)).toBe(30);
    expect(toCents(1.005)).toBe(101);
    expect(lineGrossCents(3, 3.33)).toBe(999);
    expect(lineGrossCents(0.125, 10.01)).toBe(125); // 1,25125 → 1,25
    expect(lineGrossCents(1.5, 0.99)).toBe(149); // 1,485 → 1,49 (meio para cima)
  });
});

describe("totais da venda (mesmo cenário do teste SQL)", () => {
  const totals = computeSaleTotals(
    [
      { quantity: 2, unitPrice: 10 },
      { quantity: 3, unitPrice: 3.33 },
    ],
    0.99,
  );

  it("calcula subtotal, desconto e total", () => {
    expect(totals.subtotalCents).toBe(2999);
    expect(totals.discountTotalCents).toBe(99);
    expect(totals.totalCents).toBe(2900);
  });

  it("rateia o desconto geral e fecha no total", () => {
    expect(totals.lines.reduce((s, l) => s + l.discountCents, 0)).toBe(99);
    expect(totals.lines.reduce((s, l) => s + l.totalCents, 0)).toBe(2900);
    expect(totals.lines[1].discountCents).toBe(33); // 0,99 × 9,99 / 29,99
    expect(totals.lines[0].discountCents).toBe(66); // resíduo no maior item
  });

  it("identifica quando o desconto precisa de gerente", () => {
    expect(discountNeedsManager(totals, 5)).toBe(false);
    expect(discountNeedsManager(totals, 3)).toBe(true);
  });

  it("rejeita entradas inválidas", () => {
    expect(() => computeSaleTotals([])).toThrow(SaleValidationError);
    expect(() => computeSaleTotals([{ quantity: 0, unitPrice: 1 }])).toThrow(/Quantidade/);
    expect(() => computeSaleTotals([{ quantity: 1, unitPrice: 1, discount: 2 }])).toThrow(/Desconto/);
    expect(() => computeSaleTotals([{ quantity: 1, unitPrice: 1 }], 1.01)).toThrow(/Desconto geral/);
  });
});

describe("pagamentos", () => {
  it("calcula troco em dinheiro e pagamento misto", () => {
    const s = summarizePayments(
      2900,
      [
        { method: "cash", amount: 20, tenderedAmount: 50 },
        { method: "pix", amount: 9 },
      ],
      { hasCustomer: false },
    );
    expect(s).toEqual({ paidCents: 2900, remainingCents: 0, changeCents: 3000, isComplete: true });
  });

  it("indica saldo restante", () => {
    const s = summarizePayments(1000, [{ method: "debit_card", amount: 4 }], { hasCustomer: false });
    expect(s.remainingCents).toBe(600);
    expect(s.isComplete).toBe(false);
  });

  it("aplica as mesmas regras do banco", () => {
    expect(() =>
      summarizePayments(1000, [{ method: "pix", amount: 10, tenderedAmount: 20 }], { hasCustomer: false }),
    ).toThrow(/recebido/);
    expect(() =>
      summarizePayments(1000, [{ method: "store_credit", amount: 10 }], { hasCustomer: false }),
    ).toThrow(/cliente/);
    expect(() =>
      summarizePayments(1000, [{ method: "pix", amount: 10, installments: 2 }], { hasCustomer: false }),
    ).toThrow(/parcelas/);
  });

  it("divide parcelas com resíduo na última", () => {
    expect(splitInstallments(1000, 3)).toEqual([333, 333, 334]);
    expect(splitInstallments(1000, 1)).toEqual([1000]);
  });
});
