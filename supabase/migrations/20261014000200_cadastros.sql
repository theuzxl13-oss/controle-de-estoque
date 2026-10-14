-- =============================================================================
-- 0200 — Cadastros: categorias, regras tributárias, fornecedores, clientes e
-- produtos.
-- =============================================================================

-- Garante que as referências (FKs) de uma linha apontem para registros da
-- mesma empresa. Argumentos no formato 'coluna:tabela'.
create function app.tg_check_company_refs()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_arg text;
  v_col text;
  v_table text;
  v_ref uuid;
  v_ok boolean;
  v_company uuid := (to_jsonb(new) ->> 'company_id')::uuid;
begin
  foreach v_arg in array tg_argv loop
    v_col := split_part(v_arg, ':', 1);
    v_table := split_part(v_arg, ':', 2);
    v_ref := (to_jsonb(new) ->> v_col)::uuid;
    if v_ref is not null then
      execute format('select exists (select 1 from public.%I where id = $1 and company_id = $2)', v_table)
        into v_ok using v_ref, v_company;
      if not v_ok then
        raise exception 'Referência inválida em % para esta empresa.', v_col using errcode = '23503';
      end if;
    end if;
  end loop;
  return new;
end;
$$;

-- -----------------------------------------------------------------------------
-- Categorias de produto
-- -----------------------------------------------------------------------------
create table public.categories (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 80),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index categories_company_name_uq on public.categories (company_id, lower(name));

create trigger categories_updated_at before update on public.categories
  for each row execute function app.tg_set_updated_at();

-- -----------------------------------------------------------------------------
-- Regras tributárias configuráveis (CFOP, CST/CSOSN, alíquotas)
-- Devem ser definidas com apoio do contador da empresa.
-- -----------------------------------------------------------------------------
create table public.tax_rules (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 2 and 80),
  description text,
  cfop text not null check (cfop ~ '^[1-7][0-9]{3}$'),
  -- ICMS: CST (regime normal, 2 dígitos) ou CSOSN (Simples Nacional, 3 dígitos)
  icms_cst text check (icms_cst ~ '^[0-9]{2}$'),
  icms_csosn text check (icms_csosn ~ '^[0-9]{3}$'),
  icms_rate numeric(5,2) not null default 0 check (icms_rate between 0 and 100),
  icms_base_reduction numeric(5,2) not null default 0 check (icms_base_reduction between 0 and 100),
  pis_cst text check (pis_cst ~ '^[0-9]{2}$'),
  pis_rate numeric(6,4) not null default 0 check (pis_rate between 0 and 100),
  cofins_cst text check (cofins_cst ~ '^[0-9]{2}$'),
  cofins_rate numeric(6,4) not null default 0 check (cofins_rate between 0 and 100),
  ipi_cst text check (ipi_cst ~ '^[0-9]{2}$'),
  ipi_rate numeric(5,2) not null default 0 check (ipi_rate between 0 and 100),
  -- Campos livres para parâmetros que variam por UF/provedor (ex.: IBS/CBS
  -- da reforma tributária, FCP, ST). Validados na camada de integração.
  extra jsonb not null default '{}'::jsonb,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint tax_rules_icms_code check (icms_cst is not null or icms_csosn is not null)
);

create unique index tax_rules_company_name_uq on public.tax_rules (company_id, lower(name));

create trigger tax_rules_updated_at before update on public.tax_rules
  for each row execute function app.tg_set_updated_at();
create trigger tax_rules_audit after insert or update or delete on public.tax_rules
  for each row execute function app.tg_audit();

-- -----------------------------------------------------------------------------
-- Fornecedores
-- -----------------------------------------------------------------------------
create table public.suppliers (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  person_type public.person_type not null default 'PJ',
  document text not null,
  legal_name text not null check (char_length(btrim(legal_name)) between 2 and 150),
  trade_name text check (char_length(trade_name) <= 150),
  state_registration text,
  representative_name text,
  phone text,
  whatsapp text,
  email text,
  zip_code text check (zip_code ~ '^[0-9]{8}$'),
  street text,
  street_number text,
  complement text,
  district text,
  city text,
  state char(2) check (state ~ '^[A-Z]{2}$'),
  delivery_lead_days integer check (delivery_lead_days between 0 and 365),
  payment_terms text,
  notes text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint suppliers_document_valid check (app.is_valid_document(person_type, document)),
  constraint suppliers_document_normalized check (document = app.normalize_document(document)),
  unique (company_id, document)
);

create index suppliers_company_name_idx on public.suppliers
  using gin (legal_name extensions.gin_trgm_ops);

create trigger suppliers_updated_at before update on public.suppliers
  for each row execute function app.tg_set_updated_at();
create trigger suppliers_audit after insert or update or delete on public.suppliers
  for each row execute function app.tg_audit();

