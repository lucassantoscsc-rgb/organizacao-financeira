// Assinatura do Tino Plus na Cakto (produto do tipo assinatura). Chega pelo mesmo webhook do vitalício (api/cakto.js),
// que separa os eventos pelo tipo do produto. Assim, comprar ou reembolsar o Plus nunca mexe no acesso vitalício.
//   compra aprovada, assinatura criada, renovada, recuperada ou retomada → Plus até o próximo pagamento + 3 dias
//   cancelada → continua até o fim do período já pago        atrasada / renovação recusada → segue nos 3 dias de folga
//   pausada, reembolso ou chargeback → Plus termina agora
const { redis } = require('./_db');
const { banco } = require('./_pg');

const ATIVAM = ['purchase_approved', 'subscription_created', 'subscription_renewed', 'subscription_late_recovered', 'subscription_resumed'];
const FOLGA = 3 * 864e5;
const dia = () => new Date(Date.now() - 3 * 3600e3).toISOString().slice(0, 10);

async function processarAssinatura(evento, dados, email) {
  const sql = await banco();
  const sub = dados.subscription || {}, oferta = dados.offer || {};
  const valor = [oferta.price, dados.baseAmount, dados.amount].map(Number).find((v) => v > 0) || null;
  const info = { id: sub.id || null, status: sub.status || null, proxima: sub.next_payment_date || null, valor, oferta: oferta.id || null,
    evento, em: new Date().toISOString() };
  const jaFundador = !!(await redis('HGET', 'codigos', email));

  if (ATIVAM.includes(evento)) {
    const prox = Date.parse(sub.next_payment_date || '');
    const ate = new Date((prox > Date.now() ? prox : Date.now() + 30 * 864e5) + FOLGA).toISOString();
    const [antes] = await sql`SELECT assinatura FROM contas WHERE email = ${email}`;
    await sql`INSERT INTO contas (email, plano, plus_ate, fundador, assinatura) VALUES (${email}, 'plus', ${ate}, ${jaFundador}, ${JSON.stringify(info)}::jsonb)
      ON CONFLICT (email) DO UPDATE SET plano = 'plus', plus_ate = GREATEST(${ate}::timestamptz, CASE WHEN contas.convidado THEN NULL ELSE contas.plus_ate END),
        convidado = false, fundador = contas.fundador OR EXCLUDED.fundador, assinatura = EXCLUDED.assinatura`;
    // métrica: nova assinatura só na primeira vez (a Cakto manda compra aprovada E assinatura criada)
    const nova = !antes || !antes.assinatura || (antes.assinatura.id && info.id && antes.assinatura.id !== info.id);
    if (nova && evento !== 'subscription_renewed') await registrar('nova', email + ':' + (info.id || dia()));
    else if (evento === 'subscription_renewed') await registrar('renovada', email + ':' + (info.id || '') + ':' + (sub.current_period || dia()));
  } else if (evento === 'subscription_canceled') {
    await sql`UPDATE contas SET assinatura = ${JSON.stringify(info)}::jsonb, plus_ate = COALESCE(plus_ate, now()) WHERE email = ${email}`;
    await registrar('cancelada', email + ':' + (info.id || dia()));
  } else if (evento === 'subscription_late' || evento === 'subscription_renewal_refused') {
    await sql`UPDATE contas SET assinatura = ${JSON.stringify(info)}::jsonb WHERE email = ${email}`;
    await registrar('atrasada', email + ':' + dia());
  } else if (evento === 'subscription_paused' || evento === 'refund' || evento === 'chargeback') {
    await sql`UPDATE contas SET plano = 'gratis', plus_ate = now(), assinatura = ${JSON.stringify(info)}::jsonb WHERE email = ${email}`;
    if (evento !== 'subscription_paused') await registrar('reembolso', email + ':' + (dados.refId || dados.id || dia()));
  }
}

// Métricas por dia, no Redis (para o painel admin). Eventos repetidos contam uma vez só.
async function registrar(tipo, id) {
  try {
    if (!(await redis('HSETNX', 'met:plus:ids', tipo + ':' + id, dia()))) return;
    await redis('HINCRBY', 'met:plus:' + tipo, dia(), 1);
  } catch (e) { /* métrica é secundária */ }
}

const ehAssinatura = (evento, dados) => /^subscription_/.test(String(evento)) || (dados && dados.product && dados.product.type === 'subscription');

module.exports = { processarAssinatura, ehAssinatura };
