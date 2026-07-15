// Teste local do estado da conversa (lib/flow.js) SEM tocar em nenhuma rede real:
// substitui o `fetch` global por um banco fake em memória, imitando as respostas do
// PostgREST do Supabase. Roda com: node test/dry-run.js
'use strict';

process.env.SUPABASE_URL = 'https://fake.supabase.local';
process.env.SUPABASE_SERVICE_KEY = 'fake-service-key';

const db = {
  profissionais: [
    { id: 'p1', dados: { id: 'p1', nome: 'Maria Teste', status: 'ativo' }, created_at: new Date().toISOString() },
  ],
  clientes: [],
  agendamentos: [],
  dias_bloqueados: [],
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
  if (method === 'DELETE') {
    db[tabela] = db[tabela].filter(r => r.id !== idFiltrado);
    return Promise.resolve({ ok: true, json: async () => ({}), text: async () => '' });
  }
  return Promise.resolve({ ok: false, text: async () => `método não suportado no fake fetch: ${method}` });
}

globalThis.fetch = fakeFetch;

const { handleIncoming } = require('../lib/flow');

function dataFuturaBR(diasAFrente) {
  const d = new Date();
  d.setDate(d.getDate() + diasAFrente);
  if (d.getDay() === 0) d.setDate(d.getDate() + 1); // evita domingo (sempre bloqueado)
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
}

let falhas = 0;
function checar(condicao, mensagem) {
  if (!condicao) { falhas++; console.error(`❌ FALHOU: ${mensagem}`); }
  else console.log(`✅ ${mensagem}`);
}

async function enviar(from, msgId, text) {
  const resposta = await handleIncoming({ from, msgId, text });
  const texto = resposta === null ? null : resposta.texto;
  console.log(`\n>>> [${from}] "${text}"\n<<< ${texto === null ? '(bot em silêncio)' : texto.replace(/\n/g, '\n    ')}`);
  return texto;
}

(async () => {
  const phone = '5511999999999';
  const dataAgendar = dataFuturaBR(10);
  const dataRemarcar = dataFuturaBR(11);

  let r;

  r = await enviar(phone, 'm1', 'oi');
  checar(r.includes('nome completo'), 'cliente desconhecida recebe pedido de cadastro');

  r = await enviar(phone, 'm2', 'Joana Cliente');
  checar(r.includes('Joana Cliente') && r.includes('Como posso ajudar'), 'cadastro automático + menu principal');
  checar(db.clientes.length === 1, 'cliente foi criado no banco');

  r = await enviar(phone, 'm3', '1');
  checar(r.includes('Maria Teste'), 'lista de profissionais mostra Maria Teste');

  r = await enviar(phone, 'm4', '1');
  checar(r.includes('DD/MM/AAAA'), 'pede a data no formato certo');

  r = await enviar(phone, 'm5', dataAgendar);
  checar(r.includes('07:00') || r.includes('Horários livres'), 'mostra horários livres');

  r = await enviar(phone, 'm6', '1');
  checar(r.includes('Confirma o agendamento'), 'pede confirmação do agendamento');

  r = await enviar(phone, 'm7', '1');
  checar(r.includes('agendado') && db.agendamentos.length === 1, 'agendamento foi criado no banco');
  checar(db.audit_log.some(a => a.dados.tipo === 'criar' && a.dados.entidade === 'agendamento'), 'audit_log registrou a criação');

  r = await enviar(phone, 'm8', '2');
  checar(r.includes(dataAgendar), 'ver agendamentos mostra o horário marcado');

  r = await enviar(phone, 'm9', '3');
  checar(r.includes('remarcar') || r.includes('remarc'), 'menu de remarcar lista o agendamento');

  r = await enviar(phone, 'm10', '1');
  checar(r.includes('DD/MM/AAAA'), 'pede nova data para remarcar');

  r = await enviar(phone, 'm11', dataRemarcar);
  r = await enviar(phone, 'm12', '1');
  checar(r.includes('Confirma o agendamento'), 'pede confirmação da remarcação');

  r = await enviar(phone, 'm13', '1');
  const [ddR, mmR, aaaaR] = dataRemarcar.split('/');
  const dataRemarcarISO = `${aaaaR}-${mmR}-${ddR}`;
  const agAtual = db.agendamentos[0].dados;
  checar(agAtual.data === dataRemarcarISO, 'agendamento foi remarcado para a nova data');
  checar(agAtual.status === 'agendado', 'status volta para agendado após remarcar');

  r = await enviar(phone, 'm14', '4');
  checar(r.includes('cancelar') || r.includes('Qual agendamento'), 'menu de cancelar lista o agendamento');

  r = await enviar(phone, 'm15', '1');
  checar(r.includes('Tem certeza'), 'pede confirmação do cancelamento');

  r = await enviar(phone, 'm16', '1');
  checar(r.includes('cancelado'), 'confirma cancelamento');
  checar(db.agendamentos[0].dados.status === 'cancelado', 'status do agendamento virou cancelado no banco');

  // Dedup: reenviar a MESMA msgId não deve reprocessar (deve responder null)
  r = await enviar(phone, 'm16', '1');
  checar(r === null, 'mensagem duplicada (mesmo id) não é reprocessada');

  console.log(`\n${'='.repeat(50)}`);
  if (falhas === 0) console.log('✅ TODOS OS TESTES PASSARAM');
  else console.log(`❌ ${falhas} teste(s) falharam`);
  process.exit(falhas === 0 ? 0 : 1);
})().catch(e => {
  console.error('Erro fatal no dry-run:', e);
  process.exit(1);
});
