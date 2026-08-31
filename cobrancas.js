if (sessionStorage.getItem('autenticado') !== 'true') {
  window.location.href = 'login.html';
}

const API_URL = 'http://localhost:3000';
const listaCobrancas = document.getElementById('listaCobrancas');
const cobrancasVazio = document.getElementById('cobrancasVazio');
const quantidadeCobrancas = document.getElementById('quantidadeCobrancas');
const mensagemCobranca = document.getElementById('mensagemCobranca');

function dinheiro(valor) {
  return Number(valor).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function telefoneWhatsApp(telefone) {
  const numeros = String(telefone || '').replace(/\D/g, '');
  return numeros.length >= 10 ? `55${numeros}` : '';
}

async function carregarCobrancas() {
  await fetch(`${API_URL}/cobrancas/sincronizar`, { method: 'POST' });
  const resposta = await fetch(`${API_URL}/cobrancas/atrasadas`);
  const cobrancas = await resposta.json();
  listaCobrancas.innerHTML = '';
  quantidadeCobrancas.textContent = cobrancas.length;
  cobrancasVazio.hidden = cobrancas.length > 0;

  cobrancas.forEach((cobranca) => {
    const vencimento = new Date(`${cobranca.vencimento}T12:00:00`).toLocaleDateString('pt-BR');
    const telefone = telefoneWhatsApp(cobranca.telefone);
    const mensagem = `Olá, ${cobranca.cliente_nome}. Identificamos uma condicional vencida em ${vencimento}, no valor de ${dinheiro(cobranca.total_atualizado)}. Podemos verificar a regularização? Poderão ser aplicados juros conforme as condições da venda.`;
    const card = document.createElement('article');
    card.className = 'cobranca-card';
    card.innerHTML = `
      <div class="cobranca-dados">
        <strong>${cobranca.cliente_nome}</strong>
        <span>Venda #${cobranca.id} · Vencimento: ${vencimento}</span>
        <span>Valor original: ${dinheiro(cobranca.total)}</span>
        <b>Valor atualizado: ${dinheiro(cobranca.total_atualizado)}</b>
      </div>
      <div class="cobranca-acoes">
        <label>Juros (%)</label>
        <input class="percentual-juros" type="number" min="0" max="100" step="0.01" value="${cobranca.juros > 0 ? ((cobranca.juros / cobranca.total) * 100).toFixed(2) : '0'}" data-id="${cobranca.id}">
        <button type="button" class="btn-aplicar-juros" data-id="${cobranca.id}">Aplicar juros</button>
        <button type="button" class="btn-pagar-cobranca sem-juros" data-id="${cobranca.id}" data-com-juros="false">Marcar paga sem juros</button>
        <button type="button" class="btn-pagar-cobranca com-juros" data-id="${cobranca.id}" data-com-juros="true">Marcar paga com juros</button>
        <button type="button" class="btn-asaas" data-id="${cobranca.id}">Gerar cobrança Asaas</button>
        ${telefone ? `<a class="btn-whatsapp" target="_blank" href="https://wa.me/${telefone}?text=${encodeURIComponent(mensagem)}">Avisar pelo WhatsApp</a>` : '<span class="sem-telefone">Telefone não cadastrado</span>'}
      </div>
    `;
    listaCobrancas.appendChild(card);
  });

  listaCobrancas.querySelectorAll('.btn-aplicar-juros').forEach((botao) => {
    botao.addEventListener('click', async () => {
      const percentual = listaCobrancas.querySelector(`.percentual-juros[data-id="${botao.dataset.id}"]`).value;
      const resposta = await fetch(`${API_URL}/cobrancas/${botao.dataset.id}/juros`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ percentual })
      });
      const resultado = await resposta.json();
      if (!resposta.ok) { mensagemCobranca.textContent = resultado.err; return; }
      mensagemCobranca.textContent = 'Juros aplicados com sucesso.';
      carregarCobrancas();
    });
  });

  listaCobrancas.querySelectorAll('.btn-pagar-cobranca').forEach((botao) => {
    botao.addEventListener('click', async () => {
      const percentual = Number.parseFloat(
        listaCobrancas.querySelector(`.percentual-juros[data-id="${botao.dataset.id}"]`).value
      ) || 0;
      const resposta = await fetch(`${API_URL}/cobrancas/${botao.dataset.id}/pagar`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ comJuros: botao.dataset.comJuros === 'true', percentual })
      });
      const resultado = await resposta.json();
      if (!resposta.ok) { mensagemCobranca.textContent = resultado.err; return; }
      mensagemCobranca.textContent = `Cobrança paga: ${dinheiro(resultado.total_pago)}.`;
      carregarCobrancas();
    });
  });

  listaCobrancas.querySelectorAll('.btn-asaas').forEach((botao) => {
    botao.addEventListener('click', async () => {
      botao.disabled = true;
      const resposta = await fetch(`${API_URL}/cobrancas/${botao.dataset.id}/asaas`, { method: 'POST' });
      const resultado = await resposta.json();
      botao.disabled = false;

      if (!resposta.ok) {
        mensagemCobranca.textContent = resultado.err || 'Não foi possível gerar a cobrança.';
        return;
      }

      const link = resultado.bankSlipUrl || resultado.invoiceUrl;
      mensagemCobranca.innerHTML = link
        ? `Cobrança criada. <a href="${link}" target="_blank" rel="noopener">Abrir cobrança</a>`
        : `Cobrança criada no Asaas: ${resultado.id}`;
    });
  });
}

document.getElementById('btnVoltar').addEventListener('click', () => { window.location.href = 'hub.html'; });
carregarCobrancas();
