// Monitor de erros: o app avisa quando algo dá errado no aparelho do cliente.
// Guardamos só a mensagem técnica, o arquivo/linha, a tela, a versão e o tipo de aparelho (sem dados pessoais).
// Contagem por dia em 'erros:<data>' (some sozinho em 35 dias) e detalhes em 'erros:info'.
const crypto = require('crypto');
const { redis } = require('./_db');

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ ok: false });
  const b = req.body || {};
  const msg = String(b.msg || '').slice(0, 200);
  if (!msg) return res.status(400).json({ ok: false });
  try {
    const ip = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim() || 'sem-ip';
    const k = 'erros:ip:' + ip, n = await redis('INCR', k);
    if (n === 1) await redis('EXPIRE', k, 3600);
    if (n > 30) return res.status(429).json({ ok: false });

    const onde = String(b.onde || '').slice(0, 120);
    const id = crypto.createHash('sha1').update(msg + '|' + onde).digest('hex').slice(0, 16);
    const dia = new Date(Date.now() - 3 * 3600e3).toISOString().slice(0, 10);
    await redis('HINCRBY', 'erros:' + dia, id, 1);
    await redis('EXPIRE', 'erros:' + dia, 35 * 86400);
    await redis('HSET', 'erros:info', id, JSON.stringify({
      msg, onde, tela: String(b.tela || '').slice(0, 30), versao: +b.versao || 0,
      aparelho: String(b.aparelho || '').slice(0, 40), demo: !!b.demo, teste: !!b.teste, ultima: new Date().toISOString(),
    }));
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ ok: false });
  }
};
