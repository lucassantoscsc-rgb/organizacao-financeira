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
  // Dados sincronizados do app: uma linha por item (um gasto, um cartão, uma configuração...).
  // 'seq' cresce a cada alteração; cada aparelho guarda até onde já recebeu.
  await sql`CREATE SEQUENCE IF NOT EXISTS itens_seq`;
  await sql`CREATE TABLE IF NOT EXISTS itens (
    email    text NOT NULL REFERENCES contas(email) ON DELETE CASCADE,
    chave    text NOT NULL,
    valor    jsonb,
    apagado  boolean NOT NULL DEFAULT false,
    seq      bigint NOT NULL,
    aparelho text,
    alterado timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (email, chave)
  )`;
  await sql`CREATE INDEX IF NOT EXISTS itens_email_seq ON itens(email, seq)`;
}

// Sessão do Tino Plus a partir do cabeçalho "Authorization: Bearer <token>".
const crypto = require('crypto');
const hash = (s) => crypto.createHash('sha256').update(String(s)).digest('hex');
async function sessao(req, sql) {
  const t = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  if (t.length < 20) return null;
  const [s] = await sql`SELECT email, token_hash FROM sessoes WHERE token_hash = ${hash(t)} AND expira > now()`;
  return s || null;
}
const plusAtivo = (c) => !!c && c.plano === 'plus' && (!c.plus_ate || new Date(c.plus_ate) > new Date());

module.exports = { banco, sessao, hash, plusAtivo };
