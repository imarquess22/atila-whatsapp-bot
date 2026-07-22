-- Apaga TODOS os agendamentos atuais (dados de teste) antes de entregar o portal pra dona do
-- studio começar a usar de verdade. Não mexe em clientes, profissionais, pagamentos nem em
-- nenhuma outra tabela — só agendamentos.
--
-- Roda no SQL Editor do Supabase (projeto AtilaStudio).

delete from agendamentos;

-- Depois de rodar, se alguém tiver o portal aberto numa aba, é só dar F5 (ou esperar até 1 min
-- pela sincronização automática) que a Grade/Agenda já aparece vazia.
