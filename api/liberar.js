// Confere o acesso no servidor (Vercel).
// Aceita o e-mail da compra (cadastrado automaticamente pela Cakto em api/cakto.js)
// ou um código criado em /admin.html. Cada um libera um único aparelho.
// ACCESS_CODES (opcional): códigos fixos, sem limite de aparelhos, separados por vírgula.
const { redis, normalizar } = require('./_db');

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ ok: false });
  const codigo = normalizar(req.body && req.body.codigo);
  const aparelho = String((req.body && req.body.aparelho) || '').slice(0, 64);
  if (!codigo) return res.status(401).json({ ok: false, erro: 'Código inválido' });

  const fixos = (process.env.ACCESS_CODES || '').split(',').map(normalizar).filter(Boolean);
  if (fixos.includes(codigo)) return res.status(200).json({ ok: true });

  try {
    if (!(await redis('HEXISTS', 'codigos', codigo)))
      return res.status(401).json({ ok: false, erro: codigo.includes('@')
        ? 'Não encontramos uma compra com este e-mail. Confira se é o mesmo usado na compra.'
        : 'Código inválido' });
    if (!aparelho) return res.status(400).json({ ok: false, erro: 'Atualize o app e tente de novo' });

    const uso = JSON.stringify({ aparelho, em: new Date().toISOString() });
    if (await redis('HSETNX', 'usos', codigo, uso)) return res.status(200).json({ ok: true });

    // Já usado: só libera de novo se for o mesmo aparelho.
    const atual = JSON.parse((await redis('HGET', 'usos', codigo)) || '{}');
    if (atual.aparelho === aparelho) return res.status(200).json({ ok: true });
    res.status(409).json({ ok: false, erro: 'Este acesso já foi usado em outro aparelho. Fale com o suporte.' });
  } catch (e) {
    res.status(500).json({ ok: false, erro: 'Erro no servidor. Tente de novo em instantes.' });
  }
};
