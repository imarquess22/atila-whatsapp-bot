const crypto = require('crypto');
const { TIMEZONE } = require('./constants');

function uid() {
  return crypto.randomUUID();
}

// Remove tudo que não é dígito — mesmo critério usado em notificarAtrasoWhatsApp() no index.html.
function normalizePhone(raw) {
  return String(raw || '').replace(/\D/g, '');
}

// 'HH:MM' -> minutos desde 00:00 (mesma fórmula de toMin() no index.html)
function toMin(hhmm) {
  const [h, m] = String(hhmm || '0:0').split(':').map(Number);
  return h * 60 + (m || 0);
}

// Data de "hoje" no fuso de São Paulo, formato 'YYYY-MM-DD'
function hojeSP() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: TIMEZONE }).format(new Date());
}

// Hora atual em São Paulo, formato 'HH:MM'
function horaAgoraSP() {
  const partes = new Intl.DateTimeFormat('en-GB', {
    timeZone: TIMEZONE, hour: '2-digit', minute: '2-digit', hour12: false,
  }).formatToParts(new Date());
  const h = partes.find(p => p.type === 'hour').value;
  const m = partes.find(p => p.type === 'minute').value;
  return `${h}:${m}`;
}

// 'YYYY-MM-DD' -> 'DD/MM/AAAA'
function fmtDataBR(dataStr) {
  if (!dataStr) return '—';
  const [ano, mes, dia] = dataStr.split('-');
  return `${dia}/${mes}/${ano}`;
}

// 'YYYY-MM-DD' -> 'DD/MM' (mais compacto, usado nas listas clicáveis)
function fmtDiaCurto(dataStr) {
  if (!dataStr) return '—';
  const [, mes, dia] = dataStr.split('-');
  return `${dia}/${mes}`;
}

const MESES_PT = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];
const DIAS_SEMANA_ABREV = ['Dom','Seg','Ter','Qua','Qui','Sex','Sáb'];

// Dia da semana abreviado de uma data 'YYYY-MM-DD'
function diaSemanaAbrev(dataStr) {
  const d = new Date(dataStr + 'T12:00:00');
  return DIAS_SEMANA_ABREV[d.getDay()];
}

// [{ano, mes, label}, {ano, mes, label}] para o mês atual e o mês seguinte, com base em "hoje" (São Paulo).
// `mes` é 1-indexado (1=Janeiro).
function mesAtualEProximo() {
  const [anoStr, mesStr] = hojeSP().split('-');
  const ano = parseInt(anoStr, 10);
  const mes = parseInt(mesStr, 10);
  const proxMes = mes === 12 ? 1 : mes + 1;
  const proxAno = mes === 12 ? ano + 1 : ano;
  return [
    { ano, mes, label: `${MESES_PT[mes - 1]}` },
    { ano: proxAno, mes: proxMes, label: `${MESES_PT[proxMes - 1]}` },
  ];
}

module.exports = {
  uid, normalizePhone, toMin, hojeSP, horaAgoraSP, fmtDataBR, fmtDiaCurto,
  diaSemanaAbrev, mesAtualEProximo, MESES_PT,
};
