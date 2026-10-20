// Exclusão de conta (exigida pela Google Play e pela App Store).
// Apaga os dados pessoais guardados no servidor: aparelhos, notificações, backup na nuvem,
// depoimento e inscrição na lista de espera. Do registro da compra fica só o mínimo
// (e-mail e data), para comprovar a compra e manter o acesso pago se a pessoa voltar.
const { redis, normalizar } = require('./_db');

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ ok: false });
  const { conta: c, aparelho: a } = req.body || {};
  const conta = normalizar(c);
  const aparelho = String(a || '').slice(0, 64);
  if (!conta || !aparelho) return res.status(400).json({ ok: false });

  try {
    const u = JSON.parse((await redis('HGET', 'usos', conta)) || '{}');
    if (!(u.aparelhos || []).includes(aparelho)) return res.status(403).json({ ok: false });

    await redis('HDEL', 'usos', conta);
    await redis('DEL', 'nuvem:' + conta);
    await redis('HDEL', 'depoimentos', conta);
    if (conta.includes('@')) await redis('HDEL', 'lista', conta);
    const meuCod = await redis('HGET', 'ind:cod', conta);   // código do Indique e ganhe (as compras dos amigos continuam contando)
    if (meuCod) await redis('HDEL', 'ind:nome', meuCod);
    const push = (await redis('HGETALL', 'push')) || [];
    for (let i = 0; i < push.length; i += 2) {
      try { if (JSON.parse(push[i + 1]).conta === conta) await redis('HDEL', 'push', push[i]); } catch (e) { /* ignora registro inválido */ }
    }
    const cod = JSON.parse((await redis('HGET', 'codigos', conta)) || 'null');
    if (cod) await redis('HSET', 'codigos', conta, JSON.stringify({ criado: cod.criado, origem: cod.origem || '', nota: 'conta excluída pelo cliente', excluidoEm: new Date().toISOString() }));
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ ok: false });
  }
};
