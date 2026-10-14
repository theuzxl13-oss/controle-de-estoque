/**
 * Cálculo de venda no PDV — espelha exatamente as regras de
 * `public.finalize_sale` para que a tela mostre os mesmos valores que o banco
 * vai gravar. O banco recalcula tudo a partir do cadastro de produtos; este
 * módulo nunca é a autoridade final.
 */
import { type Cents, lineGrossCents, toCents } from "./money";

export const PAYMENT_METHODS = [
  "cash",
  "pix",
  "credit_card",
  "debit_card",
  "bank_transfer",
  "store_credit",
] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

export const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = {
  cash: "Dinheiro",
  pix: "Pix",
  credit_card: "Cartão de crédito",
  debit_card: "Cartão de débito",
  bank_transfer: "Transferência",
  store_credit: "Crediário",
};

export interface SaleLineInput {
  quantity: number;
  unitPrice: number;
  /** Desconto do item, em reais. */
  discount?: number;
}

export interface SaleLine {
  grossCents: Cents;
  discountCents: Cents;
  totalCents: Cents;
}

export interface SaleTotals {
  lines: SaleLine[];
  subtotalCents: Cents;
  discountTotalCents: Cents;
  totalCents: Cents;
  /** Percentual do desconto total sobre o subtotal. */
  discountPercent: number;
}

export class SaleValidationError extends Error {}

export function computeSaleTotals(items: SaleLineInput[], generalDiscount = 0): SaleTotals {
  if (items.length === 0) throw new SaleValidationError("A venda precisa de ao menos um item.");

  let maxIdx = 0;
  let maxNet = -1;
  const base = items.map((item, idx) => {
    if (!(item.quantity > 0)) throw new SaleValidationError(`Quantidade inválida no item ${idx + 1}.`);
    const gross = lineGrossCents(item.quantity, item.unitPrice);
    const discount = toCents(item.discount ?? 0);
    if (discount < 0 || discount > gross) {
      throw new SaleValidationError(`Desconto inválido no item ${idx + 1}.`);
    }
    if (gross - discount > maxNet) {
      maxNet = gross - discount;
      maxIdx = idx;
    }
    return { gross, discount };
  });

  const subtotal = base.reduce((s, l) => s + l.gross, 0);
  const lineDiscounts = base.reduce((s, l) => s + l.discount, 0);
  const netBefore = subtotal - lineDiscounts;
  const general = toCents(generalDiscount);
  if (general < 0 || general > netBefore) throw new SaleValidationError("Desconto geral inválido.");

  // Rateio proporcional do desconto geral; o resíduo vai para o maior item.
  let allocated = 0;
  const allocations = base.map((l, idx) => {
    if (general === 0 || netBefore === 0 || idx === maxIdx) return 0;
    // round(general × net / netBefore) em aritmética inteira (meio para cima).
    const a = Math.floor((2 * general * (l.gross - l.discount) + netBefore) / (2 * netBefore));
    allocated += a;
    return a;
  });
  allocations[maxIdx] = general - allocated;

  const lines = base.map((l, idx) => ({
    grossCents: l.gross,
    discountCents: l.discount + allocations[idx],
    totalCents: l.gross - l.discount - allocations[idx],
  }));

  const discountTotal = lineDiscounts + general;
  return {
    lines,
    subtotalCents: subtotal,
    discountTotalCents: discountTotal,
    totalCents: subtotal - discountTotal,
    discountPercent: subtotal > 0 ? (discountTotal / subtotal) * 100 : 0,
  };
}

/** O desconto exige a permissão `sales.discount_unlimited`? */
export function discountNeedsManager(totals: SaleTotals, sellerLimitPercent: number): boolean {
  return totals.discountTotalCents > 0 && totals.discountPercent > sellerLimitPercent;
}

export interface PaymentInput {
  method: PaymentMethod;
  /** Valor abatido da venda, em reais. */
  amount: number;
  /** Valor entregue pelo cliente (somente dinheiro). */
  tenderedAmount?: number;
  installments?: number;
}

export interface PaymentSummary {
  paidCents: Cents;
  remainingCents: Cents;
  changeCents: Cents;
  isComplete: boolean;
}

export function summarizePayments(
  totalCents: Cents,
  payments: PaymentInput[],
  options: { hasCustomer: boolean },
): PaymentSummary {
  let paid = 0;
  let change = 0;
  for (const p of payments) {
    const amount = toCents(p.amount);
    if (amount <= 0) throw new SaleValidationError("Valor de pagamento inválido.");
    if (p.tenderedAmount !== undefined) {
      const tendered = toCents(p.tenderedAmount);
      if (p.method !== "cash" || tendered < amount) {
        throw new SaleValidationError("Valor recebido inválido.");
      }
      change += tendered - amount;
    }
    const installments = p.installments ?? 1;
    if (
      installments < 1 ||
      installments > 48 ||
      (installments > 1 && p.method !== "credit_card" && p.method !== "store_credit")
    ) {
      throw new SaleValidationError("Número de parcelas inválido.");
    }
    if (p.method === "store_credit" && !options.hasCustomer) {
      throw new SaleValidationError("Venda a prazo exige cliente identificado.");
    }
    paid += amount;
  }
  return {
    paidCents: paid,
    remainingCents: totalCents - paid,
    changeCents: change,
    isComplete: paid === totalCents,
  };
}

/** Divide um valor em parcelas como o banco: parcelas truncadas e resíduo na última. */
export function splitInstallments(amountCents: Cents, installments: number): Cents[] {
  const base = Math.floor(amountCents / installments);
  return Array.from({ length: installments }, (_, i) =>
    i < installments - 1 ? base : amountCents - base * (installments - 1),
  );
}
