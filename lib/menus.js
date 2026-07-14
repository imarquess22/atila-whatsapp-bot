const { fmtDataBR } = require('./util');

const NOME_STUDIO = 'Átila Gomes Academy';

function saudacaoNovoCliente() {
  return `Olá! 👋 Sou o assistente virtual da ${NOME_STUDIO}.\n\nNão encontramos seu cadastro por aqui. Qual é o seu nome completo?`;
}

function menuPrincipal(nome) {
  return `Olá, ${nome}! 👋 Como posso ajudar?\n\n` +
    `1️⃣ Agendar novo horário\n` +
    `2️⃣ Ver meus agendamentos\n` +
    `3️⃣ Remarcar horário\n` +
    `4️⃣ Cancelar horário\n` +
    `5️⃣ Falar com atendente\n\n` +
    `Responda só com o número da opção.`;
}

function naoEntendi(menuAtual) {
  return `Desculpe, não entendi. 🙏\n\n${menuAtual}`;
}

function listaProfissionais(profissionais) {
  if (!profissionais.length) return 'No momento não há profissionais disponíveis. Tente novamente mais tarde.';
  const linhas = profissionais.map((p, i) => `${i + 1}️⃣ ${p.nome}`).join('\n');
  return `Com qual profissional você quer agendar?\n\n${linhas}\n\nResponda com o número.`;
}

function pedirData() {
  return 'Para qual dia? Digite a data no formato DD/MM/AAAA (ex: 15/07/2026).';
}

function listaSlots(slots, dataStr) {
  if (!slots.length) {
    return `Não há horários livres em ${fmtDataBR(dataStr)} para esse profissional. Digite outra data (DD/MM/AAAA) ou "0" para voltar ao menu.`;
  }
  const linhas = slots.map((h, i) => `${i + 1}️⃣ ${h}`).join('\n');
  return `Horários livres em ${fmtDataBR(dataStr)}:\n\n${linhas}\n\nResponda com o número do horário desejado.`;
}

function confirmarAgendamento({ profissionalNome, data, hora, duracao }) {
  return `Confirma o agendamento?\n\n` +
    `👤 Profissional: ${profissionalNome}\n` +
    `📅 Data: ${fmtDataBR(data)}\n` +
    `🕐 Horário: ${hora} (${duracao}min)\n\n` +
    `Responda 1 para confirmar ou 0 para cancelar.`;
}

function agendamentoCriado({ profissionalNome, data, hora }) {
  return `Prontinho! ✅ Seu horário está agendado:\n\n📅 ${fmtDataBR(data)} às ${hora}\n👤 Com ${profissionalNome}\n\nAté breve!`;
}

function listaAgendamentos(agendamentos, profissionaisPorId, { titulo, vazio, comEscolha }) {
  if (!agendamentos.length) return vazio;
  const linhas = agendamentos.map((a, i) => {
    const prof = profissionaisPorId[a.profissionalId]?.nome || 'Profissional';
    const statusTxt = { agendado: 'Agendado', confirmado: 'Confirmado', em_atendimento: 'Em atendimento', realizado: 'Realizado', falta: 'Falta' }[a.status] || a.status;
    return `${i + 1}️⃣ ${fmtDataBR(a.data)} às ${a.hora} — ${prof} (${statusTxt})`;
  }).join('\n');
  const rodape = comEscolha ? '\n\nResponda com o número do agendamento, ou "0" para voltar ao menu.' : '\n\nDigite "0" para voltar ao menu.';
  return `${titulo}\n\n${linhas}${rodape}`;
}

function confirmarCancelamento({ profissionalNome, data, hora }) {
  return `Tem certeza que quer cancelar o horário de ${fmtDataBR(data)} às ${hora} com ${profissionalNome}?\n\nResponda 1 para confirmar ou 0 para voltar.`;
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
