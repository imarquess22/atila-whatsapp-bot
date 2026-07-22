// Casos extremos: domingo/feriado excluídos da lista de dias, conflito de horário, opção inválida no menu.
'use strict';

process.env.SUPABASE_URL = 'https://fake.supabase.local';
process.env.SUPABASE_SERVICE_KEY = 'fake-service-key';

const db = {
  profissionais: [
    { id: 'p1', dados: { id: 'p1', nome: 'Maria Teste', status: 'ativo' }, created_at: new Date().toISOString() },
  ],
  clientes: [
    { id: 'c1', dados: { id: 'c1', nome: 'Joana Cliente', tel: '5511999999999', status: 'ativo' }, created_at: new Date().toISOString() },
  ],
  agendamentos: [],
  dias_bloqueados: [
    { id: 'b1', dados: { id: 'b1', data: '12-25', recorrente: true, tipo: 'feriado', descricao: 'Natal' }, created_at: new Date().toISOString() },
  ],
  audit_log: [],
  whatsapp_sessions: [],
  config: [{ id: 'main', dados: { planos: [] }, created_at: new Date().toISOString() }],
};

function fakeFetch(url, options = {}) {
  const u = new URL(url);
  const tabela = u.pathname.split('/')[3];
  const method = options.method || 'GET';
  if (!db[tabela]) db[tabela] = [];
  const idParam = u.searchParams.get('id');
  const idFiltrado = idParam && idParam.startsWith('eq.') ? decodeURIComponent(idParam.slice(3)) : null;

  if (method === 'GET') {
    const rows = idFiltrado ? db[tabela].filter(r => r.id === idFiltrado) : db[tabela];
    return Promise.resolve({ ok: true, json: async () => rows, text: async () => JSON.stringify(rows) });
  }
  if (method === 'POST') {
    const body = JSON.parse(options.body);
    (Array.isArray(body) ? body : [body]).forEach(l => {
      const idx = db[tabela].findIndex(r => r.id === l.id);
      const row = { id: l.id, dados: l.dados, created_at: new Date().toISOString() };
      if (idx >= 0) db[tabela][idx] = row; else db[tabela].push(row);
    });
    return Promise.resolve({ ok: true, json: async () => ({}), text: async () => '' });
  }
  if (method === 'PATCH') {
    const body = JSON.parse(options.body);
    const row = db[tabela].find(r => r.id === idFiltrado);
    if (row && body.dados !== undefined) row.dados = body.dados;
    return Promise.resolve({ ok: true, json: async () => ({}), text: async () => '' });
  }
  return Promise.resolve({ ok: false, text: async () => `método não suportado: ${method}` });
}

globalThis.fetch = fakeFetch;

const { handleIncoming: handleIncomingRaw } = require('../lib/flow');
async function handleIncoming(msg) {
  const resposta = await handleIncomingRaw(msg);
  return resposta === null ? null : resposta.texto;
}
const agenda = require('../lib/agendamentos');

let falhas = 0;
function checar(condicao, mensagem) {
  if (!condicao) { falhas++; console.error(`❌ FALHOU: ${mensagem}`); }
  else console.log(`✅ ${mensagem}`);
}

