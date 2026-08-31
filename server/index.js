const express = require('express'); //importa as bibliotecas
const cors = require('cors');
const multer = require('multer');
const { XMLParser } = require('fast-xml-parser');
const PDFDocument = require('pdfkit');
const { conectarWhatsApp, enviarCobranca, obterStatusWhatsApp } = require('./whatsapp');
const { criarCobranca, criarCobrancaUnica, consultarCobranca } = require('./asaas');
require('dotenv').config();

const db = require('./db'); // importa conexão do banco 



const app = express();  // cria a aplicação do servidor 
app.use(cors());
app.use(express.json()); // ensino o servidor dados JSON
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 }
});

async function enviarAvisosDeVencimento() {
  try {
    const resultado = await db.query(
      `SELECT v.id, v.cliente_nome, v.total, v.vencimento, c.telefone
       FROM vendas v
       JOIN clientes c ON c.id = v.cliente_id
       LEFT JOIN avisos_cobranca a ON a.venda_id = v.id AND a.tipo = 'vencimento'
       WHERE v.tipo_pagamento = 'futuro'
         AND v.status = 'finalizada'
         AND v.vencimento = CURRENT_DATE + INTERVAL '1 day'
         AND a.venda_id IS NULL`
    );

    for (const venda of resultado.rows) {
      const mensagem = `*Mensagem automática do sistema Marau Luz e Água*\n\nOlá, ${venda.cliente_nome}. Lembrete: sua condicional no valor de R$ ${Number(venda.total).toFixed(2).replace('.', ',')} vence amanhã (${new Date(venda.vencimento).toLocaleDateString('pt-BR')}). O atraso poderá gerar juros conforme as condições da venda.\n\nEste aviso foi enviado automaticamente pelo sistema. Agradecemos sua compreensão!`;
      try {
        await enviarCobranca(venda.telefone, mensagem);
        await db.query(
          `INSERT INTO avisos_cobranca (venda_id, tipo) VALUES ($1, 'vencimento')
           ON CONFLICT (venda_id, tipo) DO UPDATE SET enviado_em = CURRENT_TIMESTAMP`,
          [venda.id]
        );
        console.log(`Aviso automático de vencimento enviado para a venda #${venda.id}`);
      } catch (err) {
        console.error(`Não foi possível avisar (vencimento) a venda #${venda.id}:`, err.message);
      }
    }
  } catch (err) {
    console.error('Erro no agendador de avisos de vencimento:', err);
  }
}

async function enviarAvisosDeAtraso() {
  try {
    const resultado = await db.query(
      `SELECT v.id, v.cliente_nome, v.vencimento, v.total, v.juros,
              v.total + v.juros AS total_atualizado,
              (CURRENT_DATE - v.vencimento)::int AS dias_atraso,
              c.telefone
       FROM vendas v
       JOIN clientes c ON c.id = v.cliente_id
       LEFT JOIN avisos_cobranca a ON a.venda_id = v.id AND a.tipo = 'atraso'
       WHERE v.tipo_pagamento = 'futuro'
         AND v.status = 'finalizada'
         AND v.status_pagamento = 'pendente'
         AND v.vencimento < CURRENT_DATE
         AND a.venda_id IS NULL`
    );

    for (const venda of resultado.rows) {
      if (!venda.telefone) continue;

      const valorAtualizado = Number(venda.total_atualizado).toFixed(2).replace('.', ',');
      const dataVencimento = new Date(venda.vencimento).toLocaleDateString('pt-BR');
      const mensagem = `*Mensagem automática do sistema Marau Luz e Água*\n\nOlá, ${venda.cliente_nome}. Identificamos que sua conta está em atraso há ${venda.dias_atraso} dia(s), com vencimento em ${dataVencimento}. Valor atualizado: R$ ${valorAtualizado}. Por favor, regularize o pagamento o quanto antes.\n\nEste aviso foi enviado automaticamente pelo sistema. Agradecemos sua compreensão!`;

      try {
        await enviarCobranca(venda.telefone, mensagem);
        await db.query(
          `INSERT INTO avisos_cobranca (venda_id, tipo) VALUES ($1, 'atraso')
           ON CONFLICT (venda_id, tipo) DO UPDATE SET enviado_em = CURRENT_TIMESTAMP`,
          [venda.id]
        );
        console.log(`Aviso automático de atraso enviado para a venda #${venda.id}`);
      } catch (err) {
        console.error(`Não foi possível avisar (atraso) a venda #${venda.id}:`, err.message);
      }
    }
  } catch (err) {
    console.error('Erro no agendador de avisos de atraso:', err);
  }
}

function agendarTarefaDiaria(hora, minuto, tarefa) {
  function proximaExecucao() {
    const agora = new Date();
    const proxima = new Date(agora.getFullYear(), agora.getMonth(), agora.getDate(), hora, minuto, 0, 0);
    if (proxima <= agora) {
      proxima.setDate(proxima.getDate() + 1);
    }
    return proxima;
  }

  const espera = proximaExecucao().getTime() - Date.now();
  setTimeout(() => {
    tarefa();
    setInterval(tarefa, 24 * 60 * 60 * 1000);
  }, espera);
}

async function sincronizarPagamentosAsaas(asaasPaymentId = null) {
  try {
    const cobrancas = await db.query(
      `SELECT asaas_payment_id, grupo_id, venda_ids, valor_cobrado
       FROM cobrancas_asaas
       WHERE ($1::text IS NULL AND (status NOT IN ('RECEIVED', 'CONFIRMED') OR valor_recebido < valor_cobrado))
          OR asaas_payment_id = $1`,
      [asaasPaymentId]
    );

    for (const cobranca of cobrancas.rows) {
      try {
        const pagamento = await consultarCobranca(cobranca.asaas_payment_id);
        let valorPagoAsaas = Number(pagamento.receivedValue ?? pagamento.paidValue ?? 0);
        const pagamentoConfirmado = ['RECEIVED', 'CONFIRMED'].includes(pagamento.status);
        const pagamentoParcial = pagamento.status === 'PARTIALLY_RECEIVED';
        if (valorPagoAsaas <= 0 && pagamentoConfirmado) {
          valorPagoAsaas = Number(pagamento.value) || 0;
        }
        if (!pagamentoConfirmado && !pagamentoParcial && valorPagoAsaas <= 0) continue;

        await db.query(
          `UPDATE cobrancas_asaas SET status = $1, valor_recebido = $2 WHERE asaas_payment_id = $3`,
          [pagamentoConfirmado ? pagamento.status : (valorPagoAsaas > 0 ? 'PARTIALLY_RECEIVED' : 'PENDING'), valorPagoAsaas, cobranca.asaas_payment_id]
        );

        const recebidoGrupo = await db.query(
          `SELECT COALESCE(SUM(valor_recebido), 0)::numeric AS total_recebido
         FROM cobrancas_asaas WHERE grupo_id = $1`,
          [cobranca.grupo_id]
        );
        let restantePago = Number(recebidoGrupo.rows[0].total_recebido);
        const vendasGrupo = await db.query(
          `SELECT id, total, juros
         FROM vendas
         WHERE id = ANY($1::int[])
         ORDER BY criado_em ASC, id ASC`,
          [cobranca.venda_ids]
        );
        for (const venda of vendasGrupo.rows) {
          const totalVenda = Number(venda.total) + Number(venda.juros);
          const pagoVenda = Math.min(Math.max(restantePago, 0), totalVenda);
          await db.query(
            `UPDATE vendas SET valor_pago = $1,
             saldo_devedor = GREATEST(total + juros - $1, 0),
             status_pagamento = CASE WHEN $1 >= total + juros THEN 'pago' ELSE 'pendente' END,
             tipo_pagamento = CASE WHEN $1 >= total + juros THEN 'boleto' ELSE tipo_pagamento END,
             pago_em = CASE WHEN $1 >= total + juros THEN CURRENT_TIMESTAMP ELSE pago_em END
           WHERE id = $2`,
            [pagoVenda, venda.id]
          );
          restantePago -= pagoVenda;
        }
      } catch (err) {
        console.error(`Falha ao sincronizar cobrança Asaas ${cobranca.asaas_payment_id}:`, err.message);
      }
    }
  } catch (err) {
    console.error('Erro ao sincronizar pagamentos Asaas:', err.message);
  }
}

app.post('/login', (req, res) => {
  const { usuario, senha } = req.body;

  const usuarios = [
    {
      usuario: process.env.APP_USER_VENDAS,
      senha: process.env.APP_PASSWORD_VENDAS,
      perfil: 'vendas'
    },
    {
      usuario: process.env.APP_USER_ADMIN,
      senha: process.env.APP_PASSWORD_ADMIN,
      perfil: 'admin'
    },
    {
      usuario: process.env.APP_USER_RELATORIOS,
      senha: process.env.APP_PASSWORD_RELATORIOS,
      perfil: 'relatorios'
    }
  ];
  const usuarioEncontrado = usuarios.find(
    (conta) => conta.usuario === usuario && conta.senha === senha
  );

  if (usuarioEncontrado) {
    return res.json({ autenticado: true, perfil: usuarioEncontrado.perfil });
  }

  res.status(401).json({ err: 'Usuário ou senha inválidos' });
});

app.get('/clientes', async (req, res) => {
  const busca = String(req.query.busca || '').trim();

  try {
    const resultado = await db.query(
      `SELECT id, nome, cpf, telefone, cidade, rua, numero, bairro FROM clientes
       WHERE nome ILIKE $1 OR COALESCE(cpf, '') ILIKE $1
       ORDER BY nome LIMIT 10`,
      [`%${busca}%`]
    );
    res.json(resultado.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ err: 'Erro ao buscar clientes' });
  }
});

app.get('/clientes/:id', async (req, res) => {
  const id = Number.parseInt(req.params.id, 10);

  if (Number.isNaN(id)) {
    return res.status(400).json({ err: 'ID do cliente inválido' });
  }

  try {
    const resultado = await db.query(
      'SELECT id, nome, cpf, telefone, cidade, rua, numero, bairro FROM clientes WHERE id = $1',
      [id]
    );

    if (resultado.rowCount === 0) {
      return res.status(404).json({ err: 'Cliente não encontrado' });
    }

    res.json(resultado.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ err: 'Erro ao buscar cliente' });
  }
});

