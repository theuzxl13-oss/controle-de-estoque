-- =============================================================================
-- 0800 — Supabase Storage: buckets privados e políticas.
-- Convenção de caminho: <company_id>/<pasta>/<arquivo>
--   company-assets: logotipo e imagens de produtos
--   documents:      PDFs gerados (pedidos, comprovantes, relatórios)
--   fiscal:         XML autorizados e DANFE (gravados apenas pelo servidor)
-- Arquivos são servidos por URLs assinadas de curta duração.
-- =============================================================================

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types) values
  ('company-assets', 'company-assets', false, 5242880, array['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml']),
  ('documents', 'documents', false, 20971520, array['application/pdf', 'text/csv',
     'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet']),
  ('fiscal', 'fiscal', false, 10485760, array['application/xml', 'text/xml', 'application/pdf'])
on conflict (id) do nothing;

create function app.storage_company(p_name text)
returns uuid
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_first text := split_part(p_name, '/', 1);
begin
  if v_first ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    return v_first::uuid;
  end if;
  return null;
end;
$$;

grant execute on function app.storage_company(text) to authenticated, service_role;

create policy "erp: membros leem arquivos da empresa" on storage.objects
  for select to authenticated
  using (
    bucket_id in ('company-assets', 'documents')
    and app.is_member(app.storage_company(name))
  );

create policy "erp: leitura de arquivos fiscais" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'fiscal'
    and app.has_permission(app.storage_company(name), 'fiscal.view')
  );

create policy "erp: envio de imagens e logotipo" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'company-assets'
    and (
      app.has_permission(app.storage_company(name), 'products.manage')
      or app.has_permission(app.storage_company(name), 'company.configure')
    )
  );

create policy "erp: atualização de imagens e logotipo" on storage.objects
  for update to authenticated
  using (
    bucket_id = 'company-assets'
    and (
      app.has_permission(app.storage_company(name), 'products.manage')
      or app.has_permission(app.storage_company(name), 'company.configure')
    )
  );

create policy "erp: remoção de imagens e logotipo" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'company-assets'
    and (
      app.has_permission(app.storage_company(name), 'products.manage')
      or app.has_permission(app.storage_company(name), 'company.configure')
    )
  );

create policy "erp: gravação de documentos gerados" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'documents'
    and app.is_member(app.storage_company(name))
  );
