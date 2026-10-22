// Envio de mensagens pelo WhatsApp (Cloud API da Meta), usado pelo webhook e pelos lembretes.
// Fora da janela de 24 horas (a pessoa não mandou mensagem nas últimas 24 h), a Meta só aceita modelos aprovados
// no WhatsApp Manager. Por isso cada lembrete tem o texto livre e o modelo equivalente.
const { redis } = require('./_db');

const PHONE_ID = process.env.WHATSAPP_PHONE_ID || '1457233977454720';   // número de teste da Meta, até termos o oficial
// O token às vezes é salvo com espaço, quebra de linha ou "Bearer " na frente: limpa antes de usar.
const tokenWa = () => String(process.env.WHATSAPP_TOKEN || '').trim().replace(/^Bearer\s+/i, '').replace(/\s+/g, '');
// O WhatsApp entrega celulares brasileiros sem o nono dígito (55 85 8888-0326). Para responder (e para a lista de
// números permitidos do número de teste), usa o formato completo: 55 + DDD + 9 + 8 dígitos.
const comNono = (n) => /^55\d{2}[6-9]\d{7}$/.test(n) ? n.slice(0, 4) + '9' + n.slice(4) : n;

async function enviar(para, corpo) {
  const tk = tokenWa();
  const r = await fetch(`https://graph.facebook.com/v25.0/${PHONE_ID}/messages`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${tk}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ messaging_product: 'whatsapp', to: comNono(String(para)), ...corpo }),
  });
  if (!r.ok) {
    const bruto = String(process.env.WHATSAPP_TOKEN || '');
    console.error('whatsapp envio', r.status, (await r.text()).slice(0, 300), JSON.stringify({ temToken: !!bruto, tamOriginal: bruto.length,
      tamLimpo: tk.length, comecaEAA: tk.startsWith('EAA'), tinhaEspaco: /\s/.test(bruto), tinhaBearer: /bearer/i.test(bruto), phoneId: PHONE_ID }));
  }
  return r.ok;
}
const responder = (para, texto) => enviar(para, { type: 'text', text: { body: texto } });

// Janela de 24 h: anotada a cada mensagem recebida.
const marcarJanela = (de) => redis('SET', 'wa:janela:' + de, '1', 'EX', 23 * 3600);
const janelaAberta = async (de) => !!(await redis('GET', 'wa:janela:' + de));

// Dentro da janela manda o texto livre; fora dela, o modelo aprovado (parâmetros sem quebra de linha).
// soModelo: força o modelo mesmo com a janela aberta (para testar se os modelos foram aprovados).
async function avisar(para, texto, modelo, parametros, soModelo = false) {
  if (!soModelo && await janelaAberta(para)) return responder(para, texto);
  return enviar(para, { type: 'template', template: { name: modelo, language: { code: 'pt_BR' },
    components: [{ type: 'body', parameters: parametros.map((p) => ({ type: 'text', text: String(p).replace(/\s+/g, ' ').slice(0, 900) })) }] } });
}

module.exports = { PHONE_ID, tokenWa, comNono, responder, marcarJanela, avisar };
