/**
 * Valores monetários são manipulados em centavos (inteiros) para evitar erros
 * de ponto flutuante. Converta para reais apenas na exibição ou no envio ao
 * banco (numeric(14,2)).
 */

export type Cents = number;

export function toCents(value: number): Cents {
  // Arredondamento "half away from zero", igual ao round() do PostgreSQL.
  // A notação "NeM" desloca a vírgula sem multiplicação binária
  // (1.005 * 100 = 100.4999…, mas Number("1.005e2") = 100.5).
  const sign = value < 0 ? -1 : 1;
  const abs = String(Math.abs(value));
  const shifted = abs.includes("e") ? Math.abs(value) * 100 : Number(`${abs}e2`);
  return sign * Math.round(shifted);
}

export function fromCents(cents: Cents): number {
  return cents / 100;
}

/** round(qtd × preço, 2) com a mesma semântica do banco. */
export function lineGrossCents(quantity: number, unitPrice: number): Cents {
  // Trabalha com milésimos de quantidade × centavos para manter precisão.
  const qtyThousandths = Math.round(quantity * 1000);
  const priceCents = toCents(unitPrice);
  const product = qtyThousandths * priceCents; // em centavos × 1000
  const sign = product < 0 ? -1 : 1;
  return sign * Math.floor((Math.abs(product) + 500) / 1000);
}

const BRL = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

export function formatBRL(cents: Cents): string {
  return BRL.format(fromCents(cents));
}
