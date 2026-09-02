if (sessionStorage.getItem('autenticado') !== 'true') {
  window.location.href = 'login.html';
}

const API_URL = 'http://localhost:3000';
const mensagemCaixa = document.getElementById('mensagemCaixa');
const listaCaixa = document.getElementById('listaCaixa');
const caixaVazio = document.getElementById('caixaVazio');

function dinheiro(valor) {
  return Number(valor).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

async function carregarPendentes() {
  const resposta = await fetch(`${API_URL}/vendas/pendentes`);
  const vendas = await resposta.json();
  listaCaixa.innerHTML = '';
  caixaVazio.hidden = vendas.length > 0;

  vendas.forEach((venda, indice) => {
    const numeroDiario = venda.numero_venda_dia || indice + 1;
    const quantidadeItens = (venda.itens || []).reduce((soma, item) => soma + Number(item.quantidade || 0), 0);
    const card = document.createElement('article');
    card.className = 'caixa-pendente-card';
    card.innerHTML = `
      <div class="caixa-pendente-dados">
        <strong>${venda.cliente_nome}</strong>
        <span>Venda do dia ${numeroDiario} · ${quantidadeItens} item(ns)</span>
        <b>${dinheiro(venda.total)}</b>
      </div>
      <div class="caixa-pendente-acoes">
        <button type="button" class="btn-acessar-conta" data-id="${venda.id}">Acessar venda ›</button>
      </div>
    `;
    listaCaixa.appendChild(card);
  });

  listaCaixa.querySelectorAll('.btn-acessar-conta').forEach((botao) => {
    botao.addEventListener('click', () => {
      window.location.href = `caixa-detalhe.html?id=${botao.dataset.id}`;
    });
  });
}

carregarPendentes();

document.getElementById('btnVoltar').addEventListener('click', () => {
  window.location.href = 'hub.html';
});
