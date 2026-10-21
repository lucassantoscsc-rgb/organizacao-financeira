// E-mails da sequência de boas-vindas (o de compra sai no webhook da Cakto).
//   GET ?e=<email>&t=<token>   → link "Não quero receber mais dicas"
//   GET (Vercel Cron, ~10h de Brasília, com CRON_SECRET) → envia d1, d3 e d7 para quem comprou nos últimos 10 dias
const crypto = require('crypto');
const { redis } = require('./_db');
const { enviarEtapa, token, primeiroNome } = require('./_emails');

const pagina = (titulo, texto) => `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${titulo}</title></head>
<body style="margin:0;background:#f3f6f4;font-family:Arial,sans-serif;color:#0f1e1a"><div style="max-width:440px;margin:60px auto;padding:24px;background:#fff;border-radius:18px;text-align:center">
<h1 style="font-size:21px">${titulo}</h1><p style="line-height:1.5;color:#4b5f5a">${texto}</p></div></body></html>`;

module.exports = async (req, res) => {
  const { e, t } = req.query || {};
  if (e) {
    const email = String(e).trim().toLowerCase();
    const a = Buffer.from(String(t || '')), b = Buffer.from(token(email));
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return res.status(400).send(pagina('Link inválido', 'Este link não é válido. Se quiser parar de receber, responda qualquer e-mail nosso.'));
    await redis('HSET', 'emails:sair', email, new Date().toISOString());
    return res.send(pagina('Pronto ✓', 'Você não vai mais receber as dicas por e-mail. Seu acesso ao Tino continua normal.'));
  }

  if (!process.env.CRON_SECRET || req.headers.authorization !== `Bearer ${process.env.CRON_SECRET}`) return res.status(401).json({ ok: false });
  const cods = (await redis('HGETALL', 'codigos')) || [];
  const usosArr = (await redis('HGETALL', 'usos')) || [], usos = {};
  for (let i = 0; i < usosArr.length; i += 2) { try { usos[usosArr[i]] = JSON.parse(usosArr[i + 1]); } catch (x) {} }
  const cont = { d1_entrar: 0, d1_lancar: 0, d3: 0, d7: 0, falhas: 0 };
  for (let i = 0; i < cods.length; i += 2) {
    const email = cods[i];
    if (!email.includes('@')) continue;
    let c; try { c = JSON.parse(cods[i + 1]); } catch (x) { continue; }
    if (c.origem !== 'cakto' || c.excluidoEm || !c.criado) continue;
    const dias = (Date.now() - new Date(c.criado).getTime()) / 864e5;
    if (dias < 1 || dias > 10) continue;   // só a sequência de quem comprou nos últimos 10 dias
    const u = usos[email], ativou = !!u, lancou = !!u && Object.values(u.info || {}).some((x) => x && x.lancou);
    const nome = primeiroNome(String(c.nota || '').split(' · ')[0]);
    try {
      if (dias >= 7) { if (ativou && await enviarEtapa(email, 'd7', 'd7', nome)) cont.d7++; }
      else if (dias >= 3) { if (ativou && await enviarEtapa(email, 'd3', 'd3', nome)) cont.d3++; }
      else if (!ativou) { if (await enviarEtapa(email, 'd1', 'd1_entrar', nome)) cont.d1_entrar++; }
      else if (!lancou) { if (await enviarEtapa(email, 'd1', 'd1_lancar', nome)) cont.d1_lancar++; }
    } catch (x) { cont.falhas++; }
  }
  res.json({ ok: true, ...cont });
};
