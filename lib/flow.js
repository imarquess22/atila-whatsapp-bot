const { getSession, saveSession, estadoPadrao, comMenuPrincipal: sessaoComMenuPrincipal, humanTakeoverAtivo } = require('./session');
const { findClienteByPhone, createClienteMinimo } = require('./clientes');
const agenda = require('./agendamentos');
const { parseDataBR } = require('./util');
const { DURACAO_PADRAO_MIN } = require('./constants');
const { registrarAcesso } = require('./audit');
const menus = require('./menus');

// Converte "3" -> 3 se for um número válido entre 1 e max, senão null.
function parseEscolha(texto, max) {
  const n = parseInt(String(texto || '').trim(), 10);
  if (!Number.isInteger(n) || n < 1 || n > max) return null;
  return n;
}

function ehVoltar(texto) {
  return String(texto || '').trim() === '0';
}

// Sempre normaliza a resposta final para o formato { texto, interactive|null }.
function normalizar(resposta) {
  if (resposta == null) return null;
  if (typeof resposta === 'string') return { texto: resposta, interactive: null };
  return resposta;
}

// Calcula a grade de horários livres para um profissional numa data digitada em texto livre (DD/MM/AAAA).
// Retorna { ok: true, data, slots } | { ok: false, resposta } (resposta já pronta para reenviar, mantendo o passo atual).
async function calcularSlotsPorTexto(profissionalId, textoData, duracao = DURACAO_PADRAO_MIN) {
  const parsed = parseDataBR(textoData);
  if (!parsed.ok) return { ok: false, resposta: parsed.erro };
  const { bloqueado, slots } = await agenda.slotsDisponiveis(profissionalId, parsed.data, duracao);
  if (bloqueado) {
    return { ok: false, resposta: `${menus.erroGenerico(bloqueado.motivo + '.')} Digite outra data (DD/MM/AAAA) ou "0" para voltar ao menu.` };
  }
  if (!slots.length) {
    return { ok: false, resposta: menus.listaSlots([], parsed.data) };
  }
  return { ok: true, data: parsed.data, slots };
}

async function tratarMenuPrincipal(session, cliente, texto) {
  switch (texto.trim()) {
    case '1': {
      const profs = await agenda.fetchProfissionaisAtivos();
      if (!profs.length) return { resposta: menus.comMenuPrincipal('No momento não há profissionais disponíveis para agendamento.', cliente.nome) };
      session.context.profissionaisOferecidos = profs.map(p => ({ id: p.id, nome: p.nome }));
      session.step = 'agendar_profissional';
      return { resposta: menus.listaProfissionais(session.context.profissionaisOferecidos) };
    }
    case '2': {
      const futuros = await agenda.listarFuturos(cliente.id);
      const todosProfs = await agenda.fetchTodosProfissionais();
      const porId = Object.fromEntries(todosProfs.map(p => [p.id, p]));
      const lista = menus.listaAgendamentos(futuros, porId, {
        titulo: 'Seus próximos agendamentos:',
        vazio: 'Você não tem agendamentos futuros no momento.',
        comEscolha: false,
      });
      return { resposta: menus.comMenuPrincipal(lista, cliente.nome) };
    }
    case '3': {
      const futuros = await agenda.listarFuturos(cliente.id);
      if (!futuros.length) return { resposta: menus.comMenuPrincipal('Você não tem agendamentos futuros para remarcar.', cliente.nome) };
      const todosProfs = await agenda.fetchTodosProfissionais();
      const porId = Object.fromEntries(todosProfs.map(p => [p.id, p]));
      session.context.agendamentosListados = futuros.map(a => ({ id: a.id, data: a.data, hora: a.hora, duracao: a.duracao || DURACAO_PADRAO_MIN, profissionalId: a.profissionalId, profissionalNome: porId[a.profissionalId]?.nome || 'Profissional' }));
      session.step = 'remarcar_escolher';
      return { resposta: menus.listaAgendamentos(futuros, porId, { titulo: 'Qual agendamento você quer remarcar?', comEscolha: true }) };
    }
    case '4': {
      const futuros = await agenda.listarFuturos(cliente.id);
      if (!futuros.length) return { resposta: menus.comMenuPrincipal('Você não tem agendamentos futuros para cancelar.', cliente.nome) };
      const todosProfs = await agenda.fetchTodosProfissionais();
      const porId = Object.fromEntries(todosProfs.map(p => [p.id, p]));
      session.context.agendamentosListados = futuros.map(a => ({ id: a.id, data: a.data, hora: a.hora, duracao: a.duracao || DURACAO_PADRAO_MIN, profissionalId: a.profissionalId, profissionalNome: porId[a.profissionalId]?.nome || 'Profissional' }));
      session.step = 'cancelar_escolher';
      return { resposta: menus.listaAgendamentos(futuros, porId, { titulo: 'Qual agendamento você quer cancelar?', comEscolha: true }) };
    }
    case '5': {
      session.humanTakeover = true;
      session.humanTakeoverAt = new Date().toISOString();
      session.step = 'human_takeover';
      return { resposta: menus.atendenteAcionado() };
    }
    default:
      return { resposta: menus.naoEntendi(menus.menuPrincipal(cliente.nome)) };
  }
}

