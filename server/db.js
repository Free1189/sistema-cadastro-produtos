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


module.exports = db; // exporta a conexão pronta para ser usado no js do front 

