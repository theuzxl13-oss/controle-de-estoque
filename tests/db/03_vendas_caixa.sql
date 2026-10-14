-- PDV: caixa, finalização de venda, descontos, pagamentos, idempotência e
-- cancelamento.
begin;

select tests.create_user('d0000000-0000-0000-0000-00000000000a', 'admin.d@teste.com');
select tests.create_user('d0000000-0000-0000-0000-0000000000f0', 'vendedor.d@teste.com');

set role authenticated;
select tests.login('d0000000-0000-0000-0000-00000000000a');
select public.create_company('Loja D Ltda', '11222333000181') as company \gset
insert into public.company_members (company_id, user_id, role)
values (:'company', 'd0000000-0000-0000-0000-0000000000f0', 'seller');

insert into public.products (company_id, name, sale_price, cost_price) values (:'company', 'Camiseta', 10.00, 4) returning id as p1 \gset
insert into public.products (company_id, name, sale_price, cost_price) values (:'company', 'Meia', 3.33, 1) returning id as p2 \gset
select public.register_stock_movement(:'company', :'p1', 'manual_entry', 10, 'Saldo inicial');
select public.register_stock_movement(:'company', :'p2', 'manual_entry', 5, 'Saldo inicial');
insert into public.customers (company_id, legal_name) values (:'company', 'Cliente Crediário') returning id as customer \gset

-- --------------------------------------------------------------------- Caixa
select tests.login('d0000000-0000-0000-0000-0000000000f0');
select tests.throws(format($$select public.finalize_sale(%L, gen_random_uuid(), '[]', '[]', 'venda-sem-caixa')$$, :'company'),
  'Abra o seu caixa', 'venda exige caixa aberto');
select public.open_cash_session(:'company', 100) as session \gset
select tests.throws(format($$select public.open_cash_session(%L, 0)$$, :'company'),
  'já possui um caixa aberto', 'um caixa aberto por operador');

-- ---------------------------------------------------------- Venda com troco
-- 2 × 10,00 + 3 × 3,33 = 29,99; desconto geral 0,99 (3,3%) → 29,00
-- Pagamento: dinheiro 20,00 (entregue 50,00) + Pix 9,00 → troco 30,00
select public.finalize_sale(
  :'company', :'session',
  jsonb_build_array(
    jsonb_build_object('product_id', :'p1', 'quantity', 2),
    jsonb_build_object('product_id', :'p2', 'quantity', 3)),
  '[{"method": "cash", "amount": 20, "tendered_amount": 50}, {"method": "pix", "amount": 9}]',
  'venda-00000001', null, 0.99) as sale1 \gset

select tests.eq((select array[subtotal, discount_total, total, change_amount] from public.sales where id = :'sale1'),
  array[29.99, 0.99, 29.00, 30.00]::numeric[], 'totais, desconto e troco da venda');
select tests.eq((select sum(total) from public.sale_items where sale_id = :'sale1'), 29.00, 'soma dos itens = total');
select tests.eq((select sum(discount) from public.sale_items where sale_id = :'sale1'), 0.99, 'desconto geral rateado nos itens');
select tests.eq((select stock_quantity from public.products where id = :'p1'), 8.000, 'baixa automática do estoque (item 1)');
select tests.eq((select stock_quantity from public.products where id = :'p2'), 2.000, 'baixa automática do estoque (item 2)');
select tests.eq((select sum(amount) from public.cash_movements where cash_session_id = :'session'), 120.00,
  'gaveta: abertura 100 + 20 em dinheiro');
select tests.eq((select seller_id from public.sales where id = :'sale1'), 'd0000000-0000-0000-0000-0000000000f0'::uuid,
  'venda registra o vendedor');

select tests.eq(public.finalize_sale(:'company', :'session',
  jsonb_build_array(jsonb_build_object('product_id', :'p1', 'quantity', 2),
                    jsonb_build_object('product_id', :'p2', 'quantity', 3)),
  '[{"method": "cash", "amount": 20, "tendered_amount": 50}, {"method": "pix", "amount": 9}]',
  'venda-00000001', null, 0.99), :'sale1'::uuid, 'duplo clique não gera segunda venda');