async function tratarAgendarProfissional(session, texto) {
  const profs = session.context.profissionaisOferecidos || [];
  if (ehVoltar(texto)) { const s = sessaoComMenuPrincipal(session); return { session: s, voltarMenu: true }; }
  const n = parseEscolha(texto, profs.length);
  if (!n) return { resposta: menus.naoEntendi(menus.listaProfissionais(profs)) };
  const escolhido = profs[n - 1];
  session.context.profissionalId = escolhido.id;
  session.context.profissionalNome = escolhido.nome;
  session.step = 'agendar_data';
  return { resposta: menus.pedirData() };
}

async function tratarAgendarData(session, texto) {
  if (ehVoltar(texto)) { const s = sessaoComMenuPrincipal(session); return { session: s, voltarMenu: true }; }
  const r = await calcularSlotsPorTexto(session.context.profissionalId, texto);
  if (!r.ok) return { resposta: r.resposta };
  session.context.data = r.data;
  session.context.slotsOferecidos = r.slots;
  session.step = 'agendar_horario';
  return { resposta: menus.listaSlots(r.slots, r.data) };
}

async function tratarAgendarHorario(session, texto) {
  const slots = session.context.slotsOferecidos || [];
  if (ehVoltar(texto)) { const s = sessaoComMenuPrincipal(session); return { session: s, voltarMenu: true }; }
  const n = parseEscolha(texto, slots.length);
  if (!n) return { resposta: menus.naoEntendi(menus.listaSlots(slots, session.context.data)) };
  session.context.hora = slots[n - 1];
  session.context.duracao = DURACAO_PADRAO_MIN;
  session.step = 'agendar_confirmar';
  return { resposta: menus.confirmarAgendamento({ profissionalNome: session.context.profissionalNome, data: session.context.data, hora: session.context.hora, duracao: session.context.duracao }) };
}

async function tratarAgendarConfirmar(session, cliente, texto) {
  if (ehVoltar(texto)) { const s = sessaoComMenuPrincipal(session); return { session: s, voltarMenu: true }; }
  if (texto.trim() !== '1') {
    return { resposta: menus.naoEntendi(menus.confirmarAgendamento({ profissionalNome: session.context.profissionalNome, data: session.context.data, hora: session.context.hora, duracao: session.context.duracao })) };
  }
  const { profissionalId, profissionalNome, data, hora, duracao } = session.context;
  const resultado = await agenda.criar({ clienteId: cliente.id, profissionalId, data, hora, duracao });
  const s = sessaoComMenuPrincipal(session);
  if (!resultado.ok) {
    return { session: s, resposta: menus.comMenuPrincipal(menus.erroGenerico(resultado.erro), cliente.nome) };
  }
  await registrarAcesso('criar', { entidade: 'agendamento', descricao: `${cliente.nome} c/ ${profissionalNome} em ${data} ${hora} (via WhatsApp)` });
  return { session: s, resposta: menus.comMenuPrincipal(menus.agendamentoCriado({ profissionalNome, data, hora }), cliente.nome) };
}

async function tratarRemarcarEscolher(session, texto) {
  const lista = session.context.agendamentosListados || [];
  if (ehVoltar(texto)) { const s = sessaoComMenuPrincipal(session); return { session: s, voltarMenu: true }; }
  const n = parseEscolha(texto, lista.length);
  if (!n) return { resposta: menus.naoEntendi('Responda com o número do agendamento, ou "0" para voltar ao menu.') };
  const escolhido = lista[n - 1];
  session.context.agendamentoSelecionadoId = escolhido.id;
  session.context.profissionalId = escolhido.profissionalId;
  session.context.profissionalNome = escolhido.profissionalNome;
  session.context.duracao = escolhido.duracao || DURACAO_PADRAO_MIN;
  session.step = 'remarcar_data';
  return { resposta: menus.pedirData() };
}

