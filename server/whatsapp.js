const path = require('path');
const qrcodeTerminal = require('qrcode-terminal');
const QRCode = require('qrcode');
const { Client, LocalAuth } = require('whatsapp-web.js');
const { dispararAlerta } = require('./alerta');

const QR_IMAGE_PATH = path.join(__dirname, 'whatsapp-qr.png');
const AUTH_DIR = path.join(__dirname, '..', '.wwebjs_auth');
const GRAPH_API_BASE = 'https://graph.facebook.com/v21.0';

let client = null;
let conectando = false;
let reconnectTimeout = null;
let statusConexao = {
  conectado: false,
  estado: 'inicializando',
  ultimoCodigoDesconexao: null,
  ultimaAtualizacao: new Date().toISOString()
};

function providerWhatsApp() {
  return String(process.env.WHATSAPP_PROVIDER || 'webjs').trim().toLowerCase();
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

  if (conectando) return client;
  if (client && statusConexao.conectado) return client;

  conectando = true;
  if (reconnectTimeout) {
    clearTimeout(reconnectTimeout);
    reconnectTimeout = null;
  }

  atualizarStatus({ estado: 'conectando', conectado: false });

  client = new Client({
    authStrategy: new LocalAuth({ dataPath: AUTH_DIR }),
    puppeteer: {
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    }
  });

  client.on('qr', (qr) => {
    atualizarStatus({ estado: 'aguardando_qr', conectado: false });
    QRCode.toFile(QR_IMAGE_PATH, qr, { width: 320 })
      .catch((err) => console.error('Erro ao salvar imagem do QR Code:', err.message));
    console.log('Escaneie este QR Code com o WhatsApp conectado (abra http://localhost:3000/whatsapp/qr no navegador):');
    qrcodeTerminal.generate(qr, { small: true });
  });

  client.on('authenticated', () => {
    atualizarStatus({ estado: 'autenticado', conectado: false });
    console.log('WhatsApp autenticado, finalizando conexão...');
  });

  client.on('auth_failure', (mensagem) => {
    atualizarStatus({ estado: 'falha_autenticacao', conectado: false });
    console.error('Falha na autenticação do WhatsApp:', mensagem);
  });

  client.on('ready', () => {
    conectando = false;
    atualizarStatus({ estado: 'conectado', conectado: true, ultimoCodigoDesconexao: null });
    console.log('WhatsApp conectado para cobranças automáticas.');
  });

  client.on('disconnected', (motivo) => {
    conectando = false;
    atualizarStatus({ estado: 'desconectado', conectado: false, ultimoCodigoDesconexao: motivo || null });
    console.warn('WhatsApp desconectou:', motivo);
    client = null;
    reconnectTimeout = setTimeout(() => {
      reconnectTimeout = null;
      conectarWhatsApp().catch((err) => console.error('Erro na reconexão:', err.message));
    }, 8000);
  });

  client.initialize().catch((err) => {
    conectando = false;
    atualizarStatus({ estado: 'erro_conexao', conectado: false });
    console.error('Erro ao inicializar o WhatsApp:', err.message);
  });

  return client;
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

  if (!client || !statusConexao.conectado) throw new Error('WhatsApp ainda não está conectado');
  const numeros = String(telefone || '').replace(/\D/g, '');
  if (numeros.length < 10) throw new Error('Telefone do cliente inválido');
  const numeroCompleto = numeros.startsWith('55') ? numeros : `55${numeros}`;

  const idResolvido = await client.getNumberId(numeroCompleto);
  if (!idResolvido) throw new Error('Este número não possui WhatsApp ativo');

  return client.sendMessage(idResolvido._serialized, mensagem);
}

function obterStatusWhatsApp() {
  return statusConexao;
}

let alertaQuedaDisparado = false;

function verificarSaudeConexao() {
  if (providerWhatsApp() === 'meta') return;

  if (!statusConexao.conectado) {
    if (!alertaQuedaDisparado) {
      alertaQuedaDisparado = true;
      dispararAlerta(
        'WhatsApp desconectado',
        `O sistema de mensagens do Marau Luz e Água está fora do ar (estado: ${statusConexao.estado}). O sistema tenta reconectar sozinho, mas verifique se persistir.`
      );
    }
  } else if (alertaQuedaDisparado) {
    alertaQuedaDisparado = false;
    dispararAlerta('WhatsApp reconectado', 'O sistema de mensagens do Marau Luz e Água voltou a funcionar normalmente.');
  }
}

setInterval(verificarSaudeConexao, 3 * 60 * 1000);

module.exports = { conectarWhatsApp, enviarCobranca, obterStatusWhatsApp };
