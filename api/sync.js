// Sincronização do Tino Plus. O app manda o que mudou desde a última vez e recebe o que outros
// aparelhos (ou o WhatsApp) mudaram. Cada item é uma linha em 'itens'; vale a alteração mais recente.
//   estado                          → quantos itens a conta tem no servidor
//   sync { cursor, mudancas, aparelho }
//     mudancas: [{ k: chave, v: valor }]  ou  [{ k, d: true }] para apagar
//     resposta: { cursor, itens: [{ k, v } | { k, d: true }], mais }  (mais = ainda há itens para buscar)
// No endereço oficial só funciona com o Plus ativo; no de teste, para qualquer conta.
const { banco, sessao, plusAtivo } = require('./_pg');

const TESTE = process.env.VERCEL_ENV !== 'production';
const MAX_MUDANCAS = 500, MAX_ITENS = 2000, MAX_VALOR = 60000;

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ ok: false });
  try {
    const sql = await banco();
    const s = await sessao(req, sql);
    if (!s) return res.status(401).json({ ok: false, erro: 'Sessão expirada. Entre de novo.' });
    const [conta] = await sql`SELECT * FROM contas WHERE email = ${s.email}`;
    if (!TESTE && !plusAtivo(conta)) return res.status(403).json({ ok: false, erro: 'A sincronização é do Tino Plus.' });
    const { acao, mudancas, aparelho: a } = req.body || {};

    if (acao === 'estado') {
      const [r] = await sql`SELECT count(*) FILTER (WHERE NOT apagado) AS n FROM itens WHERE email = ${s.email}`;
      return res.json({ ok: true, itens: +r.n });
    }

    if (acao === 'sync') {
      const cursor = Math.max(0, parseInt((req.body || {}).cursor, 10) || 0);
      const lista = Array.isArray(mudancas) ? mudancas : [];
      if (lista.length > MAX_MUDANCAS) return res.status(400).json({ ok: false, erro: 'Lote grande demais' });
      const limpas = [];
      for (const m of lista) {
        const k = String(m && m.k || '');
        if (!k || k.length > 200) return res.status(400).json({ ok: false, erro: 'Chave inválida' });
        if (m.d) { limpas.push({ k, v: null, d: true }); continue; }
        if (JSON.stringify(m.v ?? null).length > MAX_VALOR) return res.status(400).json({ ok: false, erro: 'Item grande demais: ' + k });
        limpas.push({ k, v: m.v ?? null, d: false });
      }
      const aparelho = String(a || '').slice(0, 64);
      let meus = new Set();
      if (limpas.length) {
        const gravados = await sql`
          INSERT INTO itens (email, chave, valor, apagado, seq, aparelho, alterado)
          SELECT ${s.email}, x.k, CASE WHEN x.d THEN NULL ELSE x.v END, x.d, nextval('itens_seq'), ${aparelho}, now()
          FROM jsonb_to_recordset(${JSON.stringify(limpas)}::jsonb) AS x(k text, v jsonb, d boolean)
          ON CONFLICT (email, chave) DO UPDATE SET valor = EXCLUDED.valor, apagado = EXCLUDED.apagado,
            seq = EXCLUDED.seq, aparelho = EXCLUDED.aparelho, alterado = now()
          RETURNING seq`;
        meus = new Set(gravados.map((g) => String(g.seq)));
      }
      // O que mudou depois do cursor deste aparelho (menos o que ele mesmo acabou de enviar)
      const linhas = await sql`SELECT chave, valor, apagado, seq FROM itens
        WHERE email = ${s.email} AND seq > ${cursor} ORDER BY seq LIMIT ${MAX_ITENS + 1}`;
      const mais = linhas.length > MAX_ITENS;
      const pagina = linhas.slice(0, MAX_ITENS);
      const novoCursor = pagina.length ? Number(pagina[pagina.length - 1].seq) : cursor;
      const itens = pagina.filter((l) => !meus.has(String(l.seq))).map((l) => (l.apagado ? { k: l.chave, d: true } : { k: l.chave, v: l.valor }));
      return res.json({ ok: true, cursor: novoCursor, itens, mais });
    }
    res.status(400).json({ ok: false });
  } catch (e) {
    console.error('sync', e.message);
    res.status(500).json({ ok: false, erro: 'Não foi possível sincronizar agora.' });
  }
};
