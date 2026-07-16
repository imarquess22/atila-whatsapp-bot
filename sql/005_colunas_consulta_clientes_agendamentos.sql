-- Expõe os campos mais úteis de `clientes` e `agendamentos` como colunas reais, GERADAS a partir
-- da coluna `dados` (jsonb), só para facilitar consulta/filtro/relatório direto no SQL Editor do
-- Supabase (ex: "select * from clientes where status = 'ativo' order by nome").
--
-- Importante: isso NÃO muda como o app funciona. `dados` continua sendo a única fonte de verdade
-- — o index.html e o bot do WhatsApp continuam lendo e escrevendo só essa coluna, exatamente como
-- hoje. As colunas abaixo são "generated always as ... stored": o Postgres as recalcula sozinho
-- toda vez que `dados` muda, então elas nunca ficam desatualizadas e não exigem nenhuma alteração
-- de código. Rode isso no SQL Editor do projeto "AtilaStudio".

alter table clientes
  add column if not exists nome        text generated always as (dados->>'nome') stored,
  add column if not exists tel         text generated always as (dados->>'tel') stored,
  add column if not exists cpf         text generated always as (dados->>'cpf') stored,
  add column if not exists email       text generated always as (dados->>'email') stored,
  add column if not exists nascimento  date generated always as (
    case when dados->>'nascimento' ~ '^\d{4}-\d{2}-\d{2}$' then make_date(
      substring(dados->>'nascimento' from 1 for 4)::int,
      substring(dados->>'nascimento' from 6 for 2)::int,
      substring(dados->>'nascimento' from 9 for 2)::int
    ) end
  ) stored,
  add column if not exists status      text generated always as (dados->>'status') stored,
  add column if not exists deletado    boolean generated always as (dados->>'_deleted' = '*') stored;

create index if not exists idx_clientes_nome   on clientes (nome);
create index if not exists idx_clientes_tel    on clientes (tel);
create index if not exists idx_clientes_status on clientes (status);

alter table agendamentos
  add column if not exists cliente_id      text generated always as (dados->>'clienteId') stored,
  add column if not exists profissional_id text generated always as (dados->>'profissionalId') stored,
  add column if not exists data            date generated always as (
    case when dados->>'data' ~ '^\d{4}-\d{2}-\d{2}$' then make_date(
      substring(dados->>'data' from 1 for 4)::int,
      substring(dados->>'data' from 6 for 2)::int,
      substring(dados->>'data' from 9 for 2)::int
    ) end
  ) stored,
  add column if not exists hora            text generated always as (dados->>'hora') stored,
  add column if not exists duracao         int generated always as (nullif(dados->>'duracao', '')::int) stored,
  add column if not exists status          text generated always as (dados->>'status') stored,
  add column if not exists deletado        boolean generated always as (dados->>'_deleted' = '*') stored;

create index if not exists idx_agendamentos_cliente_id      on agendamentos (cliente_id);
create index if not exists idx_agendamentos_profissional_id on agendamentos (profissional_id);
create index if not exists idx_agendamentos_data            on agendamentos (data);
create index if not exists idx_agendamentos_status          on agendamentos (status);

-- Exemplos de consulta que passam a funcionar direto:
-- select nome, tel, nascimento from clientes where status = 'ativo' and not deletado order by nome;
-- select c.nome, a.data, a.hora, a.status from agendamentos a join clientes c on c.id = a.cliente_id
--   where a.data >= current_date and not a.deletado order by a.data, a.hora;