function documentoValido(documento) {
  const numeros = String(documento || '').replace(/\D/g, '');

  if (/^(\d)\1+$/.test(numeros)) return false;

  if (numeros.length === 11) {
    const calcularDigito = (tamanho) => {
      let soma = 0;
      for (let indice = 0; indice < tamanho; indice++) {
        soma += Number(numeros[indice]) * (tamanho + 1 - indice);
      }
      const resto = (soma * 10) % 11;
      return resto === 10 ? 0 : resto;
    };
    return calcularDigito(9) === Number(numeros[9]) && calcularDigito(10) === Number(numeros[10]);
  }

  if (numeros.length === 14) {
    const pesos = [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
    const calcularDigito = (base, pesosUsados) => {
      const soma = base.split('').reduce((total, numero, indice) => total + Number(numero) * pesosUsados[indice], 0);
      const resto = soma % 11;
      return resto < 2 ? 0 : 11 - resto;
    };
    const primeiro = calcularDigito(numeros.slice(0, 12), pesos.slice(1));
    const segundo = calcularDigito(numeros.slice(0, 12) + primeiro, pesos);
    return primeiro === Number(numeros[12]) && segundo === Number(numeros[13]);
  }

  return false;
}

app.post('/caixa/comprovante', (req, res) => {
  const { valor, descricao, metodoPagamento, documento } = req.body;
  const valorNumerico = Number.parseFloat(valor);
  const metodosValidos = ['dinheiro', 'pix', 'cartao_debito', 'cartao_credito'];

  if (!Number.isFinite(valorNumerico) || valorNumerico <= 0 || !descricao || !metodosValidos.includes(metodoPagamento)) {
    return res.status(400).json({ err: 'Preencha valor, descrição e método de pagamento válidos' });
  }

  if (documento && !documentoValido(documento)) {
    return res.status(400).json({ err: 'CPF ou CNPJ inválido' });
  }

  const nomesMetodos = {
    dinheiro: 'Dinheiro',
    pix: 'PIX',
    cartao_debito: 'Cartão de débito',
    cartao_credito: 'Cartão de crédito'
  };
  const cupom = new PDFDocument({ size: [226, 500], margin: 16 });
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', 'inline; filename="comprovante-caixa.pdf"');
  cupom.pipe(res);

  const dinheiro = (numero) => `R$ ${numero.toFixed(2).replace('.', ',')}`;
  cupom.font('Helvetica-Bold').fontSize(11).text('MARAU LUZ E AGUA', { align: 'center' });
  cupom.font('Helvetica').fontSize(7).text('COMPROVANTE DE PAGAMENTO', { align: 'center' });
  cupom.moveDown(0.5).moveTo(16, cupom.y).lineTo(210, cupom.y).stroke();
  cupom.moveDown().fontSize(8).text(`Data: ${new Date().toLocaleString('pt-BR')}`);
  cupom.text(`Pagamento: ${nomesMetodos[metodoPagamento]}`);
  if (documento) cupom.text(`CPF/CNPJ: ${documento}`);
  cupom.moveDown().font('Helvetica-Bold').text(descricao, { width: 194 });
  cupom.moveDown().fontSize(14).text(`TOTAL ${dinheiro(valorNumerico)}`, { align: 'center' });
  cupom.moveDown().font('Helvetica').fontSize(7)
    .text('Documento sem valor fiscal. A emissão de NFC-e depende de integração fiscal homologada.', { align: 'center', width: 194 });
  cupom.end();
});

app.post('/clientes', async (req, res) => {
  const { nome, cpf, telefone, cidade, rua, numero, bairro } = req.body;

  if (!nome || !String(nome).trim() || !cpf || !telefone || !cidade || !rua || !numero || !bairro) {
    return res.status(400).json({ err: 'Preencha todos os campos do cliente' });
  }

  if (!documentoValido(cpf)) {
    return res.status(400).json({ err: 'CPF ou CNPJ inválido' });
  }

  try {
    const resultado = await db.query(
      `INSERT INTO clientes (nome, cpf, telefone, cidade, rua, numero, bairro)
       VALUES ($1, NULLIF($2, ''), NULLIF($3, ''), NULLIF($4, ''), NULLIF($5, ''), NULLIF($6, ''), NULLIF($7, ''))
       RETURNING id, nome, cpf, telefone, cidade, rua, numero, bairro`,
      [
        String(nome).trim(), String(cpf || '').trim(), String(telefone || '').trim(),
        String(cidade || '').trim(), String(rua || '').trim(), String(numero || '').trim(),
        String(bairro || '').trim()
      ]
    );
    res.status(201).json(resultado.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(400).json({ err: 'Não foi possível cadastrar o cliente' });
  }
});

app.put('/clientes/:id', async (req, res) => {
  const id = Number.parseInt(req.params.id, 10);
  const { nome, cpf, telefone, cidade, rua, numero, bairro } = req.body;

  if (Number.isNaN(id) || !nome || !String(nome).trim() || !cpf || !telefone || !cidade || !rua || !numero || !bairro) {
    return res.status(400).json({ err: 'Preencha todos os campos do cliente' });
  }

  if (!documentoValido(cpf)) {
    return res.status(400).json({ err: 'CPF ou CNPJ inválido' });
  }

  try {
    const resultado = await db.query(
      `UPDATE clientes
       SET nome = $1, cpf = NULLIF($2, ''), telefone = NULLIF($3, ''),
           cidade = NULLIF($4, ''), rua = NULLIF($5, ''),
           numero = NULLIF($6, ''), bairro = NULLIF($7, '')
       WHERE id = $8
       RETURNING id, nome, cpf, telefone, cidade, rua, numero, bairro`,
      [
        String(nome).trim(), String(cpf || '').trim(), String(telefone || '').trim(),
        String(cidade || '').trim(), String(rua || '').trim(), String(numero || '').trim(),
        String(bairro || '').trim(), id
      ]
    );

    if (resultado.rowCount === 0) {
      return res.status(404).json({ err: 'Cliente não encontrado' });
    }

    res.json(resultado.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(400).json({ err: 'Não foi possível editar o cliente' });
  }
});

app.delete('/clientes/:id', async (req, res) => {
  const id = Number.parseInt(req.params.id, 10);

  if (Number.isNaN(id)) {
    return res.status(400).json({ err: 'ID do cliente inválido' });
  }

  try {
    const resultado = await db.query('DELETE FROM clientes WHERE id = $1', [id]);

    if (resultado.rowCount === 0) {
      return res.status(404).json({ err: 'Cliente não encontrado' });
    }

    res.status(204).send();
  } catch (err) {
    console.error(err);
    res.status(500).json({ err: 'Não foi possível excluir o cliente' });
  }
});

app.post('/vendas/condicional', async (req, res) => {
  const { clienteId, cliente, tipoPagamento, vencimento, desconto, itens } = req.body;

  if (!Array.isArray(itens) || itens.length === 0) {
    return res.status(400).json({ err: 'A venda precisa ter pelo menos um item' });
  }

  const itensVenda = itens.map((item) => ({
    ...item,
    id: Number.parseInt(item.id, 10),
    quantidade: Number.parseInt(item.quantidade, 10),
    preco: Number.parseFloat(item.preco)
  }));

  if (itensVenda.some((item) => Number.isNaN(item.id) || item.quantidade <= 0 || item.preco < 0)) {
    return res.status(400).json({ err: 'Item de venda inválido' });
  }

  const percentualDesconto = Math.min(Math.max(Number.parseFloat(desconto) || 0, 0), 100);
  const subtotal = itensVenda.reduce((total, item) => total + item.quantidade * item.preco, 0);
  const valorDesconto = subtotal * percentualDesconto / 100;
  const total = subtotal - valorDesconto;

  if (tipoPagamento === 'futuro' && !vencimento) {
    return res.status(400).json({ err: 'Informe o vencimento do pagamento' });
  }

  let clienteCadastrado = null;
  if (tipoPagamento === 'futuro') {
    if (!clienteId) {
      return res.status(400).json({ err: 'Pagamento futuro exige um cliente cadastrado' });
    }

    const clienteResultado = await db.query(
      'SELECT id, nome, cpf, telefone, cidade, rua, numero, bairro FROM clientes WHERE id = $1',
      [Number.parseInt(clienteId, 10)]
    );

    if (clienteResultado.rowCount === 0) {
      return res.status(400).json({ err: 'Cliente não encontrado no cadastro' });
    }
    clienteCadastrado = clienteResultado.rows[0];
  }

  const clienteBanco = await db.connect();
  let vendaCriada;

  try {
    await clienteBanco.query('BEGIN');

    if (tipoPagamento === 'futuro') {
      for (const item of itensVenda) {
        const produto = await clienteBanco.query(
          'SELECT estoque FROM produtos WHERE id = $1 FOR UPDATE', [item.id]
        );
        if (produto.rowCount === 0) throw new Error(`Produto ${item.id} não encontrado`);
        if (Number(produto.rows[0].estoque) < item.quantidade) {
          throw new Error(`Estoque insuficiente para o produto ${item.id}`);
        }
        await clienteBanco.query('UPDATE produtos SET estoque = estoque - $1 WHERE id = $2', [item.quantidade, item.id]);
      }
    }

    const contadorDia = await clienteBanco.query(
      `INSERT INTO venda_contadores_diarios (data_venda, ultimo_numero)
       VALUES (CURRENT_DATE, 1)
       ON CONFLICT (data_venda)
       DO UPDATE SET ultimo_numero = venda_contadores_diarios.ultimo_numero + 1
       RETURNING data_venda, ultimo_numero`
    );

    vendaCriada = await clienteBanco.query(
      `INSERT INTO vendas (cliente_id, cliente_nome, tipo_pagamento, vencimento, desconto, subtotal, total, itens, status, data_venda_dia, numero_venda_dia)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
        RETURNING id, cliente_nome, total, data_venda_dia, numero_venda_dia`,
      [
        clienteId || null,
        clienteCadastrado?.nome || cliente || 'Cliente Balcão',
        tipoPagamento,
        vencimento || null,
        percentualDesconto,
        subtotal,
        total,
        JSON.stringify(itensVenda),
        tipoPagamento === 'avista' ? 'aguardando_pagamento' : 'finalizada',
        contadorDia.rows[0].data_venda,
        contadorDia.rows[0].ultimo_numero
      ]
    );

    await clienteBanco.query('COMMIT');
  } catch (err) {
    await clienteBanco.query('ROLLBACK');
    console.error(err);
    return res.status(400).json({ err: err.message });
  } finally {
    clienteBanco.release();
  }

  if (tipoPagamento === 'avista') {
    return res.status(202).json({
      pendente: true,
      venda: vendaCriada.rows[0] || null,
      mensagem: 'Venda enviada ao Caixa para finalização do pagamento'
    });
  }

  const numeroCondicional = String(Date.now()).slice(-6);
  const dataEmissao = new Date().toLocaleDateString('pt-BR');
  const formatarValor = (valor) => `R$ ${valor.toFixed(2).replace('.', ',')}`;
  const documento = new PDFDocument({ margin: 36, size: 'A4', layout: 'landscape' });
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', 'inline; filename="condicional-venda.pdf"');
  documento.pipe(res);

  const larguraVia = 382;
  const alturaVia = 550;
  const margemEsquerda = 30;
  const margemDireita = 430;
  const clienteNome = clienteCadastrado?.nome || cliente || 'Cliente Balcão';
  const clienteEndereco = `${clienteCadastrado?.rua || 'Nao informado'}, ${clienteCadastrado?.numero || 's/n'} - ${clienteCadastrado?.bairro || 'Nao informado'} - ${clienteCadastrado?.cidade || 'Nao informado'}`;

  function texto(documentoPdf, textoInformacao, x, y, tamanho = 7, opcoes = {}) {
    documentoPdf.font('Helvetica').fontSize(tamanho).fillColor('#111111').text(textoInformacao, x, y, opcoes);
  }

  function linha(documentoPdf, x1, y, x2) {
    documentoPdf.moveTo(x1, y).lineTo(x2, y).strokeColor('#222222').lineWidth(0.7).stroke();
  }

  function desenharVia(x, incluirPromissoria) {
    let y = 24;
    documento.roundedRect(x, y, larguraVia, alturaVia, 2).strokeColor('#777777').lineWidth(0.5).stroke();
    y += 8;
    documento.font('Helvetica-Bold').fontSize(15).fillColor('#222222').text('MARAU', x + 12, y);
    documento.font('Helvetica-Bold').fontSize(8).text('LUZ E AGUA', x + 17, y + 17);
    texto(documento, 'Av. Joao Posser, 1544 - Marau / RS', x + 128, y + 1, 7, { width: 240 });
    texto(documento, 'CNPJ: 11.900.118/0001-92', x + 128, y + 11, 7);
    texto(documento, 'Fone (54) 3342 5090 WhatsApp', x + 128, y + 24, 7);
    texto(documento, 'marauluzeagua@marauluzeagua.com.br', x + 128, y + 36, 6.5, { width: 240 });
    y += 52;
    linha(documento, x + 7, y, x + larguraVia - 7);
    documento.font('Helvetica-Bold').fontSize(10).text('COMPROVANTE DE ENTREGA', x + 7, y + 5, { width: larguraVia - 14, align: 'center' });
    texto(documento, `Codigo: ${numeroCondicional}`, x + larguraVia - 104, y + 6, 7);
    y += 23;
    linha(documento, x + 7, y, x + larguraVia - 7);
    texto(documento, `Nome: ${clienteNome}`, x + 9, y + 5, 7, { width: larguraVia - 18 });
    texto(documento, `CPF/CNPJ: ${clienteCadastrado?.cpf || 'Nao informado'}`, x + 9, y + 16, 7);
    texto(documento, `Telefone: ${clienteCadastrado?.telefone || 'Nao informado'}`, x + 195, y + 16, 7);
    texto(documento, `Endereco: ${clienteEndereco}`, x + 9, y + 27, 7, { width: larguraVia - 18 });
    texto(documento, `Emissao: ${dataEmissao}`, x + 235, y + 38, 7);
    y += 51;
    linha(documento, x + 7, y, x + larguraVia - 7);
    documento.font('Helvetica-Bold').fontSize(7).text('FATURA', x + 9, y + 5);
    texto(documento, `Pagamento: ${tipoPagamento === 'futuro' ? 'Futuro' : 'A vista'}`, x + 52, y + 5, 7);
    texto(documento, `Vencimento: ${vencimento || 'A vista'}`, x + 215, y + 5, 7);
    y += 20;
    linha(documento, x + 7, y, x + larguraVia - 7);
    documento.font('Helvetica-Bold').fontSize(6.5).text('CODIGO', x + 9, y + 5);
    documento.text('DESCRICAO', x + 57, y + 5);
    documento.text('QTD.', x + 260, y + 5);
    documento.text('V. UNIT.', x + 294, y + 5);
    documento.text('TOTAL', x + 337, y + 5);
    y += 23;
    itensVenda.slice(0, 8).forEach((item) => {
      const linhaTotal = item.quantidade * item.preco;
      texto(documento, String(item.id), x + 9, y, 6.5);
      texto(documento, item.nome.slice(0, 30), x + 57, y, 6.5, { width: 195 });
      texto(documento, String(item.quantidade), x + 263, y, 6.5);
      texto(documento, formatarValor(item.preco), x + 294, y, 6.5);
      texto(documento, formatarValor(linhaTotal), x + 337, y, 6.5);
      y += 13;
    });
    linha(documento, x + 7, y + 2, x + larguraVia - 7);
    documento.font('Helvetica-Bold').fontSize(8).text(`TOTAL: ${formatarValor(total)}`, x + 250, y + 10);
    texto(documento, `Desconto: ${percentualDesconto.toFixed(2).replace('.', ',')}% - ${formatarValor(valorDesconto)}`, x + 9, y + 10, 7);
    texto(documento, 'Declaro que recebi os produtos acima discriminados.', x + 9, y + 27, 6.5, { width: larguraVia - 18 });
    documento.font('Helvetica-Bold').fontSize(7).text('Obs:', x + 9, y + 40);
    linha(documento, x + 125, y + 68, x + larguraVia - 12);
    texto(documento, clienteNome, x + 135, y + 71, 6.5, { width: 230, align: 'center' });

    if (incluirPromissoria) {
      const notaY = y + 85;
      documento.rect(x + 8, notaY, larguraVia - 16, 115).strokeColor('#555555').stroke();
      documento.save().rotate(-90, { origin: [x + 19, notaY + 58] });
      documento.font('Helvetica-Bold').fontSize(10).text('NOTA PROMISSORIA', x - 38, notaY + 58);
      documento.restore();
      documento.font('Helvetica-Bold').fontSize(9).text('MARAU LUZ E AGUA', x + 90, notaY + 7, { width: 275, align: 'center' });
      texto(documento, `No. ${numeroCondicional}   Emissao: ${dataEmissao}   Vencimento: ${vencimento}   ${formatarValor(total)}`, x + 35, notaY + 23, 6.5);
      texto(documento, `No vencimento, pagarei esta nota promissoria a Marau Luz e Agua o valor de ${formatarValor(total)}.`, x + 35, notaY + 38, 6.5, { width: 325 });
      documento.font('Helvetica-Bold').fontSize(7).text(`Emitente: ${clienteNome}`, x + 35, notaY + 65);
      texto(documento, `CPF/CNPJ: ${clienteCadastrado?.cpf || 'Nao informado'}`, x + 35, notaY + 77, 6.5);
      linha(documento, x + 225, notaY + 99, x + larguraVia - 15);
      texto(documento, clienteNome, x + 225, notaY + 102, 6.5, { width: 140, align: 'center' });
    }
  }

  desenharVia(margemEsquerda, false);
  desenharVia(margemDireita, tipoPagamento === 'futuro');
  documento.moveTo(421, 20).lineTo(421, 575).dash(2, { space: 3 }).strokeColor('#888888').stroke();

  documento.end();
});

app.get('/vendas', async (req, res) => {
  const periodo = ['dia', 'semana', 'mes'].includes(req.query.periodo) ? req.query.periodo : 'dia';
  const pagina = Math.max(Number.parseInt(req.query.pagina, 10) || 1, 1);
  const limite = 10;
  const inicio = periodo === 'dia'
    ? "CURRENT_DATE"
    : periodo === 'semana'
      ? "CURRENT_DATE - INTERVAL '6 days'"
      : "date_trunc('month', CURRENT_DATE)";

  try {
    const totalResultado = await db.query(
      `SELECT COUNT(*)::int AS quantidade, COALESCE(SUM(total), 0)::numeric AS valor,
              COALESCE(SUM(total) FILTER (WHERE tipo_pagamento = 'pix'), 0)::numeric AS pix,
              COALESCE(SUM(total) FILTER (WHERE tipo_pagamento = 'dinheiro'), 0)::numeric AS dinheiro,
              COALESCE(SUM(total) FILTER (WHERE tipo_pagamento IN ('boleto', 'futuro')), 0)::numeric AS boleto,
              COALESCE(SUM(total) FILTER (WHERE tipo_pagamento = 'cartao_debito'), 0)::numeric AS cartao_debito,
              COALESCE(SUM(total) FILTER (WHERE tipo_pagamento = 'cartao_credito'), 0)::numeric AS cartao_credito
       FROM vendas
       WHERE criado_em >= ${inicio}
         AND status = 'finalizada'`
    );
    const quantidade = totalResultado.rows[0].quantidade;
    const totalPaginas = Math.max(Math.ceil(quantidade / limite), 1);
    const paginaAtual = Math.min(pagina, totalPaginas);
    const offset = (paginaAtual - 1) * limite;
    const resultado = await db.query(
      `SELECT id, cliente_nome, tipo_pagamento, vencimento, desconto, subtotal, total,
              valor_pago, saldo_devedor, status_pagamento, criado_em,
              data_venda_dia, numero_venda_dia
      FROM vendas
       WHERE status = 'finalizada'
         AND criado_em >= ${inicio}
         AND status = 'finalizada'
       ORDER BY criado_em DESC LIMIT $1 OFFSET $2`,
      [limite, offset]
    );

    res.json({
      vendas: resultado.rows,
      quantidade,
      valor: Number(totalResultado.rows[0].valor),
      porMetodo: {
        pix: Number(totalResultado.rows[0].pix),
        dinheiro: Number(totalResultado.rows[0].dinheiro),
        boleto: Number(totalResultado.rows[0].boleto),
        cartaoDebito: Number(totalResultado.rows[0].cartao_debito),
        cartaoCredito: Number(totalResultado.rows[0].cartao_credito)
      },
      pagina: paginaAtual,
      totalPaginas
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ err: 'Erro ao buscar vendas' });
  }
});

app.get('/vendas/:id/comprovante', async (req, res) => {
  const id = Number.parseInt(req.params.id, 10);

  if (Number.isNaN(id)) {
    return res.status(400).json({ err: 'ID da venda inválido' });
  }

  try {
    const resultado = await db.query(
      `SELECT id, cliente_nome, tipo_pagamento, vencimento, subtotal, desconto, juros, total, itens, criado_em
       FROM vendas WHERE id = $1`, [id]
    );

    if (resultado.rowCount === 0) {
      return res.status(404).json({ err: 'Venda não encontrada' });
    }

    const venda = resultado.rows[0];
    const formatarValor = (valor) => `R$ ${Number(valor).toFixed(2).replace('.', ',')}`;
    const documento = new PDFDocument({ size: [226, 520], margin: 16 });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="comprovante-venda-${id}.pdf"`);
    documento.pipe(res);
    documento.font('Helvetica-Bold').fontSize(12).text('MARAU LUZ E AGUA', { align: 'center' });
    documento.font('Helvetica').fontSize(8).text('COMPROVANTE DE VENDA', { align: 'center' });
    documento.moveDown().text(`Venda #${venda.id}`);
    documento.text(`Cliente: ${venda.cliente_nome}`);
    documento.text(`Data: ${new Date(venda.criado_em).toLocaleString('pt-BR')}`);
    documento.text(`Pagamento: ${venda.tipo_pagamento}`);
    documento.moveDown().font('Helvetica-Bold').text('Itens');
    documento.font('Helvetica');
    for (const item of venda.itens || []) {
      documento.text(`${item.quantidade}x ${item.nome}`);
      documento.text(`   ${formatarValor(item.preco)} cada = ${formatarValor(item.quantidade * item.preco)}`);
    }
    documento.moveDown().font('Helvetica-Bold').text(`Subtotal: ${formatarValor(venda.subtotal)}`);
    documento.text(`Desconto: ${formatarValor(Number(venda.subtotal) * Number(venda.desconto) / 100)}`);
    documento.text(`Juros: ${formatarValor(venda.juros)}`);
    documento.fontSize(13).text(`TOTAL: ${formatarValor(Number(venda.total) + Number(venda.juros))}`, { align: 'center' });
    documento.moveDown().font('Helvetica').fontSize(7).text('Comprovante sem valor fiscal. NFC-e depende de emissão fiscal homologada.', { align: 'center', width: 194 });
    documento.end();
  } catch (err) {
    console.error(err);
    res.status(500).json({ err: 'Erro ao gerar comprovante' });
  }
});

app.get('/vendas/pendentes', async (req, res) => {
  try {
    const resultado = await db.query(
      `SELECT id, cliente_nome, total, itens, criado_em, data_venda_dia, numero_venda_dia
      FROM vendas WHERE status = 'aguardando_pagamento' AND tipo_pagamento = 'avista'
       ORDER BY criado_em ASC`
    );
    res.json(resultado.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ err: 'Erro ao buscar vendas pendentes' });
  }
});

app.get('/vendas/pendentes/:id', async (req, res) => {
  const id = Number.parseInt(req.params.id, 10);

  if (Number.isNaN(id)) {
    return res.status(400).json({ err: 'ID da venda inválido' });
  }

  try {
    const resultado = await db.query(
      `SELECT id, cliente_nome, subtotal, desconto, total, itens, criado_em, data_venda_dia, numero_venda_dia
       FROM vendas WHERE id = $1 AND status = 'aguardando_pagamento' AND tipo_pagamento = 'avista'`,
      [id]
    );

    if (resultado.rowCount === 0) {
      return res.status(404).json({ err: 'Venda pendente não encontrada' });
    }

    res.json(resultado.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ err: 'Erro ao buscar venda pendente' });
  }
});

app.put('/vendas/:id/finalizar', async (req, res) => {
  const id = Number.parseInt(req.params.id, 10);
  const { metodoPagamento, documento } = req.body;
  const metodosValidos = ['dinheiro', 'pix', 'cartao_debito', 'cartao_credito'];

  if (Number.isNaN(id) || !metodosValidos.includes(metodoPagamento)) {
    return res.status(400).json({ err: 'Venda ou método de pagamento inválido' });
  }
  if (documento && !documentoValido(documento)) {
    return res.status(400).json({ err: 'CPF ou CNPJ inválido' });
  }

  const clienteBanco = await db.connect();
  try {
    await clienteBanco.query('BEGIN');
    const venda = await clienteBanco.query(
      `SELECT id, cliente_nome, total, itens FROM vendas
       WHERE id = $1 AND status = 'aguardando_pagamento' FOR UPDATE`, [id]
    );
    if (venda.rowCount === 0) throw new Error('Venda pendente não encontrada');

    for (const item of (venda.rows[0].itens || [])) {
      const produto = await clienteBanco.query(
        'SELECT estoque FROM produtos WHERE id = $1 FOR UPDATE', [item.id]
      );
      if (produto.rowCount === 0 || Number(produto.rows[0].estoque) < item.quantidade) {
        throw new Error(`Estoque insuficiente para ${item.nome}`);
      }
      await clienteBanco.query(
        'UPDATE produtos SET estoque = estoque - $1 WHERE id = $2', [item.quantidade, item.id]
      );
    }

    const atualizada = await clienteBanco.query(
      `UPDATE vendas SET status = 'finalizada', tipo_pagamento = $1
       WHERE id = $2 RETURNING id, cliente_nome, total`, [metodoPagamento, id]
    );
    await clienteBanco.query('COMMIT');
    res.json(atualizada.rows[0]);
  } catch (err) {
    await clienteBanco.query('ROLLBACK');
    res.status(400).json({ err: err.message });
  } finally {
    clienteBanco.release();
  }
});

app.delete('/vendas/:id/cancelar', async (req, res) => {
  const id = Number.parseInt(req.params.id, 10);

  if (Number.isNaN(id)) {
    return res.status(400).json({ err: 'ID da venda inválido' });
  }

  try {
    const resultado = await db.query(
      `DELETE FROM vendas
       WHERE id = $1
         AND status = 'aguardando_pagamento'
         AND tipo_pagamento = 'avista'
       RETURNING id`,
      [id]
    );

    if (resultado.rowCount === 0) {
      return res.status(404).json({ err: 'Venda pendente não encontrada para cancelamento' });
    }

    res.json({ id: resultado.rows[0].id, cancelada: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ err: 'Erro ao cancelar venda pendente' });
  }
});

app.put('/vendas/:id/pagamento', async (req, res) => {
  const id = Number.parseInt(req.params.id, 10);
  const { tipoPagamento, vencimento } = req.body;

  if (Number.isNaN(id) || !['avista', 'futuro'].includes(tipoPagamento)) {
    return res.status(400).json({ err: 'Pagamento inválido' });
  }

  if (tipoPagamento === 'futuro' && !vencimento) {
    return res.status(400).json({ err: 'Informe o vencimento do pagamento futuro' });
  }

  try {
    const venda = await db.query('SELECT cliente_id FROM vendas WHERE id = $1', [id]);

    if (venda.rowCount === 0) {
      return res.status(404).json({ err: 'Venda não encontrada' });
    }

    if (tipoPagamento === 'futuro' && !venda.rows[0].cliente_id) {
      return res.status(400).json({ err: 'Pagamento futuro exige cliente cadastrado' });
    }

    const resultado = await db.query(
      `UPDATE vendas
       SET tipo_pagamento = $1, vencimento = $2
       WHERE id = $3
       RETURNING id, cliente_nome, tipo_pagamento, vencimento, total, criado_em`,
      [tipoPagamento, tipoPagamento === 'futuro' ? vencimento : null, id]
    );
    res.json(resultado.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ err: 'Erro ao editar pagamento' });
  }
});

