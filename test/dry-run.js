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
  config: [
    { id: 'main', dados: { planos: [{ id: 'plano1', nome: 'Manicure Completa', valor: 50, duracaoMin: 45 }] }, created_at: new Date().toISOString() },
  ],
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

const { handleIncoming: handleIncomingRaw } = require('../lib/flow');

let falhas = 0;
function checar(condicao, mensagem) {
  if (!condicao) { falhas++; console.error(`❌ FALHOU: ${mensagem}`); }
  else console.log(`✅ ${mensagem}`);
}

async function enviar(from, msgId, text) {
  const resposta = await handleIncomingRaw({ from, msgId, text });
  const texto = resposta === null ? null : resposta.texto;
  console.log(`\n>>> [${from}] "${text}"\n<<< ${texto === null ? '(bot em silêncio)' : texto.replace(/\n/g, '\n    ')}`);
  return { texto, interactive: resposta?.interactive };
}

(async () => {
  const phone = '5511999999999';
  let r;

  r = await enviar(phone, 'm1', 'oi');
  checar(r.texto.includes('nome completo'), 'cliente desconhecida recebe pedido de cadastro');

  r = await enviar(phone, 'm2', 'Joana Cliente');
  checar(r.texto.includes('data de nascimento'), 'depois do nome, pede a data de nascimento');
  checar(db.clientes.length === 0, 'cliente ainda não foi criado (falta a data de nascimento)');

  r = await enviar(phone, 'm2b', '10/05/1995');
  checar(r.texto.includes('Joana Cliente') && r.texto.includes('Como posso ajudar'), 'cadastro automático + menu principal');
  checar(db.clientes.length === 1, 'cliente foi criado no banco');
  checar(db.clientes[0].dados.nascimento === '1995-05-10', 'data de nascimento foi salva corretamente');

  // Só há 1 profissional ativo -> a escolha de profissional é pulada, vai direto pro procedimento.
  r = await enviar(phone, 'm3', '1');
  checar(r.texto.includes('procedimento') && r.texto.includes('Manicure Completa'), 'pula direto pra escolha de procedimento (só 1 profissional ativo)');

  r = await enviar(phone, 'm4', '1');
  checar(r.texto.includes('Para qual mês'), 'pergunta o mês depois de escolher o procedimento');

  r = await enviar(phone, 'm5', '1'); // mês atual
  checar(r.texto.includes('Dias com horário livre'), 'mostra dias com horário livre no mês escolhido');
  checar(Array.isArray(r.interactive?.linhas) && r.interactive.linhas.length > 1, 'lista de dias vem como lista clicável');

  r = await enviar(phone, 'm6', '1'); // primeiro dia disponível
  checar(r.texto.includes('Horários livres'), 'mostra horários livres do dia escolhido');

  r = await enviar(phone, 'm7', '1'); // primeiro horário
  checar(r.texto.includes('Confirma o agendamento') && r.texto.includes('Manicure Completa'), 'confirmação mostra o procedimento escolhido');

  r = await enviar(phone, 'm8', '1'); // confirma
  checar(r.texto.includes('agendado') && db.agendamentos.length === 1, 'agendamento foi criado no banco');
  checar(!r.texto.includes('Como posso ajudar'), 'confirmação de agendamento não repete o menu principal');
  checar(db.agendamentos[0].dados.duracao === 45, 'agendamento usa a duração do procedimento (45min), não o padrão');
  checar(db.audit_log.some(a => a.dados.tipo === 'criar' && a.dados.entidade === 'agendamento'), 'audit_log registrou a criação');
  const dataAgendada = db.agendamentos[0].dados.data;

  r = await enviar(phone, 'm9', '2');
  checar(r.texto.includes(dataAgendada.split('-').reverse().join('/')), 'ver agendamentos mostra o horário marcado');

  r = await enviar(phone, 'm10', '3');
  checar(r.texto.includes('remarcar') || r.texto.includes('remarc'), 'menu de remarcar lista o agendamento');

  r = await enviar(phone, 'm11', '1'); // escolhe o agendamento
  checar(r.texto.includes('Para qual mês'), 'remarcar também pergunta o mês (sem pedir procedimento de novo)');

  r = await enviar(phone, 'm12', '2'); // mês que vem, pra garantir uma data diferente da original
  checar(r.texto.includes('Dias com horário livre') || r.texto.includes('Não há dias'), 'mostra dias do mês seguinte');

  r = await enviar(phone, 'm13', '1'); // primeiro dia do mês seguinte
  r = await enviar(phone, 'm14', '1'); // primeiro horário
  checar(r.texto.includes('Confirma o agendamento'), 'pede confirmação da remarcação');

  r = await enviar(phone, 'm15', '1');
  const agAtual = db.agendamentos[0].dados;
  checar(agAtual.data !== dataAgendada, 'agendamento foi remarcado para uma data diferente');
  checar(agAtual.status === 'agendado', 'status volta para agendado após remarcar');
  checar(!r.texto.includes('Como posso ajudar'), 'confirmação de remarcação não repete o menu principal');

  r = await enviar(phone, 'm16', '4');
  checar(r.texto.includes('cancelar') || r.texto.includes('Qual agendamento'), 'menu de cancelar lista o agendamento');

  r = await enviar(phone, 'm17', '1');
  checar(r.texto.includes('Tem certeza'), 'pede confirmação do cancelamento');

  r = await enviar(phone, 'm18', '1');
  checar(r.texto.includes('cancelado'), 'confirma cancelamento');
  checar(!r.texto.includes('Como posso ajudar'), 'confirmação de cancelamento não repete o menu principal');
  checar(db.agendamentos[0].dados.status === 'cancelado', 'status do agendamento virou cancelado no banco');

  // Dedup: reenviar a MESMA msgId não deve reprocessar (deve responder null)
  r = await enviar(phone, 'm18', '1');
  checar(r.texto === null, 'mensagem duplicada (mesmo id) não é reprocessada');

  console.log(`\n${'='.repeat(50)}`);
  if (falhas === 0) console.log('✅ TODOS OS TESTES PASSARAM');
  else console.log(`❌ ${falhas} teste(s) falharam`);
  process.exit(falhas === 0 ? 0 : 1);
})().catch(e => {
  console.error('Erro fatal no dry-run:', e);
  process.exit(1);
});
