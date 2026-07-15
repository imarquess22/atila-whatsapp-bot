-- Histórico de mensagens trocadas com o bot do WhatsApp (recebidas e enviadas).
-- Segue o mesmo padrão das outras tabelas (id + dados jsonb).

create table if not exists mensagens_whatsapp (
  id         text primary key,
  dados      jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

alter table mensagens_whatsapp disable row level security;
