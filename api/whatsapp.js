// Tino no WhatsApp (Tino Plus). Webhook da WhatsApp Business Platform (Cloud API da Meta).
//   GET  → verificação do webhook (hub.verify_token = WHATSAPP_VERIFY_TOKEN)
//   POST → mensagens recebidas (assinadas pela Meta com WHATSAPP_APP_SECRET)
// Fluxo:
//   "TINO-XXXX"           → liga este número à conta do Plus que gerou o código no app
//   "gastei 45 no mercado" → a IA (Claude Haiku) entende o lançamento, ele vai para a conta no servidor
//                            (tabela itens) e aparece no app pela sincronização; o Tino confirma a mensagem.
const crypto = require('crypto');
const AnthropicSdk = require('@anthropic-ai/sdk');
const Anthropic = AnthropicSdk.default || AnthropicSdk;
const { redis } = require('./_db');
const { banco, plusAtivo } = require('./_pg');

const TESTE = process.env.VERCEL_ENV !== 'production';
const PHONE_ID = process.env.WHATSAPP_PHONE_ID || '1457233977454720';   // número de teste da Meta, até termos o oficial
const MODELO = 'claude-haiku-5-5';        // entende a mensagem e anota (rápido e barato)
const MODELO_PERGUNTAS = 'claude-opus-5-5'; // responde perguntas abertas sobre o dinheiro da pessoa
const CATEGORIAS = ['🧾 Parcela','🧾 Contas','🧺 Mercado','🍗 Alimentação','⛽ Gasolina','🚗 Transporte','🏠 Casa','💊 Saúde',
  '📦 Compras Online','👕 Vestuário','🎉 Lazer','📚 Educação','📱 Assinaturas','💄 Beleza','🐾 Pets','🎁 Presentes','❓ Outros'];
const ESSENCIAIS = ['🧾 Parcela','🧾 Contas','🧺 Mercado','⛽ Gasolina','🚗 Transporte','🏠 Casa','💊 Saúde','📚 Educação'];
const FORMAS = ['Pix / Dinheiro', 'Débito', 'Crédito'];

const brl = (v) => 'R$ ' + Number(v).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const hojeBR = () => new Date(Date.now() - 3 * 3600e3).toISOString().slice(0, 10);
const uid = () => Date.now().toString(36) + crypto.randomBytes(4).toString('hex');

async function corpoBruto(req) {
  const partes = [];
  for await (const p of req) partes.push(typeof p === 'string' ? Buffer.from(p) : p);
  return Buffer.concat(partes);
}
function assinaturaOk(req, bruto) {
  const segredo = process.env.WHATSAPP_APP_SECRET, veio = String(req.headers['x-hub-signature-256'] || '');
  if (!segredo || !veio.startsWith('sha256=')) return false;
  const a = Buffer.from(veio.slice(7)), b = Buffer.from(crypto.createHmac('sha256', segredo).update(bruto).digest('hex'));
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

// O token às vezes é salvo com espaço, quebra de linha ou "Bearer " na frente: limpa antes de usar.
const tokenWa = () => String(process.env.WHATSAPP_TOKEN || '').trim().replace(/^Bearer\s+/i, '').replace(/\s+/g, '');
// O WhatsApp entrega celulares brasileiros sem o nono dígito (55 85 8888-0326). Para responder (e para a lista de
// números permitidos do número de teste), usa o formato completo: 55 + DDD + 9 + 8 dígitos.
const comNono = (n) => /^55\d{2}[6-9]\d{7}$/.test(n) ? n.slice(0, 4) + '9' + n.slice(4) : n;
async function responder(para, texto) {
  para = comNono(String(para));
  const tk = tokenWa();
  const r = await fetch(`https://graph.facebook.com/v25.0/${PHONE_ID}/messages`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${tk}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ messaging_product: 'whatsapp', to: para, type: 'text', text: { body: texto } }),
  });
  if (!r.ok){
    const bruto = String(process.env.WHATSAPP_TOKEN || '');
    console.error('whatsapp envio', r.status, (await r.text()).slice(0, 300), JSON.stringify({ temToken: !!bruto, tamOriginal: bruto.length,
      tamLimpo: tk.length, comecaEAA: tk.startsWith('EAA'), tinhaEspaco: /\s/.test(bruto), tinhaBearer: /bearer/i.test(bruto), phoneId: PHONE_ID }));
  }
}

