if (sessionStorage.getItem('autenticado') !== 'true') window.location.href = 'login.html';

const API_URL = '';
const lista = document.getElementById('listaClientesPrazo');
const vazio = document.getElementById('prazoVazio');
const mensagem = document.getElementById('mensagemPrazo');
const quantidadeClientes = document.getElementById('quantidadeClientes');

function dinheiro(valor) { return Number(valor).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }); }

function normalizarDataVencimento(vencimento) {
  if (!vencimento) return null;
  const bruto = String(vencimento);
  const dataBase = bruto.includes('T') ? bruto.slice(0, 10) : bruto;
  const data = new Date(`${dataBase}T12:00:00`);
  if (Number.isNaN(data.getTime())) return null;
  data.setHours(0, 0, 0, 0);
  return data;
}

function infoAtraso(vencimento) {
  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);
  const dataVencimento = normalizarDataVencimento(vencimento);
  if (!dataVencimento) {
    return {
      texto: 'Sem vencimento definido',
      classe: 'vencimento-sem-data'
    };
  }
  const diffMs = dataVencimento.getTime() - hoje.getTime();
  const diffDias = Math.round(diffMs / 86400000);

  if (diffDias < 0) {
    const diasAtraso = Math.abs(diffDias);
    return {
      texto: `Atrasada há ${diasAtraso} dia(s)`,
      classe: 'vencimento-atrasado'
    };
  }

  if (diffDias === 0) {
    return {
      texto: 'Vence hoje',
      classe: 'vencimento-hoje'
    };
  }

  return {
    texto: `Faltam ${diffDias} dia(s)`,
    classe: 'vencimento-futuro'
  };
}

function atualizarTotalSelecionado(clienteId) {
  const checks = [...lista.querySelectorAll(`.venda-prazo-check[data-cliente="${clienteId}"]:checked`)];
  const total = checks.reduce((acumulado, check) => {
    return acumulado + Number(check.closest('.venda-prazo-linha').dataset.total || 0);
  }, 0);
  const campoTotal = lista.querySelector(`.total-selecionado-prazo[data-cliente="${clienteId}"]`);
  if (campoTotal) {
    campoTotal.textContent = `Total selecionado: ${dinheiro(total)}`;
  }
}

