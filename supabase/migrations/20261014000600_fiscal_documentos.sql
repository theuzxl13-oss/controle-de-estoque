-- =============================================================================
-- 0600 — Fiscal (configuração, documentos NF-e/NFC-e, eventos) e documentos
-- gerados (PDFs).
--
-- A autorização de documentos fiscais é sempre feita por um provedor fiscal
-- externo (ex.: Focus NFe, PlugNotas, NFE.io, Nuvem Fiscal) acionado pelo
-- servidor. Tabelas fiscais só são escritas com a chave service_role.
-- =============================================================================

create type public.fiscal_environment as enum ('homologacao', 'producao');
create type public.tax_regime as enum (
  'simples_nacional',           -- CRT 1
  'simples_nacional_excesso',   -- CRT 2
  'regime_normal',              -- CRT 3
  'mei'                         -- CRT 4
);
create type public.fiscal_model as enum ('55', '65');
create type public.fiscal_status as enum (
  'pending',       -- criado localmente, ainda não enviado
  'processing',    -- enviado ao provedor, aguardando retorno
  'authorized',
  'rejected',      -- rejeição corrigível (pode reenviar com nova numeração/ajustes)
  'denied',        -- denegada pela SEFAZ
  'cancelled',
  'contingency',   -- emitida em contingência, pendente de transmissão
  'error'          -- falha de comunicação
);
create type public.document_type as enum (
  'purchase_order', 'quote', 'sale_receipt', 'stock_report', 'sales_report',
  'financial_report', 'purchase_history', 'fiscal_danfe'
);

create table public.fiscal_settings (
  company_id uuid primary key references public.companies (id) on delete cascade,
  provider text check (provider in ('focus_nfe', 'plugnotas', 'nfe_io', 'nuvem_fiscal')),
  environment public.fiscal_environment not null default 'homologacao',
  tax_regime public.tax_regime,
  nfe_enabled boolean not null default false,
  nfe_series integer not null default 1 check (nfe_series between 0 and 999),
  nfe_next_number bigint not null default 1 check (nfe_next_number between 1 and 999999999),
  nfce_enabled boolean not null default false,
  nfce_series integer not null default 1 check (nfce_series between 0 and 999),
  nfce_next_number bigint not null default 1 check (nfce_next_number between 1 and 999999999),
  csc_id text,                     -- identificador do CSC (o token fica em private.fiscal_secrets)
  default_tax_rule_id uuid references public.tax_rules (id) on delete set null,
  additional_info text,            -- informações complementares padrão
  updated_by uuid references public.profiles (id) on delete set null,
  updated_at timestamptz not null default now()
);

create trigger fiscal_settings_updated_at before update on public.fiscal_settings
  for each row execute function app.tg_set_updated_at();
create trigger fiscal_settings_same_company before insert or update on public.fiscal_settings
  for each row execute function app.tg_check_company_refs('default_tax_rule_id:tax_rules');
create trigger fiscal_settings_audit after insert or update or delete on public.fiscal_settings
  for each row execute function app.tg_audit();

-- Segredos: token do provedor, CSC, senha do certificado. Valores
-- criptografados pela aplicação (AES-256-GCM com FISCAL_ENCRYPTION_KEY) antes
-- de chegar ao banco. Schema `private` não é exposto pela API e não há grants
-- para anon/authenticated.
create table private.fiscal_secrets (
  company_id uuid primary key references public.companies (id) on delete cascade,
  provider_token_encrypted text,
  csc_token_encrypted text,
  certificate_password_encrypted text,
  certificate_storage_path text,
  certificate_expires_at date,
  updated_at timestamptz not null default now()
);

revoke all on private.fiscal_secrets from public;
grant select, insert, update, delete on private.fiscal_secrets to service_role;

create table public.fiscal_documents (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  sale_id uuid references public.sales (id) on delete restrict,
  model public.fiscal_model not null,
  environment public.fiscal_environment not null,
  series integer not null,
  number bigint not null,
  status public.fiscal_status not null default 'pending',
  provider text not null,
  provider_reference text not null,          -- referência idempotente enviada ao provedor
  access_key char(44) unique check (access_key ~ '^[0-9]{44}$'),
  protocol text,
  total numeric(14,2),
  xml_path text,
  pdf_path text,
  rejection_code text,
  rejection_message text,
  cancel_reason text,
  cancel_protocol text,
  issued_at timestamptz,
  authorized_at timestamptz,
  cancelled_at timestamptz,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (provider, provider_reference),
  unique (company_id, environment, model, series, number)
);

-- No máximo um documento "vivo" por venda e modelo.
create unique index fiscal_documents_active_per_sale_uq on public.fiscal_documents (sale_id, model)
  where status in ('pending', 'processing', 'authorized', 'contingency');
create index fiscal_documents_company_created_idx on public.fiscal_documents (company_id, created_at desc);

create trigger fiscal_documents_updated_at before update on public.fiscal_documents
  for each row execute function app.tg_set_updated_at();

create table public.fiscal_document_events (
  id bigint generated always as identity primary key,
  company_id uuid not null references public.companies (id) on delete cascade,
  fiscal_document_id uuid not null references public.fiscal_documents (id) on delete cascade,
  event text not null,              -- send, query, authorized, rejected, cancel, error…
  status public.fiscal_status,
  request jsonb,                    -- sem segredos
  response jsonb,
  created_at timestamptz not null default now()
);

create index fiscal_document_events_doc_idx on public.fiscal_document_events (fiscal_document_id, created_at);

-- -----------------------------------------------------------------------------
-- Documentos gerados (PDFs armazenados no Supabase Storage)
-- -----------------------------------------------------------------------------
create table public.generated_documents (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  type public.document_type not null,
  reference_type text,
  reference_id uuid,
  file_name text not null,
  storage_path text not null,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);

create index generated_documents_ref_idx on public.generated_documents (company_id, reference_type, reference_id);
