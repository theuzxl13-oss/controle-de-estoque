-- =============================================================================
-- 0100 — Núcleo: empresas, usuários, perfis de acesso, permissões, numeração
-- e auditoria.
--
-- Convenções adotadas em todas as migrations:
--   * Toda tabela de negócio possui `company_id` (isolamento multiempresa).
--   * Valores monetários: numeric(14,2); custos unitários: numeric(14,4);
--     quantidades: numeric(14,3) (permite KG, M, L etc.).
--   * Funções auxiliares ficam no schema `app` (não exposto pela API REST).
--   * Escritas críticas (estoque, vendas, recebimentos) acontecem apenas em
--     funções SECURITY DEFINER do schema `public` que validam permissões.
--     As travas de "somente sistema" usam `current_user`: dentro de uma
--     função SECURITY DEFINER ele é o dono da função, enquanto um acesso
--     direto pela API é feito como `authenticated`/`anon`. Isso não pode ser
--     forjado pelo cliente.
-- =============================================================================

create schema if not exists extensions;
create extension if not exists pg_trgm with schema extensions;

create schema if not exists app;
create schema if not exists private;

revoke all on schema app from public;
revoke all on schema private from public;
grant usage on schema app to authenticated, service_role;
grant usage on schema private to service_role;

-- -----------------------------------------------------------------------------
-- Tipos
-- -----------------------------------------------------------------------------
create type public.app_role as enum ('admin', 'manager', 'seller', 'stockist');
create type public.person_type as enum ('PF', 'PJ');

-- -----------------------------------------------------------------------------
-- Funções utilitárias genéricas
-- -----------------------------------------------------------------------------

-- Verdadeiro quando o código está rodando como cliente da API (e não dentro
-- de uma função SECURITY DEFINER do sistema). Deve permanecer SECURITY INVOKER.
create function app.is_api_client()
returns boolean
language sql
stable
set search_path = ''
as $$
  select current_user in ('authenticated', 'anon');
$$;

create function app.tg_set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- Remove tudo que não for dígito ou letra e converte para maiúsculas.
create function app.normalize_document(p_value text)
returns text
language sql
immutable
set search_path = ''
as $$
  select nullif(upper(regexp_replace(coalesce(p_value, ''), '[^0-9A-Za-z]', '', 'g')), '');
$$;

-- Valida CPF (11 dígitos) ou CNPJ (14 caracteres, incluindo o CNPJ
-- alfanumérico vigente a partir de jul/2026 — IN RFB nº 2.229/2024).
-- Para o CNPJ, cada caractere vale (código ASCII − 48); os dois dígitos
-- verificadores continuam numéricos e calculados por módulo 11.
create function app.is_valid_document(p_type public.person_type, p_value text)
returns boolean
language plpgsql
immutable
set search_path = ''
as $$
declare
  v text := app.normalize_document(p_value);
  v_sum int;
  v_dv int;
  i int;
  w int[];
begin
  if v is null then
    return false;
  end if;

  if p_type = 'PF' then
    if v !~ '^[0-9]{11}$' or v ~ '^(.)\1{10}$' then
      return false;
    end if;
    for d in 1..2 loop
      v_sum := 0;
      for i in 1..(8 + d) loop
        v_sum := v_sum + substr(v, i, 1)::int * (10 + d - i);
      end loop;
      v_dv := (v_sum * 10) % 11;
      if v_dv = 10 then v_dv := 0; end if;
      if v_dv <> substr(v, 9 + d, 1)::int then
        return false;
      end if;
    end loop;
    return true;
  end if;

  -- PJ
  if v !~ '^[0-9A-Z]{12}[0-9]{2}$' or v ~ '^(.)\1{13}$' then
    return false;
  end if;
  for d in 1..2 loop
    if d = 1 then
      w := array[5,4,3,2,9,8,7,6,5,4,3,2];
    else
      w := array[6,5,4,3,2,9,8,7,6,5,4,3,2];
    end if;
    v_sum := 0;
    for i in 1..(11 + d) loop
      v_sum := v_sum + (ascii(substr(v, i, 1)) - 48) * w[i];
    end loop;
    v_dv := v_sum % 11;
    v_dv := case when v_dv < 2 then 0 else 11 - v_dv end;
    if v_dv <> substr(v, 12 + d, 1)::int then
      return false;
    end if;
  end loop;
  return true;
