// Lista de espera do "Tino Conectado" (Open Finance, plano futuro com mensalidade).
// Recebe inscrições do app e da página de vendas (outro domínio, por isso o CORS).
// Um registro por e-mail no hash 'lista'; inscrever de novo só atualiza as respostas.
const { redis, normalizar } = require('./_db');

const ORIGENS = ['https://planilhadeorganizacaofinanceira.online', 'https://www.planilhadeorganizacaofinanceira.online'];
const PRECOS = ['ate10', 'ate15', 'ate20', 'mais20', 'nao'];
const BANCOS = ['Nubank', 'Itaú', 'Bradesco', 'Caixa', 'Banco do Brasil', 'Santander', 'Inter', 'C6', 'Mercado Pago', 'PicPay', 'Outro'];

module.exports = async (req, res) => {
  const origem = req.headers.origin;
  if (ORIGENS.includes(origem)) {
    res.setHeader('Access-Control-Allow-Origin', origem);
    res.setHeader('Vary', 'Origin');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  }
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ ok: false });

  const { email: e, preco, bancos, de, cliente } = req.body || {};
  const email = normalizar(e);
  if (!/^[^\s@]{1,64}@[^\s@]{1,190}\.[a-z]{2,}$/.test(email)) return res.status(400).json({ ok: false, erro: 'email' });

  try {
    // Limite simples contra robôs: 10 inscrições por IP por hora.
    const ip = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim() || 'sem-ip';
    const k = 'lista:ip:' + ip;
    const n = await redis('INCR', k);
    if (n === 1) await redis('EXPIRE', k, 3600);
    if (n > 10) return res.status(429).json({ ok: false });

    const ehCliente = !!cliente && !!(await redis('HEXISTS', 'codigos', email));
    await redis('HSET', 'lista', email, JSON.stringify({
      preco: PRECOS.includes(preco) ? preco : '',
      bancos: (Array.isArray(bancos) ? bancos : []).filter((b) => BANCOS.includes(b)).slice(0, 11),
      de: de === 'app' ? 'app' : 'pagina',
      cliente: ehCliente,
      em: new Date().toISOString(),
    }));
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ ok: false });
  }
};
