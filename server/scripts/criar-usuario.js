// Cria ou atualiza um usuário de login com senha em hash (bcrypt).
// Uso: node scripts/criar-usuario.js <usuario> <senha> <perfil>
// perfil: vendas | admin | relatorios
//
// Usa uma conexão própria (não importa server/db.js) para não disparar
// as migrações de schema de todo o sistema por causa de um comando simples.

const path = require('path');
const { Pool } = require('pg');
const bcrypt = require('bcryptjs');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const pool = new Pool({
  user: process.env.DB_USER,
  host: process.env.DB_HOST,
  database: process.env.DB_NAME,
  password: process.env.DB_PASSWORD,
  port: process.env.DB_PORT
});

async function main() {
  const [usuario, senha, perfil] = process.argv.slice(2);

  if (!usuario || !senha || !perfil) {
    console.error('Uso: node scripts/criar-usuario.js <usuario> <senha> <perfil>');
    console.error('perfil: vendas | admin | relatorios');
    process.exitCode = 1;
    return;
  }

  if (!['vendas', 'admin', 'relatorios'].includes(perfil)) {
    console.error(`Perfil inválido: ${perfil}. Use vendas, admin ou relatorios.`);
    process.exitCode = 1;
    return;
  }

  await pool.query(`
    CREATE TABLE IF NOT EXISTS usuarios_login (
      id SERIAL PRIMARY KEY,
      usuario VARCHAR(60) UNIQUE NOT NULL,
      senha_hash VARCHAR(100) NOT NULL,
      perfil VARCHAR(20) NOT NULL,
      ativo BOOLEAN NOT NULL DEFAULT true,
      criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);

  const senhaHash = await bcrypt.hash(senha, 12);

  await pool.query(
    `INSERT INTO usuarios_login (usuario, senha_hash, perfil)
     VALUES ($1, $2, $3)
     ON CONFLICT (usuario) DO UPDATE SET senha_hash = $2, perfil = $3, ativo = true`,
    [usuario, senhaHash, perfil]
  );

  console.log(`Usuário "${usuario}" (perfil: ${perfil}) criado/atualizado com sucesso.`);
}

main()
  .catch((err) => {
    console.error('Erro ao criar usuário:', err);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