end;
$$;

-- -----------------------------------------------------------------------------
-- Empresas
-- -----------------------------------------------------------------------------
create table public.companies (
  id uuid primary key default gen_random_uuid(),
  legal_name text not null check (char_length(btrim(legal_name)) between 2 and 150),
  trade_name text check (char_length(trade_name) <= 150),
  person_type public.person_type not null default 'PJ',
  document text not null unique,
  state_registration text,
  municipal_registration text,
  email text,
  phone text,
  zip_code text check (zip_code ~ '^[0-9]{8}$'),
  street text,
  street_number text,
  complement text,
  district text,
  city text,
  city_ibge_code text check (city_ibge_code ~ '^[0-9]{7}$'),
  state char(2) check (state ~ '^[A-Z]{2}$'),
  logo_path text,
  -- Parâmetros operacionais
  allow_negative_stock boolean not null default false,
  max_seller_discount_percent numeric(5,2) not null default 5
    check (max_seller_discount_percent between 0 and 100),
  credit_card_settlement_days integer not null default 30
    check (credit_card_settlement_days between 0 and 120),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint companies_document_valid check (app.is_valid_document(person_type, document)),
  constraint companies_document_normalized check (document = app.normalize_document(document))
);

create trigger companies_updated_at before update on public.companies
  for each row execute function app.tg_set_updated_at();

-- -----------------------------------------------------------------------------
-- Perfis de usuário (1:1 com auth.users)
-- -----------------------------------------------------------------------------
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  full_name text not null default '' check (char_length(full_name) <= 150),
  email text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger profiles_updated_at before update on public.profiles
  for each row execute function app.tg_set_updated_at();

create function app.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, full_name, email)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'full_name', ''),
    new.email
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created after insert on auth.users
  for each row execute function app.handle_new_user();