select tests.eq((select stock_quantity from public.products where id = :'p1'), 8.000, 'estoque não baixa duas vezes');

-- ----------------------------------------------------------------- Validações
select tests.throws(format($$select public.finalize_sale(%L, %L,
  jsonb_build_array(jsonb_build_object('product_id', %L, 'quantity', 1)),
  '[{"method": "pix", "amount": 9}]', 'venda-00000002', null, 1)$$, :'company', :'session', :'p1'),
  'limite permitido', 'vendedor não dá desconto acima do limite (10%)');
select tests.throws(format($$select public.finalize_sale(%L, %L,
  jsonb_build_array(jsonb_build_object('product_id', %L, 'quantity', 1)),
  '[{"method": "pix", "amount": 5}]', 'venda-00000003')$$, :'company', :'session', :'p1'),
  'difere do total', 'pagamentos precisam fechar o total');
select tests.throws(format($$select public.finalize_sale(%L, %L,
  jsonb_build_array(jsonb_build_object('product_id', %L, 'quantity', 1), jsonb_build_object('product_id', %L, 'quantity', 3)),
  '[{"method": "pix", "amount": 19.99}]', 'venda-00000004')$$, :'company', :'session', :'p1', :'p2'),
  'Estoque insuficiente', 'venda sem estoque é bloqueada');
select tests.eq((select stock_quantity from public.products where id = :'p1'), 8.000,
  'venda bloqueada não deixa baixa parcial (transação)');
select tests.throws(format($$select public.finalize_sale(%L, %L,
  jsonb_build_array(jsonb_build_object('product_id', %L, 'quantity', 1)),
  '[{"method": "store_credit", "amount": 10}]', 'venda-00000005')$$, :'company', :'session', :'p1'),
  'exige cliente', 'crediário exige cliente');
select tests.throws(format($$select public.finalize_sale(%L, %L,
  jsonb_build_array(jsonb_build_object('product_id', %L, 'quantity', 1)),
  '[{"method": "pix", "amount": 10, "tendered_amount": 20}]', 'venda-00000006')$$, :'company', :'session', :'p1'),
  'Valor recebido inválido', 'troco só existe em dinheiro');
select tests.throws($$insert into public.sales (company_id, seller_id, cash_session_id, subtotal, total, idempotency_key)
  values (gen_random_uuid(), gen_random_uuid(), gen_random_uuid(), 1, 1, 'x')$$,
  'permission denied', 'vendas não podem ser inseridas diretamente');

-- --------------------------------------------------------- Crediário 3 vezes
select public.finalize_sale(:'company', :'session',
  jsonb_build_array(jsonb_build_object('product_id', :'p1', 'quantity', 1)),
  '[{"method": "store_credit", "amount": 10, "installments": 3}]',
  'venda-00000007', :'customer') as sale2 \gset

-- ------------------------------------------------------- Visão do administrador
select tests.login('d0000000-0000-0000-0000-00000000000a');
select tests.eq((select array_agg(amount order by installment) from public.financial_titles where source_id = :'sale2'),
  array[3.33, 3.33, 3.34]::numeric[], 'crediário gera 3 contas a receber');
select tests.eq((select sum(amount) from public.financial_transactions where sale_id = :'sale1' and direction = 'in'), 29.00,
  'recebimentos à vista lançados no financeiro');
select public.open_cash_session(:'company', 50) as admin_session \gset
select public.finalize_sale(:'company', :'admin_session',
  jsonb_build_array(jsonb_build_object('product_id', :'p1', 'quantity', 1)),
  '[{"method": "credit_card", "amount": 8}]', 'venda-00000008', null, 2) as sale3 \gset
