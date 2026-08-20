console.log("JavaScript conectado com sucesso !! ");

if (sessionStorage.getItem('autenticado') !== 'true') {
  window.location.href = 'login.html';
}


const nomeProduto = document.getElementById('nomeProduto');
const categoria = document.getElementById('categoria');
const unidadeVenda = document.getElementById('unidadeVenda');
const estoque = document.getElementById('estoque');
const precoCusto = document.getElementById('precoCusto');
const precoVenda = document.getElementById('precoVenda');
const ncm = document.getElementById('ncm');
const btnSalvar = document.getElementById('btnSalvar');
const btnSair = document.getElementById('btnSair');
const totalProdutos = document.getElementById('numeroProdutos');
const listaProdutos = document.getElementById('listaProdutos');


let produtos = JSON.parse(localStorage.getItem('produtos_cadastrados')) || [];
let idEditando = undefined;

btnSair.addEventListener('click', () => {
  sessionStorage.removeItem('autenticado');
  window.location.href = 'login.html';
});


function formatarNome(texto) {

  if (!texto) return '';

  let textoFormatado = texto.toLowerCase();
  textoFormatado = textoFormatado.replace(/(^\w|\s\w)/g, function (letra) {
    return letra.toUpperCase();

  });


  return textoFormatado;
  console.log("necessario para salvar");
};


ncm.addEventListener('input', function (e) {

  let valor = e.target.value.replace(/\D/g, '');

  if (valor.length > 8) {
    valor = valor.slice(0, 8);
  }


  let resultado = '';
  if (valor.length > 0) {
    resultado = valor.slice(0, 4);

  }
  if (valor.length > 4) {

    resultado += '.' + valor.slice(4, 6);
  }
  if (valor.length > 6) {

    resultado += '.' + valor.slice(6, 8);
  }


  e.target.value = resultado;


});



function prepararEdicao(id) {

  idEditando = id;
  const prod = produtos.find(produto => produto.id === id);

  console.log("Produto encontrado:", prod);

  if (prod) {

    document.getElementById('nomeProduto').value = prod.nome;
    document.getElementById('categoria').value = prod.categoria;
    document.getElementById('estoque').value = prod.estoque;
    document.getElementById('precoCusto').value = prod.precoCusto || prod.precocusto;
    document.getElementById('precoVenda').value = prod.precoVenda || prod.precovenda
    document.getElementById('ncm').value = prod.ncm;
  }


  btnSalvar.textContent = ("Atualizar Produto");

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

  if (!isNaN(numero)) {
    input.value = numero.toFixed(2).replace('.', ',');

  }

}

function calcularPrecoVenda() {
  const custo = Number.parseFloat(precoCusto.value.replace(',', '.'));

  if (!Number.isNaN(custo) && custo > 0) {
    precoVenda.value = (custo * 1.3).toFixed(2).replace('.', ',');
  }
}





const API_URL = 'http://localhost:3000/produtos';
const importarXmlForm = document.getElementById('importarXmlForm');
const arquivoXml = document.getElementById('arquivoXml');
const codigoNfce = document.getElementById('codigoNfce');

const form = document.getElementById('cadastroForm');
const tabela = document.querySelector('tbody');

function atualizarTotalProdutos() {
  totalProdutos.textContent = produtos.length;
}

// carrega o produto do bd na tabela 

async function carregarProdutos() {
  try {
    const resposta = await fetch(API_URL);
    if (!resposta.ok) {
      throw new Error(`Erro ao carregar produtos: ${resposta.status}`);
    }

    produtos = await resposta.json();
    atualizarTotalProdutos();

    tabela.innerHTML = '';

    produtos.forEach(prod => {
      const linha = document.createElement('tr');
      linha.innerHTML = `
                <td>${prod.id}</td>
                <td>${prod.nome}</td>
                <td>${prod.categoria}</td>
                <td>${prod.unidade || 'Unidade'}</td>
                <td>${prod.estoque}</td>
                <td>R$ ${parseFloat(prod.precoCusto).toFixed(2)}</td>
                <td>R$ ${parseFloat(prod.precoVenda).toFixed(2)}</td>
                <td>${prod.ncm || '-'}</td>
                <td>
                    <button type="button" onclick="prepararEdicao(${prod.id})">Editar</button>
                    <button type="button" onclick="excluirProduto(${prod.id})">Excluir</button>
                </td>
            `;
      tabela.appendChild(linha);
    });
  } catch (erro) {
    console.error('Erro ao carregar produtos:', erro);
  }
}

importarXmlForm.addEventListener('submit', async (e) => {
  e.preventDefault();

  const chaveNfce = codigoNfce.value.replace(/\D/g, '');

  if (chaveNfce.length !== 44) {
    alert('A chave da NFC-e deve conter 44 números.');
    return;
  }

  const dados = new FormData();
  dados.append('xml', arquivoXml.files[0]);
  dados.append('codigoNfce', chaveNfce);

  try {
    const resposta = await fetch('http://localhost:3000/notas/importar', {
      method: 'POST',
      body: dados
    });
    const resultado = await resposta.json();

    if (!resposta.ok) {
      alert(resultado.err || 'Erro ao importar XML.');
      return;
    }

    alert(`Nota ${resultado.nota}: ${resultado.criados} produto(s) criado(s) e ${resultado.atualizados} estoque(s) atualizado(s).`);
    importarXmlForm.reset();
    carregarProdutos();
  } catch (erro) {
    console.error('Erro ao importar XML:', erro);
    alert('Não foi possível conectar ao servidor.');
  }
});


form.addEventListener('submit', async (e) => {
  e.preventDefault();



  const inputs = form.querySelectorAll('input, select');

  const nome = formatarNome(document.getElementById('nomeProduto').value.trim());
  const categoria = document.getElementById('categoria').value.trim();
  const precoVenda = parseFloat(document.getElementById('precoVenda').value);
  const precoCusto = parseFloat(document.getElementById('precoCusto').value);
  const estoque = parseInt(document.getElementById('estoque').value);
  const ncm = String(document.getElementById('ncm').value);


  if (!nome || !categoria || estoque <= 0 || !ncm || precoVenda <= 0 || precoCusto <= 0) {
    alert("Por favor ensira os números necessarios para a finalização do cadastro dos produtos ! ")
    return;
  }
  const novoProduto = {
    nome, categoria, precoCusto, precoVenda, estoque, ncm
  };

  const url = idEditando
    ? `http://localhost:3000/produtos/${idEditando}`
    : 'http://localhost:3000/produtos';

  const metodo = idEditando ? 'PUT' : 'POST';

  const responde = await fetch(url, {

    method: metodo,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(novoProduto)
  });

  if (responde.ok) {

    alert(idEditando ? "Produto editado" : "Produto cadastrado");
    idEditando = undefined;
    btnSalvar.textContent = "Salvar Produto";
    form.reset()
    carregarProdutos();

  }
});

async function excluirProduto(id) {
  if (confirm("Tem certeza que deseja excluir produto?")) {
    try {
      const res = await fetch(`http://localhost:3000/produtos/${id}`, {
        method: 'DELETE'
      });

      if (res.ok) {
        carregarProdutos();
      }
    } catch (err) {
      console.error("Erro ao excluir:", err);
    }
  }
}

carregarProdutos();

precoCusto.addEventListener('blur', (evento) => {
  formatacaonumero(evento);
  calcularPrecoVenda();
});
precoVenda.addEventListener('blur', formatacaonumero);
