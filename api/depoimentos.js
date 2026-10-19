// Depoimentos enviados de dentro do app. Só aceita quem tem acesso ativo neste aparelho.
// Fica guardado no hash 'depoimentos' (um por conta; um novo envio substitui o anterior).
const { redis, normalizar } = require('./_db');

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ ok: false });
  const { conta: c, aparelho: a, nota, texto, nome, autoriza } = req.body || {};
  const conta = normalizar(c);
  const aparelho = String(a || '').slice(0, 64);
  const n = parseInt(nota, 10);
  const t = String(texto || '').trim().slice(0, 600);
  if (!conta || !aparelho || !(n >= 1 && n <= 5) || !t) return res.status(400).json({ ok: false });

  try {
    if (!(await redis('HEXISTS', 'codigos', conta))) return res.status(403).json({ ok: false });
    const u = JSON.parse((await redis('HGET', 'usos', conta)) || '{}');
    if (!(u.aparelhos || []).includes(aparelho)) return res.status(403).json({ ok: false });
    await redis('HSET', 'depoimentos', conta, JSON.stringify({
      nota: n, texto: t, nome: String(nome || '').trim().slice(0, 40), autoriza: !!autoriza, em: new Date().toISOString(),
    }));
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ ok: false });
  }
};
