// Banco Postgres do Tino Plus (Neon, ligado pela Vercel na variável DATABASE_URL).
// O Redis (_db.js) continua com o acesso do vitalício e as métricas.
// As tabelas são criadas sozinhas na primeira chamada de cada instância.
const { neon } = require('@neondatabase/serverless');

let sql = null, pronto = null;
function banco() {
  if (!process.env.DATABASE_URL) throw new Error('Banco do Plus não configurado');
  if (!sql) sql = neon(process.env.DATABASE_URL);
  if (!pronto) pronto = criarTabelas().catch((e) => { pronto = null; throw e; });
  return pronto.then(() => sql);
}

async function criarTabelas() {
  await sql`CREATE TABLE IF NOT EXISTS contas (
    email      text PRIMARY KEY,
    criado     timestamptz NOT NULL DEFAULT now(),
    plano      text NOT NULL DEFAULT 'gratis',      -- 'gratis' ou 'plus'
    plus_ate   timestamptz,                         -- assinatura válida até
    fundador   boolean NOT NULL DEFAULT false,      -- comprou o vitalício antes do Plus
    whatsapp   text UNIQUE
  )`;
  await sql`CREATE TABLE IF NOT EXISTS codigos_login (
    email      text PRIMARY KEY,
    hash       text NOT NULL,
    expira     timestamptz NOT NULL,
    tentativas int NOT NULL DEFAULT 0
  )`;
  await sql`CREATE TABLE IF NOT EXISTS sessoes (
    token_hash text PRIMARY KEY,
    email      text NOT NULL REFERENCES contas(email) ON DELETE CASCADE,
    aparelho   text,
    criado     timestamptz NOT NULL DEFAULT now(),
    expira     timestamptz NOT NULL
  )`;
  await sql`CREATE INDEX IF NOT EXISTS sessoes_email ON sessoes(email)`;
}

module.exports = { banco };