select tests.eq((select total from public.sales where id = :'sale3'), 8.00, 'gerente/admin pode dar desconto acima do limite');
select tests.eq((select due_date from public.financial_titles where source_id = :'sale3'), current_date + 30,
  'cartão de crédito gera conta a receber pelo prazo da adquirente');

select tests.login('d0000000-0000-0000-0000-0000000000f0');
select tests.eq((select count(*) from public.sales)::int, 2, 'vendedor vê apenas as próprias vendas');
select tests.throws(format($$select public.cancel_sale(%L, 'Cliente desistiu')$$, :'sale1'),
  'Permissão negada', 'vendedor não cancela venda');

-- --------------------------------------------------------------- Cancelamento
select tests.login('d0000000-0000-0000-0000-00000000000a');
select tests.throws(format($$select public.cancel_sale(%L, 'abc')$$, :'sale1'), 'motivo', 'cancelamento exige motivo');
select public.cancel_sale(:'sale1', 'Cliente desistiu da compra');
select tests.eq((select status::text from public.sales where id = :'sale1'), 'cancelled', 'venda cancelada');
select tests.eq((select stock_quantity from public.products where id = :'p2'), 5.000, 'estoque devolvido no cancelamento');
select tests.eq((select sum(amount) from public.financial_transactions where sale_id = :'sale1' and direction = 'out'), 29.00,
  'recebimentos estornados');
select tests.eq((select amount from public.cash_movements where reference_id = :'sale1' and type = 'refund'), -20.00,
  'dinheiro devolvido sai do caixa de quem cancelou');
select tests.eq((select cash_session_id from public.cash_movements where reference_id = :'sale1' and type = 'refund'),
  :'admin_session'::uuid, 'estorno no caixa aberto do administrador');
select tests.throws(format($$select public.cancel_sale(%L, 'Cancelar de novo')$$, :'sale1'),
  'Somente vendas concluídas', 'venda cancelada não é cancelada de novo');
select tests.eq((select count(*) from public.audit_logs where action = 'sale.cancelled')::int, 1, 'cancelamento auditado');

-- Venda com NFC-e autorizada não pode ser cancelada sem cancelar a nota
reset role;
insert into public.fiscal_documents (company_id, sale_id, model, environment, series, number, status, provider, provider_reference)
values (:'company', :'sale3', '65', 'homologacao', 1, 1, 'authorized', 'focus_nfe', 'ref-teste-1');
set role authenticated;
select tests.throws(format($$select public.cancel_sale(%L, 'Erro de digitação')$$, :'sale3'),
  'documento fiscal', 'exige cancelamento fiscal antes');

-- Crediário cancelado cancela as contas a receber
select public.cancel_sale(:'sale2', 'Venda lançada em duplicidade');
select tests.eq((select bool_and(status = 'cancelled') from public.financial_titles where source_id = :'sale2'), true,
  'contas a receber canceladas');

-- --------------------------------------------------------------- Fechamento
select tests.login('d0000000-0000-0000-0000-0000000000f0');
select tests.eq((public.close_cash_session(:'session', 115) ->> 'expected_cash_amount')::numeric, 120.00,
  'fechamento calcula o esperado em dinheiro');
select tests.eq((select difference from public.cash_sessions where id = :'session'), -5.00, 'diferença de caixa registrada');
select tests.throws(format($$select public.register_cash_movement(%L, 'supply', 10, 'Troco')$$, :'session'),
  'fechado', 'caixa fechado não recebe movimentação');

select tests.login('d0000000-0000-0000-0000-00000000000a');
select tests.throws(format($$select public.register_cash_movement(%L, 'withdrawal', 1000, 'Sangria')$$, :'admin_session'),
  'insuficiente', 'sangria limitada ao saldo da gaveta');
select public.register_cash_movement(:'admin_session', 'withdrawal', 10, 'Sangria para cofre');
select tests.eq((select sum(amount) from public.cash_movements where cash_session_id = :'admin_session'), 20.00,
  'gaveta do admin: 50 − 20 (estorno) − 10 (sangria)');

reset role;
rollback;
