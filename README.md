# ERP — Gestão Empresarial

ERP online para estoque, compras, vendas (PDV), financeiro e emissão de notas
fiscais brasileiras. Next.js 16 + TypeScript + Supabase (PostgreSQL, Auth,
Storage, RLS), com deploy na Vercel.

- Arquitetura, modelagem, fluxos, segurança e plano: [`docs/ARQUITETURA.md`](docs/ARQUITETURA.md)
- **Demonstração navegável — revenda de gás e água** (dados fictícios): https://theuzxl13-oss.github.io/controle-de-estoque/ — código em [`demo/`](demo/README.md)
- **Etapa atual:** 1 de 8 concluída (arquitetura + banco). Ainda **não** está
  pronto para produção.

## Requisitos

- Node.js 22+
- Conta no [Supabase](https://supabase.com) (para rodar a aplicação)
- PostgreSQL 15+ local (apenas para `npm run test:db`; no CI já vem instalado)

## Configuração do Supabase

1. Crie um projeto no Supabase.
2. Aplique as migrations de `supabase/migrations/` **em ordem**. Duas opções:
   - **Supabase CLI** (recomendado):
     ```bash
     npx supabase init            # cria supabase/config.toml (mantém as migrations)
     npx supabase login
     npx supabase link --project-ref <ref-do-projeto>
     npx supabase db push
     ```
   - **SQL Editor** do painel: cole e execute cada arquivo, do `0100` ao `0900`.
3. Em *Authentication → Sign In / Providers*, mantenha e-mail habilitado. Para
   produção, configure SMTP próprio em *Authentication → Emails*.
4. Em *Project Settings → API Keys*, copie a **chave publicável** e a **chave
   secreta**.

## Execução local

```bash
cp .env.example .env.local   # preencha com os dados do projeto Supabase
npm install
npm run dev                   # http://localhost:3000
```

## Testes

```bash
npm test          # unitários (Vitest): permissões, CPF/CNPJ, cálculos de venda, schemas
npm run test:db   # banco: aplica as migrations num PostgreSQL temporário e roda tests/db/*.sql
npm run lint
npm run typecheck
```

Os testes de banco cobrem isolamento entre empresas, permissões por perfil,
movimentações de estoque, inventário, pedido de compra com recebimento
parcial e contas a pagar, finalização de venda (troco, pagamento misto,
desconto, crediário, idempotência), cancelamento e fechamento de caixa.

## Deploy na Vercel

1. Importe o repositório na Vercel (framework detectado: Next.js).
2. Em *Settings → Environment Variables*, cadastre as variáveis do
   `.env.example` (`SUPABASE_SECRET_KEY` e `FISCAL_ENCRYPTION_KEY` apenas como
   variáveis de servidor — nunca com prefixo `NEXT_PUBLIC_`).
3. No Supabase, em *Authentication → URL Configuration*, informe a URL da
   Vercel como *Site URL* e em *Redirect URLs*.

## Integrações que exigem contratação ou credenciais

| Integração | Necessário |
|---|---|
| Supabase | Projeto e chaves de API |
| Vercel | Conta e variáveis de ambiente |
| Provedor fiscal (Focus NFe, PlugNotas, NFE.io ou Nuvem Fiscal) | Contrato e token de API — a definir |
| Certificado digital A1 (e-CNPJ) | Compra em autoridade certificadora |
| SEFAZ (NFC-e) | Credenciamento e CSC |
| Contador | Validação de CFOP, CST/CSOSN, alíquotas e NCM |
| E-mail transacional / WhatsApp Business API | Opcionais |

A emissão fiscal **nunca é simulada**: sem provedor configurado, o sistema
emite apenas o comprovante não fiscal, identificado como tal.
