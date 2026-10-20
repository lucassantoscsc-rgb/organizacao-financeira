// Painel do vendedor: gerar, listar, liberar de novo e bloquear códigos.
// Protegido pela senha da variável ADMIN_SENHA (configurada na Vercel).
const crypto = require('crypto');
const { redis, normalizar } = require('./_db');

const LETRAS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // sem 0/O, 1/I para não confundir
function novoCodigo() {
  const b = crypto.randomBytes(8);
  let s = '';
  for (let i = 0; i < 8; i++) s += LETRAS[b[i] % LETRAS.length];
  return `BRIO-${s.slice(0, 4)}-${s.slice(4)}`;
}

function senhaOk(req) {
  const certa = Buffer.from(process.env.ADMIN_SENHA || '');
  const enviada = Buffer.from(String(req.headers['x-admin-senha'] || ''));
  return certa.length >= 6 && certa.length === enviada.length && crypto.timingSafeEqual(certa, enviada);
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ ok: false });
  if (!senhaOk(req)) return res.status(401).json({ ok: false, erro: 'Senha incorreta' });
  const { acao, nota, codigo: c, dia, valor } = req.body || {};
  const codigo = normalizar(c);

  try {
    if (acao === 'gerar') {
      let novo;
      do { novo = novoCodigo(); }
      while (!(await redis('HSETNX', 'codigos', novo,
        JSON.stringify({ nota: String(nota || '').slice(0, 120), criado: new Date().toISOString() }))));
      return res.json({ ok: true, codigo: novo });
    }
    if (acao === 'listar') {
      const [cods, usos] = await Promise.all([redis('HGETALL', 'codigos'), redis('HGETALL', 'usos')]);
      const mapaUsos = {};
      for (let i = 0; i < usos.length; i += 2) mapaUsos[usos[i]] = JSON.parse(usos[i + 1]);
      const lista = [];
      for (let i = 0; i < cods.length; i += 2) {
        const info = JSON.parse(cods[i + 1]);
        const u = mapaUsos[cods[i]];
        lista.push({ codigo: cods[i], nota: info.nota, criado: info.criado, usadoEm: u ? u.em : null,
          aparelhos: u ? (u.aparelhos || [u.aparelho]).length : 0 });
      }
      lista.sort((a, b) => b.criado.localeCompare(a.criado));
      return res.json({ ok: true, lista });
    }
    if (acao === 'depoimentos') {
      const d = (await redis('HGETALL', 'depoimentos')) || [];
      const lista = [];
      for (let i = 0; i < d.length; i += 2) lista.push({ conta: d[i], ...JSON.parse(d[i + 1]) });
      lista.sort((a, b) => b.em.localeCompare(a.em));
      return res.json({ ok: true, lista });
    }
    if (acao === 'anuncioSalvar') {
      // Gasto em anúncios de um dia (soma de todas as contas). Valor 0 apaga o dia.
      if (!/^\d{4}-\d{2}-\d{2}$/.test(String(dia || ''))) return res.status(400).json({ ok: false, erro: 'Data inválida' });
      const v = Math.round((+valor || 0) * 100) / 100;
      if (v < 0 || v > 1e7) return res.status(400).json({ ok: false, erro: 'Valor inválido' });
      if (v === 0) await redis('HDEL', 'met:anuncios', dia); else await redis('HSET', 'met:anuncios', dia, String(v));
      return res.json({ ok: true });
    }
    if (acao === 'metricas') {
      // Junta compradores (codigos) e uso (usos) sem expor e-mails: só datas e contagens por pessoa.
      const [cods, usos, deps, nLista, nPush, compras, reemb, charg, valorDia, anuncios] = await Promise.all([
        redis('HGETALL', 'codigos'), redis('HGETALL', 'usos'), redis('HGETALL', 'depoimentos'), redis('HLEN', 'lista'),
        redis('HLEN', 'push'), redis('HGETALL', 'met:compra'), redis('HGETALL', 'met:reembolso'), redis('HGETALL', 'met:chargeback'), redis('HGETALL', 'met:valor'), redis('HGETALL', 'met:anuncios')]);
      const par = (a) => { const o = {}; for (let i = 0; i < (a || []).length; i += 2) o[a[i]] = a[i + 1]; return o; };
      const U = par(usos), pessoas = [];
      for (const [conta, bruto] of Object.entries(par(cods))) {
        let c = {}, u = null; try { c = JSON.parse(bruto); } catch (e) {}
        try { u = U[conta] ? JSON.parse(U[conta]) : null; } catch (e) {}
        const info = Object.values((u && u.info) || {});
        pessoas.push({ criado: c.criado || null, cakto: c.origem === 'cakto', ativou: !!u, ativouEm: u ? u.em : null,
          visto: info.map((i) => i.visto || i.em).filter(Boolean).sort().pop() || (u ? u.em : null),
          lancou: info.some((i) => i.lancou), apar: info.length, inst: info.filter((i) => /instalado/i.test(i.nome || '')).length,
          ios: info.filter((i) => /iPhone|iPad/.test(i.nome || '')).length, android: info.filter((i) => /Android/.test(i.nome || '')).length });
      }
      let nuvem = 0, cursor = '0';
      do { const r = await redis('SCAN', cursor, 'MATCH', 'nuvem:*', 'COUNT', '1000'); cursor = String(r[0]); nuvem += r[1].length; } while (cursor !== '0');
      const notas = Object.values(par(deps)).map((d) => { try { return JSON.parse(d).nota; } catch (e) { return 0; } }).filter(Boolean);
      // Erros dos últimos 7 dias (somados) e respostas do NPS
      const hojeBR = Date.now() - 3 * 3600e3, contagem = {};
      for (let i = 0; i < 7; i++) {
        const d = new Date(hojeBR - i * 864e5).toISOString().slice(0, 10);
        const e = par(await redis('HGETALL', 'erros:' + d));
        for (const [id, n] of Object.entries(e)) contagem[id] = (contagem[id] || 0) + (+n || 0);
      }
      const infoErros = par(await redis('HGETALL', 'erros:info'));
      const erros = Object.entries(contagem).map(([id, total]) => { let i = {}; try { i = JSON.parse(infoErros[id] || '{}'); } catch (e) {} return { ...i, total }; })
        .sort((x, y) => y.total - x.total).slice(0, 20);
      const nps = Object.entries(par(await redis('HGETALL', 'nps'))).map(([conta, v]) => { try { return { conta, ...JSON.parse(v) }; } catch (e) { return null; } }).filter(Boolean)
        .sort((x, y) => (y.em || '').localeCompare(x.em || ''));
      return res.json({ ok: true, erros, nps, pessoas, eventos: { compra: par(compras), reembolso: par(reemb), chargeback: par(charg), valor: par(valorDia) }, anuncios: par(anuncios),
        totais: { lista: nLista, push: nPush, nuvem, depoimentos: notas.length, notaMedia: notas.length ? notas.reduce((a, b) => a + b, 0) / notas.length : null } });
    }
    if (acao === 'lista') {
      const d = (await redis('HGETALL', 'lista')) || [];
      const lista = [];
      for (let i = 0; i < d.length; i += 2) lista.push({ email: d[i], ...JSON.parse(d[i + 1]) });
      lista.sort((a, b) => b.em.localeCompare(a.em));
      return res.json({ ok: true, lista });
    }
    if (acao === 'apagarDepoimento') {
      await redis('HDEL', 'depoimentos', codigo);
      return res.json({ ok: true });
    }
    if (acao === 'resetar') {
      await redis('HDEL', 'usos', codigo);
      return res.json({ ok: true });
    }
    if (acao === 'bloquear') {
      await redis('HDEL', 'codigos', codigo);
      await redis('HDEL', 'usos', codigo);
      await redis('DEL', 'nuvem:' + codigo);
      return res.json({ ok: true });
    }
    res.status(400).json({ ok: false, erro: 'Ação desconhecida' });
  } catch (e) {
    res.status(500).json({ ok: false, erro: e.message });
  }
};
