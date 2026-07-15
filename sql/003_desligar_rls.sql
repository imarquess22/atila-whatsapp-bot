-- Desliga o Row Level Security nas tabelas do app. Necessário porque o index.html
-- usa a chave "anon" direto do navegador para ler/escrever, sem login via Supabase Auth
-- (o login é só dentro do próprio app) — então não há como escrever políticas de RLS
-- baseadas em usuário autenticado. Isso reproduz o mesmo modelo do projeto Supabase
-- original, onde a chave anon já tinha acesso total.

alter table clientes          disable row level security;
alter table profissionais     disable row level security;
alter table unidades          disable row level security;
alter table agendamentos      disable row level security;
alter table pagamentos        disable row level security;
alter table recibos           disable row level security;
alter table despesas          disable row level security;
alter table extrato_itens     disable row level security;
alter table ativos            disable row level security;
alter table dias_bloqueados   disable row level security;
alter table audit_log         disable row level security;
alter table config            disable row level security;
alter table usuarios          disable row level security;
alter table whatsapp_sessions disable row level security;
