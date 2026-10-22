// Lembretes do Tino pelo WhatsApp (Tino Plus), enviados pela tarefa diária das 20h (api/lembretes.js):
//   - contas e faturas que vencem amanhã;
//   - fatura do cartão que fecha amanhã, com o valor até agora;
//   - aos domingos, quanto a pessoa gastou na semana e onde gastou mais.
// Os dados vêm da agenda que o app envia na sincronização (v|resumoPlus.agenda) e dos lançamentos no servidor.
// A pessoa liga e desliga no app (v|waLembretes) ou mandando "parar lembretes" no WhatsApp.
// Modelos que precisam estar aprovados no WhatsApp Manager (categoria Utilidade, idioma pt_BR):
//   tino_conta_vence    "🔔 Lembrete do Tino: vence {{1}}: {{2}}. Se já pagou, é só marcar como paga no app."
//   tino_fatura_fecha   "💳 Lembrete do Tino: a fatura do cartão {{1}} fecha {{2}}, com {{3}} até agora. Compras feitas depois do fechamento entram na fatura seguinte."
//   tino_resumo_semana  "📊 Sua semana no Tino: você gastou {{1}} nos últimos 7 dias, a maior parte em {{2}}. Quer saber quanto ainda pode gastar no mês? É só me perguntar aqui."
const { redis } = require('./_db');
const { plusAtivo } = require('./_pg');
const { avisar } = require('./_wa');

const brl = (v) => 'R$ ' + Number(v).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const brasilia = (dias) => new Date(Date.now() - 3 * 3600e3 + dias * 864e5).toISOString().slice(0, 10);
const ddmm = (d) => d.slice(8, 10) + '/' + d.slice(5, 7);
const lista = (xs) => xs.map((x) => `${x.nome} (${brl(x.valor)})`).join(', ');

// Uma vez só por lembrete (a tarefa pode rodar de novo no mesmo dia).
const primeiraVez = async (email, id) => !!(await redis('SET', `wa:lemb:${email}:${id}`, '1', 'NX', 'EX', 4 * 86400));

// soModelo: "testar modelos", o mesmo pelos modelos aprovados (como chega para quem está fora da janela de 24 h).
// forcar: teste pelo WhatsApp ("testar lembretes") — manda já os próximos de cada tipo, mesmo fora do dia.
async function lembretesDaConta(sql, conta, { forcar = false, soModelo = false } = {}) {
  if (!conta.whatsapp) return 0;
  const linhas = await sql`SELECT chave, valor FROM itens WHERE email = ${conta.email} AND NOT apagado AND chave IN ('v|resumoPlus', 'v|waLembretes')`;
  const v = Object.fromEntries(linhas.map((l) => [l.chave, l.valor]));
  if (v['v|waLembretes'] === false && !forcar) return 0;
  const agenda = ((v['v|resumoPlus'] || {}).agenda || []).filter((x) => x && x.data && x.nome);
  const hoje = brasilia(0), amanha = brasilia(1), para = conta.whatsapp;
  const quando = (d) => d === amanha ? `amanhã (${ddmm(d)})` : d === hoje ? `hoje (${ddmm(d)})` : `dia ${ddmm(d)}`;
  // no dia (amanhã) ou, no teste, a próxima data que tiver
  const doDia = (tipos) => {
    const xs = agenda.filter((x) => tipos.includes(x.tipo) && x.data >= hoje);
    const d = forcar ? (xs[0] || {}).data : amanha;
    return d ? xs.filter((x) => x.data === d) : [];
  };
  let n = 0;

  const vencem = doDia(['conta', 'fatura']);
  if (vencem.length && (forcar || await primeiraVez(conta.email, 'venc:' + vencem[0].data))) {
    const q = quando(vencem[0].data), l = lista(vencem);
    await avisar(para, `🔔 Lembrete do Tino: vence ${q}: ${l}.\n\nSe já pagou, é só marcar como paga no app.`, 'tino_conta_vence', [q, l], soModelo);
    n++;
  }
  for (const f of doDia(['fechamento']).filter((x) => x.valor > 0)) {
    if (!forcar && !(await primeiraVez(conta.email, 'fech:' + f.nome + ':' + f.data))) continue;
    const q = quando(f.data);
    await avisar(para, `💳 Lembrete do Tino: a fatura do cartão ${f.nome} fecha ${q}, com ${brl(f.valor)} até agora.\n\nCompras feitas depois do fechamento entram na fatura seguinte.`,
      'tino_fatura_fecha', [f.nome, q, brl(f.valor)], soModelo);
    n++;
  }

  const domingo = new Date(hoje + 'T12:00:00Z').getUTCDay() === 0;
  if ((domingo || forcar) && (forcar || await primeiraVez(conta.email, 'semana:' + hoje))) {
    const ini = brasilia(-6), meses = [...new Set([ini.slice(0, 7), hoje.slice(0, 7)])];
    const gs = await sql`SELECT valor FROM itens WHERE email = ${conta.email} AND NOT apagado
      AND (chave LIKE ${'i|m/' + meses[0] + '/gastos|%'} OR chave LIKE ${'i|m/' + meses[meses.length - 1] + '/gastos|%'})`;
    const cats = {}; let total = 0;
    for (const { valor: g } of gs) {
      if (!g || !g.data || g.data < ini || g.data > hoje) continue;
      total += +g.valor || 0; cats[g.cat || '❓ Outros'] = (cats[g.cat || '❓ Outros'] || 0) + (+g.valor || 0);
    }
    if (total > 0) {
      const top = Object.entries(cats).sort((a, b) => b[1] - a[1])[0];
      const onde = `${top[0]} (${brl(top[1])})`;
      await avisar(para, `📊 Sua semana no Tino: você gastou ${brl(total)} nos últimos 7 dias, a maior parte em ${onde}.\n\nQuer saber quanto ainda pode gastar no mês? É só me perguntar aqui.`,
        'tino_resumo_semana', [brl(total), onde], soModelo);
      n++;
    }
  }
  return n;
}

// Tarefa diária: todas as contas do Plus com WhatsApp conectado.
async function lembretesWhatsApp(sql) {
  const contas = await sql`SELECT * FROM contas WHERE whatsapp IS NOT NULL`;
  let enviados = 0, falhas = 0;
  for (const c of contas) {
    if (!plusAtivo(c)) continue;
    try { enviados += await lembretesDaConta(sql, c); } catch (e) { falhas++; console.error('lembrete whatsapp', e.message); }
  }
  return { contas: contas.length, enviados, falhas };
}

module.exports = { lembretesDaConta, lembretesWhatsApp };
