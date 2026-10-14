import "server-only";

import { createClient } from "@supabase/supabase-js";

import { publicEnv } from "@/lib/env";
import { serverEnv } from "@/lib/env.server";

/**
 * Cliente com a chave secreta: IGNORA o RLS. Use apenas no servidor, depois
 * de verificar a permissão do usuário (ex.: integração fiscal, convite de
 * usuários). Nunca importe em código de cliente.
 */
export function createAdminClient() {
  return createClient(publicEnv().NEXT_PUBLIC_SUPABASE_URL, serverEnv().SUPABASE_SECRET_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
