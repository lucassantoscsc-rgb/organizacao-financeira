// O app Android manda o token da compra feita no Google Play; o servidor confere no Google
// e devolve o código de acesso da conta (o mesmo nas renovações e ao restaurar em outro aparelho).
const { conferirCompra } = require('./_play');

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ ok: false });
  try {
    const r = await conferirCompra(req.body && req.body.token);
    if (!r) return res.status(404).json({ ok: false, erro: 'Não encontramos essa assinatura no Google Play.' });
    if (!r.ativo) return res.status(402).json({ ok: false, erro: 'Sua assinatura do Google Play não está ativa. Assine de novo para continuar.' });
    res.json({ ok: true, codigo: r.codigo, ate: r.ate });
  } catch (e) {
    console.error('play', e.message);
    res.status(500).json({ ok: false, erro: 'Não conseguimos confirmar com o Google agora. Tente de novo em instantes.' });
  }
};
