const fs = require('fs/promises');
const path = require('path');
const P = require('pino');
const qrcode = require('qrcode-terminal');
const makeWASocket = require('@whiskeysockets/baileys').default;
const { useMultiFileAuthState, DisconnectReason, fetchLatestBaileysVersion } = require('@whiskeysockets/baileys');

const AUTH_DIR = path.join(__dirname, 'auth_info_baileys');
const GRAPH_API_BASE = 'https://graph.facebook.com/v21.0';

let socket;
let qrExibido = false;
let conectando = false;
let reconnectTimeout = null;
let versaoConexao = 0;
let tentativasConsecutivas = 0;
let historicoDesconexao = [];
let codigoPareamentoSolicitado = false;
let usarPareamentoNumero = true;
let statusConexao = {
  conectado: false,
  estado: 'inicializando',
  ultimoCodigoDesconexao: null,
  ultimaAtualizacao: new Date().toISOString()
};

function providerWhatsApp() {
  return String(process.env.WHATSAPP_PROVIDER || 'baileys').trim().toLowerCase();
}

function tokenMeta() {
  return String(process.env.WHATSAPP_META_TOKEN || '').trim();
}

function phoneNumberIdMeta() {
  return String(process.env.WHATSAPP_META_PHONE_NUMBER_ID || '').trim();
}

function atualizarStatus(parcial) {
  statusConexao = {
    ...statusConexao,
    ...parcial,
    ultimaAtualizacao: new Date().toISOString()
  };
}

async function resetarSessaoWhatsApp() {
  try {
    await fs.rm(AUTH_DIR, { recursive: true, force: true });
    console.warn('Sessao do WhatsApp foi resetada para gerar novo pareamento via QR.');
  } catch (err) {
    console.error('Nao foi possivel resetar a sessao do WhatsApp:', err.message);
  }
}

function registrarDesconexao(codigo) {
  const agora = Date.now();
  historicoDesconexao.push({ codigo, ts: agora });
  historicoDesconexao = historicoDesconexao.filter((item) => agora - item.ts <= 120000);
  const instaveis = historicoDesconexao.filter((item) => item.codigo === 440 || item.codigo === 515).length;
  return instaveis;
}

function numeroPareamento() {
  const numero = String(process.env.WHATSAPP_PAIRING_NUMBER || '').replace(/\D/g, '');
  if (!numero) return null;
  const normalizado = numero.startsWith('55') ? numero : `55${numero}`;
  if (normalizado.length < 12 || normalizado.length > 13) return null;
  return normalizado;
}

