// Assinatura pelo Google Play (app Android). Confere a compra direto na API do Google
// (Google Play Developer API), com a conta de serviço salva em GOOGLE_PLAY_SA (o JSON inteiro).
// Quem assina pela loja vira um código de acesso "GP-…" na mesma tabela de quem compra pela Cakto,
// com a data em que a assinatura termina (ate). Renovou, a data anda; cancelou e venceu, o acesso para.
const crypto = require('crypto');
const { redis } = require('./_db');

const PACOTE = 'br.com.tinofinancas.app';
const PRODUTO = 'tino_anual';
let cacheToken = null;

const b64 = (x) => Buffer.from(typeof x === 'string' ? x : JSON.stringify(x)).toString('base64url');

async function tokenGoogle() {
  if (cacheToken && cacheToken.expira > Date.now() + 60e3) return cacheToken.valor;
  const sa = JSON.parse(process.env.GOOGLE_PLAY_SA || 'null');
  if (!sa || !sa.private_key) throw new Error('GOOGLE_PLAY_SA não configurada');
  const agora = Math.floor(Date.now() / 1000);
  const corpo = b64({ alg: 'RS256', typ: 'JWT' }) + '.' + b64({
    iss: sa.client_email, scope: 'https://www.googleapis.com/auth/androidpublisher',
    aud: 'https://oauth2.googleapis.com/token', iat: agora, exp: agora + 3600 });
  const jwt = corpo + '.' + crypto.createSign('RSA-SHA256').update(corpo).sign(sa.private_key, 'base64url');
  const r = await fetch('https://oauth2.googleapis.com/token', { method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: 'grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Ajwt-bearer&assertion=' + jwt });
  const d = await r.json();
  if (!d.access_token) throw new Error('Google recusou a conta de serviço: ' + (d.error_description || d.error || r.status));
  cacheToken = { valor: d.access_token, expira: Date.now() + (d.expires_in || 3600) * 1000 };
  return cacheToken.valor;
}

async function google(caminho, metodo) {
  const r = await fetch('https://androidpublisher.googleapis.com/androidpublisher/v3/applications/' + PACOTE + caminho, {
    method: metodo || 'GET', headers: { Authorization: 'Bearer ' + (await tokenGoogle()) } });
  if (r.status === 404 || r.status === 410) return null;
  const txt = await r.text();
  if (!r.ok) throw new Error('Google Play ' + r.status + ': ' + txt.slice(0, 200));
  return txt ? JSON.parse(txt) : {};
}

// O mesmo assinante mantém o mesmo código: o número do pedido base não muda nas renovações ("..0", "..1").
const codigoDoPedido = (pedido) => 'GP-' + crypto.createHash('sha256').update(String(pedido).replace(/\.\.\d+$/, ''))
  .digest('hex').slice(0, 10).toUpperCase();

// Consulta a compra no Google, reconhece (senão o Google estorna em 3 dias) e grava o acesso.
// Devolve { codigo, ate, ativo } ou null se o token não for uma compra do Tino.
async function conferirCompra(token) {
  token = String(token || '').slice(0, 600);
  if (!token) return null;
  const s = await google('/purchases/subscriptionsv2/tokens/' + encodeURIComponent(token));
  const item = s && (s.lineItems || []).find((l) => l.productId === PRODUTO);
  if (!item) return null;
  if (s.acknowledgementState === 'ACKNOWLEDGEMENT_STATE_PENDING')
    await google('/purchases/subscriptions/' + PRODUTO + '/tokens/' + encodeURIComponent(token) + ':acknowledge', 'POST').catch(() => {});

  // Quem assinou de novo herda o código da assinatura anterior (linkedPurchaseToken).
  let codigo = s.linkedPurchaseToken && (await redis('HGET', 'play:tok', s.linkedPurchaseToken));
  codigo = codigo || (await redis('HGET', 'play:tok', token)) || codigoDoPedido(s.latestOrderId || token);
  await redis('HSET', 'play:tok', token, codigo);

  const ate = item.expiryTime || null;
  const ativo = !!ate && new Date(ate).getTime() > Date.now() && !/EXPIRED|_PENDING$|ON_HOLD|PAUSED/.test(s.subscriptionState || '');
  const antigo = JSON.parse((await redis('HGET', 'codigos', codigo)) || 'null') || {};
  await redis('HSET', 'codigos', codigo, JSON.stringify({ ...antigo, criado: antigo.criado || new Date().toISOString(),
    origem: 'play', token, ate, estado: s.subscriptionState || '', teste: !!s.testPurchase,
    conferido: new Date().toISOString() }));
  return { codigo, ate, ativo };
}

// Para as rotas de acesso: um código da loja só vale enquanto a assinatura estiver em dia.
// Venceu a data guardada: pergunta ao Google de novo (pode ter renovado). Sem resposta do Google, deixa passar.
async function acessoPlayAtivo(codigo) {
  if (!/^GP-/.test(codigo)) return true;
  const c = JSON.parse((await redis('HGET', 'codigos', codigo)) || 'null');
  if (!c) return false;
  if (c.ate && new Date(c.ate).getTime() > Date.now()) return true;
  try { const r = await conferirCompra(c.token); return !!(r && r.ativo); }
  catch (e) { return true; }
}

module.exports = { conferirCompra, acessoPlayAtivo, PRODUTO };
