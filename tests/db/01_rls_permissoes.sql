-- Isolamento entre empresas, permissões por perfil e proteções de escrita.
\set QUIET on
begin;

select tests.create_user('a0000000-0000-0000-0000-00000000000a', 'admin.a@teste.com', 'Admin A');
select tests.create_user('a0000000-0000-0000-0000-0000000000b0', 'vendedor.a@teste.com', 'Vendedor A');
select tests.create_user('b0000000-0000-0000-0000-00000000000b', 'admin.b@teste.com', 'Admin B');

set role authenticated;

-- Empresa A
select tests.login('a0000000-0000-0000-0000-00000000000a');
select public.create_company('Empresa A Ltda', '11.222.333/0001-81') as company_a \gset
select tests.eq((select count(*) from public.financial_categories where company_id = :'company_a')::int, 6,
  'categorias financeiras padrão criadas');
select tests.throws($$select public.create_company('Outra', '11.444.777/0001-61')$$,
  'já vinculado', 'usuário não cria segunda empresa');

insert into public.company_members (company_id, user_id, role)
values (:'company_a', 'a0000000-0000-0000-0000-0000000000b0', 'seller');

insert into public.products (company_id, name, sale_price) values (:'company_a', 'Caneta azul', 2.50);
insert into public.products (company_id, name, sale_price) values (:'company_a', 'Caderno', 15);
select tests.eq((select array_agg(code order by code) from public.products where company_id = :'company_a'),
  array[1, 2]::bigint[], 'código interno automático e sequencial');
select tests.throws(format($$update public.products set code = 99 where company_id = %L and code = 1$$, :'company_a'),
  'gerado pelo sistema', 'código interno não pode ser alterado');
select tests.throws(format($$update public.products set stock_quantity = 50 where company_id = %L$$, :'company_a'),
  'só pode ser alterado por movimentações', 'saldo não pode ser alterado diretamente');
select tests.throws(format($$insert into public.products (company_id, name, stock_quantity) values (%L, 'X', 5)$$, :'company_a'),
  'movimentação de entrada', 'estoque inicial não pode ser informado no cadastro');
select tests.throws(format($$insert into public.stock_movements (company_id, product_id, type, quantity, balance_before, balance_after)
  select company_id, id, 'manual_entry', 1, 0, 1 from public.products where company_id = %L limit 1$$, :'company_a'),
  'permission denied', 'movimentações não podem ser inseridas pela API');
select tests.throws(format($$insert into public.suppliers (company_id, document, legal_name) values (%L, '11222333000180', 'Fornecedor X')$$, :'company_a'),
  'suppliers_document_valid', 'CNPJ inválido é rejeitado');
insert into public.suppliers (company_id, document, legal_name)
values (:'company_a', '12ABC34501DE35', 'Fornecedor CNPJ Alfanumérico');
select tests.eq((select count(*) from public.suppliers where company_id = :'company_a')::int, 1,
  'CNPJ alfanumérico válido é aceito');
insert into public.customers (company_id, person_type, document, legal_name)
values (:'company_a', 'PF', '52998224725', 'Cliente PF');

-- Vendedor A
select tests.login('a0000000-0000-0000-0000-0000000000b0');
select tests.eq((select count(*) from public.products)::int, 2, 'vendedor consulta produtos');
select tests.throws(format($$insert into public.products (company_id, name) values (%L, 'Proibido')$$, :'company_a'),
  'row-level security', 'vendedor não cadastra produto');
insert into public.customers (company_id, legal_name) values (:'company_a', 'Cliente cadastrado pelo vendedor');
select tests.eq((select count(*) from public.customers)::int, 2, 'vendedor cadastra e consulta clientes');
select tests.eq((select count(*) from public.suppliers)::int, 0, 'vendedor não vê fornecedores');
select tests.eq((select count(*) from public.audit_logs)::int, 0, 'vendedor não vê auditoria');
select tests.eq((select count(*) from public.financial_titles)::int, 0, 'vendedor não vê financeiro');
select tests.eq(
  (select bool_or(p = 'products.manage') from public.my_permissions(:'company_a') p), false,
  'my_permissions do vendedor não inclui products.manage');
update public.company_members set role = 'admin' where company_id = :'company_a';
select tests.eq((select role::text from public.company_members
  where user_id = 'a0000000-0000-0000-0000-0000000000b0'), 'seller', 'vendedor não altera o próprio perfil');

-- Empresa B: não enxerga nada da empresa A
select tests.login('b0000000-0000-0000-0000-00000000000b');
select public.create_company('Empresa B Ltda', '11.444.777/0001-61') as company_b \gset
select tests.eq((select count(*) from public.products)::int, 0, 'empresa B não vê produtos de A');
select tests.eq((select count(*) from public.customers)::int, 0, 'empresa B não vê clientes de A');
select tests.eq((select count(*) from public.companies)::int, 1, 'empresa B só vê a própria empresa');
select tests.throws(format($$insert into public.products (company_id, name) values (%L, 'Invasão')$$, :'company_a'),
  'row-level security', 'empresa B não insere em A');
select tests.throws(format($$select public.register_stock_movement(%L, (select id from public.products limit 1), 'manual_entry', 1, 'teste')$$, :'company_a'),
  'Permissão negada', 'empresa B não movimenta estoque de A');
insert into public.categories (company_id, name) values (:'company_b', 'Categoria B') returning id as category_b \gset

-- Admin A não pode referenciar registros da empresa B nem remover o único admin
select tests.login('a0000000-0000-0000-0000-00000000000a');
select tests.throws(format($$insert into public.products (company_id, name, category_id) values (%L, 'Produto A', %L)$$,
  :'company_a', :'category_b'), 'Referência inválida', 'não é possível referenciar cadastro de outra empresa');
select tests.throws(format($$update public.company_members set active = false
  where company_id = %L and user_id = 'a0000000-0000-0000-0000-00000000000a'; set constraints all immediate$$, :'company_a'),
  'pelo menos um administrador', 'empresa mantém ao menos um administrador');

-- Usuário anônimo
reset role;
set role anon;
select tests.throws('select count(*) from public.products', 'permission denied', 'anon não lê tabelas');
select tests.throws($$select public.create_company('X', '11222333000181')$$, 'permission denied', 'anon não executa RPCs');

reset role;
rollback;
