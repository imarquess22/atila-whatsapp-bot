// Mesma grade de horários usada na tela "Grade de Horários" do index.html: 07:00 às 21:00, a cada 30min.
const GRID_SLOTS = [
  '07:00','07:30','08:00','08:30','09:00','09:30','10:00','10:30',
  '11:00','11:30','12:00','12:30','13:00','13:30','14:00','14:30',
  '15:00','15:30','16:00','16:30','17:00','17:30','18:00','18:30',
  '19:00','19:30','20:00','20:30','21:00',
];

const DURACAO_PADRAO_MIN = 60;
const TIMEZONE = 'America/Sao_Paulo';
const HUMAN_TAKEOVER_TTL_MIN = 60;

// As listas clicáveis do WhatsApp aceitam no máximo 10 linhas no total — por isso cada MAX_*
// abaixo já reserva espaço para a linha extra de "↩️ Voltar ao menu" (e, na de dias, também
// para a linha "➡️ Mais dias"). Nunca usar esses números sem contar essas linhas extras.
const MAX_SLOTS_LISTADOS = 9;         // + 1 linha "Voltar" = 10
const MAX_AGENDAMENTOS_LISTADOS = 8;  // + 1 linha "Voltar" = 9 (folga proposital)
const MAX_PROFISSIONAIS_LISTADOS = 9; // + 1 linha "Voltar" = 10
const MAX_PROCEDIMENTOS_LISTADOS = 9; // + 1 linha "Voltar" = 10
const DIAS_POR_PAGINA = 8;            // + "Mais dias" + "Voltar" = 10

module.exports = {
  GRID_SLOTS,
  DURACAO_PADRAO_MIN,
  TIMEZONE,
  HUMAN_TAKEOVER_TTL_MIN,
  MAX_SLOTS_LISTADOS,
  MAX_AGENDAMENTOS_LISTADOS,
  MAX_PROFISSIONAIS_LISTADOS,
  MAX_PROCEDIMENTOS_LISTADOS,
  DIAS_POR_PAGINA,
};
