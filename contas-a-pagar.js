if (sessionStorage.getItem('autenticado') !== 'true') {
  window.location.href = 'login.html';
}

const API_URL = 'http://localhost:3000';

const mensagemDespesas = document.getElementById('mensagemDespesas');
const inputPeriodoInicio = document.getElementById('inputPeriodoInicio');
const inputPeriodoFim = document.getElementById('inputPeriodoFim');

const selectCategoriaDespesa = document.getElementById('selectCategoriaDespesa');
const inputValorDespesa = document.getElementById('inputValorDespesa');
const inputDataDespesa = document.getElementById('inputDataDespesa');
const inputDescricaoDespesa = document.getElementById('inputDescricaoDespesa');
const btnLancarDespesa = document.getElementById('btnLancarDespesa');

const listaDespesas = document.getElementById('listaDespesas');
const despesasVazio = document.getElementById('despesasVazio');
const totalDespesasPeriodo = document.getElementById('totalDespesasPeriodo');

const ROTULOS_CATEGORIA = {
  imposto: 'Impostos',
  salario: 'Salário',
  luz: 'Luz',
  agua: 'Água',
  produto: 'Compra de produtos',
  outro: 'Outros gastos'
};

function dinheiro(valor) {
  return Number(valor).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function formatarData(valor) {
  const bruto = String(valor || '');
  const dataBase = bruto.includes('T') ? bruto.slice(0, 10) : bruto;
  return new Date(`${dataBase}T12:00:00`).toLocaleDateString('pt-BR');
}

function paraDataInput(data) {
  return data.toISOString().slice(0, 10);
}

function mostrarMensagem(texto, erro = false) {
  mensagemDespesas.textContent = texto;
  mensagemDespesas.classList.toggle('mensagem-erro', erro);
}

function definirPeriodoPadrao() {
  const hoje = new Date();
  const inicioMes = new Date(hoje.getFullYear(), hoje.getMonth(), 1);
  inputPeriodoInicio.value = paraDataInput(inicioMes);
  inputPeriodoFim.value = paraDataInput(hoje);
  inputDataDespesa.value = paraDataInput(hoje);
}

async function carregarDespesas() {
  const inicio = inputPeriodoInicio.value;
  const fim = inputPeriodoFim.value;
  if (!inicio || !fim) return;

  try {
    const resposta = await fetch(`${API_URL}/despesas?inicio=${inicio}&fim=${fim}`);
    const despesas = await resposta.json();
    if (!resposta.ok) throw new Error(despesas.err || 'Erro ao buscar despesas');

    listaDespesas.innerHTML = '';
    despesasVazio.hidden = despesas.length > 0;
    const total = despesas.reduce((soma, despesa) => soma + Number(despesa.valor), 0);
    totalDespesasPeriodo.textContent = despesas.length > 0 ? `Total do período: ${dinheiro(total)}` : '';

    despesas.forEach((despesa) => {
      const linha = document.createElement('article');
      linha.className = 'despesa-item';
      linha.innerHTML = `
        <div>
          <strong>${ROTULOS_CATEGORIA[despesa.categoria] || despesa.categoria}</strong>
          <span>${formatarData(despesa.data_despesa)}${despesa.descricao ? ` · ${despesa.descricao}` : ''}</span>
        </div>
        <div class="despesa-item-acoes">
          <b>${dinheiro(despesa.valor)}</b>
          <button type="button" class="btn-excluir-despesa" data-id="${despesa.id}" aria-label="Excluir despesa">Excluir</button>
        </div>
      `;
      listaDespesas.appendChild(linha);
    });

    listaDespesas.querySelectorAll('.btn-excluir-despesa').forEach((botao) => {
      botao.addEventListener('click', async () => {
        if (!confirm('Excluir esta despesa?')) return;
        const resposta = await fetch(`${API_URL}/despesas/${botao.dataset.id}`, { method: 'DELETE' });
        if (!resposta.ok) {
          mostrarMensagem('Não foi possível excluir a despesa.', true);
          return;
        }
        carregarDespesas();
      });
    });
  } catch (err) {
    mostrarMensagem(err.message, true);
  }
}

btnLancarDespesa.addEventListener('click', async () => {
  const categoria = selectCategoriaDespesa.value;
  const valor = Number.parseFloat(inputValorDespesa.value);
  const data = inputDataDespesa.value;
  const descricao = inputDescricaoDespesa.value.trim();

  if (!Number.isFinite(valor) || valor <= 0 || !data) {
    mostrarMensagem('Informe um valor e uma data válidos para a despesa.', true);
    return;
  }

  btnLancarDespesa.disabled = true;
  try {
    const resposta = await fetch(`${API_URL}/despesas`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ categoria, valor, data, descricao })
    });
    const resultado = await resposta.json();
    if (!resposta.ok) throw new Error(resultado.err || 'Não foi possível lançar a despesa');

    mostrarMensagem('Despesa lançada com sucesso.');
    inputValorDespesa.value = '';
    inputDescricaoDespesa.value = '';
    carregarDespesas();
  } catch (err) {
    mostrarMensagem(err.message, true);
  } finally {
    btnLancarDespesa.disabled = false;
  }
});

inputPeriodoInicio.addEventListener('change', carregarDespesas);
inputPeriodoFim.addEventListener('change', carregarDespesas);

document.getElementById('btnVoltar').addEventListener('click', () => { window.location.href = 'hub.html'; });

definirPeriodoPadrao();
carregarDespesas();
