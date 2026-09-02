if (sessionStorage.getItem('autenticado') !== 'true') {
  window.location.href = 'login.html';
}

const perfil = sessionStorage.getItem('perfil');
const perfisComAcessoTotal = ['admin', 'relatorios'];
const btnVoltar = document.getElementById('btnVoltar');
const hubMensagem = document.getElementById('hubMensagem');

btnVoltar.addEventListener('click', () => {
  window.location.href = 'hub.html';
});

document.querySelectorAll('.operacao-card').forEach((card) => {
  card.addEventListener('click', () => {
    if (card.dataset.perfil === 'admin' && !perfisComAcessoTotal.includes(perfil)) {
      hubMensagem.textContent = 'Acesso negado: este módulo é restrito ao perfil administrativo.';
      return;
    }

    window.location.href = card.dataset.link;
  });
});
