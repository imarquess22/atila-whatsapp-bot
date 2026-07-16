const { sbInsert } = require('./supabase');
const { uid } = require('./util');

// Grava uma mensagem (recebida da cliente ou enviada pelo bot) no histórico.
// Nunca deve derrubar o fluxo do bot se falhar — é só para consulta posterior no app.
// `extra`: campos adicionais mesclados no registro (ex: audioBase64/audioMime de mensagens de voz).
async function registrarMensagem(telefone, direcao, texto, extra = {}) {
  if (!texto) return;
  const registro = {
    id: uid(),
    telefone,
    direcao, // 'recebida' | 'enviada'
    texto,
    timestamp: new Date().toISOString(),
    ...extra,
  };
  try {
    await sbInsert('mensagens_whatsapp', [{ id: registro.id, dados: registro }]);
  } catch (e) {
    console.error('Erro ao gravar histórico de mensagem:', e);
  }
}

module.exports = { registrarMensagem };
