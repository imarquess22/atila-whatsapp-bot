const crypto = require('crypto');

// Confere a assinatura HMAC-SHA256 que a Meta envia no header 'x-hub-signature-256',
// calculada sobre o corpo BRUTO (raw bytes) da requisição — precisa vir antes do JSON.parse.
function verifySignature(rawBody, headerValue) {
  const appSecret = process.env.META_APP_SECRET;
  if (!appSecret) {
    console.error('META_APP_SECRET não configurado — recusando por segurança.');
    return false;
  }
  if (!headerValue || !headerValue.startsWith('sha256=')) return false;

  const esperado = crypto.createHmac('sha256', appSecret).update(rawBody).digest('hex');
  const recebido = headerValue.slice('sha256='.length);

  const bufEsperado = Buffer.from(esperado, 'hex');
  const bufRecebido = Buffer.from(recebido, 'hex');
  if (bufEsperado.length !== bufRecebido.length) return false;
  return crypto.timingSafeEqual(bufEsperado, bufRecebido);
}

// Lê o corpo bruto de uma requisição Node/Vercel (stream) antes de qualquer parse.
async function readRawBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  return Buffer.concat(chunks);
}

module.exports = { verifySignature, readRawBody };
