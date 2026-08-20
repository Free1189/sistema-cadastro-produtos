const loginForm = document.getElementById('loginForm');
const mensagemLogin = document.getElementById('mensagemLogin');

loginForm.addEventListener('submit', async (evento) => {
  evento.preventDefault();
  mensagemLogin.textContent = '';

  const usuario = document.getElementById('usuario').value.trim();
  const senha = document.getElementById('senha').value;

  try {
    const resposta = await fetch('http://localhost:3000/login', {
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