app.delete('/vendas/:id', async (req, res) => {
  const id = Number.parseInt(req.params.id, 10);

  if (Number.isNaN(id)) {
    return res.status(400).json({ err: 'ID da venda inválido' });
  }

  const clienteBanco = await db.connect();
  try {
    await clienteBanco.query('BEGIN');
    const venda = await clienteBanco.query(
      `SELECT id, itens, status FROM vendas WHERE id = $1 FOR UPDATE`, [id]
    );

    if (venda.rowCount === 0) {
      throw new Error('Venda não encontrada');
    }
    if (venda.rows[0].status !== 'finalizada') {
      throw new Error('Somente vendas finalizadas podem ser excluídas');
    }

    const devolucao = await clienteBanco.query(
      'SELECT 1 FROM devolucoes WHERE venda_id = $1 LIMIT 1', [id]
    );
    if (devolucao.rowCount > 0) {
      throw new Error('Não é possível excluir uma venda que possui devolução');
    }

    for (const item of venda.rows[0].itens || []) {
      await clienteBanco.query(
        'UPDATE produtos SET estoque = estoque + $1 WHERE id = $2',
        [item.quantidade, item.id]
      );
    }

    await clienteBanco.query('DELETE FROM vendas WHERE id = $1', [id]);
    await clienteBanco.query('COMMIT');
    res.status(204).send();
  } catch (err) {
    await clienteBanco.query('ROLLBACK');
    res.status(400).json({ err: err.message });
  } finally {
    clienteBanco.release();
  }
});