// A IA lê a mensagem e devolve o lançamento em JSON (formato garantido pelo json_schema).
async function interpretar(texto, categorias, cartoes) {
  const client = new Anthropic();
  const hoje = hojeBR();
  const r = await client.messages.create({
    model: MODELO,
    max_tokens: 2000,
    system: `Você lê mensagens de WhatsApp de um app de finanças pessoais brasileiro e extrai UM lançamento.
Hoje é ${hoje}. "ontem", "sexta" etc. são relativos a hoje. Sem data na mensagem, use hoje.
tipo: "gasto" (comprou, pagou, gastei), "entrada" (recebi, caiu salário, me pagaram), "pergunta" (quer saber algo sobre o próprio dinheiro: quanto pode gastar, quanto gastou, se dá pra comprar algo, como está o mês) ou "outro" (saudação, agradecimento, assunto que não é dinheiro).
valor: número em reais (ex.: "45", "45,90", "R$ 1.200" → 1200). Se não houver valor, tipo "outro".
descricao: curta, com o lugar ou o que foi (ex.: "Mercado", "iFood", "Uber"), sem o valor.
categoria (só para gasto): a que melhor combina, escolhida da lista. Na dúvida, "❓ Outros".
forma: "Crédito" se falar cartão de crédito/no crédito/parcelado; "Débito" se falar débito; senão "Pix / Dinheiro".
parcelas: número de vezes se for parcelado ("em 3x" → 3); senão 1.
cartao: o nome do cartão citado, se for um destes: ${cartoes.length ? cartoes.join(', ') : '(nenhum cadastrado)'}; senão "".`,
    messages: [{ role: 'user', content: texto }],
    output_config: {
      effort: 'low',
      format: {
        type: 'json_schema',
        schema: {
          type: 'object',
          properties: {
            tipo: { type: 'string', enum: ['gasto', 'entrada', 'pergunta', 'outro'] },
            valor: { type: 'number' },
            descricao: { type: 'string' },
            categoria: { type: 'string', enum: categorias },
            forma: { type: 'string', enum: FORMAS },
            parcelas: { type: 'integer' },
            data: { type: 'string', format: 'date' },
            cartao: { type: 'string' },
          },
          required: ['tipo', 'valor', 'descricao', 'categoria', 'forma', 'parcelas', 'data', 'cartao'],
          additionalProperties: false,
        },
      },
    },
  });
  if (r.stop_reason === 'refusal' || r.stop_reason === 'max_tokens') return null;
  const bloco = r.content.find((b) => b.type === 'text');
  try { return bloco ? JSON.parse(bloco.text) : null; } catch (e) { return null; }
}

// Lê do servidor o que a IA precisa saber da conta: categorias criadas, cartões e último cartão usado.
async function contexto(sql, email) {
  const linhas = await sql`SELECT chave, valor FROM itens WHERE email = ${email} AND NOT apagado
    AND (chave = 'v|catsExtras' OR chave = 'v|ultimoCartao' OR chave LIKE 'i|cartoes|%')`;
  let extras = [], cartoes = [], ultimo = null;
  for (const l of linhas) {
    if (l.chave === 'v|catsExtras' && Array.isArray(l.valor)) extras = l.valor.filter((x) => x && x.c);
    else if (l.chave === 'v|ultimoCartao') ultimo = l.valor;
    else if (l.valor && l.valor.id) cartoes.push(l.valor);
  }
  return { extras, cartoes, ultimo };
}

