/**
 * Schemas Zod compartilhados entre formulários (cliente) e Server Actions
 * (servidor). As mesmas regras existem como constraints no banco; aqui elas
 * servem para devolver mensagens claras antes de chegar ao PostgreSQL.
 */
import { z } from "zod";

import { PAYMENT_METHODS } from "@/lib/domain/sale";
import { isValidDocument, normalizeDocument, type PersonType } from "./documents";

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max, `Máximo de ${max} caracteres.`)
    .transform((v) => (v === "" ? null : v))
    .nullish();

const digitsOnly = (v: string | null | undefined) => (v ?? "").replace(/\D/g, "");

const phone = z
  .string()
  .transform(digitsOnly)
  .refine((v) => v === "" || /^\d{10,13}$/.test(v), "Telefone inválido.")
  .transform((v) => (v === "" ? null : v))
  .nullish();

const UFS = [
  "AC", "AL", "AM", "AP", "BA", "CE", "DF", "ES", "GO", "MA", "MG", "MS", "MT", "PA", "PB",
  "PE", "PI", "PR", "RJ", "RN", "RO", "RR", "RS", "SC", "SE", "SP", "TO",
] as const;

export const addressSchema = z.object({
  zip_code: z
    .string()
    .transform(digitsOnly)
    .refine((v) => v === "" || /^\d{8}$/.test(v), "CEP inválido.")
    .transform((v) => (v === "" ? null : v))
    .nullish(),
  street: optionalText(150),
  street_number: optionalText(20),
  complement: optionalText(80),
  district: optionalText(80),
  city: optionalText(80),
  state: z.enum(UFS, { error: "UF inválida." }).nullish(),
});

export const personTypeSchema = z.enum(["PF", "PJ"]);

const contactSchema = z.object({
  phone,
  whatsapp: phone,
  email: z
    .string()
    .trim()
    .transform((v) => (v === "" ? null : v))
    .pipe(z.email("E-mail inválido.").nullable())
    .nullish(),
});

const documentField = z
  .string()
  .transform(normalizeDocument)
  .transform((v) => (v === "" ? null : v))
  .nullish();

/** Valida CPF/CNPJ conforme o tipo de pessoa. */
function refineDocument(required: boolean) {
  return (data: { person_type: PersonType; document?: string | null }, ctx: z.RefinementCtx) => {
    if (!data.document) {
      if (required) ctx.addIssue({ code: "custom", path: ["document"], message: "Documento obrigatório." });
      return;
    }
    if (!isValidDocument(data.person_type, data.document)) {
      ctx.addIssue({
        code: "custom",
        path: ["document"],
        message: data.person_type === "PF" ? "CPF inválido." : "CNPJ inválido.",
      });
    }
  };
}

export const customerSchema = z
  .object({
    person_type: personTypeSchema,
    document: documentField,
    legal_name: z.string().trim().min(2, "Informe o nome.").max(150),
    trade_name: optionalText(150),
    state_registration: optionalText(20),
    notes: optionalText(2000),
    ...contactSchema.shape,
    ...addressSchema.shape,
  })
  .superRefine(refineDocument(false));
export type CustomerInput = z.infer<typeof customerSchema>;

export const supplierSchema = z
  .object({
    person_type: personTypeSchema,
    document: documentField,
    legal_name: z.string().trim().min(2, "Informe a razão social.").max(150),
    trade_name: optionalText(150),
    state_registration: optionalText(20),
    representative_name: optionalText(100),
    delivery_lead_days: z.coerce.number().int().min(0).max(365).nullish(),
    payment_terms: optionalText(200),
    notes: optionalText(2000),
    ...contactSchema.shape,
    ...addressSchema.shape,
  })
  .superRefine(refineDocument(true));
export type SupplierInput = z.infer<typeof supplierSchema>;

