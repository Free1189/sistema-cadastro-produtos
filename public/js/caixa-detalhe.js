if (sessionStorage.getItem('autenticado') !== 'true') window.location.href = 'login.html';

const API_URL = '';
const vendaId = new URLSearchParams(window.location.search).get('id');

const mensagemDetalhe = document.getElementById('mensagemDetalhe');
const detalheCorpo = document.getElementById('detalheCorpo');
const elClienteNome = document.getElementById('detalheClienteNome');
const elVendaInfo = document.getElementById('detalheVendaInfo');
const elItensLista = document.getElementById('detalheItensLista');
const elSubtotal = document.getElementById('detalheSubtotal');
const elDesconto = document.getElementById('detalheDesconto');
const elTotal = document.getElementById('detalheTotal');
const inputDocumento = document.getElementById('inputDocumento');
const grupoFormaPagamento = document.getElementById('grupoFormaPagamento');
const btnFinalizarVenda = document.getElementById('btnFinalizarVenda');
const btnCancelarVenda = document.getElementById('btnCancelarVenda');

function dinheiro(valor) {
  return Number(valor).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function mostrarMensagem(texto, erro = false) {
  mensagemDetalhe.textContent = texto;
  mensagemDetalhe.classList.toggle('mensagem-erro', erro);
}

function preencher(venda) {
  const numeroDiario = venda.numero_venda_dia || venda.id;
  elClienteNome.textContent = venda.cliente_nome;
  elVendaInfo.textContent = `Venda do dia ${numeroDiario} · ${new Date(venda.criado_em).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}`;

  elItensLista.innerHTML = (venda.itens || []).map((item) => `
    <li>
      <span>${item.quantidade}x ${item.nome}</span>
      <b>${dinheiro(item.preco * item.quantidade)}</b>
    </li>
  `).join('');

  const valorDesconto = Number(venda.subtotal) * Number(venda.desconto) / 100;
  elSubtotal.textContent = dinheiro(venda.subtotal);
  elDesconto.textContent = dinheiro(valorDesconto);
  elTotal.textContent = dinheiro(venda.total);
}

async function carregar() {
  if (!vendaId) {
    mostrarMensagem('Venda não informada.', true);
    return;
  }

  try {
    const resposta = await fetch(`${API_URL}/vendas/pendentes/${vendaId}`);
    const venda = await resposta.json();
    if (!resposta.ok) throw new Error(venda.err || 'Venda não encontrada');

    detalheCorpo.hidden = false;
    preencher(venda);
  } catch (err) {
    mostrarMensagem(err.message, true);
  }
}

grupoFormaPagamento.querySelectorAll('input[name="metodoPagamento"]').forEach((input) => {
  input.addEventListener('change', () => {
    grupoFormaPagamento.querySelectorAll('.forma-pagamento-option').forEach((option) => option.classList.remove('selected'));
    input.closest('.forma-pagamento-option').classList.add('selected');
  });
});

btnFinalizarVenda.addEventListener('click', async () => {
  const metodo = grupoFormaPagamento.querySelector('input[name="metodoPagamento"]:checked')?.value || 'dinheiro';
  const documento = inputDocumento.value;

  btnFinalizarVenda.disabled = true;
  try {
    const resposta = await fetch(`${API_URL}/vendas/${vendaId}/finalizar`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ metodoPagamento: metodo, documento })
    });
    const resultado = await resposta.json();
    if (!resposta.ok) throw new Error(resultado.err || 'Não foi possível finalizar a venda');

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

    mostrarMensagem('Venda finalizada com sucesso.');
    detalheCorpo.hidden = true;
    setTimeout(() => { window.location.href = 'caixa.html'; }, 1200);
  } catch (err) {
    mostrarMensagem(err.message, true);
    btnFinalizarVenda.disabled = false;
  }
});

btnCancelarVenda.addEventListener('click', async () => {
  if (!confirm('Cancelar esta venda pendente? Esta ação não gera movimentação de caixa.')) return;

  btnCancelarVenda.disabled = true;
  try {
    const resposta = await fetch(`${API_URL}/vendas/${vendaId}/cancelar`, { method: 'DELETE' });
    const resultado = await resposta.json().catch(() => ({}));
    if (!resposta.ok) throw new Error(resultado.err || 'Não foi possível cancelar a venda.');

    mostrarMensagem('Venda cancelada com sucesso.');
    detalheCorpo.hidden = true;
    setTimeout(() => { window.location.href = 'caixa.html'; }, 1200);
  } catch (err) {
    mostrarMensagem(err.message, true);
    btnCancelarVenda.disabled = false;
  }
});

document.getElementById('btnVoltar').addEventListener('click', () => { window.location.href = 'caixa.html'; });
carregar();
