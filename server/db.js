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

const prepararTabelaClientes = criarTabelaClientes.then(() => db.query(`
  ALTER TABLE clientes
    ADD COLUMN IF NOT EXISTS cidade VARCHAR(100),
    ADD COLUMN IF NOT EXISTS rua VARCHAR(150),
    ADD COLUMN IF NOT EXISTS numero VARCHAR(20),
    ADD COLUMN IF NOT EXISTS bairro VARCHAR(100)
`)).catch((err) => console.error('erro ao preparar tabela clientes', err));

const criarTabelaVendas = prepararTabelaClientes.then(() => db.query(`
  CREATE TABLE IF NOT EXISTS vendas (
    id SERIAL PRIMARY KEY,
    cliente_id INTEGER REFERENCES clientes(id) ON DELETE SET NULL,
    cliente_nome VARCHAR(150) NOT NULL,
    tipo_pagamento VARCHAR(20) NOT NULL,
    vencimento DATE,
    desconto NUMERIC(10, 2) NOT NULL DEFAULT 0,
    juros NUMERIC(10, 2) NOT NULL DEFAULT 0,
    status_pagamento VARCHAR(20) NOT NULL DEFAULT 'pendente',
    pago_em TIMESTAMP,
    valor_pago NUMERIC(12, 2) NOT NULL DEFAULT 0,
    saldo_devedor NUMERIC(12, 2),
    subtotal NUMERIC(12, 2) NOT NULL,
    total NUMERIC(12, 2) NOT NULL,
    itens JSONB NOT NULL DEFAULT '[]'::jsonb,
    status VARCHAR(30) NOT NULL DEFAULT 'finalizada',
    data_venda_dia DATE,
    numero_venda_dia INTEGER,
    criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  )
`)).then(() => db.query(`
  ALTER TABLE vendas
    ADD COLUMN IF NOT EXISTS itens JSONB NOT NULL DEFAULT '[]'::jsonb,
    ADD COLUMN IF NOT EXISTS status VARCHAR(30) NOT NULL DEFAULT 'finalizada',
    ADD COLUMN IF NOT EXISTS juros NUMERIC(10, 2) NOT NULL DEFAULT 0
    ,ADD COLUMN IF NOT EXISTS status_pagamento VARCHAR(20) NOT NULL DEFAULT 'pendente'
    ,ADD COLUMN IF NOT EXISTS pago_em TIMESTAMP
    ,ADD COLUMN IF NOT EXISTS valor_pago NUMERIC(12, 2) NOT NULL DEFAULT 0
    ,ADD COLUMN IF NOT EXISTS saldo_devedor NUMERIC(12, 2)
    ,ADD COLUMN IF NOT EXISTS data_venda_dia DATE
    ,ADD COLUMN IF NOT EXISTS numero_venda_dia INTEGER
`)).catch((err) => console.error('erro ao preparar tabela vendas', err));

criarTabelaVendas.then(() => db.query(`
  CREATE TABLE IF NOT EXISTS venda_contadores_diarios (
    data_venda DATE PRIMARY KEY,
    ultimo_numero INTEGER NOT NULL DEFAULT 0
  )
`)).catch((err) => console.error('erro ao criar tabela venda_contadores_diarios', err));

criarTabelaVendas.then(() => db.query(`
  UPDATE vendas
  SET data_venda_dia = criado_em::date
  WHERE data_venda_dia IS NULL
`)).catch((err) => console.error('erro ao atualizar data_venda_dia', err));

criarTabelaVendas.then(() => db.query(`
  WITH vendas_ordenadas AS (
    SELECT id,
           ROW_NUMBER() OVER (PARTITION BY data_venda_dia ORDER BY criado_em, id) AS numero_dia
    FROM vendas
    WHERE data_venda_dia IS NOT NULL
  )
  UPDATE vendas v
  SET numero_venda_dia = vo.numero_dia
  FROM vendas_ordenadas vo
  WHERE v.id = vo.id
    AND v.numero_venda_dia IS NULL
`)).catch((err) => console.error('erro ao atualizar numero_venda_dia', err));

