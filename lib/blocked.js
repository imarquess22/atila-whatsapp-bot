const { sbGet } = require('./supabase');

// Busca todas as datas/dias bloqueados cadastrados (feriados, recessos, bloqueios pontuais/parciais).
async function carregarDiasBloqueados() {
  const linhas = await sbGet('dias_bloqueados', 'select=dados');
  return linhas.map(l => l.dados);
}

// Port exato de encontrarBloqueioData() do index.html.
function encontrarBloqueioData(diasBloqueados, dateStr) {
  const d = new Date(dateStr + 'T12:00:00');
  const mmdd = dateStr.slice(5);
  const dow = d.getDay();
  return diasBloqueados.find(b =>
    b.semanal ? b.diaSemana === dow : (b.recorrente ? b.data === mmdd : b.data === dateStr)
  );
}

// Port exato de isDiaBloqueado() do index.html.
// Retorna { motivo, tipo } se a data (ou o horário informado) estiver bloqueada, ou null.
function isDiaBloqueado(diasBloqueados, dateStr, hora = null) {
  if (!dateStr) return null;
  const d = new Date(dateStr + 'T12:00:00');
  if (d.getDay() === 0) return { motivo: 'Domingo', tipo: 'domingo' };
  const bloqueio = encontrarBloqueioData(diasBloqueados, dateStr);
  if (!bloqueio) return null;
  if (bloqueio.tipo === 'parcial') {
    if (hora != null && hora >= bloqueio.horaDe && hora < bloqueio.horaAte) {
      return { motivo: `${bloqueio.descricao} (bloqueado das ${bloqueio.horaDe} às ${bloqueio.horaAte})`, tipo: 'parcial' };
    }
    return null;
  }
  return { motivo: bloqueio.descricao, tipo: bloqueio.tipo };
}

module.exports = { carregarDiasBloqueados, encontrarBloqueioData, isDiaBloqueado };
