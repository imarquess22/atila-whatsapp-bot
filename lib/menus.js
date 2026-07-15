const { fmtDataBR } = require('./util');

const NOME_STUDIO = 'Átila Gomes Academy';

// Convenção usada em todo este arquivo: um "menu" é sempre um objeto { texto, interactive }.
// `texto` é o fallback simples (também usado no histórico de mensagens).
// `interactive` é `{ tipo:'list', textoBotao, linhas }` ou `{ tipo:'buttons', botoes }` ou `null`
// quando a próxima resposta esperada é texto livre (data, nome etc.).

function saudacaoNovoCliente() {
  return `Olá! 👋 Sou o assistente virtual da ${NOME_STUDIO}.\n\nNão encontramos seu cadastro por aqui. Qual é o seu nome completo?`;
}

function menuPrincipal(nome) {
  const opcoes = [
    { id: '1', titulo: 'Agendar horário', descricao: 'Marcar um novo atendimento' },
    { id: '2', titulo: 'Ver agendamentos', descricao: 'Ver seus horários marcados' },
    { id: '3', titulo: 'Remarcar horário', descricao: 'Mudar data/hora de um agendamento' },
    { id: '4', titulo: 'Cancelar horário', descricao: 'Cancelar um agendamento' },
    { id: '5', titulo: 'Falar com atendente', descricao: 'Conversar com uma pessoa' },
  ];
  const texto = `Olá, ${nome}! 👋 Como posso ajudar?\n\n` +
    opcoes.map(o => `${o.id}️⃣ ${o.titulo}`).join('\n') +
    `\n\nResponda só com o número da opção.`;
  return { texto, interactive: { tipo: 'list', corpo: `Olá, ${nome}! 👋 Como posso ajudar?`, textoBotao: 'Ver opções', linhas: opcoes } };
}

// Combina um texto informativo com o menu principal logo em seguida (padrão usado depois de
// concluir qualquer ação: agendar, ver, remarcar, cancelar, erros etc.)
function comMenuPrincipal(textoInformativo, nome) {
  const menu = menuPrincipal(nome);
  return { texto: `${textoInformativo}\n\n${menu.texto}`, interactive: menu.interactive };
}

// Re-exibe um menu (string ou objeto {texto,interactive}) prefixado com um aviso de "não entendi".
function naoEntendi(menuOuTexto) {
  if (typeof menuOuTexto === 'string') {
    return { texto: `Desculpe, não entendi. 🙏\n\n${menuOuTexto}`, interactive: null };
  }
  return { texto: `Desculpe, não entendi. 🙏\n\n${menuOuTexto.texto}`, interactive: menuOuTexto.interactive };
}

function listaProfissionais(profissionais) {
  if (!profissionais.length) {
    return 'No momento não há profissionais disponíveis. Tente novamente mais tarde.';
  }
  const linhas = profissionais.map((p, i) => ({ id: String(i + 1), titulo: p.nome }));
  linhas.push({ id: '0', titulo: '↩️ Voltar ao menu' });
  const texto = `Com qual profissional você quer agendar?\n\n` +
    profissionais.map((p, i) => `${i + 1}️⃣ ${p.nome}`).join('\n') +
    `\n\nResponda com o número.`;
  return { texto, interactive: { tipo: 'list', corpo: 'Com qual profissional você quer agendar?', textoBotao: 'Escolher', linhas } };
}

function pedirData() {
  return 'Para qual dia? Digite a data no formato DD/MM/AAAA (ex: 15/07/2026).';
}

function listaSlots(slots, dataStr) {
  if (!slots.length) {
    return `Não há horários livres em ${fmtDataBR(dataStr)} para esse profissional. Digite outra data (DD/MM/AAAA) ou "0" para voltar ao menu.`;
  }
  const linhas = slots.map((h, i) => ({ id: String(i + 1), titulo: h }));
  linhas.push({ id: '0', titulo: '↩️ Voltar ao menu' });
  const texto = `Horários livres em ${fmtDataBR(dataStr)}:\n\n` +
    slots.map((h, i) => `${i + 1}️⃣ ${h}`).join('\n') +
    `\n\nResponda com o número do horário desejado.`;
  return { texto, interactive: { tipo: 'list', corpo: `Horários livres em ${fmtDataBR(dataStr)}:`, textoBotao: 'Escolher horário', linhas } };
}

