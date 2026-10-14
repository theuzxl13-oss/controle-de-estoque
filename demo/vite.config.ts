import path from "node:path";

import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// Publicado em https://<usuário>.github.io/controle-de-estoque/
export default defineConfig({
  base: "/controle-de-estoque/",
  plugins: [react(), tailwindcss()],
  resolve: {
    // Reaproveita as regras do sistema real (cálculo de venda, permissões, CPF/CNPJ).
    alias: { "@erp": path.resolve(__dirname, "../src/lib") },
  },
  server: { fs: { allow: [".."] } },
});
