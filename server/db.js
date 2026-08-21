const { Pool } = require('pg'); // importa o gerenciador do drive 
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') }); // carrega o .env desta pasta

const db = new Pool({ // monta as credenciais de acesso puxando dos dados 

  user: process.env.DB_USER,
  host: process.env.DB_HOST,
  database: process.env.DB_NAME,
  password: process.env.DB_PASSWORD,
  port: process.env.DB_PORT,

})
db.connect((err) => { // tenta abrir a conexão  

  if (err) {
    console.error('erro ao consectar o pSQL', err.stack);

  }
  else {
    console.log(" conectado com sucesso ! ");

  }
})

const criarTabelaClientes = db.query(`
  CREATE TABLE IF NOT EXISTS clientes (
    id SERIAL PRIMARY KEY,
    nome VARCHAR(150) NOT NULL,
    cpf VARCHAR(14) UNIQUE,
    telefone VARCHAR(30),
    endereco TEXT,
    criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  )
`);

criarTabelaClientes.then(() => db.query(`
  ALTER TABLE clientes
    ADD COLUMN IF NOT EXISTS cidade VARCHAR(100),
    ADD COLUMN IF NOT EXISTS rua VARCHAR(150),
    ADD COLUMN IF NOT EXISTS numero VARCHAR(20),
    ADD COLUMN IF NOT EXISTS bairro VARCHAR(100)
`)).catch((err) => console.error('erro ao preparar tabela clientes', err));


module.exports = db; // exporta a conexão pronta para ser usado no js do front 

