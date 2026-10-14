import { describe, expect, it } from "vitest";

import { formatDocument, isValidCnpj, isValidCpf, isValidDocument, normalizeDocument } from "./documents";

describe("CPF", () => {
  it("aceita CPF válido com ou sem máscara", () => {
    expect(isValidCpf("529.982.247-25")).toBe(true);
    expect(isValidCpf("52998224725")).toBe(true);
  });
  it("rejeita dígito verificador errado e sequências repetidas", () => {
    expect(isValidCpf("529.982.247-24")).toBe(false);
    expect(isValidCpf("111.111.111-11")).toBe(false);
    expect(isValidCpf("123")).toBe(false);
  });
});

describe("CNPJ", () => {
  it("aceita CNPJ numérico válido", () => {
    expect(isValidCnpj("11.222.333/0001-81")).toBe(true);
    expect(isValidCnpj("11444777000161")).toBe(true);
  });
  it("aceita CNPJ alfanumérico (IN RFB 2.229/2024)", () => {
    expect(isValidCnpj("12.ABC.345/01DE-35")).toBe(true);
    expect(isValidCnpj("12abc34501de35")).toBe(true);
  });
  it("rejeita CNPJ inválido", () => {
    expect(isValidCnpj("11.222.333/0001-80")).toBe(false);
    expect(isValidCnpj("12.ABC.345/01DE-36")).toBe(false);
    expect(isValidCnpj("00000000000000")).toBe(false);
    expect(isValidCnpj("12ABC34501DEAB")).toBe(false);
  });
});

describe("utilitários", () => {
  it("normaliza e formata", () => {
    expect(normalizeDocument("12.abc.345/01de-35")).toBe("12ABC34501DE35");
    expect(formatDocument("52998224725")).toBe("529.982.247-25");
    expect(formatDocument("12ABC34501DE35")).toBe("12.ABC.345/01DE-35");
  });
  it("valida conforme o tipo de pessoa", () => {
    expect(isValidDocument("PF", "52998224725")).toBe(true);
    expect(isValidDocument("PJ", "52998224725")).toBe(false);
  });
});
