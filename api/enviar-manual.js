const { sendText } = require('../lib/meta');
const { registrarMensagem } = require('../lib/historico');
const { normalizePhone } = require('../lib/util');
const { getSession, saveSession } = require('../lib/session');

// Endpoint usado pela telinha "Mensagens WhatsApp" do index.html para uma pessoa
// responder manualmente uma cliente, pelo mesmo número do bot.
module.exports = async function handler(req, res) {
  // CORS: esse endpoint é chamado via fetch() direto do navegador (origem diferente da Vercel).
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') { res.status(204).end(); return; }

  if (req.method !== 'POST') {
    res.status(405).json({ ok: false, erro: 'Método não permitido.' });
    return;
  }

  const { telefone, texto, secret } = req.body || {};

  if (!process.env.PAINEL_WHATSAPP_SECRET || secret !== process.env.PAINEL_WHATSAPP_SECRET) {
    res.status(401).json({ ok: false, erro: 'Secret inválido.' });
    return;
  }
  if (!telefone || !String(texto || '').trim()) {
    res.status(400).json({ ok: false, erro: 'Informe telefone e texto.' });
    return;
  }

  const phone = normalizePhone(telefone);
  const mensagem = String(texto).trim();

  try {
    await sendText(phone, mensagem);
    await registrarMensagem(phone, 'enviada', mensagem);

    // Mantém (ou ativa) o modo "atendimento humano" e renova o prazo de silêncio do bot,
    // já que uma pessoa está respondendo manualmente agora.
    const session = await getSession(phone);
    session.humanTakeover = true;
    session.humanTakeoverAt = new Date().toISOString();
    await saveSession(phone, session);

    res.status(200).json({ ok: true });
  } catch (e) {
    console.error('Erro ao enviar mensagem manual:', e);
    res.status(500).json({ ok: false, erro: String(e.message || e) });
  }
};