async function tratarRemarcarData(session, texto) {
  if (ehVoltar(texto)) { const s = sessaoComMenuPrincipal(session); return { session: s, voltarMenu: true }; }
  const r = await calcularSlotsPorTexto(session.context.profissionalId, texto, session.context.duracao || DURACAO_PADRAO_MIN);
  if (!r.ok) return { resposta: r.resposta };
  session.context.data = r.data;
  session.context.slotsOferecidos = r.slots;
  session.step = 'remarcar_horario';
  return { resposta: menus.listaSlots(r.slots, r.data) };
}

async function tratarRemarcarHorario(session, texto) {
  const slots = session.context.slotsOferecidos || [];
  if (ehVoltar(texto)) { const s = sessaoComMenuPrincipal(session); return { session: s, voltarMenu: true }; }
  const n = parseEscolha(texto, slots.length);
  if (!n) return { resposta: menus.naoEntendi(menus.listaSlots(slots, session.context.data)) };
  session.context.hora = slots[n - 1];
  session.step = 'remarcar_confirmar';
  return { resposta: menus.confirmarAgendamento({ profissionalNome: session.context.profissionalNome, data: session.context.data, hora: session.context.hora, duracao: session.context.duracao }) };
}

async function tratarRemarcarConfirmar(session, cliente, texto) {
  if (ehVoltar(texto)) { const s = sessaoComMenuPrincipal(session); return { session: s, voltarMenu: true }; }
  if (texto.trim() !== '1') {
    return { resposta: menus.naoEntendi(menus.confirmarAgendamento({ profissionalNome: session.context.profissionalNome, data: session.context.data, hora: session.context.hora, duracao: session.context.duracao })) };
  }
  const { agendamentoSelecionadoId, profissionalNome, data, hora } = session.context;
  const resultado = await agenda.reagendar(agendamentoSelecionadoId, data, hora);
  const s = sessaoComMenuPrincipal(session);
  if (!resultado.ok) {
    return { session: s, resposta: menus.comMenuPrincipal(menus.erroGenerico(resultado.erro), cliente.nome) };
  }
  await registrarAcesso('editar', { entidade: 'agendamento', descricao: `${cliente.nome} remarcado c/ ${profissionalNome} para ${data} ${hora} (via WhatsApp)` });
  return { session: s, resposta: menus.comMenuPrincipal(menus.reagendamentoConfirmado({ profissionalNome, data, hora }), cliente.nome) };
}

async function tratarCancelarEscolher(session, texto) {
  const lista = session.context.agendamentosListados || [];
  if (ehVoltar(texto)) { const s = sessaoComMenuPrincipal(session); return { session: s, voltarMenu: true }; }
  const n = parseEscolha(texto, lista.length);
  if (!n) return { resposta: menus.naoEntendi('Responda com o número do agendamento, ou "0" para voltar ao menu.') };
  const escolhido = lista[n - 1];
  session.context.agendamentoSelecionadoId = escolhido.id;
  session.context.profissionalNome = escolhido.profissionalNome;
  session.context.data = escolhido.data;
  session.context.hora = escolhido.hora;
  session.step = 'cancelar_confirmar';
  return { resposta: menus.confirmarCancelamento({ profissionalNome: escolhido.profissionalNome, data: escolhido.data, hora: escolhido.hora }) };
}

async function tratarCancelarConfirmar(session, cliente, texto) {
  if (ehVoltar(texto)) { const s = sessaoComMenuPrincipal(session); return { session: s, voltarMenu: true }; }
  if (texto.trim() !== '1') {
    return { resposta: menus.naoEntendi(menus.confirmarCancelamento({ profissionalNome: session.context.profissionalNome, data: session.context.data, hora: session.context.hora })) };
  }
  const { agendamentoSelecionadoId } = session.context;
  const resultado = await agenda.cancelar(agendamentoSelecionadoId);
  const s = sessaoComMenuPrincipal(session);
  if (!resultado.ok) {
    return { session: s, resposta: menus.comMenuPrincipal(menus.erroGenerico(resultado.erro), cliente.nome) };
  }
  await registrarAcesso('editar', { entidade: 'agendamento', descricao: `${cliente.nome} cancelou agendamento (via WhatsApp)` });
  return { session: s, resposta: menus.comMenuPrincipal(menus.cancelamentoConfirmado(), cliente.nome) };
}

