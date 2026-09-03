if (sessionStorage.getItem('autenticado') !== 'true') {
  window.location.href = 'login.html';
}

const API_URL = '';
const listaCobrancas = document.getElementById('listaCobrancas');
const cobrancasVazio = document.getElementById('cobrancasVazio');
const quantidadeCobrancas = document.getElementById('quantidadeCobrancas');
const mensagemCobranca = document.getElementById('mensagemCobranca');

function dinheiro(valor) {
  return Number(valor).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function formatarData(valor) {
  const bruto = String(valor || '');
  const dataBase = bruto.includes('T') ? bruto.slice(0, 10) : bruto;
  return new Date(`${dataBase}T12:00:00`).toLocaleDateString('pt-BR');
}

async function carregarCobrancas() {
  await fetch(`${API_URL}/cobrancas/sincronizar`, { method: 'POST' });
  const resposta = await fetch(`${API_URL}/cobrancas/atrasadas`);
  const cobrancas = await resposta.json();
  listaCobrancas.innerHTML = '';
  quantidadeCobrancas.textContent = cobrancas.length;
  cobrancasVazio.hidden = cobrancas.length > 0;

  cobrancas.forEach((cobranca) => {
    const vencimento = formatarData(cobranca.vencimento);
    const avisoInfo = cobranca.aviso_enviado_em
      ? `<span class="aviso-enviado-badge">✓ Avisado em ${new Date(cobranca.aviso_enviado_em).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}</span>`
      : `<span class="aviso-pendente-badge">Ainda não avisado</span>`;
    const card = document.createElement('article');
    card.className = 'cobranca-card';
    card.innerHTML = `
      <div class="cobranca-dados">
        <strong>${cobranca.cliente_nome}</strong>
        <span>Venda #${cobranca.id} · Vencimento: ${vencimento} · Atrasada há ${cobranca.dias_atraso} dia(s)</span>
        <span>Valor original: ${dinheiro(cobranca.total)}</span>
        <b>Valor atualizado: ${dinheiro(cobranca.total_atualizado)}</b>
        ${avisoInfo}
      </div>
      <div class="cobranca-acoes">
        <button type="button" class="btn-whatsapp btn-avisar-lista" data-id="${cobranca.id}">Avisar pelo WhatsApp</button>
        <button type="button" class="btn-acessar-conta" data-id="${cobranca.id}">Acessar conta ›</button>
      </div>
    `;
    listaCobrancas.appendChild(card);
  });

  listaCobrancas.querySelectorAll('.btn-acessar-conta').forEach((botao) => {
    botao.addEventListener('click', () => {
      window.location.href = `cobranca-detalhe.html?id=${botao.dataset.id}`;
    });
  });

  listaCobrancas.querySelectorAll('.btn-avisar-lista').forEach((botao) => {
    botao.addEventListener('click', async () => {
      const textoOriginal = botao.textContent;
      botao.disabled = true;
      botao.textContent = 'Enviando...';
      mensagemCobranca.classList.remove('mensagem-erro');
      try {
        const resposta = await fetch(`${API_URL}/cobrancas/${botao.dataset.id}/whatsapp`, { method: 'POST' });
        const resultado = await resposta.json();
        if (!resposta.ok) throw new Error(resultado.err || 'Falha ao enviar aviso pelo WhatsApp');
        mensagemCobranca.textContent = 'Aviso enviado pelo WhatsApp com sucesso.';
        carregarCobrancas();
      } catch (err) {
        mensagemCobranca.textContent = err.message;
        mensagemCobranca.classList.add('mensagem-erro');
        botao.disabled = false;
        botao.textContent = textoOriginal;
      }
    });
  });
}

document.getElementById('btnVoltar').addEventListener('click', () => { window.location.href = 'hub.html'; });
carregarCobrancas();
