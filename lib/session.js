const { sbGet, sbInsert } = require('./supabase');
const { HUMAN_TAKEOVER_TTL_MIN } = require('./constants');

function estadoPadrao() {
  return {
    step: 'idle',
    context: {
      profissionaisOferecidos: [],
      profissionalId: null,
      profissionalNome: null,
      procedimentosOferecidos: [],
      procedimentoId: null,
      procedimentoNome: null,
      duracao: null,
      mesesOferecidos: [],
      mesEscolhido: null,
      diasDisponiveis: [],
      diasOffset: 0,
      diasPagina: [],
      diasTemMais: false,
      data: null,
      slotsOferecidos: [],
      hora: null,
      agendamentosListados: [],
      agendamentoSelecionadoId: null,
      novoClienteNome: null,
    },
    humanTakeover: false,
    humanTakeoverAt: null,
    lastProcessedMsgId: null,
    updatedAt: new Date().toISOString(),
  };
}

// Busca o estado salvo do telefone, ou o estado padrão (idle) se nunca conversou antes.
async function getSession(phone) {
  const linhas = await sbGet('whatsapp_sessions', `id=eq.${encodeURIComponent(phone)}&select=dados`);
  if (!linhas.length) return estadoPadrao();
  // merge raso com o padrão, para tolerar sessões antigas criadas antes de novos campos existirem
  return { ...estadoPadrao(), ...linhas[0].dados, context: { ...estadoPadrao().context, ...(linhas[0].dados?.context || {}) } };
}

// Grava (insere ou atualiza) o estado da conversa daquele telefone.
async function saveSession(phone, dados) {
  const atualizado = { ...dados, updatedAt: new Date().toISOString() };
  await sbInsert('whatsapp_sessions', [{ id: phone, dados: atualizado }]);
  return atualizado;
}

// Reinicia a conversa para o menu principal, mantendo o flag de takeover como estava
// (uso interno após concluir um fluxo, ex: depois de cancelar um agendamento).
function comMenuPrincipal(session) {
  return { ...estadoPadrao(), humanTakeover: session.humanTakeover, humanTakeoverAt: session.humanTakeoverAt, lastProcessedMsgId: session.lastProcessedMsgId, step: 'menu_principal' };
}

// true se um atendente humano assumiu a conversa e o TTL ainda não expirou.
function humanTakeoverAtivo(session) {
  if (!session?.humanTakeover) return false;
  if (!session.humanTakeoverAt) return true;
  const minutosPassados = (Date.now() - new Date(session.humanTakeoverAt).getTime()) / 60000;
  return minutosPassados < HUMAN_TAKEOVER_TTL_MIN;
}

module.exports = { estadoPadrao, getSession, saveSession, comMenuPrincipal, humanTakeoverAtivo };
