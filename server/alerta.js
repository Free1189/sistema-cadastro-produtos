const { execFile } = require('child_process');
const path = require('path');

const SCRIPT_PATH = path.join(__dirname, '..', 'scripts', 'alertar.ps1');

function dispararAlerta(titulo, mensagem) {
  execFile('powershell.exe', [
    '-ExecutionPolicy', 'Bypass',
    '-WindowStyle', 'Hidden',
    '-File', SCRIPT_PATH,
    '-Titulo', titulo,
    '-Mensagem', mensagem
  ], (err) => {
    if (err) console.error('Erro ao disparar alerta local:', err.message);
  });
}

module.exports = { dispararAlerta };