async function lancar(sql, conta, texto) {
  const { extras, cartoes, ultimo } = await contexto(sql, conta.email);
  const categorias = CATEGORIAS.concat(extras.map((x) => x.c));
  const it = await interpretar(texto, categorias, cartoes.map((c) => c.nome));
  if (it && it.tipo === 'pergunta') return responderPergunta(sql, conta, texto);
  if (!it || it.tipo === 'outro' || !(it.valor > 0)) {
    return 'Não entendi 🤔 Você pode me mandar um gasto ou uma pergunta:\n• "gastei 45 no mercado no pix"\n• "uber 23 ontem"\n• "tênis 600 em 3x no crédito"\n• "recebi 1500 de salário"\n• "quanto posso gastar hoje?"\n• "quanto gastei com mercado esse mês?"';
  }
  const data = /^\d{4}-\d{2}-\d{2}$/.test(it.data) && it.data <= hojeBR() ? it.data : hojeBR();
  const mk = data.slice(0, 7), id = uid(), valor = Math.round(it.valor * 100) / 100;
  let chave, item, resumo;
  if (it.tipo === 'entrada') {
    item = { id, nome: it.descricao || 'Entrada', valor, data, origem: 'whatsapp' };
    chave = `i|m/${mk}/entradas|${id}`;
    resumo = `✅ Entrada anotada: ${item.nome} · ${brl(valor)}`;
  } else {
    const cat = categorias.includes(it.categoria) ? it.categoria : '❓ Outros';
    const credito = it.forma === 'Crédito', parcelas = credito ? Math.min(24, Math.max(1, it.parcelas || 1)) : 1;
    const cartao = credito ? ((cartoes.find((c) => it.cartao && c.nome.toLowerCase() === it.cartao.toLowerCase()) || cartoes.find((c) => c.id === ultimo) || cartoes[0] || {}).id) : undefined;
    const essencial = ESSENCIAIS.includes(cat) || !!extras.find((x) => x.c === cat && x.ess);
    item = { id, cat, desc: it.descricao || '', valor, forma: it.forma, data, essencial, parcelas, ...(cartao ? { cartao } : {}), origem: 'whatsapp' };
    chave = `i|m/${mk}/gastos|${id}`;
    const nomeCartao = cartao ? ' · ' + (cartoes.find((c) => c.id === cartao) || {}).nome : '';
    resumo = `✅ Anotado: ${cat} · ${brl(valor)}${parcelas > 1 ? ` em ${parcelas}x` : ''} · ${it.forma}${nomeCartao}${it.descricao ? `\n📝 ${it.descricao}` : ''}`;
  }
  await sql`INSERT INTO itens (email, chave, valor, apagado, seq, aparelho, alterado)
    VALUES (${conta.email}, ${chave}, ${JSON.stringify(item)}::jsonb, false, nextval('itens_seq'), 'whatsapp', now())`;
  const quando = data === hojeBR() ? 'hoje' : data.split('-').reverse().slice(0, 2).join('/');
  return `${resumo}\n📅 ${quando}\n\nJá vai aparecer no app. Errou? É só corrigir por lá.`;
}

