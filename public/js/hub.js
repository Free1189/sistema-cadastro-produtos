if (sessionStorage.getItem('autenticado') !== 'true') {
  window.location.href = 'login.html';
}

const btnSair = document.getElementById('btnSair');
const hubMensagem = document.getElementById('hubMensagem');

btnSair.addEventListener('click', async () => {
  try {
    await fetch('/logout', { method: 'POST' });
  } catch (erro) {
    console.error('Erro ao encerrar sessão no servidor:', erro);
  }
  sessionStorage.removeItem('autenticado');
  sessionStorage.removeItem('perfil');
  window.location.href = 'login.html';
});

const perfil = sessionStorage.getItem('perfil');
const perfisComAcessoTotal = ['admin', 'relatorios'];

const acessoNegado = sessionStorage.getItem('acessoNegado');
if (acessoNegado) {
  alert(`Acesso negado: o perfil de vendas não tem acesso a ${acessoNegado}.`);
  sessionStorage.removeItem('acessoNegado');
}

document.querySelectorAll('.hub-card').forEach((card) => {
  card.addEventListener('click', (evento) => {
    if (card.dataset.perfil === 'admin' && !perfisComAcessoTotal.includes(perfil)) {
      evento.preventDefault();
      alert('Acesso negado: seu perfil não tem permissão para esta área.');
      return;
    }

    if (!card.dataset.emBreve) {
      return;
    }

    evento.preventDefault();
    hubMensagem.textContent = `${card.dataset.emBreve} estará disponível em breve.`;
  });
});
