const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });
const BASE_URL = process.env.ASAAS_BASE_URL || 'https://api-sandbox.asaas.com/v3';
const API_KEY = String(process.env.ASAAS_API_KEY || '').trim();

function extrairMensagemErro(corpo, fallback) {
  if (Array.isArray(corpo?.errors) && corpo.errors.length > 0) {
    return corpo.errors.map((erro) => erro.description || erro.code).filter(Boolean).join('; ');
  }
  if (typeof corpo?.message === 'string' && corpo.message.trim()) return corpo.message;
  if (typeof corpo?.error === 'string' && corpo.error.trim()) return corpo.error;
  return fallback;
}

async function asaasRequest(path, options = {}) {
  if (!API_KEY) {
    throw new Error('ASAAS_API_KEY não configurada no server/.env');
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 20000);

  let resposta;
  try {
    resposta = await fetch(`${BASE_URL}${path}`, {
      ...options,
      headers: {
        access_token: API_KEY,
        'Content-Type': 'application/json',
        ...(options.headers || {})
      },
      signal: controller.signal
    });
  } catch (err) {
    if (err?.name === 'AbortError') {
      throw new Error('Tempo limite ao consultar Asaas (20s)');
    }
    throw new Error(`Falha de conexão com Asaas: ${err.message}`);
  } finally {
    clearTimeout(timeout);
  }

  const respostaTexto = await resposta.text();
  let corpo = {};
  if (respostaTexto) {
    try {
      corpo = JSON.parse(respostaTexto);
    } catch {
      corpo = { raw: respostaTexto };
    }
  }

  if (!resposta.ok) {
    const fallback = `Erro na API Asaas (HTTP ${resposta.status})`;
    const mensagem = extrairMensagemErro(corpo, fallback);
    throw new Error(mensagem);
  }

  return corpo;
}

async function criarOuLocalizarCliente(cliente) {
  const cpfCnpj = String(cliente.cpf || '').replace(/\D/g, '');
  if (!cpfCnpj) throw new Error('O cliente precisa ter CPF/CNPJ para cobrança Asaas');

  const encontrados = await asaasRequest(`/customers?cpfCnpj=${encodeURIComponent(cpfCnpj)}`);
  if (encontrados.data?.[0]) return encontrados.data[0];

  return asaasRequest('/customers', {
    method: 'POST',
    body: JSON.stringify({
      name: cliente.nome,
      cpfCnpj,
      phone: String(cliente.telefone || '').replace(/\D/g, '') || undefined
    })
  });
}

async function criarCobranca(cliente, valor, descricao) {
  const clienteAsaas = await criarOuLocalizarCliente(cliente);
  return asaasRequest('/payments', {
    method: 'POST',
    body: JSON.stringify({
      customer: clienteAsaas.id,
      billingType: 'BOLETO',
      value: Number(valor),
      dueDate: new Date().toISOString().slice(0, 10),
      description: descricao,
      externalReference: `venda-${cliente.id}-${Date.now()}`
    })
  });
}

async function criarCobrancaUnica(cliente, valor, descricao, grupoId) {
  const clienteAsaas = await criarOuLocalizarCliente(cliente);
  const dataVencimento = new Date();
  dataVencimento.setDate(dataVencimento.getDate() + 30);

  return asaasRequest('/payments', {
    method: 'POST',
    body: JSON.stringify({
      customer: clienteAsaas.id,
      billingType: 'BOLETO',
      value: Math.round(Number(valor) * 100) / 100,
      dueDate: dataVencimento.toISOString().slice(0, 10),
      description: descricao,
      externalReference: grupoId
    })
  });
}

async function consultarCobranca(paymentId) {
  return asaasRequest(`/payments/${encodeURIComponent(paymentId)}`);
}

module.exports = { criarCobranca, criarCobrancaUnica, consultarCobranca };
