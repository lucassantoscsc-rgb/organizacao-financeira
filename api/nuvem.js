// Backup na nuvem. O app criptografa os dados no aparelho (AES-GCM, chave tirada da senha
// que só o cliente sabe), então o servidor guarda um pacote que não consegue ler.
// Só responde para quem tem acesso ativo neste aparelho. Um backup por conta: 'nuvem:<conta>'.
const { redis, normalizar } = require('./_db');

const MAX = 950000;   // caracteres do pacote em base64 (o Upstash aceita ~1 MB por comando)
const b64 = (s) => typeof s === 'string' && /^[A-Za-z0-9+/=]+$/.test(s);

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ ok: false });
  const { conta: c, aparelho: a, acao, nome, pacote } = req.body || {};
  const conta = normalizar(c);
  const aparelho = String(a || '').slice(0, 64);
  if (!conta || !aparelho) return res.status(400).json({ ok: false });
  const chave = 'nuvem:' + conta;

  try {
    if (!(await redis('HEXISTS', 'codigos', conta))) return res.status(403).json({ ok: false, motivo: 'sem-acesso' });
    const u = JSON.parse((await redis('HGET', 'usos', conta)) || '{}');
    if (!(u.aparelhos || []).includes(aparelho)) return res.status(403).json({ ok: false, motivo: 'removido' });

    if (acao === 'salvar') {
      const p = pacote || {};
      if (p.v !== 1 || !b64(p.salt) || !b64(p.iv) || !b64(p.dados)) return res.status(400).json({ ok: false });
      if (p.dados.length > MAX) return res.status(413).json({ ok: false, erro: 'grande' });
      const em = new Date().toISOString();
      await redis('SET', chave, JSON.stringify({ v: 1, z: !!p.z, salt: p.salt, iv: p.iv, dados: p.dados,
        em, aparelho: String(nome || '').slice(0, 60) }));
      return res.json({ ok: true, em });
    }
    if (acao === 'info' || acao === 'baixar') {
      const bruto = await redis('GET', chave);
      if (!bruto) return res.json({ ok: true, existe: false });
      const p = JSON.parse(bruto);
      const info = { ok: true, existe: true, em: p.em, aparelho: p.aparelho, tamanho: p.dados.length };
      return res.json(acao === 'baixar' ? { ...info, pacote: { v: p.v, z: p.z, salt: p.salt, iv: p.iv, dados: p.dados } } : info);
    }
    if (acao === 'apagar') {
      await redis('DEL', chave);
      return res.json({ ok: true });
    }
    res.status(400).json({ ok: false });
  } catch (e) {
    res.status(500).json({ ok: false });
  }
};
