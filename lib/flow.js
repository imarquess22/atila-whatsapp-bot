const { getSession, saveSession, estadoPadrao, comMenuPrincipal: sessaoComMenuPrincipal, humanTakeoverAtivo } = require('./session');
const { findClienteByPhone, createClienteMinimo } = require('./clientes');
const agenda = require('./agendamentos');
const { mesAtualEProximo, parseNascimentoBR } = require('./util');
const { DURACAO_PADRAO_MIN, MAX_PROFISSIONAIS_LISTADOS, MAX_PROCEDIMENTOS_LISTADOS, DIAS_POR_PAGINA, HORARIOS_POR_PAGINA } = require('./constants');
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

async function tratarMenuPrincipal(session, cliente, texto, phone) {
  switch (texto.trim()) {
    case '1': {
      const profs = await agenda.fetchProfissionaisAtivos();
      if (!profs.length) return { resposta: menus.comMenuPrincipal('No momento não há profissionais disponíveis para agendamento.', cliente.nome) };
      if (profs.length === 1) {
        // só tem 1 profissional ativo -> pula direto pra escolha de procedimento
        session.context.profissionalId = profs[0].id;
        session.context.profissionalNome = profs[0].nome;
        return irParaProcedimento(session);
      }
      session.context.profissionaisOferecidos = profs.slice(0, MAX_PROFISSIONAIS_LISTADOS).map(p => ({ id: p.id, nome: p.nome }));
      session.step = 'agendar_profissional';
      return { resposta: menus.listaProfissionais(session.context.profissionaisOferecidos) };
    }
    case '2': {
      const futuros = await agenda.listarFuturos(cliente.id);
      if (!futuros.length) {
        return { resposta: menus.comMenuPrincipal('Você não tem agendamentos, mas podemos marcar! 😊', cliente.nome) };
      }
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
      return { resposta: menus.atendenteAcionado(), notificarEstudio: { nome: cliente.nome, telefone: phone } };
    }
    case '6': {
      const procedimentos = await agenda.fetchProcedimentos();
      return { resposta: menus.comMenuPrincipal(menus.tabelaPrecos(procedimentos), cliente.nome) };
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
  return irParaProcedimento(session);
}

// Busca os procedimentos cadastrados (Planos Disponíveis) e pergunta qual deles a cliente quer.
// Se não houver nenhum cadastrado, segue direto com a duração padrão (não trava o agendamento).
async function irParaProcedimento(session) {
  const todosProcedimentos = await agenda.fetchProcedimentos();
  if (!todosProcedimentos.length) {
    session.context.procedimentoId = null;
    session.context.procedimentoNome = null;
    session.context.duracao = DURACAO_PADRAO_MIN;
    return irParaMes(session, 'agendar_mes');
  }
  const procedimentos = todosProcedimentos.slice(0, MAX_PROCEDIMENTOS_LISTADOS);
  session.context.procedimentosOferecidos = procedimentos;
  session.step = 'agendar_procedimento';
  return { resposta: menus.listaProcedimentos(procedimentos) };
}

async function tratarAgendarProcedimento(session, texto) {
  if (ehVoltar(texto)) { const s = sessaoComMenuPrincipal(session); return { session: s, voltarMenu: true }; }
  const procs = session.context.procedimentosOferecidos || [];
  const n = parseEscolha(texto, procs.length);
  if (!n) return { resposta: menus.naoEntendi(menus.listaProcedimentos(procs)) };
  const escolhido = procs[n - 1];
  session.context.procedimentoId = escolhido.id;
  session.context.procedimentoNome = escolhido.nome;
  session.context.duracao = escolhido.duracaoMin || DURACAO_PADRAO_MIN;
  return irParaMes(session, 'agendar_mes');
}

// Pergunta "este mês ou o mês que vem". `proximoStep`: 'agendar_mes' | 'remarcar_mes'.
function irParaMes(session, proximoStep) {
  const meses = mesAtualEProximo();
  session.context.mesesOferecidos = meses;
  session.step = proximoStep;
  return { resposta: menus.escolherMes(meses) };
}

// Monta (ou remonta, ao paginar) a página atual da lista de dias com horário livre.
function montarPaginaDias(session) {
  const dias = session.context.diasDisponiveis || [];
  const offset = session.context.diasOffset || 0;
  const pagina = dias.slice(offset, offset + DIAS_POR_PAGINA);
  const temMais = offset + DIAS_POR_PAGINA < dias.length;
  session.context.diasPagina = pagina;
  session.context.diasTemMais = temMais;
  const mesLabel = session.context.mesEscolhido?.label || '';
  return { resposta: menus.listaDias(pagina, mesLabel, temMais) };
}

// `proximoStep`: 'agendar_dia' | 'remarcar_dia'
async function tratarEscolherMes(session, texto, proximoStep) {
  if (ehVoltar(texto)) { const s = sessaoComMenuPrincipal(session); return { session: s, voltarMenu: true }; }
  const meses = session.context.mesesOferecidos || [];
  const n = parseEscolha(texto, meses.length);
  if (!n) return { resposta: menus.naoEntendi(menus.escolherMes(meses)) };
  const mesEscolhido = meses[n - 1];
  session.context.mesEscolhido = mesEscolhido;
  const dias = await agenda.diasComDisponibilidade(session.context.profissionalId, mesEscolhido.ano, mesEscolhido.mes, session.context.duracao || DURACAO_PADRAO_MIN);
  session.context.diasDisponiveis = dias;
  session.context.diasOffset = 0;
  session.step = proximoStep;
  return montarPaginaDias(session);
}

// `proximoStep`: 'agendar_horario' | 'remarcar_horario'
async function tratarEscolherDia(session, texto, proximoStep) {
  if (ehVoltar(texto)) { const s = sessaoComMenuPrincipal(session); return { session: s, voltarMenu: true }; }
  const pagina = session.context.diasPagina || [];
  const temMais = session.context.diasTemMais;

  if (temMais && texto.trim() === '9') {
    session.context.diasOffset = (session.context.diasOffset || 0) + DIAS_POR_PAGINA;
    return montarPaginaDias(session);
  }

  const n = parseEscolha(texto, pagina.length);
  if (!n) {
    const mesLabel = session.context.mesEscolhido?.label || '';
    return { resposta: menus.naoEntendi(menus.listaDias(pagina, mesLabel, temMais)) };
  }

  const diaEscolhido = pagina[n - 1];
  const { slots } = await agenda.slotsDisponiveis(session.context.profissionalId, diaEscolhido, session.context.duracao || DURACAO_PADRAO_MIN);
  if (!slots.length) {
    // corrida: esse dia acabou de lotar entre a listagem e a escolha — tira da lista e remonta a página
    session.context.diasDisponiveis = (session.context.diasDisponiveis || []).filter(d => d !== diaEscolhido);
    return montarPaginaDias(session);
  }

  session.context.data = diaEscolhido;
  session.context.slotsDisponiveis = slots;
  session.context.horarioOffset = 0;
  session.step = proximoStep;
  return montarPaginaHorarios(session);
}

// Monta (ou remonta, ao paginar) a página atual de horários livres do dia escolhido.
function montarPaginaHorarios(session) {
  const slots = session.context.slotsDisponiveis || [];
  const offset = session.context.horarioOffset || 0;
  const pagina = slots.slice(offset, offset + HORARIOS_POR_PAGINA);
  const temMais = offset + HORARIOS_POR_PAGINA < slots.length;
  session.context.horariosPagina = pagina;
  session.context.horariosTemMais = temMais;
  return { resposta: menus.listaSlots(pagina, session.context.data, temMais) };
}

// `proximoStep`: 'agendar_confirmar' | 'remarcar_confirmar'
async function tratarEscolherHorario(session, texto, proximoStep) {
  if (ehVoltar(texto)) {
    // Volta pra escolha de dia (não pro menu principal) — profissional/procedimento/mês já
    // escolhidos continuam no contexto, então a cliente só tenta outro dia sem refazer tudo.
    session.step = session.step === 'remarcar_horario' ? 'remarcar_dia' : 'agendar_dia';
    return montarPaginaDias(session);
  }
  const pagina = session.context.horariosPagina || [];
  const temMais = session.context.horariosTemMais;

  if (temMais && texto.trim() === '9') {
    session.context.horarioOffset = (session.context.horarioOffset || 0) + HORARIOS_POR_PAGINA;
    return montarPaginaHorarios(session);
  }

  const n = parseEscolha(texto, pagina.length);
  if (!n) return { resposta: menus.naoEntendi(menus.listaSlots(pagina, session.context.data, temMais)) };
  session.context.hora = pagina[n - 1];
  session.step = proximoStep;
  return {
    resposta: menus.confirmarAgendamento({
      profissionalNome: session.context.profissionalNome,
      procedimentoNome: session.context.procedimentoNome,
      data: session.context.data,
      hora: session.context.hora,
      duracao: session.context.duracao,
    }),
  };
}

async function tratarAgendarConfirmar(session, cliente, texto) {
  if (ehVoltar(texto)) { const s = sessaoComMenuPrincipal(session); return { session: s, voltarMenu: true }; }
  if (texto.trim() !== '1') {
    return {
      resposta: menus.naoEntendi(menus.confirmarAgendamento({
        profissionalNome: session.context.profissionalNome,
        procedimentoNome: session.context.procedimentoNome,
        data: session.context.data,
        hora: session.context.hora,
        duracao: session.context.duracao,
      })),
    };
  }
  const { profissionalId, profissionalNome, procedimentoNome, data, hora, duracao } = session.context;
  const resultado = await agenda.criar({ clienteId: cliente.id, profissionalId, data, hora, duracao, procedimentoNome });
  const s = sessaoComMenuPrincipal(session);
  if (!resultado.ok) {
    return { session: s, resposta: menus.comMenuPrincipal(menus.erroGenerico(resultado.erro), cliente.nome) };
  }
  await registrarAcesso('criar', { entidade: 'agendamento', descricao: `${cliente.nome} c/ ${profissionalNome} em ${data} ${hora} (via WhatsApp)` });

  const cfg = await agenda.fetchConfigStudio();
  const regulamento = cfg.regulamentoBot ? `\n\n${cfg.regulamentoBot}` : '';
  const textoConfirmacao = menus.agendamentoCriado({ profissionalNome, data, hora }) + regulamento;
  return { session: s, resposta: { texto: textoConfirmacao, interactive: null } };
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
  return irParaMes(session, 'remarcar_mes');
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
  return { session: s, resposta: { texto: menus.reagendamentoConfirmado({ profissionalNome, data, hora }), interactive: null } };
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
  return { session: s, resposta: { texto: menus.cancelamentoConfirmado(), interactive: null } };
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

  const finalizar = async (resposta, extra = {}) => {
    session.lastProcessedMsgId = msgId || session.lastProcessedMsgId;
    await saveSession(phone, session);
    const normalizada = normalizar(resposta);
    return normalizada ? { ...normalizada, ...extra } : normalizada;
  };

  // Atalho universal: "menu" sempre reinicia e tira do modo atendente humano.
  if (textoLower === 'menu') {
    const cliente = await findClienteByPhone(phone);
    session = sessaoComMenuPrincipal(session);
    session.humanTakeover = false;
    session.humanTakeoverAt = null;
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

  // Cliente desconhecida -> cadastro automático (pede nome, depois data de nascimento)
  if (!cliente) {
    const emCadastro = session.step === 'aguardando_nome_cadastro' || session.step === 'aguardando_nascimento_cadastro';
    if (!emCadastro) {
      session = estadoPadrao();
      session.step = 'aguardando_nome_cadastro';
      return finalizar(menus.saudacaoNovoCliente());
    }

    if (session.step === 'aguardando_nome_cadastro') {
      if (!textoLimpo) return finalizar('Por favor, digite seu nome completo para concluirmos seu cadastro.');
      session.context.novoClienteNome = textoLimpo;
      session.step = 'aguardando_nascimento_cadastro';
      return finalizar(menus.pedirNascimento(textoLimpo));
    }

    // session.step === 'aguardando_nascimento_cadastro'
    const nascimento = parseNascimentoBR(textoLimpo);
    if (!nascimento.ok) return finalizar(nascimento.erro);
    cliente = await createClienteMinimo(session.context.novoClienteNome, phone, nascimento.data);
    await registrarAcesso('criar', { entidade: 'cliente', descricao: `${cliente.nome} (cadastro automático via WhatsApp)` });
    session = sessaoComMenuPrincipal(session);
    return finalizar(menus.comMenuPrincipal(`Prazer, ${cliente.nome}! Cadastro feito. ✅`, cliente.nome));
  }

  let resultado;
  switch (session.step) {
    case 'idle':
    case 'menu_principal':
    case 'human_takeover':
      resultado = await tratarMenuPrincipal(session, cliente, textoLimpo, phone);
      break;
    case 'agendar_profissional':
      resultado = await tratarAgendarProfissional(session, textoLimpo);
      break;
    case 'agendar_procedimento':
      resultado = await tratarAgendarProcedimento(session, textoLimpo);
      break;
    case 'agendar_mes':
      resultado = await tratarEscolherMes(session, textoLimpo, 'agendar_dia');
      break;
    case 'agendar_dia':
      resultado = await tratarEscolherDia(session, textoLimpo, 'agendar_horario');
      break;
    case 'agendar_horario':
      resultado = await tratarEscolherHorario(session, textoLimpo, 'agendar_confirmar');
      break;
    case 'agendar_confirmar':
      resultado = await tratarAgendarConfirmar(session, cliente, textoLimpo);
      break;
    case 'remarcar_escolher':
      resultado = await tratarRemarcarEscolher(session, textoLimpo);
      break;
    case 'remarcar_mes':
      resultado = await tratarEscolherMes(session, textoLimpo, 'remarcar_dia');
      break;
    case 'remarcar_dia':
      resultado = await tratarEscolherDia(session, textoLimpo, 'remarcar_horario');
      break;
    case 'remarcar_horario':
      resultado = await tratarEscolherHorario(session, textoLimpo, 'remarcar_confirmar');
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

  return finalizar(resposta, resultado.notificarEstudio ? { notificarEstudio: resultado.notificarEstudio } : {});
}

module.exports = { handleIncoming };
