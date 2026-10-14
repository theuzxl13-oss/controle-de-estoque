-- Funções auxiliares dos testes de banco (schema "tests").
create schema if not exists tests;
grant usage on schema tests to anon, authenticated;

create function tests.create_user(p_id uuid, p_email text, p_name text default 'Usuário Teste')
returns void language sql as $$
  insert into auth.users (id, email, raw_user_meta_data)
  values (p_id, p_email, jsonb_build_object('full_name', p_name));
$$;

-- Define o usuário "logado" (equivalente ao JWT do Supabase).
create function tests.login(p_id uuid) returns void language sql as $$
  select set_config('request.jwt.claim.sub', coalesce(p_id::text, ''), false);
$$;

create function tests.eq(p_actual anyelement, p_expected anyelement, p_message text)
returns void language plpgsql as $$
begin
  if p_actual is distinct from p_expected then
    raise exception 'FALHOU: % (esperado: %, obtido: %)', p_message, p_expected, p_actual;
  end if;
  raise notice 'ok - %', p_message;
end;
$$;

-- Executa um comando e exige que ele falhe com mensagem contendo p_pattern.
create function tests.throws(p_sql text, p_pattern text, p_message text)
returns void language plpgsql as $$
begin
  begin
    execute p_sql;
  exception when others then
    if sqlerrm ilike '%' || p_pattern || '%' then
      raise notice 'ok - %', p_message;
      return;
    end if;
    raise exception 'FALHOU: % (erro inesperado: %)', p_message, sqlerrm;
  end;
  raise exception 'FALHOU: % (o comando não falhou)', p_message;
end;
$$;

grant execute on all functions in schema tests to anon, authenticated;
