const express = require('express'); //importa as bibliotecas
const cors = require('cors');
const multer = require('multer');
const { XMLParser } = require('fast-xml-parser');
const PDFDocument = require('pdfkit');
require('dotenv').config();

const db = require('./db'); // importa conexão do banco 



const app = express();  // cria a aplicação do servidor 
app.use(cors());
app.use(express.json()); // ensino o servidor dados JSON
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 }
});

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

  try {
    await clienteBanco.query('BEGIN');

    for (const item of itensVenda) {
      const produto = await clienteBanco.query(
        'SELECT estoque FROM produtos WHERE id = $1 FOR UPDATE',
        [item.id]
      );

      if (produto.rowCount === 0) {
        throw new Error(`Produto ${item.id} não encontrado`);
      }

      if (Number(produto.rows[0].estoque) < item.quantidade) {
        throw new Error(`Estoque insuficiente para o produto ${item.id}`);
      }

      await clienteBanco.query(
        'UPDATE produtos SET estoque = estoque - $1 WHERE id = $2',
        [item.quantidade, item.id]
      );
    }

    await clienteBanco.query('COMMIT');
  } catch (err) {
    await clienteBanco.query('ROLLBACK');
    console.error(err);
    return res.status(400).json({ err: err.message });
  } finally {
    clienteBanco.release();
  }

  const numeroCondicional = String(Date.now()).slice(-6);
  const dataEmissao = new Date().toLocaleDateString('pt-BR');
  const formatarValor = (valor) => `R$ ${valor.toFixed(2).replace('.', ',')}`;
  const documento = new PDFDocument({ margin: 36, size: 'A4', layout: 'landscape' });
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', 'attachment; filename="condicional-venda.pdf"');
  documento.pipe(res);

  const larguraVia = 382;
  const alturaVia = 550;
  const margemEsquerda = 30;
  const margemDireita = 430;
  const clienteNome = clienteCadastrado?.nome || cliente || 'Consumidor';
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


app.get('/', (req, res) => {
  res.send('Servidor esta rodando'); // cria a primeira rota do servidor, quando algume acessa (/), o servidor responde enviando a mensagem 
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
    const resultado = await db.query(
      `UPDATE produtos
       SET nome = $1, categoria = $2, "precoCusto" = $3,
           "precoVenda" = $4, estoque = $5, ncm = $6
       WHERE id = $7
       RETURNING *`,
      [nome, categoria, precoCusto, precoVenda, estoqueFormatado, ncm, id]
    );

    if (resultado.rowCount === 0) {
      return res.status(404).json({ err: 'Produto não encontrado' });
    }

    res.json(resultado.rows[0]);
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

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log('servidor esta rodando na PORT 3000'); // define em qual prota do servidor vai rodar, e deixa o console ouvindo para saber se deu tudo certo 

})

