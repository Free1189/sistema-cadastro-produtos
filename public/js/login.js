const loginForm = document.getElementById('loginForm');
const mensagemLogin = document.getElementById('mensagemLogin');
const campoUsuario = document.getElementById('usuario');
const campoSenha = document.getElementById('senha');

campoUsuario.addEventListener('keydown', (evento) => {
  if (evento.key === 'Enter') {
    evento.preventDefault();
    campoSenha.focus();
  }
});

campoUsuario.focus();

loginForm.addEventListener('submit', async (evento) => {
  evento.preventDefault();
  mensagemLogin.textContent = '';

  const usuario = document.getElementById('usuario').value.trim();
  const senha = document.getElementById('senha').value;

  try {
    const resposta = await fetch('/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ usuario, senha })
    });

    const resultado = await resposta.json();

    if (!resposta.ok) {
      mensagemLogin.textContent = resultado.err || 'Usuário ou senha inválidos.';
      return;
    }

    sessionStorage.setItem('autenticado', 'true');
    sessionStorage.setItem('perfil', resultado.perfil);
    window.location.href = 'hub.html';
  } catch (erro) {
    console.error('Erro ao fazer login:', erro);
    mensagemLogin.textContent = 'Não foi possível conectar ao servidor.';
  }
});
