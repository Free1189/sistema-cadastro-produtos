const express = require('express'); //importa as bibliotecas
const cors = require('cors');
const multer = require('multer');
const { XMLParser } = require('fast-xml-parser');
require('dotenv').config();

const db = require('./db'); // importa conexão do banco 



const app = express();  // cria a aplicação do servidor 
app.use(cors());
app.use(express.json()); // ensino o servidor dados JSON
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 }
});


app.get('/', (req, res) => {
  res.send('Servidor esta rodando'); // cria a primeira rota do servidor, quando algume acessa (/), o servidor responde enviando a mensagem 
});


app.get('/produtos', async (req, res) => {
  try {
    const resultado = await db.query('SELECT * FROM produtos ORDER BY id DESC');
    res.json(resultado.rows);

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
            [nome, precoCusto, precoCusto * 1.3, quantidade, ncmProduto]
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