(async () => {
  const phone = '5511999999999';

  // 1) Domingos nunca entram na lista de dias com disponibilidade
  const hoje = new Date();
  const dias1 = await agenda.diasComDisponibilidade('p1', hoje.getFullYear(), hoje.getMonth() + 1, 60);
  const temDomingo = dias1.some(d => new Date(d + 'T12:00:00').getDay() === 0);
  checar(!temDomingo, 'nenhum domingo aparece na lista de dias disponíveis do mês atual');
  checar(dias1.length > 0, 'mês atual tem pelo menos um dia disponível (sanity check)');

  // 2) Feriado cadastrado (25/12) não aparece na lista de dezembro
  const anoNatal = hoje.getMonth() === 11 && hoje.getDate() > 25 ? hoje.getFullYear() + 1 : hoje.getFullYear();
  const diasDezembro = await agenda.diasComDisponibilidade('p1', anoNatal, 12, 60);
  checar(!diasDezembro.includes(`${anoNatal}-12-25`), 'feriado cadastrado (Natal) não aparece na lista de dias de dezembro');

  // 3) Opção inválida no menu principal
  let r = await handleIncoming({ from: phone, msgId: 'e1', text: 'menu' });
  r = await handleIncoming({ from: phone, msgId: 'e2', text: '9' });
  checar(r.includes('não entendi'), 'opção inválida no menu mostra "não entendi"');

  // 4) Conflito de horário direto na camada de agendamentos (sem passar pelo menu)
  const dataTeste = (() => {
    const d = new Date(); d.setDate(d.getDate() + 15);
    if (d.getDay() === 0) d.setDate(d.getDate() + 1);
    return d.toISOString().split('T')[0];
  })();
  const primeiro = await agenda.criar({ clienteId: 'c1', profissionalId: 'p1', data: dataTeste, hora: '10:00', duracao: 60 });
  checar(primeiro.ok, 'primeiro agendamento no horário 10:00 é criado com sucesso');

  const conflitante = await agenda.criar({ clienteId: 'c1', profissionalId: 'p1', data: dataTeste, hora: '10:30', duracao: 60 });
  checar(!conflitante.ok && /ocupado/.test(conflitante.erro), 'segundo agendamento sobreposto (10:30, mesma profissional) é recusado por conflito');

  const semConflito = await agenda.criar({ clienteId: 'c1', profissionalId: 'p1', data: dataTeste, hora: '11:00', duracao: 60 });
  checar(semConflito.ok, 'terceiro agendamento (11:00, sem sobreposição) é criado normalmente');

  // 6) slotsDisponiveis() retorna a lista COMPLETA (sem cortar) — quem pagina é o flow.js.
  // Um dia totalmente livre tem até 29 horários possíveis (07:00–21:00 de 30 em 30).
  const menus = require('../lib/menus');
  const { HORARIOS_POR_PAGINA } = require('../lib/constants');
  const diaTotalmenteLivre = (() => {
    const d = new Date(); d.setDate(d.getDate() + 20);
    if (d.getDay() === 0) d.setDate(d.getDate() + 1);
    return d.toISOString().split('T')[0];
  })();
  const { slots: slotsDoDia } = await agenda.slotsDisponiveis('p1', diaTotalmenteLivre, 60);
  checar(slotsDoDia.length > HORARIOS_POR_PAGINA, `dia totalmente livre tem mais horários do que cabe numa página (veio: ${slotsDoDia.length})`);

  // Listas clicáveis do WhatsApp aceitam no máximo 10 linhas — a página que o flow.js monta
  // (horários + "Mais horários" + "Voltar") nunca pode passar disso.
  const pagina = slotsDoDia.slice(0, HORARIOS_POR_PAGINA);
  const temMais = slotsDoDia.length > HORARIOS_POR_PAGINA;
  const menuSlots = menus.listaSlots(pagina, diaTotalmenteLivre, temMais);
  checar(temMais && menuSlots.interactive.linhas.some(l => l.id === '9'), 'página de horários mostra a linha "Mais horários" quando há mais do que cabe');
  checar(menuSlots.interactive.linhas.length <= 10, `página de horários (com "Mais horários" + "Voltar") não passa de 10 linhas (veio: ${menuSlots.interactive.linhas.length})`);

  // 5) Sem procedimentos cadastrados, o fluxo de agendar não trava — pula direto pro mês
  r = await handleIncoming({ from: phone, msgId: 'e3', text: 'menu' });
  r = await handleIncoming({ from: phone, msgId: 'e4', text: '1' }); // agendar (1 profissional, 0 procedimentos)
  checar(r.includes('Para qual mês'), 'sem procedimentos cadastrados, pula direto pra escolha de mês (usa duração padrão)');

  // 7) Cliente/agendamento excluídos no portal (tombstone, _deleted:'*') não podem continuar
  // "vivos" pro bot — nem no cadastro, nem ocupando horário na agenda.
  const phoneExcluido = '5511988887777';
  db.clientes.push({ id: 'c-excluido', dados: { id: 'c-excluido', nome: 'Cliente Excluído', tel: phoneExcluido, status: 'ativo', _deleted: '*' }, created_at: new Date().toISOString() });
  const clienteAchado = await require('../lib/clientes').findClienteByPhone(phoneExcluido);
  checar(clienteAchado === null, 'cliente excluído no portal (tombstone) não é encontrado por telefone');

  r = await handleIncoming({ from: phoneExcluido, msgId: 'e5', text: 'oi' });
  checar(r.includes('nome completo'), 'número de um cliente excluído é tratado como cliente novo (pede cadastro de novo)');

  const dataTeste2 = (() => {
    const d = new Date(); d.setDate(d.getDate() + 16);
    if (d.getDay() === 0) d.setDate(d.getDate() + 1);
    return d.toISOString().split('T')[0];
  })();
  db.agendamentos.push({ id: 'ag-excluido', dados: { id: 'ag-excluido', clienteId: 'c1', profissionalId: 'p1', data: dataTeste2, hora: '09:00', duracao: 60, status: 'agendado', _deleted: '*' }, created_at: new Date().toISOString() });
  const agendamentosVisiveis = await agenda.fetchTodosAgendamentos();
  checar(!agendamentosVisiveis.some(a => a.id === 'ag-excluido'), 'agendamento excluído no portal (tombstone) não aparece em fetchTodosAgendamentos');
  const conflitoComExcluido = await agenda.criar({ clienteId: 'c1', profissionalId: 'p1', data: dataTeste2, hora: '09:00', duracao: 60 });
  checar(conflitoComExcluido.ok, 'horário de um agendamento excluído volta a ficar disponível (não bloqueia mais a agenda)');

  // 8) Agendamento de HOJE cujo horário já passou não pode continuar aparecendo como "futuro" —
  // senão o bot oferece remarcar/cancelar um horário que já aconteceu.
  const { hojeSP, horaAgoraSP, toMin } = require('../lib/util');
  const hojeStr = hojeSP();
  const minAgora = toMin(horaAgoraSP());
  const minPassado = Math.max(0, minAgora - 10);
  const horaPassada = `${String(Math.floor(minPassado / 60)).padStart(2, '0')}:${String(minPassado % 60).padStart(2, '0')}`;
  db.agendamentos.push({ id: 'ag-hoje-passado', dados: { id: 'ag-hoje-passado', clienteId: 'c1', profissionalId: 'p1', data: hojeStr, hora: horaPassada, duracao: 60, status: 'agendado' }, created_at: new Date().toISOString() });
  const futurosHoje = await agenda.listarFuturos('c1');
  checar(!futurosHoje.some(a => a.id === 'ag-hoje-passado'), 'agendamento de hoje com horário já passado não aparece mais como "futuro" (bot não oferece mais remarcar/cancelar)');

  // 9) "0" na tela de horários deve voltar pra escolha de DIA (não pro menu principal) — antes
  // disso resetava o fluxo inteiro, obrigando a cliente a escolher profissional/procedimento/mês de
  // novo só pra tentar outro dia. Continua a sessão do teste 5 (que parou em "Para qual mês").
  r = await handleIncoming({ from: phone, msgId: 'e6', text: '1' }); // escolhe o mês (1 = atual)
  checar(r.includes('Dias com horário livre'), 'depois de escolher o mês, mostra a lista de dias');
  r = await handleIncoming({ from: phone, msgId: 'e7', text: '1' }); // escolhe o primeiro dia disponível
  checar(r.includes('Horários livres'), 'depois de escolher o dia, mostra a lista de horários');
  r = await handleIncoming({ from: phone, msgId: 'e8', text: '0' }); // "voltar" a partir da tela de horários
  checar(r.includes('Dias com horário livre') && !r.includes('Como posso ajudar'), '"0" na tela de horários volta pra escolha de dia, não pro menu principal');
  r = await handleIncoming({ from: phone, msgId: 'e9', text: '0' }); // "voltar" a partir da tela de dias (comportamento não deve mudar)
  checar(r.includes('Como posso ajudar'), '"0" na tela de dias continua voltando pro menu principal (não alterado)');

  // 10) Opção "6" do menu principal mostra a tabela de preços vinda do cadastro de procedimentos
  // (Configurações → Planos Disponíveis no portal), buscada ao vivo.
  db.config[0].dados.planos = [{ id: 'proc1', nome: 'Manicure', valor: 35, duracaoMin: 45 }];
  r = await handleIncoming({ from: phone, msgId: 'e10', text: '6' });
  checar(r.includes('Tabela de preços') && r.includes('Manicure') && r.includes('35,00'), 'opção 6 do menu mostra a tabela de preços com os procedimentos cadastrados');
  checar(r.includes('Como posso ajudar'), 'depois da tabela de preços, o menu principal aparece de novo em seguida');

  // 11) Horário de Atendimento (Calendário → config.horarioInicio/horarioFim): restringe só os
  // horários oferecidos ao bot pra escolha da cliente. Não deve impedir um agendamento manual
  // (agenda.criar direto, como o portal faz) fora dessa janela.
  const diaHorarioTeste = (() => {
    const d = new Date(); d.setDate(d.getDate() + 25);
    if (d.getDay() === 0) d.setDate(d.getDate() + 1);
    return d.toISOString().split('T')[0];
  })();
  db.config[0].dados.horarioInicio = '09:00';
  db.config[0].dados.horarioFim = '17:00';
  const { slots: slotsRestritos } = await agenda.slotsDisponiveis('p1', diaHorarioTeste, 60);
  checar(slotsRestritos.length > 0, 'com horário de atendimento configurado, ainda há horários livres dentro da janela');
  checar(slotsRestritos.every(h => h >= '09:00' && h < '17:00'), `slotsDisponiveis só oferece horários dentro de 09:00–17:00 (veio: ${slotsRestritos[0]}..${slotsRestritos[slotsRestritos.length - 1]})`);
  checar(!slotsRestritos.includes('07:00') && !slotsRestritos.includes('19:00'), 'horários fora da janela configurada (07:00, 19:00) não aparecem pro bot');

  const agendamentoManualForaDaJanela = await agenda.criar({ clienteId: 'c1', profissionalId: 'p1', data: diaHorarioTeste, hora: '19:00', duracao: 60 });
  checar(agendamentoManualForaDaJanela.ok, 'agendamento manual (agenda.criar) fora da janela configurada continua sendo permitido — a restrição é só na oferta ao bot');

  // Sem horário configurado, volta a oferecer a grade cheia (comportamento padrão preservado).
  delete db.config[0].dados.horarioInicio;
  delete db.config[0].dados.horarioFim;
  const diaSemRestricao = (() => {
    const d = new Date(); d.setDate(d.getDate() + 26);
    if (d.getDay() === 0) d.setDate(d.getDate() + 1);
    return d.toISOString().split('T')[0];
  })();
  const { slots: slotsSemRestricao } = await agenda.slotsDisponiveis('p1', diaSemRestricao, 60);
  checar(slotsSemRestricao.includes('07:00') && slotsSemRestricao.includes('20:30'), 'sem horário de atendimento configurado, a grade cheia (07:00–21:00) continua disponível');

  console.log(`\n${'='.repeat(50)}`);
  if (falhas === 0) console.log('✅ TODOS OS TESTES DE CASOS EXTREMOS PASSARAM');
  else console.log(`❌ ${falhas} teste(s) falharam`);
  process.exit(falhas === 0 ? 0 : 1);
})().catch(e => {
  console.error('Erro fatal no dry-run de casos extremos:', e);
  process.exit(1);
});
