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
const MAX_SLOTS_LISTADOS = 12;
const MAX_AGENDAMENTOS_LISTADOS = 8;

module.exports = {
  GRID_SLOTS,
  DURACAO_PADRAO_MIN,
  TIMEZONE,
  HUMAN_TAKEOVER_TTL_MIN,
  MAX_SLOTS_LISTADOS,
  MAX_AGENDAMENTOS_LISTADOS,
};