function confirmarAgendamento({ profissionalNome, data, hora, duracao }) {
  const texto = `Confirma o agendamento?\n\n` +
    `👤 Profissional: ${profissionalNome}\n` +
    `📅 Data: ${fmtDataBR(data)}\n` +
    `🕐 Horário: ${hora} (${duracao}min)\n\n` +
    `Responda 1 para confirmar ou 0 para cancelar.`;
  const corpo = `Confirma o agendamento?\n\n👤 ${profissionalNome}\n📅 ${fmtDataBR(data)}\n🕐 ${hora} (${duracao}min)`;
  return {
    texto,
    interactive: { tipo: 'buttons', corpo, botoes: [{ id: '1', titulo: '✅ Confirmar' }, { id: '0', titulo: '❌ Cancelar' }] },
  };
}

function agendamentoCriado({ profissionalNome, data, hora }) {
  return `Prontinho! ✅ Seu horário está agendado:\n\n📅 ${fmtDataBR(data)} às ${hora}\n👤 Com ${profissionalNome}\n\nAté breve!`;
}

function listaAgendamentos(agendamentos, profissionaisPorId, { titulo, vazio, comEscolha }) {
  if (!agendamentos.length) return vazio;
  const statusTxt = { agendado: 'Agendado', confirmado: 'Confirmado', em_atendimento: 'Em atendimento', realizado: 'Realizado', falta: 'Falta' };
  const itens = agendamentos.map((a, i) => {
    const prof = profissionaisPorId[a.profissionalId]?.nome || 'Profissional';
    return { i, prof, statusLabel: statusTxt[a.status] || a.status };
  });
  const texto = `${titulo}\n\n` +
    itens.map(it => `${it.i + 1}️⃣ ${fmtDataBR(agendamentos[it.i].data)} às ${agendamentos[it.i].hora} — ${it.prof} (${it.statusLabel})`).join('\n') +
    (comEscolha ? '\n\nResponda com o número do agendamento, ou "0" para voltar ao menu.' : '\n\nDigite "0" para voltar ao menu.');

  if (!comEscolha) return texto;

  const linhas = itens.map(it => ({
    id: String(it.i + 1),
    titulo: `${fmtDataBR(agendamentos[it.i].data)} ${agendamentos[it.i].hora}`,
    descricao: `${it.prof} — ${it.statusLabel}`,
  }));
  linhas.push({ id: '0', titulo: '↩️ Voltar ao menu' });
  return { texto, interactive: { tipo: 'list', corpo: titulo, textoBotao: 'Escolher', linhas } };
}

function confirmarCancelamento({ profissionalNome, data, hora }) {
  const corpo = `Tem certeza que quer cancelar o horário de ${fmtDataBR(data)} às ${hora} com ${profissionalNome}?`;
  const texto = `${corpo}\n\nResponda 1 para confirmar ou 0 para voltar.`;
  return {
    texto,
    interactive: { tipo: 'buttons', corpo, botoes: [{ id: '1', titulo: '✅ Confirmar' }, { id: '0', titulo: '↩️ Voltar' }] },
  };
}

function cancelamentoConfirmado() {
  return 'Seu agendamento foi cancelado. 🗓️ Se quiser marcar outro horário, é só me chamar!';
}

function reagendamentoConfirmado({ profissionalNome, data, hora }) {
  return `Pronto! Seu horário foi remarcado: ✅\n\n📅 ${fmtDataBR(data)} às ${hora}\n👤 Com ${profissionalNome}`;
}

function atendenteAcionado() {
  return 'Ok! Um atendente vai continuar a conversa por aqui. 🙋\n\nSe quiser voltar a falar com o assistente automático a qualquer momento, é só mandar "menu".';
}

function erroGenerico(mensagem) {
  return `⚠️ ${mensagem}`;
}

module.exports = {
  NOME_STUDIO,
  saudacaoNovoCliente,
  menuPrincipal,
  comMenuPrincipal,
  naoEntendi,
  listaProfissionais,
  pedirData,
  listaSlots,
  confirmarAgendamento,
  agendamentoCriado,
  listaAgendamentos,
  confirmarCancelamento,
  cancelamentoConfirmado,
  reagendamentoConfirmado,
  atendenteAcionado,
  erroGenerico,
};
