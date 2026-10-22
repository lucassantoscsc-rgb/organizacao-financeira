// Tino no WhatsApp (Tino Plus). Webhook da WhatsApp Business Platform (Cloud API da Meta).
//   GET  → verificação do webhook (hub.verify_token = WHATSAPP_VERIFY_TOKEN)
//   POST → mensagens recebidas (assinadas pela Meta com WHATSAPP_APP_SECRET)
// Fluxo:
//   "TINO-XXXX"           → liga este número à conta do Plus que gerou o código no app
//   "gastei 45 no mercado" → a IA (Claude Haiku) entende o lançamento, ele vai para a conta no servidor
//                            (tabela itens) e aparece no app pela sincronização; o Tino confirma a mensagem.
//   foto ou PDF do comprovante → a mesma IA lê o comprovante e anota (a legenda, se houver, ajuda: "no crédito em 3x")
//   "quanto posso gastar hoje?" → o Claude Opus responde com o resumo do mês que o app envia na sincronização
//   áudio                 → o ElevenLabs (ELEVENLABS_API_KEY) transforma em texto, que segue o mesmo caminho do texto
const crypto = require('crypto');
const AnthropicSdk = require('@anthropic-ai/sdk');
const Anthropic = AnthropicSdk.default || AnthropicSdk;
const { redis } = require('./_db');
const { banco, plusAtivo } = require('./_pg');
const { tokenWa, responder, marcarJanela } = require('./_wa');
const { lembretesDaConta } = require('./_walembretes');

const TESTE = process.env.VERCEL_ENV !== 'production';
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

// Baixa a foto ou o PDF que a pessoa mandou (a Meta dá um link temporário que exige o token).
const MIDIAS = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];
const AUDIOS = ['audio/ogg', 'audio/mpeg', 'audio/mp4', 'audio/aac', 'audio/amr'];
async function baixarMidia(id, tipos = MIDIAS, max = 4.5e6) {
  const auth = { Authorization: `Bearer ${tokenWa()}` };
  const info = await fetch(`https://graph.facebook.com/v25.0/${id}`, { headers: auth }).then((r) => r.ok ? r.json() : null);
  if (!info || !info.url) return null;
  const tipo = String(info.mime_type || '').split(';')[0].trim();
  if (!tipos.includes(tipo) || +info.file_size > max) return { tipo, grande: +info.file_size > max };
  const r = await fetch(info.url, { headers: auth });
  if (!r.ok) return null;
  const buf = Buffer.from(await r.arrayBuffer());
  return { tipo, buf, dados: buf.toString('base64'), hash: crypto.createHash('sha256').update(buf).digest('hex').slice(0, 32) };
}

// Impressão digital da chave (6 letras do hash + tamanho): mostra QUAL chave está na Vercel sem revelar a chave.
const impressaoChave = () => { const k = String(process.env.ELEVENLABS_API_KEY || '').trim();
  return crypto.createHash('sha256').update(k).digest('hex').slice(0, 6) + ' tam ' + k.length; };
// Áudio → texto (ElevenLabs Speech to Text, em português).
async function transcrever(audio) {
  const form = new FormData();
  form.append('model_id', process.env.ELEVENLABS_STT_MODELO || 'scribe_v1');
  form.append('language_code', 'por');
  form.append('tag_audio_events', 'false');
  const ext = { 'audio/ogg': 'ogg', 'audio/mpeg': 'mp3', 'audio/mp4': 'm4a', 'audio/aac': 'aac', 'audio/amr': 'amr' }[audio.tipo] || 'ogg';
  form.append('file', new Blob([audio.buf], { type: audio.tipo }), 'audio.' + ext);
  const r = await fetch('https://api.elevenlabs.io/v1/speech-to-text', {
    method: 'POST', headers: { 'xi-api-key': String(process.env.ELEVENLABS_API_KEY || '').trim() }, body: form,
  });
  if (!r.ok) {
    const corpo = (await r.text()).slice(0, 300);
    console.error('whatsapp transcrição', r.status, corpo);
    let motivo = ''; try { const d = JSON.parse(corpo).detail || {}; motivo = d.status || d.code || ''; } catch (e) {}
    return { erro: `${r.status} ${motivo}`.trim() };
  }
  return { texto: String((await r.json()).text || '').trim() };
}

