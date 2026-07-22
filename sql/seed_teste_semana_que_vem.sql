-- Preenche a semana que vem inteira (segunda a sábado) com agendamentos de TESTE para o
-- profissional "Átila Gomes", alternando entre os clientes ativos já cadastrados — só para dar
-- massa de dados real e testar a Grade/Agenda sob volume.
--
-- - Calcula "semana que vem" a partir da data em que você RODAR o script (não tem data fixa).
-- - Pula domingo (sempre bloqueado no app) e qualquer bloqueio já cadastrado (feriado, folga,
--   ausência parcial) em dias_bloqueados — não cria agendamento em cima de bloqueio.
-- - Ids previsíveis (teste-semana-YYYYMMDD-HH) — rodar de novo só atualiza os mesmos registros
--   (upsert), não duplica. Pra apagar tudo depois, use o DELETE no final do arquivo.
--
-- Roda no SQL Editor do Supabase (projeto AtilaStudio).

do $$
declare
  v_profissional_id text := '17063xdtmrjr87od'; -- profissional ativo do studio
  v_clientes text[] := array[
    'e66b4b43-85a2-4ca2-8166-85c90d18f8fc',
    '9481c9d7-07d1-4552-b14a-592fe8479030',
    '902933c0-91e7-4eb1-9573-468ec5c9e3f3',
    'bbd0d8a6-3e4b-43d7-bd06-d25a77ce5612',
    'f6072387-0aa5-46d4-bc09-c59459e163b5'
  ];
  v_status text[] := array['agendado','agendado','agendado','confirmado'];
  v_segunda date := date_trunc('week', current_date + interval '7 days')::date; -- segunda da semana que vem
  v_dia date;
  v_hora int;
  v_hora_str text;
  v_idx int := 0;
  v_id text;
  v_bloqueado boolean;
begin
  for i in 0..5 loop -- segunda(0) .. sábado(5); domingo fica de fora de propósito
    v_dia := v_segunda + i;

    for v_hora in 7..20 loop -- 07:00 até 20:00, de hora em hora (agendamentos de 60min)
      v_hora_str := lpad(v_hora::text, 2, '0') || ':00';

      select exists (
        select 1 from dias_bloqueados b
        where (b.dados->>'_deleted') is distinct from '*'
          and (
            -- bloqueio de dia inteiro: recorrente semanal, anual (MM-DD) ou data específica
            ( coalesce(b.dados->>'tipo','') <> 'parcial' and (
                (b.dados->>'semanal')::boolean is true and (b.dados->>'diaSemana')::int = extract(dow from v_dia)::int
                or b.dados->>'data' = to_char(v_dia,'YYYY-MM-DD')
                or ( (b.dados->>'recorrente')::boolean is true and b.dados->>'data' = to_char(v_dia,'MM-DD') )
              )
            )
            or
            -- bloqueio parcial: mesma data, horário dentro da faixa bloqueada
            ( b.dados->>'tipo' = 'parcial' and b.dados->>'data' = to_char(v_dia,'YYYY-MM-DD')
              and v_hora_str >= (b.dados->>'horaDe') and v_hora_str < (b.dados->>'horaAte') )
          )
      ) into v_bloqueado;

      if v_bloqueado then
        continue;
      end if;

      v_idx := v_idx + 1;
      v_id := 'teste-semana-' || to_char(v_dia,'YYYYMMDD') || '-' || lpad(v_hora::text,2,'0');

      insert into agendamentos (id, dados)
      values (
        v_id,
        jsonb_build_object(
          'id', v_id,
          'clienteId', v_clientes[1 + (v_idx % array_length(v_clientes,1))],
          'profissionalId', v_profissional_id,
          'data', to_char(v_dia,'YYYY-MM-DD'),
          'hora', v_hora_str,
          'duracao', 60,
          'tipoAula', 'individual',
          'localTipo', 'domicilio',
          'enderecoDomicilio', '',
          'status', v_status[1 + (v_idx % array_length(v_status,1))],
          'recorrencia', 'nenhuma',
          'obs', 'Agendamento de teste (carga da semana)'
        )
      )
      on conflict (id) do update set dados = excluded.dados;
    end loop;
  end loop;

  raise notice 'Criados/atualizados % agendamentos de teste.', v_idx;
end $$;

-- ── Para limpar depois dos testes (apaga só os registros criados por este script) ──────────────
-- delete from agendamentos where id like 'teste-semana-%';
