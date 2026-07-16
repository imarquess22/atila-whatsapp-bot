// Versão servidor do sbGet/sbUpsert/sbPatch do index.html, usando a service_role key
// (nunca a anon key) — roda só no backend, nunca é exposta ao navegador.

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

function headers(extra = {}) {
  return {
    apikey: SUPABASE_SERVICE_KEY,
    Authorization: 'Bearer ' + SUPABASE_SERVICE_KEY,
    ...extra,
  };
}

function assertConfigured() {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
    throw new Error('SUPABASE_URL/SUPABASE_SERVICE_KEY não configurados nas variáveis de ambiente.');
  }
}

async function sbGet(tabela, query = '') {
  assertConfigured();
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${tabela}?${query}`, {
    method: 'GET',
    headers: headers({ Accept: 'application/json' }),
  });
  if (!res.ok) throw new Error(`Erro ao buscar ${tabela}: ${await res.text()}`);
  return res.json();
}

// Insere uma ou mais linhas. `linhas` já deve vir no formato [{ id, dados }, ...]
async function sbInsert(tabela, linhas) {
  assertConfigured();
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${tabela}`, {
    method: 'POST',
    headers: headers({
      'Content-Type': 'application/json',
      Prefer: 'resolution=merge-duplicates,return=minimal',
    }),
    body: JSON.stringify(Array.isArray(linhas) ? linhas : [linhas]),
  });
  if (!res.ok) throw new Error(`Erro ao inserir em ${tabela}: ${await res.text()}`);
}

// PATCH parcial por id. `campos` é o corpo enviado (ex: { dados: {...} } ou { dados: {...}, checkin_at: ... })
async function sbPatch(tabela, id, campos) {
  assertConfigured();
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${tabela}?id=eq.${encodeURIComponent(id)}`, {
    method: 'PATCH',
    headers: headers({ 'Content-Type': 'application/json', Accept: 'application/json' }),
    body: JSON.stringify(campos),
  });
  if (!res.ok) throw new Error(`Erro ao atualizar ${tabela}: ${await res.text()}`);
}

// O app (index.html) nunca apaga uma linha de verdade quando você exclui algo pela tela — ele
// marca dados._deleted = '*' (tombstone) e mantém a linha, pra próxima sincronização saber que
// precisa remover em todo lugar. Quem lê essas tabelas (inclusive o próprio app) precisa ignorar
// essas linhas como se não existissem; senão o bot volta a "lembrar" de clientes/agendamentos já
// excluídos no portal. `deleted` (coluna própria, fora de `dados`) cobre o caso de alguém marcar a
// exclusão direto no SQL Editor do Supabase, sem passar pelo app.
function naoDeletado(linha) {
  return linha?.dados?._deleted !== '*' && linha?.deleted !== '*';
}

module.exports = { sbGet, sbInsert, sbPatch, naoDeletado };
