const { sbInsert } = require('./supabase');
const { uid } = require('./util');

// Port de registrarAcesso() do index.html — mesmo shape, para aparecer normalmente
// na tela de Auditoria do app, identificando que a ação veio do bot.
async function registrarAcesso(tipo, { entidade, descricao } = {}) {
  const entry = {
    id: uid(),
    tipo,
    entidade: entidade || null,
    descricao: descricao || null,
    userId: null,
    userNome: 'Bot WhatsApp',
    username: 'whatsapp-bot',
    ts: new Date().toISOString(),
    agente: 'whatsapp-bot',
  };
  try {
    await sbInsert('audit_log', [{ id: entry.id, dados: entry }]);
  } catch (e) {
    // Auditoria não deve derrubar o fluxo do bot se falhar.
    console.error('Erro ao gravar audit_log:', e);
  }
}

module.exports = { registrarAcesso };
