if (sessionStorage.getItem('autenticado') !== 'true') {
  window.location.href = 'login.html';
}

document.getElementById('btnVoltar').addEventListener('click', () => { window.location.href = 'hub.html'; });
