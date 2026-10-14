// Acesso ao banco Redis (Upstash, ligado pela Vercel) via API REST.
// Arquivos com "_" na frente não viram rota na Vercel.
const URL_DB = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
const TOKEN = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;

async function redis(...cmd) {
  if (!URL_DB || !TOKEN) throw new Error('Banco de dados não configurado');
  const r = await fetch(URL_DB, {
    method: 'POST',
    headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(cmd),
  });
  const d = await r.json();
  if (d.error) throw new Error(d.error);
  return d.result;
}

const normalizar = (c) => String(c || '').trim().toUpperCase();

module.exports = { redis, normalizar };
