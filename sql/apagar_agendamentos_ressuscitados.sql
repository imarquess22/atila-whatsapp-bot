-- Apaga (soft-delete) os 4 agendamentos "ressuscitados" pelo bug de sincronização já corrigido no
-- app — registros que tinham sido excluídos de verdade, mas voltaram a aparecer como ativos por
-- causa de uma cópia local desatualizada que foi reenviada pra nuvem antes da correção entrar no
-- ar. Confirmado com a Átila que nenhum desses 4 horários deveria existir.
--
-- Roda no SQL Editor do Supabase (projeto AtilaStudio).

-- 1) Confira antes: os 4 registros que serão apagados.
select id, cliente_id, data, hora, status, deletado
from agendamentos
where id in (
  '3b9ebd96-3313-47ac-a7c5-9f2a077a6bfe',  -- 16/07 07:00
  '1ea360ad-962e-45e0-862a-beb920e7eb30',  -- 16/07 08:30
  '387fb491-3045-4d80-80e9-5d0cd9792e56',  -- 16/07 09:30
  '18b9vg2lmrnhx0po'                        -- 16/07 16:00
);

-- 2) Depois de conferir, rode o update — marca como excluído (mesmo formato que o app usa pra
-- exclusão, dados->>'_deleted' = '*') em vez de apagar a linha de verdade, então continua reversível
-- se algum desses 4 na verdade precisar voltar.
update agendamentos
set dados = jsonb_set(dados, '{_deleted}', '"*"')
where id in (
  '3b9ebd96-3313-47ac-a7c5-9f2a077a6bfe',
  '1ea360ad-962e-45e0-862a-beb920e7eb30',
  '387fb491-3045-4d80-80e9-5d0cd9792e56',
  '18b9vg2lmrnhx0po'
);

-- Depois de rodar, se alguém tiver o portal aberto numa aba, é só dar F5 (ou esperar até 1 min
-- pela sincronização automática) que a Grade/Agenda já aparece sem esses 4 fantasmas.
