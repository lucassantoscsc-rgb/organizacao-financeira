// Tino Plus: login com código de 6 dígitos enviado por e-mail (Resend).
//   pedir  { email }                      → envia o código (vale 10 minutos, 5 tentativas)
//   entrar { email, codigo, aparelho }    → devolve um token de sessão (90 dias)
//   eu     (Authorization: Bearer token)  → dados da conta
//   sair   (Authorization: Bearer token)  → encerra a sessão deste aparelho
// No endereço de teste o código também volta na resposta, para testar sem depender do e-mail.
const crypto = require('crypto');
const { redis } = require('./_db');
const { banco, sessao, hash, plusAtivo } = require('./_pg');

const TESTE = process.env.VERCEL_ENV !== 'production';
const REMETENTE = 'Tino Finanças <nao-responda@tinofinancas.com.br>';
const emailOk = (e) => /^[^\s@]{1,64}@[^\s@]{1,190}\.[a-z]{2,}$/i.test(e);

// Limite de pedidos: 'n' por 'seg' segundos para a mesma chave.
async function limite(chave, n, seg) {
  const k = 'plus:lim:' + chave, v = await redis('INCR', k);
  if (v === 1) await redis('EXPIRE', k, seg);
  return v <= n;
}

async function enviarCodigo(email, codigo) {
  if (!process.env.RESEND_API_KEY) throw new Error('E-mail não configurado');
  const html = `<div style="font-family:Arial,sans-serif;max-width:420px;margin:0 auto;color:#0f1e1a">
    <p style="font-size:16px">Seu código para entrar no <b>Tino Plus</b>:</p>
    <p style="font-size:34px;font-weight:700;letter-spacing:8px;margin:18px 0;color:#0d9668">${codigo}</p>
    <p style="font-size:14px;color:#5a6e67">Ele vale por 10 minutos. Se não foi você que pediu, é só ignorar este e-mail.</p>
    <p style="font-size:13px;color:#7c8f8a;margin-top:28px">Tino Finanças · tenha tino para o seu dinheiro</p></div>`;
  const r = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: REMETENTE, to: [email], subject: `${codigo} é o seu código do Tino`, html,
      text: `Seu código para entrar no Tino Plus: ${codigo}\nEle vale por 10 minutos. Se não foi você que pediu, ignore este e-mail.` }),
  });
  if (!r.ok) throw new Error('Falha ao enviar o e-mail (' + r.status + ')');
}

