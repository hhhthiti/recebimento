-- Execute no SQL Editor do Supabase (versão idempotente)
create table if not exists public.usuarios (
  id bigint generated always as identity primary key,
  matricula text not null unique,
  senha text not null,
  role text not null check (role in ('adm', 'operacao')),
  email text,
  telefone text,
  created_at timestamptz default now()
);

create table if not exists public.notas (
  id bigint generated always as identity primary key,
  numero_nota text not null,
  chave_nfe text,
  motorista text not null,
  telefone_motorista text not null,
  placa text not null,
  emitente text,
  emissao text,
  valor_total numeric,
  itens_json jsonb not null,
  xml_raw text not null,
  dt_remessa text default '',
  descarga_fechada boolean default false,
  publicado_por text not null,
  created_at timestamptz default now()
);

create table if not exists public.conferencias (
  id bigint generated always as identity primary key,
  nota_id bigint not null references public.notas(id) on delete cascade,
  conferente_matricula text not null,
  observacao text,
  status text not null,
  avaria boolean default false,
  faltando boolean default false,
  avaria_obs text,
  itens_conferidos jsonb not null,
  created_at timestamptz default now()
);

create table if not exists public.logs (
  id bigint generated always as identity primary key,
  tipo text not null,
  codigo text,
  quantidade_divergencia numeric,
  mensagem text,
  divergente boolean default false,
  usuario_matricula text not null,
  created_at timestamptz default now()
);

create table if not exists public.chats (
  id bigint generated always as identity primary key,
  from_matricula text not null,
  from_role text not null,
  to_role text not null,
  mensagem text not null,
  created_at timestamptz default now()
);

create table if not exists public.nq_reports (
  id bigint generated always as identity primary key,
  data_ref timestamptz not null default now(),
  placa text not null,
  remessa text not null,
  nf text not null,
  cd_origem text not null default 'Mogi',
  sku text not null,
  qtde_nf numeric not null,
  qtd_rec_fisico numeric not null,
  avaria boolean default false,
  faltando boolean default false,
  criado_por text not null,
  created_at timestamptz default now()
);

alter table public.notas add column if not exists dt_remessa text default '';
alter table public.notas add column if not exists descarga_fechada boolean default false;
alter table public.conferencias add column if not exists avaria boolean default false;
alter table public.conferencias add column if not exists faltando boolean default false;
alter table public.conferencias add column if not exists avaria_obs text;
