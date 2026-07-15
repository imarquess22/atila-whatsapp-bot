// Teste de integração do api/webhook.js de ponta a ponta: simula requisições HTTP reais
// (com assinatura HMAC válida) e um "Graph API" fake, sem tocar em nenhuma rede real.
'use strict';

const crypto = require('crypto');
const { Readable } = require('stream');

const FAKE_APP_SECRET = 'fake-app-secret';
process.env.SUPABASE_URL = 'https://fake.supabase.local';
process.env.SUPABASE_SERVICE_KEY = 'fake-service-key';
process.env.META_APP_SECRET = FAKE_APP_SECRET;
process.env.META_ACCESS_TOKEN = 'fake-access-token';
process.env.META_PHONE_NUMBER_ID = 'fake-phone-number-id';
process.env.META_VERIFY_TOKEN = 'fake-verify-token';
process.env.STUDIO_NOTIFICACAO_TELEFONE = '5511900000000';
process.env.PAINEL_WHATSAPP_SECRET = 'fake-painel-secret';

const db = {
  profissionais: [
    { id: 'p1', dados: { id: 'p1', nome: 'Maria Teste', status: 'ativo' }, created_at: new Date().toISOString() },
  ],
  clientes: [],
  agendamentos: [],
  dias_bloqueados: [],
  audit_log: [],
  whatsapp_sessions: [],
  mensagens_whatsapp: [],
};

const graphCalls = []; // registra tudo que "enviamos" pra Meta