const money = z.coerce.number().min(0, "Valor não pode ser negativo.").max(999_999_999_999);
const quantity = z.coerce.number().positive("Quantidade deve ser maior que zero.").max(99_999_999_999);

export const productSchema = z.object({
  barcode: z
    .string()
    .trim()
    .regex(/^[0-9A-Za-z]{0,30}$/, "Código de barras inválido.")
    .transform((v) => (v === "" ? null : v))
    .nullish(),
  name: z.string().trim().min(2, "Informe o nome do produto.").max(120),
  description: optionalText(2000),
  category_id: z.uuid().nullish(),
  brand: optionalText(60),
  supplier_id: z.uuid().nullish(),
  cost_price: money,
  sale_price: money,
  min_stock: z.coerce.number().min(0).default(0),
  unit: z.string().trim().toUpperCase().regex(/^[A-Z0-9]{1,6}$/, "Unidade inválida.").default("UN"),
  location: optionalText(60),
  active: z.boolean().default(true),
  ncm: z
    .string()
    .transform(digitsOnly)
    .refine((v) => v === "" || /^\d{8}$/.test(v), "NCM deve ter 8 dígitos.")
    .transform((v) => (v === "" ? null : v))
    .nullish(),
  cest: z
    .string()
    .transform(digitsOnly)
    .refine((v) => v === "" || /^\d{7}$/.test(v), "CEST deve ter 7 dígitos.")
    .transform((v) => (v === "" ? null : v))
    .nullish(),
  origin: z.coerce.number().int().min(0).max(8).default(0),
  tax_rule_id: z.uuid().nullish(),
});
export type ProductInput = z.infer<typeof productSchema>;

export const stockMovementSchema = z.object({
  product_id: z.uuid(),
  type: z.enum(["manual_entry", "manual_exit", "adjustment"]),
  quantity: z.coerce.number().min(0).max(99_999_999_999),
  reason: z.string().trim().min(3, "Informe o motivo."),
  unit_cost: money.nullish(),
});

export const purchaseOrderSchema = z.object({
  supplier_id: z.uuid("Selecione o fornecedor."),
  expected_delivery_date: z.iso.date().nullish(),
  payment_method: optionalText(60),
  payment_terms: optionalText(200),
  payment_due_days: z.coerce.number().int().min(0).max(365).default(30),
  discount: money.default(0),
  freight: money.default(0),
  notes: optionalText(2000),
  items: z
    .array(z.object({ product_id: z.uuid(), quantity, unit_price: money }))
    .min(1, "Adicione ao menos um produto.")
    .refine(
      (items) => new Set(items.map((i) => i.product_id)).size === items.length,
      "Produto repetido no pedido.",
    ),
});
export type PurchaseOrderInput = z.infer<typeof purchaseOrderSchema>;

export const purchaseReceiptSchema = z.object({
  purchase_order_id: z.uuid(),
  idempotency_key: z.string().min(8),
  supplier_invoice: optionalText(60),
  notes: optionalText(2000),
  generate_payable: z.boolean().default(true),
  items: z.array(z.object({ order_item_id: z.uuid(), quantity })).min(1, "Informe as quantidades recebidas."),
});

export const finalizeSaleSchema = z.object({
  company_id: z.uuid(),
  cash_session_id: z.uuid(),
  customer_id: z.uuid().nullish(),
  idempotency_key: z.string().min(8),
  discount: money.default(0),
  notes: optionalText(500),
  items: z
    .array(z.object({ product_id: z.uuid(), quantity, discount: money.default(0) }))
    .min(1, "Adicione produtos à venda.")
    .max(500),
  payments: z.array(
    z.object({
      method: z.enum(PAYMENT_METHODS),
      amount: z.coerce.number().positive(),
      tendered_amount: money.nullish(),
      installments: z.coerce.number().int().min(1).max(48).default(1),
      first_due_date: z.iso.date().nullish(),
    }),
  ),
});
export type FinalizeSaleInput = z.infer<typeof finalizeSaleSchema>;
