// Pesquisa de satisfação (NPS): nota de 0 a 10 e comentário opcional. Um registro por conta.
// Só aceita quem tem acesso ativo neste aparelho.
const { redis, normalizar } = require('./_db');

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ ok: false });
  const { conta: c, aparelho: a, nota, texto, versao } = req.body || {};
  const conta = normalizar(c), aparelho = String(a || '').slice(0, 64), n = parseInt(nota, 10);
  if (!conta || !aparelho || !(n >= 0 && n <= 10)) return res.status(400).json({ ok: false });
  try {
    const u = JSON.parse((await redis('HGET', 'usos', conta)) || '{}');
    if (!(u.aparelhos || []).includes(aparelho)) return res.status(403).json({ ok: false });
    await redis('HSET', 'nps', conta, JSON.stringify({ nota: n, texto: String(texto || '').trim().slice(0, 600), versao: +versao || 0, em: new Date().toISOString() }));
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ ok: false });
  }
};
