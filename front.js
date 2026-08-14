console.log("JavaScript conectado com sucesso !! ");

const form = document.querySelector('.form-grid');

const codigoProduto = document.getElementById('codigoProduto');
const nomeProduto = document.getElementById('nomeProduto');
const categoria = document.getElementById('categoria');
const unidadeVenda = document.getElementById('unidadeVenda');
const estoque = document.getElementById('estoque');
const precoCusto = document.getElementById('precoCusto');
const precoVenda = document.getElementById('precoVenda');
const ncm = document.getElementById('ncm');
const btnSalvar = document.getElementById('btnSalvar');
const totalProdutos = document.getElementById('numeroProdutos');
const listaProdutos = document.getElementById('listaProdutos');


let produtos = JSON.parse(localStorage.getItem('produtos_cadastrados')) || [];
let idEditando = null;

function formatarNome(texto) {

  if (!texto || typeof texto !== "string") return '';
  const textoLimpo = texto.replace(/[^a-zA-AáàâãéèêíóôõúçÁÀÂÃÉÈÊÍÓÔÕÚÇ\s]/g, '');
  return textoLimpo
    .toLowerCase()
    .trim()
    .split(/\s+/)
    .filter(palavra => palavra.length > 0)
    .map(palavra => String(palavra[0]).toUpperCase() + String(palavra).slice(1))
    .join('');



}

form.addEventListener('submit', (e) => {
  e.preventDefault();


  const novoProduto = {
    codigo: idEditando !== null ? codigoProduto.value : gerarCodigo(),
    nome: formatarNome(nomeProduto.value),
    categoria: categoria.value,
    unidadeVenda: unidadeVenda.value,
    estoque: estoque.value,
    precoCusto: precoCusto.value,
    precoVenda: precoVenda.value,
    ncm: ncm.value

  };

  if (idEditando !== null) {
    produtos[idEditando] = novoProduto;
    idEditando = null;
    btnSalvar.textContent = ("Salvar novo Produto");
  }

  else {
    produtos.push(novoProduto)
  }
  renderizarTabela();
  salvarLocalStorage();

  console.log("lista de produtos :", produtos);
  form.reset();
  codigoProduto.value = gerarCodigo();

})

function renderizarTabela() {
  listaProdutos.innerHTML = '';

  produtos.forEach((produto, index) => {
    const tr = document.createElement('tr');


    tr.innerHTML = `
            <td>${produto.codigo}</td>
            <td>${produto.nome}</td>
            <td>${produto.categoria}</td>
            <td>${produto.unidadeVenda}</td>
            <td>${produto.estoque}</td>
            <td>R$ ${produto.precoCusto}</td>
            <td>R$ ${produto.precoVenda}</td>
            <td>${produto.ncm}</td>
            <td>
                <button class="btn-acao btn-editar" onclick="prepararEdicao(${index})">Editar</button>
                <button class="btn-acao btn-excluir" onclick="excluirProduto(${index})">Excluir</button>
            </td>
        `;

    listaProdutos.appendChild(tr);
    atualizarTotalProdutos();

  });
}
function excluirProduto(index) {
  if (confirm("Tem certeza que deseja excluir produto")) {
    produtos.splice(index, 1)
    renderizarTabela();
    salvarLocalStorage();
  }
}
function salvarLocalStorage() {

  localStorage.setItem('produtos_cadastrados', JSON.stringify(produtos));
}

function prepararEdicao(index) {

  idEditando = index;
  const prod = produtos[index];
  codigoProduto.value = prod.codigo;
  nomeProduto.value = prod.nome;
  categoria.value = prod.categoria;
  unidadeVenda.value = prod.unidadeVenda;
  estoque.value = prod.estoque;
  precoCusto.value = String(prod.precoCusto).replace('.', ',');
  precoVenda.value = String(prod.precoVenda).replace('.', ',');
  ncm.value = prod.ncm;

  btnSalvar.textContent = ("Atualizar Produto");

}

function atualizarTotalProdutos() {
  if (totalProdutos) {

    totalProdutos.textContent = produtos.length;
  }

}


function gerarCodigo() {

  if (produtos.length == 0) {

    return "00001"

  }
  const numeros = produtos.map(p => parseInt(p.codigo, 10 || 0));
  const maiorNumero = Math.max(...numeros);
  const proximoNumero = maiorNumero + 1;
  return String(proximoNumero);

}

function converteDecimal(valortexto) {

  if (!valortexto) return 0;
  let limpo = String(valortexto).trim();
  limpo = limpo.replace(/\./g, '');
  limpo = limpo.replace(',', '.');
  return parceFloat(limpo) || 0;

}
function formatacaonumero(evento) {
  let input = evento.target;
  let valor = input.value.trim();

  if (!valor) return;

  valor = valor.replace(',', '.');

  let numero = parseFloat(valor)

  if (!isNaN (numero))
    {
      input.value = numero.toFixed(2).replace('.', ','); 

    } 

}

renderizarTabela();
codigoProduto.value = gerarCodigo();  
precoCusto.addEventListener('blur', formatacaonumero);
precoVenda.addEventListener('blur', formatacaonumero);

