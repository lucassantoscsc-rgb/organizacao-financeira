// Indique e ganhe: cada cliente tem um código. O amigo indicado compra com o cupom de desconto
// e quem indicou ganha a planilha (liberada a partir do primeiro amigo que comprar).
//
// A indicação conta de dois jeitos:
//  1. pelo checkout: a página de vendas manda "indica-CODIGO" no link da Cakto e o webhook procura esse texto;
//  2. pelo app: o amigo digita o código em até 30 dias depois da compra.
//
// Redis:
//   ind:cod    conta → código        ind:dono   código → conta
//   ind:quem   amigo → { codigo, dono, em, via }   (uma indicação por amigo)
//   ind:amigos dono → quantos amigos compraram
//   config     cupom, planilha (link do brinde), definidos no painel admin
const crypto = require('crypto');
const { redis, normalizar } = require('./_db');

const LETRAS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const CUPOM_PADRAO = 'AMIGOTINO';

async function config() {
  const c = (await redis('HGETALL', 'config')) || [], o = {};
  for (let i = 0; i < c.length; i += 2) o[c[i]] = c[i + 1];
  return { cupom: o.cupom || CUPOM_PADRAO, planilha: o.planilha || '' };
}

// Credita a indicação. Ignora quem indica a si mesmo e amigos já indicados.
async function creditar(codigo, amigo, via) {
  const dono = await redis('HGET', 'ind:dono', codigo);
  if (!dono || dono === amigo) return false;
  const ok = await redis('HSETNX', 'ind:quem', amigo, JSON.stringify({ codigo, dono, via, em: new Date().toISOString() }));
  if (!ok) return false;
  await redis('HINCRBY', 'ind:amigos', dono, 1);
  return true;
}
// Amigo reembolsado: a indicação deixa de contar.
async function desfazer(amigo) {
  const q = JSON.parse((await redis('HGET', 'ind:quem', amigo)) || 'null');
  if (!q) return;
  await redis('HDEL', 'ind:quem', amigo);
  await redis('HINCRBY', 'ind:amigos', q.dono, -1);
}

async function autenticado(conta, aparelho) {
  const u = JSON.parse((await redis('HGET', 'usos', conta)) || '{}');
  return (u.aparelhos || []).includes(aparelho);
}

module.exports = async (req, res) => {
  // GET ?c=CODIGO: usado pela página de vendas (outro domínio) para mostrar quem indicou e o cupom.
  if (req.method === 'GET') {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Cache-Control', 'public, max-age=300');
    const codigo = String(req.query.c || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 12);
    try {
      const dono = codigo && await redis('HGET', 'ind:dono', codigo);
      if (!dono) return res.status(404).json({ ok: false });
      const nome = await redis('HGET', 'ind:nome', codigo);
      return res.json({ ok: true, nome: nome || '', cupom: (await config()).cupom });
    } catch (e) { return res.status(500).json({ ok: false }); }
  }
  if (req.method !== 'POST') return res.status(405).json({ ok: false });

  const { acao, conta: c, aparelho: a, nome, codigo: cod } = req.body || {};
  const conta = normalizar(c), aparelho = String(a || '').slice(0, 64);
  if (!conta || !aparelho) return res.status(400).json({ ok: false });
  try {
    if (!(await autenticado(conta, aparelho))) return res.status(403).json({ ok: false });

    if (acao === 'meu') {
      // Código do cliente: até 6 letras do primeiro nome + 3 caracteres aleatórios (ex.: ANA7KQ).
      let codigo = await redis('HGET', 'ind:cod', conta);
      const primeiro = String(nome || '').trim().split(/\s+/)[0].slice(0, 20);
      if (!codigo) {
        const base = primeiro.normalize('NFD').replace(/[^A-Za-z]/g, '').toUpperCase().slice(0, 6) || 'TINO';
        do {
          const b = crypto.randomBytes(3);
          codigo = base + [0, 1, 2].map((i) => LETRAS[b[i] % LETRAS.length]).join('');
        } while (!(await redis('HSETNX', 'ind:dono', codigo, conta)));
        await redis('HSET', 'ind:cod', conta, codigo);
      }
      if (primeiro) await redis('HSET', 'ind:nome', codigo, primeiro);
      const [amigos, cfg, quem] = await Promise.all([redis('HGET', 'ind:amigos', conta), config(), redis('HGET', 'ind:quem', conta)]);
      const n = Math.max(0, +amigos || 0);
      return res.json({ ok: true, codigo, amigos: n, cupom: cfg.cupom, planilha: n > 0 ? cfg.planilha : '', indicado: !!quem });
    }

    if (acao === 'usar') {
      // O amigo informa no app o código de quem indicou (até 30 dias depois da compra).
      const codigo = String(cod || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 12);
      const compra = JSON.parse((await redis('HGET', 'codigos', conta)) || 'null');
      if (!compra || compra.origem !== 'cakto') return res.json({ ok: false, erro: 'Só vale para quem comprou o app pela página de vendas.' });
      if (Date.now() - new Date(compra.criado).getTime() > 30 * 864e5) return res.json({ ok: false, erro: 'O código vale até 30 dias depois da compra.' });
      if (await redis('HGET', 'ind:quem', conta)) return res.json({ ok: false, erro: 'Você já informou quem te indicou.' });
      const dono = await redis('HGET', 'ind:dono', codigo);
      if (!dono) return res.json({ ok: false, erro: 'Código não encontrado. Confira com quem te indicou.' });
      if (dono === conta) return res.json({ ok: false, erro: 'Esse é o seu próprio código. 😉' });
      await creditar(codigo, conta, 'app');
      return res.json({ ok: true });
    }
    res.status(400).json({ ok: false });
  } catch (e) {
    res.status(500).json({ ok: false });
  }
};
module.exports.creditar = creditar;
module.exports.desfazer = desfazer;
