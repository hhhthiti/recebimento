-- Recebimento: Supabase Auth, perfis protegidos e RLS por papel.
-- Faça backup antes de executar. Senhas antigas serão apagadas e redefinidas.

alter table public.usuarios add column if not exists ativo boolean not null default true;
alter table public.usuarios drop column if exists senha;

create table if not exists public.recebimento_profiles (
  auth_user_id uuid primary key references auth.users(id) on delete cascade,
  matricula text not null unique,
  role text not null check (role in ('adm', 'operacao')),
  ativo boolean not null default true,
  email text,
  telefone text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create or replace function public.recebimento_user_is_active()
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.recebimento_profiles p
    where p.auth_user_id = (select auth.uid()) and p.ativo);
$$;
create or replace function public.recebimento_user_role()
returns text language sql stable security definer set search_path = '' as $$
  select p.role from public.recebimento_profiles p
    where p.auth_user_id = (select auth.uid()) and p.ativo limit 1;
$$;
create or replace function public.recebimento_user_matricula()
returns text language sql stable security definer set search_path = '' as $$
  select p.matricula from public.recebimento_profiles p
    where p.auth_user_id = (select auth.uid()) and p.ativo limit 1;
$$;
revoke all on function public.recebimento_user_is_active() from public, anon;
revoke all on function public.recebimento_user_role() from public, anon;
revoke all on function public.recebimento_user_matricula() from public, anon;
grant execute on function public.recebimento_user_is_active() to authenticated;
grant execute on function public.recebimento_user_role() to authenticated;
grant execute on function public.recebimento_user_matricula() to authenticated;

alter table public.recebimento_profiles enable row level security;
revoke all on public.recebimento_profiles from public, anon, authenticated;
grant select on public.recebimento_profiles to authenticated;
drop policy if exists recebimento_profiles_read on public.recebimento_profiles;
create policy recebimento_profiles_read on public.recebimento_profiles for select to authenticated
  using (auth_user_id = (select auth.uid()) or public.recebimento_user_role() = 'adm');

alter table public.usuarios enable row level security;
do $$ declare p record; begin
  for p in select policyname from pg_policies where schemaname = 'public' and tablename = 'usuarios' loop
    execute format('drop policy %I on public.usuarios', p.policyname);
  end loop;
end $$;
revoke all on public.usuarios from public, anon, authenticated;

-- Remove every legacy policy first, then apply role-specific access.
do $$
declare t text; p record;
  all_tables text[] := array['notas','conferencias','logs','chats','nq_reports'];
  seq_name text;
begin
  foreach t in array all_tables loop
    for p in select policyname from pg_policies where schemaname = 'public' and tablename = t loop
      execute format('drop policy %I on public.%I', p.policyname, t);
    end loop;
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from public, anon', t);
    execute format('grant select, insert, update, delete on public.%I to authenticated', t);
    seq_name := pg_get_serial_sequence(format('public.%I', t), 'id');
    if seq_name is not null then
      execute format('revoke all on sequence %s from public, anon', seq_name);
      execute format('grant usage, select on sequence %s to authenticated', seq_name);
    end if;
  end loop;
end $$;

create policy notas_read_active on public.notas for select to authenticated
  using (public.recebimento_user_is_active());
create policy notas_admin_write on public.notas for all to authenticated
  using (public.recebimento_user_role() = 'adm') with check (public.recebimento_user_role() = 'adm');

create policy conferencias_admin_read on public.conferencias for select to authenticated
  using (public.recebimento_user_role() = 'adm');
create policy conferencias_operacao_insert on public.conferencias for insert to authenticated
  with check (public.recebimento_user_role() = 'operacao'
    and conferente_matricula = public.recebimento_user_matricula());

create policy nq_reports_admin_read on public.nq_reports for select to authenticated
  using (public.recebimento_user_role() = 'adm');
create policy nq_reports_operacao_insert on public.nq_reports for insert to authenticated
  with check (public.recebimento_user_role() = 'operacao'
    and criado_por = public.recebimento_user_matricula());

create policy logs_admin_read on public.logs for select to authenticated
  using (public.recebimento_user_role() = 'adm');
create policy logs_active_insert on public.logs for insert to authenticated
  with check (public.recebimento_user_is_active()
    and usuario_matricula = public.recebimento_user_matricula());
create policy logs_admin_delete on public.logs for delete to authenticated
  using (public.recebimento_user_role() = 'adm');

create policy chats_participant_read on public.chats for select to authenticated
  using (public.recebimento_user_is_active()
    and (from_matricula = public.recebimento_user_matricula()
      or to_role = public.recebimento_user_role()));
create policy chats_sender_insert on public.chats for insert to authenticated
  with check (public.recebimento_user_is_active()
    and from_matricula = public.recebimento_user_matricula()
    and from_role = public.recebimento_user_role()
    and to_role <> public.recebimento_user_role());