async function conectarWhatsApp() {
  if (providerWhatsApp() === 'meta') {
    const token = tokenMeta();
    const phoneId = phoneNumberIdMeta();

    if (!token || !phoneId) {
      atualizarStatus({ estado: 'erro_config_meta', conectado: false, ultimoCodigoDesconexao: null });
      throw new Error('Configure WHATSAPP_META_TOKEN e WHATSAPP_META_PHONE_NUMBER_ID para usar a API da Meta');
    }

    if (token.startsWith('wati_')) {
      console.warn('O token informado parece ser de parceiro WATI e pode nao funcionar direto na Cloud API da Meta.');
    }

    atualizarStatus({ estado: 'conectado_meta_api', conectado: true, ultimoCodigoDesconexao: null });
    console.log('WhatsApp conectado via Meta Cloud API (sem QR).');
    return null;
  }

  if (conectando) return socket;
  if (socket && statusConexao.conectado) return socket;

  conectando = true;
  const tentativaAtual = ++versaoConexao;
  if (reconnectTimeout) {
    clearTimeout(reconnectTimeout);
    reconnectTimeout = null;
  }

  atualizarStatus({ estado: 'conectando', conectado: false });
  codigoPareamentoSolicitado = false;
  const { state, saveCreds } = await useMultiFileAuthState(path.join(__dirname, 'auth_info_baileys'));
  const { version } = await fetchLatestBaileysVersion();
  const numeroCodigo = usarPareamentoNumero ? numeroPareamento() : null;

  socket = makeWASocket({
    version,
    auth: state,
    logger: P({ level: 'silent' }),
    printQRInTerminal: false,
    browser: ['Marau Sistema', 'Chrome', '1.0.0'],
    syncFullHistory: false,
    markOnlineOnConnect: false
  });

  socket.ev.on('creds.update', saveCreds);
  socket.ev.on('connection.update', ({ connection, lastDisconnect, qr }) => {
    if (tentativaAtual !== versaoConexao) return;

    if (connection === 'connecting' && numeroCodigo && !codigoPareamentoSolicitado) {
      codigoPareamentoSolicitado = true;
      atualizarStatus({ estado: 'aguardando_codigo', conectado: false });
      socket.requestPairingCode(numeroCodigo)
        .then((codigo) => {
          const codigoLimpo = String(codigo || '').replace(/(.{4})/g, '$1 ').trim();
          console.log(`Codigo de pareamento WhatsApp (${numeroCodigo}): ${codigoLimpo}`);
          console.log('No celular: WhatsApp > Dispositivos conectados > Conectar com numero de telefone.');
        })
        .catch((err) => {
          codigoPareamentoSolicitado = false;
          usarPareamentoNumero = false;
          atualizarStatus({ estado: 'aguardando_qr', conectado: false });
          console.error('Falha ao gerar codigo de pareamento. Voltando para QR:', err.message);
        });
    }

    if (qr && !qrExibido) {
      if (numeroCodigo) return;
      qrExibido = true;
      atualizarStatus({ estado: 'aguardando_qr', conectado: false });
      console.log('Escaneie este QR Code com o WhatsApp conectado:');
      qrcode.generate(qr, { small: true });
    }

    if (connection === 'open') {
      conectando = false;
      tentativasConsecutivas = 0;
      historicoDesconexao = [];
      qrExibido = false;
      atualizarStatus({ estado: 'conectado', conectado: true, ultimoCodigoDesconexao: null });
      console.log('WhatsApp conectado para cobranças automáticas.');
    }

    if (connection === 'close') {
      conectando = false;
      const codigo = lastDisconnect?.error?.output?.statusCode;
      tentativasConsecutivas += 1;
      const desconexoesInstaveis = registrarDesconexao(codigo || 0);
      qrExibido = false;
      atualizarStatus({ estado: 'desconectado', conectado: false, ultimoCodigoDesconexao: codigo || null });
      // 440 = sessão substituída por outra instância; reconectar piora o loop
      const conexaoSubstituida = codigo === 440;
      const reinicioRequerido = codigo === 515;

      if (codigo === DisconnectReason.loggedOut || conexaoSubstituida) {
        console.error(`WhatsApp desconectado permanentemente (codigo: ${codigo}). Resetando sessao para novo QR...`);
        atualizarStatus({ estado: 'reautenticando_qr', conectado: false });
        resetarSessaoWhatsApp().then(() => {
          tentativasConsecutivas = 0;
          historicoDesconexao = [];
          reconnectTimeout = setTimeout(() => {
            reconnectTimeout = null;
            conectarWhatsApp().catch((err) => console.error('Erro na reconexão:', err.message));
          }, 8000);
        });
      } else if (reinicioRequerido || codigo !== DisconnectReason.loggedOut) {
        const atraso = Math.min(5000 * tentativasConsecutivas, 30000);
        console.warn(`WhatsApp desconectou (codigo: ${codigo || 'desconhecido'}). Nova tentativa em ${Math.round(atraso / 1000)}s.`);
        reconnectTimeout = setTimeout(() => {
          reconnectTimeout = null;
          conectarWhatsApp().catch((err) => console.error('Erro na reconexão:', err.message));
        }, atraso);
      }
    }
  });

  return socket;
}

function telefoneParaJid(telefone) {
  const numeros = String(telefone || '').replace(/\D/g, '');
  if (numeros.length < 10) return null;
  return `${numeros.startsWith('55') ? numeros : `55${numeros}`}@s.whatsapp.net`;
}

async function enviarCobranca(telefone, mensagem) {
  if (providerWhatsApp() === 'meta') {
    const token = tokenMeta();
    const phoneId = phoneNumberIdMeta();
    const destino = String(telefone || '').replace(/\D/g, '');
    if (!token || !phoneId) throw new Error('Meta API nao configurada');
    if (!destino || destino.length < 10) throw new Error('Telefone do cliente inválido');

    const numeroDestino = destino.startsWith('55') ? destino : `55${destino}`;
    const resposta = await fetch(`${GRAPH_API_BASE}/${phoneId}/messages`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        to: numeroDestino,
        type: 'text',
        text: { body: String(mensagem || '') }
      })
    });

    const resultado = await resposta.json().catch(() => ({}));
    if (!resposta.ok) {
      throw new Error(resultado?.error?.message || 'Falha ao enviar mensagem pela Meta API');
    }
    return resultado;
  }

  if (!socket) throw new Error('WhatsApp ainda não está conectado');
  const jid = telefoneParaJid(telefone);
  if (!jid) throw new Error('Telefone do cliente inválido');
  return socket.sendMessage(jid, { text: mensagem });
}

function obterStatusWhatsApp() {
  return statusConexao;
}

module.exports = { conectarWhatsApp, enviarCobranca, obterStatusWhatsApp };