function fakeFetch(url, options = {}) {
  const method = options.method || 'GET';

  if (url.startsWith('https://graph.facebook.com/')) {
    const body = options.body ? JSON.parse(options.body) : null;
    graphCalls.push({ url, body });
    return Promise.resolve({ ok: true, json: async () => ({ messages: [{ id: 'wamid.fake' }] }), text: async () => '' });
  }

  const u = new URL(url);
  const tabela = u.pathname.split('/')[3];
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

const webhookHandler = require('../api/webhook.js');
const enviarManualHandler = require('../api/enviar-manual.js');

function assinar(bodyStr) {
  return 'sha256=' + crypto.createHmac('sha256', FAKE_APP_SECRET).update(bodyStr).digest('hex');
}

function makeReq(bodyStr) {
  const req = Readable.from([Buffer.from(bodyStr, 'utf8')]);
  req.method = 'POST';
  req.url = '/api/webhook';
  req.headers = { 'content-length': String(Buffer.byteLength(bodyStr)), 'x-hub-signature-256': assinar(bodyStr) };
  return req;
}

function makeRes() {
  return {
    _status: null, _body: null, _headers: {},
    status(code) { this._status = code; return this; },
    end(body) { this._body = body; return this; },
    send(body) { this._body = body; return this; },
    json(body) { this._body = body; return this; },
    setHeader(k, v) { this._headers[k] = v; return this; },
  };
}

function payloadTexto(from, msgId, texto, nome) {
  return JSON.stringify({
    object: 'whatsapp_business_account',
    entry: [{ id: 'waba1', changes: [{ field: 'messages', value: {
      messaging_product: 'whatsapp',
      metadata: { phone_number_id: 'fake-phone-number-id' },
      contacts: [{ profile: { name: nome || 'Cliente' }, wa_id: from }],
      messages: [{ from, id: msgId, timestamp: '0', type: 'text', text: { body: texto } }],
    } }] }],
  });
}

function payloadInterativo(from, msgId, tipo, id, title) {
  const interactive = tipo === 'button'
    ? { type: 'button_reply', button_reply: { id, title } }
    : { type: 'list_reply', list_reply: { id, title } };
  return JSON.stringify({
    object: 'whatsapp_business_account',
    entry: [{ id: 'waba1', changes: [{ field: 'messages', value: {
      messaging_product: 'whatsapp',
      metadata: { phone_number_id: 'fake-phone-number-id' },
      contacts: [{ profile: { name: 'Cliente' }, wa_id: from }],
      messages: [{ from, id: msgId, timestamp: '0', type: 'interactive', interactive }],
    } }] }],
  });
}

let falhas = 0;
function checar(condicao, mensagem) {
  if (!condicao) { falhas++; console.error(`❌ FALHOU: ${mensagem}`); }
  else console.log(`✅ ${mensagem}`);
}

function dataFuturaBR(diasAFrente) {
  const d = new Date();
  d.setDate(d.getDate() + diasAFrente);
  if (d.getDay() === 0) d.setDate(d.getDate() + 1);
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
}

async function enviar(bodyStr) {
  const req = makeReq(bodyStr);
  const res = makeRes();
  await webhookHandler(req, res);
  return res;
}

(async () => {
  const phone = '5511988887777';
  let res;

  // 1) Cliente desconhecida manda "oi" -> pede nome (texto simples, sem interactive)
  res = await enviar(payloadTexto(phone, 'm1', 'oi'));
  checar(res._status === 200, 'webhook responde 200 para mensagem de texto');
  let ultima = graphCalls[graphCalls.length - 1];
  checar(ultima.body.type === 'text' && ultima.body.text.body.includes('nome completo'), 'pede nome via texto simples (sem interactive)');

  // 2) Envia o nome -> cadastro + menu principal (deve vir como LIST)
  res = await enviar(payloadTexto(phone, 'm2', 'Joana Cliente'));
  ultima = graphCalls[graphCalls.length - 1];
  checar(ultima.body.type === 'interactive' && ultima.body.interactive.type === 'list', 'menu principal é enviado como lista clicável');
  checar(ultima.body.interactive.action.sections[0].rows.length === 5, 'lista do menu principal tem as 5 opções');

  // 3) Escolhe "1" digitando texto -> lista de profissionais (LIST)
  res = await enviar(payloadTexto(phone, 'm3', '1'));
  ultima = graphCalls[graphCalls.length - 1];
  checar(ultima.body.interactive?.type === 'list', 'lista de profissionais também é clicável');
  checar(ultima.body.interactive.action.sections[0].rows.some(r => r.title === 'Maria Teste'), 'Maria Teste aparece na lista');

  // 4) Escolhe profissional clicando (interactive list_reply id "1") -> pede data (texto simples)
  res = await enviar(payloadInterativo(phone, 'm4', 'list', '1', 'Maria Teste'));
  ultima = graphCalls[graphCalls.length - 1];
  checar(ultima.body.type === 'text' && ultima.body.text.body.includes('DD/MM/AAAA'), 'resposta ao clique interativo funciona igual a digitar (pede data)');

  // 5) Digita a data -> lista de horários (LIST)
  const dataAgendar = dataFuturaBR(10);
  res = await enviar(payloadTexto(phone, 'm5', dataAgendar));
  ultima = graphCalls[graphCalls.length - 1];
  checar(ultima.body.interactive?.type === 'list', 'lista de horários livres é clicável');

  // 6) Clica no primeiro horário (interactive) -> confirmação (BUTTONS)
  res = await enviar(payloadInterativo(phone, 'm6', 'list', '1', '07:00'));
  ultima = graphCalls[graphCalls.length - 1];
  checar(ultima.body.interactive?.type === 'button', 'confirmação do agendamento vem como botões');
  checar(ultima.body.interactive.action.buttons.length === 2, 'tem 2 botões (confirmar/cancelar)');

  // 7) Clica em confirmar (botão id "1") -> agendamento criado + menu (LIST)
  res = await enviar(payloadInterativo(phone, 'm7', 'button', '1', '✅ Confirmar'));
  ultima = graphCalls[graphCalls.length - 1];
  checar(ultima.body.interactive?.type === 'list', 'depois de confirmar, volta o menu principal clicável');
  checar(db.agendamentos.length === 1, 'agendamento foi realmente criado no banco');

  // 8) Confere o histórico de mensagens
  checar(db.mensagens_whatsapp.length >= 14, `histórico tem mensagens registradas (recebidas+enviadas) — total: ${db.mensagens_whatsapp.length}`);
  const recebidas = db.mensagens_whatsapp.filter(m => m.dados.direcao === 'recebida');
  const enviadas = db.mensagens_whatsapp.filter(m => m.dados.direcao === 'enviada');
  checar(recebidas.length === 7, `7 mensagens recebidas registradas (veio: ${recebidas.length})`);
  checar(enviadas.length === 7, `7 mensagens enviadas registradas (veio: ${enviadas.length})`);
  checar(recebidas.some(m => m.dados.texto === 'Maria Teste'), 'histórico mostra o título clicado ("Maria Teste"), não só o id "1"');

  // 9) Assinatura inválida deve ser recusada com 401
  const reqRuim = makeReq(payloadTexto(phone, 'm8', 'oi'));
  reqRuim.headers['x-hub-signature-256'] = 'sha256=0000000000000000000000000000000000000000000000000000000000000000';
  const resRuim = makeRes();
  await webhookHandler(reqRuim, resRuim);
  checar(resRuim._status === 401, 'assinatura inválida é recusada com 401');

  // 10) Pedir atendente ("5") dispara aviso automático pro telefone do estúdio
  const chamadasAntes = graphCalls.length;
  res = await enviar(payloadTexto(phone, 'm9', '5'));
  const chamadasNovas = graphCalls.slice(chamadasAntes);
  checar(chamadasNovas.length === 2, 'pedir atendente gera 2 envios (resposta pra cliente + aviso pro estúdio)');
  checar(chamadasNovas[0]?.body.to === phone, 'cliente recebe a mensagem de "atendente acionado"');
  checar(chamadasNovas[1]?.body.to === '5511900000000' && chamadasNovas[1].body.text.body.includes('Joana Cliente'), 'estúdio recebe aviso com o nome da cliente');

  // 11) Endpoint /api/enviar-manual (resposta manual pela telinha do app)
  function makeJsonReq(body) { return { method: 'POST', body, headers: { 'content-type': 'application/json' } }; }

  const resManualSemSecret = makeRes();
  await enviarManualHandler(makeJsonReq({ telefone: phone, texto: 'oi', secret: 'errado' }), resManualSemSecret);
  checar(resManualSemSecret._status === 401, 'enviar-manual recusa secret errado');

  const resManualOk = makeRes();
  await enviarManualHandler(makeJsonReq({ telefone: phone, texto: 'Oi Joana, aqui é a Maria!', secret: 'fake-painel-secret' }), resManualOk);
  checar(resManualOk._status === 200, 'enviar-manual aceita secret correto');
  const ultimaManual = graphCalls[graphCalls.length - 1];
  checar(ultimaManual.body.type === 'text' && ultimaManual.body.text.body === 'Oi Joana, aqui é a Maria!', 'mensagem manual foi enviada via Graph API');
  const sessaoAposManual = db.whatsapp_sessions.find(s => s.id === phone)?.dados;
  checar(sessaoAposManual?.humanTakeover === true, 'enviar mensagem manual mantém/ativa o modo atendimento humano');

  console.log(`\n${'='.repeat(50)}`);
  if (falhas === 0) console.log('✅ TODOS OS TESTES DE WEBHOOK PASSARAM');
  else console.log(`❌ ${falhas} teste(s) falharam`);
  process.exit(falhas === 0 ? 0 : 1);
})().catch(e => {
  console.error('Erro fatal no dry-run do webhook:', e);
  process.exit(1);
});
