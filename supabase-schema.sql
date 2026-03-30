-- Execute no SQL Editor do Supabase
create table if not exists usuarios (
  id bigint generated always as identity primary key,
  matricula text not null unique,
  senha text not null,
  role text not null check (role in ('adm', 'operacao')),
  email text,
  telefone text,
  created_at timestamptz default now()
);

create table if not exists notas (
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
  publicado_por text not null,
  created_at timestamptz default now()
);

create table if not exists conferencias (
  id bigint generated always as identity primary key,
  nota_id bigint not null references notas(id) on delete cascade,
  conferente_matricula text not null,
  observacao text,
  status text not null,
  itens_conferidos jsonb not null,
  created_at timestamptz default now()
);

create table if not exists logs (
  id bigint generated always as identity primary key,
  tipo text not null,
  codigo text,
  quantidade_divergencia numeric,
  mensagem text,
  divergente boolean default false,
  usuario_matricula text not null,
  created_at timestamptz default now()
);

create table if not exists chats (
  id bigint generated always as identity primary key,
  from_matricula text not null,
  from_role text not null,
  to_role text not null,
  mensagem text not null,
  created_at timestamptz default now()
);
