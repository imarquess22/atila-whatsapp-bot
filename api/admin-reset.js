const { getSession, saveSession, comMenuPrincipal } = require('../lib/session');
const { normalizePhone } = require('../lib/util');

// Endpoint simples para o studio "devolver" uma conversa ao bot depois de um atendimento humano.
// Uso: abrir no navegador  https://SEU-DOMINIO.vercel.app/api/admin-reset?phone=11999999999&secret=SEU_ADMIN_SECRET
module.exports = async function handler(req, res) {
  if (req.method !== 'GET') {
    res.status(405).end();
    return;
  }

  const url = new URL(req.url, 'http://localhost');
  const secret = url.searchParams.get('secret');
  const phoneRaw = url.searchParams.get('phone');

  if (!process.env.ADMIN_SECRET || secret !== process.env.ADMIN_SECRET) {
    res.status(401).json({ ok: false, erro: 'Secret inválido.' });
    return;
  }
  if (!phoneRaw) {
    res.status(400).json({ ok: false, erro: 'Informe ?phone=DDDNUMERO na URL.' });
    return;
  }

  const phone = normalizePhone(phoneRaw);
  const session = await getSession(phone);
  const resetado = comMenuPrincipal(session);
  resetado.humanTakeover = false;
  resetado.humanTakeoverAt = null;
  await saveSession(phone, resetado);

  res.status(200).json({ ok: true, mensagem: `Conversa com ${phone} devolvida ao bot.` });
};
