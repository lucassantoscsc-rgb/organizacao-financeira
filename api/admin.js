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
  const { acao, nota, codigo: c } = req.body || {};
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
      return res.json({ ok: true });
    }
    res.status(400).json({ ok: false, erro: 'Ação desconhecida' });
  } catch (e) {
    res.status(500).json({ ok: false, erro: e.message });
  }
};
