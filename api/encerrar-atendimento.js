const { sendText } = require('../lib/meta');
const { registrarMensagem } = require('../lib/historico');
const { normalizePhone } = require('../lib/util');
const { getSession, saveSession } = require('../lib/session');

const MSG_ENCERRAMENTO =
  'Atendimento encerrado. ✅ Obrigada pelo contato!\n\n' +
  'Se precisar de mais alguma coisa, é só mandar uma mensagem por aqui — ' +
  'o assistente automático volta a te atender normalmente.';

// Encerra o modo "atendimento humano" de um número: o bot volta a responder sozinho e a
// cliente é avisada. Usado pelo botão "Encerrar atendimento" na tela/janelinha de mensagens.
module.exports = async function handler(req, res) {
  // CORS: chamado via fetch() direto do navegador (origem diferente da Vercel).
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') { res.status(204).end(); return; }

  if (req.method !== 'POST') {
    res.status(405).json({ ok: false, erro: 'Método não permitido.' });
    return;
  }

  const { telefone, secret } = req.body || {};

  if (!process.env.PAINEL_WHATSAPP_SECRET || secret !== process.env.PAINEL_WHATSAPP_SECRET) {
    res.status(401).json({ ok: false, erro: 'Secret inválido.' });
    return;
  }
  if (!telefone) {
    res.status(400).json({ ok: false, erro: 'Informe o telefone.' });
    return;
  }

  const phone = normalizePhone(telefone);

  try {
    const session = await getSession(phone);
    session.humanTakeover = false;
    session.humanTakeoverAt = null;
    session.step = 'menu_principal';
    await saveSession(phone, session);

    await sendText(phone, MSG_ENCERRAMENTO);
    await registrarMensagem(phone, 'enviada', MSG_ENCERRAMENTO);

    res.status(200).json({ ok: true });
  } catch (e) {
    console.error('Erro ao encerrar atendimento humano:', e);
    res.status(500).json({ ok: false, erro: String(e.message || e) });
  }
};
