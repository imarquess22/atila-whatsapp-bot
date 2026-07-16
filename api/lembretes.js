const { sendText } = require('../lib/meta');
const { registrarMensagem } = require('../lib/historico');
const { sbGet, sbPatch, naoDeletado } = require('../lib/supabase');
const { fetchConfigStudio, fetchTodosProfissionais } = require('../lib/agendamentos');
const { normalizePhone, fmtDataBR } = require('../lib/util');

// São Paulo é UTC-3 fixo (sem horário de verão desde 2019).
const OFFSET_SP = '-03:00';

// Processa lembretes de atendimento: envia uma mensagem pra cliente quando faltam até X horas
// pro horário agendado (X e o texto são configuráveis em Configurações no portal). Cada
// agendamento recebe no máximo 1 lembrete (marcado em dados.lembreteEnviado).
//
// Este endpoint é idempotente e barato — pode ser chamado repetidamente. Quem chama:
// o próprio portal (a cada 5 min enquanto aberto) e/ou um cron externo apontado pra cá.
module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') { res.status(204).end(); return; }

  if (req.method !== 'POST') {
    res.status(405).json({ ok: false, erro: 'Método não permitido.' });
    return;
  }

  const { secret } = req.body || {};
  if (!process.env.PAINEL_WHATSAPP_SECRET || secret !== process.env.PAINEL_WHATSAPP_SECRET) {
    res.status(401).json({ ok: false, erro: 'Secret inválido.' });
    return;
  }

  try {
    const cfg = await fetchConfigStudio();
    const horas = parseFloat(cfg.lembreteBotHoras);
    const modelo = String(cfg.lembreteBotMsg || '').trim();
    if (!modelo || !horas || horas <= 0) {
      res.status(200).json({ ok: true, enviados: 0, motivo: 'Lembrete não configurado.' });
      return;
    }

    const [linhasAg, linhasCli, profissionais] = await Promise.all([
      sbGet('agendamentos', 'select=id,dados'),
      sbGet('clientes', 'select=dados'),
      fetchTodosProfissionais(),
    ]);
    const clientes = linhasCli.filter(naoDeletado).map(l => l.dados);
    const profPorId = Object.fromEntries(profissionais.map(p => [p.id, p]));

    const agora = Date.now();
    const enviados = [];

    for (const linha of linhasAg.filter(naoDeletado)) {
      const ag = linha.dados;
      if (!ag?.data || !ag?.hora) continue;
      if (ag.lembreteEnviado) continue;
      if (!['agendado', 'confirmado'].includes(ag.status)) continue;

      const quando = new Date(`${ag.data}T${ag.hora}:00${OFFSET_SP}`).getTime();
      const horasRestantes = (quando - agora) / 3600000;
      // Só dentro da janela: já está a menos de X horas do atendimento, mas ainda não passou.
      if (horasRestantes <= 0 || horasRestantes > horas) continue;

      const cliente = clientes.find(c => c.id === ag.clienteId);
      const tel = cliente?.tel ? normalizePhone(cliente.tel) : null;
      if (!tel) continue;

      const procedimento = (ag.obs || '').match(/^Procedimento: (.+?) —/)?.[1] || '';
      const texto = modelo
        .replaceAll('{nome}', cliente.nome || '')
        .replaceAll('{data}', fmtDataBR(ag.data))
        .replaceAll('{hora}', ag.hora)
        .replaceAll('{profissional}', profPorId[ag.profissionalId]?.nome || '')
        .replaceAll('{procedimento}', procedimento);

      try {
        await sendText(tel, texto);
        await registrarMensagem(tel, 'enviada', texto);
        await sbPatch('agendamentos', ag.id, { dados: { ...ag, lembreteEnviado: new Date().toISOString() } });
        enviados.push(ag.id);
      } catch (e) {
        // Um lembrete que falhar não deve travar os demais (nem ser marcado como enviado).
        console.error(`Erro ao enviar lembrete do agendamento ${ag.id}:`, e);
      }
    }

    res.status(200).json({ ok: true, enviados: enviados.length });
  } catch (e) {
    console.error('Erro ao processar lembretes:', e);
    res.status(500).json({ ok: false, erro: String(e.message || e) });
  }
};
