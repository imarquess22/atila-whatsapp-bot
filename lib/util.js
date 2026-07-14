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

// 'DD/MM/AAAA' -> { ok: true, data: 'YYYY-MM-DD' } | { ok: false, erro: string }
function parseDataBR(texto) {
  const m = String(texto || '').trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!m) return { ok: false, erro: 'Formato inválido. Digite a data como DD/MM/AAAA (ex: 15/07/2026).' };
  const [, dd, mm, yyyy] = m;
  const dia = parseInt(dd, 10), mes = parseInt(mm, 10), ano = parseInt(yyyy, 10);
  if (mes < 1 || mes > 12 || dia < 1 || dia > 31) {
    return { ok: false, erro: 'Data inválida. Digite a data como DD/MM/AAAA (ex: 15/07/2026).' };
  }
  const dataStr = `${ano}-${String(mes).padStart(2, '0')}-${String(dia).padStart(2, '0')}`;
  const d = new Date(dataStr + 'T12:00:00');
  if (Number.isNaN(d.getTime()) || d.getUTCDate() !== dia || (d.getUTCMonth() + 1) !== mes) {
    return { ok: false, erro: 'Essa data não existe. Confira e digite novamente (DD/MM/AAAA).' };
  }
  if (dataStr < hojeSP()) {
    return { ok: false, erro: 'Essa data já passou. Digite uma data de hoje em diante (DD/MM/AAAA).' };
  }
  return { ok: true, data: dataStr };
}

// 'YYYY-MM-DD' -> 'DD/MM/AAAA'
function fmtDataBR(dataStr) {
  if (!dataStr) return '—';
  const [ano, mes, dia] = dataStr.split('-');
  return `${dia}/${mes}/${ano}`;
}

module.exports = { uid, normalizePhone, toMin, hojeSP, horaAgoraSP, parseDataBR, fmtDataBR };
