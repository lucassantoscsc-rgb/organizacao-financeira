// Cadastro de notificações de um aparelho.
// GET: devolve a chave pública. POST {acao:'salvar'|'remover', conta, aparelho, sub, diario, contas, vencimentos, ultimoDia}.
// Guardamos só: a inscrição do aparelho, as preferências, o último dia com lançamento e
// quantas contas vencem em cada data (sem nomes nem valores).
const crypto = require('crypto');
const webpush = require('web-push');
const { redis, normalizar } = require('./_db');

const chave = (endpoint) => crypto.createHash('sha256').update(String(endpoint)).digest('hex').slice(0, 24);

module.exports = async (req, res) => {
  if (req.method === 'GET') {
    if (!process.env.VAPID_PUBLIC) return res.status(503).json({ ok: false, erro: 'Notificações ainda não configuradas.' });
    return res.json({ ok: true, chave: process.env.VAPID_PUBLIC });
  }
  if (req.method !== 'POST') return res.status(405).json({ ok: false });
  const b = req.body || {};
  const conta = normalizar(b.conta), aparelho = String(b.aparelho || '').slice(0, 64);
  if (!b.sub || !b.sub.endpoint || !/^https:\/\//.test(b.sub.endpoint)) return res.status(400).json({ ok: false });
  try {
    // Só aparelhos liberados numa conta podem se inscrever.
    const u = JSON.parse((await redis('HGET', 'usos', conta)) || '{}');
    const aparelhos = u.aparelhos || (u.aparelho ? [u.aparelho] : []);
    const fixos = (process.env.ACCESS_CODES || '').split(',').map(normalizar).filter(Boolean);
    if (!fixos.includes(conta) && !aparelhos.includes(aparelho)) return res.status(403).json({ ok: false });

    const id = chave(b.sub.endpoint);
    if (b.acao === 'remover') { await redis('HDEL', 'push', id); return res.json({ ok: true }); }
    if (b.acao === 'teste') {
      webpush.setVapidDetails('https://planilhadeorganizacaofinanceira.online', process.env.VAPID_PUBLIC, process.env.VAPID_PRIVATE);
      try {
        await webpush.sendNotification({ endpoint: b.sub.endpoint, keys: b.sub.keys || {} },
          JSON.stringify({ title: '🔔 Notificações funcionando!', body: 'É assim que você vai receber os lembretes.', url: './' }), { TTL: 600 });
      } catch (e) { return res.status(502).json({ ok: false, erro: 'O serviço de notificações do celular recusou o envio (' + (e.statusCode || 'erro') + ').' }); }
    }
    const venc = {};
    Object.entries(b.vencimentos || {}).slice(0, 60).forEach(([d, n]) => { if (/^\d{4}-\d{2}-\d{2}$/.test(d)) venc[d] = Math.min(20, +n || 0); });
    await redis('HSET', 'push', id, JSON.stringify({
      sub: { endpoint: b.sub.endpoint, keys: b.sub.keys || {} },
      diario: !!b.diario, contas: !!b.contas, vencimentos: venc,
      ultimoDia: /^\d{4}-\d{2}-\d{2}$/.test(b.ultimoDia || '') ? b.ultimoDia : null,
      conta, atualizado: new Date().toISOString(),
    }));
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ ok: false, erro: 'Erro no servidor.' });
  }
};