async function carregar() {
  const resposta = await fetch(`${API_URL}/cobrancas-prazo`);
  const clientes = await resposta.json();
  lista.innerHTML = '';
  quantidadeClientes.textContent = clientes.length;
  vazio.hidden = clientes.length > 0;

  clientes.forEach((cliente) => {
    const card = document.createElement('article');
    card.className = 'cliente-prazo-card';
    card.innerHTML = `<div class="cliente-prazo-header"><strong>${cliente.nome}</strong><span>${cliente.vendas.length} compra(s) pendente(s)</span></div>`;

    const vendasOrdenadas = [...cliente.vendas].sort((a, b) => {
      const dataA = normalizarDataVencimento(a.vencimento)?.getTime() ?? Number.POSITIVE_INFINITY;
      const dataB = normalizarDataVencimento(b.vencimento)?.getTime() ?? Number.POSITIVE_INFINITY;
      return dataA - dataB;
    });

    vendasOrdenadas.forEach((venda) => {
      const dataVencimento = normalizarDataVencimento(venda.vencimento);
      const data = dataVencimento ? dataVencimento.toLocaleDateString('pt-BR') : 'Sem vencimento';
      const atraso = infoAtraso(venda.vencimento);
      const linha = document.createElement('label');
      linha.className = 'venda-prazo-linha';
      linha.dataset.total = Number(venda.valor_aberto ?? (Number(venda.total) + Number(venda.juros)));
      linha.innerHTML = `
        <input type="checkbox" class="venda-prazo-check" value="${venda.id}" data-cliente="${cliente.id}">
        <span>Compra do dia ${venda.numero_venda_dia || '-'} · ${data}</span>
        <b>${dinheiro(venda.valor_aberto ?? (Number(venda.total) + Number(venda.juros)))}</b>
        <small class="status-vencimento ${atraso.classe}">${atraso.texto}</small>
        <small><span class="texto-subtraido">Subtraído: ${dinheiro(venda.valor_pago || 0)}</span> · ${(venda.itens || []).map((item) => `${item.quantidade}x ${item.nome}`).join(', ')}</small>
      `;
      card.appendChild(linha);
    });

    const acoes = document.createElement('div');
    acoes.className = 'cobranca-prazo-acoes';
    acoes.innerHTML = `
      <label><input type="checkbox" class="selecionar-todas" data-cliente="${cliente.id}"> Selecionar todas</label>
      <span class="total-selecionado-prazo" data-cliente="${cliente.id}">Total selecionado: ${dinheiro(0)}</span>
      <input type="number" class="valor-cobranca-prazo" data-cliente="${cliente.id}" min="0.01" step="0.01" placeholder="Valor total ou parcial">
      <select class="metodo-cobranca-prazo" data-cliente="${cliente.id}" aria-label="Método de pagamento">
        <option value="dinheiro">Dinheiro</option>
        <option value="pix">PIX</option>
        <option value="cartao_credito">Cartão de crédito</option>
        <option value="cartao_debito">Cartão de débito</option>
        <option value="boleto">Boleto</option>
      </select>
      <button type="button" class="btn-asaas gerar-boleto-prazo" data-cliente="${cliente.id}" hidden>Gerar boleto Asaas</button>
      <button type="button" class="btn-finalizar-prazo" data-cliente="${cliente.id}">Finalizar venda</button>
    `;
    card.appendChild(acoes);
    lista.appendChild(card);
  });

  lista.querySelectorAll('.selecionar-todas').forEach((marcador) => {
    marcador.addEventListener('change', () => {
      lista.querySelectorAll(`.venda-prazo-check[data-cliente="${marcador.dataset.cliente}"]`).forEach((check) => { check.checked = marcador.checked; });
      atualizarTotalSelecionado(marcador.dataset.cliente);
    });
  });

  lista.querySelectorAll('.venda-prazo-check').forEach((check) => {
    check.addEventListener('change', () => {
      const clienteId = check.dataset.cliente;
      const totalChecks = lista.querySelectorAll(`.venda-prazo-check[data-cliente="${clienteId}"]`).length;
      const marcados = lista.querySelectorAll(`.venda-prazo-check[data-cliente="${clienteId}"]:checked`).length;
      const selecionarTodas = lista.querySelector(`.selecionar-todas[data-cliente="${clienteId}"]`);
      if (selecionarTodas) {
        selecionarTodas.checked = totalChecks > 0 && marcados === totalChecks;
      }
      atualizarTotalSelecionado(clienteId);
    });
  });

  lista.querySelectorAll('.metodo-cobranca-prazo').forEach((seletor) => {
    seletor.addEventListener('change', () => {
      const botao = lista.querySelector(`.gerar-boleto-prazo[data-cliente="${seletor.dataset.cliente}"]`);
      const finalizar = lista.querySelector(`.btn-finalizar-prazo[data-cliente="${seletor.dataset.cliente}"]`);
      botao.hidden = seletor.value !== 'boleto';
      finalizar.hidden = seletor.value === 'boleto';
    });
  });

  lista.querySelectorAll('.gerar-boleto-prazo').forEach((botao) => {
    botao.addEventListener('click', async () => {
      const vendaIds = [...lista.querySelectorAll(`.venda-prazo-check[data-cliente="${botao.dataset.cliente}"]:checked`)].map((check) => check.value);
      const valorCampo = lista.querySelector(`.valor-cobranca-prazo[data-cliente="${botao.dataset.cliente}"]`);
      if (vendaIds.length === 0) {
        mensagem.textContent = 'Selecione ao menos uma venda antes de informar o valor ou gerar o boleto.';
        mensagem.classList.add('mensagem-erro');
        return;
      }

      mensagem.classList.remove('mensagem-erro');

      botao.disabled = true;
      const resposta = await fetch(`${API_URL}/cobrancas-prazo/asaas`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clienteId: botao.dataset.cliente, vendaIds, valor: valorCampo.value.trim() })
      });
      const resultado = await resposta.json();
      botao.disabled = false;
      if (!resposta.ok) { mensagem.textContent = resultado.err; return; }

      const cobranca = resultado.cobrancas[0];
      const totalSelecionado = [...lista.querySelectorAll(`.venda-prazo-check[data-cliente="${botao.dataset.cliente}"]:checked`)]
        .reduce((total, check) => total + Number(check.closest('.venda-prazo-linha').dataset.total), 0);
      const saldoNaoCobrado = Math.max(totalSelecionado - Number(resultado.total), 0);
      mensagem.innerHTML = `<span>Boleto gerado: ${dinheiro(resultado.total)}. Valor subtraído da dívida: ${dinheiro(resultado.total)}. Saldo não cobrado: ${dinheiro(saldoNaoCobrado)}.</span><span class="lista-botoes-boleto"><a class="btn-boleto-asaas" href="${cobranca.bankSlipUrl || cobranca.invoiceUrl}" target="_blank" rel="noopener"><span aria-hidden="true">▣</span> Abrir boleto</a></span>`;
    });
  });

  lista.querySelectorAll('.btn-finalizar-prazo').forEach((botao) => {
    botao.addEventListener('click', async () => {
      const vendaIds = [...lista.querySelectorAll(`.venda-prazo-check[data-cliente="${botao.dataset.cliente}"]:checked`)].map((check) => check.value);
      const metodo = lista.querySelector(`.metodo-cobranca-prazo[data-cliente="${botao.dataset.cliente}"]`).value;
      if (vendaIds.length === 0) {
        mensagem.textContent = 'Selecione ao menos uma venda para finalizar.';
        mensagem.classList.add('mensagem-erro');
        return;
      }

      if (!confirm(`Confirmar pagamento de ${vendaIds.length} venda(s) como ${metodo}?`)) return;
      botao.disabled = true;
      const resposta = await fetch(`${API_URL}/cobrancas-prazo/finalizar`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clienteId: botao.dataset.cliente, vendaIds, metodoPagamento: metodo })
      });
      const resultado = await resposta.json();
      botao.disabled = false;
      if (!resposta.ok) { mensagem.textContent = resultado.err; return; }

      window.open(`${API_URL.replace('/vendas', '')}/vendas/${resultado.vendaIds[0]}/comprovante`, '_blank');
      mensagem.textContent = 'Venda finalizada e comprovante gerado.';
      carregar();
    });
  });
}

document.getElementById('btnVoltar').addEventListener('click', () => { window.location.href = 'hub.html'; });
carregar();
