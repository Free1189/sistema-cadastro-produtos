if (sessionStorage.getItem('autenticado') !== 'true') {
  window.location.href = 'login.html';
}

const API_URL = '';
const listaClientes = document.getElementById('listaClientesDevolucao');
const devolucoesVazio = document.getElementById('devolucoesVazio');
const produtosDevolucao = document.getElementById('produtosDevolucao');
const listaProdutos = document.getElementById('listaProdutosDevolucao');
const clienteSelecionado = document.getElementById('clienteSelecionado');
const mensagem = document.getElementById('mensagemDevolucao');
const buscaCliente = document.getElementById('buscaClienteDevolucao');
let clientes = [];
let clienteAtual = null;

function dinheiro(valor) {
  return Number(valor).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

async function carregarClientes() {
  const resposta = await fetch(`${API_URL}/devolucoes/clientes?busca=${encodeURIComponent(buscaCliente.value.trim())}`);
  clientes = await resposta.json();
  listaClientes.innerHTML = '';
  devolucoesVazio.hidden = clientes.length > 0;

  clientes.forEach((cliente) => {
    const card = document.createElement('button');
    card.type = 'button';
    card.className = 'cliente-devolucao-card';
    card.innerHTML = `<strong>${cliente.nome}</strong><span>${cliente.produtos.length} produto(s) disponível(is)</span>`;
    card.addEventListener('click', () => selecionarCliente(cliente));
    listaClientes.appendChild(card);
  });
}

buscaCliente.addEventListener('input', carregarClientes);
buscaCliente.addEventListener('keydown', (evento) => {
  if (evento.key !== 'Enter') return;
  evento.preventDefault();
  const primeiraOpcao = listaClientes.querySelector('.cliente-devolucao-card');
  if (primeiraOpcao) primeiraOpcao.click();
});

function selecionarCliente(cliente) {
  clienteAtual = cliente;
  clienteSelecionado.textContent = `Produtos de ${cliente.nome}`;
  listaProdutos.innerHTML = '';
  produtosDevolucao.hidden = false;

  cliente.produtos.forEach((produto) => {
    const linha = document.createElement('div');
    linha.className = 'produto-devolucao-item';
    linha.innerHTML = `
      <div><strong>${produto.nome}</strong><span>Código ${produto.id} · Disponível: ${produto.quantidade}</span></div>
      <input type="number" min="0" max="${produto.quantidade}" value="0" data-produto-id="${produto.id}">
    `;
    listaProdutos.appendChild(linha);
  });
}

document.getElementById('btnConfirmarDevolucao').addEventListener('click', async () => {
  const itens = [...listaProdutos.querySelectorAll('input')]
    .map((input) => ({ produtoId: input.dataset.produtoId, quantidade: Number.parseInt(input.value, 10) || 0 }))
    .filter((item) => item.quantidade > 0);

  if (!clienteAtual || itens.length === 0) {
    mensagem.textContent = 'Informe ao menos um produto para devolver.';
    return;
  }

  const resposta = await fetch(`${API_URL}/devolucoes`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ clienteId: clienteAtual.id, itens })
  });
  const resultado = await resposta.json();
  mensagem.textContent = resultado.err || resultado.mensagem;
  if (resposta.ok) {
    produtosDevolucao.hidden = true;
    clienteAtual = null;
    carregarClientes();
  }
});

document.getElementById('btnTrocarCliente').addEventListener('click', () => {
  produtosDevolucao.hidden = true;
  clienteAtual = null;
});

document.getElementById('btnVoltar').addEventListener('click', () => {
  window.location.href = 'hub.html';
});

carregarClientes();
