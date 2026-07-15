const { verifySignature, readRawBody } = require('../lib/verifySignature');
const { parseIncoming, sendText, sendButtons, sendList } = require('../lib/meta');
const { handleIncoming } = require('../lib/flow');
const { registrarMensagem } = require('../lib/historico');

// Envia a resposta no formato certo (lista, botões ou texto simples) e sempre
// grava o texto no histórico, independente de como foi enviado.
async function enviarResposta(to, resposta) {
  await registrarMensagem(to, 'enviada', resposta.texto);
  const it = resposta.interactive;
  if (it?.tipo === 'list') {
    await sendList(to, it.corpo, it.textoBotao, it.linhas);
  } else if (it?.tipo === 'buttons') {
    await sendButtons(to, it.corpo, it.botoes);
  } else {
    await sendText(to, resposta.texto);
  }
}

// Desliga o parser automático de corpo da Vercel — precisamos dos bytes BRUTOS
// da requisição para conferir a assinatura HMAC antes de confiar no conteúdo.
module.exports.config = { api: { bodyParser: false } };

module.exports = async function handler(req, res) {
  if (req.method === 'GET') {
    // Handshake de verificação do webhook, chamado uma vez quando você salva a URL na Meta.
    const url = new URL(req.url, 'http://localhost');
    const mode = req.query?.['hub.mode'] ?? url.searchParams.get('hub.mode');
    const token = req.query?.['hub.verify_token'] ?? url.searchParams.get('hub.verify_token');
    const challenge = req.query?.['hub.challenge'] ?? url.searchParams.get('hub.challenge');

    if (mode === 'subscribe' && token === process.env.META_VERIFY_TOKEN) {
      res.status(200).send(challenge);
      return;
    }
    res.status(403).end();
    return;
  }

  if (req.method !== 'POST') {
    res.status(405).end();
    return;
  }

  let rawBody;
  try {
    rawBody = await readRawBody(req);
  } catch (e) {
    console.error('Erro ao ler corpo da requisição do webhook:', e);
    res.status(200).end();
    return;
  }

  const assinatura = req.headers['x-hub-signature-256'];
  if (!verifySignature(rawBody, assinatura)) {
    console.error('Assinatura inválida no webhook do WhatsApp — requisição rejeitada.');
    res.status(401).end();
    return;
  }

  let payload;
  try {
    payload = JSON.parse(rawBody.toString('utf8'));
  } catch (e) {
    console.error('Payload do webhook não é um JSON válido:', e);
    res.status(200).end();
    return;
  }

  // Importante: processamos tudo (Supabase + envio da resposta) ANTES de responder 200.
  // Funções serverless podem ser congeladas logo após a resposta ser enviada, então
  // qualquer `await` iniciado depois disso corre o risco de nunca terminar.
  try {
    const incoming = parseIncoming(payload);
    if (incoming) {
      await registrarMensagem(incoming.from, 'recebida', incoming.textoExibicao ?? incoming.text ?? `(mensagem do tipo ${incoming.tipo})`);
      const resposta = await handleIncoming(incoming);
      if (resposta) await enviarResposta(incoming.from, resposta);
    }
    // `incoming === null` normalmente é um callback de status/entrega — não há nada a processar.
  } catch (e) {
    console.error('Erro ao processar mensagem recebida do WhatsApp:', e);
    // Mesmo com erro interno, respondemos 200 abaixo para a Meta não entrar em loop de retentativas.
  }

  res.status(200).end();
};
