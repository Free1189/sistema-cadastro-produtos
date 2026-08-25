if (sessionStorage.getItem('autenticado') !== 'true') {
  window.location.href = 'login.html';
}

const API_URL = 'http://localhost:3000';
const mensagemCaixa = document.getElementById('mensagemCaixa');
const vendasPendentes = document.getElementById('vendasPendentes');
const caixaVazio = document.getElementById('caixaVazio');

function dinheiro(valor) {
  return Number(valor).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

async function carregarPendentes() {
  const resposta = await fetch(`${API_URL}/vendas/pendentes`);
  const vendas = await resposta.json();
  vendasPendentes.innerHTML = '';
  caixaVazio.hidden = vendas.length > 0;

  vendas.forEach((venda, indice) => {
    const numeroDiario = venda.numero_venda_dia || indice + 1;
    const card = document.createElement('article');
    card.className = 'venda-pendente-card';
    card.innerHTML = `
      <div><strong>Venda do dia ${numeroDiario}</strong><span>${venda.cliente_nome}</span><b>${dinheiro(venda.total)}</b></div>
      <select class="metodo-pendente" data-id="${venda.id}">
        <option value="dinheiro">Dinheiro</option><option value="pix">PIX</option>
        <option value="cartao_debito">Cartão de débito</option><option value="cartao_credito">Cartão de crédito</option>
      </select>
      <input class="documento-pendente" data-id="${venda.id}" placeholder="CPF/CNPJ opcional">
      <div class="acoes-pendente">
        <button type="button" class="btn-salvar finalizar-venda" data-id="${venda.id}">Finalizar venda</button>
        <button type="button" class="btn-cancelar-pendente" data-id="${venda.id}">Cancelar venda</button>
      </div>
    `;
    vendasPendentes.appendChild(card);
  });

  vendasPendentes.querySelectorAll('.finalizar-venda').forEach((botao) => {
    botao.addEventListener('click', () => finalizarVenda(botao.dataset.id));
  });

  vendasPendentes.querySelectorAll('.btn-cancelar-pendente').forEach((botao) => {
    botao.addEventListener('click', () => cancelarVenda(botao.dataset.id));
  });
}

async function finalizarVenda(id) {
  const metodo = document.querySelector(`.metodo-pendente[data-id="${id}"]`).value;
  const documento = document.querySelector(`.documento-pendente[data-id="${id}"]`).value;
  const resposta = await fetch(`${API_URL}/vendas/${id}/finalizar`, {
    method: 'PUT', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ metodoPagamento: metodo, documento })
  });
  const resultado = await resposta.json();
  if (!resposta.ok) {
    mensagemCaixa.textContent = resultado.err;
    mensagemCaixa.classList.add('mensagem-erro');
    return;
  }

  const comprovante = await fetch(`${API_URL}/caixa/comprovante`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      valor: Number(resultado.total),
      descricao: `Venda - ${resultado.cliente_nome}`,
      metodoPagamento: metodo,
      documento
    })
  });

  if (comprovante.ok) {
    const arquivo = await comprovante.blob();
    const url = URL.createObjectURL(arquivo);
    window.open(url, '_blank', 'noopener');
    setTimeout(() => URL.revokeObjectURL(url), 120000);
  }

  mensagemCaixa.classList.remove('mensagem-erro');
  mensagemCaixa.textContent = 'Venda finalizada com sucesso.';
  carregarPendentes();
}

async function cancelarVenda(id) {
  if (!confirm('Cancelar esta venda pendente? Esta ação não gera movimentação de caixa.')) return;

  const resposta = await fetch(`${API_URL}/vendas/${id}/cancelar`, { method: 'DELETE' });
  const resultado = await resposta.json().catch(() => ({}));

  if (!resposta.ok) {
    mensagemCaixa.textContent = resultado.err || 'Não foi possível cancelar a venda.';
    mensagemCaixa.classList.add('mensagem-erro');
    return;
  }

  mensagemCaixa.classList.remove('mensagem-erro');
  mensagemCaixa.textContent = 'Venda cancelada com sucesso.';
  carregarPendentes();
}

carregarPendentes();

document.getElementById('btnVoltar').addEventListener('click', () => {
  window.location.href = 'hub.html';
});