app.get('/cobrancas/atrasadas', async (req, res) => {
  await sincronizarPagamentosAsaas();

  try {
    const resultado = await db.query(
      `SELECT v.id, v.cliente_id, v.cliente_nome, c.telefone, v.vencimento,
              v.total, v.juros, v.total + v.juros AS total_atualizado,
              (CURRENT_DATE - v.vencimento)::int AS dias_atraso,
              a.enviado_em AS aviso_enviado_em
       FROM vendas v
       LEFT JOIN clientes c ON c.id = v.cliente_id
       LEFT JOIN avisos_cobranca a ON a.venda_id = v.id AND a.tipo = 'atraso'
       WHERE v.tipo_pagamento = 'futuro'
         AND v.status = 'finalizada'
         AND v.status_pagamento = 'pendente'
         AND v.vencimento < CURRENT_DATE
       ORDER BY v.vencimento ASC
       LIMIT 10`
    );
    res.json(resultado.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ err: 'Erro ao buscar cobranças atrasadas' });
  }
});

app.post('/cobrancas/sincronizar', async (req, res) => {
  await sincronizarPagamentosAsaas();
  res.json({ sincronizado: true });
});

app.get('/cobrancas/:id/detalhe', async (req, res) => {
  const id = Number.parseInt(req.params.id, 10);

  if (Number.isNaN(id)) {
    return res.status(400).json({ err: 'ID da cobrança inválido' });
  }

  try {
    const resultado = await db.query(
      `SELECT v.id, v.cliente_id, v.cliente_nome, c.telefone, v.vencimento,
              v.total, v.juros, v.total + v.juros AS total_atualizado,
              (CURRENT_DATE - v.vencimento)::int AS dias_atraso,
              a.enviado_em AS aviso_enviado_em
       FROM vendas v
       LEFT JOIN clientes c ON c.id = v.cliente_id
       LEFT JOIN avisos_cobranca a ON a.venda_id = v.id AND a.tipo = 'atraso'
       WHERE v.id = $1
         AND v.tipo_pagamento = 'futuro'
         AND v.status = 'finalizada'
         AND v.status_pagamento = 'pendente'`,
      [id]
    );
    if (resultado.rowCount === 0) return res.status(404).json({ err: 'Cobrança não encontrada' });
    res.json(resultado.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ err: 'Erro ao buscar cobrança' });
  }
});

