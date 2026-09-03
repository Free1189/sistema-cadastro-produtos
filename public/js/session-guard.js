// Redireciona para o login sempre que a API responder 401/403 (sessão expirada ou inexistente).
(function () {
  const fetchOriginal = window.fetch;

  window.fetch = async function (...args) {
    const resposta = await fetchOriginal(...args);

    if ((resposta.status === 401 || resposta.status === 403) && !window.location.pathname.endsWith('login.html')) {
      sessionStorage.removeItem('autenticado');
      sessionStorage.removeItem('perfil');
      window.location.href = 'login.html';
    }

    return resposta;
  };
})();
