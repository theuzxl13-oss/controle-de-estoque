/**
 * Validação de CPF e CNPJ (numérico e alfanumérico).
 *
 * O CNPJ alfanumérico (IN RFB nº 2.229/2024, vigente desde julho/2026) usa
 * 12 caracteres [0-9A-Z] + 2 dígitos verificadores numéricos. O valor de cada
 * caractere é o código ASCII − 48, o que mantém compatibilidade total com os
 * CNPJs numéricos. A mesma regra está em `app.is_valid_document` (SQL).
 */

export type PersonType = "PF" | "PJ";

export function normalizeDocument(value: string | null | undefined): string {
  return (value ?? "").replace(/[^0-9A-Za-z]/g, "").toUpperCase();
}

export function isValidCpf(value: string): boolean {
  const cpf = normalizeDocument(value);
  if (!/^\d{11}$/.test(cpf) || /^(\d)\1{10}$/.test(cpf)) return false;
  for (let d = 1; d <= 2; d++) {
    let sum = 0;
    for (let i = 0; i < 8 + d; i++) sum += Number(cpf[i]) * (9 + d - i);
    const dv = ((sum * 10) % 11) % 10;
    if (dv !== Number(cpf[8 + d])) return false;
  }
  return true;
}

export function isValidCnpj(value: string): boolean {
  const cnpj = normalizeDocument(value);
  if (!/^[0-9A-Z]{12}\d{2}$/.test(cnpj) || /^(.)\1{13}$/.test(cnpj)) return false;
  const weights = [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
  for (let d = 1; d <= 2; d++) {
    const w = weights.slice(d === 1 ? 1 : 0);
    let sum = 0;
    for (let i = 0; i < 11 + d; i++) sum += (cnpj.charCodeAt(i) - 48) * w[i];
    const rest = sum % 11;
    const dv = rest < 2 ? 0 : 11 - rest;
    if (dv !== Number(cnpj[11 + d])) return false;
  }
  return true;
}

export function isValidDocument(type: PersonType, value: string): boolean {
  return type === "PF" ? isValidCpf(value) : isValidCnpj(value);
}

export function formatDocument(value: string): string {
  const v = normalizeDocument(value);
  if (v.length === 11) return v.replace(/^(\d{3})(\d{3})(\d{3})(\d{2})$/, "$1.$2.$3-$4");
  if (v.length === 14) {
    return v.replace(/^(.{2})(.{3})(.{3})(.{4})(.{2})$/, "$1.$2.$3/$4-$5");
  }
  return value;
}