app.put('/cobrancas/:id/juros', async (req, res) => {
  const id = Number.parseInt(req.params.id, 10);
  const percentual = Number.parseFloat(req.body.percentual);

  if (Number.isNaN(id) || !Number.isFinite(percentual) || percentual < 0 || percentual > 100) {
    return res.status(400).json({ err: 'Percentual de juros inválido' });
  }

  try {
    const resultado = await db.query(
      `UPDATE vendas
       SET juros = total * $1 / 100
       WHERE id = $2 AND tipo_pagamento = 'futuro'
       RETURNING id, total, juros, total + juros AS total_atualizado`,
      [percentual, id]
    );
    if (resultado.rowCount === 0) return res.status(404).json({ err: 'Cobrança não encontrada' });
    res.json(resultado.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ err: 'Erro ao aplicar juros' });
  }
});

app.post('/cobrancas/:id/whatsapp', async (req, res) => {
  const id = Number.parseInt(req.params.id, 10);

  if (Number.isNaN(id)) {
    return res.status(400).json({ err: 'ID da cobrança inválido' });
  }

  try {
    const resultado = await db.query(
      `SELECT v.id, v.cliente_nome, v.vencimento, v.total, v.juros,
              v.total + v.juros AS total_atualizado,
              (CURRENT_DATE - v.vencimento)::int AS dias_atraso,
              c.telefone
       FROM vendas v
       LEFT JOIN clientes c ON c.id = v.cliente_id
       WHERE v.id = $1
         AND v.tipo_pagamento = 'futuro'
         AND v.status = 'finalizada'
         AND v.status_pagamento = 'pendente'`,
      [id]
    );

    if (resultado.rowCount === 0) return res.status(404).json({ err: 'Cobrança não encontrada' });

    const venda = resultado.rows[0];
    if (!venda.telefone) return res.status(400).json({ err: 'Cliente sem telefone cadastrado' });

    const valorAtualizado = Number(venda.total_atualizado).toFixed(2).replace('.', ',');
    const dataVencimento = new Date(venda.vencimento).toLocaleDateString('pt-BR');
    const mensagem = `Olá, ${venda.cliente_nome}. Sua conta (venda #${venda.id}) está em atraso há ${venda.dias_atraso} dia(s), com vencimento em ${dataVencimento}. Valor atualizado: R$ ${valorAtualizado}. Por favor, regularize o pagamento o quanto antes.`;

    await enviarCobranca(venda.telefone, mensagem);

    const aviso = await db.query(
      `INSERT INTO avisos_cobranca (venda_id, tipo) VALUES ($1, 'atraso')
       ON CONFLICT (venda_id, tipo) DO UPDATE SET enviado_em = CURRENT_TIMESTAMP
       RETURNING enviado_em`,
      [id]
    );

    res.json({ enviado_em: aviso.rows[0].enviado_em });
  } catch (err) {
    console.error(err);
    res.status(502).json({ err: err.message || 'Erro ao enviar aviso pelo WhatsApp' });
  }
});

app.post('/cobrancas/:id/asaas', async (req, res) => {
  const id = Number.parseInt(req.params.id, 10);

  if (Number.isNaN(id)) {
    return res.status(400).json({ err: 'ID da cobrança inválido' });
  }

  try {
    const resultado = await db.query(
      `SELECT v.id, v.cliente_id, v.cliente_nome, v.total, v.juros,
              c.nome, c.cpf, c.telefone
       FROM vendas v
       JOIN clientes c ON c.id = v.cliente_id
       WHERE v.id = $1 AND v.tipo_pagamento = 'futuro'
         AND v.status_pagamento = 'pendente'`,
      [id]
    );

    if (resultado.rowCount === 0) {
      return res.status(404).json({ err: 'Cobrança pendente não encontrada' });
    }

    const venda = resultado.rows[0];
    const valorCobranca = Number(venda.total) + Number(venda.juros);
    const cobranca = await criarCobranca(
      { id: venda.cliente_id, nome: venda.nome, cpf: venda.cpf, telefone: venda.telefone },
      valorCobranca,
      `Cobrança da venda #${venda.id}`
    );

    await db.query(
      `INSERT INTO cobrancas_asaas (grupo_id, asaas_payment_id, cliente_id, venda_ids, valor_cobrado)
       VALUES ($1, $2, $3, $4, $5)`,
      [`venda-${venda.id}-${Date.now()}`, cobranca.id, venda.cliente_id, [venda.id], valorCobranca]
    );

    res.json({
      id: cobranca.id,
      status: cobranca.status,
      invoiceUrl: cobranca.invoiceUrl,
      bankSlipUrl: cobranca.bankSlipUrl
    });
  } catch (err) {
    console.error(err);
    res.status(502).json({ err: err.message });
  }
});

app.get('/cobrancas-prazo', async (req, res) => {
  try {
    const resultado = await db.query(
      `SELECT v.id, v.cliente_id, v.cliente_nome, v.vencimento, v.total, v.juros, v.valor_pago, v.itens,
              v.data_venda_dia, v.numero_venda_dia,
              GREATEST(v.total + v.juros - COALESCE(v.valor_pago, 0), 0)::numeric AS valor_aberto
       FROM vendas v
       WHERE v.tipo_pagamento = 'futuro'
         AND v.status = 'finalizada'
         AND v.status_pagamento = 'pendente'
       ORDER BY v.cliente_nome, v.criado_em ASC`
    );
    const clientes = new Map();
    for (const venda of resultado.rows) {
      if (!clientes.has(venda.cliente_id)) {
        clientes.set(venda.cliente_id, { id: venda.cliente_id, nome: venda.cliente_nome, vendas: [] });
      }
      clientes.get(venda.cliente_id).vendas.push(venda);
    }
    res.json([...clientes.values()].slice(0, 10));
  } catch (err) {
    console.error(err);
    res.status(500).json({ err: 'Erro ao buscar cobranças a prazo' });
  }
});

app.post('/cobrancas-prazo/asaas', async (req, res) => {
  const clienteId = Number.parseInt(req.body.clienteId, 10);
  const vendaIds = Array.isArray(req.body.vendaIds) ? req.body.vendaIds.map((id) => Number.parseInt(id, 10)) : [];
  const valorInformado = req.body.valor === '' || req.body.valor == null
    ? null
    : Number.parseFloat(req.body.valor);

  if (Number.isNaN(clienteId) || vendaIds.length === 0 || (valorInformado !== null && (!Number.isFinite(valorInformado) || valorInformado <= 0))) {
    return res.status(400).json({ err: 'Selecione cliente, compras e um valor válido' });
  }

  try {
    const vendas = await db.query(
      `SELECT v.id, v.cliente_id, v.total, v.juros, c.nome, c.cpf, c.telefone
       FROM vendas v JOIN clientes c ON c.id = v.cliente_id
       WHERE v.id = ANY($1::int[]) AND v.cliente_id = $2
         AND v.tipo_pagamento = 'futuro' AND v.status = 'finalizada'
         AND v.status_pagamento = 'pendente'`,
      [vendaIds, clienteId]
    );
    if (vendas.rows.length !== vendaIds.length) {
      return res.status(400).json({ err: 'Uma ou mais compras não estão disponíveis' });
    }

    const primeira = vendas.rows[0];
    const totalSelecionado = vendas.rows.reduce((soma, venda) => soma + Number(venda.total) + Number(venda.juros), 0);
    if (valorInformado !== null && valorInformado > totalSelecionado) {
      return res.status(400).json({ err: 'O valor escolhido não pode ser maior que o total selecionado' });
    }
    const total = valorInformado ?? totalSelecionado;
    const grupoId = `parcelamento-${clienteId}-${Date.now()}`;
    const cobranca = await criarCobrancaUnica(
      { id: clienteId, nome: primeira.nome, cpf: primeira.cpf, telefone: primeira.telefone },
      total,
      `Cobrança de ${vendaIds.length} compra(s) a prazo`,
      grupoId
    );

    await db.query(
      `INSERT INTO cobrancas_asaas (grupo_id, asaas_payment_id, cliente_id, venda_ids, valor_cobrado)
        SELECT $1, payment_id, $2, $3::int[], $5
       FROM unnest($4::text[]) AS payment_id`,
      [grupoId, clienteId, vendaIds, [cobranca.id], total]
    );

    res.json({ total, cobrancas: [{ id: cobranca.id, invoiceUrl: cobranca.invoiceUrl, bankSlipUrl: cobranca.bankSlipUrl }] });
  } catch (err) {
    console.error(err);
    res.status(502).json({ err: err.message });
  }
});

