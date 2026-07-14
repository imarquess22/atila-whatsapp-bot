-- Rode este SQL uma vez no SQL Editor do Supabase (projeto usado pelo index.html).
-- Guarda o estado da conversa do bot por número de telefone (necessário porque o
-- backend roda em funções serverless, que não guardam memória entre mensagens).

create table if not exists whatsapp_sessions (
  id         text primary key,             -- telefone normalizado, só dígitos (wa_id da Meta, ex: '5511999999999')
  dados      jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

-- Sem RLS: o backend só usa a service_role key, que já ignora RLS,
-- e nenhum outro cliente (nem o navegador) precisa acessar esta tabela.
