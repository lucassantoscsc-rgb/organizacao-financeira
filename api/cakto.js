// Webhook da Cakto: cadastra o e-mail de quem comprou e remove em reembolso/chargeback.
// Configure na Cakto a URL https://SEU-LINK/api/cakto e copie o "secret" para a
// variável CAKTO_SECRET na Vercel.
const crypto = require('crypto');
const { redis, normalizar } = require('./_db');
const indique = require('./indique');

function secretOk(recebido) {
  const certo = Buffer.from(process.env.CAKTO_SECRET || '');
  const veio = Buffer.from(String(recebido || ''));
  return certo.length > 0 && certo.length === veio.length && crypto.timingSafeEqual(certo, veio);
}

// Métricas por dia (horário de Brasília): compras, reembolsos e chargebacks.
// Nunca derruba o webhook: qualquer erro aqui é ignorado. Eventos repetidos (mesmo pedido) contam uma vez só.
async function registrar(tipo, dados) {
  try {
    const dia = new Date(Date.now() - 3 * 3600e3).toISOString().slice(0, 10);
    const id = String(dados.refId || dados.id || '');
    if (id && !(await redis('HSETNX', 'met:pedidos', tipo + ':' + id, dia))) return;
    await redis('HINCRBY', 'met:' + tipo, dia, 1);
    const valor = [dados.amount, dados.baseAmount].map(Number).find((v) => v > 0);
    if (valor && tipo === 'compra') await redis('HINCRBYFLOAT', 'met:valor', dia, String(valor));
  } catch (e) { /* métrica é secundária */ }
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
      await registrar('compra', dados);
      // Indique e ganhe: a página de vendas manda "indica-CODIGO" no link do checkout (campo sck).
      try {
        const m = JSON.stringify(dados).match(/indica-([A-Z0-9]{4,12})/i);
        if (m) await indique.creditar(m[1].toUpperCase(), email, 'checkout');
      } catch (e) { /* indicação é secundária */ }
    } else if (corpo.event === 'refund' || corpo.event === 'chargeback') {
      await redis('HDEL', 'codigos', email);
      await redis('HDEL', 'usos', email);
      await redis('DEL', 'nuvem:' + email);   // backup na nuvem de quem foi reembolsado
      await registrar(corpo.event === 'refund' ? 'reembolso' : 'chargeback', dados);
      try { await indique.desfazer(email); } catch (e) { /* indicação é secundária */ }
    }
    res.status(200).json({ ok: true });
  } catch (e) {
    res.status(500).json({ ok: false, erro: e.message });
  }
};
