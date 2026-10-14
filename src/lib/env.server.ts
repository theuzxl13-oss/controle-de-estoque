import "server-only";

import { z } from "zod";

/**
 * Segredos usados somente no servidor. Nunca prefixe com NEXT_PUBLIC_.
 */
const serverSchema = z.object({
  SUPABASE_SECRET_KEY: z.string().min(20),
  // 32 bytes em base64 — criptografa token do provedor fiscal, CSC e senha do
  // certificado antes de gravar em private.fiscal_secrets.
  FISCAL_ENCRYPTION_KEY: z
    .string()
    .refine((v) => Buffer.from(v, "base64").length === 32, "Use 32 bytes em base64.")
    .optional(),
});

export function serverEnv() {
  return serverSchema.parse({
    SUPABASE_SECRET_KEY: process.env.SUPABASE_SECRET_KEY,
    FISCAL_ENCRYPTION_KEY: process.env.FISCAL_ENCRYPTION_KEY,
  });
}