// Perguntas: o Claude Opus responde com o resumo do mês que o app envia na sincronização (os mesmos números da tela
// inicial) e os lançamentos do mês. Ele só usa esses dados; se o resumo for antigo, avisa de quando ele é.
async function responderPergunta(sql, conta, texto) {
  const mk = hojeBR().slice(0, 7);
  const [res] = await sql`SELECT valor, alterado FROM itens WHERE email = ${conta.email} AND chave = 'v|resumoPlus' AND NOT apagado`;
  if (!res || !res.valor) return 'Ainda não tenho o resumo do seu mês 🙂 Abra o Tino no celular (com a sincronização ligada) e me pergunte de novo.';
  const lanc = await sql`SELECT chave, valor FROM itens WHERE email = ${conta.email} AND NOT apagado
    AND (chave LIKE ${'i|m/' + mk + '/gastos|%'} OR chave LIKE ${'i|m/' + mk + '/entradas|%'}) ORDER BY alterado DESC LIMIT 200`;
  const gastos = lanc.filter((l) => l.chave.includes('/gastos|')).map((l) => ({ data: l.valor.data, desc: l.valor.desc, categoria: l.valor.cat, valor: l.valor.valor, forma: l.valor.forma, parcelas: l.valor.parcelas }));
  const entradas = lanc.filter((l) => l.chave.includes('/entradas|')).map((l) => ({ data: l.valor.data, nome: l.valor.nome, valor: l.valor.valor }));
  const resumo = res.valor, idadeH = (Date.now() - new Date(resumo.em || res.alterado).getTime()) / 36e5;
  const client = new Anthropic();
  const r = await client.beta.messages.create({
    model: MODELO_PERGUNTAS,
    max_tokens: 4000,
    betas: ['server-side-fallback-2026-07-01'],
    fallbacks: 'default',
    output_config: { effort: 'low' },
    system: `Você é o Tino, assistente do app de finanças pessoais Tino Finanças, respondendo pelo WhatsApp em português do Brasil.
Responda a pergunta usando SOMENTE os dados abaixo. Seja curto (no máximo 5 linhas), direto e gentil, com valores em reais (R$ 1.234,56).
Pode usar 1 ou 2 emojis. Sem markdown com # ou tabelas; *negrito* do WhatsApp é permitido.
"podeGastarHoje" é o valor que a pessoa pode gastar hoje (o principal número do app). "sobramParaOMes" é o que sobra para os dias restantes.
Se a resposta não estiver nos dados, diga que não tem essa informação e sugira ver no app. Não invente números.
Não dê recomendação de investimento (ações, cripto, fundos); para isso, diga que não é a sua função.
${idadeH > 6 ? `Os dados são de quando o app sincronizou pela última vez (${new Date(resumo.em).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', dateStyle: 'short', timeStyle: 'short' })}); avise isso numa frase curta.` : ''}
Hoje é ${hojeBR()}.

Resumo do mês (calculado pelo app):
${JSON.stringify(resumo)}

Lançamentos deste mês (mais recentes primeiro):
${JSON.stringify({ gastos, entradas })}`,
    messages: [{ role: 'user', content: texto }],
  });
  if (r.stop_reason === 'refusal') return 'Não consigo responder isso por aqui 🙏 Veja os detalhes no app.';
  const t = r.content.filter((b) => b.type === 'text').map((b) => b.text).join('\n').trim();
  return t || 'Não consegui responder agora. Tente de novo em instantes 🙏';
}

async function tratar(sql, msg) {
  const de = String(msg.from || ''), texto = msg.type === 'text' ? String(msg.text && msg.text.body || '').trim() : '';
  // mensagem repetida (a Meta reenvia se demorarmos): trata uma vez só
  if (!(await redis('SET', 'wa:msg:' + msg.id, '1', 'NX', 'EX', 86400))) return;

  const cod = texto.toUpperCase().match(/\bTINO-([A-Z0-9]{4})\b/);
  if (cod) {
    const [c] = await sql`DELETE FROM wa_codigos WHERE codigo = ${'TINO-' + cod[1]} AND expira > now() RETURNING email`;
    if (!c) return responder(de, 'Esse código expirou ou não existe. Gere outro no app: Ajustes → Tino Plus → Conectar WhatsApp.');
    await sql`UPDATE contas SET whatsapp = NULL WHERE whatsapp = ${de}`;
    await sql`UPDATE contas SET whatsapp = ${de} WHERE email = ${c.email}`;
    return responder(de, `Pronto! Seu WhatsApp está conectado ao Tino ✅\n\nAgora é só me mandar seus gastos, do seu jeito:\n• "gastei 45 no mercado no pix"\n• "uber 23 ontem"\n• "tênis 600 em 3x no crédito"\n• "recebi 1500 de salário"`);
  }

  const [conta] = await sql`SELECT * FROM contas WHERE whatsapp = ${de}`;
  if (!conta) return responder(de, 'Oi! Eu sou o Tino 💚 Para anotar seus gastos por aqui, conecte este WhatsApp no app: Ajustes → Tino Plus → Conectar WhatsApp.');
  if (!TESTE && !plusAtivo(conta)) return responder(de, 'O Tino no WhatsApp é um recurso do Tino Plus. Veja em Ajustes → Tino Plus no app.');
  if (!texto) return responder(de, 'Por enquanto eu entendo só mensagens de texto 🙂 Ex.: "gastei 45 no mercado no pix".');
  if (!(await limite(de))) return responder(de, 'Muitas mensagens em pouco tempo. Espere um pouquinho e tente de novo 🙏');
  return responder(de, await lancar(sql, conta, texto.slice(0, 500)));
}
async function limite(de) {
  const k = 'wa:lim:' + de, n = await redis('INCR', k);
  if (n === 1) await redis('EXPIRE', k, 3600);
  return n <= 60;
}

module.exports = async (req, res) => {
  if (req.method === 'GET') {
    const q = req.query || {};
    if (q['hub.mode'] === 'subscribe' && process.env.WHATSAPP_VERIFY_TOKEN && q['hub.verify_token'] === process.env.WHATSAPP_VERIFY_TOKEN)
      return res.status(200).send(String(q['hub.challenge'] || ''));
    return res.status(403).send('forbidden');
  }
  if (req.method !== 'POST') return res.status(405).end();
  const bruto = await corpoBruto(req);
  if (!assinaturaOk(req, bruto)) {
    // diagnóstico sem expor segredos: só se existem e os tamanhos
    const seg = process.env.WHATSAPP_APP_SECRET || '';
    console.error('whatsapp assinatura recusada', JSON.stringify({ temSegredo: !!seg, tamSegredo: seg.length, tamCorpo: bruto.length,
      temCabecalho: !!req.headers['x-hub-signature-256'], bodyJaLido: typeof req.body }));
    return res.status(401).end();
  }
  let corpo; try { corpo = JSON.parse(bruto.toString('utf8')); } catch (e) { return res.status(400).end(); }
  try {
    const sql = await banco();
    for (const e of corpo.entry || []) for (const ch of e.changes || []) for (const m of (ch.value && ch.value.messages) || []) await tratar(sql, m);
  } catch (e) {
    console.error('whatsapp', e.message);
  }
  res.status(200).end();   // sempre 200: a Meta reenvia se não receber
};
