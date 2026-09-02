if (sessionStorage.getItem('autenticado') !== 'true') {
  window.location.href = 'login.html';
}

const API_URL = 'http://localhost:3000';
const buscaVenda = document.getElementById('buscaVenda');
const resultadosBusca = document.getElementById('resultadosBusca');
const itensVenda = document.getElementById('itensVenda');
const carrinhoVazio = document.getElementById('carrinhoVazio');
const descontoVenda = document.getElementById('descontoVenda');
const tipoPagamento = document.getElementById('tipoPagamento');
const vencimentoVenda = document.getElementById('vencimentoVenda');
const mensagemVenda = document.getElementById('mensagemVenda');
const clienteVenda = document.getElementById('clienteVenda');
const clienteIdVenda = document.getElementById('clienteIdVenda');
const resultadosClientes = document.getElementById('resultadosClientes');
const btnAbrirCatalogo = document.getElementById('btnAbrirCatalogo');
const modalCatalogo = document.getElementById('modalCatalogo');
const btnFecharCatalogo = document.getElementById('btnFecharCatalogo');
const buscaCatalogo = document.getElementById('buscaCatalogo');
const grelhaCatalogo = document.getElementById('grelhaCatalogo');
const catalogoVazio = document.getElementById('catalogoVazio');
const mensagemCatalogo = document.getElementById('mensagemCatalogo');
const btnCatalogoAnterior = document.getElementById('btnCatalogoAnterior');
const btnCatalogoProxima = document.getElementById('btnCatalogoProxima');
const paginaCatalogoInfo = document.getElementById('paginaCatalogoInfo');
const carrinho = [];
let paginaCatalogoAtual = 1;
let totalPaginasCatalogo = 1;

