if (sessionStorage.getItem('autenticado') !== 'true') window.location.href = 'login.html';

const API_URL = '';
const cobrancaId = new URLSearchParams(window.location.search).get('id');

const mensagemDetalhe = document.getElementById('mensagemDetalhe');
const detalheCorpo = document.getElementById('detalheCorpo');
const elClienteNome = document.getElementById('detalheClienteNome');
const elClienteTelefone = document.getElementById('detalheClienteTelefone');
const elStatusAtraso = document.getElementById('detalheStatusAtraso');
const elVendaId = document.getElementById('detalheVendaId');
const elVencimento = document.getElementById('detalheVencimento');
const elValorOriginal = document.getElementById('detalheValorOriginal');
const elJuros = document.getElementById('detalheJuros');
const elValorAtualizado = document.getElementById('detalheValorAtualizado');
const inputPercentualJuros = document.getElementById('inputPercentualJuros');
const btnAplicarJuros = document.getElementById('btnAplicarJuros');
const avisoStatusTexto = document.getElementById('avisoStatusTexto');
const btnAvisarWhatsapp = document.getElementById('btnAvisarWhatsapp');
const selectMetodoPagamento = document.getElementById('selectMetodoPagamento');
const btnConfirmarPagamento = document.getElementById('btnConfirmarPagamento');
const btnGerarBoleto = document.getElementById('btnGerarBoleto');

let percentualAtual = 0;

function dinheiro(valor) {
  return Number(valor).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function formatarData(valor) {
  const bruto = String(valor || '');
  const dataBase = bruto.includes('T') ? bruto.slice(0, 10) : bruto;
  return new Date(`${dataBase}T12:00:00`).toLocaleDateString('pt-BR');
}

function mostrarMensagem(texto, erro = false) {
  mensagemDetalhe.textContent = texto;
  mensagemDetalhe.classList.toggle('mensagem-erro', erro);
}

function atualizarAvisoStatus(enviadoEm) {
  if (enviadoEm) {
    avisoStatusTexto.textContent = `✓ Aviso enviado em ${new Date(enviadoEm).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}`;
    avisoStatusTexto.className = 'aviso-enviado-badge';
  } else {
    avisoStatusTexto.textContent = 'Ainda não avisado';
    avisoStatusTexto.className = 'aviso-pendente-badge';
  }
}

function preencher(cobranca) {
  elClienteNome.textContent = cobranca.cliente_nome;
  elClienteTelefone.textContent = cobranca.telefone || 'Sem telefone cadastrado';
  elStatusAtraso.textContent = `Atrasada há ${cobranca.dias_atraso} dia(s)`;
  elVendaId.textContent = `#${cobranca.id}`;
  elVencimento.textContent = formatarData(cobranca.vencimento);
  elValorOriginal.textContent = dinheiro(cobranca.total);
  elJuros.textContent = dinheiro(cobranca.juros);
  elValorAtualizado.textContent = dinheiro(cobranca.total_atualizado);

  percentualAtual = Number(cobranca.total) > 0 ? (Number(cobranca.juros) / Number(cobranca.total)) * 100 : 0;
  inputPercentualJuros.value = percentualAtual > 0 ? percentualAtual.toFixed(1) : '';

  atualizarAvisoStatus(cobranca.aviso_enviado_em);

  if (!cobranca.telefone) {
    btnAvisarWhatsapp.disabled = true;
  }
}

async function carregar() {
  if (!cobrancaId) {
    mostrarMensagem('Cobrança não informada.', true);
    return;
  }

  try {
    const resposta = await fetch(`${API_URL}/cobrancas/${cobrancaId}/detalhe`);
    const cobranca = await resposta.json();
    if (!resposta.ok) throw new Error(cobranca.err || 'Cobrança não encontrada');

    detalheCorpo.hidden = false;
    preencher(cobranca);
  } catch (err) {
    mostrarMensagem(err.message, true);
  }
}

btnAplicarJuros.addEventListener('click', async () => {
  const percentual = Number.parseFloat(inputPercentualJuros.value);
  if (!Number.isFinite(percentual) || percentual < 0 || percentual > 100) {
    mostrarMensagem('Informe um percentual de juros válido (0 a 100).', true);
    return;
  }

  btnAplicarJuros.disabled = true;
  try {
    const resposta = await fetch(`${API_URL}/cobrancas/${cobrancaId}/juros`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ percentual })
    });
    const resultado = await resposta.json();
    if (!resposta.ok) throw new Error(resultado.err || 'Não foi possível aplicar os juros');

    percentualAtual = percentual;
    elJuros.textContent = dinheiro(resultado.juros);
    elValorAtualizado.textContent = dinheiro(resultado.total_atualizado);
    mostrarMensagem('Juros aplicados com sucesso.');
  } catch (err) {
    mostrarMensagem(err.message, true);
  } finally {
    btnAplicarJuros.disabled = false;
  }
});

