const express = require ('express'); //importa as bibliotecas
const cors = require ('cors');
require('dotenv').config();

const db = require('./db'); // importa conexão do banco 



const app = express();  // cria a aplicação do servidor 
app.use(cors());
app.use(express.json()); // ensino o servidor dados JSON


app.get('/', (req, res) => {
  res.send('Servidor esta rodando'); // cria a primeira rota do servidor, quando algume acessa (/), o servidor responde enviando a mensagem 
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, ()=> {
  console.log ('servidor esta rodando na PORT 3000'); // define em qual prota do servidor vai rodar, e deixa o console ouvindo para saber se deu tudo certo 

})

