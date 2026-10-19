// Webhook da Cakto: cadastra o e-mail de quem comprou e remove em reembolso/chargeback.
// Configure na Cakto a URL https://SEU-LINK/api/cakto e copie o "secret" para a
// variável CAKTO_SECRET na Vercel.
const crypto = require('crypto');
const { redis, normalizar } = require('./_db');

function secretOk(recebido) {
  const certo = Buffer.from(process.env.CAKTO_SECRET || '');
  const veio = Buffer.from(String(recebido || ''));
  return certo.length > 0 && certo.length === veio.length && crypto.timingSafeEqual(certo, veio);
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ ok: false });
  const corpo = req.body || {};
  if (!secretOk(corpo.secret)) return res.status(401).json({ ok: false });

  const dados = corpo.data || {};
  const cliente = dados.customer || {};
  const email = normalizar(cliente.email);
  if (!email.includes('@')) return res.status(200).json({ ok: true, ignorado: 'sem e-mail' });

  try {
    if (corpo.event === 'purchase_approved') {
      await redis('HSET', 'codigos', email, JSON.stringify({
        nota: `${cliente.name || ''} · Cakto ${dados.refId || dados.id || ''}`.trim(),
        criado: new Date().toISOString(),
        origem: 'cakto',
      }));
    } else if (corpo.event === 'refund' || corpo.event === 'chargeback') {
      await redis('HDEL', 'codigos', email);
      await redis('HDEL', 'usos', email);
      await redis('DEL', 'nuvem:' + email);   // backup na nuvem de quem foi reembolsado
    }
    res.status(200).json({ ok: true });
  } catch (e) {
    res.status(500).json({ ok: false, erro: e.message });
  }
};
