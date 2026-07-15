// Casos extremos: domingo bloqueado, feriado cadastrado, conflito de horário, opção inválida no menu.
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

function proximoDomingoBR() {
  const d = new Date();
  d.setDate(d.getDate() + ((7 - d.getDay()) % 7 || 7));
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
}

(async () => {
  const phone = '5511999999999';

  // 1) Domingo deve ser recusado durante a escolha de data
  let r = await handleIncoming({ from: phone, msgId: 'e1', text: '1' }); // menu -> agendar
  r = await handleIncoming({ from: phone, msgId: 'e2', text: '1' }); // escolhe profissional
  r = await handleIncoming({ from: phone, msgId: 'e3', text: proximoDomingoBR() });
  checar(r.includes('Domingo'), 'domingo é recusado com a mensagem correta');

  // volta ao menu e testa feriado cadastrado (25/12 do próximo ano em que ainda não passou)
  await handleIncoming({ from: phone, msgId: 'e4', text: 'menu' });
  await handleIncoming({ from: phone, msgId: 'e5', text: '1' });
  await handleIncoming({ from: phone, msgId: 'e6', text: '1' });
  const anoNatal = new Date().getMonth() === 11 && new Date().getDate() > 25 ? new Date().getFullYear() + 1 : new Date().getFullYear();
  r = await handleIncoming({ from: phone, msgId: 'e7', text: `25/12/${anoNatal}` });
  checar(r.includes('Natal'), 'feriado cadastrado (Natal) é recusado');

  // 2) Opção inválida no menu principal
  await handleIncoming({ from: phone, msgId: 'e8', text: 'menu' });
  r = await handleIncoming({ from: phone, msgId: 'e9', text: '9' });
  checar(r.includes('não entendi'), 'opção inválida no menu mostra "não entendi"');

  // 3) Conflito de horário direto na camada de agendamentos (sem passar pelo menu)
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

  console.log(`\n${'='.repeat(50)}`);
  if (falhas === 0) console.log('✅ TODOS OS TESTES DE CASOS EXTREMOS PASSARAM');
  else console.log(`❌ ${falhas} teste(s) falharam`);
  process.exit(falhas === 0 ? 0 : 1);
})().catch(e => {
  console.error('Erro fatal no dry-run de casos extremos:', e);
  process.exit(1);
});
