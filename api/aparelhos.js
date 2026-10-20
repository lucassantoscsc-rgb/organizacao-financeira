// Aparelhos de uma conta: verificar se este aparelho ainda tem acesso, listar e remover outros.
// Só responde para quem manda um aparelho que já está liberado nessa conta.
const crypto = require('crypto');
const { redis, normalizar } = require('./_db');

const apelido = (id) => crypto.createHash('sha256').update(id).digest('hex').slice(0, 12);

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ ok: false });
  const { conta: c, aparelho: a, acao, alvo, nome } = req.body || {};
  const conta = normalizar(c);
  const aparelho = String(a || '').slice(0, 64);
  if (!conta || !aparelho) return res.status(400).json({ ok: false });

  // Códigos fixos (ACCESS_CODES) não controlam aparelhos.
  const fixos = (process.env.ACCESS_CODES || '').split(',').map(normalizar).filter(Boolean);
  if (fixos.includes(conta)) return res.json({ ok: true, fixo: true, lista: [] });

  try {
    if (!(await redis('HEXISTS', 'codigos', conta)))
      return res.status(403).json({ ok: false, motivo: 'sem-acesso' });
    const u = JSON.parse((await redis('HGET', 'usos', conta)) || '{}');
    const aparelhos = u.aparelhos || (u.aparelho ? [u.aparelho] : []);
    const info = u.info || {};
    if (!aparelhos.includes(aparelho)) return res.status(403).json({ ok: false, motivo: 'removido' });

    const agora = new Date().toISOString();
    info[aparelho] = { ...(info[aparelho] || { em: u.em || agora }), visto: agora };
    if (nome) info[aparelho].nome = String(nome).slice(0, 60);
    if (req.body.lancou) info[aparelho].lancou = true;   // já anotou algo no app (para medir a ativação)

    if (acao === 'remover') {
      const id = aparelhos.find((x) => apelido(x) === alvo);
      if (!id || id === aparelho) return res.status(400).json({ ok: false, erro: 'Aparelho não encontrado' });
      aparelhos.splice(aparelhos.indexOf(id), 1);
      delete info[id];
    }
    await redis('HSET', 'usos', conta, JSON.stringify({ aparelhos, em: u.em || agora, info }));

    const max = Math.max(1, parseInt(process.env.MAX_APARELHOS, 10) || 3);
    const lista = aparelhos.map((id) => ({
      id: apelido(id), nome: (info[id] && info[id].nome) || 'Aparelho',
      desde: (info[id] && info[id].em) || u.em, visto: info[id] && info[id].visto, atual: id === aparelho,
    }));
    res.json({ ok: true, max, lista });
  } catch (e) {
    res.status(500).json({ ok: false, erro: 'Erro no servidor. Tente de novo em instantes.' });
  }
};