// A IA lê a mensagem (texto, ou foto/PDF do comprovante com a legenda) e devolve o lançamento em JSON
// (formato garantido pelo json_schema).
async function interpretar(texto, categorias, cartoes, midia) {
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
cartao: o nome do cartão citado, se for um destes: ${cartoes.length ? cartoes.join(', ') : '(nenhum cadastrado)'}; senão "".
Se vier uma foto ou PDF, a pessoa quer anotar o que aparece nela. Pode ser comprovante (Pix, nota fiscal, cupom, recibo, maquininha): use o VALOR TOTAL pago, o estabelecimento ou quem recebeu como descricao, e a data do comprovante.
Pode ser também etiqueta de preço, produto com preço, cardápio ou conta com valor: considere que a pessoa comprou, use o preço (o maior em destaque; "99,90" → 99.9), descreva o produto (ex.: "Bermuda") e use a data de hoje.
Comprovante de Pix ou transferência RECEBIDA (a pessoa é quem recebeu) é "entrada". Pix enviado ou pagamento é "gasto" com forma "Pix / Dinheiro", salvo se o comprovante ou a legenda indicar crédito ou débito.
A legenda que acompanha a foto vale mais que a foto (ex.: "no crédito em 3x"). Só use tipo "outro" se não houver nenhum valor em reais legível na imagem.`,
    messages: [{ role: 'user', content: midia ? [
      { type: midia.tipo === 'application/pdf' ? 'document' : 'image', source: { type: 'base64', media_type: midia.tipo, data: midia.dados } },
      { type: 'text', text: texto || '(foto do comprovante, sem legenda)' },
    ] : texto }],
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

async function lancar(sql, conta, texto, midia) {
  const { extras, cartoes, ultimo } = await contexto(sql, conta.email);
  const categorias = CATEGORIAS.concat(extras.map((x) => x.c));
  const it = await interpretar(texto, categorias, cartoes.map((c) => c.nome), midia);
  if (it && it.tipo === 'pergunta' && !midia) return responderPergunta(sql, conta, texto);
  if (midia && (!it || it.tipo === 'outro' || it.tipo === 'pergunta' || !(it.valor > 0))) {
    return 'Não achei um valor nessa foto 🤔 Tente uma foto mais nítida, com o valor aparecendo, ou me escreva: "gastei 45 no mercado no pix".';
  }
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
  const de = String(msg.from || '');
  const arquivo = msg.type === 'image' ? msg.image : msg.type === 'document' ? msg.document : null;
  const texto = String(msg.type === 'text' ? (msg.text && msg.text.body) || '' : (arquivo && arquivo.caption) || '').trim();
  // mensagem repetida (a Meta reenvia se demorarmos): trata uma vez só
  if (!(await redis('SET', 'wa:msg:' + msg.id, '1', 'NX', 'EX', 86400))) return;
  await marcarJanela(de);   // nas próximas 24 h o Tino pode mandar texto livre (fora disso, só modelos aprovados)

  const cod = texto.toUpperCase().match(/\bTINO-([A-Z0-9]{4})\b/);
  if (cod) {
    const [c] = await sql`DELETE FROM wa_codigos WHERE codigo = ${'TINO-' + cod[1]} AND expira > now() RETURNING email`;
    if (!c) return responder(de, 'Esse código expirou ou não existe. Gere outro no app: Ajustes → Tino Plus → Conectar WhatsApp.');
    await sql`UPDATE contas SET whatsapp = NULL WHERE whatsapp = ${de}`;
    await sql`UPDATE contas SET whatsapp = ${de} WHERE email = ${c.email}`;
    return responder(de, `Pronto! Seu WhatsApp está conectado ao Tino ✅\n\nAgora é só me mandar seus gastos, do seu jeito:\n• "gastei 45 no mercado no pix"\n• "uber 23 ontem"\n• "tênis 600 em 3x no crédito"\n• "recebi 1500 de salário"\n• 📸 uma foto do comprovante\n• 🎤 um áudio\n\nE pode perguntar: "quanto posso gastar hoje?"`);
  }

  const [conta] = await sql`SELECT * FROM contas WHERE whatsapp = ${de}`;
  if (!conta) return responder(de, 'Oi! Eu sou o Tino 💚 Para anotar seus gastos por aqui, conecte este WhatsApp no app: Ajustes → Tino Plus → Conectar WhatsApp.');
  if (!TESTE && !plusAtivo(conta)) return responder(de, 'O Tino no WhatsApp é um recurso do Tino Plus. Veja em Ajustes → Tino Plus no app.');
  if (!(await limite(de))) return responder(de, 'Muitas mensagens em pouco tempo. Espere um pouquinho e tente de novo 🙏');

  // lembretes: ligar e desligar por aqui (a escolha vai para o app pela sincronização)
  const cmd = texto.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z ]/g, '').trim();
  if (/^(parar|desligar|cancelar|sem) lembretes?$/.test(cmd) || /^(ligar|ativar|voltar) lembretes?$/.test(cmd)) {
    const ligar = /^(ligar|ativar|voltar)/.test(cmd);
    await sql`INSERT INTO itens (email, chave, valor, apagado, seq, aparelho, alterado)
      VALUES (${conta.email}, 'v|waLembretes', ${JSON.stringify(ligar)}::jsonb, false, nextval('itens_seq'), 'whatsapp', now())
      ON CONFLICT (email, chave) DO UPDATE SET valor = EXCLUDED.valor, apagado = false, seq = EXCLUDED.seq, aparelho = 'whatsapp', alterado = now()`;
    return responder(de, ligar ? 'Lembretes ligados 🔔 Eu aviso na véspera das contas e das faturas, quando a fatura vai fechar e, aos domingos, como foi a sua semana.'
      : 'Pronto, não vou mais mandar lembretes 🔕 Para voltar, mande "ligar lembretes".');
  }
  if (TESTE && (cmd === 'testar lembretes' || cmd === 'testar modelos')) {
    const n = await lembretesDaConta(sql, conta, { forcar: true, soModelo: cmd === 'testar modelos' });
    return n ? undefined : responder(de, 'Não achei contas, faturas nem gastos da semana para lembrar. Sincronize o app e tente de novo.');
  }
  if (msg.type === 'audio' && msg.audio) {
    if (!process.env.ELEVENLABS_API_KEY) return responder(de, 'Ainda não entendo áudio 🙂 Me mande por escrito ou a foto do comprovante.');
    // ~1 minuto de áudio do WhatsApp (opus) tem uns 150 KB; o limite segura áudios longos demais
    const audio = await baixarMidia(msg.audio.id, AUDIOS, 400e3);
    if (!audio) return responder(de, 'Não consegui abrir esse áudio 😕 Tente mandar de novo.');
    if (!audio.buf) return responder(de, audio.grande ? 'Esse áudio é longo demais 😅 Mande um áudio curto, de até 1 minuto, ou escreva.' : 'Não consegui ouvir esse áudio 😕 Tente gravar de novo.');
    const t = await transcrever(audio), ouvido = t.texto;
    // no endereço de teste, mostra o motivo da falha (sem segredos) para facilitar o diagnóstico
    if (!ouvido) return responder(de, 'Não consegui entender o áudio 😕 Tente de novo, falando o valor e o que foi, ou escreva.' + (TESTE ? `\n\n(teste: ${t.erro || 'áudio vazio'} · ${audio.tipo} · ${audio.buf.length} bytes · chave ${impressaoChave()})` : ''));
    return responder(de, `🎤 Entendi: "${ouvido.slice(0, 300)}"\n\n` + await lancar(sql, conta, ouvido.slice(0, 500)));
  }
  if (!texto && !arquivo) return responder(de, 'Por enquanto eu entendo texto, áudio e foto do comprovante 🙂 Ex.: "gastei 45 no mercado no pix".');
  if (!arquivo) return responder(de, await lancar(sql, conta, texto.slice(0, 500)));

  const midia = await baixarMidia(arquivo.id);
  if (!midia) return responder(de, 'Não consegui abrir esse arquivo 😕 Tente mandar a foto de novo.');
  if (!midia.dados) return responder(de, midia.grande ? 'Esse arquivo é grande demais 😅 Mande uma foto do comprovante.' : 'Eu leio fotos (JPG/PNG) e PDF de comprovantes 🙂 Mande a foto do comprovante.');
  // o mesmo comprovante enviado duas vezes não vira dois lançamentos
  if (!(await redis('SET', 'wa:comp:' + conta.email + ':' + midia.hash, '1', 'NX', 'EX', 90 * 86400)))
    return responder(de, 'Esse comprovante já foi anotado antes 😉 Se quiser lançar de novo, escreva o gasto por texto.');
  let r = '';
  try { r = await lancar(sql, conta, texto.slice(0, 500), midia); }
  finally { if (!r.startsWith('✅')) await redis('DEL', 'wa:comp:' + conta.email + ':' + midia.hash); }   // não anotou: pode tentar de novo
  return responder(de, r);
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