function dinheiro(valor) {
  return Number(valor).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function infoEstoque(quantidade) {
  if (quantidade <= 0) return { texto: `Sem estoque (${quantidade})`, classe: 'badge-estoque-zerado' };
  if (quantidade <= 3) return { texto: `Estoque baixo: ${quantidade}`, classe: 'badge-estoque-baixo' };
  return { texto: `Estoque: ${quantidade}`, classe: 'badge-estoque-ok' };
}

function infoEstoqueResultante(estoqueDisponivel, quantidadeVendida) {
  const resultante = estoqueDisponivel - quantidadeVendida;
  if (resultante < 0) return { texto: `Estoque ficará negativo: ${resultante}`, classe: 'badge-estoque-zerado' };
  if (resultante === 0) return { texto: 'Esgota o estoque', classe: 'badge-estoque-baixo' };
  if (resultante <= 3) return { texto: `Restam ${resultante}`, classe: 'badge-estoque-baixo' };
  return { texto: `Restam ${resultante}`, classe: 'badge-estoque-ok' };
}

function atualizarResumo() {
  const subtotal = carrinho.reduce((total, item) => total + item.quantidade * item.preco, 0);
  const percentual = Math.min(Math.max(Number.parseFloat(descontoVenda.value) || 0, 0), 100);
  const desconto = subtotal * percentual / 100;
  document.getElementById('subtotalVenda').textContent = dinheiro(subtotal);
  document.getElementById('valorDescontoVenda').textContent = dinheiro(desconto);
  document.getElementById('totalVenda').textContent = dinheiro(subtotal - desconto);
}

function renderizarCarrinho() {
  itensVenda.innerHTML = '';
  carrinhoVazio.hidden = carrinho.length > 0;

  carrinho.forEach((item, indice) => {
    const estoqueInfo = infoEstoqueResultante(item.estoqueDisponivel ?? 0, item.quantidade);
    const linha = document.createElement('tr');
    linha.innerHTML = `
      <td>
        <div class="produto-venda-nome">${item.nome}</div>
        <small>Código: ${item.id}</small>
        <span class="badge-estoque ${estoqueInfo.classe}">${estoqueInfo.texto}</span>
      </td>
      <td><input class="quantidade-item" type="number" min="1" value="${item.quantidade}" data-indice="${indice}"></td>
      <td>
        <input class="preco-item" type="number" min="0" step="0.01" value="${item.preco.toFixed(2)}" data-indice="${indice}" disabled>
        <button type="button" class="btn-editar-preco" data-indice="${indice}">Editar preço</button>
      </td>
      <td>${dinheiro(item.quantidade * item.preco)}</td>
      <td><button type="button" class="btn-remover-item" data-indice="${indice}">Remover</button></td>
    `;
    itensVenda.appendChild(linha);
  });

  itensVenda.querySelectorAll('.quantidade-item').forEach((input) => {
    input.addEventListener('change', () => {
      const item = carrinho[Number(input.dataset.indice)];
      item.quantidade = Math.max(Number.parseInt(input.value, 10) || 1, 1);
      renderizarCarrinho();
    });
  });

  itensVenda.querySelectorAll('.preco-item').forEach((input) => {
    input.addEventListener('change', () => {
      const item = carrinho[Number(input.dataset.indice)];
      item.preco = Math.max(Number.parseFloat(input.value) || 0, 0);
      renderizarCarrinho();
    });
  });

  itensVenda.querySelectorAll('.btn-editar-preco').forEach((botao) => {
    botao.addEventListener('click', () => {
      const input = itensVenda.querySelector(`.preco-item[data-indice="${botao.dataset.indice}"]`);
      input.disabled = false;
      input.focus();
      botao.textContent = 'Preço liberado';
      botao.disabled = true;
    });
  });

  itensVenda.querySelectorAll('.btn-remover-item').forEach((botao) => {
    botao.addEventListener('click', () => {
      carrinho.splice(Number(botao.dataset.indice), 1);
      renderizarCarrinho();
    });
  });

  atualizarResumo();
}

function adicionarProduto(produto, quantidade = 1) {
  const existente = carrinho.find((item) => item.id === produto.id);
  if (existente) {
    existente.quantidade += quantidade;
  } else {
    carrinho.push({
      id: produto.id,
      nome: produto.nome,
      quantidade,
      preco: Number.parseFloat(produto.precoVenda) || 0,
      estoqueDisponivel: Number(produto.estoque) || 0
    });
  }
  buscaVenda.value = '';
  resultadosBusca.innerHTML = '';
  renderizarCarrinho();
}

async function buscarProdutos() {
  const termo = buscaVenda.value.trim();
  if (!termo) {
    resultadosBusca.innerHTML = '';
    return;
  }

  const resposta = await fetch(`${API_URL}/produtos?pagina=1&busca=${encodeURIComponent(termo)}`);
  const resultado = await resposta.json();
  resultadosBusca.innerHTML = '';

  resultado.produtos.forEach((produto) => {
    const estoqueInfo = infoEstoque(Number(produto.estoque) || 0);
    const botao = document.createElement('button');
    botao.type = 'button';
    botao.className = 'resultado-produto';
    botao.innerHTML = `
      <div class="resultado-produto-principal">
        <strong>${produto.nome}</strong>
        <span class="resultado-produto-preco">${dinheiro(produto.precoVenda)}</span>
      </div>
      <div class="resultado-produto-secundario">
        <span>Código ${produto.id}</span>
        <span class="badge-estoque ${estoqueInfo.classe}">${estoqueInfo.texto}</span>
      </div>
    `;
    botao.addEventListener('click', () => adicionarProduto(produto));
    resultadosBusca.appendChild(botao);
  });

  if (resultado.produtos.length === 0) {
    resultadosBusca.textContent = 'Nenhum produto encontrado.';
  }
}

async function buscarClientes() {
  const termo = clienteVenda.value.trim();
  clienteIdVenda.value = '';
  if (!termo) {
    resultadosClientes.innerHTML = '';
    return;
  }

  const resposta = await fetch(`${API_URL}/clientes?busca=${encodeURIComponent(termo)}`);
  const clientes = await resposta.json();
  resultadosClientes.innerHTML = '';

  clientes.forEach((cliente) => {
    const botao = document.createElement('button');
    botao.type = 'button';
    botao.className = 'resultado-produto';
    botao.innerHTML = `<strong>${cliente.nome}</strong><span>${cliente.cpf || 'CPF não informado'}</span>`;
    botao.addEventListener('click', () => {
      clienteVenda.value = cliente.nome;
      clienteIdVenda.value = cliente.id;
      resultadosClientes.innerHTML = '';
    });
    resultadosClientes.appendChild(botao);
  });
}

async function carregarCatalogo() {
  const termo = buscaCatalogo.value.trim();
  const resposta = await fetch(`${API_URL}/produtos?pagina=${paginaCatalogoAtual}&busca=${encodeURIComponent(termo)}`);
  const resultado = await resposta.json();

  paginaCatalogoAtual = resultado.pagina;
  totalPaginasCatalogo = resultado.totalPaginas;
  paginaCatalogoInfo.textContent = `Página ${paginaCatalogoAtual} de ${totalPaginasCatalogo}`;
  btnCatalogoAnterior.disabled = paginaCatalogoAtual <= 1;
  btnCatalogoProxima.disabled = paginaCatalogoAtual >= totalPaginasCatalogo;

  grelhaCatalogo.innerHTML = '';
  catalogoVazio.hidden = resultado.produtos.length > 0;

  resultado.produtos.forEach((produto) => {
    const estoqueInfo = infoEstoque(Number(produto.estoque) || 0);
    const linha = document.createElement('div');
    linha.className = 'produto-catalogo-linha';
    linha.innerHTML = `
      <div class="produto-catalogo-info">
        <span class="produto-catalogo-nome">${produto.nome}</span>
        <span class="produto-catalogo-codigo">Código ${produto.id}</span>
      </div>
      <span class="badge-estoque ${estoqueInfo.classe}">${estoqueInfo.texto}</span>
      <span class="produto-catalogo-preco">${dinheiro(produto.precoVenda)}</span>
      <div class="produto-catalogo-acao">
        <input type="number" min="1" value="1" class="input-quantidade-catalogo" aria-label="Quantidade">
        <button type="button" class="btn-adicionar-catalogo">Adicionar</button>
      </div>
    `;

    const inputQuantidade = linha.querySelector('.input-quantidade-catalogo');
    const botaoAdicionar = linha.querySelector('.btn-adicionar-catalogo');

    const confirmarAdicao = () => {
      const quantidade = Math.max(Number.parseInt(inputQuantidade.value, 10) || 1, 1);
      adicionarProduto(produto, quantidade);
      mensagemCatalogo.textContent = `${quantidade}x ${produto.nome} adicionado à venda.`;
      mensagemCatalogo.classList.remove('mensagem-erro');
      inputQuantidade.value = '1';
    };

    botaoAdicionar.addEventListener('click', confirmarAdicao);
    inputQuantidade.addEventListener('keydown', (evento) => {
      if (evento.key !== 'Enter') return;
      evento.preventDefault();
      confirmarAdicao();
    });

    grelhaCatalogo.appendChild(linha);
  });
}

function abrirCatalogo() {
  modalCatalogo.hidden = false;
  buscaCatalogo.value = '';
  mensagemCatalogo.textContent = '';
  paginaCatalogoAtual = 1;
  carregarCatalogo();
  buscaCatalogo.focus();
}

function fecharCatalogo() {
  modalCatalogo.hidden = true;
}

btnAbrirCatalogo.addEventListener('click', abrirCatalogo);
btnFecharCatalogo.addEventListener('click', fecharCatalogo);
modalCatalogo.addEventListener('click', (evento) => {
  if (evento.target === modalCatalogo) fecharCatalogo();
});
document.addEventListener('keydown', (evento) => {
  if (evento.key === 'Escape' && !modalCatalogo.hidden) fecharCatalogo();
});

buscaCatalogo.addEventListener('input', () => {
  paginaCatalogoAtual = 1;
  carregarCatalogo();
});
btnCatalogoAnterior.addEventListener('click', () => {
  if (paginaCatalogoAtual > 1) {
    paginaCatalogoAtual--;
    carregarCatalogo();
  }
});
btnCatalogoProxima.addEventListener('click', () => {
  if (paginaCatalogoAtual < totalPaginasCatalogo) {
    paginaCatalogoAtual++;
    carregarCatalogo();
  }
});

function selecionarPrimeiraOpcaoAoPressionarEnter(input, container, seletor) {
  input.addEventListener('keydown', (evento) => {
    if (evento.key !== 'Enter') return;
    evento.preventDefault();
    const primeiraOpcao = container.querySelector(seletor);
    if (primeiraOpcao) primeiraOpcao.click();
  });
}

buscaVenda.addEventListener('input', buscarProdutos);
clienteVenda.addEventListener('input', buscarClientes);
descontoVenda.addEventListener('input', atualizarResumo);
selecionarPrimeiraOpcaoAoPressionarEnter(buscaVenda, resultadosBusca, '.resultado-produto');
selecionarPrimeiraOpcaoAoPressionarEnter(clienteVenda, resultadosClientes, '.resultado-produto');
selecionarPrimeiraOpcaoAoPressionarEnter(buscaCatalogo, grelhaCatalogo, '.produto-catalogo-linha .btn-adicionar-catalogo');
tipoPagamento.addEventListener('change', () => {
  vencimentoVenda.disabled = tipoPagamento.value !== 'futuro';
  if (tipoPagamento.value === 'futuro' && !vencimentoVenda.value) {
    const data = new Date();
    data.setDate(data.getDate() + 30);
    vencimentoVenda.value = data.toISOString().slice(0, 10);
  }
});

document.getElementById('btnGerarCondicional').addEventListener('click', async () => {
  if (carrinho.length === 0) {
    mensagemVenda.textContent = 'Adicione pelo menos um produto à venda.';
    return;
  }

  if (tipoPagamento.value === 'futuro' && !vencimentoVenda.value) {
    mensagemVenda.textContent = 'Informe o vencimento do pagamento futuro.';
    return;
  }

  const percentual = Math.min(Math.max(Number.parseFloat(descontoVenda.value) || 0, 0), 100);
  const resposta = await fetch(`${API_URL}/vendas/condicional`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      cliente: document.getElementById('clienteVenda').value.trim() || 'Cliente Balcão',
      clienteId: clienteIdVenda.value || null,
      tipoPagamento: tipoPagamento.value,
      vencimento: vencimentoVenda.value || null,
      desconto: percentual,
      itens: carrinho
    })
  });

  if (!resposta.ok) {
    mensagemVenda.textContent = 'Não foi possível gerar a condicional.';
    return;
  }

  if (tipoPagamento.value === 'avista') {
    const pendencia = await resposta.json();
    carrinho.length = 0;
    document.getElementById('clienteVenda').value = '';
    clienteIdVenda.value = '';
    descontoVenda.value = '0';
    renderizarCarrinho();
    mensagemVenda.textContent = pendencia.mensagem || 'Venda enviada ao Caixa.';
    return;
  }

  const arquivo = await resposta.blob();
  const url = URL.createObjectURL(arquivo);
  window.open(url, '_blank', 'noopener');
  setTimeout(() => URL.revokeObjectURL(url), 120000);
  carrinho.length = 0;
  document.getElementById('clienteVenda').value = '';
  clienteIdVenda.value = '';
  descontoVenda.value = '0';
  tipoPagamento.value = 'avista';
  vencimentoVenda.value = '';
  vencimentoVenda.disabled = true;
  renderizarCarrinho();
  mensagemVenda.textContent = 'Condicional gerada com sucesso.';
});

document.getElementById('btnVoltar').addEventListener('click', () => {
  window.location.href = 'hub.html';
});

renderizarCarrinho();
