// Integração com a WhatsApp Cloud API da Meta (Graph API).

const GRAPH_VERSION = 'v20.0';

const META_ACCESS_TOKEN = process.env.META_ACCESS_TOKEN;
const META_PHONE_NUMBER_ID = process.env.META_PHONE_NUMBER_ID;

// Envia uma mensagem de texto simples para `to` (dígitos, formato wa_id, ex: '5511999999999').
async function sendText(to, body) {
  if (!META_ACCESS_TOKEN || !META_PHONE_NUMBER_ID) {
    throw new Error('META_ACCESS_TOKEN/META_PHONE_NUMBER_ID não configurados nas variáveis de ambiente.');
  }
  const res = await fetch(`https://graph.facebook.com/${GRAPH_VERSION}/${META_PHONE_NUMBER_ID}/messages`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${META_ACCESS_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      to,
      type: 'text',
      text: { body, preview_url: false },
    }),
  });
  if (!res.ok) {
    const detalhe = await res.text();
    console.error('Erro ao enviar mensagem via Meta Graph API:', detalhe);
    throw new Error(`Falha ao enviar mensagem: ${detalhe}`);
  }
}

// Extrai { from, msgId, text } da primeira mensagem de texto recebida no payload do webhook,
// ou null se o payload não contém uma mensagem (ex: callback de status/entrega, sem side-effects).
function parseIncoming(payload) {
  try {
    const value = payload?.entry?.[0]?.changes?.[0]?.value;
    const msg = value?.messages?.[0];
    if (!msg) return null;
    const from = msg.from; // já vem em dígitos (wa_id), com DDI
    const msgId = msg.id;
    const nomePerfil = value?.contacts?.[0]?.profile?.name || null;
    const text = msg.type === 'text' ? (msg.text?.body || '').trim() : null;
    return { from, msgId, text, tipo: msg.type, nomePerfil };
  } catch (e) {
    console.error('Erro ao parsear payload do webhook Meta:', e);
    return null;
  }
}

module.exports = { sendText, parseIncoming };