app.post('/webhooks/asaas', async (req, res) => {
  const evento = req.body.event;
  const pagamento = req.body.payment;
  const eventosMonitorados = ['PAYMENT_RECEIVED', 'PAYMENT_CONFIRMED', 'PAYMENT_PARTIALLY_RECEIVED'];

  if (!pagamento?.id || !eventosMonitorados.includes(evento)) {
    return res.status(204).send();
  }

  try {
    await sincronizarPagamentosAsaas(pagamento.id);
    res.status(204).send();
  } catch (err) {
    console.error(err);
    res.status(500).json({ err: 'Erro ao processar webhook Asaas' });
  }
});

app.put('/cobrancas-prazo/finalizar', async (req, res) => {
  const clienteId = Number.parseInt(req.body.clienteId, 10);
  const vendaIds = Array.isArray(req.body.vendaIds)
    ? req.body.vendaIds.map((id) => Number.parseInt(id, 10))
    : [];
  const metodoPagamento = String(req.body.metodoPagamento || '');
  const metodosValidos = ['dinheiro', 'pix', 'cartao_credito', 'cartao_debito', 'boleto'];

  if (Number.isNaN(clienteId) || vendaIds.length === 0 || vendaIds.some(Number.isNaN) || !metodosValidos.includes(metodoPagamento)) {
    return res.status(400).json({ err: 'Selecione vendas e um método de pagamento válido' });
  }

  if (metodoPagamento === 'boleto') {
    return res.status(400).json({ err: 'Boletos são finalizados automaticamente após a confirmação do Asaas' });
  }

  try {
    const resultado = await db.query(
      `UPDATE vendas
       SET status_pagamento = 'pago', tipo_pagamento = $1, pago_em = CURRENT_TIMESTAMP,
           valor_pago = total + juros, saldo_devedor = 0
       WHERE id = ANY($2::int[]) AND cliente_id = $3
         AND tipo_pagamento = 'futuro' AND status = 'finalizada'
         AND status_pagamento = 'pendente'
       RETURNING id`,
      [metodoPagamento, vendaIds, clienteId]
    );

    if (resultado.rowCount !== vendaIds.length) {
      return res.status(400).json({ err: 'Uma ou mais vendas não estão disponíveis para finalização' });
    }

    res.json({ vendaIds: resultado.rows.map((venda) => venda.id) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ err: 'Erro ao finalizar vendas' });
  }
});

app.put('/cobrancas/:id/pagar', async (req, res) => {
  const id = Number.parseInt(req.params.id, 10);
  const comJuros = req.body.comJuros === true;
  const percentual = Number.parseFloat(req.body.percentual) || 0;
  const metodosValidos = ['dinheiro', 'pix', 'cartao_debito', 'cartao_credito'];
  const metodoPagamento = metodosValidos.includes(req.body.metodoPagamento) ? req.body.metodoPagamento : 'dinheiro';

  if (Number.isNaN(id) || percentual < 0 || percentual > 100) {
    return res.status(400).json({ err: 'Dados de pagamento inválidos' });
  }

  try {
    const resultado = await db.query(
      `UPDATE vendas
       SET juros = CASE WHEN $1 THEN total * $2 / 100 ELSE 0 END,
           status_pagamento = 'pago', pago_em = CURRENT_TIMESTAMP,
           tipo_pagamento = $4
       WHERE id = $3 AND status_pagamento = 'pendente'
       RETURNING id, total, juros, total + juros AS total_pago, pago_em`,
      [comJuros, percentual, id, metodoPagamento]
    );
    if (resultado.rowCount === 0) {
      return res.status(404).json({ err: 'Cobrança não encontrada ou já paga' });
    }
    res.json(resultado.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ err: 'Erro ao marcar cobrança como paga' });
  }
});

app.get('/devolucoes/clientes', async (req, res) => {
  const busca = String(req.query.busca || '').trim().toLowerCase();
  try {
    const vendas = await db.query(
      `SELECT cliente_id, cliente_nome, itens FROM vendas
       WHERE status = 'finalizada'
         AND tipo_pagamento = 'futuro'
         AND status_pagamento = 'pendente'
         AND cliente_id IS NOT NULL`
    );
    const devolvidas = await db.query(
      `SELECT d.cliente_id, d.produto_id, SUM(d.quantidade)::int AS quantidade
       FROM devolucoes d
       JOIN vendas v ON v.id = d.venda_id
       WHERE d.venda_id IS NOT NULL
         AND v.status = 'finalizada'
         AND v.tipo_pagamento = 'futuro'
         AND v.status_pagamento = 'pendente'
       GROUP BY d.cliente_id, d.produto_id`
    );
    const mapaDevolvidas = new Map(
      devolvidas.rows.map((item) => [`${item.cliente_id}:${item.produto_id}`, item.quantidade])
    );
    const clientes = new Map();

    for (const venda of vendas.rows) {
      if (!clientes.has(venda.cliente_id)) {
        clientes.set(venda.cliente_id, { id: venda.cliente_id, nome: venda.cliente_nome, produtos: new Map() });
      }
      const cliente = clientes.get(venda.cliente_id);
      for (const item of venda.itens || []) {
        const atual = cliente.produtos.get(item.id) || { id: item.id, nome: item.nome, quantidade: 0 };
        atual.quantidade += Number(item.quantidade) || 0;
        cliente.produtos.set(item.id, atual);
      }
    }

    res.json([...clientes.values()]
      .map((cliente) => ({
        ...cliente,
        produtos: [...cliente.produtos.values()]
          .map((item) => ({ ...item, quantidade: item.quantidade - (mapaDevolvidas.get(`${cliente.id}:${item.id}`) || 0) }))
          .filter((item) => item.quantidade > 0)
      }))
      .filter((cliente) => !busca || cliente.nome.toLowerCase().includes(busca))
      .filter((cliente) => cliente.produtos.length > 0)
      .slice(0, 10));
  } catch (err) {
    console.error(err);
    res.status(500).json({ err: 'Erro ao buscar devoluções' });
  }
});

app.post('/devolucoes', async (req, res) => {
  const clienteId = Number.parseInt(req.body.clienteId, 10);
  const itens = Array.isArray(req.body.itens) ? req.body.itens : [];

  if (Number.isNaN(clienteId) || itens.length === 0) {
    return res.status(400).json({ err: 'Selecione um cliente e ao menos um produto' });
  }

  const clienteBanco = await db.connect();
  try {
    await clienteBanco.query('BEGIN');
    for (const item of itens) {
      const produtoId = Number.parseInt(item.produtoId, 10);
      const quantidade = Number.parseInt(item.quantidade, 10);
      if (Number.isNaN(produtoId) || Number.isNaN(quantidade) || quantidade <= 0) {
        throw new Error('Produto ou quantidade inválida');
      }

      const disponibilidade = await clienteBanco.query(
        `SELECT COALESCE(SUM((item->>'quantidade')::int), 0)::int AS vendido
         FROM vendas v, jsonb_array_elements(v.itens) item
         WHERE v.cliente_id = $1
           AND v.status = 'finalizada'
           AND v.tipo_pagamento = 'futuro'
           AND v.status_pagamento = 'pendente'
           AND (item->>'id')::int = $2`, [clienteId, produtoId]
      );
      const vendaOrigem = await clienteBanco.query(
        `SELECT v.id
         FROM vendas v, jsonb_array_elements(v.itens) item
         WHERE v.cliente_id = $1
           AND v.status = 'finalizada'
           AND v.tipo_pagamento = 'futuro'
           AND v.status_pagamento = 'pendente'
           AND (item->>'id')::int = $2
         ORDER BY v.criado_em ASC LIMIT 1`, [clienteId, produtoId]
      );
      if (vendaOrigem.rowCount === 0) throw new Error('Venda de origem não encontrada');
      const devolvido = await clienteBanco.query(
        'SELECT COALESCE(SUM(quantidade), 0)::int AS total FROM devolucoes WHERE cliente_id = $1 AND produto_id = $2',
        [clienteId, produtoId]
      );
      const disponivel = disponibilidade.rows[0].vendido - devolvido.rows[0].total;
      if (quantidade > disponivel) throw new Error('Quantidade maior que o disponível para devolução');

      await clienteBanco.query('UPDATE produtos SET estoque = estoque + $1 WHERE id = $2', [quantidade, produtoId]);
      await clienteBanco.query(
        'INSERT INTO devolucoes (cliente_id, venda_id, produto_id, quantidade) VALUES ($1, $2, $3, $4)',
        [clienteId, vendaOrigem.rows[0].id, produtoId, quantidade]
      );
    }

    const restante = await clienteBanco.query(
      `WITH vendidos AS (
        SELECT (item->>'id')::int AS produto_id, SUM((item->>'quantidade')::int)::int AS quantidade
        FROM vendas v, jsonb_array_elements(v.itens) item
        WHERE v.cliente_id = $1
          AND v.status = 'finalizada'
          AND v.tipo_pagamento = 'futuro'
          AND v.status_pagamento = 'pendente'
        GROUP BY (item->>'id')::int
      ), devolvidos AS (
        SELECT d.produto_id, SUM(d.quantidade)::int AS quantidade
        FROM devolucoes d
        JOIN vendas v ON v.id = d.venda_id
        WHERE d.cliente_id = $1
          AND v.status = 'finalizada'
          AND v.tipo_pagamento = 'futuro'
          AND v.status_pagamento = 'pendente'
        GROUP BY d.produto_id
      )
      SELECT 1 FROM vendidos v
      LEFT JOIN devolvidos d ON d.produto_id = v.produto_id
      WHERE v.quantidade > COALESCE(d.quantidade, 0)
      LIMIT 1`,
      [clienteId]
    );

    let vendaCancelada = false;
    if (restante.rowCount === 0) {
      await clienteBanco.query(
        `UPDATE vendas SET status = 'cancelada'
         WHERE cliente_id = $1
           AND status = 'finalizada'
           AND tipo_pagamento = 'futuro'
           AND status_pagamento = 'pendente'`,
        [clienteId]
      );
      vendaCancelada = true;
    }

    await clienteBanco.query('COMMIT');
    res.json({
      mensagem: vendaCancelada
        ? 'Devolução registrada. A venda foi totalmente devolvida e removida do total de vendas.'
        : 'Devolução registrada e estoque atualizado',
      vendaCancelada
    });
  } catch (err) {
    await clienteBanco.query('ROLLBACK');
    res.status(400).json({ err: err.message });
  } finally {
    clienteBanco.release();
  }
});


