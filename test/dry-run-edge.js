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

  // 6) Listas clicáveis do WhatsApp aceitam no máximo 10 linhas — um dia totalmente livre tem até
  // 29 horários possíveis (07:00–21:00 de 30 em 30), então listaSlots() precisa cortar e ainda
  // sobrar espaço pra linha "Voltar ao menu".
  const menus = require('../lib/menus');
  const diaTotalmenteLivre = (() => {
    const d = new Date(); d.setDate(d.getDate() + 20);
    if (d.getDay() === 0) d.setDate(d.getDate() + 1);
    return d.toISOString().split('T')[0];
  })();
  const { slots: slotsDoDia } = await agenda.slotsDisponiveis('p1', diaTotalmenteLivre, 60);
  checar(slotsDoDia.length <= 9, `slotsDisponiveis já limita a 9 horários por página (veio: ${slotsDoDia.length})`);
  const menuSlots = menus.listaSlots(slotsDoDia, diaTotalmenteLivre);
  checar(menuSlots.interactive.linhas.length <= 10, `lista de horários (com "Voltar") não passa de 10 linhas (veio: ${menuSlots.interactive.linhas.length})`);

  // 5) Sem procedimentos cadastrados, o fluxo de agendar não trava — pula direto pro mês
  r = await handleIncoming({ from: phone, msgId: 'e3', text: 'menu' });
  r = await handleIncoming({ from: phone, msgId: 'e4', text: '1' }); // agendar (1 profissional, 0 procedimentos)
  checar(r.includes('Para qual mês'), 'sem procedimentos cadastrados, pula direto pra escolha de mês (usa duração padrão)');

  console.log(`\n${'='.repeat(50)}`);
  if (falhas === 0) console.log('✅ TODOS OS TESTES DE CASOS EXTREMOS PASSARAM');
  else console.log(`❌ ${falhas} teste(s) falharam`);
  process.exit(falhas === 0 ? 0 : 1);
})().catch(e => {
  console.error('Erro fatal no dry-run de casos extremos:', e);
  process.exit(1);
});
