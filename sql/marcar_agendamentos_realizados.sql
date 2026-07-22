-- Marca como "realizado" todos os agendamentos com data até ontem (inclusive) que ainda estavam
-- em aberto — não mexe em quem já foi cancelado, deu falta ou já estava marcado como realizado.
--
-- Roda no SQL Editor do Supabase (projeto AtilaStudio). Usa as colunas geradas de
-- 005_colunas_consulta_clientes_agendamentos.sql (data, status, deletado) só pra filtrar — quem é
-- alterado de verdade é sempre a coluna `dados` (jsonb), a única fonte de verdade do app e do bot.

-- 1) Confira antes: quantos e quais registros seriam afetados.
select id, cliente_id, data, hora, status
from agendamentos
where data <= current_date - interval '1 day'
  and status not in ('realizado', 'cancelado', 'falta')
  and not deletado
order by data, hora;

-- 2) Depois de conferir a lista acima, rode o update.
update agendamentos
set dados = jsonb_set(dados, '{status}', '"realizado"')
where data <= current_date - interval '1 day'
  and status not in ('realizado', 'cancelado', 'falta')
  and not deletado;

-- Depois de rodar, se alguém tiver o portal aberto numa aba, é só dar F5 (ou esperar até 1 min
-- pela sincronização automática) que a Grade/Agenda já aparece com o status atualizado.
