if (sessionStorage.getItem('autenticado') !== 'true') {
  window.location.href = 'login.html';
}

const API_URL = '/vendas';
const listaVendas = document.getElementById('listaVendas');
const vendasVazio = document.getElementById('vendasVazio');
const quantidadeVendas = document.getElementById('quantidadeVendas');
const valorVendas = document.getElementById('valorVendas');
const totalPix = document.getElementById('totalPix');
const totalDinheiro = document.getElementById('totalDinheiro');
const totalBoleto = document.getElementById('totalBoleto');
const totalCartaoDebito = document.getElementById('totalCartaoDebito');
const totalCartaoCredito = document.getElementById('totalCartaoCredito');
const informacaoPagina = document.getElementById('informacaoPaginaVendas');
const paginaAnterior = document.getElementById('paginaAnteriorVendas');
const paginaProxima = document.getElementById('paginaProximaVendas');
let periodoAtual = 'dia';
let paginaAtual = 1;
let totalPaginas = 1;

function dinheiro(valor) {
  return Number(valor).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function pagamentoTexto(tipo) {
  if (tipo === 'boleto' || tipo === 'futuro') return 'Boleto';
  if (tipo === 'pix') return 'PIX';
  if (tipo === 'dinheiro') return 'Dinheiro';
  if (tipo === 'cartao_debito') return 'Cartão de débito';
  if (tipo === 'cartao_credito') return 'Cartão de crédito';
  return 'À vista';
}

async function carregarVendas() {
  const resposta = await fetch(`${API_URL}?periodo=${periodoAtual}&pagina=${paginaAtual}`);
  const resultado = await resposta.json();
  if (!resposta.ok) return;

  paginaAtual = resultado.pagina;
  totalPaginas = resultado.totalPaginas;
  quantidadeVendas.textContent = resultado.quantidade;
  valorVendas.textContent = dinheiro(resultado.valor);
  totalPix.textContent = dinheiro(resultado.porMetodo.pix);
  totalDinheiro.textContent = dinheiro(resultado.porMetodo.dinheiro);
  totalBoleto.textContent = dinheiro(resultado.porMetodo.boleto);
  totalCartaoDebito.textContent = dinheiro(resultado.porMetodo.cartaoDebito);
  totalCartaoCredito.textContent = dinheiro(resultado.porMetodo.cartaoCredito);
  informacaoPagina.textContent = `Página ${paginaAtual} de ${totalPaginas}`;
  paginaAnterior.disabled = paginaAtual === 1;
  paginaProxima.disabled = paginaAtual === totalPaginas;
  vendasVazio.hidden = resultado.vendas.length > 0;
  listaVendas.innerHTML = '';

  resultado.vendas.forEach((venda, indice) => {
    const registroTela = venda.numero_venda_dia || ((paginaAtual - 1) * 10 + indice + 1);
    const linha = document.createElement('tr');
    const data = new Date(venda.criado_em).toLocaleDateString('pt-BR');
    linha.innerHTML = `
      <td>Venda ${registroTela}</td>
      <td>${venda.cliente_nome}</td>
      <td>${pagamentoTexto(venda.tipo_pagamento)}</td>
      <td>${data}</td>
      <td>${dinheiro(venda.total)}</td>
      <td><span class="valor-pago-venda">Subtraído: ${dinheiro(venda.valor_pago || 0)}</span><br><span>Saldo: ${dinheiro(venda.saldo_devedor ?? venda.total)}</span></td>
      <td><span class="status-pagamento ${venda.status_pagamento}">${venda.status_pagamento === 'pago' ? 'Pago' : 'Pendente'}</span></td>
      <td><button type="button" class="btn-comprovante-venda" data-id="${venda.id}">Baixar comprovante</button></td>
      <td>
        <select class="pagamento-venda" data-id="${venda.id}">
          <option value="avista" ${venda.tipo_pagamento === 'avista' ? 'selected' : ''}>À vista</option>
          <option value="futuro" ${venda.tipo_pagamento === 'futuro' ? 'selected' : ''}>Futuro</option>
        </select>
        <input class="vencimento-venda" data-id="${venda.id}" type="date" value="${venda.vencimento ? venda.vencimento.slice(0, 10) : ''}" ${venda.tipo_pagamento === 'futuro' ? '' : 'hidden'}>
        <button type="button" class="btn-editar-pagamento" data-id="${venda.id}">Editar</button>
      </td>
      <td><button type="button" class="btn-excluir-venda" data-id="${venda.id}">Excluir</button></td>
    `;
    listaVendas.appendChild(linha);
  });

  listaVendas.querySelectorAll('.pagamento-venda').forEach((seletor) => {
    seletor.addEventListener('change', () => {
      const vencimento = listaVendas.querySelector(`.vencimento-venda[data-id="${seletor.dataset.id}"]`);
      vencimento.hidden = seletor.value !== 'futuro';
    });
  });

  listaVendas.querySelectorAll('.btn-editar-pagamento').forEach((botao) => {
    botao.addEventListener('click', async () => {
      const id = botao.dataset.id;
      const seletor = listaVendas.querySelector(`.pagamento-venda[data-id="${id}"]`);
      const vencimento = listaVendas.querySelector(`.vencimento-venda[data-id="${id}"]`);
      const resposta = await fetch(`${API_URL}/${id}/pagamento`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tipoPagamento: seletor.value, vencimento: vencimento.value || null })
      });

      if (!resposta.ok) {
        const erro = await resposta.json();
        alert(erro.err || 'Não foi possível editar o pagamento.');
        return;
      }

      carregarVendas();
    });
  });

  listaVendas.querySelectorAll('.btn-excluir-venda').forEach((botao) => {
    botao.addEventListener('click', async () => {
      if (!confirm('Excluir esta venda? O estoque será reposto.')) return;

      const resposta = await fetch(`${API_URL}/${botao.dataset.id}`, { method: 'DELETE' });
      if (!resposta.ok) {
        const erro = await resposta.json();
        alert(erro.err || 'Não foi possível excluir a venda.');
        return;
      }

      carregarVendas();
    });
  });

  listaVendas.querySelectorAll('.btn-comprovante-venda').forEach((botao) => {
    botao.addEventListener('click', () => {
      window.open(`${API_URL}/${botao.dataset.id}/comprovante`, '_blank', 'noopener');
    });
  });
}

document.querySelectorAll('.aba-venda').forEach((aba) => {
  aba.addEventListener('click', () => {
    document.querySelector('.aba-venda.ativa').classList.remove('ativa');
    aba.classList.add('ativa');
    periodoAtual = aba.dataset.periodo;
    paginaAtual = 1;
    carregarVendas();
  });
});

paginaAnterior.addEventListener('click', () => {
  if (paginaAtual > 1) {
    paginaAtual--;
    carregarVendas();
  }
});

paginaProxima.addEventListener('click', () => {
  if (paginaAtual < totalPaginas) {
    paginaAtual++;
    carregarVendas();
  }
});

document.getElementById('btnVoltar').addEventListener('click', () => {
  window.location.href = 'hub.html';
});

carregarVendas();
