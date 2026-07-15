-- Cria todas as tabelas que o index.html espera encontrar no Supabase, seguindo o
-- mesmo padrão (id + dados jsonb + created_at) usado em todo o app.
-- Rode isso no projeto "AtilaStudio" (https://qtxglcprcuwucukablar.supabase.co).

create table if not exists clientes          (id text primary key, dados jsonb not null default '{}'::jsonb, created_at timestamptz not null default now());
create table if not exists profissionais     (id text primary key, dados jsonb not null default '{}'::jsonb, created_at timestamptz not null default now());
create table if not exists unidades          (id text primary key, dados jsonb not null default '{}'::jsonb, created_at timestamptz not null default now());
create table if not exists pagamentos        (id text primary key, dados jsonb not null default '{}'::jsonb, created_at timestamptz not null default now());
create table if not exists recibos           (id text primary key, dados jsonb not null default '{}'::jsonb, created_at timestamptz not null default now());
create table if not exists despesas          (id text primary key, dados jsonb not null default '{}'::jsonb, created_at timestamptz not null default now());
create table if not exists extrato_itens     (id text primary key, dados jsonb not null default '{}'::jsonb, created_at timestamptz not null default now());
create table if not exists ativos            (id text primary key, dados jsonb not null default '{}'::jsonb, created_at timestamptz not null default now());
create table if not exists dias_bloqueados   (id text primary key, dados jsonb not null default '{}'::jsonb, created_at timestamptz not null default now());
create table if not exists audit_log         (id text primary key, dados jsonb not null default '{}'::jsonb, created_at timestamptz not null default now());
create table if not exists config            (id text primary key, dados jsonb not null default '{}'::jsonb, created_at timestamptz not null default now());
create table if not exists usuarios          (id text primary key, dados jsonb not null default '{}'::jsonb, created_at timestamptz not null default now());

-- agendamentos tem uma coluna extra (checkin_at) usada pelas telas de check-in/atendimento
create table if not exists agendamentos (
  id         text primary key,
  dados      jsonb not null default '{}'::jsonb,
  checkin_at timestamptz,
  created_at timestamptz not null default now()
);
