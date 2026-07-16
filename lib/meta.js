// Integração com a WhatsApp Cloud API da Meta (Graph API).

const GRAPH_VERSION = 'v20.0';

const META_ACCESS_TOKEN = process.env.META_ACCESS_TOKEN;
const META_PHONE_NUMBER_ID = process.env.META_PHONE_NUMBER_ID;

async function enviarPayload(body) {
  if (!META_ACCESS_TOKEN || !META_PHONE_NUMBER_ID) {
    throw new Error('META_ACCESS_TOKEN/META_PHONE_NUMBER_ID não configurados nas variáveis de ambiente.');
  }
  const res = await fetch(`https://graph.facebook.com/${GRAPH_VERSION}/${META_PHONE_NUMBER_ID}/messages`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${META_ACCESS_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const detalhe = await res.text();
    console.error('Erro ao enviar mensagem via Meta Graph API:', detalhe);
    throw new Error(`Falha ao enviar mensagem: ${detalhe}`);
  }
}

// Envia uma mensagem de texto simples para `to` (dígitos, formato wa_id, ex: '5511999999999').
async function sendText(to, body) {
  await enviarPayload({
    messaging_product: 'whatsapp',
    to,
    type: 'text',
    text: { body, preview_url: false },
  });
}

// Envia até 3 botões de resposta rápida. `botoes`: [{ id, titulo }] (titulo max ~20 caracteres).
async function sendButtons(to, corpo, botoes) {
  await enviarPayload({
    messaging_product: 'whatsapp',
    to,
    type: 'interactive',
    interactive: {
      type: 'button',
      body: { text: corpo },
      action: {
        buttons: botoes.slice(0, 3).map(b => ({
          type: 'reply',
          reply: { id: b.id, title: b.titulo.slice(0, 20) },
        })),
      },
    },
  });
}

// Envia uma lista de opções (menu clicável). `linhas`: [{ id, titulo, descricao? }] (até 10).
async function sendList(to, corpo, textoBotao, linhas) {
  await enviarPayload({
    messaging_product: 'whatsapp',
    to,
    type: 'interactive',
    interactive: {
      type: 'list',
      body: { text: corpo },
      action: {
        button: textoBotao.slice(0, 20),
        sections: [{
          rows: linhas.slice(0, 10).map(l => ({
            id: l.id,
            title: l.titulo.slice(0, 24),
            ...(l.descricao ? { description: l.descricao.slice(0, 72) } : {}),
          })),
        }],
      },
    },
  });
}

// Extrai { from, msgId, text, textoExibicao, tipo, nomePerfil } da primeira mensagem recebida no
// payload do webhook, ou null se não houver mensagem (ex: callback de status/entrega).
// `text` é sempre o valor "lógico" pro fluxo (texto digitado, ou o id do botão/linha clicada —
// que usamos igual a um número digitado, tipo "1", "2", "0"). `textoExibicao` é o texto legível
// (o que a cliente viu na tela) usado só para o histórico de mensagens.
function parseIncoming(payload) {
  try {
    const value = payload?.entry?.[0]?.changes?.[0]?.value;
    const msg = value?.messages?.[0];
    if (!msg) return null;
    const from = msg.from; // já vem em dígitos (wa_id), com DDI
    const msgId = msg.id;
    const nomePerfil = value?.contacts?.[0]?.profile?.name || null;

    let text = null;
    let textoExibicao = null;
    let mediaId = null;
    if (msg.type === 'text') {
      text = (msg.text?.body || '').trim();
      textoExibicao = text;
    } else if (msg.type === 'interactive') {
      const reply = msg.interactive?.button_reply || msg.interactive?.list_reply;
      text = reply?.id ?? null;
      textoExibicao = reply?.title ?? null;
    } else if (msg.type === 'audio') {
      // Mensagem de voz/áudio: o conteúdo em si é baixado depois (ver baixarMedia); pro fluxo
      // de menus o "texto" fica vazio (o bot não entende áudio — responde o menu, a menos que
      // um atendente humano esteja com a conversa).
      mediaId = msg.audio?.id || null;
      text = '';
      textoExibicao = '🎤 Mensagem de áudio';
    }

    return { from, msgId, text, textoExibicao, tipo: msg.type, nomePerfil, mediaId };
  } catch (e) {
    console.error('Erro ao parsear payload do webhook Meta:', e);
    return null;
  }
}

// Baixa uma mídia recebida (ex: áudio de uma mensagem de voz). A Graph API funciona em 2 passos:
// GET /{mediaId} devolve uma URL temporária + mime type; a URL exige o mesmo Bearer token.
// Retorna { base64, mime } ou lança erro.
async function baixarMedia(mediaId) {
  const meta = await fetch(`https://graph.facebook.com/${GRAPH_VERSION}/${mediaId}`, {
    headers: { Authorization: `Bearer ${META_ACCESS_TOKEN}` },
  });
  if (!meta.ok) throw new Error(`Falha ao consultar mídia ${mediaId}: ${await meta.text()}`);
  const info = await meta.json();

  const arquivo = await fetch(info.url, {
    headers: { Authorization: `Bearer ${META_ACCESS_TOKEN}` },
  });
  if (!arquivo.ok) throw new Error(`Falha ao baixar mídia ${mediaId}: ${arquivo.status}`);
  const buffer = Buffer.from(await arquivo.arrayBuffer());
  return { base64: buffer.toString('base64'), mime: info.mime_type || 'audio/ogg' };
}

// Sobe um arquivo de mídia para a Meta (multipart montado na mão — sem dependências externas)
// e retorna o media id para usar em sendAudio. Tipos de áudio aceitos pela Cloud API:
// audio/aac, audio/mp4, audio/mpeg, audio/amr, audio/ogg (codec opus).
async function uploadMedia(buffer, mime) {
  const boundary = '----atilabot' + Date.now().toString(16);
  const ext = (mime.split('/')[1] || 'bin').split(';')[0];
  const cabeca = Buffer.from(
    `--${boundary}\r\nContent-Disposition: form-data; name="messaging_product"\r\n\r\nwhatsapp\r\n` +
    `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="audio.${ext}"\r\nContent-Type: ${mime}\r\n\r\n`
  );
  const rodape = Buffer.from(`\r\n--${boundary}--\r\n`);
  const corpo = Buffer.concat([cabeca, buffer, rodape]);

  const res = await fetch(`https://graph.facebook.com/${GRAPH_VERSION}/${META_PHONE_NUMBER_ID}/media`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${META_ACCESS_TOKEN}`,
      'Content-Type': `multipart/form-data; boundary=${boundary}`,
    },
    body: corpo,
  });
  if (!res.ok) throw new Error(`Falha ao subir mídia: ${await res.text()}`);
  const json = await res.json();
  return json.id;
}

// Envia um áudio já hospedado na Meta (media id retornado por uploadMedia).
async function sendAudio(to, mediaId) {
  await enviarPayload({
    messaging_product: 'whatsapp',
    to,
    type: 'audio',
    audio: { id: mediaId },
  });
}

module.exports = { sendText, sendButtons, sendList, parseIncoming, baixarMedia, uploadMedia, sendAudio };
