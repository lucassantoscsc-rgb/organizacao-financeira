// Tarefa diária (Vercel Cron, ~20h de Brasília): envia os lembretes.
// - "Anotou seus gastos de hoje?" para quem ativou e ainda não lançou nada hoje;
// - "X contas vencem amanhã" para quem ativou o aviso de contas.
const webpush = require('web-push');
const { redis } = require('./_db');

module.exports = async (req, res) => {
  if (!process.env.CRON_SECRET || req.headers.authorization !== `Bearer ${process.env.CRON_SECRET}`)
    return res.status(401).json({ ok: false });
  if (!process.env.VAPID_PUBLIC || !process.env.VAPID_PRIVATE) return res.status(503).json({ ok: false, erro: 'VAPID não configurado' });
  webpush.setVapidDetails('https://planilhadeorganizacaofinanceira.online', process.env.VAPID_PUBLIC, process.env.VAPID_PRIVATE);

  const brasilia = (dias) => new Date(Date.now() - 3 * 3600e3 + dias * 864e5).toISOString().slice(0, 10);
  const hoje = brasilia(0), amanha = brasilia(1);
  const todos = (await redis('HGETALL', 'push')) || [];
  let enviados = 0, removidos = 0, jaAnotou = 0, falhas = 0;
  for (let i = 0; i < todos.length; i += 2) {
    const id = todos[i];
    let r; try { r = JSON.parse(todos[i + 1]); } catch (e) { continue; }
    const partes = [];
    const nContas = r.contas ? (r.vencimentos || {})[amanha] || 0 : 0;
    if (nContas) partes.push(nContas === 1 ? '⏰ 1 conta vence amanhã.' : `⏰ ${nContas} contas vencem amanhã.`);
    if (r.diario && r.ultimoDia !== hoje) partes.push('✍️ Anotou seus gastos de hoje? Leva 10 segundos.');
    if (!partes.length){ if (r.diario && r.ultimoDia === hoje) jaAnotou++; continue; }
    const msg = { title: nContas ? 'Contas vencendo' : 'Organização Financeira', body: partes.join(' '), url: nContas ? './?aba=contas' : './?novo=1' };
    try { await webpush.sendNotification(r.sub, JSON.stringify(msg), { TTL: 6 * 3600 }); enviados++; }
    catch (e) {
      if (e.statusCode === 404 || e.statusCode === 410) { await redis('HDEL', 'push', id); removidos++; }   // inscrição expirada
      else falhas++;
    }
  }
  res.json({ ok: true, inscritos: todos.length / 2, enviados, jaAnotouHoje: jaAnotou, removidos, falhas });
};
