const { sbGet, sbInsert, naoDeletado } = require('./supabase');
const { uid, normalizePhone } = require('./util');

// Busca todos os clientes e acha o que tem o telefone igual (comparando só os dígitos),
// já que clientes.tel é texto livre no app principal (pode ter parênteses, traço, espaço).
// Ignora clientes excluídos no portal (tombstone) — senão o bot trata um cadastro apagado
// como se ainda existisse e nunca refaz o cadastro automático.
async function findClienteByPhone(phoneDigits) {
  const linhas = await sbGet('clientes', 'select=dados');
  const encontrada = linhas
    .filter(naoDeletado)
    .map(l => l.dados)
    .find(c => c?.tel && normalizePhone(c.tel) === phoneDigits);
  return encontrada || null;
}

// Cria um cliente mínimo (nome + nascimento + telefone), no mesmo formato de salvarCliente()
// do index.html. CPF/endereço ficam em branco — o studio completa depois pelo app, se precisar.
async function createClienteMinimo(nome, phoneDigits, nascimento = '') {
  const cliente = {
    id: uid(),
    nome,
    cpf: '',
    nascimento,
    tel: phoneDigits,
    email: '',
    status: 'ativo',
    obs: 'Cadastrado automaticamente via bot do WhatsApp',
    domicilio: false,
    endRua: '', endNum: '', endComp: '', endBairro: '', endCidade: '', endCep: '',
  };
  await sbInsert('clientes', [{ id: cliente.id, dados: cliente }]);
  return cliente;
}

module.exports = { findClienteByPhone, createClienteMinimo };
