const { uploadMedia, sendAudio } = require('../lib/meta');
const { registrarMensagem } = require('../lib/historico');
const { normalizePhone } = require('../lib/util');
const { getSession, saveSession } = require('../lib/session');

// Limite de segurança: áudios de voz típicos têm 100–500KB; a Cloud API aceita até 16MB,
// mas o registro no histórico (jsonb) não deve ficar gigante.
const MAX_AUDIO_BYTES = 5 * 1024 * 1024;

// Recebe um áudio gravado no portal (base64), sobe pra Meta e envia pra cliente.
module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') { res.status(204).end(); return; }

  if (req.method !== 'POST') {
    res.status(405).json({ ok: false, erro: 'Método não permitido.' });
    return;
  }

  const { telefone, audioBase64, mime, secret } = req.body || {};

  if (!process.env.PAINEL_WHATSAPP_SECRET || secret !== process.env.PAINEL_WHATSAPP_SECRET) {
    res.status(401).json({ ok: false, erro: 'Secret inválido.' });
    return;
  }
  if (!telefone || !audioBase64) {
    res.status(400).json({ ok: false, erro: 'Informe telefone e o áudio.' });
    return;
  }

  const phone = normalizePhone(telefone);
  const buffer = Buffer.from(audioBase64, 'base64');
  if (!buffer.length || buffer.length > MAX_AUDIO_BYTES) {
    res.status(400).json({ ok: false, erro: 'Áudio vazio ou grande demais (limite 5MB).' });
    return;
  }

  try {
    const mediaId = await uploadMedia(buffer, mime || 'audio/ogg');
    await sendAudio(phone, mediaId);
    await registrarMensagem(phone, 'enviada', '🎤 Mensagem de áudio', { audioBase64, audioMime: mime || 'audio/ogg' });

    // Como no enviar-manual: responder em áudio mantém/renova o modo atendimento humano.
    const session = await getSession(phone);
    session.humanTakeover = true;
    session.humanTakeoverAt = new Date().toISOString();
    await saveSession(phone, session);

    res.status(200).json({ ok: true });
  } catch (e) {
    console.error('Erro ao enviar áudio manual:', e);
    res.status(500).json({ ok: false, erro: String(e.message || e) });
  }
};
