// Confere o acesso no servidor (Vercel).
// Aceita o e-mail da compra (cadastrado automaticamente pela Cakto em api/cakto.js)
// ou um código criado em /admin.html. Cada um libera até MAX_APARELHOS aparelhos (padrão 3).
// No iPhone, o app instalado na tela de início conta como um aparelho separado do Safari.
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

    const max = Math.max(1, parseInt(process.env.MAX_APARELHOS, 10) || 3);
    const agora = new Date().toISOString();
    if (await redis('HSETNX', 'usos', codigo, JSON.stringify({ aparelhos: [aparelho], em: agora })))
      return res.status(200).json({ ok: true });

    // Já usado: libera se for um aparelho conhecido ou se ainda couber mais um.
    const atual = JSON.parse((await redis('HGET', 'usos', codigo)) || '{}');
    const aparelhos = atual.aparelhos || (atual.aparelho ? [atual.aparelho] : []);
    if (aparelhos.includes(aparelho)) return res.status(200).json({ ok: true });
    if (aparelhos.length < max) {
      aparelhos.push(aparelho);
      await redis('HSET', 'usos', codigo, JSON.stringify({ aparelhos, em: atual.em || agora }));
      return res.status(200).json({ ok: true });
    }
    res.status(409).json({ ok: false, erro: `Este acesso já foi usado em ${max} aparelhos. Fale com o suporte para liberar um novo.` });
  } catch (e) {
    res.status(500).json({ ok: false, erro: 'Erro no servidor. Tente de novo em instantes.' });
  }
};
