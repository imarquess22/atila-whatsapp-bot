const { sbGet, sbInsert, sbPatch, naoDeletado } = require('./supabase');
const { uid, toMin, hojeSP, horaAgoraSP } = require('./util');
const { GRID_SLOTS, DURACAO_PADRAO_MIN, MAX_AGENDAMENTOS_LISTADOS } = require('./constants');
const { carregarDiasBloqueados, isDiaBloqueado } = require('./blocked');

async function fetchProfissionaisAtivos() {
  const linhas = await sbGet('profissionais', 'select=dados');
  return linhas.filter(naoDeletado).map(l => l.dados).filter(p => p?.status === 'ativo');
}

async function fetchTodosProfissionais() {
  const linhas = await sbGet('profissionais', 'select=dados');
  return linhas.filter(naoDeletado).map(l => l.dados);
}

async function fetchProfissionalPorId(id) {
  const linhas = await sbGet('profissionais', `id=eq.${encodeURIComponent(id)}&select=dados`);
  const linha = linhas.filter(naoDeletado)[0];
  return linha?.dados || null;
}

// Ignora agendamentos excluídos no portal (tombstone) — senão eles continuam contando como
// conflito de horário, aparecendo em "ver agendamentos" e ocupando vagas na agenda pro bot.
async function fetchTodosAgendamentos() {
  const linhas = await sbGet('agendamentos', 'select=id,dados');
  return linhas.filter(naoDeletado).map(l => ({ id: l.id, ...l.dados }));
}

// Configurações gerais do studio (o mesmo objeto `config` que o index.html lê/escreve).
async function fetchConfigStudio() {
  const linhas = await sbGet('config', "id=eq.main&select=dados");
  return linhas[0]?.dados || {};
}

// Procedimentos cadastrados em Configurações → Planos Disponíveis.
// Cada item: { id, nome, valor, duracaoMin }. Procedimentos antigos sem duracaoMin caem no padrão.
async function fetchProcedimentos() {
  const cfg = await fetchConfigStudio();
  const planos = cfg.planos || [];
  return planos.map(p => ({ ...p, duracaoMin: p.duracaoMin || DURACAO_PADRAO_MIN }));
}

// Port exato da checagem de sobreposição de salvarAgendamento() do index.html.
// `excluirId`: id do agendamento sendo remarcado, para não conflitar consigo mesmo.
function hasConflito(agendamentosExistentes, { profissionalId, data, hora, duracao }, excluirId = null) {
  const inicioNovo = toMin(hora);
  const fimNovo = inicioNovo + duracao;
  return agendamentosExistentes.find(x => {
    if (x.id === excluirId || x.profissionalId !== profissionalId || x.data !== data || x.status === 'cancelado') return false;
    const inicioX = toMin(x.hora);
    const fimX = inicioX + (x.duracao || 60);
    return inicioNovo < fimX && inicioX < fimNovo;
  }) || null;
}

// Cálculo puro (sem I/O) dos horários livres de um profissional num dia específico — usado tanto
// para consultar um único dia quanto, em loop, para varrer um mês inteiro (diasComDisponibilidade).
function calcularSlotsDoDia(agendamentosExistentes, diasBloqueados, profissionalId, data, duracao) {
  const bloqueioDoDia = isDiaBloqueado(diasBloqueados, data);
  if (bloqueioDoDia) return { bloqueado: bloqueioDoDia, slots: [] };

  const isHoje = data === hojeSP();
  const horaAtual = isHoje ? horaAgoraSP() : null;

  const livres = GRID_SLOTS.filter(hora => {
    if (isHoje && hora <= horaAtual) return false;
    if (isDiaBloqueado(diasBloqueados, data, hora)) return false;
    return !hasConflito(agendamentosExistentes, { profissionalId, data, hora, duracao });
  });

  return { bloqueado: null, slots: livres };
}

// Lista os horários da grade (07:00–21:00, 30 em 30 min) livres para um profissional numa data,
// considerando conflitos, bloqueios (dia inteiro/parcial) e, se for hoje, os horários que já
// passaram. Retorna a lista COMPLETA — quem chama é responsável por paginar (ver flow.js), já
// que um dia totalmente livre pode ter até 29 horários (mais do que cabe numa lista do WhatsApp).
async function slotsDisponiveis(profissionalId, data, duracao = DURACAO_PADRAO_MIN) {
  const [diasBloqueados, agendamentos] = await Promise.all([
    carregarDiasBloqueados(),
    fetchTodosAgendamentos(),
  ]);
  return calcularSlotsDoDia(agendamentos, diasBloqueados, profissionalId, data, duracao);
}