criarTabelaVendas.then(() => db.query(`
  INSERT INTO venda_contadores_diarios (data_venda, ultimo_numero)
  SELECT data_venda_dia, MAX(numero_venda_dia)
  FROM vendas
  WHERE data_venda_dia IS NOT NULL
    AND numero_venda_dia IS NOT NULL
  GROUP BY data_venda_dia
  ON CONFLICT (data_venda)
  DO UPDATE SET ultimo_numero = GREATEST(venda_contadores_diarios.ultimo_numero, EXCLUDED.ultimo_numero)
`)).catch((err) => console.error('erro ao sincronizar venda_contadores_diarios', err));

criarTabelaVendas.then(() => db.query(`
  UPDATE vendas
  SET valor_pago = COALESCE(valor_pago, 0),
      saldo_devedor = GREATEST(total + juros - COALESCE(valor_pago, 0), 0),
      status_pagamento = COALESCE(status_pagamento, 'pendente')
  WHERE saldo_devedor IS NULL OR valor_pago IS NULL OR status_pagamento IS NULL
`)).catch((err) => console.error('erro ao atualizar saldos das vendas', err));

criarTabelaVendas.then(() => db.query(`
  CREATE TABLE IF NOT EXISTS devolucoes (
    id SERIAL PRIMARY KEY,
    cliente_id INTEGER REFERENCES clientes(id) ON DELETE SET NULL,
    venda_id INTEGER REFERENCES vendas(id) ON DELETE SET NULL,
    produto_id INTEGER NOT NULL,
    quantidade INTEGER NOT NULL CHECK (quantidade > 0),
    criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  )
`)).catch((err) => console.error('erro ao criar tabela devolucoes', err));

const criarTabelaAvisos = criarTabelaVendas.then(() => db.query(`
  CREATE TABLE IF NOT EXISTS avisos_cobranca (
    venda_id INTEGER PRIMARY KEY REFERENCES vendas(id) ON DELETE CASCADE,
    enviado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  )
`)).catch((err) => console.error('erro ao criar tabela avisos_cobranca', err));

criarTabelaAvisos.then(() => db.query(`
  ALTER TABLE avisos_cobranca
    ADD COLUMN IF NOT EXISTS tipo VARCHAR(20) NOT NULL DEFAULT 'vencimento'
`)).then(() => db.query(`
  ALTER TABLE avisos_cobranca DROP CONSTRAINT IF EXISTS avisos_cobranca_pkey
`)).then(() => db.query(`
  ALTER TABLE avisos_cobranca ADD PRIMARY KEY (venda_id, tipo)
`)).catch((err) => console.error('erro ao preparar tabela avisos_cobranca', err));

criarTabelaVendas.then(() => db.query(`
  CREATE TABLE IF NOT EXISTS cobrancas_asaas (
    id SERIAL PRIMARY KEY,
    grupo_id VARCHAR(80) NOT NULL,
    asaas_payment_id VARCHAR(100) UNIQUE NOT NULL,
    cliente_id INTEGER REFERENCES clientes(id) ON DELETE SET NULL,
    venda_ids INTEGER[] NOT NULL,
    valor_cobrado NUMERIC(12, 2) NOT NULL DEFAULT 0,
    valor_recebido NUMERIC(12, 2) NOT NULL DEFAULT 0,
    status VARCHAR(30) NOT NULL DEFAULT 'PENDING',
    criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  )
`)).then(() => db.query(`
  ALTER TABLE cobrancas_asaas
    ADD COLUMN IF NOT EXISTS valor_cobrado NUMERIC(12, 2) NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS valor_recebido NUMERIC(12, 2) NOT NULL DEFAULT 0
`)).catch((err) => console.error('erro ao preparar tabela cobrancas_asaas', err));


criarTabelaVendas.then(() => db.query(`
  CREATE TABLE IF NOT EXISTS despesas (
    id SERIAL PRIMARY KEY,
    categoria VARCHAR(30) NOT NULL,
    descricao VARCHAR(200),
    valor NUMERIC(12, 2) NOT NULL,
    data_despesa DATE NOT NULL,
    criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  )
`)).catch((err) => console.error('erro ao criar tabela despesas', err));

module.exports = db; // exporta a conexão pronta para ser usado no js do front

