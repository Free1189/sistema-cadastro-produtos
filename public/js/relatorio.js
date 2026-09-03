if (sessionStorage.getItem('autenticado') !== 'true') {
  window.location.href = 'login.html';
}

const API_URL = '';

const mensagemRelatorio = document.getElementById('mensagemRelatorio');
const inputPeriodoInicio = document.getElementById('inputPeriodoInicio');
const inputPeriodoFim = document.getElementById('inputPeriodoFim');
const btnGerarPdf = document.getElementById('btnGerarPdf');

function paraDataInput(data) {
  return data.toISOString().slice(0, 10);
}

function mostrarMensagem(texto, erro = false) {
  mensagemRelatorio.textContent = texto;
  mensagemRelatorio.classList.toggle('mensagem-erro', erro);
}

function definirPeriodoPadrao() {
  const hoje = new Date();
  const inicioMes = new Date(hoje.getFullYear(), hoje.getMonth(), 1);
  inputPeriodoInicio.value = paraDataInput(inicioMes);
  inputPeriodoFim.value = paraDataInput(hoje);
}

btnGerarPdf.addEventListener('click', () => {
  const inicio = inputPeriodoInicio.value;
  const fim = inputPeriodoFim.value;
  if (!inicio || !fim) {
    mostrarMensagem('Escolha o período (início e fim) para gerar o relatório.', true);
    return;
  }
  if (inicio > fim) {
    mostrarMensagem('A data de início não pode ser depois da data de fim.', true);
    return;
  }
  window.open(`${API_URL}/relatorio/pdf?inicio=${inicio}&fim=${fim}`, '_blank');
});

document.getElementById('btnVoltar').addEventListener('click', () => { window.location.href = 'hub.html'; });

definirPeriodoPadrao();