app.get('/', (req, res) => {
  res.send('Servidor esta rodando'); // cria a primeira rota do servidor, quando algume acessa (/), o servidor responde enviando a mensagem 
});

app.get('/whatsapp/status', (req, res) => {
  res.json(obterStatusWhatsApp());
});

app.get('/whatsapp/qr', (req, res) => {
  res.set('Cache-Control', 'no-store');
  res.sendFile(require('path').join(__dirname, 'whatsapp-qr.png'), (err) => {
    if (err) res.status(404).send('QR Code ainda não gerado. Aguarde o servidor solicitar um novo QR.');
  });
});

app.get('/whatsapp/conectar', (req, res) => {
  res.set('Cache-Control', 'no-store');
  res.send(`<!DOCTYPE html>
<html lang="pt-br">
<head>
  <meta charset="UTF-8">
  <title>Conectar WhatsApp</title>
  <style>
    body { font-family: Arial, sans-serif; background: #eef2f5; display: flex; flex-direction: column; align-items: center; padding: 40px; }
    h1 { color: #1a1c23; }
    #status { font-weight: bold; margin-bottom: 16px; padding: 10px 16px; border-radius: 6px; }
    #status.aguardando { background: #fff4e0; color: #b26a00; }
    #status.conectado { background: #e6f6ec; color: #168c4b; }
    #qr { width: 320px; height: 320px; border: 1px solid #dbe3ea; border-radius: 8px; background: #fff; }
  </style>
</head>
<body>
  <h1>Conectar WhatsApp</h1>
  <p id="status" class="aguardando">Aguardando QR Code...</p>
  <img id="qr" src="/whatsapp/qr?t=0" alt="QR Code do WhatsApp">
  <p>Escaneie com: WhatsApp &gt; Aparelhos conectados &gt; Conectar um aparelho.<br>A imagem se atualiza sozinha, não precisa dar F5.</p>
  <script>
    const img = document.getElementById('qr');
    const status = document.getElementById('status');

    function atualizarQr() {
      img.src = '/whatsapp/qr?t=' + Date.now();
    }

    async function atualizarStatus() {
      try {
        const resposta = await fetch('/whatsapp/status');
        const dados = await resposta.json();
        if (dados.conectado) {
          status.textContent = 'Conectado com sucesso!';
          status.className = 'conectado';
          img.style.display = 'none';
        } else {
          status.textContent = 'Aguardando leitura do QR Code (estado: ' + dados.estado + ')';
          status.className = 'aguardando';
        }
      } catch (err) {
        status.textContent = 'Não foi possível consultar o status.';
      }
    }

    setInterval(atualizarQr, 4000);
    setInterval(atualizarStatus, 3000);
    atualizarStatus();
  </script>
</body>
</html>`);
});


app.get('/produtos', async (req, res) => {
  const pagina = Math.max(Number.parseInt(req.query.pagina, 10) || 1, 1);
  const limite = 10;
  const busca = String(req.query.busca || '').trim();
  const parametros = [];
  let filtro = '';

  if (busca) {
    parametros.push(`%${busca}%`);
    filtro = `WHERE nome ILIKE $${parametros.length}
              OR CAST(id AS TEXT) ILIKE $${parametros.length}`;
  }

  try {
    const totalResultado = await db.query(
      `SELECT COUNT(*)::int AS total FROM produtos ${filtro}`,
      parametros
    );
    const total = totalResultado.rows[0].total;
    const totalPaginas = Math.max(Math.ceil(total / limite), 1);
    const paginaAtual = Math.min(pagina, totalPaginas);
    const offset = (paginaAtual - 1) * limite;

    const resultado = await db.query(
      `SELECT * FROM produtos ${filtro}
       ORDER BY id DESC LIMIT $${parametros.length + 1} OFFSET $${parametros.length + 2}`,
      [...parametros, limite, offset]
    );

    res.json({
      produtos: resultado.rows,
      total,
      pagina: paginaAtual,
      limite,
      totalPaginas
    });

  }
  catch (err) {
    console.error(err);
    res.status(500).json({ err: 'Erro em buscar produtos' });

  }
});

app.post('/produtos', async (req, res) => {
  const { nome, categoria, precoCusto, precoVenda, estoque, ncm } = req.body;
  const estoqueFormatado = Number.parseInt(estoque, 10);

  try {
    const cliente = await db.connect();

    try {
      await cliente.query('BEGIN');

      const produtoExistente = await cliente.query(
        'SELECT * FROM produtos WHERE LOWER(nome) = LOWER($1) FOR UPDATE',
        [nome]
      );

      let resultado;

      if (produtoExistente.rowCount > 0) {
        resultado = await cliente.query(
          'UPDATE produtos SET estoque = estoque + $1 WHERE id = $2 RETURNING *',
          [estoqueFormatado, produtoExistente.rows[0].id]
        );
      } else {
        resultado = await cliente.query(
          `INSERT INTO produtos (nome, categoria, "precoCusto", "precoVenda", estoque, ncm)
           VALUES ($1, $2, $3, $4, $5, $6)
           RETURNING *`,
          [nome, categoria, precoCusto, precoVenda, estoqueFormatado, ncm]
        );
      }

      const valorCustoEntrada = Number(precoCusto) * estoqueFormatado;
      if (estoqueFormatado > 0 && Number.isFinite(valorCustoEntrada) && valorCustoEntrada > 0) {
        await cliente.query(
          `INSERT INTO despesas (categoria, descricao, valor, data_despesa)
           VALUES ('produto', $1, $2, CURRENT_DATE)`,
          [`Entrada de estoque: ${nome} (${estoqueFormatado} un.)`, valorCustoEntrada]
        );
      }

      await cliente.query('COMMIT');
      res.status(produtoExistente.rowCount > 0 ? 200 : 201).json(resultado.rows[0]);
    } catch (err) {
      await cliente.query('ROLLBACK');
      throw err;
    } finally {
      cliente.release();
    }
  } catch (err) {
    console.error(err);
    res.status(500).json({ err: 'Erro em enviar produto' });
  }
});

app.put('/produtos/:id', async (req, res) => {
  const id = Number.parseInt(req.params.id, 10);
  const { nome, categoria, precoCusto, precoVenda, estoque, ncm } = req.body;
  const estoqueFormatado = Number.parseInt(estoque, 10);

  if (Number.isNaN(id)) {
    return res.status(400).json({ err: 'ID do produto inválido' });
  }

  try {
    const cliente = await db.connect();

    try {
      await cliente.query('BEGIN');

      const produtoAnterior = await cliente.query(
        'SELECT estoque FROM produtos WHERE id = $1 FOR UPDATE',
        [id]
      );

      if (produtoAnterior.rowCount === 0) {
        await cliente.query('ROLLBACK');
        return res.status(404).json({ err: 'Produto não encontrado' });
      }

      const resultado = await cliente.query(
        `UPDATE produtos
         SET nome = $1, categoria = $2, "precoCusto" = $3,
             "precoVenda" = $4, estoque = $5, ncm = $6
         WHERE id = $7
         RETURNING *`,
        [nome, categoria, precoCusto, precoVenda, estoqueFormatado, ncm, id]
      );

      const estoqueAdicionado = estoqueFormatado - produtoAnterior.rows[0].estoque;
      const valorCustoEntrada = Number(precoCusto) * estoqueAdicionado;
      if (estoqueAdicionado > 0 && Number.isFinite(valorCustoEntrada) && valorCustoEntrada > 0) {
        await cliente.query(
          `INSERT INTO despesas (categoria, descricao, valor, data_despesa)
           VALUES ('produto', $1, $2, CURRENT_DATE)`,
          [`Entrada de estoque: ${nome} (${estoqueAdicionado} un.)`, valorCustoEntrada]
        );
      }

      await cliente.query('COMMIT');
      res.json(resultado.rows[0]);
    } catch (err) {
      await cliente.query('ROLLBACK');
      throw err;
    } finally {
      cliente.release();
    }
  } catch (err) {
    console.error(err);
    res.status(500).json({ err: 'Erro ao editar produto' });
  }
});