const contaPublica = (c) => ({ email: c.email, plano: c.plano, plusAte: c.plus_ate, fundador: c.fundador, whatsapp: !!c.whatsapp, convidado: !!c.convidado,
  plusAtivo: plusAtivo(c), teste: process.env.VERCEL_ENV !== 'production',
  assinatura: c.assinatura ? { status: c.assinatura.status, evento: c.assinatura.evento, proxima: c.assinatura.proxima, valor: c.assinatura.valor } : null });

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ ok: false });
  const { acao } = req.body || {};
  const email = String((req.body || {}).email || '').trim().toLowerCase();
  const ip = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim() || 'sem-ip';
  try {
    const sql = await banco();

    if (acao === 'pedir') {
      if (!emailOk(email)) return res.status(400).json({ ok: false, erro: 'Confira o e-mail digitado.' });
      if (!(await limite('ip:' + ip, 15, 3600)) || !(await limite('email:' + email, 4, 900)))
        return res.status(429).json({ ok: false, erro: 'Muitos pedidos. Espere alguns minutos e tente de novo.' });
      const codigo = String(crypto.randomInt(0, 1e6)).padStart(6, '0');
      await sql`INSERT INTO codigos_login (email, hash, expira, tentativas) VALUES (${email}, ${hash(email + ':' + codigo)}, now() + interval '10 minutes', 0)
        ON CONFLICT (email) DO UPDATE SET hash = EXCLUDED.hash, expira = EXCLUDED.expira, tentativas = 0`;
      let enviado = true;
      try { await enviarCodigo(email, codigo); } catch (e) { if (!TESTE) throw e; enviado = false; }
      return res.json({ ok: true, ...(TESTE ? { codigoTeste: codigo, enviado } : {}) });
    }

    if (acao === 'entrar') {
      const codigo = String((req.body || {}).codigo || '').replace(/\D/g, '');
      const aparelho = String((req.body || {}).aparelho || '').slice(0, 64);
      if (!emailOk(email) || codigo.length !== 6) return res.status(400).json({ ok: false, erro: 'Digite o código de 6 números.' });
      const [c] = await sql`UPDATE codigos_login SET tentativas = tentativas + 1 WHERE email = ${email} RETURNING hash, expira, tentativas`;
      if (!c || new Date(c.expira) < new Date()) return res.json({ ok: false, erro: 'O código expirou. Peça um novo.' });
      if (c.tentativas > 5) return res.json({ ok: false, erro: 'Muitas tentativas. Peça um novo código.' });
      const a = Buffer.from(c.hash), b = Buffer.from(hash(email + ':' + codigo));
      if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return res.json({ ok: false, erro: 'Código incorreto. Confira e tente de novo.' });
      await sql`DELETE FROM codigos_login WHERE email = ${email}`;
      // Quem já comprou o vitalício entra como fundador (preço especial no Plus).
      const fundador = !!(await redis('HGET', 'codigos', email));
      const [conta] = await sql`INSERT INTO contas (email, fundador) VALUES (${email}, ${fundador})
        ON CONFLICT (email) DO UPDATE SET fundador = contas.fundador OR EXCLUDED.fundador RETURNING *`;
      const token = crypto.randomBytes(32).toString('base64url');
      await sql`INSERT INTO sessoes (token_hash, email, aparelho, expira) VALUES (${hash(token)}, ${email}, ${aparelho}, now() + interval '90 days')`;
      return res.json({ ok: true, token, conta: contaPublica(conta) });
    }

    if (acao === 'convite') {
      const conta = String((req.body || {}).conta || '').trim().toLowerCase(), ap = String((req.body || {}).aparelho || '').slice(0, 64);
      if (!emailOk(conta) || !ap) return res.status(400).json({ ok: false });
      const u = JSON.parse((await redis('HGET', 'usos', conta)) || '{}');
      if (!(u.aparelhos || []).includes(ap)) return res.status(403).json({ ok: false });
      const [c] = await sql`SELECT * FROM contas WHERE email = ${conta}`;
      return res.json({ ok: true, convidado: !!(c && c.convidado && plusAtivo(c)), ate: c ? c.plus_ate : null });
    }

    const s = await sessao(req, sql);
    if (!s) return res.status(401).json({ ok: false, erro: 'Sessão expirada. Entre de novo.' });
    if (acao === 'eu') {
      const [conta] = await sql`SELECT * FROM contas WHERE email = ${s.email}`;
      return res.json({ ok: true, conta: contaPublica(conta) });
    }
    if (acao === 'waCodigo') {
      // Código para ligar o WhatsApp: o cliente manda "TINO-XXXX" para o número do Tino (vale 15 minutos)
      const L = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
      let codigo;
      do { codigo = 'TINO-' + Array.from({ length: 4 }, () => L[crypto.randomInt(0, L.length)]).join(''); }
      while ((await sql`SELECT 1 FROM wa_codigos WHERE codigo = ${codigo}`).length);
      await sql`DELETE FROM wa_codigos WHERE email = ${s.email}`;
      await sql`INSERT INTO wa_codigos (codigo, email, expira) VALUES (${codigo}, ${s.email}, now() + interval '15 minutes')`;
      return res.json({ ok: true, codigo, numero: process.env.WHATSAPP_NUMERO || '15556663019' });
    }
    if (acao === 'waDesligar') {
      await sql`UPDATE contas SET whatsapp = NULL WHERE email = ${s.email}`;
      return res.json({ ok: true });
    }
    if (acao === 'sair') {
      await sql`DELETE FROM sessoes WHERE token_hash = ${s.token_hash}`;
      return res.json({ ok: true });
    }
    res.status(400).json({ ok: false });
  } catch (e) {
    console.error('plus', acao, e.message);
    res.status(500).json({ ok: false, erro: 'Não foi possível concluir agora. Tente de novo em instantes.' });
  }
};
