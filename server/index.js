const express = require('express'); //importa as bibliotecas
const cors = require('cors');
require('dotenv').config();

const db = require('./db'); // importa conexão do banco 



const app = express();  // cria a aplicação do servidor 
app.use(cors());
app.use(express.json()); // ensino o servidor dados JSON


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
  const { nome, categoria, preco, quantidade } = req.body;
  try {
    const queryText = 'INSERT INTO produtos (nome, categoria, preco, quantidade) VALUES ($1, $2, $3,$4) RETURNIGN*';
    const novosValores = [nome, categoria, preco, quantidade];
    const resultado = await db.query(queryText, novosValores);
    res.status(201).json(resultado.rowCount[0]);

  }
  catch (err) {
    console.error(err);
    res.status(500).json({ err: 'Erro em enviar produto' });


  }

});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log('servidor esta rodando na PORT 3000'); // define em qual prota do servidor vai rodar, e deixa o console ouvindo para saber se deu tudo certo 

})