-- -----------------------------------------------------------------------------
-- Clientes
-- -----------------------------------------------------------------------------
create table public.customers (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  person_type public.person_type not null default 'PF',
  -- Documento opcional: permite cadastro mínimo (ex.: venda com NFC-e sem
  -- identificação do consumidor). NF-e exige documento — validado na emissão.
  document text,
  legal_name text not null check (char_length(btrim(legal_name)) between 2 and 150),
  trade_name text check (char_length(trade_name) <= 150),
  state_registration text,
  phone text,
  whatsapp text,
  email text,
  zip_code text check (zip_code ~ '^[0-9]{8}$'),
  street text,
  street_number text,
  complement text,
  district text,
  city text,
  city_ibge_code text check (city_ibge_code ~ '^[0-9]{7}$'),
  state char(2) check (state ~ '^[A-Z]{2}$'),
  notes text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint customers_document_valid check (document is null or app.is_valid_document(person_type, document)),
  constraint customers_document_normalized check (document = app.normalize_document(document)),
  unique (company_id, document)
);

create index customers_company_name_idx on public.customers
  using gin (legal_name extensions.gin_trgm_ops);

create trigger customers_updated_at before update on public.customers
  for each row execute function app.tg_set_updated_at();
create trigger customers_audit after insert or update or delete on public.customers
  for each row execute function app.tg_audit();

-- -----------------------------------------------------------------------------
-- Produtos
-- -----------------------------------------------------------------------------
create table public.products (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  code bigint not null,                       -- código interno automático
  barcode text check (barcode ~ '^[0-9A-Za-z]{1,30}$'),
  name text not null check (char_length(btrim(name)) between 2 and 120),
  description text,
  category_id uuid references public.categories (id) on delete set null,
  brand text check (char_length(brand) <= 60),
  supplier_id uuid references public.suppliers (id) on delete set null,
  cost_price numeric(14,4) not null default 0 check (cost_price >= 0),
  sale_price numeric(14,2) not null default 0 check (sale_price >= 0),
  -- Margem sobre o preço de venda: (venda − custo) / venda.
  margin_percent numeric(7,2) generated always as (
    case when sale_price > 0
      then round((sale_price - cost_price) / sale_price * 100, 2)
    end
  ) stored,
  -- Mantido exclusivamente pelas movimentações de estoque.
  stock_quantity numeric(14,3) not null default 0,
  min_stock numeric(14,3) not null default 0 check (min_stock >= 0),
  unit text not null default 'UN' check (unit ~ '^[A-Z0-9]{1,6}$'),
  location text check (char_length(location) <= 60),
  image_path text,
  active boolean not null default true,
  -- Dados fiscais
  ncm text check (ncm ~ '^[0-9]{8}$'),
  cest text check (cest ~ '^[0-9]{7}$'),
  origin smallint not null default 0 check (origin between 0 and 8),
  tax_rule_id uuid references public.tax_rules (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, code)
);

create unique index products_company_barcode_uq on public.products (company_id, barcode)
  where barcode is not null;
create index products_company_name_trgm_idx on public.products
  using gin (name extensions.gin_trgm_ops);
create index products_company_active_idx on public.products (company_id, active);
create index products_low_stock_idx on public.products (company_id)
  where active and stock_quantity <= min_stock;

create trigger products_assign_code before insert or update of code on public.products
  for each row execute function app.tg_assign_number('code', 'product');
create trigger products_updated_at before update on public.products
  for each row execute function app.tg_set_updated_at();
create trigger products_audit after insert or update or delete on public.products
  for each row execute function app.tg_audit();

-- O saldo só pode ser alterado pelas funções de movimentação do sistema.
create function app.tg_products_protect_stock()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if app.is_api_client() then
    if tg_op = 'INSERT' and new.stock_quantity <> 0 then
      raise exception 'O estoque inicial deve ser lançado como movimentação de entrada.'
        using errcode = 'P0001';
    elsif tg_op = 'UPDATE' and new.stock_quantity is distinct from old.stock_quantity then
      raise exception 'O saldo de estoque só pode ser alterado por movimentações.'
        using errcode = 'P0001';
    end if;
  end if;
  return new;
end;
$$;

create trigger products_protect_stock before insert or update on public.products
  for each row execute function app.tg_products_protect_stock();

create trigger products_same_company before insert or update on public.products
  for each row execute function app.tg_check_company_refs(
    'category_id:categories', 'supplier_id:suppliers', 'tax_rule_id:tax_rules');

-- -----------------------------------------------------------------------------
-- Produtos fornecidos por fornecedor (N:N)
-- -----------------------------------------------------------------------------
create table public.supplier_products (
  company_id uuid not null references public.companies (id) on delete cascade,
  supplier_id uuid not null references public.suppliers (id) on delete cascade,
  product_id uuid not null references public.products (id) on delete cascade,
  supplier_code text,
  last_cost numeric(14,4) check (last_cost >= 0),
  created_at timestamptz not null default now(),
  primary key (supplier_id, product_id)
);

create index supplier_products_product_idx on public.supplier_products (product_id);

create trigger supplier_products_same_company before insert or update on public.supplier_products
  for each row execute function app.tg_check_company_refs('supplier_id:suppliers', 'product_id:products');