btnAvisarWhatsapp.addEventListener('click', async () => {
  btnAvisarWhatsapp.disabled = true;
  const textoOriginal = btnAvisarWhatsapp.textContent;
  btnAvisarWhatsapp.textContent = 'Enviando...';
  try {
    const resposta = await fetch(`${API_URL}/cobrancas/${cobrancaId}/whatsapp`, { method: 'POST' });
    const resultado = await resposta.json();
    if (!resposta.ok) throw new Error(resultado.err || 'Falha ao enviar aviso pelo WhatsApp');

    atualizarAvisoStatus(resultado.enviado_em);
    mostrarMensagem('Aviso enviado pelo WhatsApp com sucesso.');
  } catch (err) {
    mostrarMensagem(err.message, true);
  } finally {
    btnAvisarWhatsapp.disabled = false;
    btnAvisarWhatsapp.textContent = textoOriginal;
  }
});

btnConfirmarPagamento.addEventListener('click', async () => {
  const metodoPagamento = selectMetodoPagamento.value;
  if (!confirm(`Confirmar pagamento da venda #${cobrancaId} como ${metodoPagamento}?`)) return;

  btnConfirmarPagamento.disabled = true;
  try {
    const resposta = await fetch(`${API_URL}/cobrancas/${cobrancaId}/pagar`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        comJuros: percentualAtual > 0,
        percentual: percentualAtual,
        metodoPagamento
      })
    });
    const resultado = await resposta.json();
    if (!resposta.ok) throw new Error(resultado.err || 'Não foi possível confirmar o pagamento');

    window.open(`${API_URL}/vendas/${resultado.id}/comprovante`, '_blank');
    mostrarMensagem('Pagamento confirmado e comprovante gerado.');
    detalheCorpo.hidden = true;
  } catch (err) {
    mostrarMensagem(err.message, true);
    btnConfirmarPagamento.disabled = false;
  }
});

btnGerarBoleto.addEventListener('click', async () => {
  btnGerarBoleto.disabled = true;
  const textoOriginal = btnGerarBoleto.textContent;
  btnGerarBoleto.textContent = 'Gerando...';
  try {
    const resposta = await fetch(`${API_URL}/cobrancas/${cobrancaId}/asaas`, { method: 'POST' });
    const resultado = await resposta.json();
    if (!resposta.ok) throw new Error(resultado.err || 'Não foi possível gerar o boleto');

    const link = resultado.bankSlipUrl || resultado.invoiceUrl;
    mostrarMensagem('Boleto gerado com sucesso.');
    if (link) window.open(link, '_blank');
  } catch (err) {
    mostrarMensagem(err.message, true);
  } finally {
    btnGerarBoleto.disabled = false;
    btnGerarBoleto.textContent = textoOriginal;
  }
});

document.getElementById('btnVoltar').addEventListener('click', () => { window.location.href = 'cobrancas.html'; });
carregar();