-- -----------------------------------------------------------------------------
-- Vínculo usuário × empresa com perfil de acesso
-- -----------------------------------------------------------------------------
create table public.company_members (
  company_id uuid not null references public.companies (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  role public.app_role not null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (company_id, user_id)
);

create index company_members_user_idx on public.company_members (user_id);

create trigger company_members_updated_at before update on public.company_members
  for each row execute function app.tg_set_updated_at();

-- Garante que a empresa nunca fique sem ao menos um administrador ativo.
create function app.tg_keep_one_admin()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_company uuid := coalesce(old.company_id, new.company_id);
begin
  if not exists (
    select 1 from public.company_members
    where company_id = v_company and role = 'admin' and active
  ) and exists (select 1 from public.companies where id = v_company) then
    raise exception 'A empresa precisa manter pelo menos um administrador ativo.'
      using errcode = 'P0001';
  end if;
  return null;
end;
$$;

create constraint trigger company_members_keep_admin
  after update or delete on public.company_members
  deferrable initially deferred
  for each row execute function app.tg_keep_one_admin();

-- -----------------------------------------------------------------------------
-- Permissões por perfil
-- -----------------------------------------------------------------------------
create table public.role_permissions (
  role public.app_role not null,
  permission text not null check (permission ~ '^[a-z_]+\.[a-z_]+$'),
  primary key (role, permission)
);

-- Matriz espelhada em src/lib/auth/permissions.ts (um teste garante que as
-- duas listas permanecem idênticas).
insert into public.role_permissions (role, permission)
select 'admin'::public.app_role, p from unnest(array[
  'dashboard.view',
  'company.configure', 'users.manage', 'audit.view',
  'products.view', 'products.manage',
  'stock.view', 'stock.move', 'stock.adjust', 'stock.inventory',
  'customers.view', 'customers.manage', 'customers.delete',
  'suppliers.view', 'suppliers.manage',
  'purchases.view', 'purchases.manage', 'purchases.receive',
  'sales.create', 'sales.view_own', 'sales.view_all', 'sales.discount',
  'sales.discount_unlimited', 'sales.cancel', 'sales.return',
  'cash.operate', 'cash.manage_all',
  'fiscal.view', 'fiscal.emit', 'fiscal.cancel', 'fiscal.configure',
  'finance.view', 'finance.manage',
  'reports.view'
]) as p
union all
select 'manager', p from unnest(array[
  'dashboard.view',
  'products.view', 'products.manage',
  'stock.view', 'stock.move', 'stock.adjust', 'stock.inventory',
  'customers.view', 'customers.manage', 'customers.delete',
  'suppliers.view', 'suppliers.manage',
  'purchases.view', 'purchases.manage', 'purchases.receive',
  'sales.create', 'sales.view_own', 'sales.view_all', 'sales.discount',
  'sales.discount_unlimited', 'sales.cancel', 'sales.return',
  'cash.operate', 'cash.manage_all',
  'fiscal.view', 'fiscal.emit', 'fiscal.cancel',
  'reports.view'
]) as p
union all
select 'seller', p from unnest(array[
  'dashboard.view',
  'products.view',
  'customers.view', 'customers.manage',
  'sales.create', 'sales.view_own', 'sales.discount',
  'cash.operate',
  'fiscal.view', 'fiscal.emit'
]) as p
union all
select 'stockist', p from unnest(array[
  'dashboard.view',
  'products.view', 'products.manage',
  'stock.view', 'stock.move', 'stock.inventory',
  'suppliers.view',
  'purchases.view', 'purchases.receive'
]) as p;

-- -----------------------------------------------------------------------------
-- Funções de autorização (usadas nas políticas RLS e nas RPCs)
-- -----------------------------------------------------------------------------
create function app.is_member(p_company uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.company_members
    where company_id = p_company and user_id = auth.uid() and active
  );
$$;

create function app.has_permission(p_company uuid, p_permission text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.company_members m
    join public.role_permissions rp on rp.role = m.role
    where m.company_id = p_company
      and m.user_id = auth.uid()
      and m.active
      and rp.permission = p_permission
  );
$$;

create function app.require_permission(p_company uuid, p_permission text)
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'Sessão expirada ou usuário não autenticado.' using errcode = '42501';
  end if;
  if not app.has_permission(p_company, p_permission) then
    raise exception 'Permissão negada (%).', p_permission using errcode = '42501';
  end if;
end;
$$;

-- Exposta à API para o frontend/servidor consultarem permissões do usuário.
create function public.my_permissions(p_company uuid)
returns setof text
language sql
stable
security definer
set search_path = ''
as $$
  select rp.permission
  from public.company_members m
  join public.role_permissions rp on rp.role = m.role
  where m.company_id = p_company and m.user_id = auth.uid() and m.active
  order by 1;
$$;

-- -----------------------------------------------------------------------------
-- Numeração sequencial por empresa (pedido nº 1, 2, 3… em cada empresa)
-- -----------------------------------------------------------------------------
create table public.company_counters (
  company_id uuid not null references public.companies (id) on delete cascade,
  key text not null,
  value bigint not null default 0,
  primary key (company_id, key)
);

create function app.next_number(p_company uuid, p_key text)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  v bigint;
begin
  insert into public.company_counters as c (company_id, key, value)
  values (p_company, p_key, 1)
  on conflict (company_id, key) do update set value = c.value + 1
  returning value into v;
  return v;
end;
$$;

-- Trigger genérico: TG_ARGV[0] = coluna, TG_ARGV[1] = chave do contador.
-- No INSERT sempre gera o número; no UPDATE impede alteração.
create function app.tg_assign_number()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_col text := tg_argv[0];
  v_key text := tg_argv[1];
begin
  if tg_op = 'INSERT' then
    new := jsonb_populate_record(
      new,
      jsonb_build_object(v_col, app.next_number(new.company_id, v_key))
    );
  elsif (to_jsonb(new) -> v_col) is distinct from (to_jsonb(old) -> v_col) then
    raise exception 'O campo % é gerado pelo sistema e não pode ser alterado.', v_col
      using errcode = 'P0001';
  end if;
  return new;
end;
$$;

-- -----------------------------------------------------------------------------
-- Auditoria
-- -----------------------------------------------------------------------------
create table public.audit_logs (
  id bigint generated always as identity primary key,
  company_id uuid references public.companies (id) on delete cascade,
  user_id uuid,
  action text not null,
  entity text not null,
  entity_id text,
  old_data jsonb,
  new_data jsonb,
  metadata jsonb,
  created_at timestamptz not null default now()
);

create index audit_logs_company_created_idx on public.audit_logs (company_id, created_at desc);
create index audit_logs_entity_idx on public.audit_logs (entity, entity_id);

create function app.log_event(
  p_company uuid,
  p_action text,
  p_entity text,
  p_entity_id text,
  p_metadata jsonb default null
)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.audit_logs (company_id, user_id, action, entity, entity_id, metadata)
  values (p_company, auth.uid(), p_action, p_entity, p_entity_id, p_metadata);
$$;

-- Trigger de auditoria de alterações em cadastros/configurações.
create function app.tg_audit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row jsonb := to_jsonb(coalesce(new, old));
  v_company uuid;
begin
  v_company := case
    when tg_table_name = 'companies' then (v_row ->> 'id')::uuid
    else (v_row ->> 'company_id')::uuid
  end;

  insert into public.audit_logs (company_id, user_id, action, entity, entity_id, old_data, new_data)
  values (
    v_company,
    auth.uid(),
    lower(tg_op),
    tg_table_name,
    coalesce(v_row ->> 'id', v_row ->> 'user_id', v_row ->> 'company_id'),
    case when tg_op in ('UPDATE', 'DELETE') then to_jsonb(old) end,
    case when tg_op in ('INSERT', 'UPDATE') then to_jsonb(new) end
  );
  return null;
end;
$$;

create trigger companies_audit after insert or update or delete on public.companies
  for each row execute function app.tg_audit();
create trigger company_members_audit after insert or update or delete on public.company_members
  for each row execute function app.tg_audit();

-- -----------------------------------------------------------------------------
-- Onboarding: criação da primeira empresa pelo usuário autenticado
-- -----------------------------------------------------------------------------
create function public.create_company(
  p_legal_name text,
  p_document text,
  p_person_type public.person_type default 'PJ',
  p_trade_name text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_company uuid;
begin
  if v_user is null then
    raise exception 'Usuário não autenticado.' using errcode = '42501';
  end if;

  -- Nesta versão cada usuário pode criar apenas uma empresa. Empresas
  -- adicionais serão liberadas quando o modo multiempresa for habilitado.
  if exists (select 1 from public.company_members where user_id = v_user) then
    raise exception 'Usuário já vinculado a uma empresa.' using errcode = 'P0001';
  end if;

  if not app.is_valid_document(p_person_type, p_document) then
    raise exception 'CPF/CNPJ inválido.' using errcode = '22023';
  end if;

  insert into public.companies (legal_name, trade_name, person_type, document)
  values (btrim(p_legal_name), nullif(btrim(p_trade_name), ''), p_person_type,
          app.normalize_document(p_document))
  returning id into v_company;

  insert into public.company_members (company_id, user_id, role)
  values (v_company, v_user, 'admin');

  return v_company;
end;
$$;