// Ponto de entrada único: processa uma mensagem recebida e retorna { texto, interactive }
// (ou null se o bot não deve responder nada — ex: mensagem duplicada, ou atendimento humano ativo).
async function handleIncoming({ from, msgId, text }) {
  const phone = from;
  let session = await getSession(phone);

  // Dedup: a Meta pode reentregar o mesmo webhook mais de uma vez.
  if (msgId && session.lastProcessedMsgId === msgId) return null;

  const textoOriginal = text || '';
  const textoLimpo = textoOriginal.trim();
  const textoLower = textoLimpo.toLowerCase();

  const finalizar = async (resposta) => {
    session.lastProcessedMsgId = msgId || session.lastProcessedMsgId;
    await saveSession(phone, session);
    return normalizar(resposta);
  };

  // Atalho universal: "menu" sempre reinicia e tira do modo atendente humano.
  if (textoLower === 'menu') {
    const cliente = await findClienteByPhone(phone);
    session = sessaoComMenuPrincipal(session);
    if (!cliente) {
      session.step = 'aguardando_nome_cadastro';
      return finalizar(menus.saudacaoNovoCliente());
    }
    return finalizar(menus.menuPrincipal(cliente.nome));
  }

  if (humanTakeoverAtivo(session)) {
    return finalizar(null);
  }

  let cliente = await findClienteByPhone(phone);

  // Cliente desconhecida -> cadastro automático (pede o nome antes de liberar o menu)
  if (!cliente) {
    if (session.step !== 'aguardando_nome_cadastro') {
      session = estadoPadrao();
      session.step = 'aguardando_nome_cadastro';
      return finalizar(menus.saudacaoNovoCliente());
    }
    if (!textoLimpo) {
      return finalizar('Por favor, digite seu nome completo para concluirmos seu cadastro.');
    }
    cliente = await createClienteMinimo(textoLimpo, phone);
    await registrarAcesso('criar', { entidade: 'cliente', descricao: `${cliente.nome} (cadastro automático via WhatsApp)` });
    session = sessaoComMenuPrincipal(session);
    return finalizar(menus.comMenuPrincipal(`Prazer, ${cliente.nome}! Cadastro feito. ✅`, cliente.nome));
  }

  let resultado;
  switch (session.step) {
    case 'idle':
    case 'menu_principal':
    case 'human_takeover':
      resultado = await tratarMenuPrincipal(session, cliente, textoLimpo);
      break;
    case 'agendar_profissional':
      resultado = await tratarAgendarProfissional(session, textoLimpo);
      break;
    case 'agendar_data':
      resultado = await tratarAgendarData(session, textoLimpo);
      break;
    case 'agendar_horario':
      resultado = await tratarAgendarHorario(session, textoLimpo);
      break;
    case 'agendar_confirmar':
      resultado = await tratarAgendarConfirmar(session, cliente, textoLimpo);
      break;
    case 'remarcar_escolher':
      resultado = await tratarRemarcarEscolher(session, textoLimpo);
      break;
    case 'remarcar_data':
      resultado = await tratarRemarcarData(session, textoLimpo);
      break;
    case 'remarcar_horario':
      resultado = await tratarRemarcarHorario(session, textoLimpo);
      break;
    case 'remarcar_confirmar':
      resultado = await tratarRemarcarConfirmar(session, cliente, textoLimpo);
      break;
    case 'cancelar_escolher':
      resultado = await tratarCancelarEscolher(session, textoLimpo);
      break;
    case 'cancelar_confirmar':
      resultado = await tratarCancelarConfirmar(session, cliente, textoLimpo);
      break;
    default:
      session.step = 'menu_principal';
      resultado = { resposta: menus.menuPrincipal(cliente.nome) };
  }

  if (resultado.session) session = resultado.session;
  let resposta = resultado.resposta;
  if (resultado.voltarMenu) resposta = menus.menuPrincipal(cliente.nome);

  return finalizar(resposta);
}

module.exports = { handleIncoming };