app.post('/notas/importar', upload.single('xml'), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ err: 'Selecione um arquivo XML' });
  }

  const codigoNfce = String(req.body.codigoNfce || '').replace(/\D/g, '');

  if (codigoNfce.length !== 44) {
    return res.status(400).json({ err: 'O código da NFC-e deve conter 44 números' });
  }

  try {
    const parser = new XMLParser({ removeNSPrefix: true, ignoreAttributes: false });
    const documento = parser.parse(req.file.buffer.toString('utf8'));
    const nfe = documento.nfeProc?.NFe || documento.NFe;
    const infNFe = nfe?.infNFe;
    const detalhes = infNFe?.det
      ? (Array.isArray(infNFe.det) ? infNFe.det : [infNFe.det])
      : [];

    if (detalhes.length === 0) {
      return res.status(400).json({ err: 'O XML não possui produtos' });
    }

    const cliente = await db.connect();
    let criados = 0;
    let atualizados = 0;

    try {
      await cliente.query('BEGIN');

      for (const detalhe of detalhes) {
        const produtoXml = detalhe.prod;
        const nome = String(produtoXml?.xProd || '').trim();
        const quantidade = Number.parseFloat(produtoXml?.qCom);
        const precoCusto = Number.parseFloat(produtoXml?.vUnCom);
        const ncmProduto = String(produtoXml?.NCM || '').trim();

        if (!nome || Number.isNaN(quantidade) || quantidade <= 0 || Number.isNaN(precoCusto)) {
          continue;
        }

        const existente = await cliente.query(
          'SELECT id FROM produtos WHERE LOWER(nome) = LOWER($1) FOR UPDATE',
          [nome]
        );

        if (existente.rowCount > 0) {
          await cliente.query(
            'UPDATE produtos SET estoque = estoque + $1 WHERE id = $2',
            [quantidade, existente.rows[0].id]
          );
          atualizados++;
        } else {
          await cliente.query(
            `INSERT INTO produtos (nome, categoria, "precoCusto", "precoVenda", estoque, ncm)
             VALUES ($1, 'outros', $2, $3, $4, $5)`,
            [
              nome,
              precoCusto,
              Math.ceil(precoCusto / (1 - 0.30)),
              quantidade,
              ncmProduto
            ]
          );
          criados++;
        }

        const valorCustoEntrada = precoCusto * quantidade;
        if (valorCustoEntrada > 0) {
          await cliente.query(
            `INSERT INTO despesas (categoria, descricao, valor, data_despesa)
             VALUES ('produto', $1, $2, CURRENT_DATE)`,
            [`Compra via NFC-e (${codigoNfce}): ${nome} (${quantidade} un.)`, valorCustoEntrada]
          );
        }
      }

      await cliente.query('COMMIT');
    } catch (err) {
      await cliente.query('ROLLBACK');
      throw err;
    } finally {
      cliente.release();
    }

    res.json({
      nota: infNFe.ide?.nNF || 'não identificada',
      codigoNfce,
      criados,
      atualizados
    });
  } catch (err) {
    console.error(err);
    res.status(400).json({ err: 'Não foi possível ler o XML da NF-e' });
  }
});

app.delete('/produtos/:id', async (req, res) => {
  const id = Number.parseInt(req.params.id, 10);

  if (Number.isNaN(id)) {
    return res.status(400).json({ err: 'ID do produto inválido' });
  }

  try {
    const resultado = await db.query('DELETE FROM produtos WHERE id = $1', [id]);

    if (resultado.rowCount === 0) {
      return res.status(404).json({ err: 'Produto não encontrado' });
    }

    res.status(204).send();
  } catch (err) {
    console.error(err);
    res.status(500).json({ err: 'Erro ao excluir produto' });
  }
});

const CATEGORIAS_DESPESA = ['imposto', 'salario', 'luz', 'agua', 'produto', 'outro'];
const ROTULOS_DESPESA = {
  imposto: 'Impostos',
  salario: 'Salário',
  luz: 'Luz',
  agua: 'Água',
  produto: 'Compra de produtos',
  outro: 'Outros gastos'
};

function periodoValido(inicio, fim) {
  return /^\d{4}-\d{2}-\d{2}$/.test(inicio) && /^\d{4}-\d{2}-\d{2}$/.test(fim);
}

app.post('/despesas', async (req, res) => {
  const categoria = String(req.body.categoria || '');
  const descricao = String(req.body.descricao || '').trim().slice(0, 200);
  const valor = Number.parseFloat(req.body.valor);
  const data = String(req.body.data || '');

  if (!CATEGORIAS_DESPESA.includes(categoria) || !Number.isFinite(valor) || valor <= 0 || !periodoValido(data, data)) {
    return res.status(400).json({ err: 'Informe categoria, valor e data válidos' });
  }

  try {
    const resultado = await db.query(
      `INSERT INTO despesas (categoria, descricao, valor, data_despesa)
       VALUES ($1, $2, $3, $4)
       RETURNING id, categoria, descricao, valor, data_despesa`,
      [categoria, descricao || null, valor, data]
    );
    res.status(201).json(resultado.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ err: 'Erro ao cadastrar despesa' });
  }
});

app.get('/despesas', async (req, res) => {
  const inicio = String(req.query.inicio || '');
  const fim = String(req.query.fim || '');

  if (!periodoValido(inicio, fim)) {
    return res.status(400).json({ err: 'Informe o período (início e fim) para listar as despesas' });
  }

  try {
    const resultado = await db.query(
      `SELECT id, categoria, descricao, valor, data_despesa
       FROM despesas
       WHERE data_despesa BETWEEN $1 AND $2
       ORDER BY data_despesa DESC, id DESC`,
      [inicio, fim]
    );
    res.json(resultado.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ err: 'Erro ao buscar despesas' });
  }
});

app.delete('/despesas/:id', async (req, res) => {
  const id = Number.parseInt(req.params.id, 10);

  if (Number.isNaN(id)) {
    return res.status(400).json({ err: 'ID da despesa inválido' });
  }

  try {
    const resultado = await db.query('DELETE FROM despesas WHERE id = $1', [id]);
    if (resultado.rowCount === 0) return res.status(404).json({ err: 'Despesa não encontrada' });
    res.status(204).send();
  } catch (err) {
    console.error(err);
    res.status(500).json({ err: 'Erro ao excluir despesa' });
  }
});

app.get('/relatorio/pdf', async (req, res) => {
  const inicio = String(req.query.inicio || '');
  const fim = String(req.query.fim || '');

  if (!periodoValido(inicio, fim)) {
    return res.status(400).json({ err: 'Informe o período (início e fim) para gerar o relatório' });
  }

  try {
    const vendasResultado = await db.query(
      `SELECT COUNT(*)::int AS quantidade,
              COALESCE(SUM(total), 0)::numeric AS total_vendido,
              COALESCE(SUM(valor_pago), 0)::numeric AS total_pago
       FROM vendas
       WHERE criado_em::date BETWEEN $1 AND $2
         AND status = 'finalizada'`,
      [inicio, fim]
    );

    const despesasResultado = await db.query(
      `SELECT categoria, COALESCE(SUM(valor), 0)::numeric AS total
       FROM despesas
       WHERE data_despesa BETWEEN $1 AND $2
       GROUP BY categoria`,
      [inicio, fim]
    );

    const { quantidade, total_vendido: totalVendido, total_pago: totalPago } = vendasResultado.rows[0];
    const totaisPorCategoria = Object.fromEntries(CATEGORIAS_DESPESA.map((categoria) => [categoria, 0]));
    for (const linha of despesasResultado.rows) {
      totaisPorCategoria[linha.categoria] = Number(linha.total);
    }
    const totalGastos = Object.values(totaisPorCategoria).reduce((soma, valor) => soma + valor, 0);

    const formatarValor = (valor) => `R$ ${Number(valor).toFixed(2).replace('.', ',')}`;
    const formatarData = (data) => new Date(`${data}T12:00:00`).toLocaleDateString('pt-BR');

    const documento = new PDFDocument({ size: 'A4', margin: 50 });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="relatorio-${inicio}-a-${fim}.pdf"`);
    documento.pipe(res);

    documento.font('Helvetica-Bold').fontSize(18).text('Marau Luz e Água', { align: 'center' });
    documento.font('Helvetica').fontSize(11).text('Relatório financeiro', { align: 'center' });
    documento.fontSize(10).text(`Período: ${formatarData(inicio)} a ${formatarData(fim)}`, { align: 'center' });
    documento.moveDown(1.5);

    documento.font('Helvetica-Bold').fontSize(13).text('Vendas');
    documento.moveDown(0.3);
    documento.font('Helvetica').fontSize(11);
    documento.text(`Quantidade de vendas: ${quantidade}`);
    documento.text(`Total vendido: ${formatarValor(totalVendido)}`);
    documento.text(`Total pago: ${formatarValor(totalPago)}`);
    documento.moveDown(1);

    documento.font('Helvetica-Bold').fontSize(13).text('Gastos');
    documento.moveDown(0.3);
    documento.font('Helvetica').fontSize(11);
    for (const categoria of CATEGORIAS_DESPESA) {
      documento.text(`${ROTULOS_DESPESA[categoria]}: ${formatarValor(totaisPorCategoria[categoria])}`);
    }
    documento.moveDown(0.3);
    documento.font('Helvetica-Bold').text(`Total de gastos: ${formatarValor(totalGastos)}`);
    documento.moveDown(1);

    const saldo = Number(totalPago) - totalGastos;
    documento.font('Helvetica-Bold').fontSize(13).text('Saldo do período');
    documento.moveDown(0.3);
    documento.font('Helvetica').fontSize(11).text(`Total pago - total de gastos: ${formatarValor(saldo)}`);

    documento.moveDown(2);
    documento.font('Helvetica').fontSize(8).text(`Relatório gerado em ${new Date().toLocaleString('pt-BR')}`, { align: 'center' });

    documento.end();
  } catch (err) {
    console.error(err);
    res.status(500).json({ err: 'Erro ao gerar relatório' });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log('servidor esta rodando na PORT 3000'); // define em qual prota do servidor vai rodar, e deixa o console ouvindo para saber se deu tudo certo 
  conectarWhatsApp().catch((err) => console.error('Erro ao conectar WhatsApp:', err));
  enviarAvisosDeVencimento();
  sincronizarPagamentosAsaas();
  setInterval(enviarAvisosDeVencimento, 60 * 60 * 1000);
  setInterval(sincronizarPagamentosAsaas, 5 * 60 * 1000);
  setTimeout(enviarAvisosDeAtraso, 30000);
  agendarTarefaDiaria(0, 0, enviarAvisosDeAtraso);
});