// Varre um mês inteiro (a partir de hoje, se for o mês atual) e retorna as datas 'YYYY-MM-DD' que
// têm pelo menos um horário livre para o profissional, já considerando a duração do procedimento.
// `mes` é 1-indexado (1=Janeiro). Faz só 2 buscas no Supabase, independente do tamanho do mês.
async function diasComDisponibilidade(profissionalId, ano, mes, duracao) {
  const [diasBloqueados, agendamentos] = await Promise.all([
    carregarDiasBloqueados(),
    fetchTodosAgendamentos(),
  ]);

  const hoje = hojeSP();
  const ultimoDia = new Date(ano, mes, 0).getDate(); // dia 0 do mês seguinte = último dia deste mês
  const dias = [];
  for (let d = 1; d <= ultimoDia; d++) {
    const dataStr = `${ano}-${String(mes).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    if (dataStr < hoje) continue;
    const { bloqueado, slots } = calcularSlotsDoDia(agendamentos, diasBloqueados, profissionalId, dataStr, duracao);
    if (!bloqueado && slots.length) dias.push(dataStr);
  }
  return dias;
}

// Agendamentos futuros (hoje em diante, não cancelados) de uma cliente, mais próximos primeiro.
// "Futuro" considera a HORA quando é hoje mesmo — um horário de hoje que já passou não conta
// mais como agendamento futuro (senão o bot oferecia remarcar/cancelar algo que já aconteceu).
async function listarFuturos(clienteId) {
  const todos = await fetchTodosAgendamentos();
  const hoje = hojeSP();
  const horaAtual = horaAgoraSP();
  return todos
    .filter(a => a.clienteId === clienteId && a.status !== 'cancelado'
      && (a.data > hoje || (a.data === hoje && a.hora > horaAtual)))
    .sort((a, b) => (a.data + a.hora).localeCompare(b.data + b.hora))
    .slice(0, MAX_AGENDAMENTOS_LISTADOS);
}

// Cria um novo agendamento, re-checando conflito/bloqueio na hora de gravar (evita corrida).
// Retorna { ok: true, agendamento } ou { ok: false, erro }.
async function criar({ clienteId, profissionalId, data, hora, duracao = DURACAO_PADRAO_MIN, procedimentoNome = null }) {
  const [diasBloqueados, agendamentos] = await Promise.all([
    carregarDiasBloqueados(),
    fetchTodosAgendamentos(),
  ]);

  const bloqueio = isDiaBloqueado(diasBloqueados, data, hora);
  if (bloqueio) return { ok: false, erro: `Esse dia/horário está bloqueado (${bloqueio.motivo}). Escolha outro.` };

  const conflito = hasConflito(agendamentos, { profissionalId, data, hora, duracao });
  if (conflito) return { ok: false, erro: 'Esse horário acabou de ser ocupado por outra pessoa. Escolha outro horário.' };

  const agendamento = {
    id: uid(), clienteId, profissionalId, data, hora, duracao,
    tipoAula: 'individual',
    localTipo: 'domicilio',
    enderecoDomicilio: '',
    status: 'agendado',
    recorrencia: 'nenhuma',
    obs: procedimentoNome ? `Procedimento: ${procedimentoNome} — Criado via bot do WhatsApp` : 'Criado via bot do WhatsApp',
  };
  await sbInsert('agendamentos', [{ id: agendamento.id, dados: agendamento }]);
  return { ok: true, agendamento };
}

// Remarca um agendamento existente para nova data/hora, re-checando conflito/bloqueio.
async function reagendar(id, novaData, novaHora) {
  const todos = await fetchTodosAgendamentos();
  const atual = todos.find(a => a.id === id);
  if (!atual) return { ok: false, erro: 'Agendamento não encontrado.' };

  const [diasBloqueados] = await Promise.all([carregarDiasBloqueados()]);
  const bloqueio = isDiaBloqueado(diasBloqueados, novaData, novaHora);
  if (bloqueio) return { ok: false, erro: `Esse dia/horário está bloqueado (${bloqueio.motivo}). Escolha outro.` };

  const conflito = hasConflito(todos, { profissionalId: atual.profissionalId, data: novaData, hora: novaHora, duracao: atual.duracao || DURACAO_PADRAO_MIN }, id);
  if (conflito) return { ok: false, erro: 'Esse horário acabou de ser ocupado por outra pessoa. Escolha outro horário.' };

  // 'dados' guarda o objeto inteiro (incluindo o próprio id), igual ao que o index.html salva.
  const atualizado = { ...atual, data: novaData, hora: novaHora, status: 'agendado' };
  await sbPatch('agendamentos', id, { dados: atualizado });
  return { ok: true, agendamento: { id, ...atualizado } };
}

// Cancela um agendamento (status='cancelado'), mantendo os demais campos intactos.
async function cancelar(id) {
  const todos = await fetchTodosAgendamentos();
  const atual = todos.find(a => a.id === id);
  if (!atual) return { ok: false, erro: 'Agendamento não encontrado.' };

  const atualizado = { ...atual, status: 'cancelado' };
  await sbPatch('agendamentos', id, { dados: atualizado });
  return { ok: true, agendamento: { id, ...atualizado } };
}

module.exports = {
  fetchProfissionaisAtivos,
  fetchTodosProfissionais,
  fetchProfissionalPorId,
  fetchTodosAgendamentos,
  fetchConfigStudio,
  fetchProcedimentos,
  hasConflito,
  slotsDisponiveis,
  diasComDisponibilidade,
  listarFuturos,
  criar,
  reagendar,
  cancelar,
};
