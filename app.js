/* =========================================================
   Tino Finanças — app PWA
   Todos os dados ficam salvos no próprio aparelho (localStorage).
   ========================================================= */

const CONFIG = {
  nomeApp: 'Tino Finanças',
  slogan: 'Tenha tino para o seu dinheiro.',
  // true = pede o e-mail da compra (ou código) na primeira abertura.
  // A conferência é feita no servidor (api/liberar.js).
  exigirCodigo: true,
  // Link que aparece na imagem da retrospectiva compartilhada (ex.: sua página de vendas). Vazio = só o nome do app.
  linkDivulgacao: 'tinofinancas.com.br',
  // Suporte (central de ajuda em Ajustes). WhatsApp só com números, com DDI e DDD (ex.: '5511999999999'). Vazio = só e-mail.
  suporteEmail: 'suporteplanilhass@gmail.com',
  suporteWhatsApp: '',
  frases: [
    'Pequenas ações geram grandes resultados.',
    'Quem anota, controla. Quem controla, conquista.',
    'Cada real no lugar certo é um passo para sua meta.',
    'Constância vale mais que intensidade.',
    'Seu futuro agradece o que você organiza hoje.'
  ]
};

// Versão do código. Ao publicar: aumente aqui, em versao.json e o CACHE do sw.js.
const APP_VERSAO = 70;
// Monitor de erros: se algo quebrar no aparelho do cliente, avisa o servidor (só dados técnicos, no máximo 5 por vez que o app abre).
(function(){
  const vistos = new Set();
  function enviar(msg, onde){
    try {
      msg = String(msg || '').slice(0, 200); onde = String(onde || '').slice(0, 120);
      if (!msg || /^Script error\.?$/i.test(msg) || vistos.size >= 5 || vistos.has(msg + onde)) return;
      vistos.add(msg + onde);
      const ler = (f) => { try { return f(); } catch(e){ return ''; } };   // variáveis ainda não criadas quando o erro é bem no início
      fetch('api/erros', { method:'POST', keepalive:true, headers:{'Content-Type':'application/json'}, body: JSON.stringify({
        msg, onde, versao:APP_VERSAO, tela:ler(() => aba), aparelho:ler(nomeAparelho), demo:!!ler(() => DEMO), teste:!!ler(() => TESTE) }) }).catch(() => {});
    } catch(e){}
  }
  window.addEventListener('error', e => enviar(e.message, `${String(e.filename||'').split('/').pop()}:${e.lineno}:${e.colno}`));
  window.addEventListener('unhandledrejection', e => { const r = e.reason;
    enviar('Promise: ' + (r && r.message || r), r && r.stack ? (String(r.stack).split('\n').find(l => /\.js/.test(l)) || '').trim() : ''); });
})();
const STORE_KEY = 'orgfin:v1';
// Dados de contas que saíram ficam guardados em 'orgfin:conta:<e-mail ou código>' e voltam ao entrar de novo.
const CONTA_KEY = (id) => 'orgfin:conta:' + (id || '_sem');
const MESES = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];
const MES_CURTO = ['jan','fev','mar','abr','mai','jun','jul','ago','set','out','nov','dez'];
const CATEGORIAS = ['🧾 Parcela','🧾 Contas','🧺 Mercado','🍗 Alimentação','⛽ Gasolina','🚗 Transporte','🏠 Casa','💊 Saúde',
  '📦 Compras Online','👕 Vestuário','🎉 Lazer','📚 Educação','📱 Assinaturas','💄 Beleza','🐾 Pets','🎁 Presentes','❓ Outros'];
// Categorias que já vêm marcadas como essenciais ao lançar um gasto.
const ESSENCIAIS = ['🧾 Parcela','🧾 Contas','🧺 Mercado','⛽ Gasolina','🚗 Transporte','🏠 Casa','💊 Saúde','📚 Educação'];
const CAT_CONTAS = '📄 Contas fixas';
const EMOJIS_CAT = ['🐶','👶','💪','⚽','🎮','🍺','☕','🍕','💇','🚌','🛵','✈️','🎓','💻','🔧','🧹','🏋️','🎵','🎨','📷','🌱','⛪','💼','🏦','💳','🎟️','🚬','💐'];
// Categorias do cliente: S.catsExtras = [{ c:'🐶 Cachorro', ess:false }] e S.catsOcultas = categorias do app que a pessoa escondeu.
// "❓ Outros" fica sempre por último e nunca some. 'incluir' mantém na lista a categoria atual de um gasto, mesmo escondida.
function catsVisiveis(incluir){
  const oc = S.catsOcultas || [], l = CATEGORIAS.filter(c => c !== '❓ Outros' && !oc.includes(c)).concat((S.catsExtras||[]).map(x => x.c));
  if (incluir && incluir !== '❓ Outros' && !l.includes(incluir)) l.push(incluir);
  return l.concat(['❓ Outros']);
}
function todasCats(){ return CATEGORIAS.concat((S.catsExtras||[]).map(x => x.c)); }
function ehEssencial(c){ return ESSENCIAIS.includes(c) || !!(S.catsExtras||[]).find(x => x.c === c && x.ess); }
const FORMAS = ['Pix / Dinheiro','Débito','Crédito'];
const TIPOS_RES = ['Reserva de emergência','Meta','Renda Fixa','Renda Variável','Outros'];
const TIPOS_INVEST = ['Renda Fixa','Renda Variável','Outros'];
const EMOJIS_COF = ['🎯','🛟','🏖️','✈️','🚗','🏠','💍','🎓','🎄','💻','📱','🐷'];

/* ---------- estado ---------- */
function novoEstado(){
  return { v:2, liberado:false,
    perfil:{ nome:'', pronome:'Masculinos', metaNome:'', metaValor:0, reservaMeta:0, ok:false },
    carry:true, meses:{}, orcamentos:{} };
}
// Modo demonstração (/demo ou ?demo): dados de exemplo, nada é salvo e os dados reais do aparelho não são tocados.
const DEMO = /\/demo\/?$/.test(location.pathname) || new URLSearchParams(location.search).has('demo');
// Endereço de teste: as versões de teste da Vercel (que já exigem login na Vercel) e o teste local.
// Lá o app não pede a liberação de acesso, para testar como cliente novo sem gastar vagas de aparelho.
// No endereço oficial (organizacao-financeira-seven.vercel.app) nada muda.
const TESTE = /-lucas-santos-projects4\.vercel\.app$/.test(location.hostname) || /^(localhost|127\.0\.0\.1)$/.test(location.hostname);
if (TESTE && !DEMO) CONFIG.exigirCodigo = false;
// Página de vendas do app (tinofinancas.com.br leva para /app; o domínio antigo continua funcionando).
const LINK_COMPRA = 'https://www.tinofinancas.com.br';
// Checkout da assinatura do Tino Plus na Cakto (preço normal e preço de fundador, para quem tem o vitalício)
const LINK_PLUS = 'https://pay.cakto.com.br/gtsweyx_1229875', LINK_PLUS_FUNDADOR = 'https://pay.cakto.com.br/33zgojc';
let S;
try { S = JSON.parse(localStorage.getItem(STORE_KEY)) || novoEstado(); } catch(e){ S = novoEstado(); }
function migrar(){
  if (!S.orcamentos) S.orcamentos = {}; if (!S.meses) S.meses = {}; if (!S.cartoes) S.cartoes = []; if (!S.dividas) S.dividas = []; if (!S.aReceber) S.aReceber = []; S.v = 2;
  // Cofrinhos: a meta e a reserva de emergência antigas viram os dois primeiros.
  if (!S.cofrinhos){
    S.cofrinhos = [];
    const p = S.perfil || {}, usados = new Set();
    Object.values(S.meses).forEach(M => M.reservas.forEach(r => usados.add(r.tipo)));
    if (p.reservaMeta > 0 || usados.has('Reserva de emergência')) S.cofrinhos.push({ id:'reserva', nome:'Reserva de emergência', emoji:'🛟', alvo:p.reservaMeta||0, prazo:'' });
    if (p.metaValor > 0 || usados.has('Meta')) S.cofrinhos.push({ id:'meta', nome:p.metaNome||'Minha meta', emoji:'🎯', alvo:p.metaValor||0, prazo:'' });
  }
  // Quem já usava antes do lembrete de backup: conta os lançamentos existentes como "sem backup".
  if (S.novosDesdeBackup == null) S.novosDesdeBackup = S.ultimoBackup ? 0 :
    Object.values(S.meses).reduce((a,M)=>a+M.entradas.length+M.gastos.length+M.contas.length+M.reservas.length, 0);
  // Antes, um gasto ficava no mês aberto na tela, mesmo com a data de outro mês. Compras parceladas lançadas
  // depois (ex.: compra de agosto lançada em outubro) contavam a 1ª parcela no mês errado: vão para o mês da compra.
  if (!S.migParcData){
    Object.keys(S.meses).forEach(k => {
      const M = S.meses[k];
      M.gastos.filter(g => (+g.parcelas||1) > 1 && /^\d{4}-\d{2}-\d{2}$/.test(g.data||'') && g.data.slice(0,7) < k).forEach(g => {
        M.gastos.splice(M.gastos.indexOf(g), 1);
        const d = g.data.slice(0,7); S.meses[d] = S.meses[d] || { entradas:[], gastos:[], contas:[], reservas:[] }; S.meses[d].gastos.push(g);
      });
    });
    S.migParcData = true;
  }
}
migrar();
// Tema: 'auto' segue o celular; 'claro' e 'escuro' forçam.
function aplicarTema(){
  const r = document.documentElement, t = S.tema || 'auto';
  if (t==='claro') r.dataset.theme = 'light'; else if (t==='escuro') r.dataset.theme = 'dark'; else delete r.dataset.theme;
  const escuro = t==='escuro' || (t==='auto' && matchMedia('(prefers-color-scheme: dark)').matches);
  document.querySelectorAll('meta[name="theme-color"]').forEach(m=>m.setAttribute('content', escuro ? '#0b2a28' : '#0b3b3a'));
}
aplicarTema();
matchMedia('(prefers-color-scheme: dark)').addEventListener('change', aplicarTema);
function salvar(){ if (DEMO) return; try { localStorage.setItem(STORE_KEY, JSON.stringify(S)); } catch(e){ toast('Não foi possível salvar no aparelho'); } if (typeof agendarSyncNotif === 'function') agendarSyncNotif(); if (typeof agendarSync === 'function') agendarSync(); }

const hoje = new Date();
let cur = { y: hoje.getFullYear(), m: hoje.getMonth() };   // mês aberto
let aba = 'resumo', subLanc = 'gastos';
let evoSel = null;   // mês destacado no gráfico de evolução
let busca = '';      // texto da busca em Lançamentos
let calSel = null;   // dia selecionado no calendário

/* ---------- utilidades ---------- */
// Com "esconder valores" ligado (👁️ no topo), todo valor em reais aparece como R$ •••••.
const OCULTO = 'R$ •••••';
const brl = (n) => S.ocultar ? OCULTO : (n<0?'-':'') + 'R$ ' + Math.abs(n||0).toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2});
const brl0 = (n) => S.ocultar ? OCULTO : (n<0?'-':'') + 'R$ ' + Math.abs(Math.round(n||0)).toLocaleString('pt-BR');
function parseValor(s){
  if (typeof s === 'number') return s;
  s = String(s||'').replace(/R\$|\s/g,'');
  if (!s) return 0;
  if (s.includes(',')) s = s.replace(/\./g,'').replace(',','.');
  const n = parseFloat(s); return isNaN(n) ? 0 : Math.round(n*100)/100;
}
const esc = (s) => String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const uid = () => Date.now().toString(36)+Math.random().toString(36).slice(2,7);
const key = (y,m) => y+'-'+String(m+1).padStart(2,'0');
const ymDe = (k) => ({ y:+k.slice(0,4), m:+k.slice(5,7)-1 });
const prevYM = (y,m) => m===0 ? {y:y-1,m:11} : {y,m:m-1};
const nextYM = (y,m) => m===11 ? {y:y+1,m:0} : {y,m:m+1};
const somaMeses = (y,m,n) => { const t = y*12+m+n; return { y:Math.floor(t/12), m:t%12 }; };
const fmtData = (d) => d ? d.split('-').reverse().slice(0,2).join('/') : '';
const soma = (arr,f) => arr.reduce((a,x)=>a+(+f(x)||0),0);
const diasNoMes = (y,m) => new Date(y,m+1,0).getDate();
const chaveHoje = () => key(hoje.getFullYear(), hoje.getMonth());
const nomeCat = (c) => c.split(' ').slice(1).join(' ');
const emojiCat = (c) => c.split(' ')[0];
const ehParcelado = (g) => g.forma==='Crédito' && (+g.parcelas||1) > 1;
function mes(y,m,criar){
  const k = key(y,m);
  if (!S.meses[k] && criar) S.meses[k] = { entradas:[], gastos:[], contas:[], reservas:[] };
  return S.meses[k] || { entradas:[], gastos:[], contas:[], reservas:[] };
}
// Identificação aleatória deste aparelho (para cada acesso liberar um só celular).
function idAparelho(){
  let id; try { id = localStorage.getItem('orgfin:aparelho'); } catch(e){}
  if (!id){ id = (crypto.randomUUID ? crypto.randomUUID() : Date.now()+'-'+Math.random().toString(36).slice(2));
    try { localStorage.setItem('orgfin:aparelho', id); } catch(e){} }
  return id;
}
function toast(msg){ const t=document.getElementById('toast'); t.textContent=msg; t.classList.add('show'); clearTimeout(t._h); t._h=setTimeout(()=>t.classList.remove('show'),2600); }

/* ---------- parcelamento ----------
   Uma compra no crédito em N vezes fica salva uma vez só, no mês da compra.
   Aqui ela é "espalhada": cada parcela pertence ao crédito de um mês
   (e vira fatura no mês seguinte, como qualquer compra no crédito). */
let memoParc = null;
function parcelas(){
  if (memoParc) return memoParc;
  memoParc = {};
  Object.entries(S.meses).forEach(([k,M]) => {
    const o = ymDe(k);
    M.gastos.filter(ehParcelado).forEach(g => {
      const n = +g.parcelas, base = Math.floor(g.valor/n*100)/100;
      for (let i=0; i<n; i++){
        const alvo = somaMeses(o.y,o.m,i), ka = key(alvo.y,alvo.m);
        const valor = i===n-1 ? Math.round((g.valor - base*(n-1))*100)/100 : base;
        (memoParc[ka] = memoParc[ka] || []).push({ g, i, n, valor, origem:k });
      }
    });
  });
  return memoParc;
}
const parcelasDoMes = (y,m) => parcelas()[key(y,m)] || [];

/* ---------- cartões e faturas ----------
   Sem cartão: a compra no crédito é paga no mês seguinte (regra original).
   Com cartão: compra até o dia do fechamento entra na fatura daquele mês; depois, na do mês seguinte.
   A fatura é paga no mês do vencimento (mesmo mês do fechamento se o vencimento for depois dele). */
const cartaoPorId = (id) => (S.cartoes||[]).find(c=>c.id===id);
function mesPagamento(data, kCompra, cartao){
  const o = data ? ymDe(data.slice(0,7)) : ymDe(kCompra);
  if (!cartao || !data) return somaMeses(o.y, o.m, 1);
  const fech = +data.slice(8,10) <= cartao.fechamento ? o : somaMeses(o.y, o.m, 1);
  return cartao.vencimento > cartao.fechamento ? fech : somaMeses(fech.y, fech.m, 1);
}
let memoFat = null;
function faturas(){
  if (memoFat) return memoFat;
  memoFat = {};
  const add = (k, cartao, valor, g, origem, i, n) => (memoFat[k] = memoFat[k] || []).push({ cartao, valor, g, origem, i, n });
  Object.entries(S.meses).forEach(([k,M]) => M.gastos.filter(g=>g.forma==='Crédito').forEach(g => {
    const c = cartaoPorId(g.cartao), pg = mesPagamento(g.data, k, c);
    if (ehParcelado(g)){
      const n = +g.parcelas, base = Math.floor(g.valor/n*100)/100;
      for (let i=0;i<n;i++){ const a = somaMeses(pg.y, pg.m, i); add(key(a.y,a.m), c ? c.id : null, i===n-1 ? Math.round((g.valor - base*(n-1))*100)/100 : base, g, k, i, n); }
    } else add(key(pg.y,pg.m), c ? c.id : null, +g.valor, g, k, 0, 1);
  }));
  return memoFat;
}
const faturasDoMes = (y,m) => faturas()[key(y,m)] || [];
// Total de cada fatura paga no mês, por cartão (null = compras sem cartão).
function faturasPorCartao(y,m){
  const t = {}; faturasDoMes(y,m).forEach(x => { t[x.cartao||''] = (t[x.cartao||''] || 0) + x.valor; });
  return Object.entries(t).map(([id,valor]) => ({ cartao: cartaoPorId(id) || null, valor })).filter(x=>x.valor>0.004);
}
// Pagamento da fatura (opcional): S.faturasPagas['<cartão>|<AAAA-MM>'] = { pago: valor pago, em: data, divida: id }.
// Sem registro, a fatura conta inteira como saída no mês do vencimento (como sempre foi). Paga só em parte, o resto
// vira uma dívida de rotativo e só o valor pago entra nas saídas.
const fatKey = (cid, y, m) => cid + '|' + key(y,m);
const statusFatura = (cid, y, m) => (S.faturasPagas || {})[fatKey(cid, y, m)] || null;
const vencFatura = (cartao, y, m) => key(y,m) + '-' + String(Math.min(cartao.vencimento, diasNoMes(y,m))).padStart(2,'0');
// Limite usado: tudo o que ainda vai ser pago (faturas deste mês em diante).
function limiteUsado(id){
  const kh = chaveHoje(); let t = 0;
  Object.entries(faturas()).forEach(([k,xs]) => { if (k >= kh) t += soma(xs.filter(x=>x.cartao===id), x=>x.valor); });
  return t;
}
/* ---------- controle de dívidas ----------
   Saldo devedor, juros ao mês e parcela. Calcula prazo, juros futuros e o plano de quitação
   (avalanche: maior juros primeiro; bola de neve: menor saldo primeiro). */
const TIPOS_DIVIDA = [['emprestimo','🏦','Empréstimo'],['financiamento','🏠','Financiamento'],['rotativo','💳','Cartão (rotativo)'],['cheque','🧾','Cheque especial'],['pessoa','🤝','Com alguém'],['outro','📌','Outra']];
const emojiDivida = (d) => (TIPOS_DIVIDA.find(t=>t[0]===d.tipo)||TIPOS_DIVIDA[5])[1];
const dividasAtivas = () => (S.dividas||[]).filter(d => d.saldo > 0.009);
// Meses para quitar uma dívida pagando só a parcela. Infinity = a parcela não cobre os juros.
function prazoDivida(d){
  const i = (d.juros||0)/100, S0 = d.saldo, P = d.parcela;
  if (S0 <= 0.009) return 0;
  if (!P) return Infinity;
  if (!i) return Math.ceil(S0 / P);
  if (P <= S0 * i) return Infinity;
  return Math.ceil(-Math.log(1 - i*S0/P) / Math.log(1+i));
}
function jurosFuturos(d){ const n = prazoDivida(d); return isFinite(n) ? Math.max(0, n*d.parcela - d.saldo) : Infinity; }
const mesTxtCurto = (n) => { const q = somaMeses(hoje.getFullYear(), hoje.getMonth(), n); return MES_CURTO[q.m] + '/' + q.y; };
// Simula o pagamento de todas as dívidas, mês a mês, com um valor extra e "efeito bola de neve"
// (quando uma dívida termina, a parcela dela passa a reforçar a próxima).
function simularQuitacao(extra, metodo){
  const ds = dividasAtivas().map(d => ({ id:d.id, nome:d.nome, s:d.saldo, i:(d.juros||0)/100, p:d.parcela||0 }));
  let mes = 0, juros = 0;
  while (ds.some(d=>d.s>0.009) && mes < 600){
    mes++;
    ds.forEach(d => { if (d.s > 0.009){ const j = d.s*d.i; juros += j; d.s += j; } });
    let sobra = extra;
    ds.forEach(d => { if (d.s > 0.009){ const pg = Math.min(d.p, d.s); d.s -= pg; sobra += d.p - pg; } else sobra += d.p; });
    const ordem = ds.filter(d=>d.s>0.009).sort(metodo==='avalanche' ? (a,b)=>(b.i-a.i)||(a.s-b.s) : (a,b)=>a.s-b.s);
    for (const d of ordem){ if (sobra <= 0) break; const pg = Math.min(sobra, d.s); d.s -= pg; sobra -= pg; }
    ds.forEach(d => { if (d.s <= 0.009 && !d.fim) d.fim = mes; });
  }
  return { meses: mes, juros, impossivel: mes >= 600, ordem: [...ds].sort((a,b)=>(a.fim||999)-(b.fim||999)) };
}
function cardDividas(){
  const ds = dividasAtivas(), quitadas = (S.dividas||[]).filter(d=>d.saldo<=0.009);
  let h = `<section class="card" id="cardDividas"><h3>💸 Dívidas</h3>`;
  if (!ds.length) return h + `${quitadas.length?`<p class="note" style="margin:0 0 10px">🎉 ${quitadas.length} dívida${quitadas.length>1?'s':''} quitada${quitadas.length>1?'s':''}. Você está livre!</p>`:'<p class="note" style="margin:0 0 12px">Cadastre empréstimos, financiamentos ou o rotativo do cartão para ver quando cada um termina e o melhor jeito de quitar.</p>'}<button class="btn sec" data-act="novaDivida">+ Adicionar dívida</button></section>`;
  const total = soma(ds, d=>d.saldo), parcelas = soma(ds, d=>d.parcela||0), base = simularQuitacao(0, 'avalanche');
  h += `<div class="assin-tot"><div><b class="num">${brl(total)}</b><span>devendo no total</span></div><div><b class="num">${brl(parcelas)}</b><span>de parcelas por mês</span></div></div>
    <p class="note" style="margin:0 0 10px">${base.impossivel ? '⚠️ Com as parcelas atuais, alguma dívida nunca termina (a parcela não cobre os juros).' : `Mantendo ${brl(parcelas)} por mês para as dívidas (quando uma termina, o valor dela reforça a próxima), você fica livre em <b>${mesTxtCurto(base.meses)}</b>.`}</p>`;
  ds.forEach(d => {
    const n = prazoDivida(d), pago = d.inicial ? Math.max(0, Math.min(100, (1 - d.saldo/d.inicial)*100)) : 0;
    h += `<button class="cartao" data-divida="${d.id}"><span class="row"><b>${emojiDivida(d)} ${esc(d.nome)}</b><b class="num">${brl(d.saldo)}</b></span>
      <span class="row"><span class="muted">${d.juros?`${String(d.juros).replace('.',',')}% ao mês`:'sem juros'} · ${brl(d.parcela||0)}/mês</span><span class="muted">${isFinite(n)?`termina ${mesTxtCurto(n)}`:'<b style="color:var(--bad)">não diminui</b>'}</span></span>
      ${d.inicial?`<span class="bar"><span style="width:${pago}%"></span></span><span class="foot"><span>${pago.toFixed(0)}% pago</span><span>${isFinite(n)?`juros a pagar ~${brl0(jurosFuturos(d))}`:''}</span></span>`:''}</button>`;
  });
  return h + `<div class="row2"><button class="btn pri" data-act="planoQuitacao">Plano de quitação</button><button class="btn sec" data-act="novaDivida">+ Adicionar</button></div></section>`;
}
function editarDivida(id){
  const d = id ? (S.dividas||[]).find(x=>x.id===id) : { nome:'', tipo:'emprestimo', saldo:0, juros:'', parcela:0, venc:'' };
  form = { tipo:'divida', id, v:{ tipo:d.tipo, jurosAno:false } };
  abrir(`<h2>${id?'Editar':'Nova'} dívida</h2>
    <div class="f"><label>Tipo</label><div class="chips" data-chips="tipoDiv">${TIPOS_DIVIDA.map(([v,e,l])=>`<button type="button" class="${v===d.tipo?'on':''}" data-v="${v}">${e} ${l}</button>`).join('')}</div></div>
    <div class="f"><label>Nome</label><input id="dNome" placeholder="Ex.: Empréstimo Caixa, Financiamento do carro" value="${esc(d.nome)}"></div>
    <div class="f"><label>Quanto você deve hoje (saldo devedor)</label><input class="num money" id="dSaldo" inputmode="decimal" placeholder="0,00" value="${d.saldo?moneyVal(d.saldo):''}"></div>
    <div class="row2"><div class="f"><label>Valor da parcela</label><input class="num" id="dParc" inputmode="decimal" placeholder="0,00" value="${d.parcela?moneyVal(d.parcela):''}"></div>
    <div class="f"><label>Vence dia (opcional)</label><input class="num" id="dVenc" inputmode="numeric" placeholder="Ex.: 15" value="${d.venc||''}"></div></div>
    <div class="f"><label>Juros (opcional)</label><div class="inline"><input class="num" id="dJuros" inputmode="text" placeholder="Ex.: 2,5" value="${d.juros?String(d.juros).replace('.',','):''}"><div class="chips" data-chips="jurosAno"><button type="button" class="on" data-v="mes">% ao mês</button><button type="button" data-v="ano">% ao ano</button></div></div></div>
    <p class="note" style="margin:-4px 0 12px">O saldo devedor e os juros aparecem no app do banco ou no contrato. Atualize o saldo de vez em quando para a previsão ficar certa.</p>
    <button class="btn pri" data-act="salvarDivida">Salvar</button>${id?'<button class="btn dan" data-act="excluirDivida">Excluir dívida</button>':''}`);
}
function salvarDivida(){
  const nome = document.getElementById('dNome').value.trim(), saldo = parseValor(document.getElementById('dSaldo').value);
  if (!nome) return toast('Dê um nome para a dívida');
  if (!saldo) return toast('Informe quanto você deve hoje');
  let juros = parseFloat(String(document.getElementById('dJuros').value).replace(',','.')) || 0;
  if (form.v.jurosAno && juros) juros = Math.round((Math.pow(1 + juros/100, 1/12) - 1) * 10000) / 100;
  const dados = { nome, tipo:form.v.tipo, saldo, juros, parcela:parseValor(document.getElementById('dParc').value), venc: Math.min(31, parseInt(document.getElementById('dVenc').value)||0) || '' };
  if (form.id){ const d = S.dividas.find(x=>x.id===form.id); Object.assign(d, dados); if (!d.inicial || saldo > d.inicial) d.inicial = saldo; }
  else S.dividas.push({ id:uid(), ...dados, inicial:saldo, criada:dataHoje(), pagamentos:[] });
  salvar(); fechar(); render(); toast('Dívida salva ✓');
}
function abrirDivida(id){
  const d = S.dividas.find(x=>x.id===id); if (!d) return;
  const n = prazoDivida(d), i = (d.juros||0)/100;
  abrir(`<h2>${emojiDivida(d)} ${esc(d.nome)}</h2>
    <div class="kpis"><div><span>Saldo devedor</span><b class="num">${brl(d.saldo)}</b></div><div><span>Parcela</span><b class="num">${brl(d.parcela||0)}</b></div><div><span>Juros</span><b>${d.juros?String(d.juros).replace('.',',')+'% a.m.':'—'}</b></div></div>
    ${d.saldo<=0.009 ? '<p class="gprev ok">🎉 Dívida quitada!</p>' : !isFinite(n) ? `<div class="alert crit"><span>⚠️</span><div><b>Esta dívida não diminui.</b> Os juros do mês (${brl(d.saldo*i)}) são maiores que a parcela. Priorize pagar mais nela ou renegociar.</div></div>`
      : `<p class="sim-txt">Pagando ${brl(d.parcela)} por mês, termina em <b>${mesTxtCurto(n)}</b> (${n} ${n===1?'mês':'meses'}).${d.juros?` Você ainda vai pagar cerca de <b>${brl0(jurosFuturos(d))}</b> de juros.`:''}</p>`}
    ${d.saldo>0.009?`<button class="btn pri" data-act="pagarDivida" data-divida-id="${d.id}">Registrar pagamento</button>`:''}
    ${(d.pagamentos||[]).length?`<h4 class="sub-h">Pagamentos</h4><div class="list flat">${[...d.pagamentos].reverse().slice(0,24).map(p=>`<div class="item"><div class="tx"><div class="t1">${p.extra?'Pagamento extra':'Parcela'}</div><div class="t2">${fmtData(p.data)}/${p.data.slice(2,4)}</div></div><div class="val num">${brl(p.valor)}</div></div>`).join('')}</div>`:''}
    <button class="btn sec" data-act="editarDivida" data-divida-id="${d.id}" style="margin-top:12px">Editar dívida</button>`);
}
function pagarDivida(id){
  const d = S.dividas.find(x=>x.id===id);
  form = { tipo:'pagamentoDivida', id, v:{ extra:false, lancar:true } };
  abrir(`<h2>Pagamento · ${esc(d.nome)}</h2>
    <div class="f"><label>Valor pago</label><input class="money num" id="pValor" inputmode="decimal" value="${moneyVal(Math.min(d.parcela||d.saldo, d.saldo*(1+(d.juros||0)/100)))}"></div>
    <div class="f"><label>Data</label><input type="date" id="pData" value="${dataHoje()}"></div>
    <div class="switch f"><span>Pagamento extra <small class="muted">(adiantamento/amortização, sem juros do mês)</small></span><button type="button" class="tg" data-act="tgExtra"></button></div>
    <div class="switch f"><span>Lançar também como gasto do mês</span><button type="button" class="tg on" data-act="tgLancar"></button></div>
    <button class="btn pri" data-act="confirmarPagamento">Registrar</button>`);
}
function confirmarPagamento(){
  const d = S.dividas.find(x=>x.id===form.id), valor = parseValor(document.getElementById('pValor').value), data = document.getElementById('pData').value || dataHoje();
  if (!valor) return toast('Informe o valor');
  // parcela normal: incide o juros do mês e depois abate; pagamento extra: abate direto
  const novo = form.v.extra ? d.saldo - valor : d.saldo * (1 + (d.juros||0)/100) - valor;
  d.saldo = Math.max(0, Math.round(novo*100)/100);
  (d.pagamentos = d.pagamentos || []).push({ data, valor, extra:form.v.extra });
  if (form.v.lancar){ const o = ymDe(data.slice(0,7)), M = mes(o.y,o.m,true);
    M.gastos.push({ id:uid(), cat:'🧾 Parcela', desc:(form.v.extra?'Pagamento extra · ':'Parcela · ') + d.nome, valor, forma:'Pix / Dinheiro', data, essencial:true, parcelas:1 });
    S.novosDesdeBackup = (S.novosDesdeBackup||0) + 1; registrarDiaAtivo(); }
  salvar(); fechar(); render();
  if (d.saldo <= 0.009){ d.quitadaEm = data; salvar(); toast(`🎉 Dívida quitada: ${d.nome}! Parabéns!`); } else toast('Pagamento registrado ✓');
  checarConquistas();
}
function abrirPlanoQuitacao(){
  form = { tipo:'plano', v:{ metodo:'avalanche' } };
  abrir(`<h2>📋 Plano de quitação</h2>
    <div class="f"><label>Qual estratégia?</label><div class="chips" data-chips="metodo"><button type="button" class="on" data-v="avalanche">🏔️ Avalanche</button><button type="button" data-v="bola">⛄ Bola de neve</button></div>
      <p class="note" id="pMetodoTxt"></p></div>
    <div class="f"><label>Quanto você consegue pagar a mais por mês? (opcional)</label><input class="num money" id="pExtra" inputmode="decimal" placeholder="0,00"></div>
    <div id="pResultado"></div>`);
  desenharPlano();
}
function desenharPlano(){
  const box = document.getElementById('pResultado'); if (!box) return;
  document.getElementById('pMetodoTxt').innerHTML = form.v.metodo==='avalanche' ? 'Paga primeiro a dívida com <b>maior juros</b>. É a que mais economiza dinheiro.' : 'Paga primeiro a <b>menor dívida</b>. Você quita uma rápido, e isso motiva a continuar.';
  const extra = parseValor(document.getElementById('pExtra').value), base = simularQuitacao(0, form.v.metodo), plano = simularQuitacao(extra, form.v.metodo);
  let h = '';
  if (plano.impossivel) h += `<div class="alert crit"><span>⚠️</span><div>Com esses valores, as dívidas não terminam: os juros crescem mais rápido que os pagamentos. Aumente o valor extra ou renegocie as dívidas com juros mais altos.</div></div>`;
  else {
    if (extra > 0 && !base.impossivel){
      const ganhoMeses = base.meses - plano.meses, ganhoJuros = base.juros - plano.juros;
      h += `<div class="sim-veredito sim"><span>🚀</span><b>Livre ${ganhoMeses} ${ganhoMeses===1?'mês':'meses'} antes${ganhoJuros>1?` e ${brl0(ganhoJuros)} a menos de juros`:''}</b></div>`;
    }
    h += `<p class="sim-txt">${extra>0?`Pagando ${brl(extra)} a mais por mês`:'Pagando só as parcelas'} e usando o valor das dívidas que terminam para reforçar as próximas, você fica <b>livre das dívidas em ${mesTxtCurto(plano.meses)}</b>. Juros no caminho: ~${brl0(plano.juros)}.</p>
      <h4 class="sub-h">Ordem para quitar</h4><div class="sim-meses">${plano.ordem.map((d,i)=>`<div><span>${i+1}. ${esc(d.nome)}</span><span>${d.fim?`quitada em <b>${mesTxtCurto(d.fim)}</b>`:'—'}</span></div>`).join('')}</div>`;
  }
  box.innerHTML = h;
}

/* ---------- etiquetas ----------
   Gastos com tags: [] (ex.: "Viagem Praia 2026"). Etiqueta ativa = aplicada a todo gasto novo. */
const normTag = (t) => String(t||'').replace(/^#/,'').trim().replace(/\s+/g,' ').slice(0,30);
const tagsDe = (txt) => [...new Set(String(txt||'').split(',').map(normTag).filter(Boolean))];
function todasEtiquetas(){
  const m = {};
  Object.entries(S.meses).forEach(([k,M]) => M.gastos.forEach(g => (g.tags||[]).forEach(t => {
    const v = (+g.valor) * (g.minha!=null && g.valor ? g.minha/g.valor : 1);
    const x = m[t] = m[t] || { nome:t, total:0, n:0, de:null, ate:null, itens:[] };
    x.total += v; x.n++; const d = g.data || k+'-01'; if (!x.de || d < x.de) x.de = d; if (!x.ate || d > x.ate) x.ate = d; x.itens.push({ g, k, v });
  })));
  return Object.values(m).sort((a,b) => (b.ate||'').localeCompare(a.ate||''));
}
function cardEtiquetas(){
  const ts = todasEtiquetas();
  let h = `<section class="card" id="cardEtiquetas"><h3>🏷️ Etiquetas</h3>`;
  if (!ts.length) return h + `<p class="note" style="margin:0">Marque gastos de um mesmo evento com uma etiqueta (ex.: “Viagem Praia”, “Reforma”) e veja quanto custou no total. Ao lançar um gasto, abra “Descrição, data e essencial”, ou escreva <b>#viagem</b> no lançamento por frase.</p></section>`;
  ts.forEach(x => { h += `<button class="cartao" data-etiqueta="${esc(x.nome)}"><span class="row"><b>🏷️ ${esc(x.nome)}${S.tagAtiva===x.nome?' <span class="tag auto">ativa</span>':''}</b><b class="num">${brl(x.total)}</b></span>
    <span class="row"><span class="muted">${x.n} gasto${x.n>1?'s':''} · ${fmtData(x.de)}${x.de!==x.ate?' a '+fmtData(x.ate):''}</span></span></button>`; });
  return h + `</section>`;
}
function abrirEtiqueta(nome){
  const x = todasEtiquetas().find(t=>t.nome===nome); if (!x) return;
  const cats = {}; x.itens.forEach(i => cats[i.g.cat] = (cats[i.g.cat]||0) + i.v);
  const cs = Object.entries(cats).sort((a,b)=>b[1]-a[1]), max = cs[0][1];
  abrir(`<h2>🏷️ ${esc(nome)}</h2>
    <div class="kpis"><div><span>Total</span><b class="num">${brl(x.total)}</b></div><div><span>Gastos</span><b>${x.n}</b></div><div><span>Período</span><b>${fmtData(x.de)}${x.de!==x.ate?' – '+fmtData(x.ate):''}</b></div></div>
    <div class="hbars" style="margin:6px 0 12px">${cs.map(([c,v])=>`<div class="hb" style="cursor:default"><span class="hb-l"><span class="hb-e">${emojiCat(c)}</span>${esc(nomeCat(c))}</span><span class="hb-v num">${brl(v)} <small>${(v/x.total*100).toFixed(0)}%</small></span><span class="hb-t"><span style="width:${Math.max(v/max*100,2)}%"></span></span></div>`).join('')}</div>
    <button class="btn ${S.tagAtiva===nome?'sec':'pri'}" data-act="tagAtiva" data-tag="${esc(nome)}">${S.tagAtiva===nome?'⏹ Parar de marcar gastos novos':'▶️ Marcar todos os gastos novos com esta etiqueta'}</button>
    <h4 class="sub-h">Lançamentos</h4>
    <div class="list flat">${x.itens.sort((a,b)=>(b.g.data||b.k).localeCompare(a.g.data||a.k)).map(i=>`<button class="item" data-edit="gastos" data-id="${i.g.id}" data-mk="${i.k}"><div class="ic">${emojiCat(i.g.cat)}</div><div class="tx"><div class="t1">${esc(i.g.desc||nomeCat(i.g.cat))}</div><div class="t2">${i.g.data?fmtData(i.g.data)+'/'+i.g.data.slice(2,4):''}</div></div><div class="val num">${brl(i.v)}</div></button>`).join('')}</div>
    <div class="row2" style="margin-top:12px"><button class="btn sec" data-act="renomearTag" data-tag="${esc(nome)}">Renomear</button><button class="btn dan" data-act="removerTag" data-tag="${esc(nome)}">Remover etiqueta</button></div>`);
}
function cardTagAtiva(){
  if (!S.tagAtiva || key(cur.y,cur.m) !== chaveHoje()) return '';
  return `<div class="alert info"><span>🏷️</span><div>Os gastos novos estão sendo marcados com <b>${esc(S.tagAtiva)}</b>. <button class="d-acao" style="display:inline;margin:0 0 0 4px" data-act="tagAtiva" data-tag="${esc(S.tagAtiva)}">Parar</button></div></div>`;
}
function tagsUsadas(){ return todasEtiquetas().slice(0,6).map(t=>t.nome); }

/* ---------- me devem / dividir contas ----------
   aReceber: { id, pessoa, desc, valor, data, recebido, recebidoEm, gastoId, mk } */
const pendentes = () => (S.aReceber||[]).filter(r=>!r.recebido);
function pessoasFrequentes(){
  const c = {}; (S.aReceber||[]).forEach(r => c[r.pessoa] = (c[r.pessoa]||0) + 1);
  return Object.entries(c).sort((a,b)=>b[1]-a[1]).slice(0,6).map(x=>x[0]);
}
const nomesDe = (txt) => [...new Set(String(txt||'').split(/[,;]| e /).map(x=>x.trim()).filter(Boolean).map(x=>x.charAt(0).toUpperCase()+x.slice(1)))];
function cardMeDevem(){
  const pend = pendentes();
  let h = `<section class="card" id="cardMeDevem"><h3>🤝 Me devem</h3>`;
  if (!pend.length) return h + `<p class="note" style="margin:0 0 12px">Ninguém te deve nada agora. Ao lançar um gasto, use “Dividir este gasto” para registrar a parte de cada um.</p><button class="btn sec" data-act="novoAReceber">+ Alguém me deve</button></section>`;
  const porPessoa = {}; pend.forEach(r => (porPessoa[r.pessoa] = porPessoa[r.pessoa] || []).push(r));
  h += `<div class="assin-tot" style="grid-template-columns:1fr"><div><b class="num">${brl(soma(pend, r=>r.valor))}</b><span>para receber de ${Object.keys(porPessoa).length} pessoa${Object.keys(porPessoa).length>1?'s':''}</span></div></div>`;
  Object.entries(porPessoa).sort((a,b)=>soma(b[1],r=>r.valor)-soma(a[1],r=>r.valor)).forEach(([p, rs]) => {
    const desde = rs.map(r=>r.data).sort()[0];
    h += `<button class="cartao" data-pessoa="${esc(p)}"><span class="row"><b>👤 ${esc(p)}</b><b class="num">${brl(soma(rs, r=>r.valor))}</b></span>
      <span class="row"><span class="muted">${rs.length} ${rs.length>1?'itens':'item'} · desde ${fmtData(desde)}</span><span class="muted">${diasDesde(desde)>14?`⏰ há ${diasDesde(desde)} dias`:''}</span></span></button>`;
  });
  return h + `<button class="btn sec" data-act="novoAReceber">+ Alguém me deve</button></section>`;
}
function abrirPessoa(p){
  const pend = pendentes().filter(r=>r.pessoa===p), recebidos = (S.aReceber||[]).filter(r=>r.pessoa===p && r.recebido).slice(-10).reverse();
  abrir(`<h2>👤 ${esc(p)}</h2>
    ${pend.length ? `<p class="sim-txt">Te deve <b>${brl(soma(pend, r=>r.valor))}</b>.</p>
    <div class="list flat">${pend.map(r=>`<div class="item"><button class="tx" style="text-align:left" data-act="editarReceber" data-id="${r.id}"><div class="t1">${esc(r.desc)} <small class="muted">✏️</small></div><div class="t2">${fmtData(r.data)}${r.gastoId?' · gasto dividido':''}</div></button><div class="val num">${brl(r.valor)}</div><button class="btn sec mini" data-act="receber" data-ids="${r.id}">Recebi</button><button class="tirar-rec" data-act="excluirReceber" data-id="${r.id}" aria-label="Excluir">🗑️</button></div>`).join('')}</div>
    <div class="switch f" style="margin-top:12px"><span>Lançar como entrada ao receber</span><button type="button" class="tg ${S.lancarRecebidos!==false?'on':''}" data-act="tgLancarRec"></button></div>
    <div class="row2"><button class="btn pri" data-act="receber" data-ids="${pend.map(r=>r.id).join(',')}">Recebi tudo</button><button class="btn sec" data-act="cobrar" data-pessoa-nome="${esc(p)}">📲 Cobrar</button></div>
    <button class="btn sec" data-act="receberParteAbrir" style="margin-top:10px">Recebi uma parte</button>
    <div id="boxRecParte" hidden style="margin-top:12px"><div class="f"><label>Quanto ${esc(p)} te pagou?</label><input class="money num" id="recParte" inputmode="decimal" placeholder="0,00"></div>
      <p class="note" style="margin:-4px 0 12px">Abate primeiro o que é mais antigo. O que faltar continua pendente.</p>
      <button class="btn pri" data-act="receberParte" data-pessoa-nome="${esc(p)}">Registrar</button></div>
    <div class="f" style="margin-top:12px"><label>Sua chave Pix (vai na mensagem de cobrança)</label><input id="chavePix" placeholder="Opcional: CPF, celular, e-mail…" value="${esc(S.chavePix||'')}" autocomplete="off"></div>` : '<p class="gprev ok">Nada pendente com esta pessoa. 🎉</p>'}
    ${recebidos.length ? `<h4 class="sub-h">Já recebidos</h4><div class="list flat">${recebidos.map(r=>`<div class="item"><div class="tx"><div class="t1">${esc(r.desc)}</div><div class="t2">recebido em ${fmtData(r.recebidoEm)}</div></div><div class="val num up">${brl(r.valor)}</div></div>`).join('')}</div>` : ''}`);
}
function receber(ids){
  const rs = (S.aReceber||[]).filter(r => ids.includes(r.id) && !r.recebido); if (!rs.length) return;
  const hojeTxt = dataHoje(), total = soma(rs, r=>r.valor), p = rs[0].pessoa;
  rs.forEach(r => { r.recebido = true; r.recebidoEm = hojeTxt; });
  if (S.lancarRecebidos !== false){ const M = mes(hoje.getFullYear(), hoje.getMonth(), true); M.entradas.push({ id:uid(), nome:`Recebido de ${p}`, valor:Math.round(total*100)/100, data:hojeTxt, reembolso:true }); }
  salvar(); render(); abrirPessoa(p); toast(`Recebido ${brl(total)} de ${p} ✓`);
}
// Recebimento parcial: abate das pendências mais antigas; a que for paga só em parte é dividida em duas
// (a parte recebida vai para o histórico e o resto continua pendente).
function receberParte(p, valor){
  const pend = pendentes().filter(r => r.pessoa === p).sort((a,b) => String(a.data||'').localeCompare(String(b.data||'')));
  const total = soma(pend, r => r.valor);
  if (!(valor > 0)) return toast('Digite quanto você recebeu');
  if (valor > total + 0.004) return toast(`${p} te deve ${brl(total)}. Use "Recebi tudo".`);
  const hojeTxt = dataHoje(); let resto = valor;
  for (const r of pend){
    if (resto <= 0.004) break;
    if (resto >= r.valor - 0.004){ r.recebido = true; r.recebidoEm = hojeTxt; resto = Math.round((resto - r.valor) * 100) / 100; }
    else { S.aReceber.push({ ...r, id:uid(), desc:r.desc + ' (parte)', valor:resto, recebido:true, recebidoEm:hojeTxt, parteDe:r.id }); r.valor = Math.round((r.valor - resto) * 100) / 100; resto = 0; }
  }
  if (S.lancarRecebidos !== false){ const M = mes(hoje.getFullYear(), hoje.getMonth(), true); M.entradas.push({ id:uid(), nome:`Recebido de ${p}`, valor:Math.round(valor*100)/100, data:hojeTxt, reembolso:true }); }
  salvar(); render(); abrirPessoa(p); toast(`Recebido ${brl(valor)} de ${p} ✓`);
}
// Com mais de um item pendente, deixa escolher quais entram na mensagem de cobrança.
function abrirCobrar(p){
  const pend = pendentes().filter(r => r.pessoa === p);
  if (pend.length < 2) return cobrar(p);
  abrir(`<h2>📲 Cobrar ${esc(p)}</h2>
    <p class="note" style="margin:-6px 0 12px">Marque o que vai entrar na mensagem.</p>
    <div class="list flat">${pend.map(r => `<label class="item cobrar-item"><input type="checkbox" checked data-cobrar="${r.id}"><div class="tx"><div class="t1">${esc(r.desc)}</div><div class="t2">${fmtData(r.data)}</div></div><div class="val num">${brl(r.valor)}</div></label>`).join('')}</div>
    <p class="sim-txt" id="cobrarTotal" style="margin:12px 0"></p>
    <button class="btn pri" data-act="cobrarEnviar" data-pessoa-nome="${esc(p)}">Enviar cobrança</button>
    <button class="btn sec" data-act="voltarPessoa" data-pessoa-nome="${esc(p)}">Voltar</button>`);
  totalCobrar();
}
function totalCobrar(){
  const el = document.getElementById('cobrarTotal'); if (!el) return;
  const ids = [...document.querySelectorAll('[data-cobrar]:checked')].map(c => c.dataset.cobrar);
  el.innerHTML = ids.length ? `Total da cobrança: <b>${brl(soma((S.aReceber||[]).filter(r => ids.includes(r.id)), r => r.valor))}</b>` : 'Marque pelo menos um item.';
}
function cobrar(p, ids){
  const pend = pendentes().filter(r=>r.pessoa===p && (!ids || ids.includes(r.id))), total = soma(pend, r=>r.valor);
  if (!pend.length) return toast('Marque pelo menos um item');
  const itens = pend.map(r=>`• ${r.desc} (${fmtData(r.data)}): R$ ${r.valor.toLocaleString('pt-BR',{minimumFractionDigits:2})}`).join('\n');
  const msg = `Oi ${p}! Passando para lembrar ${pend.length>1?'destes valores':'deste valor'}:\n${itens}\nTotal: R$ ${total.toLocaleString('pt-BR',{minimumFractionDigits:2})}${S.chavePix?`\n\nMinha chave Pix: ${S.chavePix}`:''}\n\nObrigado! 😊`;
  if (navigator.share) navigator.share({ text: msg }).catch(()=>{});
  else navigator.clipboard.writeText(msg).then(()=>toast('Mensagem copiada. Cole no WhatsApp.')).catch(()=>toast('Não foi possível copiar.'));
}
function novoAReceber(id){
  const r = id ? (S.aReceber||[]).find(x => x.id === id) : null;
  form = { tipo:'aReceber', id: r ? r.id : null, v:{ emprestei:!r } };
  const freq = pessoasFrequentes();
  abrir(`<h2>${r ? '✏️ Editar' : '🤝 Alguém me deve'}</h2>
    <div class="f"><label>Quem?</label><input id="rPessoa" placeholder="Nome" autocomplete="off" value="${r ? esc(r.pessoa) : ''}">${freq.length?`<div class="chips pessoas" style="margin-top:8px">${freq.map(x=>`<button type="button" data-setpessoa="${esc(x)}">${esc(x)}</button>`).join('')}</div>`:''}</div>
    <div class="f"><label>Quanto</label><input class="money num" id="rValor" inputmode="decimal" placeholder="0,00" value="${r ? moneyVal(r.valor) : ''}"></div>
    <div class="row2"><div class="f"><label>Do quê?</label><input id="rDesc" placeholder="Ex.: Empréstimo, ingresso" value="${r ? esc(r.desc) : ''}"></div>
    <div class="f"><label>Data</label><input type="date" id="rData" value="${r ? r.data || '' : dataPadrao()}"></div></div>
    ${r ? '' : `<div class="switch f"><span>Emprestei dinheiro <small class="muted">(saiu do meu saldo agora)</small></span><button type="button" class="tg on" data-act="tgEmprestei"></button></div>`}
    <button class="btn pri" data-act="salvarAReceber">${r ? 'Salvar alterações' : 'Salvar'}</button>
    ${r ? `<button class="btn sec" data-act="voltarPessoa" data-pessoa-nome="${esc(r.pessoa)}">Voltar</button>` : ''}`);
}
function salvarAReceber(){
  const pessoa = nomesDe(document.getElementById('rPessoa').value)[0], valor = parseValor(document.getElementById('rValor').value);
  if (!pessoa) return toast('Quem te deve?'); if (!valor) return toast('Informe o valor');
  const desc = document.getElementById('rDesc').value.trim() || 'Empréstimo', data = document.getElementById('rData').value || dataHoje();
  if (form.id){   // edição: atualiza a pendência e, se veio de "Emprestei dinheiro", o gasto ligado a ela
    const r = S.aReceber.find(x => x.id === form.id); if (!r) return fechar();
    Object.assign(r, { pessoa, desc, valor, data });
    const Mg = r.gastoId && r.mk && S.meses[r.mk], g = Mg && Mg.gastos.find(x => x.id === r.gastoId);
    if (g && g.minha === 0){
      Object.assign(g, { valor, desc:`Emprestado para ${pessoa}`, data });
      const nk = data.slice(0,7);
      if (nk !== r.mk){ Mg.gastos.splice(Mg.gastos.indexOf(g), 1); const o = ymDe(nk); mes(o.y,o.m,true).gastos.push(g); r.mk = nk; }
    }
    salvar(); render(); abrirPessoa(pessoa); return toast('Alterado ✓');
  }
  const r = { id:uid(), pessoa, desc, valor, data, recebido:false };
  if (form.v.emprestei){   // sai do saldo, mas não é gasto seu (sua parte = 0)
    const o = ymDe(data.slice(0,7)), M = mes(o.y,o.m,true), g = { id:uid(), cat:'❓ Outros', desc:`Emprestado para ${pessoa}`, valor, minha:0, forma:'Pix / Dinheiro', data, essencial:false, parcelas:1 };
    M.gastos.push(g); r.gastoId = g.id; r.mk = key(o.y,o.m);
  }
  S.aReceber.push(r); salvar(); fechar(); render(); toast(`${pessoa} te deve ${brl(valor)} ✓`);
}
// Depois de salvar um gasto dividido: cria o que cada pessoa deve.
function criarDivisao(g, mk){
  const n = g.dividido.length, cada = Math.round((g.valor - g.minha) / n * 100) / 100;
  g.dividido.forEach(p => S.aReceber.push({ id:uid(), pessoa:p, desc:g.desc || nomeCat(g.cat), valor:cada, data:g.data || dataHoje(), recebido:false, gastoId:g.id, mk }));
}
function infoDivisao(){
  const el = document.getElementById('divInfo'); if (!el) return;
  const ps = nomesDe(document.getElementById('fPessoas').value), v = parseValor(document.getElementById('fValor').value);
  el.innerHTML = ps.length && v ? `Cada um paga <b>${brl(v/(ps.length+1))}</b> (${ps.length+1} pessoas, contando você). Você vai receber <b>${brl(v - v/(ps.length+1))}</b> de volta.` : 'Escreva os nomes separados por vírgula.';
}

function cardCartoes(){
  const cs = S.cartoes || [];
  let h = `<section class="card" id="cardCartoes"><h3>💳 Cartões de crédito</h3>`;
  if (!cs.length) return h + `<p class="note" style="margin:0 0 12px">Cadastre seus cartões com o dia de fechamento e de vencimento. Assim cada compra cai na fatura certa.</p><button class="btn sec" data-act="novoCartao">+ Adicionar cartão</button></section>`;
  const kh = chaveHoje();
  cs.forEach(c => {
    const prox = Object.keys(faturas()).filter(k => k >= kh && faturas()[k].some(x=>x.cartao===c.id)).sort()[0];
    const valorProx = prox ? soma(faturas()[prox].filter(x=>x.cartao===c.id), x=>x.valor) : 0;
    const usado = limiteUsado(c.id), pct = c.limite ? Math.min(100, usado/c.limite*100) : 0;
    h += `<button class="cartao" data-cartao="${c.id}"><span class="row"><b>💳 ${esc(c.nome)}</b><span class="muted">fecha dia ${c.fechamento} · vence dia ${c.vencimento}</span></span>
      <span class="row"><span>${prox ? `Próxima fatura <small>(vence ${fmtData(vencFatura(c, ymDe(prox).y, ymDe(prox).m))})</small>` : 'Nenhuma fatura em aberto'}</span><b class="num">${brl(valorProx)}</b></span>
      ${c.limite ? `<span class="bar"><span style="width:${pct}%"></span></span><span class="foot"><span>Limite usado ${brl(usado)}</span><span>Disponível ${brl(Math.max(0,c.limite-usado))}</span></span>` : ''}</button>`;
  });
  return h + `<button class="btn sec" data-act="novoCartao">+ Adicionar cartão</button></section>`;
}
function abrirFatura(cid){
  const c = cartaoPorId(cid), f = faturasPorCartao(cur.y,cur.m).find(x => x.cartao && x.cartao.id === cid); if (!c || !f) return;
  const st = statusFatura(cid, cur.y, cur.m), parcial = st && st.pago < f.valor - 0.004;
  // Data sugerida: hoje, ou o vencimento se ele já passou (quem marca atrasado normalmente pagou no vencimento)
  const venc = vencFatura(c, cur.y, cur.m), sugerida = dataHoje() > venc ? venc : dataHoje();
  const campoData = (v) => `<div class="f"><label>Data do pagamento</label><input type="date" id="fatData" value="${v}"></div>`;
  abrir(`<h2>💳 Fatura ${esc(c.nome)}</h2>
    <p class="sim-txt">${MESES[cur.m]} · vence dia ${c.vencimento} · <b>${brl(f.valor)}</b></p>
    ${st ? `<p class="gprev ok">${parcial ? `Você pagou <b>${brl(st.pago)}</b>. O restante (${brl(f.valor - st.pago)}) virou uma dívida de rotativo em Planejar → Dívidas.` : `✓ Fatura paga${st.em ? ' em ' + fmtData(st.em) : ''}.`}</p>
      ${campoData(st.em || sugerida)}
      <button class="btn sec" data-act="fatSalvarData" data-c="${cid}">Salvar data</button>
      <button class="btn sec" data-act="fatDesfazer" data-c="${cid}">Desfazer</button>`
    : `${campoData(sugerida)}
      <button class="btn pri" data-act="fatPagar" data-c="${cid}">✓ Marcar como paga</button>
      <button class="btn sec" data-act="fatParcialAbrir">Paguei só uma parte</button>
      <div id="boxFatParcial" hidden style="margin-top:12px">
        <div class="f"><label>Quanto você pagou?</label><input class="money num" id="fatPago" inputmode="decimal" placeholder="0,00"></div>
        <p class="note" style="margin:-4px 0 12px">O que faltar vira uma dívida de <b>rotativo do cartão</b> em Planejar → Dívidas. O rotativo costuma ter juros muito altos: tente quitar o quanto antes ou parcelar a fatura com o banco.</p>
        <button class="btn pri" data-act="fatParcial" data-c="${cid}">Registrar pagamento parcial</button></div>`}
    ${listaCompraFatura(cid)}`);
}
// Compras que formam a fatura deste mês: dá para conferir com a fatura do banco e tocar para editar, excluir ou trocar o cartão.
function listaCompraFatura(cid){
  const xs = faturasDoMes(cur.y,cur.m).filter(x => x.cartao === cid).sort((a,b) => String(b.g.data||'').localeCompare(String(a.g.data||'')));
  if (!xs.length) return '';
  return `<h4 class="sub-h">🧾 Compras nesta fatura (${xs.length})</h4>
    <div class="list flat">${xs.map(x => `<button class="item" data-edit="gastos" data-id="${x.g.id}" data-mk="${x.origem}"><div class="ic">${emojiCat(x.g.cat)}</div>
      <div class="tx"><div class="t1">${esc(x.g.desc || nomeCat(x.g.cat))}</div><div class="t2">${x.g.data ? fmtData(x.g.data) : ''}${x.n > 1 ? ` · <span class="tag cr">parcela ${x.i+1}/${x.n}</span>` : ''}</div></div>
      <div class="val num">${brl(x.valor)}</div></button>`).join('')}</div>
    <p class="note">Toque numa compra para corrigir o valor, trocar o cartão ou excluir.</p>`;
}
function pagarFatura(cid, valorPago, data){
  const c = cartaoPorId(cid), f = faturasPorCartao(cur.y,cur.m).find(x => x.cartao && x.cartao.id === cid); if (!c || !f) return;
  S.faturasPagas = S.faturasPagas || {};
  const reg = { pago: Math.min(valorPago ?? f.valor, f.valor), em: data || dataHoje() }, resto = Math.round((f.valor - reg.pago) * 100) / 100;
  if (resto > 0.004){
    const d = { id:uid(), nome:`Saldo da fatura ${c.nome} (${MES_CURTO[cur.m]}/${String(cur.y).slice(2)})`, tipo:'rotativo', saldo:resto, juros:0, parcela:0,
      venc:c.vencimento, inicial:resto, criada:reg.em, pagamentos:[], fatura:fatKey(cid, cur.y, cur.m) };
    S.dividas = S.dividas || []; S.dividas.push(d); reg.divida = d.id;
  }
  S.faturasPagas[fatKey(cid, cur.y, cur.m)] = reg; salvar(); render();
  if (resto > 0.004){ abrirDivida(reg.divida); toast(`Pagamento registrado. ${brl(resto)} viraram dívida de rotativo`); }
  else { fechar(); toast('Fatura marcada como paga ✓'); }
}
function desfazerFatura(cid){
  const k = fatKey(cid, cur.y, cur.m), reg = (S.faturasPagas || {})[k]; if (!reg) return;
  const d = reg.divida && (S.dividas || []).find(x => x.id === reg.divida);
  if (d && !confirm(`Desfazer o pagamento? A dívida "${d.nome}" também será apagada.`)) return;
  if (d) S.dividas = S.dividas.filter(x => x.id !== d.id);
  delete S.faturasPagas[k]; salvar(); render(); fechar(); toast('Pagamento da fatura desfeito');
}
function editarCartao(id){
  const c = id ? cartaoPorId(id) : { nome:'', fechamento:'', vencimento:'', limite:0 };
  form = { tipo:'cartao', id, v:{} };
  abrir(`<h2>${id?'Editar':'Novo'} cartão</h2>
    <div class="f"><label>Nome</label><input id="kNome" placeholder="Ex.: Nubank, Inter, Itaú" value="${esc(c.nome)}"></div>
    <div class="row2"><div class="f"><label>Dia do fechamento</label><input class="num" id="kFech" inputmode="numeric" placeholder="Ex.: 3" value="${c.fechamento}"></div>
    <div class="f"><label>Dia do vencimento</label><input class="num" id="kVenc" inputmode="numeric" placeholder="Ex.: 10" value="${c.vencimento}"></div></div>
    <div class="f"><label>Limite (opcional)</label><input class="num" id="kLim" inputmode="decimal" placeholder="0,00" value="${c.limite?moneyVal(c.limite):''}"></div>
    <p class="note" style="margin:-4px 0 12px">O fechamento e o vencimento aparecem no app do seu banco, na tela da fatura.${id?'':' Vale para as compras lançadas a partir de agora.'}</p>
    <button class="btn pri" data-act="salvarCartao">Salvar</button>${id?'<button class="btn dan" data-act="excluirCartao">Excluir cartão</button>':''}`);
}
function salvarCartao(){
  const dia = (id) => Math.min(31, Math.max(0, parseInt(document.getElementById(id).value)||0));
  const nome = document.getElementById('kNome').value.trim(), fechamento = dia('kFech'), vencimento = dia('kVenc');
  if (!nome) return toast('Dê um nome para o cartão');
  if (!fechamento || !vencimento) return toast('Informe o dia do fechamento e do vencimento');
  const dados = { nome, fechamento, vencimento, limite: parseValor(document.getElementById('kLim').value) };
  if (form.id) Object.assign(cartaoPorId(form.id), dados); else S.cartoes.push({ id:uid(), ...dados });
  salvar(); fechar(); render(); toast('Cartão salvo ✓');
}
function excluirCartao(){
  const c = cartaoPorId(form.id);
  if (!confirm(`Excluir o cartão “${c.nome}”? As compras feitas nele continuam lançadas, sem cartão (fatura no mês seguinte).`)) return;
  Object.values(S.meses).forEach(M => M.gastos.forEach(g => { if (g.cartao === c.id) delete g.cartao; }));
  S.cartoes = S.cartoes.filter(x=>x.id!==c.id); salvar(); fechar(); render(); toast('Cartão excluído');
}
// Total de parcelas que ainda vão cair em meses futuros (renda já comprometida).
function comprometidoFuturo(){
  const kh = chaveHoje(); let t = 0;
  Object.entries(parcelas()).forEach(([k,ps]) => { if (k > kh) t += soma(ps, p=>p.valor); });
  return t;
}

/* ---------- recorrência ----------
   Ao abrir um mês novo (vazio), copia as contas fixas e as entradas marcadas
   como "repete todo mês" do mês anterior. Vale até o mês que vem. */
function aplicarRecorrentes(y,m){
  const k = key(y,m), lim = key(nextYM(hoje.getFullYear(),hoje.getMonth()).y, nextYM(hoje.getFullYear(),hoje.getMonth()).m);
  if (k > lim) return;
  const M0 = S.meses[k];
  if (M0 && (M0.auto || temDados(M0))) return;
  const p = prevYM(y,m), Mp = S.meses[key(p.y,p.m)];
  if (!Mp) return;
  const fixas = Mp.entradas.filter(e=>e.fixa);
  if (!fixas.length && !Mp.contas.length) return;
  const M = mes(y,m,true); M.auto = true;
  const dia = (d) => d ? key(y,m)+'-'+String(Math.min(+d.slice(8,10), diasNoMes(y,m))).padStart(2,'0') : '';
  fixas.forEach(e => M.entradas.push({ id:uid(), nome:e.nome, valor:e.valor, fixa:true, data:dia(e.data) }));
  Mp.contas.forEach(c => M.contas.push({ id:uid(), nome:c.nome, planejado:c.planejado||c.valor, valor:0, pago:false, data:'', venc:c.venc||'' }));
  salvar();
}

/* ---------- privacidade: senha e Face ID ----------
   Trava de privacidade local (como nos apps de banco): pede a senha ao abrir e ao voltar
   depois de 1 minuto. A senha é guardada só como hash. Face ID/digital via WebAuthn do aparelho. */
const TEMPO_TRAVA = 60e3;
let travado = false, saiuEm = 0, tentativas = 0, esperaAte = 0;
const temSenha = () => !!(S.seguranca && S.seguranca.hash);
const b64 = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf)));
const deB64 = (t) => Uint8Array.from(atob(t), c => c.charCodeAt(0));
async function hashSenha(pin, sal){
  const d = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(sal + ':' + pin));
  return [...new Uint8Array(d)].map(b=>b.toString(16).padStart(2,'0')).join('');
}
async function bioDisponivel(){
  try { return !!(window.PublicKeyCredential && await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable()); } catch(e){ return false; }
}
async function bioCadastrar(){
  const cred = await navigator.credentials.create({ publicKey: {
    challenge: crypto.getRandomValues(new Uint8Array(32)),
    rp: { name: CONFIG.nomeApp },
    user: { id: crypto.getRandomValues(new Uint8Array(16)), name: S.conta || 'usuario', displayName: S.perfil.nome || 'Você' },
    pubKeyCredParams: [{ type:'public-key', alg:-7 }, { type:'public-key', alg:-257 }],
    authenticatorSelection: { authenticatorAttachment:'platform', userVerification:'required', residentKey:'discouraged' },
    timeout: 60000 } });
  S.seguranca.bio = b64(cred.rawId); salvar();
}
async function bioVerificar(){
  await navigator.credentials.get({ publicKey: { challenge: crypto.getRandomValues(new Uint8Array(32)),
    allowCredentials: [{ type:'public-key', id: deB64(S.seguranca.bio) }], userVerification:'required', timeout:60000 } });
}
function cardPrivacidade(){
  const seg = S.seguranca || {};
  return `<section class="card"><h3>Privacidade</h3>
    <div class="switch"><span>Esconder valores <small class="muted">(também pelo 👁️ no topo)</small></span><button class="tg ${S.ocultar?'on':''}" data-act="olho" aria-label="Esconder valores"></button></div>
    <div class="switch" style="margin-top:6px"><span>Bloquear com senha</span><button class="tg ${temSenha()?'on':''}" data-act="${temSenha()?'removerSenha':'criarSenha'}" aria-label="Bloquear com senha"></button></div>
    ${temSenha() ? `<div class="switch" id="linhaBio" style="margin-top:6px" hidden><span>Destravar com Face ID / digital</span><button class="tg ${seg.bio?'on':''}" data-act="bio" aria-label="Face ID"></button></div>
      <button class="btn sec" data-act="trocarSenha" style="margin-top:10px">Trocar senha</button>` : ''}
    <p class="note">${temSenha() ? 'O app pede a senha ao abrir e quando você volta depois de 1 minuto fora.' : 'Peça uma senha de 4 dígitos para abrir o app, como nos apps de banco.'}</p></section>`;
}
// Teclado numérico para criar ou digitar a senha. modo: 'criar' | 'confirmar' | 'destravar'
let pinAtual = '', pinModo = null, pinPrimeiro = '';
function telaPin(modo, msg){
  pinModo = modo; pinAtual = '';
  let el = document.getElementById('trava');
  if (!el){ el = document.createElement('div'); el.id = 'trava'; el.setAttribute('role','dialog'); el.setAttribute('aria-modal','true'); document.body.appendChild(el); }
  const titulo = modo==='criar' ? 'Crie uma senha de 4 dígitos' : modo==='confirmar' ? 'Digite a senha de novo' : 'Digite sua senha';
  el.innerHTML = `<div class="t-in">
    <img class="logo" src="icons/icon-192.png" alt="">
    <h2>${titulo}</h2><p class="t-msg" aria-live="assertive">${msg||''}</p>
    <div class="pontos">${[0,1,2,3].map(i=>`<span data-p="${i}"></span>`).join('')}</div>
    <div class="teclado">${[1,2,3,4,5,6,7,8,9].map(n=>`<button data-pin="${n}">${n}</button>`).join('')}
      ${modo==='destravar' && S.seguranca.bio ? '<button data-pin="bio" aria-label="Face ID ou digital">🙂</button>' : '<span></span>'}
      <button data-pin="0">0</button><button data-pin="apagar" aria-label="Apagar">⌫</button></div>
    ${modo==='destravar' ? '<button class="t-link" data-pin="esqueci">Esqueci a senha</button>' : '<button class="t-link" data-pin="cancelar">Cancelar</button>'}
  </div>`;
  desenharPontos();
}
function desenharPontos(){ document.querySelectorAll('#trava .pontos span').forEach((p,i)=>p.classList.toggle('on', i < pinAtual.length)); }
function fecharTrava(){ const el = document.getElementById('trava'); if (el) el.remove(); pinModo = null; }
function errouPin(msg){
  const el = document.querySelector('#trava .pontos'); el.classList.remove('treme'); void el.offsetWidth; el.classList.add('treme');
  document.querySelector('#trava .t-msg').textContent = msg; pinAtual = ''; setTimeout(desenharPontos, 300);
}
async function digitoPin(d){
  if (Date.now() < esperaAte) return errouPin(`Muitas tentativas. Aguarde ${Math.ceil((esperaAte-Date.now())/1000)} s.`);
  if (pinAtual.length >= 4) return;
  pinAtual += d; desenharPontos();
  if (pinAtual.length < 4) return;
  const pin = pinAtual;
  if (pinModo === 'criar'){ pinPrimeiro = pin; setTimeout(() => telaPin('confirmar'), 150); return; }
  if (pinModo === 'confirmar'){
    if (pin !== pinPrimeiro) return setTimeout(() => telaPin('criar', 'As senhas não batem. Tente de novo.'), 300);
    const sal = b64(crypto.getRandomValues(new Uint8Array(16)));
    S.seguranca = { ...(S.seguranca||{}), sal, hash: await hashSenha(pin, sal) }; salvar(); fecharTrava(); render();
    // O Face ID precisa ser pedido direto de um toque (o iPhone bloqueia depois de outras janelas), então só indicamos a chave.
    toast(await bioDisponivel() ? 'Senha criada ✓ Para usar Face ID/digital, ligue a opção logo abaixo.' : 'Senha criada ✓');
    return;
  }
  // destravar
  if (await hashSenha(pin, S.seguranca.sal) === S.seguranca.hash){ tentativas = 0; destravar(); }
  else { tentativas++; if (tentativas >= 5){ esperaAte = Date.now() + 30e3; tentativas = 0; return errouPin('Muitas tentativas. Aguarde 30 s.'); } errouPin('Senha incorreta'); }
}
function travar(){
  if (!temSenha() || travado) return;
  travado = true; fechar(); telaPin('destravar');
  if (S.seguranca.bio) setTimeout(tentarBio, 300);
}
async function tentarBio(){ try { await bioVerificar(); destravar(); } catch(e){} }
function destravar(){ travado = false; fecharTrava(); render(); aoDestravar && aoDestravar(); aoDestravar = null; }
let aoDestravar = null;
async function esqueciSenha(){
  const email = prompt('Para remover a senha, digite o e-mail (ou código) da sua compra:');
  if (!email) return;
  try {
    const r = await fetch('api/liberar', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({ codigo:email, aparelho:idAparelho(), nome:nomeAparelho() }) });
    const d = await r.json();
    if (r.ok && d.ok){ delete S.seguranca; salvar(); destravar(); toast('Senha removida. Crie uma nova em Ajustes.'); }
    else errouPin(d.erro || 'E-mail não confere.');
  } catch(e){ errouPin('Sem internet. Conecte-se para recuperar.'); }
}
document.addEventListener('click', e => {
  const b = e.target.closest('#trava [data-pin]'); if (!b) return;
  e.stopPropagation();
  const v = b.dataset.pin;
  if (v === 'apagar'){ pinAtual = pinAtual.slice(0,-1); desenharPontos(); }
  else if (v === 'bio') tentarBio();
  else if (v === 'esqueci') esqueciSenha();
  else if (v === 'cancelar') fecharTrava();
  else digitoPin(v);
}, true);
document.addEventListener('keydown', e => { if (!pinModo) return; if (/^\d$/.test(e.key)) digitoPin(e.key); else if (e.key === 'Backspace'){ pinAtual = pinAtual.slice(0,-1); desenharPontos(); } });
// Ao sair do app, borra a tela (a miniatura do alternador de apps não mostra valores) e marca a hora.
document.addEventListener('visibilitychange', () => {
  if (!temSenha()) return;
  if (document.visibilityState === 'hidden'){ saiuEm = Date.now(); document.body.classList.add('privado'); }
  else { document.body.classList.remove('privado'); if (saiuEm && Date.now() - saiuEm > TEMPO_TRAVA) travar(); }
});

/* ---------- notificações ----------
   Lembrete diário (~20h) e aviso de contas na véspera. O servidor recebe só as datas de vencimento
   e quantas contas vencem em cada uma (sem nomes nem valores), e o último dia com lançamento. */
const suportaPush = () => 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
const notifLigada = () => !!(S.notif && (S.notif.diario || S.notif.contas));
const chaveUint8 = (b64) => { const p = '='.repeat((4 - b64.length % 4) % 4); return Uint8Array.from(atob((b64 + p).replace(/-/g,'+').replace(/_/g,'/')), c => c.charCodeAt(0)); };
function vencimentosFuturos(){
  const v = {}, kh = chaveHoje(), hojeTxt = dataHoje();
  const prox = nextYM(hoje.getFullYear(), hoje.getMonth()), kp = key(prox.y, prox.m);
  const add = (k, c) => { const o = ymDe(k), d = k + '-' + String(Math.min(+c.venc, diasNoMes(o.y,o.m))).padStart(2,'0'); if (d >= hojeTxt) v[d] = (v[d]||0) + 1; };
  (S.meses[kh] ? S.meses[kh].contas : []).filter(c=>!c.pago && c.venc).forEach(c => add(kh, c));
  // mês seguinte: as contas dele, ou as deste mês como modelo (são copiadas quando o mês começa)
  const modelo = S.meses[kp] && S.meses[kp].contas.length ? S.meses[kp].contas.filter(c=>!c.pago) : (S.meses[kh] ? S.meses[kh].contas : []);
  modelo.filter(c=>c.venc).forEach(c => add(kp, c));
  [kh, kp].forEach(k => { const o = ymDe(k); faturasPorCartao(o.y, o.m).forEach(f => { if (f.cartao) add(k, { venc:f.cartao.vencimento }); }); });
  return v;
}
let esperaNotif = null;
function agendarSyncNotif(){ if (!notifLigada()) return; clearTimeout(esperaNotif); esperaNotif = setTimeout(sincronizarNotif, 2500); }
async function testarNotif(){
  try {
    const reg = await navigator.serviceWorker.ready, sub = await reg.pushManager.getSubscription();
    if (!sub) return toast('Este aparelho não está inscrito. Desligue e ligue a notificação de novo.');
    const r = await fetch('api/notificacoes', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({
      acao:'teste', conta:S.conta, aparelho:idAparelho(), sub:sub.toJSON(), diario:!!S.notif.diario, contas:!!S.notif.contas,
      vencimentos: vencimentosFuturos(), ultimoDia: (S.diasAtivos||[]).slice(-1)[0] || null }) });
    const d = await r.json();
    toast(d.ok ? 'Enviada! Deve chegar em alguns segundos.' : (r.status===403 ? 'Este aparelho não está liberado na conta. Saia e entre de novo.' : d.erro || 'Não foi possível enviar.'));
  } catch(e){ toast('Sem internet ou erro ao enviar.'); }
}
async function sincronizarNotif(acao){
  if (!suportaPush()) return;
  try {
    const reg = await navigator.serviceWorker.ready, sub = await reg.pushManager.getSubscription();
    if (!sub) return;
    await fetch('api/notificacoes', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({
      acao: acao || 'salvar', conta:S.conta, aparelho:idAparelho(), sub:sub.toJSON(),
      diario: !!(S.notif && S.notif.diario), contas: !!(S.notif && S.notif.contas),
      vencimentos: vencimentosFuturos(), ultimoDia: (S.diasAtivos||[]).slice(-1)[0] || null }) });
  } catch(e){}
}
async function alternarNotif(tipo){
  const ligar = !(S.notif && S.notif[tipo]);
  if (ligar){
    if (!suportaPush()) return toast(ehIOS ? 'No iPhone, instale o app na tela de início para receber notificações.' : 'Este navegador não recebe notificações.');
    if (!S.conta) return toast('Saia e entre de novo com seu e-mail (Ajustes → Conta) para ativar.');
    const perm = await Notification.requestPermission();   // precisa vir direto do toque
    if (perm !== 'granted') return toast('Permita as notificações nos ajustes do celular para este app.');
    try {
      const r = await fetch('api/notificacoes').then(x=>x.json());
      if (!r.ok) return toast(r.erro || 'Notificações indisponíveis no momento.');
      const reg = await navigator.serviceWorker.ready;
      if (!(await reg.pushManager.getSubscription())) await reg.pushManager.subscribe({ userVisibleOnly:true, applicationServerKey: chaveUint8(r.chave) });
    } catch(e){ return toast('Não foi possível ativar as notificações.'); }
    S.notif = { ...(S.notif||{}), [tipo]: true }; salvar(); await sincronizarNotif(); render();
    toast(tipo==='diario' ? 'Lembrete diário ativado ✓' : 'Aviso de contas ativado ✓');
  } else {
    S.notif[tipo] = false; salvar();
    if (!notifLigada()){ await sincronizarNotif('remover'); try { const reg = await navigator.serviceWorker.ready, sub = await reg.pushManager.getSubscription(); if (sub) await sub.unsubscribe(); } catch(e){} }
    else await sincronizarNotif();
    render(); toast('Notificação desativada');
  }
}
function cardNotificacoes(){
  const n = S.notif || {};
  const semSuporte = !suportaPush();
  const negado = !semSuporte && Notification.permission === 'denied';
  return `<section class="card"><h3>Notificações</h3>
    ${semSuporte ? `<p class="note" style="margin:0">${ehIOS ? 'No iPhone, as notificações funcionam com o app <b>instalado na tela de início</b> (iOS 16.4 ou mais novo). Instale e ative por lá.' : 'Este navegador não recebe notificações.'}</p>` : `
    <div class="switch"><span>Lembrete para anotar os gastos <small class="muted">(por volta das 20h, se você ainda não anotou)</small></span><button class="tg ${n.diario?'on':''}" data-act="notif" data-tipo="diario" aria-label="Lembrete diário"></button></div>
    <div class="switch" style="margin-top:8px"><span>Aviso de contas <small class="muted">(na véspera do vencimento)</small></span><button class="tg ${n.contas?'on':''}" data-act="notif" data-tipo="contas" aria-label="Aviso de contas"></button></div>
    ${notifLigada() ? '<button class="btn sec" data-act="notifTeste" style="margin-top:10px">🔔 Enviar notificação de teste</button>' : ''}
    ${negado ? '<p class="note">As notificações estão bloqueadas para este app. Libere nos ajustes do celular.</p>' : '<p class="note">Para avisar das contas, o app envia só as datas de vencimento, sem nomes nem valores.</p>'}`}</section>`;
}

/* ---------- backup na nuvem ----------
   Os dados são criptografados aqui no aparelho (AES-GCM com chave tirada de uma senha que só a
   pessoa sabe, PBKDF2) e só o pacote ilegível vai para o servidor (api/nuvem.js).
   A chave fica guardada neste aparelho, fora do estado S (para não ir parar no backup em arquivo),
   e permite o envio automático uma vez por dia, só quando algo mudou. */
const NUVEM_KEY = (c) => 'orgfin:nuvem:' + c;
const lerNuvem = () => { if (!S.conta) return null; try { return JSON.parse(localStorage.getItem(NUVEM_KEY(S.conta))); } catch(e){ return null; } };
const gravarNuvem = (cfg) => { try { cfg ? localStorage.setItem(NUVEM_KEY(S.conta), JSON.stringify(cfg)) : localStorage.removeItem(NUVEM_KEY(S.conta)); } catch(e){} };
const paraB64 = (buf) => { const a = new Uint8Array(buf); let s = ''; for (let i = 0; i < a.length; i += 0x8000) s += String.fromCharCode.apply(null, a.subarray(i, i + 0x8000)); return btoa(s); };
const apiNuvem = (dados) => fetch('api/nuvem', { method:'POST', headers:{'Content-Type':'application/json'},
  body: JSON.stringify({ conta:S.conta, aparelho:idAparelho(), nome:nomeAparelho(), ...dados }) })
  .then(r => r.json().catch(() => ({})).then(d => { if (!r.ok || !d.ok) { const e = new Error(d.erro || 'falha'); e.status = r.status; throw e; } return d; }));
async function chaveDaSenha(senha, salt){
  const base = await crypto.subtle.importKey('raw', new TextEncoder().encode(senha), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey({ name:'PBKDF2', salt, iterations:250000, hash:'SHA-256' }, base, { name:'AES-GCM', length:256 }, true, ['encrypt','decrypt']);
}
async function gzip(bytes, desfazer){
  const fluxo = new Blob([bytes]).stream().pipeThrough(desfazer ? new DecompressionStream('gzip') : new CompressionStream('gzip'));
  return new Uint8Array(await new Response(fluxo).arrayBuffer());
}
// Assinatura do conteúdo, ignorando campos que mudam sozinhos, para só enviar quando algo mudou de verdade.
const IGNORAR_NUVEM = ['verificadoEm','notifSync','versaoVista','ultimoBackup','novosDesdeBackup','backupAdiado','depo'];
function assinaturaDados(){
  const txt = JSON.stringify(S, (k, v) => IGNORAR_NUVEM.includes(k) ? undefined : v);
  let h = 2166136261; for (let i = 0; i < txt.length; i++){ h ^= txt.charCodeAt(i); h = Math.imul(h, 16777619); }
  return (h >>> 0).toString(36) + txt.length;
}
async function enviarNuvem(cfg){
  const chave = await crypto.subtle.importKey('jwk', cfg.chave, { name:'AES-GCM' }, false, ['encrypt']);
  let bytes = new TextEncoder().encode(JSON.stringify({ ...S, backupEm: new Date().toISOString() }));
  const z = !!window.CompressionStream; if (z) bytes = await gzip(bytes);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const cifrado = await crypto.subtle.encrypt({ name:'AES-GCM', iv }, chave, bytes);
  const assinatura = assinaturaDados();
  const r = await apiNuvem({ acao:'salvar', pacote:{ v:1, z, salt:cfg.salt, iv:paraB64(iv), dados:paraB64(cifrado) } });
  gravarNuvem({ ...cfg, ultimo:r.em, assinatura });
  S.ultimoBackup = r.em; S.novosDesdeBackup = 0; S.backupAdiado = null; salvar();
  return r;
}
let nuvemEnviando = false;
function backupAutomatico(){
  if (DEMO || !S.liberado || !S.conta || !navigator.onLine || nuvemEnviando) return;
  const cfg = lerNuvem(); if (!cfg) return;
  if (cfg.ultimo && Date.now() - new Date(cfg.ultimo).getTime() < 20*3600e3) return;
  if (cfg.assinatura === assinaturaDados()) return;
  nuvemEnviando = true;
  enviarNuvem(cfg).then(() => { if (aba === 'ajustes' && !ocupado()) render(); })
    .catch(e => { if (e.status === 403) return; })   // sem acesso: a verificação de acesso cuida disso
    .finally(() => { nuvemEnviando = false; });
}
const quandoNuvem = (iso) => { const d = new Date(iso); return diasDesde(iso) === 0 ? 'hoje às ' + d.toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'}) : d.toLocaleDateString('pt-BR'); };
function cardNuvem(){
  if (DEMO || !S.conta) return '';
  const cfg = lerNuvem();
  return `<div class="nuvem"><h4>☁️ Backup na nuvem</h4>${cfg
    ? `<p class="note" style="margin:0 0 12px"><span class="tag auto" style="margin:0 4px 0 0">ligado</span> Último envio: <b>${cfg.ultimo ? quandoNuvem(cfg.ultimo) : 'ainda não'}</b>. É feito sozinho uma vez por dia, quando você abre o app com internet e algo mudou.</p>
       <button class="btn sec" data-act="nuvemAgora">☁️ Fazer backup na nuvem agora</button>
       <button class="btn sec" data-act="nuvemRestaurar">Restaurar da nuvem</button>
       <button class="link-sutil" data-act="nuvemDesligar">Desligar backup na nuvem</button>`
    : `<p class="note" style="margin:0 0 12px">Guarde uma cópia automática e protegida por senha. Se trocar ou perder o celular, é só entrar com seu e-mail e recuperar tudo.</p>
       <button class="btn pri" data-act="nuvemAtivar">☁️ Ativar backup na nuvem</button>
       <button class="btn sec" data-act="nuvemRestaurar">Restaurar da nuvem</button>`}</div>`;
}
function abrirAtivarNuvem(){
  if (!window.crypto || !crypto.subtle) return toast('Seu navegador não suporta o backup na nuvem. Atualize o sistema do celular.');
  abrir(`<h2>☁️ Backup na nuvem</h2>
    <p class="note" style="margin:0 0 12px">Crie uma senha para proteger seu backup. Seus dados são criptografados aqui no celular antes de sair dele: <b>nem a nossa equipe consegue ver</b>.</p>
    <div class="f"><label>Senha do backup (mínimo 6 caracteres)</label><input id="nSenha" type="password" autocomplete="new-password"></div>
    <div class="f"><label>Repita a senha</label><input id="nSenha2" type="password" autocomplete="new-password"></div>
    <div class="alert warnbox" style="margin:0 0 14px"><span>⚠️</span><div><b>Anote essa senha em um lugar seguro.</b> Você vai precisar dela para recuperar seus dados em outro celular. Se esquecer, não temos como recuperar o backup.</div></div>
    <button class="btn pri" data-act="nuvemConfirmar">Ativar e fazer o primeiro backup</button>`);
}
async function confirmarNuvem(btn){
  const s1 = document.getElementById('nSenha').value, s2 = document.getElementById('nSenha2').value;
  if (s1.length < 6) return toast('A senha precisa ter pelo menos 6 caracteres');
  if (s1 !== s2) return toast('As senhas não são iguais');
  btn.disabled = true; btn.textContent = 'Criptografando e enviando…';
  try {
    const info = await apiNuvem({ acao:'info' });
    if (info.existe && !confirm(`Já existe um backup na nuvem de ${quandoNuvem(info.em)}${info.aparelho ? ' ('+info.aparelho+')' : ''}.\n\nAtivar aqui substitui esse backup pelos dados deste aparelho. Continuar?`)) { btn.disabled = false; btn.textContent = 'Ativar e fazer o primeiro backup'; return; }
    const salt = crypto.getRandomValues(new Uint8Array(16));
    const chave = await chaveDaSenha(s1, salt);
    const cfg = { salt:paraB64(salt), chave: await crypto.subtle.exportKey('jwk', chave) };
    await enviarNuvem(cfg);
    fechar(); render(); toast('Backup na nuvem ativado ✓');
  } catch(e){
    btn.disabled = false; btn.textContent = 'Ativar e fazer o primeiro backup';
    toast(e.message === 'grande' ? 'Seus dados são grandes demais para a nuvem. Use o backup em arquivo.' : 'Não foi possível enviar. Confira a internet e tente de novo.');
  }
}
async function abrirRestaurarNuvem(aoEntrar){
  let info;
  try { info = await apiNuvem({ acao:'info' }); } catch(e){ if (!aoEntrar) toast('Sem conexão com a nuvem. Confira a internet.'); return; }
  if (!info.existe){ if (!aoEntrar) toast('Você ainda não tem backup na nuvem'); return; }
  if (aoEntrar && ocupado()) return;
  abrir(`<h2>☁️ ${aoEntrar ? 'Encontramos um backup seu' : 'Restaurar da nuvem'}</h2>
    <p class="note" style="margin:0 0 12px">Backup de <b>${quandoNuvem(info.em)}</b>${info.aparelho ? ', feito em '+esc(info.aparelho) : ''}. Digite a senha do backup para recuperar seus dados neste aparelho.</p>
    <div class="f"><label>Senha do backup</label><input id="nSenhaR" type="password" autocomplete="current-password"></div>
    <button class="btn pri" data-act="nuvemRecuperar">Recuperar meus dados</button>
    ${aoEntrar ? '<button class="btn sec" data-act="fechar">Começar do zero</button>' : ''}`);
}
async function recuperarNuvem(btn){
  const senha = document.getElementById('nSenhaR').value;
  if (!senha) return toast('Digite a senha do backup');
  btn.disabled = true; btn.textContent = 'Recuperando…';
  const volta = (msg) => { btn.disabled = false; btn.textContent = 'Recuperar meus dados'; toast(msg); };
  let d, chave, p;
  try { p = (await apiNuvem({ acao:'baixar' })).pacote; } catch(e){ return volta('Não foi possível baixar. Confira a internet.'); }
  try {
    chave = await chaveDaSenha(senha, deB64(p.salt));
    let bytes = new Uint8Array(await crypto.subtle.decrypt({ name:'AES-GCM', iv:deB64(p.iv) }, chave, deB64(p.dados)));
    if (p.z) bytes = await gzip(bytes, true);
    d = JSON.parse(new TextDecoder().decode(bytes));
    if (!d.meses || !d.perfil) throw 0;
  } catch(e){ return volta('Senha incorreta'); }
  const temDados = Object.keys(S.meses||{}).length && S.perfil.ok;
  if (temDados && !confirm('Substituir os dados deste aparelho pelos do backup na nuvem?')) return volta('Nada foi alterado');
  d.liberado = S.liberado || d.liberado; d.conta = S.conta || d.conta; d.verificadoEm = S.verificadoEm; delete d.backupEm;
  S = d; aba = 'resumo'; migrar(); S.tourVisto = true; S.versaoVista = APP_VERSAO; S.novosDesdeBackup = 0;
  gravarNuvem({ salt:p.salt, chave: await crypto.subtle.exportKey('jwk', chave), ultimo:new Date().toISOString(), assinatura:assinaturaDados() });
  salvar(); fechar(); render(); toast('Dados recuperados da nuvem ✓');
}
async function desligarNuvem(){
  if (!confirm('Desligar o backup na nuvem?\n\nA cópia guardada na nuvem será apagada. Seus dados neste aparelho continuam aqui.')) return;
  try { await apiNuvem({ acao:'apagar' }); } catch(e){ return toast('Sem conexão. Tente de novo com internet.'); }
  gravarNuvem(null); render(); toast('Backup na nuvem desligado');
}

/* ---------- tela inicial: o número principal ----------
   No mês atual, o destaque é "Pode gastar hoje": o que sobra (já descontando as contas a pagar)
   dividido pelos dias que faltam. A barra compara os gastos do dia a dia com o quanto do mês já passou:
   contas fixas e faturas ficam de fora, porque costumam cair todas no começo do mês. */
function heroResumo(C){
  const neg = C.restante < 0;
  if (key(cur.y,cur.m) !== chaveHoje()) return `<section class="card hero">
    <div class="lbl">Restante para gastar</div>
    <div class="big num ${neg && !S.ocultar?'neg':''}">${brl(C.restante)}</div>
    <div class="eq num">${brl(C.entradas)} entradas − ${brl(C.saidas)} saídas − ${brl(C.reservas)} reservas</div></section>`;
  const D = diasNoMes(cur.y,cur.m), d = hoje.getDate(), rest = D - d + 1;
  const livre = C.restante - C.contasPend, porDia = livre / rest;
  const ritmo = C.gastosVista / d, fim = livre - ritmo * (rest - 1);
  const base = livre + C.gastosVista;   // o que estava livre para o dia a dia neste mês
  const usado = base > 0 ? Math.min(100, Math.max(0, C.gastosVista / base * 100)) : 0, passou = d / D * 100;
  const st = C.entradas <= 0 ? null : livre < 0 ? ['ruim','⚠️ Mês no vermelho'] : usado <= passou + 5 ? ['ok','✅ No ritmo certo'] : usado <= passou + 20 ? ['atencao','👀 Um pouco acima do ritmo'] : ['ruim','⚠️ Gastando rápido'];
  const fut = comprometidoFuturo();
  return `<section class="card hero hero2">
    <div class="h2-lbl"><span>Pode gastar hoje</span>${st ? `<span class="st ${st[0]}">${st[1]}</span>` : ''}</div>
    <div class="big num ${porDia<0 && !S.ocultar?'neg':''}">${brl(Math.max(porDia,0))}</div>
    <div class="h2-sub num">${C.entradas <= 0 ? 'Cadastre o que entra no mês (salário, renda) e o Tino calcula para você.' : livre >= 0 ? `Sobram <b>${brl(livre)}</b> para ${rest === 1 ? 'hoje' : `os próximos ${rest} dias`}` : `Faltam <b>${brl(-livre)}</b> para fechar o mês`}</div>
    <div class="rapidas duas">
      <button data-act="possoComprar"><span>🤔</span>Posso comprar?</button>
      <button data-act="colar"><span>📋</span>Colar do banco</button>
    </div>
    <details class="como"><summary>Como chegamos nesse número</summary>
      <div class="eq num">${brl(C.entradas)} entradas − ${brl(C.saidas)} saídas − ${brl(C.reservas)} reservas = <b>${brl(C.restante)}</b></div>
      ${C.contasPend > 0 ? `<div class="eq num">− ${brl(C.contasPend)} de contas a pagar = <b>${brl(livre)}</b></div>` : ''}
      <div class="eq num">÷ ${rest} dia${rest>1?'s':''} = <b>${brl(Math.max(porDia,0))} por dia</b></div>
      <div class="eq num">No ritmo atual (${brl0(ritmo)}/dia), o mês termina com <b class="${fim<0 && !S.ocultar?'neg':''}">${brl(fim)}</b>.</div>
      ${fut > 0 ? `<div class="eq num">💳 ${brl(fut)} em parcelas nos próximos meses.</div>` : ''}
    </details>
  </section>`;
}

/* ---------- para onde foi o dinheiro (fluxo) ----------
   Da entrada do mês para as maiores categorias, o que foi guardado e o que sobrou. */
const CORES_FLUXO = ['#0d9668','#e9a91b','#3b82f6','#e05a47','#8b5cf6','#94a3a0'];
function cardFluxo(C){
  if (!(C.entradas > 0) || !(C.consumo > 0)) return '';
  const cats = Object.entries(C.cats).filter(([,v])=>v>0).sort((a,b)=>b[1]-a[1]);
  const nos = cats.slice(0,5).map(([c,v],i)=>({ nome:nomeCat(c), e:emojiCat(c), v, cor:CORES_FLUXO[i] }));
  const outras = soma(cats.slice(5), x=>x[1]); if (outras > 0) nos.push({ nome:'Outras', e:'•••', v:outras, cor:CORES_FLUXO[5] });
  if (C.reservas > 0) nos.push({ nome:'Guardado', e:'🐷', v:C.reservas, cor:'#14b8a6' });
  const sobra = C.entradas - C.consumo - C.reservas;
  if (sobra > 0) nos.push({ nome:'Sobrou', e:'✨', v:sobra, cor:'#c7d6cf', sobra:true });
  const tot = soma(nos, n=>n.v), W = 340, X1 = 14, X2 = 176, GAP = 8, MIN = 30;
  const alt = nos.map(n => Math.max(n.v / tot * 260, MIN)), H = soma(alt, a=>a) + GAP * (nos.length - 1);
  const esq = Math.min(1, C.entradas / tot) * H;
  let y = 0, ye = (H - esq) / 2, rib = '', bar = '', lab = '';
  nos.forEach((n, i) => {
    const h = alt[i], he = n.v / tot * esq;
    rib += `<path d="M${X1},${ye} C${(X1+X2)/2},${ye} ${(X1+X2)/2},${y} ${X2},${y} L${X2},${y+h} C${(X1+X2)/2},${y+h} ${(X1+X2)/2},${ye+he} ${X1},${ye+he} Z" fill="${n.cor}" opacity="${n.sobra?.45:.32}"/>`;
    bar += `<rect x="${X2}" y="${y}" width="8" height="${h}" rx="3" fill="${n.cor}"/>`;
    lab += `<text x="${X2+14}" y="${y+h/2-1}" class="fx-n">${esc(n.nome)}</text><text x="${X2+14}" y="${y+h/2+13}" class="fx-v">${S.ocultar?OCULTO:brl0(n.v)} · ${Math.round(n.v/C.entradas*100)}%</text>`;
    y += h + GAP; ye += he;
  });
  return `<section class="card"><h3>Para onde foi seu dinheiro <small>${MESES[cur.m]}</small></h3>
    <svg class="fluxo" viewBox="0 0 ${W} ${H+4}" role="img" aria-label="Fluxo das entradas para as categorias de gasto">
      <rect x="0" y="${(H-esq)/2}" width="${X1}" height="${esq}" rx="4" fill="var(--teal)"/>${rib}${bar}${lab}</svg>
    <div class="note">Entradas do mês: <b class="num">${brl(C.entradas)}</b>. ${sobra < 0 ? `Os gastos e reservas passaram ${brl(-sobra)} das entradas (inclui compras no crédito que ainda vão para a fatura).` : 'Porcentagens sobre as entradas do mês.'}</div></section>`;
}

/* ---------- minha semana ----------
   Últimos 7 dias contra os 7 anteriores: gastos do dia a dia (sem parceladas e sem contas fixas). */
function dadosSemana(fimOffset){
  const dias = [];
  for (let i = 6; i >= 0; i--){ const d = new Date(hoje); d.setDate(d.getDate() - i - fimOffset); dias.push(key(d.getFullYear(), d.getMonth()) + '-' + String(d.getDate()).padStart(2,'0')); }
  const porDia = Object.fromEntries(dias.map(d=>[d,0])), cats = {}; let maior = null;
  Object.values(S.meses).forEach(M => M.gastos.forEach(g => {
    if (ehParcelado(g) || !(g.data in porDia)) return;
    const v = +g.valor || 0; porDia[g.data] += v; cats[g.cat] = (cats[g.cat]||0) + v;
    if (!maior || v > maior.valor) maior = g;
  }));
  return { dias, porDia, cats, maior, total: soma(Object.values(porDia), v=>v), semGasto: dias.filter(d=>!porDia[d]).length };
}
function abrirSemana(){
  const a = dadosSemana(0), b = dadosSemana(7), max = Math.max(...Object.values(a.porDia), 1);
  const dif = b.total > 0 ? Math.round((a.total / b.total - 1) * 100) : null;
  const top = Object.entries(a.cats).sort((x,y)=>y[1]-x[1]).slice(0,3);
  const ini = (d) => DIAS_SEMANA[new Date(d+'T12:00:00').getDay()].slice(0,3);
  S.semanaVista = dataHoje(); salvar();
  abrir(`<h2>📅 Minha semana</h2>
    <div class="sem-total"><span>Gastos dos últimos 7 dias</span><b class="num">${brl(a.total)}</b>
      ${dif === null ? '' : `<small class="${dif<=0?'up':'down'}">${dif<=0?'▼':'▲'} ${Math.abs(dif)}% vs. 7 dias anteriores (${brl0(b.total)})</small>`}</div>
    <div class="sem-barras" role="img" aria-label="Gastos por dia">${a.dias.map(d=>`<div class="sb"><span class="sb-v num">${a.porDia[d] ? (S.ocultar?'•':brl0(a.porDia[d]).replace('R$ ','')) : ''}</span><span class="sb-b" style="height:${Math.max(a.porDia[d]/max*100, a.porDia[d]?6:2)}%"></span><span class="sb-d">${ini(d)}</span></div>`).join('')}</div>
    <div class="sem-fatos">
      <div><span>🗓️</span><b>${a.semGasto}</b> dia${a.semGasto===1?'':'s'} sem gastar</div>
      ${a.maior ? `<div><span>🔝</span>Maior gasto: <b>${esc(a.maior.desc || nomeCat(a.maior.cat))}</b> ${brl(a.maior.valor)}</div>` : ''}
    </div>
    ${top.length ? `<h3 class="ajuda-t">Onde mais gastou</h3><div class="list flat">${top.map(([c,v])=>`<div class="item"><div class="ic">${emojiCat(c)}</div><div class="tx"><div class="t1">${esc(nomeCat(c))}</div></div><div class="val num">${brl(v)}</div></div>`).join('')}</div>` : '<div class="empty"><div class="e">🌱</div>Nenhum gasto nos últimos 7 dias.</div>'}
    <p class="note">Parceladas e contas fixas ficam de fora: aqui é o seu dia a dia.</p>`);
}
function cardSemana(){
  const dow = hoje.getDay();
  if (DEMO || key(cur.y,cur.m) !== chaveHoje() || !(dow === 0 || dow === 1) || S.semanaVista === dataHoje() || (S.semanaVista && diasDesde(S.semanaVista) < 2)) return '';
  const a = dadosSemana(0); if (!a.total) return '';
  return `<button class="alert info semana-card" data-act="semana"><span>📅</span><div><b>Sua semana fechou</b><br>Você gastou <b class="num">${brl(a.total)}</b> nos últimos 7 dias. Toque para ver o resumo.</div></button>`;
}

/* ---------- primeiros passos e modo simples ----------
   Clientes novos começam com a tela inicial enxuta (S.modoSimples) e uma lista de 4 passos.
   O modo simples sai sozinho depois de 7 dias com pelo menos 5 lançamentos, ou quando a pessoa pede. */
function passosIniciais(){
  const ms = Object.values(S.meses || {});
  return [
    { id:'entrada', feito: ms.some(M => M.entradas.length), t:'Cadastre o que entra', s:'Salário, renda ou freela do mês', act:'passoEntrada' },
    { id:'gasto', feito: ms.some(M => M.gastos.length), t:'Anote seu primeiro gasto', s:'Pode ser o café de hoje', act:'passoGasto' },
    { id:'conta', feito: ms.some(M => M.contas.length), t:'Adicione suas contas fixas', s:'Aluguel, luz, internet…', act:'passoConta' },
    { id:'lembrete', feito: notifLigada() || !!S.passoLembretePulado, t:'Ligue os lembretes', s:'O app te lembra de anotar e das contas', act:'passoLembrete' }
  ];
}
function cardPassos(){
  if (DEMO || S.passosFechado || key(cur.y,cur.m) !== chaveHoje()) return '';
  const ps = passosIniciais(), feitos = ps.filter(p => p.feito).length;
  const dias = [...new Set(S.diasAtivos || [])].sort();
  const novo = S.modoSimples || !dias.length || diasDesde(dias[0]) <= 14;
  if (!novo) return '';
  if (feitos === ps.length){
    if (!S.passosConcluidos){ S.passosConcluidos = dataHoje(); salvar(); }
    if (diasDesde(S.passosConcluidos) > 0) return '';
    return `<section class="card passos" id="passos"><h3>🎉 Tudo pronto!</h3><p class="note" style="margin:0 0 10px">Agora é só ir anotando. O <b>Pode gastar hoje</b> se atualiza sozinho.</p><button class="link-sutil" data-act="passosFechar">Fechar</button></section>`;
  }
  return `<section class="card passos" id="passos"><h3>🚀 Primeiros passos <small>${feitos} de ${ps.length}</small></h3>
    <div class="bar" style="margin-bottom:12px"><div style="width:${feitos / ps.length * 100}%"></div></div>
    ${ps.map((p, i) => `<button class="passo ${p.feito ? 'ok' : ''}" data-act="${p.act}" ${p.feito ? 'disabled' : ''}>
      <span class="passo-n">${p.feito ? '✓' : i + 1}</span><span class="passo-t"><b>${p.t}</b><small>${p.s}</small></span>${p.feito ? '' : '<span class="passo-seta">›</span>'}</button>`).join('')}
    <div class="passos-pe"><button class="link-sutil" data-act="ajuda">Precisa de ajuda?</button>${S.conta && !S.indicadoInformado ? '<button class="link-sutil" data-act="indiqueUsar">Alguém te indicou?</button>' : ''}<button class="link-sutil" data-act="passosFechar">Ocultar</button></div>
  </section>`;
}
// Sai do modo simples sozinho depois de 7 dias com pelo menos 5 lançamentos.
function revisarModoSimples(){
  if (!S.modoSimples) return;
  const n = soma(Object.values(S.meses || {}), M => M.gastos.length + M.entradas.length);
  if (diasDesde(S.simplesDesde) >= 7 && n >= 5){ S.modoSimples = false; S.avisoCompleto = true; salvar(); }
}
function cardModoCompleto(){
  if (S.modoSimples) return `<button class="ver-mais" data-act="modoCompleto">Mostrar tudo: gráficos, fluxo do dinheiro e mais</button>`;
  if (S.avisoCompleto) return `<div class="alert info backup"><span>✨</span><div><b>Sua tela inicial agora mostra mais</b><br>Como você já pegou o jeito, liberamos os gráficos, o fluxo do dinheiro e outros detalhes.
    <div class="acts"><button class="btn sec" data-act="avisoCompletoOk">Entendi</button><button class="btn sec" data-act="modoSimplesVoltar">Prefiro simples</button></div></div></div>`;
  return '';
}

/* ---------- colar do banco ----------
   Lê o texto de uma notificação de compra ou de um comprovante de Pix e lança sozinho.
   Tudo acontece no aparelho. Também recebe o "Compartilhar" do Android (share_target no manifest). */
function interpretarTextoBanco(bruto){
  const t = String(bruto || '').replace(/\s+/g, ' ').trim();
  const mv = t.match(/R\$\s?(\d{1,3}(?:\.\d{3})+,\d{2}|\d+,\d{2}|\d+\.\d{2}|\d+)/i);
  if (!mv) return null;
  const valor = parseFloat(/,/.test(mv[1]) ? mv[1].replace(/\./g,'').replace(',','.') : mv[1]);
  if (!(valor > 0)) return null;
  const n = semAcento(t).toLowerCase();
  const entrada = /(recebid|voce recebeu|recebeu um|transferencia recebida|deposito recebido|credito em conta|caiu na sua conta|estorno|reembolso)/.test(n) && !/(compra|enviad|voce pagou|pagamento efetuado|pagamento realizado)/.test(n);
  const forma = /debito/.test(n) ? 'débito' : /\bpix\b/.test(n) ? 'pix' : /(credito|cartao|compra aprovada|compra de|compra no)/.test(n) ? 'crédito' : '';
  const corta = (s) => s.split(/\s(?:para o cart|com o cart|no cart|cart[aã]o|final\s\d|em \d{2}\/|em \d+\s?x|\d+\s?x\b|às|as \d|no valor|aprovad|foi |realizad)|[,.;!:]|\s-\s/i)[0].replace(/\*.*$/,'').trim();
  let quem = '', m;
  if (!entrada && (m = t.match(/\s-\s([A-Za-zÀ-ú][\wÀ-ú &'*.-]{2,30})\s*$/))) quem = corta(m[1]);   // "... às 14:32 - DROGASIL"
  else if (entrada){ if ((m = t.match(/\b(?:de|por)\s+([A-ZÀ-Úa-zà-ú][^\d,.;]{2,40})/))) quem = corta(m[1]); }
  else if ((m = t.match(/\b(?:em|no estabelecimento|na loja)\s+([A-Za-zÀ-ú0-9*&'][^,;]{2,45})/i)) && !/^\d/.test(m[1])) quem = corta(m[1]);
  else if ((m = t.match(/\bpara\s+([A-ZÀ-Úa-zà-ú][^\d,.;]{2,40})/))) quem = corta(m[1]);
  else {   // notificações que começam pela loja: "Uber *trip R$ 18,40 no cartão"
    const antes = corta(t.slice(0, t.search(/R\$/i)).replace(/^[\wÀ-ú]+:\s*/, '')).replace(/\b(compra|aprovada|pagamento|valor|de|no|na|em)\b/gi, ' ').replace(/\s+/g, ' ').trim();
    if (/^[A-Za-zÀ-ú][\wÀ-ú &'-]{1,29}$/.test(antes)) quem = antes;
  }
  quem = quem.replace(/\b(o|a|seu|sua)\b\s*$/i,'').trim().slice(0, 30);
  if (quem && quem === quem.toUpperCase()) quem = quem.toLowerCase().replace(/(^|\s)\S/g, x => x.toUpperCase());
  const vs = valor.toFixed(2).replace('.', ',');
  const parc = !entrada && (m = n.match(/\b(?:em\s)?(\d{1,2})\s?x\b/)) && +m[1] > 1 ? ` em ${+m[1]}x` : '';
  // data da compra ("em 12/10"), só se for deste mês
  let dia = ''; if ((m = t.match(/\b(\d{1,2})\/(\d{1,2})\b/)) && +m[2] === hoje.getMonth() + 1 && +m[1] <= hoje.getDate()) dia = ` dia ${+m[1]}`;
  const frase = entrada ? `recebi ${vs}${quem ? ' de ' + quem : ''}${dia}` : `gastei ${vs}${quem ? ' ' + quem : ''}${parc}${forma ? ' no ' + forma : ''}${dia}`;
  return { frase, entrada };
}
function lancarTexto(txt){
  const r = interpretarTextoBanco(txt);
  if (!r) return toast('Não encontrei um valor (R$) nesse texto');
  fechar(); abrirForm('gastos');
  setTimeout(() => { const i = document.getElementById('fFrase'); if (i){ i.value = r.frase; i.dataset.aplicado = r.frase; } aplicarFrase(r.frase); }, 80);
}
function abrirColar(){
  abrir(`<h2>📋 Colar do banco</h2>
    <p class="note" style="margin:0 0 12px">Copie a notificação de compra ou o comprovante do Pix no app do seu banco e cole aqui. O Tino entende o valor, o lugar e a forma de pagamento, e você só confere.</p>
    <div class="f"><textarea id="cTexto" rows="4" placeholder="Ex.: Compra aprovada de R$ 45,90 em IFOOD no cartão final 1234"></textarea></div>
    ${navigator.clipboard && navigator.clipboard.readText ? '<button class="btn sec" data-act="colarLer">📋 Colar o que eu copiei</button>' : ''}
    <button class="btn pri" data-act="colarLancar">Lançar</button>
    <p class="note" style="text-align:center;margin-top:10px">🔒 O texto é lido só aqui no seu celular.${/android/i.test(navigator.userAgent) ? ' Dica: no app do banco, use <b>Compartilhar → Tino</b>.' : ''}</p>`);
}

/* ---------- patrimônio ----------
   O que você tem (cofrinhos, investimentos, valores a receber) menos o que deve (dívidas e parcelas futuras).
   A evolução é guardada uma vez por mês, a partir de quando o recurso existe. */
function calcPatrimonio(){
  const kh = chaveHoje();
  const cofs = soma(S.cofrinhos || [], c => Math.max(0, guardadoAte(c.id, kh)));
  let invest = 0; Object.entries(S.meses).forEach(([mk, M]) => { if (mk <= kh) invest += soma(M.reservas.filter(r => !cofDe(r)), r => r.valor); });
  const receber = soma(pendentes(), r => r.valor);
  const dividas = soma(dividasAtivas(), d => d.saldo), parcelas = comprometidoFuturo();
  const ativos = cofs + Math.max(0, invest) + receber, passivos = dividas + parcelas;
  return { cofs, invest: Math.max(0, invest), receber, dividas, parcelas, ativos, passivos, liquido: ativos - passivos };
}
function cardPatrimonio(){
  if (DEMO && !Object.keys(S.meses).length) return '';
  const P = calcPatrimonio();
  if (!P.ativos && !P.passivos) return '';
  const kh = chaveHoje(); S.patrHist = S.patrHist || {};
  if (!DEMO && Math.abs((S.patrHist[kh] ?? NaN) - P.liquido) >= 0.01){ S.patrHist[kh] = Math.round(P.liquido * 100) / 100; try { localStorage.setItem(STORE_KEY, JSON.stringify(S)); } catch(e){} }
  const hist = Object.entries(S.patrHist).sort().slice(-6);
  const max = Math.max(...hist.map(([,v]) => Math.abs(v)), 1);
  const linha = (l, v, sinal) => v > 0 ? `<div class="pat-l"><span>${l}</span><b class="num">${sinal}${brl(v)}</b></div>` : '';
  return `<section class="card" id="cardPatrimonio"><h3>💎 Patrimônio <small>o que você tem − o que deve</small></h3>
    <div class="pat-total num ${P.liquido < 0 && !S.ocultar ? 'neg' : ''}">${brl(P.liquido)}</div>
    <div class="pat-cols">
      <div><small>Você tem</small>${linha('🐷 Cofrinhos', P.cofs, '')}${linha('📈 Investimentos', P.invest, '')}${linha('🤝 A receber', P.receber, '')}${P.ativos ? '' : '<div class="pat-l"><span>—</span></div>'}</div>
      <div><small>Você deve</small>${linha('💸 Dívidas', P.dividas, '')}${linha('💳 Parcelas futuras', P.parcelas, '')}${P.passivos ? '' : '<div class="pat-l"><span>Nada 🎉</span></div>'}</div>
    </div>
    ${hist.length >= 2 ? `<div class="pat-hist" role="img" aria-label="Evolução do patrimônio">${hist.map(([k, v]) => `<div class="ph"><span class="ph-b ${v < 0 ? 'neg' : ''}" style="height:${Math.max(Math.abs(v) / max * 100, 4)}%"></span><span class="ph-d">${MES_CURTO[ymDe(k).m]}</span></div>`).join('')}</div>`
      : '<p class="note" style="margin:10px 0 0">A evolução mês a mês aparece aqui a partir do próximo mês.</p>'}
  </section>`;
}

/* ---------- renda variável ----------
   Para quem é autônomo ou ganha comissão: define uma "renda segura" (o mínimo que costuma entrar)
   e o app mostra o que já entrou no mês e sugere guardar o que vier acima dela. */
function rendaSeguraSugerida(){
  const v = []; for (let i = 1; i <= 6 && v.length < 3; i++){ const o = somaMeses(hoje.getFullYear(), hoje.getMonth(), -i); if (temDados(S.meses[key(o.y,o.m)])){ const r = calc(o.y,o.m).renda; if (r > 0) v.push(r); } }
  return v.length ? Math.floor(Math.min(...v) / 50) * 50 : 0;
}
function cardRendaVariavel(C){
  const rv = S.rendaVariavel; if (!rv || !rv.ativo || !(rv.segura > 0) || key(cur.y,cur.m) !== chaveHoje()) return '';
  const rec = C.renda, pct = Math.min(100, rec / rv.segura * 100), acima = rec - rv.segura;
  return `<section class="card renda-card"><h3>💼 Renda do mês <small>renda segura ${brl0(rv.segura)}</small></h3>
    <div class="bar"><div style="width:${pct}%"></div></div>
    <div class="goal"><div class="foot"><span>Já entrou <b class="num">${brl(rec)}</b></span><span>${Math.round(rec / rv.segura * 100)}%</span></div></div>
    ${acima > 0 ? `<div class="dica"><span class="d-e">🌤️</span><div><span>Você recebeu <b>${brl(acima)}</b> acima da sua renda segura. Guardar o excedente protege os meses mais fracos.</span><button class="d-acao" data-act="guardarExcedente" data-v="${Math.round(acima * 100) / 100}">Guardar o excedente</button></div></div>`
      : hoje.getDate() >= 20 && rec < rv.segura ? `<p class="note" style="margin:0">Mês mais fraco até agora: faltam ${brl(rv.segura - rec)} para a renda segura. Se precisar, use a reserva com calma.</p>`
      : `<p class="note" style="margin:0">O “Pode gastar hoje” conta só o que já entrou. Quando entrar mais, ele sobe sozinho.</p>`}
  </section>`;
}
function abrirRendaVariavel(){
  const rv = S.rendaVariavel || {}, sug = rendaSeguraSugerida();
  abrir(`<h2>💼 Minha renda varia</h2>
    <p class="note" style="margin:0 0 12px">Para autônomos, comissão ou freela. Defina a <b>renda segura</b>: o mínimo que costuma entrar num mês fraco. O Tino mostra quanto já entrou e sugere guardar o que vier acima disso.</p>
    <div class="f"><label>Renda segura por mês</label><input class="num money" id="rvSegura" inputmode="decimal" placeholder="0,00" value="${rv.segura ? moneyVal(rv.segura) : sug ? moneyVal(sug) : ''}"></div>
    ${sug ? `<p class="note" style="margin:-6px 0 12px">Sugestão: ${brl0(sug)}, a menor renda dos seus últimos meses.</p>` : ''}
    <button class="btn pri" data-act="salvarRenda">Ativar</button>
    ${rv.ativo ? '<button class="btn sec" data-act="desligarRenda">Desligar</button>' : ''}`);
}

/* ---------- organizar "Outros" ----------
   Gastos do mês que ficaram sem categoria aparecem para organizar com um toque. */
const OUTROS = '❓ Outros';
function gastosEmOutros(){ return mes(cur.y,cur.m).gastos.filter(g => g.cat === OUTROS); }
function cardOrganizar(){
  if (key(cur.y,cur.m) !== chaveHoje()) return '';
  const n = gastosEmOutros().length; if (!n) return '';
  return `<button class="alert info semana-card" data-act="organizar"><span>🧹</span><div><b>${n} gasto${n>1?'s':''} em “Outros”</b><br>Escolha a categoria com um toque para seus gráficos e dicas ficarem certos.</div></button>`;
}
function abrirOrganizar(){
  const gs = gastosEmOutros();
  if (!gs.length){ fechar(); render(); return toast('Tudo organizado ✓'); }
  abrir(`<h2>🧹 Organizar “Outros”</h2>
    <p class="note" style="margin:0 0 12px">Escolha a categoria de cada gasto. O Tino aprende e acerta sozinho na próxima vez que você escrever algo parecido.</p>
    <div class="org-lista">${gs.map(g => `<div class="org-item"><div class="org-t"><b>${esc(g.desc || 'Sem descrição')}</b><span class="num">${brl(g.valor)} · ${fmtData(g.data)}</span></div>
      <div class="org-cats">${catsVisiveis().filter(c => c !== OUTROS).map(c => `<button data-act="orgCat" data-id="${g.id}" data-c="${esc(c)}" title="${esc(nomeCat(c))}">${emojiCat(c)}<small>${esc(nomeCat(c))}</small></button>`).join('')}</div></div>`).join('')}</div>`);
}

/* ---------- lista de espera: Tino Conectado ----------
   Valida o interesse num plano futuro com Open Finance antes de construir.
   Mostra um card no Resumo até a pessoa entrar na lista ou dispensar; também fica em Ajustes. */
const PRECOS_LISTA = [['ate10','Até R$9,90'],['ate15','Até R$14,90'],['ate20','Até R$19,90'],['mais20','Mais de R$20'],['nao','Não pagaria']];
const BANCOS_LISTA = ['Nubank','Itaú','Bradesco','Caixa','Banco do Brasil','Santander','Inter','C6','Mercado Pago','PicPay','Outro'];
let listaSel = { preco:'', bancos:[] };
function cardConectado(){
  if (DEMO || !S.conta || S.lista) return '';
  return `<div class="alert info conectado"><span>🏦</span><div><b>Em breve: Tino Conectado</b><br>Seus gastos entrando sozinhos, direto do seu banco, pelo Open Finance. Quer ser avisado primeiro?
    <div class="acts"><button class="btn pri" data-act="listaAbrir">Quero saber mais</button><button class="btn sec" data-act="listaDispensar">Agora não</button></div></div></div>`;
}
function abrirLista(){
  listaSel = { preco:'', bancos:[] };
  abrir(`<h2>🏦 Tino Conectado</h2>
    <p class="note" style="margin:0 0 10px">Estamos estudando conectar o Tino ao seu banco pelo <b>Open Finance</b>: seus gastos e entradas entrariam sozinhos, sem digitar nada.</p>
    <p class="note" style="margin:0 0 14px">Seria um <b>plano opcional, com mensalidade</b>, porque a conexão com os bancos tem um custo mensal. <b>O Tino que você comprou continua vitalício</b>, sem nada a pagar.</p>
    <div class="f"><label>Quanto você pagaria por mês por isso?</label><div class="opcoes" id="lPreco">${PRECOS_LISTA.map(([v,l])=>`<button data-act="listaPreco" data-v="${v}">${l}</button>`).join('')}</div></div>
    <div class="f"><label>Quais bancos você usa? (pode marcar vários)</label><div class="opcoes" id="lBancos">${BANCOS_LISTA.map(b=>`<button data-act="listaBanco" data-v="${esc(b)}">${esc(b)}</button>`).join('')}</div></div>
    ${S.conta.includes('@') ? '' : '<div class="f"><label>Seu e-mail, para avisarmos</label><input id="lEmail" type="email" inputmode="email" autocomplete="email" placeholder="seuemail@exemplo.com"></div>'}
    <button class="btn pri" data-act="listaEntrar">Entrar na lista de espera</button>
    ${S.conta.includes('@') ? `<p class="note" style="text-align:center;margin-top:10px">Vamos avisar no e-mail ${esc(S.conta)} quando estiver disponível.</p>` : ''}`);
}
function entrarLista(btn){
  if (!listaSel.preco) return toast('Escolha quanto você pagaria por mês');
  // Quem entrou com código (sem e-mail) informa o e-mail aqui.
  const email = S.conta.includes('@') ? S.conta : (document.getElementById('lEmail')?.value || '').trim();
  if (!/^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i.test(email)) return toast('Digite um e-mail válido');
  btn.disabled = true; btn.textContent = 'Enviando…';
  fetch('api/lista', { method:'POST', headers:{'Content-Type':'application/json'},
    body: JSON.stringify({ email, preco:listaSel.preco, bancos:listaSel.bancos, de:'app', cliente:true }) })
    .then(r => { if (!r.ok) throw 0; S.lista = new Date().toISOString(); salvar(); fechar(); render(); toast('Você está na lista! Vamos te avisar 💚'); })
    .catch(() => { btn.disabled = false; btn.textContent = 'Entrar na lista de espera'; toast('Não foi possível enviar. Confira a internet.'); });
}

/* ---------- excluir conta ----------
   Exigido pelas lojas de apps. Apaga os dados do servidor (api/excluir.js) e todos os dados deste aparelho. */
function abrirExcluirConta(){
  abrir(`<h2>Excluir minha conta</h2>
    <p class="note" style="margin:0 0 10px">Isso apaga <b>todos os seus lançamentos neste aparelho</b> e, no nosso servidor, seus aparelhos conectados, notificações, backup na nuvem, depoimento e inscrição na lista de espera.</p>
    <p class="note" style="margin:0 0 10px">Guardamos só o registro da sua compra (e-mail e data), como comprovante. Se um dia quiser voltar, é só entrar com o mesmo e-mail: o acesso que você pagou continua valendo, mas o app começa do zero.</p>
    <p class="note" style="margin:0 0 14px">Se quiser guardar seus dados antes, faça um <b>backup em arquivo</b> em Ajustes.</p>
    <div class="f"><label>Para confirmar, digite EXCLUIR</label><input id="exConf" autocomplete="off" autocapitalize="characters"></div>
    <button class="btn dan" data-act="excluirConfirmar">Excluir minha conta definitivamente</button>
    <button class="btn sec" data-act="fechar">Cancelar</button>`);
}
async function excluirConta(btn){
  if ((document.getElementById('exConf').value || '').trim().toUpperCase() !== 'EXCLUIR') return toast('Digite EXCLUIR para confirmar');
  if (!navigator.onLine) return toast('Conecte-se à internet para excluir a conta');
  btn.disabled = true; btn.textContent = 'Excluindo…';
  try {
    const r = await fetch('api/excluir', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ conta:S.conta, aparelho:idAparelho() }) });
    if (!r.ok) throw 0;
  } catch(e){ btn.disabled = false; btn.textContent = 'Excluir minha conta definitivamente'; return toast('Não foi possível excluir agora. Tente de novo ou fale com o suporte.'); }
  // Só os dados desta conta: outras contas guardadas neste aparelho continuam intactas.
  try { [STORE_KEY, CONTA_KEY(S.conta), NUVEM_KEY(S.conta)].forEach(k => localStorage.removeItem(k)); } catch(e){}
  S = novoEstado(); aba = 'resumo'; fechar(); render();
  alert('Sua conta foi excluída. Obrigado por ter usado o Tino.');
}

/* ---------- central de ajuda ---------- */
const PERGUNTAS_AJUDA = [
  ['📲 Como instalo o app na tela de início?', 'No <b>iPhone</b>, abra o link no Safari, toque em <b>Compartilhar</b> <span class="kbd">⬆︎</span> e depois em <b>Adicionar à Tela de Início</b>. No <b>Android</b>, abra no Chrome, toque no menu <span class="kbd">⋮</span> e em <b>Instalar app</b>. Depois, abra sempre pelo ícone do Tino.'],
  ['🔄 Troquei de celular. Como levo meus dados?', 'Com o <b>backup na nuvem</b> ligado (em <b>Ajustes → Backup dos dados</b>), é só entrar no celular novo com o mesmo e-mail: o app oferece recuperar tudo com a senha do backup. Sem ele, faça <b>Fazer backup</b> no celular antigo, guarde o arquivo e use <b>Restaurar backup</b> no novo.'],
  ['🔑 Esqueci a senha do backup na nuvem', 'Por segurança, ninguém consegue abrir o backup sem a senha, nem a nossa equipe. Seus dados neste celular continuam aqui: em <b>Ajustes</b>, desligue o backup na nuvem e ative de novo com uma senha nova.'],
  ['🤔 Por que os dados de um aparelho não aparecem no outro?', 'Cada aparelho guarda os próprios dados, para sua privacidade. No iPhone, o app instalado e o Safari também são separados. Para levar os dados de um para o outro, use o backup.'],
  ['💾 Como faço backup?', 'O mais fácil é ativar o <b>backup na nuvem</b> em <b>Ajustes → Backup dos dados</b>: ele é feito sozinho uma vez por dia e é criptografado com uma senha que só você sabe. Você também pode tocar em <b>Fazer backup</b> para guardar um arquivo.'],
  ['🎙️ Como lanço um gasto falando ou escrevendo?', 'Ao lançar um gasto, use o campo com ✨ no topo e escreva ou dite algo como <b>“gastei 45 no ifood no crédito”</b>. O app preenche valor, categoria e forma de pagamento. No iPhone, toque no microfone do teclado para ditar.'],
  ['💳 Como funcionam os cartões e as faturas?', 'Em <b>Planejar → Cartões</b>, cadastre o dia de fechamento e de vencimento. Ao lançar uma compra no crédito, ela cai na fatura certa, e as parcelas entram sozinhas nos próximos meses.'],
  ['🔒 Como coloco senha ou Face ID?', 'Em <b>Ajustes → Privacidade</b>, crie uma senha de 4 dígitos. Depois disso, aparece a opção de entrar com Face ID ou digital, se o seu aparelho tiver.'],
  ['🔔 As notificações não chegam. O que faço?', 'No iPhone, as notificações só funcionam com o app <b>instalado na tela de início</b>. Ative em <b>Ajustes → Notificações</b> e permita quando o celular perguntar. Use <b>Enviar notificação de teste</b> para conferir.'],
  ['📱 Em quantos aparelhos posso usar?', 'Em até 3 aparelhos com o mesmo e-mail. Em <b>Ajustes → Conta → Aparelhos conectados</b> você vê e remove aparelhos para liberar espaço.'],
  ['🛡️ Como funciona a garantia?', 'Você tem 7 dias de garantia a partir da compra. Se precisar, fale com o suporte pelos botões abaixo.']
];
function linkSuporte(){
  const corpo = `\n\n—\nApp: ${CONFIG.nomeApp} v${APP_VERSAO}\nAparelho: ${nomeAparelho()}${S.conta ? '\nConta: '+S.conta : ''}`;
  return {
    whats: CONFIG.suporteWhatsApp ? `https://wa.me/${CONFIG.suporteWhatsApp}?text=${encodeURIComponent('Olá! Preciso de ajuda com o Tino Finanças.')}` : '',
    email: `mailto:${CONFIG.suporteEmail}?subject=${encodeURIComponent('Ajuda com o '+CONFIG.nomeApp)}&body=${encodeURIComponent('Escreva sua dúvida aqui:'+corpo)}`
  };
}
function abrirAjuda(){
  const l = linkSuporte();
  abrir(`<h2>❓ Central de ajuda</h2>
    <div class="ajuda">${PERGUNTAS_AJUDA.map(([p,r])=>`<details><summary>${p}</summary><p>${r}</p></details>`).join('')}</div>
    <h3 class="ajuda-t">Ainda precisa de ajuda?</h3>
    ${l.whats ? `<a class="btn pri" href="${l.whats}" target="_blank" rel="noopener">💬 Falar no WhatsApp</a>` : ''}
    <a class="btn ${l.whats?'sec':'pri'}" href="${l.email}">✉️ Enviar e-mail para o suporte</a>
    <p class="note" style="text-align:center">${esc(CONFIG.suporteEmail)}</p>
    <button class="btn sec" data-act="ajudaTour">🎓 Ver o tutorial de novo</button>
    <p class="note" style="text-align:center;margin-top:14px"><a href="privacidade.html" target="_blank" rel="noopener">Política de privacidade</a> · <a href="termos.html" target="_blank" rel="noopener">Termos de uso</a></p>`);
}

/* ---------- pedido de depoimento ----------
   Pede uma vez depois de 7 dias de uso (e pelo menos 3 dias com lançamentos).
   "Agora não" pergunta de novo em 10 dias, no máximo mais uma vez. */
function talvezPedirDepoimento(){
  if (DEMO || !S.liberado || !S.perfil.ok || !S.conta || !navigator.onLine || ocupado()) return;
  if (document.getElementById('conq')) return setTimeout(talvezPedirDepoimento, 5000);   // espera o aviso de conquista sumir
  const d = S.depo || {};
  if (d.enviado || d.nunca || (d.vezes||0) >= 2) return;
  if (d.depoisDe && Date.now() < new Date(d.depoisDe).getTime()) return;
  const dias = [...new Set(S.diasAtivos||[])].sort();
  if (dias.length < 3 || diasDesde(dias[0]) < 7) return;
  abrirDepoimento(true);
}
let depoNotaSel = 0;
function abrirDepoimento(automatico){
  depoNotaSel = 0; if (automatico) pediuOpiniao = true;
  const primeiro = (S.perfil.nome||'').trim().split(/\s+/)[0] || '';
  abrir(`<h2>💬 Está gostando do Tino?</h2>
    <p class="note" style="margin:0 0 12px">Sua opinião ajuda a melhorar o app e a mostrar para outras pessoas como ele funciona na prática.</p>
    <div class="estrelas" role="radiogroup" aria-label="Sua nota">${[1,2,3,4,5].map(n=>`<button data-act="depoNota" data-v="${n}" aria-label="${n} estrela${n>1?'s':''}">★</button>`).join('')}</div>
    <div class="f"><label id="dLabel">Conte em uma frase o que mudou para você</label><textarea id="dTexto" rows="3" maxlength="600" placeholder="Ex.: agora eu sei exatamente quanto posso gastar até o fim do mês"></textarea></div>
    <div class="f"><label>Seu primeiro nome</label><input id="dNome" value="${esc(primeiro)}" maxlength="40" autocomplete="given-name"></div>
    <label class="aut" id="dAutLinha"><input type="checkbox" id="dAut"> <span>Autorizo publicar este depoimento com meu primeiro nome</span></label>
    <button class="btn pri" data-act="depoEnviar">Enviar</button>
    ${automatico ? `<button class="btn sec" data-act="depoDepois">Agora não</button><button class="link-sutil" data-act="depoNunca">Não perguntar mais</button>` : ''}`);
}
function depoNota(n){
  depoNotaSel = n;
  document.querySelectorAll('.estrelas button').forEach((b,i)=>b.classList.toggle('on', i < n));
  const baixa = n <= 3;
  document.getElementById('dLabel').textContent = baixa ? 'O que podemos melhorar?' : 'Conte em uma frase o que mudou para você';
  document.getElementById('dTexto').placeholder = baixa ? 'Conte o que não funcionou bem ou o que faltou' : 'Ex.: agora eu sei exatamente quanto posso gastar até o fim do mês';
}
function enviarDepoimento(){
  const texto = document.getElementById('dTexto').value.trim();
  if (!depoNotaSel) return toast('Toque nas estrelas para dar sua nota');
  if (texto.length < 3) return toast('Escreva pelo menos uma frase');
  const btn = document.querySelector('[data-act="depoEnviar"]'); btn.disabled = true; btn.textContent = 'Enviando…';
  fetch('api/depoimentos', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({
    conta:S.conta, aparelho:idAparelho(), nota:depoNotaSel, texto,
    nome:document.getElementById('dNome').value.trim(), autoriza:document.getElementById('dAut').checked }) })
    .then(r => { if (!r.ok) throw 0;
      S.depo = { ...(S.depo||{}), enviado:true }; salvar(); fechar();
      toast(depoNotaSel >= 4 ? 'Obrigado pelo depoimento! 💚' : 'Obrigado! Vamos usar sua opinião para melhorar.'); })
    .catch(() => { btn.disabled = false; btn.textContent = 'Enviar'; toast('Não foi possível enviar. Confira a internet e tente de novo.'); });
}

/* ---------- pesquisa de satisfação (NPS) ----------
   Pergunta uma vez, depois de 14 dias desde o primeiro lançamento e com pelo menos 5 dias de uso.
   Nunca junto com o pedido de depoimento. "Agora não" pergunta de novo em 14 dias, no máximo mais uma vez. */
let pediuOpiniao = false, npsNotaSel = null;
function talvezPedirNps(){
  if (DEMO || !S.liberado || !S.perfil.ok || !S.conta || !navigator.onLine || ocupado() || pediuOpiniao) return;
  if (document.getElementById('conq')) return setTimeout(talvezPedirNps, 5000);
  const n = S.nps || {};
  if (n.enviado || (n.vezes||0) >= 2) return;
  if (n.depoisDe && Date.now() < new Date(n.depoisDe).getTime()) return;
  const dias = [...new Set(S.diasAtivos||[])].sort();
  if (dias.length < 5 || diasDesde(dias[0]) < 14) return;
  pediuOpiniao = true; abrirNps();
}
function abrirNps(){
  npsNotaSel = null;
  abrir(`<h2>Uma pergunta rápida</h2>
    <p class="note" style="margin:0 0 14px">De 0 a 10, quanto você indicaria o Tino para um amigo ou alguém da família?</p>
    <div class="nps" role="radiogroup" aria-label="Sua nota de 0 a 10">${[...Array(11).keys()].map(n=>`<button data-act="npsNota" data-v="${n}" aria-label="Nota ${n}">${n}</button>`).join('')}</div>
    <div class="nps-leg"><span>Nada provável</span><span>Muito provável</span></div>
    <div class="f" id="npsMais" hidden><label id="npsLabel"></label><textarea id="npsTexto" rows="3" maxlength="600"></textarea></div>
    <p class="note" id="npsAjuda" hidden style="margin:-4px 0 12px">Travou em alguma coisa? <button class="link-sutil" data-act="ajuda" style="display:inline;padding:0;margin:0">Veja a central de ajuda</button> ou fale com a gente.</p>
    <button class="btn pri" data-act="npsEnviar">Enviar</button>
    <button class="btn sec" data-act="npsDepois">Agora não</button>`);
}
function npsNota(n){
  npsNotaSel = n;
  document.querySelectorAll('.nps button').forEach((b,i) => b.classList.toggle('on', i === n));
  const t = n >= 9 ? ['O que você mais gosta no Tino?', 'Ex.: saber quanto posso gastar por dia'] : n >= 7 ? ['O que faria você dar 10?', 'Conte o que falta para o Tino ser perfeito para você'] : ['O que podemos melhorar?', 'Conte o que não funcionou bem ou o que ficou difícil'];
  document.getElementById('npsMais').hidden = false;
  document.getElementById('npsLabel').textContent = t[0] + ' (opcional)';
  document.getElementById('npsTexto').placeholder = t[1];
  document.getElementById('npsAjuda').hidden = n > 6;
}
function enviarNps(){
  if (npsNotaSel === null) return toast('Toque em um número de 0 a 10');
  const btn = document.querySelector('[data-act="npsEnviar"]'); btn.disabled = true; btn.textContent = 'Enviando…';
  fetch('api/nps', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({
    conta:S.conta, aparelho:idAparelho(), nota:npsNotaSel, texto:document.getElementById('npsTexto').value.trim(), versao:APP_VERSAO }) })
    .then(r => { if (!r.ok) throw 0;
      S.nps = { ...(S.nps||{}), enviado:true, nota:npsNotaSel }; salvar(); fechar();
      if (npsNotaSel >= 9 && podeIndicar()) setTimeout(() => abrirIndique('Que bom que você gosta do Tino! 💚 Que tal indicar para alguém? Seu amigo ganha desconto e você ganha um presente.'), 400);
      else toast(npsNotaSel >= 9 ? 'Obrigado! Ficamos muito felizes 💚' : 'Obrigado! Vamos usar sua resposta para melhorar.'); })
    .catch(() => { btn.disabled = false; btn.textContent = 'Enviar'; toast('Não foi possível enviar. Confira a internet e tente de novo.'); });
}

/* ---------- indique e ganhe ----------
   O amigo paga R$ 20 em vez de R$ 27 pelo link do convite (oferta própria na Cakto, sem cupom); quem indica ganha a planilha a partir do primeiro amigo que comprar.
   Código, contagem e link da planilha vêm do servidor (api/indique). No endereço de teste o código é de exemplo. */
const LINK_INDIQUE = 'https://tinofinancas.com.br/?ref=';   // curto para compartilhar; o redirecionamento mantém o ?ref
let indique = null;
function podeIndicar(){ return !DEMO && !!(S.conta || TESTE); }
function cardIndique(){
  if (!podeIndicar() || S.indiqueOculto || S.indiqueVisto || new Set(S.diasAtivos||[]).size < 5) return '';
  return `<div class="alert info backup"><span>🎁</span><div><b>Indique o Tino e ganhe a planilha</b><br>Seu amigo paga R$ 20 em vez de R$ 27, e você ganha a Planilha de Organização Financeira.
    <div class="acts"><button class="btn sec" data-act="indique">Ver meu convite</button><button class="btn sec" data-act="indiqueOcultar">Agora não</button></div></div></div>`;
}
const postIndique = (dados) => fetch('api/indique', { method:'POST', headers:{'Content-Type':'application/json'},
  body: JSON.stringify({ conta:S.conta, aparelho:idAparelho(), ...dados }) }).then(r => r.ok ? r.json() : Promise.reject());
async function abrirIndique(intro){
  abrir(`<h2>🎁 Indique e ganhe</h2><p class="note">Carregando seu convite…</p>`);
  try {
    indique = TESTE && !S.conta ? { codigo:'TESTE7K', amigos:0, cupom:'AMIGOTINO', planilha:'', indicado:true, exemplo:true }
      : await postIndique({ acao:'meu', nome:S.perfil.nome });
  } catch(e){
    abrir(`<h2>🎁 Indique e ganhe</h2><p class="note" style="margin:0 0 14px">Não foi possível carregar seu convite. Confira a internet e tente de novo.</p><button class="btn sec" data-act="fechar">Fechar</button>`); return;
  }
  if (!$ov.classList.contains('open')) return;   // a pessoa fechou enquanto carregava
  const I = indique;
  if (!S.indiqueVisto || (I.indicado && S.conta && !S.indicadoInformado)){ S.indiqueVisto = true; if (I.indicado && S.conta) S.indicadoInformado = true; salvar(); render(); }
  abrir(`<h2>🎁 Indique e ganhe</h2>
    ${intro ? `<p class="note" style="margin:-4px 0 12px">${intro}</p>` : ''}
    <div class="ind-passos">
      <div><b>1</b><span>Mande o seu convite para um amigo</span></div>
      <div><b>2</b><span>Pelo seu link, ele paga <b>R$ 20</b> em vez de R$ 27, com o desconto já aplicado</span></div>
      <div><b>3</b><span>Você ganha a <b>Planilha de Organização Financeira</b> (R$ 17) quando o primeiro amigo comprar</span></div>
    </div>
    <div class="ind-cod"><small>Seu código</small><b>${esc(I.codigo)}</b></div>
    ${I.exemplo ? '<p class="note" style="margin:0 0 12px;text-align:center">No endereço de teste o código é só um exemplo.</p>' : ''}
    <button class="btn pri" data-act="indiqueEnviar">📲 Enviar convite</button>
    <button class="btn sec" data-act="indiqueCopiar">Copiar link</button>
    <p class="ind-placar">${I.amigos ? `🎉 <b>${I.amigos} amigo${I.amigos>1?'s':''}</b> já compr${I.amigos>1?'aram':'ou'} com o seu convite` : 'Nenhum amigo comprou com o seu convite ainda.'}</p>
    ${I.planilha ? `<a class="btn pri" href="${esc(I.planilha)}" target="_blank" rel="noopener">📊 Pegar minha planilha</a>` : I.amigos ? '<p class="note" style="text-align:center">Sua planilha está sendo preparada e logo aparece aqui.</p>' : ''}
    <p class="note" style="margin:14px 0 0">Se o amigo não usar o seu link, peça para ele digitar o seu código no app (Ajustes → Indique e ganhe) em até 30 dias depois da compra.</p>
    ${!I.indicado ? '<button class="link-sutil" data-act="indiqueUsar">Alguém te indicou? Digite o código</button>' : ''}`);
}
function textoConvite(){ return `Estou usando o Tino Finanças para organizar meu dinheiro. Com o meu convite você paga R$ 20 em vez de R$ 27, com o desconto já aplicado neste link: ${LINK_INDIQUE + indique.codigo}`; }
function abrirUsarIndicacao(){
  abrir(`<h2>Quem te indicou?</h2>
    <p class="note" style="margin:-4px 0 14px">Digite o código de quem te indicou o Tino. Assim essa pessoa ganha o presente dela. Vale até 30 dias depois da compra.</p>
    <div class="f"><label>Código</label><input id="indCod" maxlength="12" autocapitalize="characters" autocomplete="off" placeholder="Ex.: ANA7KQ" style="text-transform:uppercase"></div>
    <button class="btn pri" data-act="indiqueConfirmar">Confirmar</button>
    <button class="btn sec" data-act="fechar">Cancelar</button>`);
  setTimeout(() => { const el = document.getElementById('indCod'); if (el) el.focus(); }, 250);
}
function confirmarIndicacao(btn){
  const codigo = document.getElementById('indCod').value.trim();
  if (codigo.length < 4) return toast('Digite o código completo');
  if (TESTE && !S.conta) return toast('No endereço de teste não dá para confirmar códigos');
  btn.disabled = true; btn.textContent = 'Confirmando…';
  postIndique({ acao:'usar', codigo }).then(d => {
    if (!d.ok){ btn.disabled = false; btn.textContent = 'Confirmar'; return toast(d.erro || 'Não foi possível confirmar'); }
    S.indicadoInformado = true; salvar(); fechar(); render(); toast('Pronto! Obrigado por informar 💚');
  }).catch(() => { btn.disabled = false; btn.textContent = 'Confirmar'; toast('Não foi possível confirmar. Confira a internet.'); });
}

/* ---------- Tino Plus (escondido: aparece para convidados, assinantes e quem abriu o link ?plus=1) ----------
   Login com código de 6 dígitos enviado por e-mail (api/plus). A sessão fica numa chave própria do aparelho,
   fora do S, para não ir junto nos arquivos de backup. */
const PLUS_KEY = 'orgfin:plus';
// Convidados para testar o Plus (liberados no painel admin). Quem ainda não foi convidado confere a cada abertura
// (no máximo a cada 10 minutos), para o convite aparecer logo; quem já foi, confere uma vez por dia.
// Link de convite: quem abre o app com ?plus=1 passa a ver o Tino Plus em Ajustes (S.plusLink).
const plusVisivel = () => !DEMO && (TESTE || !!S.plusConvite || !!S.plusLink || !!plusSessao());
function conferirConvitePlus(){
  if (DEMO || TESTE || !S.conta || !S.conta.includes('@') || !navigator.onLine) return;
  const ult = +S.plusConviteEm || 0;
  if (S.plusConvite ? S.plusConviteVisto === dataHoje() : Date.now() - ult < 10 * 60e3) return;
  fetch('api/plus', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ acao:'convite', conta:S.conta, aparelho:idAparelho() }) })
    .then(r => r.ok ? r.json() : null).then(d => {
      if (!d || !d.ok) return;
      const antes = !!S.plusConvite; S.plusConvite = !!d.convidado; S.plusConviteVisto = dataHoje(); S.plusConviteEm = Date.now(); salvar();
      if (antes !== S.plusConvite && !ocupado()) render();
    }).catch(() => {});
}
function cardConvitePlus(){
  if (!S.plusConvite || S.plusAvisoVisto || plusSessao()) return '';
  return `<div class="alert info backup"><span>⭐</span><div><b>Você foi convidado para testar o Tino Plus</b><br>Seus dados em todos os aparelhos, sempre sincronizados. Você testa antes de todo mundo.
    <div class="acts"><button class="btn sec" data-act="plusConviteVer">Quero testar</button><button class="btn sec" data-act="plusConviteDepois">Depois</button></div></div></div>`;
}
function plusSessao(){ try { return JSON.parse(localStorage.getItem(PLUS_KEY) || 'null'); } catch(e){ return null; } }
function plusGuardar(v){ try { v ? localStorage.setItem(PLUS_KEY, JSON.stringify(v)) : localStorage.removeItem(PLUS_KEY); } catch(e){} }
function plusApi(dados, rota){
  const ses = plusSessao();
  return fetch('api/' + (rota || 'plus'), { method:'POST', headers:{ 'Content-Type':'application/json', ...(ses ? { Authorization:'Bearer ' + ses.token } : {}) },
    body: JSON.stringify(dados) }).then(r => r.json().catch(() => ({ ok:false })).then(d => ({ ...d, status:r.status })));
}
let plusEmail = '';
async function abrirPlus(){
  const ses = plusSessao();
  if (!ses){
    plusEmail = S.conta && S.conta.includes('@') ? S.conta : '';
    return abrir(`<h2>⭐ Tino Plus</h2>
      <p class="note" style="margin:-4px 0 14px">Entre com o seu e-mail. Vamos enviar um código de 6 números para confirmar que é você.</p>
      <div class="f"><label>E-mail</label><input id="plusEmail" type="email" inputmode="email" autocomplete="email" value="${esc(plusEmail)}" placeholder="seuemail@exemplo.com"></div>
      <button class="btn pri" data-act="plusPedir">Enviar código</button>`);
  }
  abrir(`<h2>⭐ Tino Plus</h2><p class="note">Carregando…</p>`);
  const d = await plusApi({ acao:'eu' }).catch(() => ({ ok:false }));
  if (d.status === 401){ plusGuardar(null); return abrirPlus(); }
  if (!d.ok) return abrir(`<h2>⭐ Tino Plus</h2><p class="note" style="margin:0 0 14px">Sem conexão com o servidor. Tente de novo em instantes.</p><button class="btn sec" data-act="fechar">Fechar</button>`);
  const c = d.conta;
  abrir(`<h2>⭐ Tino Plus</h2>
    <p class="note" style="margin:-4px 0 14px">Conectado como <b>${esc(c.email)}</b>.</p>
    <div class="ind-cod"><small>Seu plano</small><b style="letter-spacing:0">${c.plusAtivo ? (c.convidado ? 'Plus (teste)' : 'Plus ativo') : 'Gratuito'}</b>${c.plusAtivo && c.plusAte ? `<small style="margin-top:4px">até ${new Date(c.plusAte).toLocaleDateString('pt-BR')}</small>` : ''}</div>
    ${c.convidado ? '<p class="note" style="text-align:center;margin:0 0 14px">Obrigado por testar! Conte o que achou pelo e-mail de suporte (Ajustes → Ajuda).</p>' : ''}
    ${blocoAssinatura(c)}
    ${c.plusAtivo || c.teste ? blocoSync() + blocoWhatsApp(c) : ''}
    <button class="btn sec" data-act="plusSair">Sair do Plus neste aparelho</button>`);
}
// Assinatura: quem não tem o Plus vê o que ganha e o botão da Cakto; quem assina vê a renovação e como cancelar.
function blocoAssinatura(c){
  const dt = (d) => d ? new Date(d).toLocaleDateString('pt-BR') : '', a = c.assinatura;
  const cancelar = `mailto:${CONFIG.suporteEmail}?subject=${encodeURIComponent('Cancelar Tino Plus')}&body=${encodeURIComponent('Quero cancelar a assinatura do Tino Plus da conta ' + c.email + '.')}`;
  if (c.plusAtivo && a && !c.convidado){
    const st = a.status === 'canceled' ? `Assinatura cancelada. O Plus continua até <b>${dt(c.plusAte)}</b>.`
      : /late|refused/.test(a.evento || a.status || '') || a.status === 'late' ? `⚠️ Não conseguimos cobrar a renovação. Atualize o pagamento pelo e-mail da Cakto até <b>${dt(c.plusAte)}</b> para não perder o Plus.`
      : `${a.proxima ? `Renova em <b>${dt(a.proxima)}</b>` : 'Renova todo mês'}${a.valor ? ` · ${brl(a.valor)}/mês` : ''}.`;
    return `<p class="note" style="text-align:center;margin:0 0 14px">${st}</p>
      ${a.status === 'canceled' ? '' : `<p class="note" style="text-align:center;margin:-6px 0 14px"><a href="${cancelar}" style="color:inherit">Cancelar assinatura</a></p>`}`;
  }
  if (c.plusAtivo) return c.fundador ? '<p class="note" style="text-align:center;margin:0 0 14px">🌟 Você é fundador: tem preço especial no Plus.</p>' : '';
  const link = c.fundador ? LINK_PLUS_FUNDADOR : LINK_PLUS;
  return `<h3 style="margin:4px 0 8px">O que você ganha com o Plus</h3>
    <p class="note" style="margin:0 0 8px">🔄 <b>Seus dados em todos os aparelhos</b>, salvos no servidor. Trocou de celular, nada se perde.</p>
    <p class="note" style="margin:0 0 8px">💬 <b>Tino no WhatsApp:</b> anote gastos por texto, foto do comprovante ou áudio, e pergunte "quanto posso gastar hoje?".</p>
    <p class="note" style="margin:0 0 14px">🔔 <b>Lembretes no WhatsApp</b> das contas e da fatura do cartão, e o resumo da sua semana.</p>
    <div class="ind-cod"><small>${c.fundador ? '🌟 Preço de fundador, para sempre' : 'Assinatura mensal'}</small><b style="letter-spacing:0">${c.fundador ? 'R$ 9,90' : 'R$ 14,90'}<span style="font-size:.5em">/mês</span></b><small style="margin-top:4px">Cancele quando quiser</small></div>
    ${link ? `<a class="btn pri" href="${link}" target="_blank" rel="noopener">⭐ Assinar o Tino Plus</a>
      <p class="note" style="margin:10px 0 12px">Na compra, use o e-mail <b>${esc(c.email)}</b>. Depois de pagar, volte aqui e toque em "Já assinei".</p>
      <button class="btn sec" data-act="plus">Já assinei</button>` : '<p class="note" style="text-align:center;margin:0 0 14px">A assinatura abre em breve.</p>'}`;
}
// Tino no WhatsApp: o app gera um código, o cliente manda para o número do Tino e pronto.
function blocoWhatsApp(c){
  if (c.whatsapp) return `<h3 style="margin:18px 0 6px">💬 Tino no WhatsApp</h3>
    <p class="note" style="margin:0 0 12px">✅ Conectado. Mande seus gastos para o Tino no WhatsApp, do seu jeito: "gastei 45 no mercado no pix", "uber 23 ontem", "tênis 600 em 3x no crédito", uma foto do comprovante ou um áudio. E pergunte: "quanto posso gastar hoje?"</p>
    <p class="note" style="margin:0 0 12px">🔔 <b>Lembretes no WhatsApp:</b> ${S.waLembretes === false ? 'desligados.' : 'ligados. O Tino avisa na véspera das contas e das faturas que vencem, quando a fatura vai fechar e, aos domingos, quanto você gastou na semana.'}</p>
    <button class="btn sec" data-act="waLembretes">${S.waLembretes === false ? '🔔 Ligar lembretes' : '🔕 Desligar lembretes'}</button>
    <button class="link-sutil" data-act="waDesligar">Desconectar o WhatsApp</button>`;
  if (!(syncEstado() || {}).ligado) return `<h3 style="margin:18px 0 6px">💬 Tino no WhatsApp</h3>
    <p class="note" style="margin:0 0 12px">Ligue a sincronização acima para poder anotar seus gastos pelo WhatsApp.</p>`;
  return `<h3 style="margin:18px 0 6px">💬 Tino no WhatsApp</h3>
    <p class="note" style="margin:0 0 12px">Anote gastos mandando uma mensagem, sem abrir o app: "gastei 45 no mercado no pix".</p>
    <button class="btn sec" data-act="waConectar">💬 Conectar WhatsApp</button><div id="waBox"></div>`;
}
function conectarWhatsApp(btn){
  btn.disabled = true; btn.textContent = 'Gerando código…';
  plusApi({ acao:'waCodigo' }).then(d => {
    if (!d.ok){ btn.disabled = false; btn.textContent = '💬 Conectar WhatsApp'; return toast(d.erro || 'Não foi possível gerar o código'); }
    btn.hidden = true;
    const link = `https://wa.me/${d.numero}?text=${encodeURIComponent(d.codigo)}`;
    document.getElementById('waBox').innerHTML = `<div class="ind-cod"><small>Seu código (vale 15 minutos)</small><b>${esc(d.codigo)}</b></div>
      <a class="btn pri" href="${link}" target="_blank" rel="noopener">Abrir o WhatsApp e enviar o código</a>
      <p class="note" style="margin:10px 0 0">A conversa abre com o código já escrito: é só tocar em enviar. O Tino responde confirmando. Depois, toque em "Ver minha conta Plus" de novo para atualizar.</p>`;
  }).catch(() => { btn.disabled = false; btn.textContent = '💬 Conectar WhatsApp'; toast('Sem conexão. Tente de novo.'); });
}
function blocoSync(){
  const st = syncEstado();
  if (!st || !st.ligado) return `<h3 style="margin:18px 0 6px">🔄 Seus dados em todos os aparelhos</h3>
    <p class="note" style="margin:0 0 12px">Com a sincronização, seus lançamentos ficam salvos no servidor do Tino e aparecem em qualquer aparelho em que você entrar com este e-mail. Se perder ou trocar de celular, nada se perde.</p>
    <p class="note" style="margin:0 0 12px">🔒 Seus dados ficam protegidos pelo seu login e só são usados para os recursos do Tino (como o assistente no WhatsApp). Diferente do backup com senha, o servidor do Tino consegue ler estes dados para fazer esses recursos funcionarem.</p>
    <button class="btn pri" data-act="syncLigar">Ligar sincronização</button>`;
  const quando = st.ultima ? new Date(st.ultima).toLocaleString('pt-BR', { dateStyle:'short', timeStyle:'short' }) : 'ainda não';
  return `<h3 style="margin:18px 0 6px">🔄 Sincronização ligada</h3>
    <p class="note" style="margin:0 0 12px">Última sincronização: <b>${quando}</b>${st.erro ? ` · <span style="color:var(--danger-ink)">não foi possível na última tentativa</span>` : ''}.</p>
    <button class="btn sec" data-act="syncAgora">🔄 Sincronizar agora</button>
    <button class="link-sutil" data-act="syncDesligar">Desligar a sincronização neste aparelho</button>`;
}
function plusPedir(btn){
  plusEmail = document.getElementById('plusEmail').value.trim().toLowerCase();
  if (!/^\S+@\S+\.\S+$/.test(plusEmail)) return toast('Confira o e-mail digitado');
  btn.disabled = true; btn.textContent = 'Enviando…';
  plusApi({ acao:'pedir', email:plusEmail }).then(d => {
    if (!d.ok){ btn.disabled = false; btn.textContent = 'Enviar código'; return toast(d.erro || 'Não foi possível enviar'); }
    abrir(`<h2>Digite o código</h2>
      <p class="note" style="margin:-4px 0 14px">Enviamos um código de 6 números para <b>${esc(plusEmail)}</b>. Confira também a caixa de spam.</p>
      ${d.codigoTeste ? `<p class="note" style="margin:0 0 12px">🧪 Teste: o código é <b>${d.codigoTeste}</b>${d.enviado ? ' (e o e-mail foi enviado)' : ' (o e-mail não foi enviado)'}.</p>` : ''}
      <div class="f"><label>Código</label><input id="plusCodigo" inputmode="numeric" autocomplete="one-time-code" maxlength="6" placeholder="000000" style="font-size:24px;letter-spacing:.3em;text-align:center"></div>
      <button class="btn pri" data-act="plusEntrar">Entrar</button>
      <button class="link-sutil" data-act="plus">Usar outro e-mail ou reenviar</button>`);
    setTimeout(() => { const el = document.getElementById('plusCodigo'); if (el) el.focus(); }, 250);
  }).catch(() => { btn.disabled = false; btn.textContent = 'Enviar código'; toast('Sem conexão. Tente de novo.'); });
}
function plusEntrar(btn){
  const codigo = document.getElementById('plusCodigo').value.replace(/\D/g, '');
  if (codigo.length !== 6) return toast('Digite os 6 números');
  btn.disabled = true; btn.textContent = 'Entrando…';
  plusApi({ acao:'entrar', email:plusEmail, codigo, aparelho:idAparelho() }).then(d => {
    if (!d.ok){ btn.disabled = false; btn.textContent = 'Entrar'; return toast(d.erro || 'Não foi possível entrar'); }
    plusGuardar({ email:d.conta.email, token:d.token }); toast('Pronto, você entrou ✓'); abrirPlus();
  }).catch(() => { btn.disabled = false; btn.textContent = 'Entrar'; toast('Sem conexão. Tente de novo.'); });
}

/* ---------- sincronização do Tino Plus ----------
   O app continua gravando tudo no aparelho. Com a sincronização ligada, ele quebra os dados em itens
   (cada gasto, entrada, cartão, cofrinho... e cada configuração), compara com o que já foi enviado e manda
   só o que mudou para api/sync. Depois aplica o que veio de outros aparelhos. Vale a alteração mais recente;
   uma mudança feita aqui e ainda não enviada nunca é sobrescrita.
   Chaves:  i|<lista>|<id>  item de uma lista (ex.: i|m/2026-10/gastos|abc)
            o|<lista>       a ordem da lista (só os ids; existe mesmo com a lista vazia). Fica separada dos itens
                            para que apagar ou reordenar não reenvie, nem sobrescreva, os outros itens
            v|<caminho>     um valor inteiro (perfil, orçamentos, uma lista sem ids...)
   Campos que são só deste aparelho (acesso, senha, notificações, tema...) nunca sincronizam. */
const SYNC_LOCAIS = new Set(['v','liberado','conta','ultimoBackup','novosDesdeBackup','backupAdiado','seguranca','notif','notifSync','verificadoEm','tema','ocultar']);
const SYNC_KEY = (email) => 'orgfin:plus:sync:' + email;
const listaComIds = (x) => Array.isArray(x) && x.every(i => i && typeof i === 'object' && !Array.isArray(i) && typeof i.id === 'string' && i.id && !i.id.includes('|'));
function achatar(est){
  const out = {};
  const parte = (cam, val) => {
    if (val === undefined) return;
    if (listaComIds(val)){ out['o|' + cam] = val.map(it => it.id); val.forEach(it => { out['i|' + cam + '|' + it.id] = it; }); }
    else out['v|' + cam] = val;
  };
  Object.keys(est).forEach(k => {
    if (SYNC_LOCAIS.has(k)) return;
    if (k === 'meses') Object.entries(est.meses || {}).forEach(([mk, M]) => Object.keys(M || {}).forEach(c => parte('m/' + mk + '/' + c, M[c])));
    else parte(k, est[k]);
  });
  return out;
}
function montar(mapa, base){
  const est = { meses:{} }, listas = {}, ordens = {};
  Object.keys(base).forEach(k => { if (SYNC_LOCAIS.has(k)) est[k] = base[k]; });
  const por = (cam, val) => {
    const p = cam.split('/');
    if (p[0] === 'm' && p.length === 3){ (est.meses[p[1]] = est.meses[p[1]] || {})[p[2]] = val; }
    else est[cam] = val;
  };
  Object.entries(mapa).forEach(([k, val]) => {
    const t = k.slice(0, 2), resto = k.slice(2);
    if (t === 'v|') por(resto, val);
    else if (t === 'o|'){ listas[resto] = listas[resto] || []; ordens[resto] = Array.isArray(val) ? val : []; }
    else if (t === 'i|'){ const j = resto.lastIndexOf('|'), cam = resto.slice(0, j); (listas[cam] = listas[cam] || []).push(val); }
  });
  // Itens fora da ordem (vindos de outro aparelho antes da ordem atualizar) vão para o fim, pela data.
  Object.entries(listas).forEach(([cam, itens]) => {
    const pos = new Map((ordens[cam] || []).map((id, i) => [id, i]));
    por(cam, itens.sort((x, y) => (pos.get(x.id) ?? 1e9) - (pos.get(y.id) ?? 1e9) || String(x.data || '').localeCompare(String(y.data || '')) || String(x.id).localeCompare(String(y.id))));
  });
  Object.values(est.meses).forEach(M => ['entradas','gastos','contas','reservas'].forEach(c => { if (!Array.isArray(M[c])) M[c] = []; }));
  return est;
}
function hashTxt(t){ let h = 2166136261; for (let i = 0; i < t.length; i++){ h ^= t.charCodeAt(i); h = Math.imul(h, 16777619); } return (h >>> 0).toString(36) + t.length.toString(36); }
// O banco devolve os campos em outra ordem: o hash ordena as chaves para comparar só o conteúdo.
const jsonOrdenado = (v) => JSON.stringify(v, (k, x) => x && typeof x === 'object' && !Array.isArray(x) ? Object.keys(x).sort().reduce((o, kk) => (o[kk] = x[kk], o), {}) : x);
const hashVal = (v) => hashTxt(jsonOrdenado(v));
function syncEstado(){ const ses = plusSessao(); if (!ses) return null; try { return JSON.parse(localStorage.getItem(SYNC_KEY(ses.email)) || 'null'); } catch(e){ return null; } }
function syncGuardar(st){ const ses = plusSessao(); if (!ses) return; try { st ? localStorage.setItem(SYNC_KEY(ses.email), JSON.stringify(st)) : localStorage.removeItem(SYNC_KEY(ses.email)); } catch(e){ toast('Sem espaço no aparelho para a sincronização'); } }
const syncLigada = () => !DEMO && !!plusSessao() && !!(syncEstado() || {}).ligado;
let syncTimer = null, syncRodando = false, syncDeNovo = false, aplicandoRemoto = false;
function agendarSync(ms){
  if (aplicandoRemoto || !syncLigada()) return;
  clearTimeout(syncTimer); syncTimer = setTimeout(() => syncAgora(), ms ?? 4000);
}
const apiSync = (dados) => plusApi(dados, 'sync').then(d => { if (d.status === 401){ plusGuardar(null); throw new Error('sessao'); } if (!d.ok) throw new Error(d.erro || 'falha'); return d; });

// Resumo do mês atual para o Tino responder perguntas no WhatsApp com os mesmos números da tela inicial.
// Vai na sincronização como mais um valor (v|resumoPlus).
function resumoParaPlus(){
  const y = hoje.getFullYear(), m = hoje.getMonth(), C = calc(y,m), D = diasNoMes(y,m), d = hoje.getDate(), rest = D - d + 1;
  const livre = C.restante - C.contasPend, r2 = (v) => Math.round((+v || 0) * 100) / 100;
  const cats = {}; Object.entries(C.cats).filter(([,v]) => v > 0).sort((a,b) => b[1]-a[1]).forEach(([c,v]) => cats[c] = r2(v));
  const p = prevYM(y,m), P = temDados(S.meses[key(p.y,p.m)]) ? calc(p.y,p.m) : null, catsAnt = {};
  if (P) Object.entries(P.cats).filter(([,v]) => v > 0).forEach(([c,v]) => catsAnt[c] = r2(v));
  return { mes:key(y,m), em:new Date().toISOString(), podeGastarHoje:r2(Math.max(livre / rest, 0)), sobramParaOMes:r2(livre), diasRestantes:rest,
    entrou:r2(C.entradas - (C.saldoAnterior||0)), saldoDoMesAnterior:r2(C.saldoAnterior), saiu:r2(C.saidas + C.reservas), sobrou:r2(C.restante),
    contasPendentes:r2(C.contasPend), gastosNoCredito:r2(C.credito), gastoPorCategoria:cats,
    orcamentos: Object.fromEntries(orcamentosDoMes(y,m).map(([c,l]) => [c, { limite:r2(l), gasto:r2(C.cats[c]||0) }])),
    mesAnterior: P ? { mes:key(p.y,p.m), entrou:r2(P.entradas - (P.saldoAnterior||0)), saiu:r2(P.saidas + P.reservas), gastoPorCategoria:catsAnt } : null,
    cofrinhos:(S.cofrinhos||[]).map(c => ({ nome:c.nome, meta:r2(c.alvo) })), agenda: agendaParaPlus() };
}
// Agenda para os lembretes do WhatsApp: contas e faturas a pagar (este mês e o próximo) e fechamentos de fatura.
function agendaParaPlus(){
  const out = [], kh = chaveHoje(), hojeTxt = dataHoje(), prox = nextYM(hoje.getFullYear(), hoje.getMonth()), kp = key(prox.y, prox.m);
  const r2 = (v) => Math.round((+v || 0) * 100) / 100, dia = (k, d) => { const o = ymDe(k); return k + '-' + String(Math.min(+d, diasNoMes(o.y,o.m))).padStart(2,'0'); };
  const add = (x) => { if (x.data >= hojeTxt) out.push(x); };
  (S.meses[kh] ? S.meses[kh].contas : []).filter(c => !c.pago && c.venc).forEach(c => add({ tipo:'conta', nome:c.nome, valor:r2(c.valor || c.planejado), data:dia(kh, c.venc) }));
  const modelo = S.meses[kp] && S.meses[kp].contas.length ? S.meses[kp].contas.filter(c => !c.pago) : (S.meses[kh] ? S.meses[kh].contas : []);
  modelo.filter(c => c.venc).forEach(c => add({ tipo:'conta', nome:c.nome, valor:r2(c.valor || c.planejado), data:dia(kp, c.venc) }));
  [kh, kp].forEach(k => { const o = ymDe(k); faturasPorCartao(o.y, o.m).forEach(f => {
    if (f.cartao && !statusFatura(f.cartao.id, o.y, o.m)) add({ tipo:'fatura', nome:'Fatura ' + f.cartao.nome, valor:r2(f.valor), data:dia(k, f.cartao.vencimento) }); }); });
  (S.cartoes || []).filter(c => c.fechamento).forEach(c => [kh, kp].forEach(k => {
    const d = dia(k, c.fechamento), pg = mesPagamento(d, null, c);
    add({ tipo:'fechamento', nome:c.nome, valor:r2(soma(faturasDoMes(pg.y, pg.m).filter(x => x.cartao === c.id), x => x.valor)), data:d });
  }));
  return out.sort((a,b) => a.data < b.data ? -1 : 1).slice(0, 60);
}
// Uma rodada: envia o que mudou (em lotes) e aplica o que chegou. modo 'juntar' (primeira vez com dados nos
// dois lados: envia só os itens das listas e fica com as configurações da nuvem) ou 'nuvem' (usa só a nuvem).
async function syncAgora(modo, manual){
  if (!syncLigada() || !navigator.onLine) return false;
  if (!modo && !manual && form){ agendarSync(5000); return false; }   // não mexe nos dados com um lançamento aberto
  if (syncRodando){ syncDeNovo = true; return false; }
  syncRodando = true;
  try { S.resumoPlus = resumoParaPlus(); } catch(e){}
  const st = syncEstado();
  try {
    const hashes = modo === 'nuvem' ? {} : { ...(st.hashes || {}) };
    let cursor = st.cursor || 0;
    const local = modo === 'nuvem' ? {} : achatar(S);
    let mudancas = [];
    // Ao juntar, envia só os itens: a ordem das listas e as configurações ficam as da nuvem.
    if (modo !== 'nuvem'){
      Object.entries(local).forEach(([k, v]) => { if (modo === 'juntar' && !k.startsWith('i|')) return; const h = hashVal(v); if (hashes[k] !== h) mudancas.push({ k, v, h }); });
      if (modo !== 'juntar') Object.keys(hashes).forEach(k => { if (!(k in local)) mudancas.push({ k, d:true }); });
    }
    const recebidos = [];
    do {
      const lote = mudancas.slice(0, 500); mudancas = mudancas.slice(500);
      const d = await apiSync({ acao:'sync', cursor, aparelho:idAparelho(), mudancas: lote.map(({ h, ...m }) => m) });
      lote.forEach(m => { if (m.d) delete hashes[m.k]; else hashes[m.k] = m.h; });
      recebidos.push(...d.itens); cursor = d.cursor;
      if (!lote.length && !d.mais) break;
    } while (true);
    if (recebidos.length || modo === 'nuvem'){
      // Aplica o que chegou sobre o estado ATUAL (o que foi editado durante a rodada continua valendo)
      const atual = modo === 'nuvem' ? {} : achatar(S);
      recebidos.forEach(r => {
        if (atual[r.k] !== undefined && hashes[r.k] !== undefined && hashVal(atual[r.k]) !== hashes[r.k]) return;   // mudou aqui e ainda não foi enviado
        if (r.d){ delete atual[r.k]; delete hashes[r.k]; } else { atual[r.k] = r.v; hashes[r.k] = hashVal(r.v); }
      });
      aplicandoRemoto = true;
      try { S = montar(atual, S); migrar(); salvar(); } finally { aplicandoRemoto = false; }
      if (!form && !$ov.classList.contains('open')) render();
    }
    syncGuardar({ ...syncEstado(), ligado:true, cursor, hashes, ultima:new Date().toISOString(), erro:'' });
    return true;
  } catch(e){
    if (e.message !== 'sessao') syncGuardar({ ...(syncEstado() || st), erro: e.message });
    return false;
  } finally {
    syncRodando = false;
    if (syncDeNovo){ syncDeNovo = false; agendarSync(1000); }
  }
}
const temDadosLocais = () => Object.values(S.meses || {}).some(M => M.gastos.length || M.entradas.length || M.contas.length || M.reservas.length) || (S.cartoes || []).length > 0;
// Ligar: na primeira vez, se a nuvem já tem dados e o aparelho também, pergunta o que fazer.
async function ligarSync(btn){
  btn.disabled = true; btn.textContent = 'Preparando…';
  let n = 0;
  try { n = (await apiSync({ acao:'estado' })).itens; }
  catch(e){ btn.disabled = false; btn.textContent = 'Ligar sincronização'; return toast('Sem conexão com o servidor. Tente de novo.'); }
  syncGuardar({ ligado:true, cursor:0, hashes:{} });
  if (n > 0 && temDadosLocais()) return abrir(`<h2>Você já tem dados no Plus</h2>
    <p class="note" style="margin:-4px 0 14px">Esta conta já tem lançamentos salvos de outro aparelho. O que fazer com os dados deste celular?</p>
    <button class="btn pri" data-act="syncJuntar">Juntar com os da nuvem</button>
    <p class="note" style="margin:6px 0 12px">Os lançamentos dos dois lados ficam. As configurações (perfil, orçamentos) ficam as da nuvem.</p>
    <button class="btn sec" data-act="syncNuvem">Usar só os da nuvem</button>
    <p class="note" style="margin:6px 0 0">Os dados deste celular são trocados pelos da nuvem. Uma cópia deles fica guardada no aparelho.</p>`);
  await rodarPrimeiraSync(n > 0 ? 'nuvem' : undefined);
}
async function rodarPrimeiraSync(modo){
  if (modo === 'nuvem' && temDadosLocais()){ try { localStorage.setItem('orgfin:antesDoPlus', JSON.stringify(S)); } catch(e){} }
  abrir(`<h2>⭐ Sincronizando…</h2><p class="note">Enviando e recebendo seus dados. Pode levar alguns segundos.</p>`);
  const ok = await syncAgora(modo);
  if (!ok){ const st = syncEstado(); if (st && !st.ultima) syncGuardar(null); toast('Não foi possível sincronizar. Tente de novo.'); return abrirPlus(); }
  toast('Sincronização ligada ✓'); abrirPlus();
}
// Sincroniza ao abrir o app, ao voltar para ele e quando a internet volta.
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible'){ agendarSync(800); conferirConvitePlus(); } });
window.addEventListener('online', () => agendarSync(800));
// Com o app aberto na tela, confere a cada minuto: o que chegou pelo WhatsApp aparece sem precisar recarregar.
setInterval(() => { if (document.visibilityState === 'visible' && !syncRodando) agendarSync(0); }, 60000);

/* ---------- categorias do cliente ---------- */
let catEd = null;   // categoria sendo criada/editada: { i (índice em S.catsExtras ou -1), emoji, ess }
function abrirCategorias(){
  const ex = S.catsExtras || [], oc = S.catsOcultas || [];
  abrir(`<h2>🏷️ Minhas categorias</h2>
    <p class="note" style="margin:-6px 0 14px">As suas aparecem junto com as do app na hora de lançar um gasto.</p>
    <button class="btn pri" data-act="catNova" style="margin-bottom:14px">+ Nova categoria</button>
    ${ex.length ? `<p class="note" style="margin:0 0 8px">Toque numa categoria para <b>editar</b>. Para criar outra, use <b>+ Nova categoria</b>.</p><div class="cats-lista">${ex.map((x,i)=>`<button class="cat-item" data-act="catEditar" data-i="${i}"><span class="e">${emojiCat(x.c)}</span><span class="n">${esc(nomeCat(x.c))}</span>${x.ess?'<span class="tag auto">essencial</span>':''}<span class="muted">Editar ›</span></button>`).join('')}</div>` : '<p class="note" style="margin:0 0 12px">Você ainda não criou nenhuma.</p>'}
    <h3 style="margin:22px 0 6px">Categorias do app</h3>
    <p class="note" style="margin:0 0 8px">Desligue as que você não usa. Os gastos antigos continuam como estão.</p>
    ${CATEGORIAS.filter(c => c !== OUTROS).map(c=>`<div class="switch"><span>${emojiCat(c)} ${esc(nomeCat(c))}</span><button class="tg ${oc.includes(c)?'':'on'}" data-act="catOcultar" data-c="${esc(c)}" aria-label="Mostrar ${esc(nomeCat(c))}"></button></div>`).join('')}
    <p class="note">❓ Outros fica sempre disponível.</p>`);
}
function abrirCatForm(i){
  const x = i >= 0 ? S.catsExtras[i] : null;
  catEd = { i, emoji: x ? emojiCat(x.c) : EMOJIS_CAT[0], ess: x ? !!x.ess : false };
  abrir(`<h2>${x ? `Editar ${esc(x.c)}` : 'Nova categoria'}</h2>
    ${x ? '<p class="note" style="margin:-6px 0 14px">Você está mudando esta categoria. Para criar outra, toque em Voltar e depois em <b>+ Nova categoria</b>.</p>' : ''}
    <div class="f"><label>Nome</label><input id="catNome" maxlength="20" value="${x ? esc(nomeCat(x.c)) : ''}" placeholder="Ex.: Cachorro, Filhos, Academia"></div>
    <div class="f"><label>Ícone</label><div class="emojis-cat">${EMOJIS_CAT.map(e=>`<button type="button" class="${e===catEd.emoji?'on':''}" data-act="catEmoji" data-e="${e}">${e}</button>`).join('')}</div></div>
    <div class="switch"><span>Gasto essencial <small class="muted">(contas, saúde, necessidade)</small></span><button class="tg ${catEd.ess?'on':''}" data-act="catEss" aria-label="Gasto essencial"></button></div>
    <button class="btn pri" data-act="catSalvar" style="margin-top:14px">${x ? 'Salvar alterações' : 'Criar categoria'}</button>
    ${x ? '<button class="btn sec" data-act="catApagar">Apagar categoria</button>' : ''}
    <button class="btn sec" data-act="categorias">Voltar</button>`);
  if (!x) setTimeout(() => { const el = document.getElementById('catNome'); if (el) el.focus(); }, 250);
}
// Troca a categoria em todos os gastos e no orçamento (ao renomear ou apagar).
function trocarCategoria(de, para){
  Object.values(S.meses).forEach(M => M.gastos.forEach(g => { if (g.cat === de) g.cat = para; }));
  if (S.orcamentos[de] != null){ if (para !== OUTROS) S.orcamentos[para] = S.orcamentos[de]; delete S.orcamentos[de]; }
}
function salvarCatForm(){
  const nome = document.getElementById('catNome').value.trim().replace(/\s+/g, ' ');
  if (nome.length < 2) return toast('Dê um nome para a categoria');
  const c = catEd.emoji + ' ' + nome.charAt(0).toUpperCase() + nome.slice(1);
  S.catsExtras = S.catsExtras || [];
  const antiga = catEd.i >= 0 ? S.catsExtras[catEd.i].c : null;
  if (todasCats().some(k => k !== antiga && normTxt(nomeCat(k)) === normTxt(nomeCat(c)))) return toast('Já existe uma categoria com esse nome');
  if (antiga){ S.catsExtras[catEd.i] = { c, ess:catEd.ess }; if (antiga !== c) trocarCategoria(antiga, c); }
  else S.catsExtras.push({ c, ess:catEd.ess });
  salvar(); render(); abrirCategorias(); toast(antiga ? 'Categoria atualizada ✓' : 'Categoria criada ✓ Para criar outra, toque em + Nova categoria');
}
function apagarCatForm(){
  const c = S.catsExtras[catEd.i].c;
  let n = 0; Object.values(S.meses).forEach(M => M.gastos.forEach(g => { if (g.cat === c) n++; }));
  if (!confirm(`Apagar a categoria ${nomeCat(c)}?${n ? ` ${n} gasto${n>1?'s':''} vão para ❓ Outros.` : ''}`)) return;
  trocarCategoria(c, OUTROS); S.catsExtras.splice(catEd.i, 1);
  salvar(); render(); abrirCategorias(); toast('Categoria apagada');
}

/* ---------- sequência e conquistas ---------- */
// Dias em que a pessoa lançou algo (para a sequência 🔥).
function registrarDiaAtivo(){
  const d = dataHoje(); S.diasAtivos = S.diasAtivos || [];
  if (!S.diasAtivos.includes(d)){ S.diasAtivos.push(d); S.diasAtivos = S.diasAtivos.slice(-400); }
}
const diaAnterior = (d) => { const x = new Date(d+'T12:00:00'); x.setDate(x.getDate()-1); return key(x.getFullYear(),x.getMonth())+'-'+String(x.getDate()).padStart(2,'0'); };
function sequenciaAtual(){
  const set = new Set(S.diasAtivos||[]); let d = dataHoje();
  if (!set.has(d)) d = diaAnterior(d);
  let n = 0; while (set.has(d)){ n++; d = diaAnterior(d); }
  return n;
}
function maiorSequencia(){
  const dias = [...new Set(S.diasAtivos||[])].sort(); let maior = 0, atual = 0, ant = null;
  dias.forEach(d => { atual = (ant && diaAnterior(d) === ant) ? atual+1 : 1; maior = Math.max(maior, atual); ant = d; });
  return maior;
}
const CONQUISTAS = [
  { id:'primeiro', e:'✍️', t:'Primeiro passo', d:'Fez o primeiro lançamento', ok:x=>x.total>=1 },
  { id:'seq3', e:'🔥', t:'Pegando o ritmo', d:'3 dias seguidos anotando', ok:x=>x.seq>=3 },
  { id:'seq7', e:'⚡', t:'Semana firme', d:'7 dias seguidos anotando', ok:x=>x.seq>=7 },
  { id:'seq30', e:'🏆', t:'Hábito de ferro', d:'30 dias seguidos anotando', ok:x=>x.seq>=30 },
  { id:'cofrinho', e:'🐷', t:'Cofrinho inaugurado', d:'Guardou dinheiro num cofrinho', ok:x=>x.guardou },
  { id:'meta', e:'🎯', t:'Meta batida!', d:'Completou um cofrinho', ok:x=>x.metaBatida },
  { id:'azul', e:'💙', t:'Mês no azul', d:'Fechou um mês sem ficar no vermelho', ok:x=>x.mesAzul },
  { id:'orcamento', e:'📏', t:'Dentro do orçamento', d:'Fechou um mês sem estourar nenhum orçamento', ok:x=>x.orcOk },
  { id:'contas', e:'✅', t:'Contas em dia', d:'Pagou todas as contas de um mês', ok:x=>x.contasDia },
  { id:'cem', e:'💯', t:'Anotador profissional', d:'Fez 100 lançamentos', ok:x=>x.total>=100 },
  { id:'backup', e:'💾', t:'Dados protegidos', d:'Fez um backup', ok:()=>!!S.ultimoBackup },
  { id:'divida', e:'🎊', t:'Dívida quitada!', d:'Quitou uma dívida', ok:()=>(S.dividas||[]).some(d=>d.saldo<=0.009 && d.pagamentos && d.pagamentos.length) },
  { id:'retro', e:'🎬', t:'Olhando para trás', d:'Viu uma retrospectiva do mês', ok:()=>Object.keys(S.retroVistas||{}).length>0 },
];
function contextoConquistas(){
  memo = {}; memoParc = null; memoFat = null;
  const kh = chaveHoje(), ks = Object.keys(S.meses).sort();
  let total = 0, guardou = false, mesAzul = false, orcOk = false, contasDia = false;
  const orc = Object.entries(S.orcamentos||{}).filter(([,l])=>l>0);
  ks.forEach(k => {
    const M = S.meses[k]; total += M.entradas.length + M.gastos.length + M.contas.length + M.reservas.length;
    if (M.reservas.some(r => cofDe(r) && r.valor > 0)) guardou = true;
    if (M.contas.length >= 3 && M.contas.every(c => c.pago)) contasDia = true;
    if (k < kh && temDados(M)){
      const o = ymDe(k), C = calc(o.y, o.m);
      if (C.consumo > 0 && C.restante >= 0) mesAzul = true;
      if (orc.length && C.consumo > 0 && orc.every(([c,l]) => (C.cats[c]||0) <= l)) orcOk = true;
    }
  });
  const metaBatida = S.cofrinhos.some(c => c.alvo > 0 && guardadoAte(c.id, '9999-12') >= c.alvo);
  return { total, seq:maiorSequencia(), guardou, metaBatida, mesAzul, orcOk, contasDia };
}
// Confere e comemora conquistas novas.
let conqPendente = false;
function checarConquistas(){
  if (!S.liberado || !S.perfil.ok || tour !== null || travado) return;
  // Espera janelas abertas (novidades, formulários, retrospectiva) fecharem.
  if ($ov.classList.contains('open') || retro){ conqPendente = true; return; }
  S.conquistas = S.conquistas || {};
  const x = contextoConquistas();
  const novas = CONQUISTAS.filter(c => !S.conquistas[c.id] && c.ok(x));
  if (!novas.length) return;
  novas.forEach(c => S.conquistas[c.id] = dataHoje()); salvar();
  let el = document.getElementById('conq'); if (el) el.remove();
  el = document.createElement('button'); el.id = 'conq'; el.setAttribute('role','status');
  el.innerHTML = `<span class="c-top">🏅 ${novas.length>1 ? novas.length+' conquistas desbloqueadas!' : 'Conquista desbloqueada!'}</span>
    ${novas.slice(0,3).map(c=>`<span class="c-item"><span class="c-e">${c.e}</span><span><b>${c.t}</b><small>${c.d}</small></span></span>`).join('')}
    ${novas.length>3?`<span class="c-mais">e mais ${novas.length-3}… veja em Planejar</span>`:''}`;
  el.onclick = () => el.remove();
  document.body.appendChild(el);
  setTimeout(() => el.classList.add('sai'), 4200); setTimeout(() => el.remove(), 4700);
}
function cardConquistas(){
  const feitas = S.conquistas || {}, n = CONQUISTAS.filter(c=>feitas[c.id]).length, seq = sequenciaAtual();
  return `<section class="card" id="cardConquistas"><h3>Conquistas <small>${n} de ${CONQUISTAS.length}</small></h3>
    <div class="seqbox"><span class="fogo">🔥</span><div><b>${seq} dia${seq===1?'':'s'} seguido${seq===1?'':'s'}</b><small>Recorde: ${maiorSequencia()} · anote algo todo dia para manter a sequência</small></div></div>
    <div class="medalhas">${CONQUISTAS.map(c=>`<div class="med ${feitas[c.id]?'on':''}" title="${esc(c.d)}"><span class="m-e">${c.e}</span><b>${c.t}</b><small>${feitas[c.id]?'Conquistada em '+fmtData(feitas[c.id])+'/'+feitas[c.id].slice(2,4):c.d}</small></div>`).join('')}</div></section>`;
}

/* ---------- retrospectiva do mês ---------- */
const DIAS_SEMANA = ['domingo','segunda-feira','terça-feira','quarta-feira','quinta-feira','sexta-feira','sábado'];
const TITULO_CAT = {
  '🍗 Alimentação':['🍔','Lenda do Delivery','Comer bem foi prioridade este mês.'],
  '🧺 Mercado':['🧺','Chef da Casa','O mercado foi seu destino favorito.'],
  '🎉 Lazer':['🎉','Espírito Livre','Viver também é importante!'],
  '📦 Compras Online':['📦','Fã de Frete Grátis','O entregador já sabe seu nome.'],
  '⛽ Gasolina':['🚗','Estrada é Vida','Você rodou bastante este mês.'],
  '🚗 Transporte':['🚗','Estrada é Vida','Você rodou bastante este mês.'],
  '💊 Saúde':['💊','Saúde em Primeiro Lugar','Cuidar de si é o melhor investimento.'],
  '💄 Beleza':['💄','Autoestima em Dia','Se cuidar faz parte.'],
  '🐾 Pets':['🐾','Amor de Pet','Seu pet é bem cuidado!'],
  '📚 Educação':['📚','Investindo em Você','Conhecimento nunca é demais.'],
  '📱 Assinaturas':['📺','Maratona Infinita','As assinaturas pesaram no mês.'],
  '👕 Vestuário':['👕','Ícone de Estilo','O guarda-roupa agradece.'],
  '🎁 Presentes':['🎁','Coração Generoso','Você presenteou bastante gente.'],
};
function dadosRetro(y, m){
  const k = key(y,m), M = S.meses[k];
  if (!M || k >= chaveHoje()) return null;
  memo = {}; memoParc = null; memoFat = null;
  const C = calc(y,m);
  const nLanc = M.entradas.length + M.gastos.length + M.contas.length + M.reservas.length;
  if (C.consumo <= 0 || nLanc < 5) return null;
  const itens = [...M.gastos.filter(g=>!ehParcelado(g)).map(g=>({ d:g.desc||nomeCat(g.cat), cat:g.cat, v:+g.valor, data:g.data })),
    ...parcelasDoMes(y,m).map(x=>({ d:x.g.desc||nomeCat(x.g.cat), cat:x.g.cat, v:x.valor, data:x.g.data })),
    ...M.contas.filter(c=>c.pago).map(c=>({ d:c.nome, cat:CAT_CONTAS, v:+c.valor, data:c.data }))];
  // Categoria campeã e título olham os gastos do dia a dia (contas fixas e parcelas ficam de fora, senão o aluguel sempre ganha).
  const todas = Object.entries(C.cats).filter(([,v])=>v>0).sort((a,b)=>b[1]-a[1]);
  const variaveis = todas.filter(([c])=>![CAT_CONTAS,'🧾 Contas','🧾 Parcela'].includes(c));
  const cats = variaveis.length ? variaveis : todas;
  const totVar = soma(cats, x=>x[1]);
  const maior = [...itens].sort((a,b)=>b.v-a.v)[0];
  const p = prevYM(y,m), pk = key(p.y,p.m);
  const ant = temDados(S.meses[pk]) ? calc(p.y,p.m).consumo : null;
  const porDia = [0,0,0,0,0,0,0]; itens.forEach(i => { if (i.data) porDia[new Date(i.data+'T12:00:00').getDay()] += i.v; });
  const diaTop = porDia.some(v=>v>0) ? porDia.indexOf(Math.max(...porDia)) : null;
  const diasAnot = new Set([...M.gastos, ...M.entradas, ...M.reservas].map(i=>i.data).filter(Boolean)).size;
  const guardado = soma(M.reservas.filter(r=>r.valor>0), r=>r.valor);
  const saldo = C.entradasLanc - C.consumo - C.reservas;
  const variacao = ant ? (C.consumo - ant) / ant * 100 : null;
  let titulo;
  if (C.entradasLanc > 0 && saldo < 0) titulo = ['💪','Sobrevivente do Mês','O mês foi puxado, mas você anotou tudo. Mês que vem é outra história!'];
  else if (C.entradasLanc > 0 && guardado >= C.entradasLanc*0.2) titulo = ['🐷','Mestre da Poupança',`Você guardou ${(guardado/C.entradasLanc*100).toFixed(0)}% do que entrou. Seu eu do futuro agradece!`];
  else if (variacao !== null && variacao <= -10) titulo = ['🏆','Mestre da Economia',`Gastou ${Math.abs(variacao).toFixed(0)}% menos que em ${MESES[p.m].toLowerCase()}.`];
  else titulo = TITULO_CAT[cats[0][0]] || (cats[0][0]===CAT_CONTAS || cats[0][0]==='🏠 Casa' || cats[0][0]==='🧾 Contas' || cats[0][0]==='🧾 Parcela' ? ['🏠','Lar Doce Lar','A casa levou a maior parte — e tudo bem.'] : ['📊','Mestre da Organização','Tudo anotado, tudo sob controle.']);
  return { y, m, k, C, cats, totVar, maior, ant, variacao, diaTop, diasAnot, nLanc, guardado, saldo, titulo, prevMes:MESES[p.m] };
}
let retro = null;
function abrirRetro(y, m){
  const d = dadosRetro(y, m); if (!d) return;
  S.retroVistas = S.retroVistas || {}; S.retroVistas[d.k] = true; salvar();
  const top = d.cats[0], totCat = d.totVar;
  const slides = [
    { cls:'r1', html:`<small>Sua retrospectiva</small><h2>${MESES[d.m]}<br>${d.y}</h2><p>Vamos ver como foi o seu mês?</p><span class="r-dica">Toque para continuar →</span>` },
    { cls:'r2', html:`<small>O mês em números</small>${d.C.entradasLanc?`<div class="r-lin"><span>Entrou</span><b>${brl(d.C.entradasLanc)}</b></div>`:''}<div class="r-lin"><span>Você gastou</span><b>${brl(d.C.consumo)}</b></div>${d.guardado?`<div class="r-lin"><span>Guardou</span><b>${brl(d.guardado)}</b></div>`:''}
      ${d.C.entradasLanc?`<p class="r-dest">${d.saldo>=0?`Sobraram <b>${brl(d.saldo)}</b> 🎉`:`Faltaram <b>${brl(-d.saldo)}</b>. Acontece!`}</p>`:''}` },
    { cls:'r3', html:`<small>Categoria campeã</small><div class="r-emoji">${emojiCat(top[0])}</div><h2>${esc(nomeCat(top[0]))}</h2><p><b>${brl(top[1])}</b> — ${(top[1]/totCat*100).toFixed(0)}% dos seus gastos do dia a dia</p>
      ${d.cats[1]?`<p class="r-sub">Em seguida: ${d.cats.slice(1,3).map(([c,v])=>`${emojiCat(c)} ${esc(nomeCat(c))}`).join(' e ')}</p>`:''}` },
    d.maior && { cls:'r4', html:`<small>Maior gasto do mês</small><div class="r-emoji">${d.maior.cat===CAT_CONTAS?'📄':emojiCat(d.maior.cat)}</div><h2>${brl(d.maior.v)}</h2><p>${esc(d.maior.d)}${d.maior.data?` · ${fmtData(d.maior.data)}`:''}</p>` },
    d.variacao !== null && { cls:'r5', html:`<small>Comparado a ${d.prevMes.toLowerCase()}</small><div class="r-emoji">${d.variacao<=0?'📉':'📈'}</div><h2>${Math.abs(d.variacao).toFixed(0)}% ${d.variacao<=0?'a menos':'a mais'}</h2><p>${d.variacao<=0?'Você gastou menos que no mês anterior. Mandou bem! 👏':'Você gastou mais que no mês anterior. Bora ajustar?'}</p>` },
    { cls:'r6', html:`<small>Seus hábitos</small><div class="r-lin"><span>Lançamentos</span><b>${d.nLanc}</b></div><div class="r-lin"><span>Dias com anotação</span><b>${d.diasAnot}</b></div>
      ${d.diaTop!==null?`<p class="r-dest">${DIAS_SEMANA[d.diaTop].charAt(0).toUpperCase()+DIAS_SEMANA[d.diaTop].slice(1)} foi o seu dia de gastar 🛍️</p>`:''}` },
    { cls:'r7', final:true, html:`<small>Seu título do mês</small><div class="r-emoji grande">${d.titulo[0]}</div><h2>${d.titulo[1]}</h2><p>${d.titulo[2]}</p>
      <div class="r-acts"><button class="btn pri" data-retro="compartilhar">📤 Compartilhar</button><button class="btn sec" data-retro="fechar">Fechar</button></div><span class="r-priv">A imagem compartilhada não mostra seus valores.</span>` },
  ].filter(Boolean);
  retro = { d, slides, i:0 };
  desenharRetro();
}
function desenharRetro(){
  let el = document.getElementById('retro');
  if (!el){ el = document.createElement('div'); el.id = 'retro'; el.setAttribute('role','dialog'); el.setAttribute('aria-modal','true'); document.body.appendChild(el); }
  const { slides, i } = retro;
  el.className = slides[i].cls;
  el.innerHTML = `<div class="r-barras">${slides.map((_,j)=>`<span class="${j<i?'cheia':j===i?'atual':''}"></span>`).join('')}</div>
    <button class="r-x" data-retro="fechar" aria-label="Fechar">×</button>
    <div class="r-conteudo" aria-live="polite">${slides[i].html}</div>`;
}
function fecharRetro(){ retro = null; const el = document.getElementById('retro'); if (el) el.remove(); render(); checarConquistas(); }
document.addEventListener('click', e => {
  if (!retro || !e.target.closest('#retro')) return;
  e.stopPropagation();
  const b = e.target.closest('[data-retro]');
  if (b){ if (b.dataset.retro==='fechar') fecharRetro(); else compartilharRetro(); return; }
  const { slides } = retro;
  if (e.clientX < innerWidth * 0.3){ if (retro.i > 0){ retro.i--; desenharRetro(); } }
  else if (retro.i < slides.length - 1){ retro.i++; desenharRetro(); }
}, true);
// Imagem para stories (1080x1920) sem valores em reais.
function compartilharRetro(){
  const d = retro.d, cv = document.createElement('canvas'); cv.width = 1080; cv.height = 1920;
  const g = cv.getContext('2d'), F = '-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Arial,sans-serif';
  const bg = g.createLinearGradient(0,0,1080,1920); bg.addColorStop(0,'#0b3b3a'); bg.addColorStop(1,'#0f766e'); g.fillStyle = bg; g.fillRect(0,0,1080,1920);
  g.textAlign = 'center'; g.fillStyle = 'rgba(255,255,255,.75)'; g.font = `600 44px ${F}`; g.fillText('MINHA RETROSPECTIVA', 540, 210);
  g.fillStyle = '#fff'; g.font = `800 96px ${F}`; g.fillText(d.rotulo || `${MESES[d.m]} ${d.y}`, 540, 320);
  g.font = `260px ${F}`; g.fillText(d.titulo[0], 540, 690);
  g.font = `800 92px ${F}`; quebra(g, d.titulo[1], 540, 860, 940, 104);
  g.fillStyle = 'rgba(255,255,255,.85)'; g.font = `500 44px ${F}`; quebra(g, d.titulo[2], 540, 1000, 900, 58);
  const linhas = d.linhasShare || [`${emojiCat(d.cats[0][0])}  Categoria campeã: ${nomeCat(d.cats[0][0])}`,
    d.variacao !== null && d.variacao <= -5 ? `📉  Gastei ${Math.abs(d.variacao).toFixed(0)}% menos que no mês anterior` : null,
    `📝  ${d.nLanc} lançamentos em ${d.diasAnot} dias`,
    Object.keys(S.conquistas||{}).length ? `🏅  ${Object.keys(S.conquistas).length} conquistas desbloqueadas` : null].filter(Boolean);
  g.textAlign = 'left'; g.font = `600 46px ${F}`;
  linhas.forEach((l,i) => { const y = 1260 + i*120; g.fillStyle = 'rgba(255,255,255,.12)'; arred(g, 90, y-78, 900, 104, 28); g.fill(); g.fillStyle = '#fff'; g.fillText(l, 130, y-10); });
  g.textAlign = 'center'; g.fillStyle = 'rgba(255,255,255,.8)'; g.font = `700 42px ${F}`; g.fillText('📊 ' + CONFIG.nomeApp, 540, 1790);
  if (CONFIG.linkDivulgacao){ g.font = `500 34px ${F}`; g.fillText(CONFIG.linkDivulgacao, 540, 1845); }
  cv.toBlob(b => entregarArquivo(`retrospectiva-${d.k}.png`, b, 'image/png', 'Minha retrospectiva', () => toast('Imagem pronta ✓')), 'image/png');
}
function quebra(g, txt, x, y, larg, alt){
  const pal = txt.split(' '); let lin = '', yy = y;
  pal.forEach(p => { const t = lin ? lin+' '+p : p; if (g.measureText(t).width > larg && lin){ g.fillText(lin, x, yy); lin = p; yy += alt; } else lin = t; });
  g.fillText(lin, x, yy);
}
function arred(g, x, y, w, h, r){ g.beginPath(); g.moveTo(x+r,y); g.arcTo(x+w,y,x+w,y+h,r); g.arcTo(x+w,y+h,x,y+h,r); g.arcTo(x,y+h,x,y,r); g.arcTo(x,y,x+w,y,r); g.closePath(); }
/* ---------- retrospectiva do ano ---------- */
function dadosRetroAno(ano){
  const ks = Object.keys(S.meses).filter(k => k.startsWith(ano + '-') && k <= chaveHoje() && temDados(S.meses[k])).sort();
  if (ks.length < 2) return null;
  memo = {}; memoParc = null; memoFat = null;
  const cs = ks.map(k => { const o = ymDe(k); return { k, o, C: calc(o.y, o.m) }; });
  const renda = soma(cs, x=>x.C.renda), gasto = soma(cs, x=>x.C.consumo), guardado = soma(cs, x=>Math.max(0, x.C.reservas));
  if (gasto <= 0) return null;
  const cats = {}; cs.forEach(x => Object.entries(x.C.cats).forEach(([c,v]) => cats[c] = (cats[c]||0) + v));
  const todas = Object.entries(cats).filter(([,v])=>v>0).sort((a,b)=>b[1]-a[1]);
  const variaveis = todas.filter(([c])=>![CAT_CONTAS,'🧾 Contas','🧾 Parcela'].includes(c)), top = variaveis.length ? variaveis : todas;
  const porMes = cs.filter(x=>x.C.consumo>0).sort((a,b)=>b.C.consumo-a.C.consumo);
  let maior = null;
  ks.forEach(k => S.meses[k].gastos.forEach(g => { const v = (+g.valor) * (g.minha!=null && g.valor ? g.minha/g.valor : 1); if (!maior || v > maior.v) maior = { v, d:g.desc||nomeCat(g.cat), cat:g.cat, data:g.data }; }));
  const nLanc = soma(ks, k => { const M = S.meses[k]; return M.entradas.length + M.gastos.length + M.contas.length + M.reservas.length; });
  const diasAnot = new Set(ks.flatMap(k => [...S.meses[k].gastos, ...S.meses[k].entradas].map(i=>i.data).filter(Boolean))).size;
  const conqAno = Object.entries(S.conquistas||{}).filter(([,d]) => String(d).startsWith(ano)).map(([id]) => CONQUISTAS.find(c=>c.id===id)).filter(Boolean);
  const quitadas = (S.dividas||[]).filter(dv => dv.quitadaEm && dv.quitadaEm.startsWith(ano));
  const taxa = renda > 0 ? guardado / renda * 100 : 0;
  let titulo;
  if (taxa >= 20) titulo = ['🐷','Mestre da Poupança do Ano',`Você guardou ${taxa.toFixed(0)}% de tudo que entrou. Que ano!`];
  else if (quitadas.length) titulo = ['🎊','Livre das Dívidas',`Você quitou ${quitadas.length} dívida${quitadas.length>1?'s':''} este ano. Enorme conquista!`];
  else if (renda > 0 && renda - gasto - guardado < 0) titulo = ['💪','Sobrevivente do Ano','Foi um ano puxado, mas você acompanhou cada real. Isso muda tudo.'];
  else { const t = TITULO_CAT[top[0][0]]; titulo = t ? [t[0], t[1] + ' do Ano', t[2].replace('este mês','este ano').replace('do mês','do ano')] : ['📊','Mestre da Organização do Ano','Um ano inteiro com tudo anotado. Parabéns!']; }
  return { ano, ks, renda, gasto, guardado, taxa, cats:top, totVar:soma(top, x=>x[1]), mesCaro:porMes[0], mesBarato:porMes[porMes.length-1], maior, nLanc, diasAnot,
    seq: maiorSequencia(), conqAno, quitadas, titulo, parcial: ano === hoje.getFullYear() && hoje.getMonth() < 11 };
}
function abrirRetroAno(ano){
  const d = dadosRetroAno(ano); if (!d) return toast('Ainda não há dados suficientes deste ano.');
  S.retroVistas = S.retroVistas || {}; S.retroVistas['ano-' + ano] = true; salvar();
  const nomeMes = (x) => MESES[x.o.m];
  const cofTotal = soma(S.cofrinhos, c => guardadoAte(c.id, ano + '-12'));
  const slides = [
    { cls:'r1', html:`<small>Retrospectiva${d.parcial?' (até agora)':''}</small><h2>Seu ${ano}</h2><p>${d.ks.length} meses de vida financeira em algumas telas.</p><span class="r-dica">Toque para continuar →</span>` },
    { cls:'r2', html:`<small>O ano em números</small>${d.renda?`<div class="r-lin"><span>Entrou</span><b>${brl0(d.renda)}</b></div>`:''}<div class="r-lin"><span>Você gastou</span><b>${brl0(d.gasto)}</b></div><div class="r-lin"><span>Guardou</span><b>${brl0(d.guardado)}</b></div>
      ${d.renda?`<p class="r-dest">Você guardou <b>${d.taxa.toFixed(0)}%</b> da sua renda ${d.taxa>=10?'🎉':''}</p>`:''}` },
    { cls:'r3', html:`<small>Categoria campeã do ano</small><div class="r-emoji">${emojiCat(d.cats[0][0])}</div><h2>${esc(nomeCat(d.cats[0][0]))}</h2><p><b>${brl0(d.cats[0][1])}</b> — ${(d.cats[0][1]/d.totVar*100).toFixed(0)}% dos gastos do dia a dia</p>
      ${d.cats.slice(1,3).map(([c,v],i)=>`<div class="r-lin"><span>${i+2}º ${emojiCat(c)} ${esc(nomeCat(c))}</span><b>${brl0(v)}</b></div>`).join('')}` },
    d.mesCaro && d.mesBarato && d.mesCaro !== d.mesBarato && { cls:'r4', html:`<small>Mês a mês</small><div class="r-lin"><span>📈 Mês mais caro</span><b>${nomeMes(d.mesCaro)}</b></div><div class="r-lin"><span>📉 Mês mais econômico</span><b>${nomeMes(d.mesBarato)}</b></div>
      <p class="r-dest">Diferença de <b>${brl0(d.mesCaro.C.consumo - d.mesBarato.C.consumo)}</b> entre os dois.</p>` },
    d.maior && { cls:'r5', html:`<small>Maior compra do ano</small><div class="r-emoji">${emojiCat(d.maior.cat)}</div><h2>${brl0(d.maior.v)}</h2><p>${esc(d.maior.d)}${d.maior.data?` · ${fmtData(d.maior.data)}`:''}</p>` },
    { cls:'r6', html:`<small>Seus hábitos</small><div class="r-lin"><span>Lançamentos</span><b>${d.nLanc}</b></div><div class="r-lin"><span>Dias com anotação</span><b>${d.diasAnot}</b></div>${d.seq>1?`<div class="r-lin"><span>Maior sequência</span><b>🔥 ${d.seq} dias</b></div>`:''}` },
    (d.conqAno.length || cofTotal > 0 || d.quitadas.length) && { cls:'r7', html:`<small>Suas vitórias</small>
      ${cofTotal>0?`<div class="r-lin"><span>🐷 Nos cofrinhos</span><b>${brl0(cofTotal)}</b></div>`:''}${d.quitadas.length?`<div class="r-lin"><span>🎊 Dívidas quitadas</span><b>${d.quitadas.length}</b></div>`:''}
      ${d.conqAno.length?`<div class="r-lin"><span>🏅 Conquistas</span><b>${d.conqAno.length}</b></div><p class="r-sub">${d.conqAno.slice(0,6).map(c=>c.e+' '+c.t).join(' · ')}</p>`:''}` },
    { cls:'r8', final:true, html:`<small>Seu título de ${ano}</small><div class="r-emoji grande">${d.titulo[0]}</div><h2>${d.titulo[1]}</h2><p>${d.titulo[2]}</p>
      <div class="r-acts"><button class="btn pri" data-retro="compartilhar">📤 Compartilhar</button><button class="btn sec" data-retro="fechar">Fechar</button></div><span class="r-priv">A imagem compartilhada não mostra seus valores.</span>` },
  ].filter(Boolean);
  const share = Object.assign({}, d, { k:'ano-' + ano, rotulo: String(ano), linhasShare: [
    `${emojiCat(d.cats[0][0])}  Categoria campeã: ${nomeCat(d.cats[0][0])}`,
    d.renda && d.taxa >= 1 ? `🐷  Guardei ${d.taxa.toFixed(0)}% da minha renda` : null,
    `📝  ${d.nLanc} lançamentos em ${d.diasAnot} dias`,
    d.quitadas.length ? `🎊  ${d.quitadas.length} dívida${d.quitadas.length>1?'s':''} quitada${d.quitadas.length>1?'s':''}` : (d.conqAno.length ? `🏅  ${d.conqAno.length} conquistas no ano` : null)].filter(Boolean) });
  retro = { d: share, slides, i:0 };
  desenharRetro();
}

// Cartão no Resumo: retrospectiva do mês passado (até o dia 10) ou do mês aberto, se já passou.
function cardRetro(){
  const kc = key(cur.y,cur.m), kh = chaveHoje();
  if (kc === kh){
    const anoR = hoje.getMonth() === 11 ? hoje.getFullYear() : hoje.getMonth() === 0 && hoje.getDate() <= 20 ? hoje.getFullYear() - 1 : null;
    if (anoR && !(S.retroVistas||{})['ano-' + anoR] && dadosRetroAno(anoR))
      return `<button class="retro-card ano" data-act="retroAno" data-ano="${anoR}"><span class="rc-e">🎆</span><span><b>Sua retrospectiva de ${anoR} está pronta!</b><small>Seu ano em números, vitórias e o título do ano</small></span><span class="rc-seta">›</span></button>`;
  }
  if (kc === kh){
    if (hoje.getDate() > 10) return '';
    const p = prevYM(cur.y,cur.m);
    if ((S.retroVistas||{})[key(p.y,p.m)] || !dadosRetro(p.y,p.m)) return '';
    return `<button class="retro-card" data-act="retro" data-y="${p.y}" data-m="${p.m}"><span class="rc-e">🎬</span><span><b>Sua retrospectiva de ${MESES[p.m]} está pronta!</b><small>Veja como foi seu mês e descubra seu título</small></span><span class="rc-seta">›</span></button>`;
  }
  if (kc < kh && dadosRetro(cur.y,cur.m)) return `<button class="btn sec" data-act="retro" data-y="${cur.y}" data-m="${cur.m}" style="margin-bottom:14px">🎬 Ver retrospectiva de ${MESES[cur.m]}</button>`;
  return '';
}

/* ---------- lançar por frase ----------
   "gastei 45 no ifood no crédito", "recebi 3500 de salário", "guardei 200 na viagem", "mercado 230 em 3x ontem".
   Funciona offline, por palavras-chave + o histórico de descrições do próprio usuário. */
const PALAVRAS_CAT = [
  ['🧺 Mercado', ['mercado','supermercado','feira','atacadao','assai','carrefour','hortifruti','sacolao','acougue','atacarejo','compras do mes','pao de acucar','guanabara','sonda','savegnago','zaffari','angeloni','bh supermercados','dia supermercado','oxxo','st marche','mambo','tenda','fort atacadista','makro','sams club','giassi','condor','muffato','prezunic','mundial','supernosso','comper']],
  ['🍗 Alimentação', ['ifood','i food','rappi','restaurante','lanche','lanchonete','pizza','pizzaria','hamburguer','hamburgueria','almoco','jantar','padaria','cafe','sorvete','acai','delivery','marmita','mcdonalds','mc donalds','burger king','comida','salgado','churrasco','sushi','ze delivery','zedelivery','habibs','bobs','subway','outback','starbucks','kfc','giraffas','spoleto','coco bambu','madero','china in box','domino','dominos','pizza hut','cacau show','kopenhagen','chiquinho','aiqfome','99food','keeta']],
  ['⛽ Gasolina', ['gasolina','posto','combustivel','etanol','abasteci','abastecer','diesel','shell','ipiranga','petrobras','br mania','ale combustiveis','raizen']],
  ['🚗 Transporte', ['uber','99 pop','onibus','metro','passagem','estacionamento','pedagio','taxi','trem','bilhete unico','oficina','mecanico','lava jato','ipva','seguro do carro','licenciamento','99app','99 taxi','cabify','indrive','sem parar','conectcar','veloe','zul digital','estapar','blablacar','latam','gol linhas','azul linhas','buser','clickbus']],
  ['🏠 Casa', ['aluguel','condominio','movel','moveis','reforma','material de construcao','produtos de limpeza','decoracao','iptu','eletrodomestico','leroy merlin','telhanorte','tok stok','tokstok','etna','camicado','casas bahia','ponto frio','madeiramadeira','mobly','havan']],
  ['💊 Saúde', ['farmacia','remedio','remedios','medico','consulta','dentista','exame','exames','plano de saude','hospital','academia','terapia','psicologo','drogaria','smart fit','smartfit','bluefit','selfit','bodytech','gympass','wellhub','totalpass','pague menos','raia','drogasil','panvel','drogaria sao paulo','pacheco','nissei','venancio','ultrafarma','drogarias','unimed','amil','hapvida','sulamerica','bradesco saude','dasa','fleury','lavoisier','sabin','hermes pardini']],
  ['📦 Compras Online', ['amazon','shopee','mercado livre','shein','aliexpress','magalu','temu','compra online','compras online','magazine luiza','americanas','submarino','casas bahia online','kabum','pichau','netshoes','dafiti','olist','elo7','tiktok shop','shopee pay']],
  ['👕 Vestuário', ['roupa','roupas','tenis','sapato','sapatos','camisa','camiseta','calca','vestido','blusa','bermuda','renner','riachuelo','zara','sandalia','chinelo','c&a','cea','hering','marisa','pernambucanas','centauro','decathlon','nike','adidas','arezzo','youcom','farm','lojas renner']],
  ['🎉 Lazer', ['cinema','show','bar','cerveja','festa','viagem','passeio','balada','ingresso','ingressos','parque','praia','hotel','pousada','boliche','jogo','ingresso.com','sympla','eventim','ticketmaster','cinemark','cinepolis','uci','kinoplex','booking','airbnb','decolar','hurb','123milhas','steam','playstation','xbox','nintendo','psn']],
  ['📚 Educação', ['curso','faculdade','escola','livro','livros','mensalidade da escola','material escolar','apostila','udemy','alura','coursera','hotmart','kiwify','eduzz','duolingo','descomplica','estrategia concursos','kalunga']],
  ['📱 Assinaturas', ['netflix','spotify','assinatura','prime video','amazon prime','disney','hbo','youtube premium','icloud','globoplay','deezer','chatgpt','streaming','hbo max','paramount','apple tv','star plus','crunchyroll','youtube music','google one','microsoft 365','canva','adobe','claude','gemini','tidal','audible','kindle unlimited','ifood clube','amazon music']],
  ['💄 Beleza', ['salao','cabelo','manicure','unha','unhas','maquiagem','barbearia','barbeiro','cosmetico','cosmeticos','perfume','skincare','depilacao','sobrancelha','boticario','o boticario','natura','sephora','eudora','quem disse berenice','mac cosmeticos','avon','beleza na web']],
  ['🐾 Pets', ['pet','racao','veterinario','petshop','pet shop','cachorro','gato','banho e tosa','petz','cobasi','petlove','dogsmart']],
  ['🎁 Presentes', ['presente','presentes','lembrancinha','aniversario']],
  ['🧾 Contas', ['conta de luz','luz','energia','conta de agua','agua','internet','telefone','conta do celular','recarga','gas','boleto','conta','vivo','claro','tim','oi fibra','sky','net','enel','light','cemig','copel','coelba','celpe','cpfl','equatorial','energisa','sabesp','copasa','cedae','embasa','sanepar','comgas','naturgy']],
  ['🧾 Parcela', ['parcela','emprestimo','financiamento','consorcio','prestacao']],
];
const VERBOS_ENTRADA = ['recebi','ganhei','salario','caiu','entrou','vendi','renda','freela','reembolso','pagaram','me pagaram','comissao','bonus','decimo terceiro'];
const VERBOS_RESERVA = ['guardei','poupei','investi','apliquei','reservei','juntei','depositei no cofrinho'];
const PALAVRAS_VAZIAS = new Set(['gastei','paguei','comprei','gasto','compra','foi','com','no','na','nos','nas','em','de','do','da','dos','das','um','uma','o','a','os','as','pelo','pela','para','pra','pro','e','reais','real','r$','centavos','hoje','ontem','anteontem','meu','minha','ai','la','que','cartao','via']);
const normTxt = (t) => semAcento(t).replace(/[^a-z0-9$,.\s]/g,' ').replace(/\s+/g,' ').trim();
const temPalavra = (txt, w) => new RegExp('(^|\\s)' + w.replace(/[.$]/g,'\\$&') + '(?=\\s|$)').test(txt);

// Categoria de um texto: primeiro o histórico do usuário (descrição já usada), depois as palavras-chave (a mais longa ganha).
function categorizar(texto){
  const tt = normTxt(texto).replace(/[.,]/g,' ').replace(/\s+/g,' ');
  let melhor = null;
  Object.values(S.meses).forEach(M => M.gastos.forEach(g => { const d = normTxt(g.desc); if (d.length>=3 && temPalavra(tt, d) && (!melhor || d.length > melhor.n.length)) melhor = { n:d, cat:g.cat, desc:g.desc }; }));
  if (melhor) return { cat:melhor.cat, desc:melhor.desc };
  const minha = (S.catsExtras||[]).find(x => { const n = normTxt(nomeCat(x.c)); return n.length >= 3 && temPalavra(tt, n); });
  if (minha) return { cat:minha.c };
  let kw = null;
  PALAVRAS_CAT.forEach(([cat, ws]) => ws.forEach(w => { if (temPalavra(tt, w) && (!kw || w.length > kw.w.length)) kw = { w, cat }; }));
  return { cat: kw ? kw.cat : null };
}
function interpretarFrase(frase){
  const out = { tipo:'gastos' };
  const hashtags = (String(frase).match(/#[\p{L}\p{N}_-]+/gu) || []).map(h => normTag(h));
  if (hashtags.length){
    // "#viagem" reaproveita uma etiqueta existente ("Viagem Praia"); "#viagem_praia" vira "Viagem praia"
    const existentes = todasEtiquetas().map(x=>x.nome);
    out.tags = hashtags.map(h => { const hn = normTxt(h.replace(/_/g,' '));
      const e = existentes.find(x => normTxt(x) === hn) || existentes.find(x => normTxt(x).startsWith(hn));
      const novo = h.replace(/_/g,' '); return e || novo.charAt(0).toUpperCase() + novo.slice(1); });
    frase = String(frase).replace(/#[\p{L}\p{N}_-]+/gu, ' ');
  }
  let t = ' ' + normTxt(frase) + ' ';
  const tira = (re) => { t = t.replace(re, ' '); };
  // parcelas: "em 10x", "10 vezes", "parcelado em 3"
  let m = t.match(/\s(?:em\s)?(\d{1,2})\s?(?:x|vezes)\s/) || t.match(/\sparcelad[oa]\sem\s(\d{1,2})\s/);
  if (m){ out.parcelas = +m[1]; out.forma = 'Crédito'; tira(m[0]); }
  // data
  const hojeD = new Date();
  const fmt = (d) => key(d.getFullYear(), d.getMonth()) + '-' + String(d.getDate()).padStart(2,'0');
  if (/\santeontem\s/.test(t)){ const d = new Date(hojeD); d.setDate(d.getDate()-2); out.data = fmt(d); }
  else if (/\sontem\s/.test(t)){ const d = new Date(hojeD); d.setDate(d.getDate()-1); out.data = fmt(d); }
  m = t.match(/\s(?:no\s)?dia\s(\d{1,2})\s/);
  if (m){ const base = (cur.y===hojeD.getFullYear() && cur.m===hojeD.getMonth()) ? hojeD : new Date(cur.y, cur.m, 1);
    out.data = key(base.getFullYear(), base.getMonth()) + '-' + String(Math.min(+m[1], diasNoMes(base.getFullYear(), base.getMonth()))).padStart(2,'0'); tira(m[0]); }
  // valor: "45 reais e 90 centavos", "r$ 1.200,50", "45,90", "2 mil", "1,5 mil"
  m = t.match(/\s(?:r\$\s?)?(\d+)\s?(?:reais|real)\se\s(\d{1,2})\scentavos?\s/);
  if (m){ out.valor = +m[1] + (+m[2])/100; tira(m[0]); }
  else {
    m = t.match(/\s(?:r\$\s?)?(\d{1,3}(?:\.\d{3})+(?:,\d{1,2})?|\d+(?:[.,]\d{1,2})?)\s?(mil|k)?(?=\s)/);
    if (m){ let v = m[1]; v = /\.\d{3}/.test(v) ? v.replace(/\./g,'').replace(',','.') : v.replace(',','.');
      out.valor = Math.round(parseFloat(v) * (m[2] ? 1000 : 1) * 100) / 100; tira(m[0]); }
  }
  // forma de pagamento
  const cartaoFrase = (S.cartoes||[]).map(c=>({ c, n:normTxt(c.nome) })).filter(x=>x.n && temPalavra(t.trim(), x.n)).sort((a,b)=>b.n.length-a.n.length)[0];
  if (cartaoFrase){ out.forma = 'Crédito'; out.cartao = cartaoFrase.c.id; tira(new RegExp('\\s(?:no|na|com|pelo)?\\s?' + cartaoFrase.n + '(?=\\s)')); }
  if (out.cartao){}
  else if (/\s(cartao de credito|credito|no cartao)\s/.test(t)){ out.forma = 'Crédito'; tira(/\s(?:no|na|com|pelo|via)?\s?(?:cartao de credito|credito|no cartao)\s/); }
  else if (/\s(cartao de debito|debito)\s/.test(t)){ out.forma = 'Débito'; tira(/\s(?:no|na|com|pelo|via)?\s?(?:cartao de debito|debito)\s/); }
  else if (/\s(pix|dinheiro|especie|a vista)\s/.test(t)){ out.forma = 'Pix / Dinheiro'; tira(/\s(?:no|na|com|pelo|via|em)?\s?(?:pix|dinheiro|especie|a vista)\s/); }
  // tipo: entrada ou reserva
  if (VERBOS_RESERVA.some(w=>temPalavra(t.trim(), w))){
    out.tipo = 'reservas';
    const c = S.cofrinhos.map(c=>({ c, n:normTxt(c.nome) })).filter(x=>x.n && temPalavra(t.trim(), x.n)).sort((a,b)=>b.n.length-a.n.length)[0];
    if (c) out.cof = c.c.id;
    else if (/\s(invest|apliq)/.test(t)) out.dest = 'Renda Fixa';
  } else if (VERBOS_ENTRADA.some(w=>temPalavra(t.trim(), w))) out.tipo = 'entradas';
  // categoria: primeiro o histórico do usuário, depois as palavras-chave (a mais longa ganha)
  if (out.tipo === 'gastos'){ const c = categorizar(t); if (c.cat) out.cat = c.cat; if (c.desc) out.desc = c.desc; }
  // descrição: o que sobrou, sem palavras de ligação nas pontas
  if (!out.desc){
    const verbos = ['gastei','paguei','comprei','recebi','ganhei','guardei','poupei','investi','apliquei','reservei','juntei'];
    const ponta = (w) => PALAVRAS_VAZIAS.has(w) || verbos.includes(w);
    const sobra = t.trim().split(' ').filter(Boolean).filter(w => !verbos.includes(w));
    while (sobra.length && ponta(sobra[0])) sobra.shift();
    while (sobra.length && ponta(sobra[sobra.length-1])) sobra.pop();
    // volta para as palavras originais (com acentos)
    const orig = String(frase).split(/\s+/).map(w => w.replace(/[^\p{L}\p{N}&'-]/gu, '')).filter(Boolean);
    const normO = orig.map(w => normTxt(w));
    let j = 0;
    const d = sobra.map(w => { const i = normO.indexOf(w, j); if (i < 0) return w; j = i + 1; return orig[i]; }).join(' ');
    if (d && d.length <= 40) out.desc = d.charAt(0).toUpperCase() + d.slice(1);
  }
  return out;
}
// Preenche o formulário com o que foi entendido da frase.
function aplicarFrase(frase){
  if (!frase.trim()) return;
  const r = interpretarFrase(frase);
  if (r.tipo !== 'gastos'){
    abrirForm(r.tipo, null, null, r.tipo==='reservas' ? { cof:r.cof } : null);
    if (r.tipo==='reservas' && r.dest && !r.cof){ form.v.dest = r.dest; $sh.querySelectorAll('[data-chips="dest"] button').forEach(b=>b.classList.toggle('on', b.dataset.v===r.dest)); }
  }
  const set = (id, v) => { const el = document.getElementById(id); if (el && v != null && v !== '') el.value = v; };
  if (r.valor) set('fValor', moneyVal(r.valor));
  if (r.data) set('fData', r.data);
  if (r.tipo === 'entradas') set('fNome', r.desc);
  if (r.tipo === 'reservas') set('fNome', '');
  if (r.tipo === 'gastos'){
    if (r.cat) selecionarCat(r.cat);
    if (r.forma){ form.v.forma = r.forma; $sh.querySelectorAll('[data-chips="forma"] button').forEach(b=>b.classList.toggle('on', b.dataset.v===r.forma)); document.getElementById('boxParc').hidden = r.forma!=='Crédito';
      const bc = document.getElementById('boxCartao'); if (bc) bc.hidden = r.forma!=='Crédito' || !(S.cartoes||[]).length; }
    if (r.cartao){ form.v.cartao = r.cartao; const nm = cartaoPorId(r.cartao).nome; $sh.querySelectorAll('[data-chips="cartao"] button').forEach(b=>b.classList.toggle('on', b.dataset.v===nm)); }
    if (r.parcelas) set('fParc', String(Math.min(24, r.parcelas)));
    set('fDesc', r.desc);
    if (r.tags) set('fTags', [...new Set([...tagsDe((document.getElementById('fTags')||{}).value), ...r.tags])].join(', '));
    infoParcelas();
  }
  const partes = [r.valor ? brl(r.valor) : null,
    r.tipo==='entradas' ? 'Entrada' : r.tipo==='reservas' ? (r.cof ? 'Cofrinho ' + (cofPorId(r.cof)||{}).nome : 'Reserva') : r.cat ? nomeCat(r.cat) : null,
    r.tipo==='gastos' ? (r.cartao ? 'Crédito ' + cartaoPorId(r.cartao).nome : r.forma) : null, r.parcelas>1 ? r.parcelas+'x' : null, r.data ? fmtData(r.data) : null].filter(Boolean);
  const info = document.getElementById('fraseInfo');
  if (info) info.innerHTML = partes.length ? `✓ Entendi: <b>${esc(partes.join(' · '))}</b>${r.tipo==='gastos' && !r.cat ? ' — escolha a categoria' : ''}${!r.valor ? ' — falta o valor' : ''}` : 'Não entendi. Tente algo como “gastei 45 no mercado”.';
}
const Reconhecedor = window.SpeechRecognition || window.webkitSpeechRecognition;
const ehIOS = /iphone|ipad|ipod/i.test(navigator.userAgent) || (/Macintosh/.test(navigator.userAgent) && navigator.maxTouchPoints > 1);
// No iPhone o reconhecimento de voz do navegador costuma não responder (principalmente no app instalado).
// Lá usamos o ditado do teclado: o campo recebe o texto e a frase é aplicada quando a pessoa para de falar.
function usarDitadoDoTeclado(){
  const i = document.getElementById('fFrase'), info = document.getElementById('fraseInfo');
  if (!i) return;
  i.focus();
  if (info) info.innerHTML = '🎤 Toque no <b>microfone do teclado</b> e fale. Ex.: “gastei 45 no mercado no crédito”.';
}
function ouvirFrase(btn){
  if (ehIOS || !Reconhecedor) return usarDitadoDoTeclado();
  const r = new Reconhecedor(); r.lang = 'pt-BR'; r.interimResults = false; r.maxAlternatives = 1;
  let comecou = false;
  btn.classList.add('gravando');
  const info = document.getElementById('fraseInfo'); if (info) info.textContent = '🎙️ Ouvindo… fale a frase.';
  r.onstart = () => { comecou = true; };
  r.onresult = (e) => { const txt = e.results[0][0].transcript; const i = document.getElementById('fFrase'); if (i){ i.value = txt; i.dataset.aplicado = txt; } aplicarFrase(txt); };
  r.onerror = (e) => {
    btn.classList.remove('gravando');
    if (e.error === 'no-speech' || e.error === 'aborted') { if (info) info.textContent = 'Não ouvi nada. Toque no 🎤 e fale de novo.'; return; }
    usarDitadoDoTeclado();
    if (e.error === 'not-allowed') toast('Permita o microfone, ou use o microfone do teclado.');
  };
  r.onend = () => btn.classList.remove('gravando');
  // Se o navegador não responder em 2 s, cai para o ditado do teclado.
  setTimeout(() => { if (!comecou){ try { r.abort(); } catch(_){} btn.classList.remove('gravando'); usarDitadoDoTeclado(); } }, 2000);
  try { r.start(); } catch(e){ btn.classList.remove('gravando'); usarDitadoDoTeclado(); }
}
const blocoFrase = () => `<div class="frase"><input id="fFrase" enterkeyhint="done" autocomplete="off" placeholder="✨ Ex.: gastei 45 no ifood no crédito">
  <button type="button" class="mic" data-act="ouvir" aria-label="Falar a frase">🎤</button></div><div class="frase-info" id="fraseInfo"></div>`;

/* ---------- importar extrato do banco (OFX ou CSV) ----------
   Tudo é lido no próprio aparelho. Sugere categoria, separa gastos e entradas, desmarca duplicados
   e pagamentos de fatura. O cliente confere antes de importar. */
let imp = null;
function lerArquivoTexto(arquivo){
  return arquivo.arrayBuffer().then(buf => {
    try { return new TextDecoder('utf-8', { fatal:true }).decode(buf); }
    catch(e){ return new TextDecoder('windows-1252').decode(buf); }   // OFX de banco costuma vir em latin-1
  });
}
function valorBanco(t){
  t = String(t||'').replace(/R\$|\s/g,'');
  if (!t) return NaN;
  const neg = /^-|^\(.*\)$|-$/.test(t); t = t.replace(/[()\-+]/g,'');
  const ul = Math.max(t.lastIndexOf(','), t.lastIndexOf('.'));
  if (ul >= 0 && t.length - ul - 1 <= 2) t = t.slice(0,ul).replace(/[.,]/g,'') + '.' + t.slice(ul+1);
  else t = t.replace(/[.,]/g,'');
  const n = parseFloat(t); return isNaN(n) ? NaN : (neg ? -n : n);
}
function dataBanco(t){
  t = String(t||'').trim();
  let m = t.match(/^(\d{4})-?(\d{2})-?(\d{2})/); if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  m = t.match(/^(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{2,4})/);
  if (m){ const y = m[3].length===2 ? '20'+m[3] : m[3]; return `${y}-${m[2].padStart(2,'0')}-${m[1].padStart(2,'0')}`; }
  return null;
}
function lerOFX(txt){
  const cartao = /CREDITCARDMSGSRS|CCSTMTRS/i.test(txt);
  const trans = txt.split(/<STMTTRN>/i).slice(1).map(b => {
    const tag = (n) => ((b.match(new RegExp('<' + n + '>([^<\\r\\n]*)', 'i')) || [])[1] || '').trim();
    return { data: dataBanco(tag('DTPOSTED')), valor: valorBanco(tag('TRNAMT').replace(',', '.')), desc: tag('MEMO') || tag('NAME') || 'Lançamento' };
  });
  return { trans, cartao };
}
function linhasCSV(txt){
  const linhas = txt.replace(/\r/g,'').split('\n').filter(l=>l.trim());
  const sep = (linhas[0].match(/;/g)||[]).length >= (linhas[0].match(/,/g)||[]).length ? ';' : ',';
  return linhas.map(l => { const out = []; let cel = '', q = false;
    for (let i=0;i<l.length;i++){ const c = l[i];
      if (c === '"'){ if (q && l[i+1] === '"'){ cel += '"'; i++; } else q = !q; }
      else if (c === sep && !q){ out.push(cel); cel = ''; } else cel += c; }
    out.push(cel); return out.map(x=>x.trim()); });
}
function lerCSV(txt){
  const L = linhasCSV(txt); if (!L.length) return { trans:[] };
  const cab = L[0].map(h => normTxt(h));
  let iD = cab.findIndex(h => /^(data|date|dt)/.test(h));
  let iT = cab.findIndex(h => /(descri|title|titulo|historico|hist|lancamento|estabelecimento|detalhe|memo|nome)/.test(h));
  let iV = cab.findIndex(h => /(valor|amount|value|quantia|montante)/.test(h));
  let corpo = L.slice(1);
  if (iD < 0 || iV < 0){   // sem cabeçalho reconhecível: adivinha pelas colunas
    corpo = L; const ex = L[0];
    iD = ex.findIndex(c => dataBanco(c)); iV = ex.findIndex((c,i) => i!==iD && !isNaN(valorBanco(c)) && /\d/.test(c));
    iT = ex.findIndex((c,i) => i!==iD && i!==iV && c.length > 2);
  }
  const trans = corpo.map(c => ({ data: dataBanco(c[iD]), valor: valorBanco(c[iV]), desc: (iT>=0 ? c[iT] : '') || 'Lançamento' }))
    .filter(t => t.data && !isNaN(t.valor));
  const positivos = trans.filter(t=>t.valor>0).length;
  return { trans, cartao: trans.length && positivos > trans.length/2 };   // fatura de cartão costuma vir com compras positivas
}
const PREFIXOS_BANCO = /^(compra (no|com|em) (cart[aã]o (de )?)?(d[eé]bito|cr[eé]dito)\s*-?\s*|compra\s*-?\s*|pagamento (efetuado|de boleto|de conta)\s*-?\s*|transfer[eê]ncia (enviada|recebida)( pelo pix)?\s*-?\s*|pix (enviado|recebido|transf\w*)\s*-?\s*|d[eé]bito autom[aá]tico\s*-?\s*|deb(ito)?\.?\s+|cred(ito)?\.?\s+)/i;
function limparDesc(d){
  let t = String(d||'').replace(PREFIXOS_BANCO,'').replace(/\*/g,' ').replace(/\s{2,}/g,' ').trim();
  t = t.replace(/\s*-?\s*parcela\s*(\d+)\s*(?:\/|de)\s*(\d+)/i, ' ($1/$2)');            // "Loja - Parcela 2/5" → "Loja (2/5)"
  t = t.split(' ').filter((w,i,a) => i===0 || w.toLowerCase() !== a[i-1].toLowerCase()).join(' ');   // "IFOOD IFOOD" → "IFOOD"
  t = t.replace(/\.com(\.br)?$/i,'');
  if (t && t === t.toUpperCase()) t = t.toLowerCase().replace(/(^|\s)\S/g, x => x.toUpperCase());
  return (t || 'Lançamento').slice(0,40);
}
function abrirImportacao(arquivo){
  lerArquivoTexto(arquivo).then(txt => {
    const ehOFX = /<OFX>|<STMTTRN>/i.test(txt);
    const r = ehOFX ? lerOFX(txt) : lerCSV(txt);
    const trans = r.trans.filter(t => t.data && !isNaN(t.valor) && Math.abs(t.valor) >= 0.01);
    if (!trans.length) return toast('Não encontramos transações nesse arquivo. Use o extrato em OFX ou CSV.');
    imp = { cartao: (S.cartoes||[])[0] ? S.cartoes[0].id : null, modo: r.cartao ? 'cartao' : 'conta', sinalCompra: ehOFX ? -1 : (r.cartao ? 1 : -1),
      itens: trans.map((t,i) => { const desc = limparDesc(t.desc), c = categorizar(desc.replace(/\(\d+\/\d+\)/,''));
        return { i, data:t.data, valor:t.valor, original:t.desc, desc, cat: c.cat || '❓ Outros' }; }) };
    prepararImportacao(); desenharImportacao();
  }).catch(() => toast('Não foi possível ler o arquivo.'));
}
// Recalcula tipo (gasto/entrada), duplicados e o que vem marcado, conforme o modo (conta ou cartão).
function prepararImportacao(){
  const compra = imp.modo === 'cartao' ? imp.sinalCompra : -1;
  imp.itens.forEach(x => {
    x.tipo = Math.sign(x.valor) === compra ? 'gastos' : 'entradas';
    x.fatura = /pagamento (de |da )?fatura|pagamento recebido|pgto\.? fatura|pag\.? fatura|fatura (do )?cart/i.test(semAcento(x.original));
    if (imp.modo === 'cartao' && x.tipo === 'entradas') x.fatura = x.fatura || true;   // no cartão, créditos são pagamentos/estornos
    const M = S.meses[x.data.slice(0,7)];
    const perto = (d) => d && Math.abs(new Date(d+'T12:00:00') - new Date(x.data+'T12:00:00')) <= 864e5;
    x.dup = !!M && (x.tipo === 'gastos'
      ? M.gastos.some(g => Math.abs(g.valor - Math.abs(x.valor)) < 0.01 && perto(g.data))
      : M.entradas.some(e => Math.abs(e.valor - Math.abs(x.valor)) < 0.01 && perto(e.data)));
    x.sel = !x.dup && !x.fatura;
  });
}
function desenharImportacao(){
  const it = imp.itens, sel = it.filter(x=>x.sel);
  const datas = it.map(x=>x.data).sort();
  const opts = (c) => catsVisiveis(c).map(k=>`<option value="${esc(k)}" ${k===c?'selected':''}>${k}</option>`).join('');
  abrir(`<h2>📥 Importar extrato</h2>
    <p class="note" style="margin:-6px 0 12px">${it.length} transações de ${fmtData(datas[0])}/${datas[0].slice(2,4)} a ${fmtData(datas[datas.length-1])}/${datas[datas.length-1].slice(2,4)}. Confira as categorias e desmarque o que não quiser.</p>
    <div class="seg sm"><button type="button" class="${imp.modo==='conta'?'on':''}" data-impmodo="conta">Conta (débito/Pix)</button><button type="button" class="${imp.modo==='cartao'?'on':''}" data-impmodo="cartao">Cartão de crédito</button></div>
    <div class="list flat imp-lista">${it.map(x=>`<div class="item imp ${x.sel?'':'off'}">
      <input type="checkbox" data-impsel="${x.i}" ${x.sel?'checked':''} aria-label="Importar ${esc(x.desc)}">
      <div class="tx"><div class="t1">${esc(x.desc)}</div>
        <div class="t2">${fmtData(x.data)} · ${x.tipo==='gastos' ? `<select data-impcat="${x.i}" aria-label="Categoria">${opts(x.cat)}</select>` : 'Entrada'}
        ${x.dup?'<span class="tag warn">já lançado</span>':''}${x.fatura?'<span class="tag">pagamento de fatura</span>':''}</div></div>
      <div class="val num ${x.tipo==='entradas'?'up':''}">${brl(Math.abs(x.valor))}</div></div>`).join('')}</div>
    ${imp.modo==='cartao' && (S.cartoes||[]).length ? `<div class="f"><label>De qual cartão é este extrato?</label><select id="impCartao">${S.cartoes.map(c=>`<option value="${c.id}" ${c.id===imp.cartao?'selected':''}>${esc(c.nome)}</option>`).join('')}</select></div>` : ''}
    <p class="note">${imp.modo==='cartao' ? 'Gastos do cartão entram como Crédito, na fatura certa.' : 'Gastos da conta entram como Débito ou Pix.'}</p>
    <button class="btn pri" data-act="confirmarImp">Importar ${sel.length} lançamento${sel.length===1?'':'s'}</button>`);
}
function confirmarImportacao(){
  const sel = imp.itens.filter(x=>x.sel); if (!sel.length) return toast('Nenhum lançamento marcado');
  sel.forEach(x => {
    const o = ymDe(x.data.slice(0,7)), M = mes(o.y, o.m, true), valor = Math.round(Math.abs(x.valor)*100)/100;
    if (x.tipo === 'gastos'){
      const forma = imp.modo === 'cartao' ? 'Crédito' : /pix/i.test(x.original) ? 'Pix / Dinheiro' : 'Débito';
      const cartao = forma === 'Crédito' && cartaoPorId(imp.cartao) ? imp.cartao : undefined;
      M.gastos.push({ id:uid(), cat:x.cat, forma, valor, data:x.data, essencial:ehEssencial(x.cat), desc:x.desc, parcelas:1, importado:true, cartao });
    } else M.entradas.push({ id:uid(), nome:x.desc, valor, data:x.data, importado:true });
  });
  S.novosDesdeBackup = (S.novosDesdeBackup||0) + sel.length; registrarDiaAtivo(); salvar();
  const ultimo = ymDe(sel.map(x=>x.data).sort().pop().slice(0,7)); cur = ultimo; imp = null;
  fechar(); aba = 'lanc'; subLanc = 'gastos'; render(); toast(`${sel.length} lançamentos importados ✓`); checarConquistas();
}

/* ---------- cofrinhos ----------
   Cada reserva pode ir para um cofrinho (campo cof). Reservas antigas usam o tipo. Retiradas são valores negativos. */
const cofDe = (r) => r.cof || (r.tipo==='Reserva de emergência' ? 'reserva' : r.tipo==='Meta' ? 'meta' : null);
const cofPorId = (id) => S.cofrinhos.find(c=>c.id===id);
function guardadoNoMes(id, y, m){ return soma(mes(y,m).reservas.filter(r=>cofDe(r)===id), r=>r.valor); }
function guardadoAte(id, k){
  let t = 0; Object.entries(S.meses).forEach(([mk,M]) => { if (mk <= k) t += soma(M.reservas.filter(r=>cofDe(r)===id), r=>r.valor); });
  return t;
}
const mesesEntre = (k1, k2) => { const a = ymDe(k1), b = ymDe(k2); return (b.y-a.y)*12 + (b.m-a.m); };

/* ---------- cálculos ---------- */
let memo = {};
function primeiraChave(){ const ks = Object.keys(S.meses).filter(k=>temDados(S.meses[k])).sort(); return ks[0]; }
function temDados(M){ return M && (M.entradas.length||M.gastos.length||M.contas.length||M.reservas.length); }

function calc(y,m){
  const k = key(y,m);
  if (memo[k]) return memo[k];
  const M = mes(y,m);
  const p = prevYM(y,m), pk = key(p.y,p.m);
  const first = primeiraChave();
  const temAnterior = first && pk >= first;
  const P = temAnterior ? calc(p.y,p.m) : null;
  const parc = parcelasDoMes(y,m);
  const simples = M.gastos.filter(g=>!ehParcelado(g));

  const entradasLanc = soma(M.entradas, e=>e.valor);
  const saldoAnterior = (S.carry && P) ? P.restante : 0;
  // faturas pagas neste mês (compras no crédito de meses/faturas anteriores); paga só em parte, conta o que foi pago
  const faturaAnterior = soma(faturasPorCartao(y,m), f => { const st = f.cartao && statusFatura(f.cartao.id, y, m); return st ? Math.min(st.pago, f.valor) : f.valor; });
  const gastosVista = soma(simples.filter(g=>g.forma!=='Crédito'), g=>g.valor);
  const credito = soma(simples.filter(g=>g.forma==='Crédito'), g=>g.valor) + soma(parc, x=>x.valor);
  const debito = soma(simples.filter(g=>g.forma==='Débito'), g=>g.valor);
  const pix = soma(simples.filter(g=>g.forma==='Pix / Dinheiro'), g=>g.valor);
  const contasPagas = soma(M.contas.filter(c=>c.pago), c=>c.valor);
  const contasPend = soma(M.contas.filter(c=>!c.pago), c=>c.planejado||c.valor);
  const contasPlan = soma(M.contas, c=>c.planejado||c.valor);
  const reservas = soma(M.reservas, r=>r.valor);
  const resEmerg = soma(M.reservas.filter(r=>r.tipo==='Reserva de emergência'), r=>r.valor);
  const resMeta = soma(M.reservas.filter(r=>r.tipo==='Meta'), r=>r.valor);

  const entradas = entradasLanc + saldoAnterior;
  const saidas = gastosVista + contasPagas + faturaAnterior;
  const restante = entradas - saidas - reservas;

  // Consumo por categoria (o que foi gasto no mês, inclusive no crédito; parcelas contam no mês de cada parcela).
  // Gasto dividido: no saldo sai o valor todo; nas categorias conta só a sua parte (minha).
  const parte = (g) => g.minha != null && g.valor ? g.minha / g.valor : 1;
  const cats = {};
  simples.forEach(g=>{ cats[g.cat] = (cats[g.cat]||0) + (+g.valor||0) * parte(g); });
  parc.forEach(x=>{ cats[x.g.cat] = (cats[x.g.cat]||0) + x.valor * parte(x.g); });
  if (contasPagas) cats[CAT_CONTAS] = (cats[CAT_CONTAS]||0) + contasPagas;
  const consumo = soma(Object.values(cats), v=>v);
  const essenciais = soma(simples.filter(g=>g.essencial), g=>g.valor*parte(g)) + soma(parc.filter(x=>x.g.essencial), x=>x.valor*parte(x.g)) + contasPagas;
  const renda = soma(M.entradas.filter(e=>!e.reembolso), e=>e.valor);   // sem devoluções de quem te devia

  const acumEm = (P ? P.acumEmerg : 0) + resEmerg;
  const acumMt = (P ? P.acumMeta : 0) + resMeta;

  return memo[k] = { entradas, entradasLanc, renda, saldoAnterior, faturaAnterior, saidas, reservas, restante,
    debito, credito, pix, gastosVista, contasPagas, contasPend, contasPlan, cats, consumo, essenciais,
    resEmerg, resMeta, acumEmerg:acumEm, acumMeta:acumMt, P };
}

// Situação de uma conta pendente em relação ao vencimento (só para o mês atual).
function statusConta(c, y, m){
  if (c.pago || !c.venc) return null;
  const kc = key(y,m), kh = chaveHoje();
  if (kc > kh) return null;
  if (kc < kh) return { t:'atrasada', cls:'cr' };
  const dif = Math.min(+c.venc, diasNoMes(y,m)) - hoje.getDate();
  if (dif < 0) return { t:'atrasada', cls:'cr' };
  if (dif === 0) return { t:'vence hoje', cls:'cr' };
  if (dif <= 3) return { t:`vence em ${dif} dia${dif>1?'s':''}`, cls:'warn' };
  return { t:`vence dia ${c.venc}`, cls:'' };
}

/* ---------- render ---------- */
const $app = document.getElementById('app');
const ICON = {
  resumo:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/></svg>',
  lanc:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/></svg>',
  contas:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="3" width="16" height="18" rx="2"/><path d="M8 8l2 2 4-4M8 15h8"/></svg>',
  metas:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1"/></svg>',
  ajustes:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M4 7h10M18 7h2M4 17h4M12 17h8"/><circle cx="16" cy="7" r="2"/><circle cx="10" cy="17" r="2"/></svg>',
  olho:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/></svg>',
  olhoFechado:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 3l18 18M10.6 5.1A10.4 10.4 0 0 1 12 5c6.4 0 10 7 10 7a17 17 0 0 1-3.2 4.1M6.6 6.6C3.9 8.3 2 12 2 12s3.6 7 10 7c1.7 0 3.2-.5 4.5-1.2M9.9 9.9a3 3 0 0 0 4.2 4.2"/></svg>',
  plus:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>'
};

function render(){
  memo = {}; memoParc = null; memoFat = null; memoOrc = {};
  if (aba==='ajustes' && temSenha()) bioDisponivel().then(ok => { const l = document.getElementById('linhaBio'); if (l) l.hidden = !ok; });
  if (CONFIG.exigirCodigo && !S.liberado) return renderAcesso();
  if (!S.perfil.ok) return renderOnboarding();
  aplicarRecorrentes(cur.y,cur.m);
  const p = S.perfil;
  const saud = p.pronome==='Femininos' ? 'Bem-vinda' : p.pronome==='Masculinos' ? 'Bem-vindo' : 'Boas-vindas';
  const telas = { resumo:telaResumo, analise:telaAnalise, lanc:telaLanc, contas:telaContas, metas:telaMetas, ajustes:telaAjustes };
  $app.innerHTML = `
    <header class="top ${aba==='resumo'?'hero-top':''}">
      <button class="olho" data-act="olho" aria-label="${S.ocultar?'Mostrar valores':'Esconder valores'}" aria-pressed="${!!S.ocultar}">${S.ocultar ? ICON.olhoFechado : ICON.olho}</button>
      <div class="hello">Olá, ${esc(p.nome||'você')}!${sequenciaAtual()>=1?`<button class="streak" data-tab="metas" aria-label="Sequência de ${sequenciaAtual()} dias">🔥 ${sequenciaAtual()}</button>`:''}</div>
      ${aba==='resumo' || aba==='analise' ? '' : `<div class="sub">${saud} de volta</div>`}
      <div class="monthbar">
        <button data-act="prev" aria-label="Mês anterior">‹</button>
        <div class="m">${MESES[cur.m]} ${cur.y}</div>
        <button data-act="next" aria-label="Próximo mês">›</button>
      </div>
    </header>
    <main>${telas[aba]()}</main>
    <nav>
      ${navBtn('resumo','Início')}${navBtn('lanc','Lançamentos')}
      <button class="fab" data-act="add" aria-label="Novo lançamento">${ICON.plus}</button>
      ${navBtn('contas','Contas')}${navBtn('metas','Planejar')}
    </nav>`;
}
const navBtn = (id,l) => `<button class="${aba===id || (id==='resumo' && aba==='analise')?'on':''}" data-tab="${id}">${ICON[id]}${l}</button>`;

function variacao(atual, anterior, menorMelhor){
  if (anterior==null) return '<div class="d">Primeiro mês</div>';
  const dif = atual - anterior;
  if (Math.abs(dif) < 0.005) return `<div class="d">= mês anterior</div>`;
  const bom = menorMelhor ? dif<0 : dif>0;
  return `<div class="d"><span class="${bom?'up':'down'}">${dif>0?'▲':'▼'} ${brl(Math.abs(dif))}</span> vs. anterior</div>`;
}

// Tela inicial: só o essencial. Quanto dá para gastar hoje, um aviso por vez, o mês em três números e os
// últimos lançamentos. Gráficos, fluxo, orçamentos, assinaturas e cofrinhos ficam na Análise do mês.
function telaResumo(){
  const C = calc(cur.y,cur.m);
  const avisos = [cardPassos, alertasContas, cardConvitePlus, () => alertasOrcamento(C), lembreteBackup, cardSemana, cardOrganizar, () => cardRendaVariavel(C),
    cardRetro, cardTagAtiva, cardIndique, dicaTransferir, () => !S.listaDispensada && !precisaBackup() ? cardConectado() : ''];
  let aviso = '';
  for (const f of avisos){ aviso = f(); if (aviso) break; }
  return heroResumo(C) + aviso + cardEsteMes(C) + cardUltimos();
}
function cardEsteMes(C){
  const cats = Object.entries(C.cats).filter(([,v])=>v>0).sort((a,b)=>b[1]-a[1]).slice(0,3), max = cats.length ? cats[0][1] : 1;
  return `<section class="card mes-resumo">
    <div class="mr-nums">
      <div><span>Entrou</span><b class="num">${brl0(C.entradas - (C.saldoAnterior||0))}</b></div>
      <div><span>Saiu</span><b class="num">${brl0(C.saidas + C.reservas)}</b></div>
      <div><span>Sobrou</span><b class="num ${C.restante<0 && !S.ocultar?'neg':''}">${brl0(C.restante)}</b></div>
    </div>
    ${Math.abs(C.saldoAnterior||0) >= 0.5 ? `<p class="note" style="margin:-6px 0 12px">${C.saldoAnterior > 0 ? `O que sobrou inclui <b>${brl0(C.saldoAnterior)}</b> que vieram de ${MESES[prevYM(cur.y,cur.m).m].toLowerCase()}.` : `O que sobrou já desconta <b>${brl0(-C.saldoAnterior)}</b> que faltaram em ${MESES[prevYM(cur.y,cur.m).m].toLowerCase()}.`}</p>` : ''}
    ${cats.length ? `<div class="hbars mr-cats">${cats.map(([c,v])=>`<button class="hb" data-cat="${esc(c)}" aria-label="${esc(nomeCat(c))}: ${brl(v)}">
      <span class="hb-l"><span class="hb-e">${emojiCat(c)}</span>${esc(nomeCat(c))}</span><span class="hb-v num">${brl(v)}</span>
      <span class="hb-t"><span style="width:${Math.max(v/max*100,1.5)}%"></span></span></button>`).join('')}</div>` : ''}
    <button class="ver-mais" data-act="analise">Ver análise completa ›</button></section>`;
}
function cardUltimos(){
  const M = mes(cur.y,cur.m), mk = key(cur.y,cur.m);
  const it = [...M.gastos.map(g => ({ tipo:'gastos', id:g.id, ic:emojiCat(g.cat), t:g.desc || nomeCat(g.cat), d:g.data, v:-(+g.valor) })),
    ...M.entradas.map(e => ({ tipo:'entradas', id:e.id, ic:'💰', t:e.nome || 'Entrada', d:e.data, v:+e.valor }))]
    .sort((a,b) => String(b.d||'').localeCompare(String(a.d||''))).slice(0,3);
  if (!it.length) return '';
  return `<section class="card"><h3>Últimos lançamentos</h3>
    <div class="list">${it.map(i => `<button class="item" data-edit="${i.tipo}" data-id="${i.id}" data-mk="${mk}"><div class="ic">${i.ic}</div><div class="tx"><div class="t1">${esc(i.t)}</div><div class="t2">${i.d ? fmtData(i.d) : ''}</div></div><div class="val num ${i.v>0?'up':''}">${brl(Math.abs(i.v))}</div></button>`).join('')}</div>
    <button class="ver-mais" data-tab="lanc">Ver todos</button></section>`;
}
function telaAnalise(){
  const C = calc(cur.y,cur.m), P = C.P;
  const prox = nextYM(cur.y,cur.m);
  const neg = C.restante < 0;
  let html = `<button class="voltar-inicio" data-tab="resumo">‹ Início</button><h2 class="tela-tit">Análise do mês</h2>`;

  const grade = `<div class="grid">
    ${stat('Entradas','#0d9668',C.entradas, variacao(C.entradas, P&&P.entradas, false))}
    ${stat('Saídas','#dc4545',C.saidas, variacao(C.saidas, P&&P.saidas, true))}
    ${stat('Reservas & invest.','#14b8a6',C.reservas, variacao(C.reservas, P&&P.reservas, false))}
    ${stat('Uso do crédito','#e9a91b',C.credito, variacao(C.credito, P&&P.credito, true))}
  </div>`;
  if (C.credito > 0) html += `<div class="alert"><span>💳</span><div><b>${brl(C.credito)} no crédito</b> ainda não saiu do seu saldo. Esse valor entra nas saídas quando a fatura vencer${(S.cartoes||[]).length?'':` (em ${MESES[prox.m]})`}.</div></div>`;
  if (C.faturaAnterior > 0){ const fs = faturasPorCartao(cur.y,cur.m);
    html += `<div class="alert info"><span>📥</span><div>${fs.length>1?'As faturas':'A fatura'} deste mês ${fs.map(f=>`<b>${f.cartao?esc(f.cartao.nome)+' ':''}${brl(f.valor)}</b>${f.cartao?` (vence dia ${f.cartao.vencimento})`:''}`).join(', ')} já ${fs.length>1?'estão somadas':'está somada'} nas saídas.</div></div>`; }

  html += cardDicas();
  html += cardCategorias(C);
  html += cardFluxo(C);
  html += grade;
  html += cardOrcamentos(C);
  html += cardAssinaturas();
  html += cardEvolucao();

  html += cardCofrinhos(true);

  const tot = C.contasPagas + C.contasPend;
  html += `<section class="card"><h3>Fluxo de contas <small>${brl(C.contasPlan)} planejado</small></h3>`;
  if (tot>0){
    const pp = C.contasPagas/tot*100;
    html += `<div class="split"><div style="width:${pp}%;background:var(--teal)"></div><div style="width:${100-pp}%;background:var(--pend)"></div></div>
    <div class="legend"><span><i style="background:var(--teal)"></i>Pagas ${brl(C.contasPagas)}</span><span><i style="background:var(--pend)"></i>Pendentes ${brl(C.contasPend)}</span></div>`;
  } else html += `<div class="note">Nenhuma conta cadastrada neste mês.</div>`;
  html += `</section>`;
  return html;
}
const stat = (k,cor,v,d) => `<div class="stat"><div class="k"><i style="background:${cor}"></i>${k}</div><div class="v num">${brl(v)}</div>${d}</div>`;

// Previsão do mês atual: quanto dá para gastar por dia e onde o mês vai terminar.
/* ---------- dicas automáticas ----------
   Comparam o mês atual com a média dos últimos meses (proporcional ao dia do mês). */
let dicasAbertas = false;
const NAO_ESSENCIAIS = ['🍗 Alimentação','🎉 Lazer','📦 Compras Online','👕 Vestuário','💄 Beleza','📱 Assinaturas','🎁 Presentes'];
const FIXAS = [CAT_CONTAS,'🧾 Contas','🧾 Parcela'];
function calcularDicas(){
  const y = hoje.getFullYear(), m = hoje.getMonth(), C = calc(y,m), d = hoje.getDate(), D = diasNoMes(y,m), frac = d / D;
  const base = []; for (let i=1; i<=6 && base.length<3; i++){ const o = somaMeses(y,m,-i); if (temDados(S.meses[key(o.y,o.m)])) base.push(calc(o.y,o.m)); }
  const dicas = [], pct = (a,b) => Math.round(Math.abs(a/b - 1) * 100);
  const media = {}; if (base.length) todasCats().concat([CAT_CONTAS]).forEach(c => media[c] = soma(base, b=>b.cats[c]||0) / base.length);
  // 1-2. categorias acima/abaixo do normal para esta altura do mês
  if (base.length && frac >= 0.2) Object.entries(media).forEach(([c, md]) => {
    if (FIXAS.includes(c) || md < 50) return;
    const esp = md * frac, at = C.cats[c] || 0;
    if (at > esp * 1.3 && at - esp >= 40) dicas.push({ e:'📈', p: 60 + (at-esp)/10, s:`<b>${esc(nomeCat(c))}</b> tá pesado: ${brl(at)} até agora, ${pct(at,esp)}% acima do seu normal. Seu bolso pediu socorro 🫠`, t:`<b>${esc(nomeCat(c))}</b>: você já gastou ${brl(at)}, ${pct(at,esp)}% acima do normal para esta altura do mês.` });
    else if (md >= 100 && frac >= 0.4 && at < esp * 0.7) dicas.push({ e:'👏', p: 30, t: at === 0 ? `Nada gasto em <b>${esc(nomeCat(c))}</b> até agora este mês. Continue assim!` : `<b>${esc(nomeCat(c))}</b> está ${pct(at,esp)}% abaixo do normal. Continue assim!` });
  });
  // 3. ritmo geral
  if (base.length && frac >= 0.25){
    const esp = soma(Object.entries(media).filter(([c])=>!FIXAS.includes(c)), x=>x[1]) * frac;
    const at = C.consumo - (C.cats[CAT_CONTAS]||0) - (C.cats['🧾 Contas']||0) - (C.cats['🧾 Parcela']||0);
    if (esp > 0 && at > esp * 1.15) dicas.push({ e:'⚠️', p: 75, s:`Mês acelerado: você está gastando <b>${pct(at,esp)}% acima do normal</b>. Bora pisar no freio? 🛑`, t:`No geral, você está gastando <b>${pct(at,esp)}% acima do normal</b> neste mês.` });
    else if (esp > 0 && at < esp * 0.85) dicas.push({ e:'🎉', p: 45, s:`Gastando <b>${pct(at,esp)}% menos</b> que o normal. Quem é você e o que fez com o gastador? 😎`, t:`Você está gastando <b>${pct(at,esp)}% menos</b> que o normal neste mês. Mandou bem!` });
  }
  // 4. ainda não guardou
  if (d >= 10 && C.renda > 0 && C.reservas <= 0) dicas.push({ e:'🐷', p: 70, s:`Nada guardado este mês ainda. Seu eu do futuro mandou avisar que está esperando <b>${brl(Math.round(C.renda*0.1/10)*10)}</b> 👀`, acao:'guardar', t:`Você ainda não guardou nada este mês. Que tal guardar <b>${brl(Math.round(C.renda*0.1/10)*10)}</b> (10% da renda) agora?` });
  // 5. gastos pequenos
  const M = mes(y,m), peq = M.gastos.filter(g=>!ehParcelado(g) && g.valor <= 30);
  if (peq.length >= 8 && soma(peq,g=>g.valor) >= 150) dicas.push({ e:'☕', p: 50, s:`Os “é só um cafezinho” já somam <b>${brl(soma(peq,g=>g.valor))}</b> em ${peq.length} lançamentos. Cafezinho caro, hein ☕`, t:`Os gastos pequenos (até R$ 30) já somam <b>${brl(soma(peq,g=>g.valor))}</b> este mês, em ${peq.length} lançamentos.` });
  // 6. economia anual cortando 20% da maior categoria não essencial
  const top = Object.entries(media).filter(([c])=>NAO_ESSENCIAIS.includes(c)).sort((a,b)=>b[1]-a[1])[0];
  if (top && top[1] >= 150) dicas.push({ e:'✂️', p: 28, t:`Cortando 20% de <b>${esc(nomeCat(top[0]))}</b>, você economiza ${brl0(top[1]*0.2*12)} por ano.` });
  // 7. dia da semana que mais gasta (últimos 60 dias)
  const porDia = [0,0,0,0,0,0,0], limite = new Date(Date.now() - 60*864e5).toISOString().slice(0,10);
  Object.values(S.meses).forEach(Mx => Mx.gastos.forEach(g => { if (!ehParcelado(g) && g.data && g.data >= limite) porDia[new Date(g.data+'T12:00:00').getDay()] += +g.valor; }));
  const totDias = soma(porDia, v=>v), maxDia = Math.max(...porDia);
  if (totDias > 300 && maxDia/totDias >= 0.24){ const n = porDia.indexOf(maxDia); dicas.push({ e:'📅', p: 20, t:`<b>${DIAS_SEMANA[n].charAt(0).toUpperCase()+DIAS_SEMANA[n].slice(1)}</b> é o dia em que você mais gasta: ${Math.round(maxDia/totDias*100)}% dos gastos dos últimos 2 meses.` }); }
  // 8. parcelas futuras pesadas
  const renda = base.length ? soma(base, b=>b.renda)/base.length : C.renda, fut = comprometidoFuturo();
  if (renda > 0 && fut > renda * 0.3) dicas.push({ e:'💳', p: 55, s:`Já tem <b>${brl(fut)}</b> em parcelas pela frente. Mais um “12x sem juros” e o cartão pede férias 💳`, t:`Você já tem <b>${brl(fut)}</b> em parcelas nos próximos meses (${Math.round(fut/renda*100)}% de um mês de renda). Cuidado com novas compras parceladas.` });
  // 9. assinaturas
  const assin = detectarAssinaturas().filter(a=>a.ativa), anual = soma(assin, a=>a.valor) * 12;
  if (anual >= 600) dicas.push({ e:'🔁', p: 25, acao:'assinaturas', s:`Suas assinaturas custam <b>${brl0(anual)} por ano</b>. Você usa tudo isso mesmo? 🤨`, t:`Suas assinaturas custam <b>${brl0(anual)} por ano</b>. Vale revisar se você usa todas.` });
  // 10. meta da reserva muito abaixo do ideal (ou sem reserva)
  const res = cofReserva(), ideal = reservaIdeal(6);
  if (ideal && !res) dicas.push({ e:'🛟', p: 40, acao:'criarReserva', t:`Você ainda não tem reserva de emergência. O ideal para você é cerca de <b>${brl0(ideal)}</b>.` });
  else if (ideal && res && res.alvo < ideal * 0.6) dicas.push({ e:'🛟', p: 32, acao:'abrirReserva', t:`A meta da sua reserva (${brl0(res.alvo||0)}) está abaixo do ideal para os seus gastos: cerca de <b>${brl0(ideal)}</b>.` });
  // 11. dívidas: juros altos ou parcela que não cobre os juros
  const ruim = dividasAtivas().filter(dv => !isFinite(prazoDivida(dv)));
  if (ruim.length) dicas.push({ e:'🚨', p: 90, t:`A dívida <b>${esc(ruim[0].nome)}</b> não está diminuindo: a parcela não cobre os juros do mês. Priorize pagar mais nela ou renegociar.` });
  else { const cara = dividasAtivas().filter(dv=>(dv.juros||0) >= 5).sort((a,b)=>b.juros-a.juros)[0];
    if (cara) dicas.push({ e:'🔥', p: 65, t:`Priorize quitar <b>${esc(cara.nome)}</b>: ${String(cara.juros).replace('.',',')}% de juros ao mês é muito caro. Qualquer valor extra rende mais ali do que guardado.` }); }
  // 12. alguém te deve há mais de 2 semanas
  const velho = pendentes().filter(r => diasDesde(r.data) > 14).sort((a,b)=>a.data.localeCompare(b.data))[0];
  if (velho){ const tot = soma(pendentes().filter(r=>r.pessoa===velho.pessoa), r=>r.valor);
    dicas.push({ e:'🤝', p: 48, acao:'meDevem', pessoa: velho.pessoa, t:`<b>${esc(velho.pessoa)}</b> te deve ${brl(tot)} há ${diasDesde(velho.data)} dias.` }); }
  // 13. não essenciais
  const naoEss = C.consumo - C.essenciais;
  if (C.consumo > 500 && naoEss / C.consumo > 0.45) dicas.push({ e:'🎯', p: 35, t:`${Math.round(naoEss/C.consumo*100)}% dos seus gastos deste mês são <b>não essenciais</b>.` });
  // no máximo 2 dicas do tipo "acima do normal" (as maiores), para não repetir
  dicas.sort((a,b) => b.p - a.p);
  let acima = 0;
  return dicas.filter(x => x.e !== '📈' || ++acima <= 2);
}
function cardDicas(){
  if (key(cur.y,cur.m) !== chaveHoje()) return '';
  const dicas = calcularDicas(); if (!dicas.length) return '';
  const vis = dicasAbertas ? dicas : dicas.slice(0,3);
  return `<section class="card" id="cardDicas"><h3>💡 Dicas do mês</h3>
    <div class="dicas">${vis.map(x=>`<div class="dica"><span class="d-e">${x.e}</span><div><span>${S.tom === 'sincero' && x.s ? x.s : x.t}</span>${x.acao==='guardar'?'<button class="d-acao" data-act="guardarAgora">Guardar agora</button>':x.acao==='assinaturas'?'<button class="d-acao" data-act="assinaturas">Ver assinaturas</button>':x.acao==='criarReserva'?'<button class="d-acao" data-act="criarReserva">Criar reserva</button>':x.acao==='abrirReserva'?'<button class="d-acao" data-act="abrirReserva">Ajustar meta</button>':x.acao==='meDevem'?`<button class="d-acao" data-act="meDevem" data-pessoa-nome="${esc(x.pessoa)}">Ver e cobrar</button>`:''}</div></div>`).join('')}</div>
    ${dicas.length > 3 ? `<button class="d-mais" data-act="maisDicas">${dicasAbertas?'Mostrar menos':`Ver mais ${dicas.length-3} dica${dicas.length-3>1?'s':''}`}</button>` : ''}</section>`;
}

/* ---------- "Posso comprar?" ----------
   Compara a compra com o que costuma sobrar por mês (média dos últimos meses completos). */
function fimDoMesPrevisto(){
  const C = calc(hoje.getFullYear(), hoje.getMonth()), D = diasNoMes(hoje.getFullYear(), hoje.getMonth()), d = hoje.getDate(), rest = D - d + 1;
  return C.restante - C.contasPend - (C.gastosVista / d) * (rest - 1);
}
function baseSimulacao(){
  const usados = [];
  for (let i = 1; i <= 6 && usados.length < 3; i++){ const o = somaMeses(hoje.getFullYear(), hoje.getMonth(), -i); if (temDados(S.meses[key(o.y,o.m)])) usados.push(o); }
  const parcelasDe = (o) => soma(parcelasDoMes(o.y,o.m), x=>x.valor);
  if (!usados.length){   // sem histórico: projeta o mês atual
    const C = calc(hoje.getFullYear(), hoje.getMonth()), f = diasNoMes(hoje.getFullYear(), hoje.getMonth()) / hoje.getDate();
    return { renda:C.renda, folga:C.renda - C.consumo*f - C.reservas, parcelasMedia:parcelasDe({ y:hoje.getFullYear(), m:hoje.getMonth() }), meses:0 };
  }
  const cs = usados.map(o => calc(o.y,o.m)), n = cs.length;
  const renda = soma(cs, c=>c.renda)/n, gasto = soma(cs, c=>c.consumo)/n, guardado = soma(cs, c=>Math.max(c.reservas,0))/n;
  return { renda, folga: renda - gasto - guardado, parcelasMedia: soma(usados, parcelasDe)/n, meses:n };
}
function simularCompra(valor, credito, n){
  const b = baseSimulacao(), linhas = [];
  let pior = Infinity;
  if (!credito){
    const fim = fimDoMesPrevisto(), depois = fim - valor;
    linhas.push({ k:chaveHoje(), antes:fim, depois }); pior = depois;
  } else {
    const parcela = valor / n;
    for (let i = 1; i <= n; i++){
      const o = somaMeses(hoje.getFullYear(), hoje.getMonth(), i - 1);   // a compra entra no crédito deste mês e vira fatura no seguinte
      const extra = Math.max(0, soma(parcelasDoMes(o.y,o.m), x=>x.valor) - b.parcelasMedia);   // parcelas já assumidas além do normal
      const pg = somaMeses(o.y, o.m, 1), antes = b.folga - extra;
      linhas.push({ k:key(pg.y,pg.m), antes, depois: antes - parcela });
      pior = Math.min(pior, antes - parcela);
    }
  }
  const margem = Math.max(b.renda * 0.05, 100);
  const status = pior < 0 ? 'nao' : pior < margem ? 'apertado' : 'ok';
  // sugestões
  let parcelasQueCabem = null;
  if (status !== 'ok' && b.folga > 0) for (let k = (credito ? n+1 : 2); k <= 24; k++){ if (valor/k <= b.folga * 0.6){ parcelasQueCabem = k; break; } }
  const porMes = b.folga > 0 ? Math.max(50, Math.round(b.folga * 0.5 / 10) * 10) : 0;
  const mesesJuntando = porMes ? Math.ceil(valor / porMes) : 0;
  const diasTrabalho = b.renda > 0 ? valor / (b.renda / 22) : 0;
  return { b, linhas, status, pior, parcelasQueCabem, porMes, mesesJuntando, diasTrabalho };
}
function abrirPossoComprar(){
  form = { tipo:'simulacao', v:{ credito:false } };
  abrir(`<h2>🤔 Posso comprar?</h2>
    <div class="f"><input class="money num big" id="sValor" inputmode="decimal" placeholder="R$ 0,00" aria-label="Preço"></div>
    <div class="f"><input id="sNome" placeholder="O que é? (opcional) Ex.: Tênis, celular…" autocomplete="off"></div>
    <div class="f"><label>Como você pagaria?</label><div class="chips" data-chips="pag"><button type="button" class="on" data-v="vista">À vista (Pix/débito)</button><button type="button" data-v="credito">No crédito</button></div></div>
    <div class="f" id="sBoxParc" hidden><label>Parcelas</label><select id="sParc">${Array.from({length:24},(_,i)=>i+1).map(n=>`<option value="${n}">${n===1?'1x (à vista no cartão)':n+'x'}</option>`).join('')}</select></div>
    <div id="sResultado" aria-live="polite"><p class="note">Digite o preço para ver a simulação.</p></div>`);
}
function atualizarSimulacao(){
  const box = document.getElementById('sResultado'); if (!box) return;
  const valor = parseValor(document.getElementById('sValor').value);
  if (!valor) return box.innerHTML = '<p class="note">Digite o preço para ver a simulação.</p>';
  const credito = form.v.credito, n = credito ? +document.getElementById('sParc').value : 1;
  const r = simularCompra(valor, credito, n), mesTxt = (k) => { const o = ymDe(k); return MES_CURTO[o.m] + '/' + String(o.y).slice(2); };
  const cab = { ok:['✅','Cabe com folga','sim'], apertado:['⚠️','Cabe, mas fica apertado','talvez'], nao:['❌','Não cabe no seu orçamento agora','nao'] }[r.status];
  let h = `<div class="sim-veredito ${cab[2]}"><span>${cab[0]}</span><b>${cab[1]}</b></div>`;
  if (!credito){
    const l = r.linhas[0];
    h += `<p class="sim-txt">Este mês você deve terminar com <b>${brl(l.antes)}</b>. Comprando à vista, ficaria com <b class="${l.depois<0?'neg':''}">${brl(l.depois)}</b>.</p>`;
  } else {
    h += `<p class="sim-txt">${n}x de <b>${brl(valor/n)}</b>. Normalmente sobram <b>${brl(r.b.folga)}</b> por mês. Veja como ficaria:</p>
      <div class="sim-meses">${r.linhas.slice(0,6).map(l=>`<div><span>${mesTxt(l.k)}</span><span class="num">${brl(l.antes)} → <b class="${l.depois<0?'neg':l.depois<r.b.renda*0.05?'warn':''}">${brl(l.depois)}</b></span></div>`).join('')}
      ${r.linhas.length>6?`<div class="sim-mais">… e mais ${r.linhas.length-6} meses</div>`:''}</div>`;
  }
  if (r.status !== 'ok'){
    const sug = [];
    if (!credito && r.b.folga - valor > Math.max(r.b.renda*0.05, 100)){ const q = somaMeses(hoje.getFullYear(), hoje.getMonth(), 1); sug.push(`Esperando até <b>${MESES[q.m].toLowerCase()}</b>, cabe: normalmente sobram ${brl(r.b.folga)} por mês.`); }
    if (r.parcelasQueCabem) sug.push(`Parcelando em <b>${r.parcelasQueCabem}x</b> (${brl(valor/r.parcelasQueCabem)}), caberia melhor — se for sem juros.`);
    if (r.mesesJuntando){ const q = somaMeses(hoje.getFullYear(), hoje.getMonth(), r.mesesJuntando); sug.push(`Guardando <b>${brl(r.porMes)}/mês</b> num cofrinho, você compra à vista em <b>${MESES[q.m].toLowerCase()}</b>.`); }
    if (sug.length) h += `<div class="sim-sug">💡 ${sug.join('<br>💡 ')}</div>`;
  }
  if (r.diasTrabalho >= 0.5) h += `<p class="note">⏱️ Isso equivale a ${r.diasTrabalho < 1.5 ? 'cerca de 1 dia' : '~' + Math.round(r.diasTrabalho) + ' dias'} do seu trabalho.</p>`;
  if (!r.b.meses) h += `<p class="note">Estimativa com base só neste mês. Fica mais precisa com mais meses de uso.</p>`;
  h += `<div class="row2" style="margin-top:12px"><button class="btn pri" data-act="simLancar">Lançar compra</button>${r.status!=='ok' && r.porMes ? '<button class="btn sec" data-act="simCofrinho">Criar cofrinho</button>' : '<button class="btn sec" data-act="simFechar">Fechar</button>'}</div>`;
  box.innerHTML = h;
}

function blocoPrevisao(C){
  if (key(cur.y,cur.m) !== chaveHoje()) return '';
  const D = diasNoMes(cur.y,cur.m), d = hoje.getDate(), rest = D - d + 1;
  const livre = C.restante - C.contasPend;
  const porDia = livre / rest;
  const ritmo = (C.gastosVista) / d;
  const fim = livre - ritmo * (rest - 1);
  let h = `<div class="prev">
    <div><span>Pode gastar por dia</span><b class="num ${porDia<0 && !S.ocultar?'neg':''}">${brl(Math.max(porDia,0))}</b><small>pelos próximos ${rest} dia${rest>1?'s':''}</small></div>
    <div><span>No ritmo atual</span><b class="num ${fim<0 && !S.ocultar?'neg':''}">${brl(fim)}</b><small>no fim do mês (${brl0(ritmo)}/dia)</small></div>
  </div>`;
  if (C.contasPend > 0) h += `<div class="eq">Já descontando ${brl(C.contasPend)} de contas a pagar.</div>`;
  h += `<button class="btn sec mini-largo" data-act="possoComprar">🤔 Posso comprar?</button>`;
  const fut = comprometidoFuturo();
  if (fut > 0) h += `<div class="eq">💳 ${brl(fut)} em parcelas nos próximos meses.</div>`;
  return h;
}

// No iPhone, quem usa pelo Safari e depois instala o app começa vazio (são armazenamentos separados).
const noNavegadorIOS = () => /iphone|ipad|ipod/i.test(navigator.userAgent) && !navigator.standalone && !matchMedia('(display-mode: standalone)').matches;
function dicaTransferir(){
  if (DEMO || !noNavegadorIOS() || S.dicaTransfFechada || !primeiraChave()) return '';
  return `<div class="alert info backup"><span>📲</span><div><b>Vai usar pelo app na tela de início?</b><br>
    No iPhone, o app instalado não enxerga os dados daqui do Safari. Para levar tudo: toque em <b>Fazer backup</b> → <b>Salvar em Arquivos</b>. Depois abra o app instalado e toque em <b>Restaurar backup</b>.
    <div class="acts"><button class="btn pri" data-act="exportar">Fazer backup</button><button class="btn sec" data-act="fecharDicaTransf">Fechar</button></div></div></div>`;
}
// Lembrete de backup: os dados ficam só no aparelho.
const diasDesde = (iso) => iso ? Math.floor((Date.now() - new Date(iso).getTime()) / 864e5) : Infinity;
function precisaBackup(){
  const n = S.novosDesdeBackup || 0;
  if (!n) return false;
  if (S.backupAdiado && diasDesde(S.backupAdiado) < 3) return false;
  if (!S.ultimoBackup) return n >= 5;
  return n >= 15 || diasDesde(S.ultimoBackup) >= 30;
}
function lembreteBackup(){
  if (DEMO || !precisaBackup()) return '';
  const quando = S.ultimoBackup ? `Seu último backup foi há ${diasDesde(S.ultimoBackup)} dia${diasDesde(S.ultimoBackup)===1?'':'s'}` : 'Você ainda não fez nenhum backup';
  return `<div class="alert info backup"><span>💾</span><div><b>Proteja seus dados</b><br>${quando} e tem ${S.novosDesdeBackup} lançamento${S.novosDesdeBackup>1?'s':''} novo${S.novosDesdeBackup>1?'s':''}. Se trocar de celular ou limpar o navegador, eles se perdem.
    ${S.conta && !lerNuvem() ? '<div class="acts"><button class="btn pri" data-act="nuvemAtivar">☁️ Backup automático</button><button class="btn sec" data-act="exportar">Em arquivo</button></div><button class="link-sutil" data-act="adiarBackup">Depois</button>' : '<div class="acts"><button class="btn pri" data-act="exportar">Fazer backup</button><button class="btn sec" data-act="adiarBackup">Depois</button></div>'}</div></div>`;
}
function alertasContas(){
  if (key(cur.y,cur.m) !== chaveHoje()) return '';
  const M = mes(cur.y,cur.m);
  const lst = M.contas.map(c=>({c, s:statusConta(c,cur.y,cur.m)})).filter(x=>x.s && x.s.cls);
  faturasPorCartao(cur.y,cur.m).forEach(f => { if (!f.cartao || statusFatura(f.cartao.id, cur.y, cur.m)) return; const s = statusConta({ pago:false, venc:f.cartao.vencimento }, cur.y, cur.m);
    if (s && s.cls && s.t !== 'atrasada') lst.push({ c:{ nome:'Fatura ' + f.cartao.nome }, s }); });
  if (!lst.length) return '';
  return `<button class="alert warnbox" data-tab="contas"><span>⏰</span><div><b>${lst.length===1?'1 conta precisa':'' + lst.length + ' contas precisam'} de atenção</b><br>
    ${lst.slice(0,3).map(x=>`${esc(x.c.nome)}: ${x.s.t}`).join(' · ')}</div></button>`;
}

/* Orçamento que acumula: com S.orcAcumular ligado, o que sobra (ou estoura) numa categoria passa para o mês
   seguinte. Começa a contar a partir do mês S.orcAcumular.desde; o saldo carregado fica entre −1x e +2x o limite. */
let memoOrc = {};
function limiteOrc(c, y, m){
  const base = S.orcamentos[c] || 0;
  if (!base || !S.orcAcumular) return base;
  const k = key(y,m), id = c + '|' + k;
  if (id in memoOrc) return memoOrc[id];
  if (k <= S.orcAcumular.desde) return memoOrc[id] = base;
  const p = prevYM(y,m), pk = key(p.y,p.m);
  const carry = temDados(S.meses[pk]) ? limiteOrc(c, p.y, p.m) - (calc(p.y,p.m).cats[c] || 0) : 0;
  return memoOrc[id] = base + Math.max(-base, Math.min(2 * base, carry));
}
const orcamentosDoMes = (y, m) => Object.keys(S.orcamentos).filter(c => S.orcamentos[c] > 0).map(c => [c, limiteOrc(c, y, m)]);
function alertasOrcamento(C){
  const est = orcamentosDoMes(cur.y,cur.m).filter(([c,l])=>(C.cats[c]||0) > l);
  if (!est.length) return '';
  return `<div class="alert crit"><span>⚠️</span><div><b>Orçamento estourado</b><br>${est.map(([c,l])=>`${esc(nomeCat(c))}: ${brl(C.cats[c]-l)} acima`).join(' · ')}</div></div>`;
}

// Gráfico: onde o dinheiro foi (barras horizontais ordenadas, um toque abre o detalhe).
let catsAbertas = false;
function cardCategorias(C){
  const cats = Object.entries(C.cats).filter(([,v])=>v>0).sort((a,b)=>b[1]-a[1]);
  let h = `<section class="card" id="cardCategorias"><h3>Onde você gastou <small>${brl(C.consumo)}</small></h3>`;
  if (!cats.length) return h + `<div class="note">Seus gastos por categoria aparecem aqui.</div></section>`;
  const max = cats[0][1];
  h += `<div class="hbars" role="list">`;
  const mostrar = catsAbertas ? cats : cats.slice(0, 6);
  mostrar.forEach(([c,v])=>{
    h += `<button class="hb" role="listitem" data-cat="${esc(c)}" aria-label="${esc(nomeCat(c))}: ${brl(v)}, ${(v/C.consumo*100).toFixed(0)}% do total">
      <span class="hb-l"><span class="hb-e">${emojiCat(c)}</span>${esc(nomeCat(c))}</span>
      <span class="hb-v num">${brl(v)} <small>${(v/C.consumo*100).toFixed(0)}%</small></span>
      <span class="hb-t"><span style="width:${Math.max(v/max*100,1.5)}%"></span></span></button>`;
  });
  h += `</div>`;
  if (cats.length > 6) h += `<button class="ver-mais" data-act="catsToggle">${catsAbertas ? 'Mostrar menos' : `Ver todas as ${cats.length} categorias`}</button>`;
  h += `<div class="ess"><span><i class="dot ok"></i>Essenciais ${brl(C.essenciais)}</span><span><i class="dot no"></i>Não essenciais ${brl(C.consumo-C.essenciais)}</span></div>`;
  h += `<div class="note">Toque numa categoria para ver o histórico e os lançamentos. Compras no crédito contam no mês da compra (parceladas, no mês de cada parcela).</div></section>`;
  return h;
}

// Medidores de orçamento por categoria.
/* ---------- detector de assinaturas ----------
   Gastos que se repetem todo mês com valor parecido (últimos 6 meses), ou serviços conhecidos pelo nome. */
const PALAVRAS_ASSIN = [...PALAVRAS_CAT.find(([c])=>c==='📱 Assinaturas')[1], 'academia','smart fit','smartfit','gympass','wellhub','totalpass','seguro','plano','apple music','prime','ifood clube','clube','mensalidade','mensal','dropbox','google one','canva','microsoft','office','paramount','star','crunchyroll','tidal','kindle','audible'];
function detectarAssinaturas(){
  const kh = chaveHoje(), ignoradas = new Set(S.assinIgnoradas || []);
  const ks = []; for (let i=5;i>=0;i--){ const o = somaMeses(hoje.getFullYear(), hoje.getMonth(), -i); ks.push(key(o.y,o.m)); }
  const grupos = {};
  ks.forEach(k => (S.meses[k] ? S.meses[k].gastos : []).forEach(g => {
    if (ehParcelado(g)) return;
    const nome = (g.desc||'').trim();
    if (!nome && g.cat !== '📱 Assinaturas') return;
    const chave = normTxt(nome) || 'cat:' + g.cat;
    (grupos[chave] = grupos[chave] || { chave, nome: nome || nomeCat(g.cat), cat:g.cat, oc:[] }).oc.push({ k, v:+g.valor, data:g.data || k+'-01' });
  }));
  const kAnt = key(prevYM(hoje.getFullYear(), hoje.getMonth()).y, prevYM(hoje.getFullYear(), hoje.getMonth()).m);
  const lista = [];
  Object.values(grupos).forEach(gr => {
    if (ignoradas.has(gr.chave)) return;
    const meses = new Set(gr.oc.map(o=>o.k)), porMes = gr.oc.length / meses.size;
    const vals = gr.oc.map(o=>o.v).sort((a,b)=>a-b), med = vals[Math.floor(vals.length/2)];
    const variacao = med ? Math.max(...vals.map(v=>Math.abs(v-med)))/med : 1;
    const conhecida = gr.cat === '📱 Assinaturas' || PALAVRAS_ASSIN.some(w => temPalavra(gr.chave, w));
    // Assinatura cobra sempre o mesmo valor: o que não é conhecido precisa de 3+ meses quase iguais.
    // Mercado, gasolina e alimentação nunca entram só por repetição.
    const recorrente = !['🧺 Mercado','⛽ Gasolina','🍗 Alimentação'].includes(gr.cat) && meses.size >= 3 && porMes <= 1.34 && variacao <= 0.05;
    if (!recorrente && !(conhecida && porMes <= 1.5 && variacao <= 0.35)) return;
    gr.oc.sort((a,b)=>a.data.localeCompare(b.data));
    const ultimo = gr.oc[gr.oc.length-1];
    const anterior = [...gr.oc].reverse().find(o => o.k < ultimo.k);
    lista.push({ ...gr, valor: ultimo.v, ultimo, desde: gr.oc[0].k, meses: meses.size,
      ativa: ultimo.k >= kAnt, esteMes: meses.has(kh),
      aumento: anterior && ultimo.v > anterior.v * 1.02 ? ultimo.v - anterior.v : 0 });
  });
  return lista.sort((a,b) => b.valor - a.valor);
}
function cardAssinaturas(){
  if (key(cur.y,cur.m) !== chaveHoje()) return '';
  const lista = detectarAssinaturas().filter(a=>a.ativa);
  if (!lista.length) return '';
  const mensal = soma(lista, a=>a.valor), aum = lista.filter(a=>a.aumento);
  return `<section class="card" id="cardAssin"><h3>🔁 Assinaturas <small>${lista.length} encontrada${lista.length>1?'s':''}</small></h3>
    <div class="assin-tot"><div><b class="num">${brl(mensal)}</b><span>por mês</span></div><div><b class="num">${brl(mensal*12)}</b><span>por ano</span></div></div>
    ${aum.length ? `<div class="alert crit" style="margin:0 0 10px"><span>📈</span><div>${aum.map(a=>`<b>${esc(a.nome)}</b> ficou ${brl(a.aumento)} mais cara`).join(' · ')}</div></div>` : ''}
    <div class="assin-mini">${lista.slice(0,4).map(a=>`<span>${emojiCat(a.cat)} ${esc(a.nome)} <b class="num">${brl(a.valor)}</b></span>`).join('')}</div>
    <button class="btn sec" data-act="assinaturas">Ver detalhes</button></section>`;
}
function abrirAssinaturas(){
  const lista = detectarAssinaturas();
  const ativas = lista.filter(a=>a.ativa), mensal = soma(ativas, a=>a.valor);
  const mesTxt = (k) => { const o = ymDe(k); return `${MES_CURTO[o.m]}/${String(o.y).slice(2)}`; };
  abrir(`<h2>🔁 Assinaturas e gastos fixos</h2>
    <p class="note" style="margin:-6px 0 12px">Gastos que se repetem todo mês. Somando os ativos: <b>${brl(mensal)}/mês</b>, ou <b>${brl(mensal*12)} por ano</b>.</p>
    <div class="list flat">${lista.map(a=>`<div class="item"><div class="ic">${emojiCat(a.cat)}</div>
      <div class="tx"><div class="t1">${esc(a.nome)}</div><div class="t2">${a.meses>1?`${a.meses} meses desde ${mesTxt(a.desde)}`:'1 vez'} · último ${fmtData(a.ultimo.data)}
        ${a.aumento?`<span class="tag cr">+${brl(a.aumento)}</span>`:''}${!a.esteMes && a.ativa?'<span class="tag warn">ainda não lançado este mês</span>':''}${!a.ativa?'<span class="tag">parou?</span>':''}</div>
        <button class="assin-ign" data-act="ignorarAssin" data-chave="${esc(a.chave)}">Não é assinatura</button></div>
      <div class="val num">${brl(a.valor)}</div></div>`).join('') || '<div class="empty">Nenhuma assinatura encontrada.</div>'}</div>
    <p class="note" style="margin-top:12px">💡 Cancelar o que você não usa faz diferença: cada R$ 30 por mês são R$ 360 por ano.</p>
    ${(S.assinIgnoradas||[]).length ? `<button class="btn sec" data-act="restaurarAssin" style="margin-top:10px">Mostrar ${S.assinIgnoradas.length} item(ns) escondido(s)</button>` : ''}`);
}

function cardOrcamentos(C){
  const lst = orcamentosDoMes(cur.y,cur.m);
  if (!lst.length) return `<section class="card" id="cardOrcamentos"><h3>Orçamentos</h3><div class="note" style="margin:0 0 12px">Defina um limite por categoria e o app avisa antes de você estourar.</div><button class="btn sec" data-act="orcamentos">Definir orçamentos</button></section>`;
  const tot = soma(lst, x=>x[1]), gasto = soma(lst, ([c])=>C.cats[c]||0);
  let h = `<section class="card" id="cardOrcamentos"><h3>Orçamentos <small>${brl(gasto)} de ${brl(tot)}</small></h3>`;
  lst.sort((a,b)=>((C.cats[b[0]]||0)/b[1])-((C.cats[a[0]]||0)/a[1])).forEach(([c,l])=>{
    const v = C.cats[c]||0, pct = v/l*100;
    const st = pct>100 ? 'crit' : pct>=80 ? 'warn' : '';
    const extra = l - S.orcamentos[c];
    const txt = (pct>100 ? `⚠️ ${brl(v-l)} acima` : `Resta ${brl(l-v)}`) + (Math.abs(extra) >= 0.01 ? ` · ${extra>0?'+':'−'}${brl(Math.abs(extra))} do mês anterior` : '');
    h += `<button class="meter ${st}" data-cat="${esc(c)}">
      <span class="row"><b>${emojiCat(c)} ${esc(nomeCat(c))}</b><span class="num">${brl(v)} de ${brl(l)}</span></span>
      <span class="bar"><span style="width:${Math.min(pct,100)}%"></span></span>
      <span class="foot"><span>${txt}</span><span class="num">${pct.toFixed(0)}%</span></span></button>`;
  });
  return h + `${S.orcAcumular ? '<p class="note" style="margin:0 0 10px">🔁 Sobras e estouros passam para o mês seguinte.</p>' : ''}<button class="btn sec" data-act="orcamentos">Editar orçamentos</button></section>`;
}

// Gráfico: entradas x saídas nos últimos 6 meses.
function cardEvolucao(){
  const meses = [];
  for (let i=5; i>=0; i--){ const o = somaMeses(cur.y,cur.m,-i); meses.push(o); }
  const first = primeiraChave();
  const dados = meses.filter(o => first && key(o.y,o.m) >= first).map(o => { const C = calc(o.y,o.m); return { o, ent:C.entradasLanc, sai:C.saidas, k:key(o.y,o.m) }; });
  let h = `<section class="card"><h3>Últimos meses <small>entradas × saídas</small></h3>`;
  if (dados.length < 2) return h + `<div class="note">O comparativo aparece a partir do segundo mês de uso.</div></section>`;
  const W = 320, H = 150, top = 12, base = 122, left = 4, right = 4;
  const max = Math.max(...dados.map(d=>Math.max(d.ent,d.sai)), 1);
  const esc_ = (v) => (base-top) * v / max;
  const slot = (W-left-right) / dados.length, bw = Math.min(14, slot/3.2);
  const sel = dados.find(d=>d.k===evoSel) || dados[dados.length-1];
  let svg = `<svg viewBox="0 0 ${W} ${H}" class="evo" role="img" aria-label="Entradas e saídas dos últimos ${dados.length} meses">`;
  [0.5,1].forEach(f => { const y = base - (base-top)*f; svg += `<line x1="${left}" x2="${W-right}" y1="${y}" y2="${y}" class="grid-l"/>`; });
  svg += `<line x1="${left}" x2="${W-right}" y1="${base}" y2="${base}" class="axis-l"/>`;
  dados.forEach((d,i) => {
    const cx = left + slot*i + slot/2;
    const on = d.k===sel.k;
    svg += `<g class="evo-g ${on?'on':''}" data-evo="${d.k}">
      <rect x="${cx-slot/2}" y="${top}" width="${slot}" height="${H-top}" class="hit"/>
      ${barra(cx-bw-1, bw, esc_(d.ent), base, 'b-ent')}
      ${barra(cx+1, bw, esc_(d.sai), base, 'b-sai')}
      <text x="${cx}" y="${base+16}" text-anchor="middle" class="lbl-m">${MES_CURTO[d.o.m]}</text></g>`;
  });
  svg += `</svg>`;
  const saldo = sel.ent - sel.sai;
  h += `<div class="legend" style="margin-bottom:6px"><span><i class="sw ent"></i>Entradas</span><span><i class="sw sai"></i>Saídas</span></div>${svg}
    <div class="evo-info"><b>${MESES[sel.o.m]}</b><span>Entradas <b class="num">${brl(sel.ent)}</b></span><span>Saídas <b class="num">${brl(sel.sai)}</b></span><span>${saldo>=0?'Sobrou':'Faltou'} <b class="num ${saldo<0?'neg':''}">${brl(Math.abs(saldo))}</b></span></div>
    <div class="note">Toque num mês para ver os valores. Entradas sem o saldo trazido do mês anterior.</div></section>`;
  return h;
}
// Barra vertical com cantos arredondados só no topo.
function barra(x, w, h, base, cls){
  if (h <= 0.5) return `<rect x="${x}" y="${base-1}" width="${w}" height="1" class="${cls}"/>`;
  const r = Math.min(4, w/2, h);
  return `<path class="${cls}" d="M${x},${base} V${base-h+r} Q${x},${base-h} ${x+r},${base-h} H${x+w-r} Q${x+w},${base-h} ${x+w},${base-h+r} V${base} Z"/>`;
}

// Detalhe de uma categoria: histórico de 6 meses + lançamentos do mês.
function abrirCategoria(c){
  const lim = limiteOrc(c, cur.y, cur.m);
  const meses = []; for (let i=5;i>=0;i--) meses.push(somaMeses(cur.y,cur.m,-i));
  const vals = meses.map(o => ({ o, v: calc(o.y,o.m).cats[c]||0, k:key(o.y,o.m) }));
  const usados = vals.filter(x=>x.v>0);
  const media = usados.length ? soma(usados,x=>x.v)/usados.length : 0;
  const W=320,H=130,top=14,base=104, slot=W/6, bw=Math.min(26,slot*.55);
  const max = Math.max(...vals.map(x=>x.v), lim, 1) * 1.12;
  let svg = `<svg viewBox="0 0 ${W} ${H}" class="evo" role="img" aria-label="${esc(nomeCat(c))} nos últimos 6 meses">`;
  svg += `<line x1="0" x2="${W}" y1="${base}" y2="${base}" class="axis-l"/>`;
  if (lim) { const y = base-(base-top)*lim/max; svg += `<line x1="0" x2="${W}" y1="${y}" y2="${y}" class="lim-l"/>`; }
  vals.forEach((x,i)=>{ const cx = slot*i+slot/2, h=(base-top)*x.v/max, on = x.k===key(cur.y,cur.m);
    svg += barra(cx-bw/2, bw, h, base, on?'b-cat on':'b-cat');
    if (x.v>0 && !S.ocultar) svg += `<text x="${cx}" y="${base-h-5}" text-anchor="middle" class="lbl-v">${brl0(x.v)}</text>`;
    svg += `<text x="${cx}" y="${base+16}" text-anchor="middle" class="lbl-m">${MES_CURTO[x.o.m]}</text>`; });
  svg += `</svg>`;
  // lançamentos do mês nesta categoria
  const M = mes(cur.y,cur.m);
  const itens = [];
  M.gastos.filter(g=>g.cat===c && !ehParcelado(g)).forEach(g=>itens.push({ t:g.desc||nomeCat(c), s:`${g.forma}${g.data?' · '+fmtData(g.data):''}`, v:g.valor }));
  parcelasDoMes(cur.y,cur.m).filter(x=>x.g.cat===c).forEach(x=>itens.push({ t:x.g.desc||nomeCat(c), s:`Parcela ${x.i+1}/${x.n}`, v:x.valor }));
  if (c===CAT_CONTAS) M.contas.filter(k=>k.pago).forEach(k=>itens.push({ t:k.nome, s:k.data?'Paga em '+fmtData(k.data):'Paga', v:k.valor }));
  itens.sort((a,b)=>b.v-a.v);
  const atual = vals[5].v;
  abrir(`<h2>${emojiCat(c)} ${esc(nomeCat(c))}</h2>
    <div class="kpis"><div><span>${MESES[cur.m]}</span><b class="num">${brl(atual)}</b></div><div><span>Média 6 meses</span><b class="num">${brl(media)}</b></div>${lim?`<div><span><i class="limkey"></i>Limite</span><b class="num">${brl(lim)}</b></div>`:''}</div>
    ${svg}
    <h4 class="sub-h">Lançamentos de ${MESES[cur.m].toLowerCase()}</h4>
    <div class="list flat">${itens.map(x=>`<div class="item"><div class="tx"><div class="t1">${esc(x.t)}</div><div class="t2">${esc(x.s)}</div></div><div class="val num">${brl(x.v)}</div></div>`).join('') || '<div class="empty">Nada neste mês.</div>'}</div>
    ${c!==CAT_CONTAS?`<div class="f" style="margin-top:14px"><label>Orçamento mensal para ${esc(nomeCat(c))}</label><div class="inline"><input class="num" id="oCat" inputmode="decimal" placeholder="Sem limite" value="${lim?moneyVal(lim):''}"><button class="btn pri" data-act="salvarOrcCat" data-c="${esc(c)}">Salvar</button></div></div>`:''}`);
}

/* ---------- reserva de emergência ideal ----------
   Gastos essenciais médios (contas pagas + gastos marcados como essenciais) dos últimos meses completos.
   Ideal: 6 meses (3 para emprego estável, 12 para renda variável). */
const ehReserva = (c) => c && (c.id === 'reserva' || /emerg/.test(semAcento(c.nome)));
const cofReserva = () => S.cofrinhos.find(ehReserva);
function essenciaisMedios(){
  const y = hoje.getFullYear(), m = hoje.getMonth(), cs = [];
  for (let i=1; i<=6 && cs.length<3; i++){ const o = somaMeses(y,m,-i); if (temDados(S.meses[key(o.y,o.m)])) cs.push(calc(o.y,o.m)); }
  if (!cs.length) return 0;
  return soma(cs, c=>c.essenciais) / cs.length;
}
const reservaIdeal = (meses) => Math.round(essenciaisMedios() * (meses||6) / 100) * 100;
function blocoReservaIdeal(c){
  const ess = essenciaisMedios(); if (!ess) return '<p class="note">Com pelo menos 1 mês completo de uso, o app calcula a sua reserva ideal.</p>';
  const total = guardadoAte(c.id, key(cur.y,cur.m)), cobre = total / ess;
  return `<div class="reserva-ideal"><b>🛟 Reserva ideal para você</b>
    <p>Seus gastos essenciais são de cerca de <b>${brl0(ess)}/mês</b>. A reserva serve para cobrir esses gastos se a renda parar.</p>
    <div class="ri-opcoes">${[[3,'Emprego estável'],[6,'Recomendado'],[12,'Autônomo / renda variável']].map(([n,l])=>`<button data-act="usarIdeal" data-meses="${n}" data-cof-id="${c.id}" class="${c.alvo && Math.abs(c.alvo - reservaIdeal(n)) < 1 ? 'on' : ''}"><b class="num">${brl0(reservaIdeal(n))}</b><span>${n} meses · ${l}</span></button>`).join('')}</div>
    <p class="ri-cobre">🛡️ Hoje sua reserva cobre <b>${cobre < 0.1 ? 'menos de 0,1' : cobre.toLocaleString('pt-BR',{maximumFractionDigits:1})} ${cobre>=0.95 && cobre<1.05?'mês':'meses'}</b> dos seus gastos essenciais.</p></div>`;
}
function sugestaoReserva(){
  if (cofReserva()) return '';
  const ideal = reservaIdeal(6); if (!ideal) return '';
  return `<div class="dica" style="margin-bottom:12px"><span class="d-e">🛟</span><div><span>Você ainda não tem uma <b>reserva de emergência</b>. Para você, o ideal é cerca de <b>${brl0(ideal)}</b> (6 meses de gastos essenciais).</span><button class="d-acao" data-act="criarReserva">Criar reserva</button></div></div>`;
}

// Cofrinhos com progresso, quanto guardar por mês (se tiver prazo) ou previsão pelo ritmo.
function blocoCofrinhos(compacto){
  const k = key(cur.y,cur.m);
  if (!S.cofrinhos.length) return `<div class="note" style="margin:0 0 12px">Crie cofrinhos para juntar dinheiro: viagem, carro, reserva de emergência…</div>`;
  return S.cofrinhos.map(c => {
    const total = guardadoAte(c.id, k), mesV = guardadoNoMes(c.id, cur.y, cur.m);
    const pct = c.alvo>0 ? Math.min(100, Math.max(0, total/c.alvo*100)) : 0;
    return `<button class="goal cof" data-cof="${c.id}"><span class="row"><b>${c.emoji} ${esc(c.nome)}</b><span class="num">${brl(total)}${c.alvo?` de ${brl(c.alvo)}`:''}</span></span>
      ${c.alvo?`<span class="bar"><span style="width:${pct}%"></span></span>`:''}
      <span class="foot num"><span>${mesV>=0?'+':''}${brl(mesV)} este mês</span>${c.alvo?`<span>${total>=c.alvo?'Concluído':`Faltam ${brl(c.alvo-total)}`} · ${pct.toFixed(0)}%</span>`:''}</span>
      ${compacto?'':previsaoCofrinho(c, total)}${ehReserva(c) && essenciaisMedios() && total > 0 ? `<span class="gprev">🛡️ Cobre ${(total/essenciaisMedios()).toLocaleString('pt-BR',{maximumFractionDigits:1})} ${total/essenciaisMedios()>=0.95 && total/essenciaisMedios()<1.05?'mês':'meses'} dos seus gastos essenciais.</span>` : ''}</button>`;
  }).join('');
}
function previsaoCofrinho(c, total){
  if (!c.alvo) return '';
  if (total >= c.alvo) return `<span class="gprev ok">🎉 Meta atingida!</span>`;
  const falta = c.alvo - total, k = key(cur.y,cur.m);
  if (c.prazo){
    const n = mesesEntre(k, c.prazo) + 1, o = ymDe(c.prazo);
    if (n <= 0) return `<span class="gprev">⏰ O prazo (${MES_CURTO[o.m]}/${o.y}) passou. Faltaram ${brl(falta)}.</span>`;
    return `<span class="gprev">📅 Guarde <b>${brl(falta/n)}/mês</b> para chegar até ${MES_CURTO[o.m]}/${o.y}${n>1?` (${n} meses)`:''}.</span>`;
  }
  let t = 0; for (let i=0;i<3;i++){ const o = somaMeses(cur.y,cur.m,-i); t += guardadoNoMes(c.id, o.y, o.m); }
  const media = t/3;
  if (media <= 0) return `<span class="gprev">Guarde um pouco todo mês, ou defina um prazo, para ver a previsão.</span>`;
  const n = Math.ceil(falta/media), q = somaMeses(cur.y,cur.m,n);
  return `<span class="gprev">📅 No seu ritmo (${brl0(media)}/mês), você chega lá em <b>${MESES[q.m].toLowerCase()} de ${q.y}</b>.</span>`;
}
function cardCofrinhos(compacto){
  return `<section class="card" id="cardMetas"><h3>Cofrinhos <small>${compacto?'acumulado até '+MESES[cur.m].toLowerCase():''}</small></h3>${compacto?'':sugestaoReserva()}${blocoCofrinhos(compacto)}
    ${compacto?'':'<button class="btn sec" data-act="novoCof">+ Novo cofrinho</button>'}</section>`;
}
// Detalhe de um cofrinho: progresso, movimentações e ações.
function abrirCofrinho(id){
  const c = cofPorId(id); if (!c) return;
  const k = key(cur.y,cur.m), total = guardadoAte(id, k);
  const movs = [];
  Object.keys(S.meses).sort().reverse().forEach(mk => S.meses[mk].reservas.filter(r=>cofDe(r)===id).forEach(r=>movs.push({ mk, r })));
  abrir(`<h2>${c.emoji} ${esc(c.nome)}</h2>
    <div class="kpis"><div><span>Guardado</span><b class="num">${brl(total)}</b></div>${c.alvo?`<div><span>Meta</span><b class="num">${brl(c.alvo)}</b></div>`:''}${c.prazo?`<div><span>Prazo</span><b>${MES_CURTO[ymDe(c.prazo).m]}/${ymDe(c.prazo).y}</b></div>`:''}</div>
    ${previsaoCofrinho(c, total).replace('<span class="gprev','<p class="gprev').replace(/<\/span>$/,'</p>')}
    ${ehReserva(c) ? blocoReservaIdeal(c) : ''}
    <div class="row2" style="margin:14px 0"><button class="btn pri" data-act="guardarCof" data-cof-id="${id}">+ Guardar</button><button class="btn sec" data-act="retirarCof" data-cof-id="${id}">− Retirar</button></div>
    <h4 class="sub-h">Movimentações</h4>
    <div class="list flat">${movs.slice(0,30).map(({mk,r})=>`<button class="item" data-edit="reservas" data-id="${r.id}" data-mk="${mk}"><div class="tx"><div class="t1">${r.valor<0?'Retirada':esc(r.nome||'Guardado')}</div><div class="t2">${r.data?fmtData(r.data)+'/'+mk.slice(0,4):MESES[ymDe(mk).m]}</div></div><div class="val num ${r.valor<0?'down':'up'}">${r.valor<0?'−':'+'}${brl(Math.abs(r.valor))}</div></button>`).join('') || '<div class="empty">Nada guardado ainda.</div>'}</div>
    <button class="btn sec" data-act="editarCof" data-cof-id="${id}" style="margin-top:14px">Editar cofrinho</button>`);
}
function editarCofrinho(id, sugestao){
  const c = id ? cofPorId(id) : { nome:'', emoji:'🎯', alvo:0, prazo:'', ...(sugestao||{}) };
  form = { tipo:'cofrinho', id, v:{ emoji:c.emoji } };
  abrir(`<h2>${id?'Editar':'Novo'} cofrinho</h2>
    <div class="f"><label>Nome</label><input id="cNome" placeholder="Ex.: Viagem, Carro, Reserva" value="${esc(c.nome)}"></div>
    <div class="f"><label>Ícone</label><div class="chips emo" data-chips="emoji">${EMOJIS_COF.map(e=>`<button type="button" class="${e===c.emoji?'on':''}" data-v="${e}">${e}</button>`).join('')}</div></div>
    <div class="row2"><div class="f"><label>Meta (opcional)</label><input class="num" id="cAlvo" inputmode="decimal" placeholder="0,00" value="${c.alvo?moneyVal(c.alvo):''}"></div>
    <div class="f"><label>Até quando? (opcional)</label><input type="month" id="cPrazo" value="${c.prazo||''}"></div></div>
    <button class="btn pri" data-act="salvarCof">Salvar</button>
    ${id?'<button class="btn dan" data-act="excluirCof">Excluir cofrinho</button>':''}`);
}
function salvarCofrinho(){
  const nome = document.getElementById('cNome').value.trim(); if (!nome) return toast('Dê um nome para o cofrinho');
  const dados = { nome, emoji:form.v.emoji||'🎯', alvo:parseValor(document.getElementById('cAlvo').value), prazo:document.getElementById('cPrazo').value||'' };
  if (form.id) Object.assign(cofPorId(form.id), dados); else S.cofrinhos.push({ id:uid(), ...dados });
  salvar(); fechar(); render(); toast('Cofrinho salvo ✓'); checarConquistas();
}
function excluirCofrinho(){
  const id = form.id, c = cofPorId(id);
  if (!confirm(`Excluir o cofrinho “${c.nome}”? O dinheiro guardado nele continua nas suas reservas, como “Outros”.`)) return;
  Object.values(S.meses).forEach(M => M.reservas.forEach(r => { if (cofDe(r)===id){ delete r.cof; r.tipo = 'Outros'; } }));
  S.cofrinhos = S.cofrinhos.filter(x=>x.id!==id); salvar(); fechar(); render(); toast('Cofrinho excluído');
}

const ICON_BUSCA = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/></svg>';
function telaLanc(){
  const M = mes(cur.y,cur.m), C = calc(cur.y,cur.m);
  let h = `<div class="busca">${ICON_BUSCA}<input id="fBusca" type="search" enterkeyhint="search" placeholder="Buscar em todos os meses" value="${esc(busca)}" autocomplete="off"><button class="x" data-act="limparBusca" aria-label="Limpar busca" ${busca?'':'hidden'}>×</button></div>
  <div id="resBusca">${busca ? resultadosBusca(busca) : ''}</div><div id="lancNormal" ${busca?'hidden':''}>`;
  h += `<div class="seg">
    <button class="${subLanc==='entradas'?'on':''}" data-sub="entradas">Entradas</button>
    <button class="${subLanc==='gastos'?'on':''}" data-sub="gastos">Gastos</button>
    <button class="${subLanc==='reservas'?'on':''}" data-sub="reservas">Reservas</button>
    <button class="${subLanc==='calendario'?'on':''}" data-sub="calendario">Calendário</button></div>`;
  if (subLanc==='entradas'){
    const tot = C.entradas;
    h += `<div class="totalrow"><span>Total de entradas</span><b class="num">${brl(tot)}</b></div><div class="list">`;
    if (C.saldoAnterior) h += `<div class="item"><div class="ic">↪️</div><div class="tx"><div class="t1">Saldo do mês anterior <span class="tag auto">automático</span></div><div class="t2">${tot?(C.saldoAnterior/tot*100).toFixed(1):0}% das entradas</div></div><div class="val num">${brl(C.saldoAnterior)}</div></div>`;
    M.entradas.forEach(e=>{ h += `<button class="item" data-edit="entradas" data-id="${e.id}"><div class="ic">💰</div><div class="tx"><div class="t1">${esc(e.nome)}${e.fixa?' <span class="tag auto">todo mês</span>':''}</div><div class="t2">${tot?(e.valor/tot*100).toFixed(1):0}% das entradas${e.data?' · '+fmtData(e.data):''}</div></div><div class="val num up">${brl(e.valor)}</div></button>`; });
    if (!M.entradas.length && !C.saldoAnterior) h += vazio('💰','Nenhuma entrada neste mês','Adicione seu salário, renda extra ou vendas.');
    h += `</div>`;
  }
  if (subLanc==='gastos'){
    const gs = [...M.gastos].sort((a,b)=>(b.data||'').localeCompare(a.data||''));
    const parcOutras = parcelasDoMes(cur.y,cur.m).filter(x=>x.i>0);
    const totMes = soma(gs.filter(g=>!ehParcelado(g)),g=>g.valor) + soma(parcelasDoMes(cur.y,cur.m),x=>x.valor);
    h += `<div class="totalrow"><span>Total de gastos</span><b class="num">${brl(totMes)}</b></div><div class="list">`;
    faturasPorCartao(cur.y,cur.m).forEach(f => { const tag = f.cartao ? `button class="item" data-act="fatAbrir" data-c="${f.cartao.id}"` : 'div class="item"';
      h += `<${tag}><div class="ic">💳</div><div class="tx"><div class="t1">Fatura ${f.cartao?esc(f.cartao.nome):'do crédito'} <span class="tag auto">automático</span></div><div class="t2">${f.cartao?`Vence dia ${f.cartao.vencimento} · toque para ver as compras`:`Crédito usado em ${MESES[prevYM(cur.y,cur.m).m]}`}</div></div><div class="val num down">${brl(f.valor)}</div></${tag.split(' ')[0]}>`; });
    gs.forEach(g=>{
      const parc = ehParcelado(g);
      h += `<button class="item" data-edit="gastos" data-id="${g.id}"><div class="ic">${emojiCat(g.cat)}</div><div class="tx"><div class="t1">${esc(g.desc||nomeCat(g.cat))}</div><div class="t2">${esc(g.forma)}${parc?`<span class="tag cr">1/${g.parcelas} de ${brl(g.valor)}</span>`:g.forma==='Crédito'?'<span class="tag cr">fatura</span>':''}${g.data?' · '+fmtData(g.data):''} · ${g.essencial?'✅':'❌'}${g.dividido?` · 👥 sua parte ${brl(g.minha)}`:g.minha===0?' · 🤝 emprestado':''}${(g.tags||[]).map(t=>` <span class="tag auto">🏷️ ${esc(t)}</span>`).join('')}</div></div><div class="val num">${brl(parc?parcelasDoMes(cur.y,cur.m).find(x=>x.g===g).valor:g.valor)}</div></button>`; });
    parcOutras.forEach(x=>{
      h += `<button class="item" data-edit="gastos" data-id="${x.g.id}" data-mk="${x.origem}"><div class="ic">${emojiCat(x.g.cat)}</div><div class="tx"><div class="t1">${esc(x.g.desc||nomeCat(x.g.cat))}</div><div class="t2">Crédito<span class="tag cr">parcela ${x.i+1}/${x.n}</span> · compra em ${MESES[ymDe(x.origem).m].toLowerCase()}</div></div><div class="val num">${brl(x.valor)}</div></button>`; });
    if (!gs.length && !C.faturaAnterior && !parcOutras.length) h += vazio('🧾','Nenhum gasto neste mês','Toque no + para lançar.');
    h += `</div><button class="btn sec" data-act="importarExtrato">📥 Importar extrato do banco</button>`;
  }
  if (subLanc==='reservas'){
    h += `<div class="totalrow"><span>Total reservado/investido</span><b class="num">${brl(C.reservas)}</b></div><div class="list">`;
    M.reservas.forEach(r=>{ const c = cofPorId(cofDe(r));
      h += `<button class="item" data-edit="reservas" data-id="${r.id}"><div class="ic">${c?c.emoji:'📈'}</div><div class="tx"><div class="t1">${esc(r.nome||(c?c.nome:r.tipo))}</div><div class="t2">${c?(r.valor<0?'Retirada de ':'')+esc(c.nome):esc(r.tipo)}${r.data?' · '+fmtData(r.data):''}</div></div><div class="val num ${r.valor<0?'down':''}">${brl(r.valor)}</div></button>`; });
    if (!M.reservas.length) h += vazio('🐷','Nada guardado neste mês','Guarde num cofrinho ou registre um investimento.');
    h += `</div>`;
  }
  if (subLanc==='calendario') h += telaCalendario();
  return h + `</div>`;
}

/* ---------- calendário financeiro ----------
   Cada dia: cor pela soma dos gastos (quanto mais escuro, mais gasto), marcadores de entrada e de contas.
   Tocar num dia mostra tudo o que aconteceu nele. */
function diasDoMes(y, m){
  const k = key(y,m), M = mes(y,m), D = diasNoMes(y,m);
  const dias = Array.from({ length:D+1 }, () => ({ itens:[], gasto:0, entrada:0, aVencer:0, pagas:0 }));
  const dia = (data) => data && data.startsWith(k) ? Math.min(+data.slice(8,10), D) : 0;   // 0 = sem data
  const diaDe = (data) => data ? Math.min(+data.slice(8,10), D) : 0;
  M.gastos.filter(g=>!ehParcelado(g)).forEach(g => { const d = dia(g.data); dias[d].gasto += +g.valor;
    dias[d].itens.push({ tipo:'gastos', id:g.id, mk:k, ic:emojiCat(g.cat), t:g.desc||nomeCat(g.cat), s:g.forma, v:-g.valor }); });
  parcelasDoMes(y,m).forEach(x => { const d = diaDe(x.g.data); dias[d].gasto += x.valor;
    dias[d].itens.push({ tipo:'gastos', id:x.g.id, mk:x.origem, ic:emojiCat(x.g.cat), t:x.g.desc||nomeCat(x.g.cat), s:`Parcela ${x.i+1}/${x.n}`, v:-x.valor }); });
  M.entradas.forEach(e => { const d = dia(e.data); dias[d].entrada += +e.valor;
    dias[d].itens.push({ tipo:'entradas', id:e.id, mk:k, ic:'💰', t:e.nome, s:'Entrada', v:+e.valor }); });
  M.contas.forEach(c => {
    if (c.pago){ const d = dia(c.data); dias[d].gasto += +c.valor; dias[d].pagas++;
      dias[d].itens.push({ tipo:'contas', id:c.id, mk:k, ic:'✅', t:c.nome, s:'Conta paga', v:-c.valor }); }
    else { const d = c.venc ? Math.min(+c.venc, D) : 0; dias[d].aVencer++;
      dias[d].itens.push({ tipo:'contas', id:c.id, mk:k, ic:'⏰', t:c.nome, s:'Conta a vencer', v:-(c.planejado||c.valor), pendente:true }); }
  });
  faturasPorCartao(y,m).forEach(f => { if (!f.cartao) return; const d = Math.min(f.cartao.vencimento, D), st = statusFatura(f.cartao.id, y, m);
    if (!st) dias[d].aVencer++;
    dias[d].itens.push({ tipo:'fatura', ic: st ? '✅' : '💳', t:'Fatura ' + f.cartao.nome, s: st ? (st.pago < f.valor - 0.004 ? 'Fatura paga em parte' : 'Fatura paga') : 'Vencimento da fatura', v:-(st ? Math.min(st.pago, f.valor) : f.valor), pendente:!st }); });
  M.reservas.forEach(r => { const d = dia(r.data); const c = cofPorId(cofDe(r));
    dias[d].itens.push({ tipo:'reservas', id:r.id, mk:k, ic:c?c.emoji:'📈', t:r.nome||(c?c.nome:r.tipo), s:r.valor<0?'Retirada':'Guardado', v:-r.valor }); });
  return dias;
}
const valorCurto = (v) => S.ocultar ? '•••' : v >= 1000 ? (v/1000).toLocaleString('pt-BR',{maximumFractionDigits:1}) + ' mil' : Math.round(v).toLocaleString('pt-BR');
function telaCalendario(){
  const y = cur.y, m = cur.m, D = diasNoMes(y,m), dias = diasDoMes(y,m);
  const ehMesAtual = key(y,m) === chaveHoje(), hojeD = hoje.getDate();
  const ultimoDia = ehMesAtual ? hojeD : key(y,m) < chaveHoje() ? D : 0;   // dias já vividos
  const max = Math.max(...dias.slice(1).map(d=>d.gasto), 0);
  if (!calSel || calSel.k !== key(y,m)){
    const primeiroComAlgo = dias.findIndex((d,i)=>i>0 && d.itens.length);
    calSel = { k:key(y,m), d: ehMesAtual ? hojeD : (primeiroComAlgo > 0 ? primeiroComAlgo : 1) };
  }
  const nivel = (v) => !v || !max ? 0 : Math.max(1, Math.ceil(v/max*4));
  // resumo
  const vividos = dias.slice(1, ultimoDia+1);
  const semGasto = vividos.filter(d=>d.gasto===0).length;
  const totalGasto = soma(dias, d=>d.gasto);
  const diaMax = max ? dias.findIndex((d,i)=>i>0 && d.gasto===max) : 0;
  let h = `<section class="card cal-card">`;
  if (ultimoDia){
    h += `<div class="cal-kpis">
      <div><span>Dias sem gastar</span><b>${semGasto} <small>de ${ultimoDia}</small></b></div>
      <div><span>Média por dia</span><b class="num">${brl0(totalGasto/ultimoDia)}</b></div>
      <div><span>Maior gasto</span><b>${diaMax?`dia ${diaMax}`:'—'}</b></div></div>`;
  }
  // grade
  const inicio = new Date(y, m, 1).getDay();
  h += `<div class="cal-sem">${['D','S','T','Q','Q','S','S'].map(d=>`<span>${d}</span>`).join('')}</div><div class="cal-grade" role="grid">`;
  for (let i=0;i<inicio;i++) h += '<span class="cal-vazio"></span>';
  for (let d=1; d<=D; d++){
    const x = dias[d], n = nivel(x.gasto), futuro = d > ultimoDia;
    const cls = ['cal-dia', 'h'+n, futuro?'futuro':'', ehMesAtual && d===hojeD ? 'hoje' : '', calSel.d===d ? 'sel' : ''].join(' ');
    h += `<button class="${cls}" data-dia="${d}" aria-label="Dia ${d}${x.gasto?', gastou '+brl(x.gasto):''}${x.aVencer?', '+x.aVencer+' conta a vencer':''}">
      <span class="cal-n">${d}</span>${x.gasto?`<span class="cal-v">${valorCurto(x.gasto)}</span>`:''}
      <span class="cal-dots">${x.entrada?'<i class="dot-ent"></i>':''}${x.aVencer?'<i class="dot-venc"></i>':''}${x.pagas?'<i class="dot-paga"></i>':''}</span></button>`;
  }
  h += `</div><div class="cal-leg"><span><i class="dot-ent"></i>Entrada</span><span><i class="dot-venc"></i>Conta a vencer</span><span><i class="dot-paga"></i>Conta paga</span>
    <span class="cal-esc">menos <i class="h1"></i><i class="h2"></i><i class="h3"></i><i class="h4"></i> mais gasto</span></div></section>`;
  // detalhe do dia
  const x = dias[calSel.d], nomeDia = DIAS_SEMANA[new Date(y, m, calSel.d).getDay()];
  h += `<div class="totalrow"><span><b>${calSel.d} de ${MESES[m].toLowerCase()}</b> · ${nomeDia}</span>${x.gasto?`<span>Gastos <b class="num">${brl(x.gasto)}</b></span>`:''}</div>`;
  h += `<div class="list">${x.itens.map(i=>`<button class="item" ${i.tipo==='fatura' ? 'data-tab="metas"' : `data-edit="${i.tipo}" data-id="${i.id}" data-mk="${i.mk}"`}><div class="ic">${i.ic}</div><div class="tx"><div class="t1">${esc(i.t)}</div><div class="t2">${esc(i.s)}</div></div><div class="val num ${i.v>0?'up':''}" ${i.pendente?'style="color:var(--muted)"':''}>${brl(Math.abs(i.v))}</div></button>`).join('')
    || vazio(calSel.d > ultimoDia ? '🗓️' : '🎉', calSel.d > ultimoDia ? 'Nada previsto para este dia' : 'Nenhum gasto neste dia', calSel.d > ultimoDia ? '' : 'Dia sem gastar conta pontos 😉')}</div>`;
  if (dias[0].itens.length) h += `<p class="note">${dias[0].itens.length} lançamento(s) deste mês sem data não aparecem no calendário.</p>`;
  return h;
}

// Busca em todos os meses: descrição, nome, categoria, forma de pagamento ou valor.
const semAcento = (t) => String(t||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
function resultadosBusca(q){
  const termo = semAcento(q.trim());
  const num = parseValor(q);
  const bate = (textos, valor) => textos.some(t=>semAcento(t).includes(termo)) || (num>0 && /^[\d.,\sR$]+$/.test(q.trim()) && Math.abs(valor-num)<0.005);
  const res = [];
  Object.keys(S.meses).sort().reverse().forEach(k=>{
    const M = S.meses[k];
    M.gastos.forEach(g=>{ if (bate([g.desc, nomeCat(g.cat), g.forma, ...(g.tags||[])], g.valor)) res.push({ k, tipo:'gastos', it:g, ic:emojiCat(g.cat), t:g.desc||nomeCat(g.cat),
      s:`${nomeCat(g.cat)} · ${g.forma}${ehParcelado(g)?` · ${g.parcelas}x`:''}${g.data?' · '+fmtData(g.data):''}`, v:-g.valor, d:g.data||k }); });
    M.entradas.forEach(e=>{ if (bate([e.nome,'entrada'], e.valor)) res.push({ k, tipo:'entradas', it:e, ic:'💰', t:e.nome, s:`Entrada${e.data?' · '+fmtData(e.data):''}`, v:e.valor, d:e.data||k }); });
    M.contas.forEach(c=>{ if (bate([c.nome,'conta'], c.pago?c.valor:c.planejado)) res.push({ k, tipo:'contas', it:c, ic:'📄', t:c.nome, s:c.pago?`Conta paga${c.data?' em '+fmtData(c.data):''}`:'Conta pendente', v:-(c.pago?c.valor:c.planejado), d:c.data||k }); });
    M.reservas.forEach(r=>{ const c = cofPorId(cofDe(r)); if (bate([r.nome, r.tipo, c&&c.nome], r.valor)) res.push({ k, tipo:'reservas', it:r, ic:c?c.emoji:'📈', t:r.nome||(c?c.nome:r.tipo), s:`${c?c.nome:r.tipo}${r.data?' · '+fmtData(r.data):''}`, v:-r.valor, d:r.data||k }); });
  });
  if (!res.length) return vazio('🔎','Nada encontrado',`Nenhum lançamento com “${esc(q)}”.`);
  res.sort((a,b)=>b.d.localeCompare(a.d));
  const gastos = res.filter(x=>x.tipo==='gastos'||x.tipo==='contas');
  let h = `<div class="totalrow"><span>${res.length} resultado${res.length>1?'s':''}</span>${gastos.length?`<span>Gastos: <b class="num">${brl(-soma(gastos,x=>x.v))}</b></span>`:''}</div><div class="list">`;
  let ultimo = '';
  res.slice(0,150).forEach(x=>{
    if (x.k!==ultimo){ ultimo = x.k; const o = ymDe(x.k); h += `<div class="res-mes">${MESES[o.m]} ${o.y}</div>`; }
    h += `<button class="item" data-edit="${x.tipo}" data-id="${x.it.id}" data-mk="${x.k}"><div class="ic">${x.ic}</div><div class="tx"><div class="t1">${esc(x.t)}</div><div class="t2">${esc(x.s)}</div></div><div class="val num ${x.v>0?'up':''}">${brl(Math.abs(x.v))}</div></button>`;
  });
  if (res.length>150) h += `<div class="empty">Mostrando os 150 mais recentes. Refine a busca.</div>`;
  return h + `</div>`;
}
const vazio = (e,t,s) => `<div class="empty"><div class="e">${e}</div><b>${t}</b><div>${s}</div></div>`;

function telaContas(){
  const M = mes(cur.y,cur.m), C = calc(cur.y,cur.m);
  const p = prevYM(cur.y,cur.m), Mp = mes(p.y,p.m);
  const ordem = [...M.contas].sort((a,b)=> (a.pago-b.pago) || ((+a.venc||99)-(+b.venc||99)));
  let h = `<div class="totalrow"><span>Pagas <b class="num">${brl(C.contasPagas)}</b></span><span>Pendentes <b class="num">${brl(C.contasPend)}</b></span></div><div class="list">`;
  ordem.forEach(c=>{
    const dif = c.pago && c.planejado && Math.abs(c.valor-c.planejado)>0.004;
    const st = statusConta(c,cur.y,cur.m);
    const situacao = c.pago ? 'Paga'+(c.data?' em '+fmtData(c.data):'') : st ? `<span class="tag ${st.cls}">${st.t}</span>` : (c.venc?`Vence dia ${c.venc}`:'Pendente');
    h += `<div class="item"><button class="check ${c.pago?'on':''}" data-pay="${c.id}" aria-label="Marcar como paga">${c.pago?'✓':''}</button>
    <button class="tx" style="text-align:left" data-edit="contas" data-id="${c.id}"><div class="t1">${esc(c.nome)}</div>
    <div class="t2">${situacao}${c.planejado?' · planejado '+brl(c.planejado):''}${dif?` <span class="tag ${c.valor>c.planejado?'cr':''}">${c.valor>c.planejado?'+':'−'}${brl(Math.abs(c.valor-c.planejado))}</span>`:''}</div></button>
    <div class="val num" style="${c.pago?'':'color:var(--muted)'}">${brl(c.pago?c.valor:(c.planejado||c.valor))}</div></div>`;
  });
  if (!M.contas.length) h += vazio('📄','Nenhuma conta neste mês','Cadastre aluguel, energia, internet, parcelas…');
  h += `</div><button class="btn sec" data-act="addConta">+ Adicionar conta</button>`;
  const fats = faturasPorCartao(cur.y,cur.m).filter(f => f.cartao);
  if (fats.length){
    h += `<h4 class="sub-h">💳 Faturas do cartão</h4><div class="list">`;
    fats.forEach(f => { const c = f.cartao, st = statusFatura(c.id, cur.y, cur.m), parcial = st && st.pago < f.valor - 0.004;
      const sc = statusConta({ pago:!!st, venc:c.vencimento }, cur.y, cur.m);
      const situacao = st ? (parcial ? `Paga em parte: ${brl(st.pago)}` : 'Paga' + (st.em ? ' em ' + fmtData(st.em) : '')) : sc ? `<span class="tag ${sc.cls}">${sc.t}</span>` : `Vence dia ${c.vencimento}`;
      h += `<div class="item"><button class="check ${st?'on':''}" data-act="fatCheck" data-c="${c.id}" aria-label="Marcar fatura como paga">${st?'✓':''}</button>
        <button class="tx" style="text-align:left" data-act="fatAbrir" data-c="${c.id}"><div class="t1">Fatura ${esc(c.nome)}</div><div class="t2">${situacao}</div></button>
        <div class="val num" style="${st?'':'color:var(--muted)'}">${brl(f.valor)}</div></div>`; });
    h += `</div>`;
  }
  if (Mp.contas.length) h += `<button class="btn sec" data-act="copiarContas">Copiar contas de ${MESES[p.m]} (${Mp.contas.length})</button>`;
  h += `<p class="note" style="margin-top:12px">Marque ✓ quando pagar. Só as contas pagas entram nas saídas do mês. Ao começar um mês novo, suas contas são copiadas automaticamente.</p>`;
  return h;
}

function telaMetas(){
  const C = calc(cur.y,cur.m), p = S.perfil;
  const anos = [...new Set(Object.keys(S.meses).map(k=>+k.slice(0,4)))].sort((a,b)=>b-a).filter(a => dadosRetroAno(a));
  return `${anos.length ? `<div class="anos-retro">${anos.map(a=>`<button class="btn sec" data-act="retroAno" data-ano="${a}">🎆 ${a === hoje.getFullYear() && hoje.getMonth() < 11 ? a + ' até agora' : 'Retrospectiva ' + a}</button>`).join('')}</div>` : ''}
  <button class="retro-card simular" data-act="possoComprar"><span class="rc-e">🤔</span><span><b>Posso comprar?</b><small>Simule uma compra antes de gastar</small></span><span class="rc-seta">›</span></button>
  ${cardPatrimonio()}
  ${cardCofrinhos(false)}
  ${cardCartoes()}
  ${cardDividas()}
  ${cardMeDevem()}
  ${cardEtiquetas()}
  ${cardOrcamentos(C)}
  ${cardConquistas()}
  <button class="btn sec" data-tab="ajustes">⚙️ Ajustes, backup e instalação</button>`;
}

// Instruções de instalação: primeiro as do aparelho em uso, depois as dos outros.
function cardInstalar(){
  const ua = navigator.userAgent;
  const ios = /iphone|ipad|ipod/i.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
  const android = /android/i.test(ua);
  const atual = ios ? (/CriOS/.test(ua) ? 'ios-chrome' : /FxiOS|EdgiOS|OPiOS/.test(ua) ? 'ios-outro' : 'ios-safari')
    : android ? (/SamsungBrowser/.test(ua) ? 'samsung' : 'android') : 'pc';
  const passos = {
    'ios-safari': ['iPhone (Safari)', ['Toque no botão <b>Compartilhar</b> <span class="kbd">⬆︎</span> na barra de baixo.', 'Role a lista e toque em <b>Adicionar à Tela de Início</b>.', 'Toque em <b>Adicionar</b>, no canto de cima.']],
    'ios-chrome': ['iPhone (Chrome)', ['Toque no botão <b>Compartilhar</b> <span class="kbd">⬆︎</span> ao lado do endereço, no alto.', 'Toque em <b>Adicionar à Tela de Início</b>.', 'Toque em <b>Adicionar</b>.']],
    'ios-outro': ['iPhone (outros navegadores)', ['Copie o link do app e abra no <b>Safari</b>.', 'Depois siga as instruções do Safari: <b>Compartilhar</b> → <b>Adicionar à Tela de Início</b>.']],
    'android': ['Android (Chrome)', ['Toque no botão <b>Instalar app</b> acima, se aparecer.', 'Ou toque no menu <span class="kbd">⋮</span> no canto de cima.', 'Toque em <b>Instalar app</b> ou <b>Adicionar à tela inicial</b>.']],
    'samsung': ['Samsung Internet', ['Toque no menu <span class="kbd">☰</span> na barra de baixo.', 'Toque em <b>Adicionar página a</b> e depois em <b>Tela inicial</b>.']],
    'pc': ['Computador (Chrome ou Edge)', ['Clique no ícone de <b>instalar</b> <span class="kbd">⊕</span> no fim da barra de endereço.', 'Ou abra o menu do navegador e clique em <b>Instalar Tino Finanças</b>.']]
  };
  const lista = (k) => `<ol class="passos">${passos[k][1].map(p=>`<li>${p}</li>`).join('')}</ol>`;
  const outros = ['ios-safari','ios-chrome','android','samsung','pc'].filter(k=>k!==atual);
  return `<section class="card"><h3>Instalar no celular</h3>
    <p class="note" style="margin:0 0 10px">Instalado, o app abre em tela cheia direto da tela inicial e funciona sem internet.${atual.startsWith('ios')?' <b>No iPhone, o app instalado não enxerga os dados daqui do navegador:</b> faça um backup antes, instale e use “Restaurar backup” no app instalado.':''}</p>
    ${(atual==='android'||atual==='pc') ? `<button class="btn pri" data-act="instalar">📲 Instalar app</button>` : ''}
    <div class="inst-atual"><b>${passos[atual][0]}</b>${lista(atual)}</div>
    <details class="mais"><summary>Instruções para outros aparelhos</summary>
      ${outros.map(k=>`<div class="inst-outro"><b>${passos[k][0]}</b>${lista(k)}</div>`).join('')}
    </details></section>`;
}
function telaAjustes(){
  const p = S.perfil;
  const ios = /iphone|ipad|ipod/i.test(navigator.userAgent);
  const instalado = matchMedia('(display-mode: standalone)').matches || navigator.standalone;
  const tema = S.tema || 'auto';
  return `${plusVisivel() ? `<section class="card"><h3>⭐ Tino Plus${TESTE ? ' <small class="muted">(endereço de teste)</small>' : ''}</h3>
    <p class="note" style="margin:0 0 12px">${plusSessao() ? `Conectado como <b>${esc(plusSessao().email)}</b>.` : S.plusConvite ? 'Você foi convidado para testar o Tino Plus antes do lançamento: seus dados em todos os aparelhos, sempre sincronizados, e o Tino no WhatsApp.' : 'Seus dados em todos os aparelhos, o Tino no WhatsApp (anote por texto, foto ou áudio) e lembretes das contas e da fatura.'}</p>
    <button class="btn sec" data-act="plus">${plusSessao() ? 'Ver minha conta Plus' : 'Entrar no Tino Plus'}</button></section>` : ''}
  <section class="card"><h3>Aparência</h3>
    <div class="temas">${[['auto','Automático'],['claro','☀️ Claro'],['escuro','🌙 Escuro']].map(([v,l])=>`<button class="${tema===v?'on':''}" data-act="tema" data-v="${v}">${l}</button>`).join('')}</div>
    <p class="note">Automático segue o modo claro/escuro do seu celular.</p></section>
  <section class="card"><h3>Perfil</h3>
    <div class="f"><label>Quero ser chamado(a) de</label><input id="pNome" value="${esc(p.nome)}"></div>
    <div class="f"><label>Meus pronomes são</label><select id="pPron">${['Masculinos','Femininos','Neutros'].map(o=>`<option ${o===p.pronome?'selected':''}>${o}</option>`).join('')}</select></div>
    <button class="btn pri" data-act="salvarPerfil">Salvar perfil</button></section>
  ${podeIndicar() ? `<section class="card"><h3>🎁 Indique e ganhe</h3>
    <p class="note" style="margin:0 0 12px">Seu amigo paga R$ 20 em vez de R$ 27, e você ganha a Planilha de Organização Financeira quando ele comprar.</p>
    <button class="btn pri" data-act="indique">Ver meu convite</button>
    ${S.conta && !S.indicadoInformado ? '<button class="link-sutil" data-act="indiqueUsar">Alguém te indicou? Digite o código</button>' : ''}</section>` : ''}
  <section class="card"><h3>Categorias</h3>
    <p class="note" style="margin:0 0 12px">Crie categorias do seu jeito (pet, filhos, academia…) e esconda as que você não usa.${(S.catsExtras||[]).length ? ` Você tem <b>${S.catsExtras.length}</b> categoria${S.catsExtras.length>1?'s':''} sua${S.catsExtras.length>1?'s':''}.` : ''}</p>
    <button class="btn sec" data-act="categorias">🏷️ Minhas categorias</button></section>
  <section class="card"><h3>Personalidade do Tino</h3>
    <div class="temas">${[['gentil','🙂 Gentil'],['sincero','😏 Sincero']].map(([v,l])=>`<button class="${(S.tom||'gentil')===v?'on':''}" data-act="tom" data-v="${v}">${l}</button>`).join('')}</div>
    <p class="note">No modo sincero, as dicas ficam mais diretas e bem-humoradas.</p></section>
  <section class="card"><h3>Minha renda varia</h3>
    <p class="note" style="margin:0 0 12px">${S.rendaVariavel && S.rendaVariavel.ativo ? `Ligado · renda segura de <b>${brl0(S.rendaVariavel.segura)}</b> por mês.` : 'Para autônomos, comissão ou freela: acompanhe o que já entrou no mês e guarde o que vier acima do normal.'}</p>
    <button class="btn sec" data-act="rendaVariavel">${S.rendaVariavel && S.rendaVariavel.ativo ? 'Ajustar renda segura' : 'Ativar'}</button></section>
  <section class="card"><h3>Saldo entre meses</h3>
    <div class="switch"><span>Levar o que sobrou para o mês seguinte</span><button class="tg ${S.carry?'on':''}" data-act="carry" aria-label="Alternar"></button></div>
    <p class="note">Ligado: o “restante para gastar” de um mês entra como entrada no próximo.</p></section>
  ${instalado?'':cardInstalar()}
  <section class="card" id="cardBackup"><h3>Backup dos dados</h3>
    <p class="note" style="margin:0 0 12px">Seus dados ficam só neste aparelho. Faça backup antes de trocar de celular ou limpar o navegador. Guarde o arquivo no Google Drive, iCloud, WhatsApp ou e-mail.</p>
    <p class="note" style="margin:0 0 12px">Último backup: <b>${S.ultimoBackup ? new Date(S.ultimoBackup).toLocaleDateString('pt-BR') + ` (${diasDesde(S.ultimoBackup)===0?'hoje':'há '+diasDesde(S.ultimoBackup)+' dias'})` : 'nunca'}</b>${S.novosDesdeBackup?` · ${S.novosDesdeBackup} lançamento${S.novosDesdeBackup>1?'s':''} desde então`:''}</p>
    <button class="btn sec" data-act="exportar">⬇️ Fazer backup</button>
    <button class="btn sec" data-act="importar">⬆️ Restaurar backup</button>
    <input type="file" id="fileImp" hidden>
    ${cardNuvem()}</section>
  
  <section class="card"><h3>Exportar para Excel</h3>
    <p class="note" style="margin:0 0 12px">Gera uma planilha com todos os lançamentos (data, descrição, categoria, valor, forma de pagamento) para abrir no Excel ou no Google Planilhas. Serve para analisar, não para restaurar.</p>
    <button class="btn sec" data-act="exportarCsv">📊 Exportar lançamentos</button>
</section>
  <section class="card"><h3>Importar extrato do banco</h3>
    <p class="note" style="margin:0 0 12px">Baixe o extrato no app do seu banco (OFX ou CSV) e importe aqui. O app sugere as categorias e você confere antes. O arquivo é lido só no seu aparelho.</p>
    <button class="btn sec" data-act="importarExtrato">📥 Importar extrato</button></section>
  ${cardNotificacoes()}
  ${cardPrivacidade()}
  <section class="card"><h3>Conta</h3>
    <p class="note" style="margin:0 0 12px">${S.conta ? `Conectado como <b>${esc(S.conta)}</b>` : 'Conectado neste aparelho'}. Ao sair, seus dados ficam guardados aqui e voltam quando você entrar de novo com o mesmo e-mail. Entrando com outro e-mail, o app começa do zero, com dados separados.</p>
    ${S.conta ? '<button class="btn sec" data-act="aparelhos">📱 Aparelhos conectados</button>' : '<p class="note" style="margin:0 0 12px">Para ver e gerenciar seus aparelhos, saia e entre de novo com seu e-mail (seus dados ficam guardados).</p>'}
    <button class="btn sec" data-act="sair">Sair da conta</button>
    ${S.conta && !DEMO ? '<button class="link-sutil" data-act="excluirConta">Excluir minha conta</button>' : ''}</section>
  <section class="card" id="cardAjuda"><h3>Ajuda e suporte</h3>
    <p class="note" style="margin:0 0 12px">Dúvidas sobre instalar, trocar de celular, backup, Face ID ou notificações? As respostas estão aqui, e você pode falar com a gente.</p>
    <button class="btn pri" data-act="ajuda">❓ Central de ajuda</button>
    ${S.conta && !DEMO ? '<button class="btn sec" data-act="depoimento">💬 Deixar um depoimento</button>' : ''}</section>
  ${S.conta && !DEMO ? `<section class="card"><h3>🏦 Em breve: Tino Conectado</h3>
    <p class="note" style="margin:0 0 12px">Seus gastos entrando sozinhos, direto do banco, pelo Open Finance. Um plano opcional, com mensalidade; o Tino que você comprou continua vitalício.</p>
    ${S.lista ? '<p class="note" style="margin:0"><span class="tag auto">✓ você está na lista</span> Vamos te avisar por e-mail.</p>' : '<button class="btn sec" data-act="listaAbrir">Entrar na lista de espera</button>'}</section>` : ''}
  <button class="btn sec" data-act="verTour">🎓 Ver tutorial de novo</button>
  <button class="btn dan" data-act="zerar">Apagar todos os dados</button>`;
}

/* ---------- formulários (bottom sheet) ---------- */
const $ov = document.getElementById('overlay'), $sh = document.getElementById('sheet');
let form = null;
function abrir(html){ $sh.innerHTML = '<div class="grab"></div>'+html; $ov.classList.add('open'); const i=$sh.querySelector('input.money'); if(i&&!i.value) setTimeout(()=>i.focus(),250); }
function fechar(){ $ov.classList.remove('open'); form=null; if (conqPendente){ conqPendente = false; setTimeout(checarConquistas, 400); } }
$ov.addEventListener('click', e=>{ if(e.target===$ov){ if ($sh.querySelector('.novidades')){ S.versaoVista = APP_VERSAO; salvar(); } fechar(); } });

const dataHoje = () => { const d=new Date(); return key(d.getFullYear(),d.getMonth())+'-'+String(d.getDate()).padStart(2,'0'); };
const dataPadrao = () => (cur.y===hoje.getFullYear() && cur.m===hoje.getMonth()) ? dataHoje() : key(cur.y,cur.m)+'-01';
const chips = (name, opts, sel) => `<div class="chips" data-chips="${name}">${opts.map(o=>`<button type="button" class="${o===sel?'on':''}" data-v="${esc(o)}">${esc(o)}</button>`).join('')}</div>`;
const moneyVal = (v) => v ? v.toLocaleString('pt-BR',{minimumFractionDigits:2}) : '';
const abasForm = (sel) => `<div class="seg sm">${[['gastos','Gasto'],['entradas','Entrada'],['contas','Conta'],['reservas','Reserva']].map(([t,l])=>`<button type="button" class="${t===sel?'on':''}" data-new="${t}">${l}</button>`).join('')}</div>`;

// Atalhos: as combinações de categoria + descrição mais usadas nos últimos 3 meses.
function recentes(){
  const cont = {};
  for (let i=0;i<3;i++){ const o = somaMeses(hoje.getFullYear(),hoje.getMonth(),-i);
    mes(o.y,o.m).gastos.forEach(g=>{ const k = g.cat+'|'+(g.desc||''); (cont[k] = cont[k] || { n:0, g }).n++; }); }
  return Object.values(cont).sort((a,b)=>b.n-a.n).slice(0,6).map(x=>x.g);
}

function abrirForm(tipo, id, mk, opcoes){
  const M = mk ? S.meses[mk] : mes(cur.y,cur.m);
  const it = id ? M[tipo].find(x=>x.id===id) : null;
  form = { tipo, id, mk, v:{} };
  const del = it ? `<button class="btn dan" data-act="excluir">Excluir</button>` : '';
  const topo = it ? '' : abasForm(tipo);
  if (tipo==='entradas'){
    form.v = { fixa: it?!!it.fixa:false, tipoEnt: it && it.fixa ? 'Fixo (todo mês)' : 'Único' };
    abrir(`${topo}<h2>${it?'Editar':'Nova'} entrada</h2>
      <div class="f"><label id="lblEntValor">Valor</label><input class="money num" id="fValor" inputmode="decimal" placeholder="0,00" value="${moneyVal(it&&it.valor)}"></div>
      <div class="f"><label>Nome</label><input id="fNome" placeholder="Ex.: Salário, Freela, Vendas" value="${esc(it?it.nome:'')}"></div>
      <div class="f"><label>Data</label><input type="date" id="fData" value="${it?it.data||'':dataPadrao()}"></div>
      ${it && it.parcela ? `<p class="note" style="margin:-4px 0 12px">Parcela ${it.parcela} de ${it.de} de um recebimento parcelado. As mudanças valem só para esta parcela.</p>`
        : `<div class="f"><label>Como você recebe</label>${chips('tipoEnt', it ? ['Único','Fixo (todo mês)'] : ['Único','Parcelado','Fixo (todo mês)'], form.v.tipoEnt)}</div>
      <div class="f" id="boxEntParc" hidden><label>Quantas parcelas?</label><select id="fEntParc">${Array.from({length:23},(_,i)=>i+2).map(n=>`<option value="${n}" ${n===3?'selected':''}>${n}x</option>`).join('')}</select><div class="note" id="entParcInfo"></div></div>`}
      <button class="btn pri" data-act="salvarForm">Salvar</button>${del}`);
  }
  if (tipo==='gastos'){
    form.v = { cat: it?it.cat:'', forma: it?it.forma:'Pix / Dinheiro', essencial: it?!!it.essencial:true, parcelas: it?(+it.parcelas||1):1,
      cartao: it ? it.cartao : (cartaoPorId(S.ultimoCartao) ? S.ultimoCartao : ((S.cartoes||[])[0]||{}).id) };
    const rec = it ? [] : recentes();
    abrir(`${topo}${it?'':blocoFrase()}<h2>${it?'Editar':'Novo'} gasto</h2>
      <div class="f"><input class="money num big" id="fValor" inputmode="decimal" placeholder="R$ 0,00" aria-label="Valor" value="${moneyVal(it&&it.valor)}"></div>
      ${rec.length?`<div class="f"><label>Usados com frequência</label><div class="chips rec">${rec.map((g,i)=>`<button type="button" data-rec="${i}">${emojiCat(g.cat)} ${esc(g.desc||nomeCat(g.cat))}</button>`).join('')}</div></div>`:''}
      <div class="f"><label>Categoria</label><div class="catgrid">${catsVisiveis(form.v.cat).map(c=>`<button type="button" class="${c===form.v.cat?'on':''}" data-catsel="${esc(c)}"><span>${emojiCat(c)}</span>${esc(nomeCat(c))}</button>`).join('')}</div>
        ${it ? '' : `<button type="button" class="dividir-cat" data-act="divCats" id="btnDivCats">➗ Dividir entre categorias</button>
        <div id="boxDivCats" class="div-cats" hidden><div id="divCatsLista"></div>
          <button type="button" class="btn sec mini" data-act="divCatsMais">+ Outra categoria</button><div class="note" id="divCatsInfo"></div></div>`}</div>
      <div class="f"><label>Forma de pagamento</label>${chips('forma',FORMAS,form.v.forma)}</div>
      <div class="f" id="boxCartao" ${form.v.forma==='Crédito' && (S.cartoes||[]).length?'':'hidden'}><label>Cartão</label>${chips('cartao', (S.cartoes||[]).map(c=>c.nome), (cartaoPorId(form.v.cartao)||{}).nome)}</div>
      <div class="f" id="boxParc" ${form.v.forma==='Crédito'?'':'hidden'}><label>Parcelas</label><select id="fParc">${Array.from({length:24},(_,i)=>i+1).map(n=>`<option value="${n}" ${n===form.v.parcelas?'selected':''}>${n===1?'À vista (1x)':n+'x'}</option>`).join('')}</select><div class="note" id="parcInfo"></div></div>
      ${it ? (it.dividido ? `<p class="note">👥 Dividido com ${esc(it.dividido.join(', '))} · sua parte ${brl(it.minha)}</p>` : '') : `
      <div class="switch f"><span>👥 Dividir este gasto</span><button type="button" class="tg" data-act="tgDividir" aria-label="Dividir"></button></div>
      <div class="f" id="boxDividir" hidden><label>Com quem? (separe por vírgula)</label><input id="fPessoas" placeholder="Ex.: Ana, Bruno" autocomplete="off">
        ${pessoasFrequentes().length?`<div class="chips pessoas" style="margin-top:8px">${pessoasFrequentes().map(x=>`<button type="button" data-addpessoa="${esc(x)}">+ ${esc(x)}</button>`).join('')}</div>`:''}
        <div class="note" id="divInfo">Escreva os nomes separados por vírgula.</div></div>`}
      <details class="mais" ${it?'open':''}><summary>Descrição, data e essencial</summary>
        <div class="f"><label>Descrição (opcional)</label><input id="fDesc" placeholder="Ex.: Feira da semana" value="${esc(it?it.desc||'':'')}"></div>
        <div class="f"><label>🏷️ Etiqueta (opcional)</label><input id="fTags" placeholder="Ex.: Viagem Praia 2026" autocomplete="off" value="${esc(it ? (it.tags||[]).join(', ') : (S.tagAtiva||''))}">
          ${tagsUsadas().length?`<div class="chips pessoas" style="margin-top:8px">${tagsUsadas().map(t=>`<button type="button" data-addtag="${esc(t)}">🏷️ ${esc(t)}</button>`).join('')}</div>`:''}</div>
        <div class="row2"><div class="f"><label>Data</label><input type="date" id="fData" value="${it?it.data||'':dataPadrao()}"></div>
        <div class="f"><label>Essencial?</label>${chips('essencial',['Sim','Não'],form.v.essencial?'Sim':'Não')}</div></div>
      </details>
      <button class="btn pri" data-act="salvarForm">Salvar</button>${del}`);
    form.rec = rec;
    infoParcelas();
  }
  if (tipo==='contas'){
    form.v = { pago: it?!!it.pago:false };
    abrir(`${topo}<h2>${it?'Editar':'Nova'} conta</h2>
      <div class="f"><label>Nome</label><input id="fNome" placeholder="Ex.: Aluguel, Energia, Internet" value="${esc(it?it.nome:'')}"></div>
      <div class="row2"><div class="f"><label>Planejado</label><input class="num" id="fPlan" inputmode="decimal" placeholder="0,00" value="${moneyVal(it&&it.planejado)}"></div>
      <div class="f"><label>Vence dia</label><input class="num" id="fVenc" inputmode="numeric" placeholder="Ex.: 10" value="${it&&it.venc?it.venc:''}"></div></div>
      <div class="switch f"><span>Já paguei</span><button type="button" class="tg ${form.v.pago?'on':''}" data-act="tgPago"></button></div>
      <div class="row2"><div class="f"><label>Valor pago</label><input class="num" id="fValor" inputmode="decimal" placeholder="igual ao planejado" value="${it&&it.pago?moneyVal(it.valor):''}"></div>
      <div class="f"><label>Data do pagamento</label><input type="date" id="fData" value="${it?it.data||'':''}"></div></div>
      <button class="btn pri" data-act="salvarForm">Salvar</button>${del}`);
  }
  if (tipo==='reservas'){
    // destino: 'cof:<id>' para cofrinho ou um tipo de investimento
    const destIt = it ? (cofDe(it) ? 'cof:'+cofDe(it) : it.tipo) : (opcoes && opcoes.cof ? 'cof:'+opcoes.cof : S.cofrinhos.length ? 'cof:'+S.cofrinhos[0].id : 'Renda Fixa');
    form.v = { dest: destIt, retirada: it ? it.valor<0 : !!(opcoes && opcoes.retirada) };
    const destinos = [...S.cofrinhos.map(c=>['cof:'+c.id, `${c.emoji} ${c.nome}`]), ...TIPOS_INVEST.map(t=>[t, t==='Outros'?'📈 Outro investimento':'📈 '+t])];
    abrir(`${topo}<h2>${it?'Editar':form.v.retirada?'Retirar do cofrinho':'Guardar dinheiro'}</h2>
      <div class="f"><label>Valor</label><input class="money num" id="fValor" inputmode="decimal" placeholder="0,00" value="${moneyVal(it&&Math.abs(it.valor))}"></div>
      <div class="f"><label>Para onde</label><div class="chips" data-chips="dest">${destinos.map(([v,l])=>`<button type="button" class="${v===form.v.dest?'on':''}" data-v="${esc(v)}">${esc(l)}</button>`).join('')}<button type="button" class="novo-cof" data-act="novoCof">+ Novo cofrinho</button></div></div>
      <div class="switch f"><span>É uma retirada <small class="muted">(tirou dinheiro do cofrinho)</small></span><button type="button" class="tg ${form.v.retirada?'on':''}" data-act="tgRetirada"></button></div>
      <div class="f"><label>Onde está o dinheiro (opcional)</label><input id="fNome" placeholder="Ex.: Nubank, Tesouro, CDB" value="${esc(it?it.nome:'')}"></div>
      <div class="f"><label>Data</label><input type="date" id="fData" value="${it?it.data||'':dataPadrao()}"></div>
      <button class="btn pri" data-act="salvarForm">Salvar</button>${del}`);
  }
}
// Entrada parcelada: mostra o total e quando cai cada parcela (uma por mês, no mesmo dia).
function datasParcelasEntrada(base, n){
  const y = +base.slice(0,4), m = +base.slice(5,7) - 1, d = +base.slice(8,10);
  return Array.from({ length:n }, (_, i) => { const o = somaMeses(y, m, i); return key(o.y,o.m) + '-' + String(Math.min(d, diasNoMes(o.y,o.m))).padStart(2,'0'); });
}
function infoEntParc(){
  const el = document.getElementById('entParcInfo'); if (!el || !form) return;
  const n = +(document.getElementById('fEntParc')||{}).value || 2, v = parseValor((document.getElementById('fValor')||{}).value), base = (document.getElementById('fData')||{}).value || dataPadrao();
  const ds = datasParcelasEntrada(base, n);
  el.innerHTML = v ? `${n}x de ${brl(v)} = <b>${brl(v*n)}</b> · uma por mês: ${ds.slice(0,4).map(fmtData).join(', ')}${n>4?'…':''}` : 'Digite o valor de cada parcela.';
}
function infoParcelas(){
  const el = document.getElementById('parcInfo'); if (!el || !form) return;
  const n = +(document.getElementById('fParc')||{}).value || 1, v = parseValor((document.getElementById('fValor')||{}).value);
  const data = (document.getElementById('fData')||{}).value || dataPadrao(), c = cartaoPorId(form.v.cartao), pg = mesPagamento(data, key(cur.y,cur.m), c);
  const quando = c ? `na fatura que vence em ${fmtData(vencFatura(c, pg.y, pg.m))}` : `na fatura de ${MESES[pg.m]}`;
  el.textContent = form.v.forma!=='Crédito' ? '' : n>1 && v ? `${n}x de ${brl(v/n)} · a primeira entra ${quando}` : `Entra ${quando}`;
}
// Dividir um gasto entre categorias (ex.: compra do mercado com comida, limpeza e pet). A categoria marcada é a
// principal e fica com o que sobrar; as outras partes são digitadas. Ao salvar, vira um lançamento por categoria.
function desenharPartes(){
  const box = document.getElementById('divCatsLista'); if (!box || !form.v.partes) return;
  const opcoes = (atual) => catsVisiveis(atual).filter(c => c !== form.v.cat).map(c => `<option value="${esc(c)}" ${c===atual?'selected':''}>${esc(c)}</option>`).join('');
  box.innerHTML = `<div class="parte principal"><span>${form.v.cat ? esc(form.v.cat) : 'Escolha a categoria principal acima'}</span><b class="num" id="divCatsResto"></b></div>` +
    form.v.partes.map((pt, i) => `<div class="parte"><select data-partecat="${i}"><option value="">Categoria…</option>${opcoes(pt.cat)}</select>
      <input class="num" inputmode="decimal" placeholder="0,00" data-parte="${i}" value="${pt.valor ? moneyVal(pt.valor) : ''}"><button type="button" class="tirar" data-act="divCatsTirar" data-i="${i}" aria-label="Tirar esta parte">×</button></div>`).join('');
  infoPartes();
}
function infoPartes(){
  const info = document.getElementById('divCatsInfo'), resto = document.getElementById('divCatsResto'); if (!info || !form.v.partes) return;
  const total = parseValor((document.getElementById('fValor')||{}).value), r = total - soma(form.v.partes, p => p.valor || 0);
  if (resto) resto.textContent = total ? brl(Math.max(r, 0)) : '—';
  info.innerHTML = !total ? 'Digite o valor total da compra lá em cima.' : r > 0.004 ? `✓ ${form.v.cat ? esc(nomeCat(form.v.cat)) : 'A categoria principal'} fica com <b>${brl(r)}</b>.`
    : '<span style="color:var(--danger-ink)">⚠️ As partes passam do valor total.</span>';
}
function selecionarCat(c){
  form.v.cat = c;
  if (form.v.partes){ form.v.partes.forEach(p => { if (p.cat === c) p.cat = ''; }); desenharPartes(); }
  $sh.querySelectorAll('[data-catsel]').forEach(b=>b.classList.toggle('on', b.dataset.catsel===c));
  if (!form.id){ form.v.essencial = ehEssencial(c);
    $sh.querySelectorAll('[data-chips="essencial"] button').forEach(b=>b.classList.toggle('on', b.dataset.v===(form.v.essencial?'Sim':'Não'))); }
}

function salvarForm(){
  const {tipo,id,v,mk} = form; const g = (x)=>{ const el=document.getElementById(x); return el?el.value.trim():''; };
  const M = mk ? S.meses[mk] : mes(cur.y,cur.m,true);
  let obj;
  if (tipo==='entradas'){
    const valor=parseValor(g('fValor')); if(!valor) return toast('Informe o valor');
    if (!id && v.tipoEnt === 'Parcelado'){
      const n = Math.max(2, +g('fEntParc') || 2), nome = g('fNome') || 'Entrada', grupo = uid();
      datasParcelasEntrada(g('fData') || dataPadrao(), n).forEach((d, i) => {
        const o = ymDe(d.slice(0,7)); mes(o.y, o.m, true).entradas.push({ id:uid(), nome:`${nome} (${i+1}/${n})`, valor, data:d, fixa:false, grupo, parcela:i+1, de:n });
      });
      S.novosDesdeBackup = (S.novosDesdeBackup||0) + n; registrarDiaAtivo(); salvar(); fechar();
      aba = 'lanc'; subLanc = 'entradas'; render(); toast(`${n} parcelas de ${brl(valor)} lançadas ✓`); checarConquistas(); return;
    }
    obj = { nome:g('fNome')||'Entrada', valor, data:g('fData'), fixa:v.fixa };
  }
  if (tipo==='gastos'){
    const valor=parseValor(g('fValor')); if(!valor) return toast('Informe o valor');
    if (!v.cat) return toast('Escolha a categoria');
    const parcelas = v.forma==='Crédito' ? (+g('fParc')||1) : 1;
    const cartao = v.forma==='Crédito' && cartaoPorId(v.cartao) ? v.cartao : undefined;
    if (cartao) S.ultimoCartao = cartao;
    const tags = tagsDe(g('fTags'));
    obj = { cat:v.cat, forma:v.forma, valor, data:g('fData'), essencial:v.essencial, desc:g('fDesc'), parcelas, cartao, tags: tags.length ? tags : undefined };
    if (!id && v.partes){
      if (v.dividir) return toast('Divida entre categorias ou entre pessoas, uma coisa por vez');
      const ps = v.partes.filter(p => p.valor > 0);
      if (ps.some(p => !p.cat)) return toast('Escolha a categoria de cada parte');
      const resto = Math.round((valor - soma(ps, p => p.valor)) * 100) / 100;
      if (resto <= 0) return toast('As partes passam do valor total');
      if (ps.length){ const grupo = uid(); obj.valor = resto; obj.grupo = grupo;
        form.extras = ps.map(p => ({ ...obj, id:uid(), cat:p.cat, valor:p.valor, essencial:ehEssencial(p.cat), grupo })); }
    }
    if (!id && v.dividir){ const ps = nomesDe(g('fPessoas')); if (!ps.length) return toast('Com quem você dividiu?');
      obj.dividido = ps; obj.minha = Math.round(valor / (ps.length+1) * 100) / 100; }
    if (id){ const ant = M.gastos.find(x=>x.id===id); if (ant && ant.dividido && ant.valor) obj.minha = Math.round(ant.minha / ant.valor * valor * 100) / 100; }
  }
  if (tipo==='contas'){
    const nome=g('fNome'); if(!nome) return toast('Dê um nome para a conta');
    const planejado=parseValor(g('fPlan')); let valor=parseValor(g('fValor'));
    if (v.pago && !valor) valor = planejado;
    if (!planejado && !valor) return toast('Informe o valor planejado');
    const venc = Math.min(31, Math.max(0, parseInt(g('fVenc'))||0)) || '';
    obj = { nome, planejado, valor: v.pago?valor:0, pago:v.pago, data: v.pago?(g('fData')||dataHoje()):'', venc };
  }
  if (tipo==='reservas'){
    let valor=Math.abs(parseValor(g('fValor'))); if(!valor) return toast('Informe o valor');
    if (v.retirada) valor = -valor;
    const ehCof = v.dest.startsWith('cof:');
    obj = { tipo: ehCof ? 'Cofrinho' : v.dest, cof: ehCof ? v.dest.slice(4) : undefined, nome:g('fNome'), valor, data:g('fData') };
  }
  // Gastos, entradas e reservas ficam no mês da data informada (uma compra de agosto lançada em outubro vai para agosto,
  // e as parcelas contam a partir de lá). Contas pertencem ao mês da tela.
  const origK = mk || key(cur.y,cur.m), destK = tipo !== 'contas' && /^\d{4}-\d{2}-\d{2}$/.test(obj.data||'') ? obj.data.slice(0,7) : origK;
  const Md = destK === origK ? M : mes(ymDe(destK).y, ymDe(destK).m, true);
  if (id){ const i=M[tipo].findIndex(x=>x.id===id), novo = {...M[tipo][i], ...obj};
    if (Md !== M){ M[tipo].splice(i, 1); Md[tipo].push(novo); } else M[tipo][i] = novo; }
  else { Md[tipo].push({ id:uid(), ...obj }); S.novosDesdeBackup = (S.novosDesdeBackup||0) + 1; registrarDiaAtivo();
    if (tipo==='gastos' && obj.dividido) criarDivisao(Md.gastos[Md.gastos.length-1], destK);
    if (form.extras) Md.gastos.push(...form.extras); }
  const outroMes = destK !== key(cur.y,cur.m) ? MESES[ymDe(destK).m].toLowerCase() + (ymDe(destK).y !== cur.y ? ' de ' + ymDe(destK).y : '') : '';
  const nPartes = form.extras ? form.extras.length + 1 : 0;
  salvar(); fechar();
  if (aba==='lanc' && subLanc==='calendario') {} else if (tipo!=='contas'){ aba='lanc'; subLanc=tipo; } else aba='contas';
  render();
  toast(outroMes ? `Salvo em ${outroMes} ✓` : nPartes ? `Salvo em ${nPartes} categorias ✓` : tipo==='gastos' ? avisoOrcamento(obj.cat) : 'Salvo ✓');
  checarConquistas();
}
// Mensagem depois de lançar um gasto numa categoria com orçamento.
function avisoOrcamento(c){
  const l = limiteOrc(c, cur.y, cur.m); if (!l) return 'Salvo ✓';
  const v = calc(cur.y,cur.m).cats[c]||0, pct = v/l*100;
  if (pct > 100) return `⚠️ ${nomeCat(c)}: orçamento estourado em ${brl(v-l)}`;
  if (pct >= 80) return `Atenção: ${nomeCat(c)} em ${pct.toFixed(0)}% do orçamento`;
  return `Salvo ✓ · ${nomeCat(c)}: resta ${brl(l-v)}`;
}

// Tela de orçamentos: um campo por categoria, com a média dos últimos 3 meses como referência.
let orcCats = [];
function abrirOrcamentos(){
  const medias = {};
  orcCats = catsVisiveis(); Object.keys(S.orcamentos).forEach(c => { if (!orcCats.includes(c)) orcCats.push(c); });   // não perde limite de categoria escondida
  orcCats.forEach(c=>{ let t=0,n=0; for (let i=1;i<=3;i++){ const o=somaMeses(cur.y,cur.m,-i), v=calc(o.y,o.m).cats[c]||0; if (temDados(S.meses[key(o.y,o.m)])){ t+=v; n++; } } medias[c] = n ? t/n : 0; });
  const algumaMedia = Object.values(medias).some(v=>v>0);
  abrir(`<h2>Orçamento mensal por categoria</h2>
    <p class="note" style="margin:-6px 0 14px">Deixe em branco as categorias sem limite.${algumaMedia?' Abaixo de cada uma, a sua média dos últimos 3 meses.':''}</p>
    ${algumaMedia?'<button class="btn sec" data-act="orcMedia" style="margin-bottom:14px">Preencher com as minhas médias</button>':''}
    <div class="orclist">${orcCats.map((c,i)=>`<div class="orc"><span class="lbl">${emojiCat(c)} ${esc(nomeCat(c))}${medias[c]?`<small>média ${brl0(medias[c])}</small>`:''}</span>
      <input class="num" inputmode="decimal" data-orc="${i}" data-media="${Math.round(medias[c])}" placeholder="—" value="${S.orcamentos[c]?moneyVal(S.orcamentos[c]):''}"></div>`).join('')}</div>
    <div class="switch" style="margin-top:16px"><span><b>Acumular para o mês seguinte</b><br><small class="note">O que sobrar numa categoria aumenta o limite do mês seguinte. O que estourar, diminui.</small></span><button class="tg ${S.orcAcumular?'on':''}" data-act="orcAcum" aria-label="Acumular sobras"></button></div>
    <button class="btn pri" data-act="salvarOrc" style="margin-top:14px">Salvar orçamentos</button>`);
}

/* ---------- eventos ---------- */
let deferredPrompt = null;
window.addEventListener('beforeinstallprompt', e=>{ e.preventDefault(); deferredPrompt=e; });

document.addEventListener('click', e=>{
  const evo = e.target.closest('[data-evo]');
  if (evo){ evoSel = evo.dataset.evo; render(); return; }
  const t = e.target.closest('[data-act],[data-tab],[data-sub],[data-edit],[data-new],[data-pay],[data-chips] button:not([data-act]),[data-cat],[data-catsel],[data-rec],[data-cof],[data-dia],[data-impmodo],[data-cartao],[data-divida],[data-pessoa],[data-addpessoa],[data-setpessoa],[data-etiqueta],[data-addtag]');
  if (!t) return;
  if (DEMO && BLOQ_DEMO.has(t.dataset.act)) return toast('Na demonstração isso fica desligado. Compre para usar com seus dados 😉');
  if (t.parentElement && t.parentElement.dataset.chips && !t.dataset.act){
    const name = t.parentElement.dataset.chips;
    t.parentElement.querySelectorAll('button').forEach(b=>b.classList.toggle('on', b===t));
    form.v[name] = name==='essencial' ? t.dataset.v==='Sim' : name==='cartao' ? ((S.cartoes||[]).find(c=>c.nome===t.dataset.v)||{}).id : t.dataset.v;
    if (name==='cartao') infoParcelas();
    if (name==='tipoDiv'){ form.v.tipo = t.dataset.v; return; }
    if (name==='tipoEnt'){ form.v.fixa = t.dataset.v.startsWith('Fixo'); const b = document.getElementById('boxEntParc'); if (b) b.hidden = t.dataset.v !== 'Parcelado';
      const l = document.getElementById('lblEntValor'); if (l) l.textContent = t.dataset.v === 'Parcelado' ? 'Valor de cada parcela' : 'Valor'; infoEntParc(); return; }
    if (name==='jurosAno'){ form.v.jurosAno = t.dataset.v==='ano'; return; }
    if (name==='metodo'){ form.v.metodo = t.dataset.v; desenharPlano(); return; }
    if (name==='pag'){ form.v.credito = t.dataset.v==='credito'; document.getElementById('sBoxParc').hidden = !form.v.credito; atualizarSimulacao(); return; }
    if (name==='forma'){ const bp = document.getElementById('boxParc'); if (bp) bp.hidden = form.v.forma!=='Crédito';
      const bc = document.getElementById('boxCartao'); if (bc) bc.hidden = form.v.forma!=='Crédito' || !(S.cartoes||[]).length; infoParcelas(); if (form.v.forma==='Crédito') toast('Crédito: entra na fatura do mês seguinte'); }
    return;
  }
  if (t.dataset.catsel){ selecionarCat(t.dataset.catsel); return; }
  if (t.dataset.rec){
    const g = form.rec[+t.dataset.rec]; selecionarCat(g.cat);
    form.v.forma = g.forma; $sh.querySelectorAll('[data-chips="forma"] button').forEach(b=>b.classList.toggle('on', b.dataset.v===g.forma));
    document.getElementById('boxParc').hidden = g.forma!=='Crédito';
    document.getElementById('fDesc').value = g.desc||'';
    form.v.essencial = !!g.essencial; $sh.querySelectorAll('[data-chips="essencial"] button').forEach(b=>b.classList.toggle('on', b.dataset.v===(g.essencial?'Sim':'Não')));
    const iv = document.getElementById('fValor'); if (!iv.value) iv.focus();
    return;
  }
  if (t.dataset.cat){ abrirCategoria(t.dataset.cat); return; }
  if (t.dataset.cof){ abrirCofrinho(t.dataset.cof); return; }
  if (t.dataset.tab){ fechar(); aba=t.dataset.tab; render(); scrollTo(0,0); return; }
  if (t.dataset.sub){ subLanc=t.dataset.sub; render(); return; }
  if (t.dataset.cartao && !t.closest('[data-chips]')){ editarCartao(t.dataset.cartao); return; }
  if (t.dataset.divida){ abrirDivida(t.dataset.divida); return; }
  if (t.dataset.pessoa){ abrirPessoa(t.dataset.pessoa); return; }
  if (t.dataset.etiqueta){ abrirEtiqueta(t.dataset.etiqueta); return; }
  if (t.dataset.addtag){ const i = document.getElementById('fTags'), atuais = tagsDe(i.value); if (!atuais.includes(t.dataset.addtag)) i.value = [...atuais, t.dataset.addtag].join(', '); return; }
  if (t.dataset.addpessoa){ const i = document.getElementById('fPessoas'), atuais = nomesDe(i.value); if (!atuais.includes(t.dataset.addpessoa)) i.value = [...atuais, t.dataset.addpessoa].join(', '); infoDivisao(); return; }
  if (t.dataset.setpessoa){ document.getElementById('rPessoa').value = t.dataset.setpessoa; return; }
  if (t.dataset.impmodo){ imp.modo = t.dataset.impmodo; prepararImportacao(); const top = $sh.scrollTop; desenharImportacao(); $sh.scrollTop = top; return; }
  if (t.dataset.dia){ calSel = { k:key(cur.y,cur.m), d:+t.dataset.dia }; render(); return; }
  if (t.dataset.edit){ abrirForm(t.dataset.edit, t.dataset.id, t.dataset.mk); return; }
  if (t.dataset.new){ const v = document.getElementById('fValor'); const val = v ? v.value : ''; abrirForm(t.dataset.new); const n = document.getElementById('fValor'); if (n && val) n.value = val; return; }
  if (t.dataset.pay){
    const M = mes(cur.y,cur.m,true), c = M.contas.find(x=>x.id===t.dataset.pay);
    c.pago = !c.pago;
    if (c.pago){ if(!c.valor) c.valor = c.planejado; c.data = c.data || dataHoje(); registrarDiaAtivo(); } else { c.valor = 0; c.data=''; }
    salvar(); render(); checarConquistas(); return;
  }
  const a = t.dataset.act;
  if (a==='fechar'){ fechar(); return; }
  if (a==='passoEntrada'){ abrirForm('entradas'); return; }
  if (a==='passoGasto'){ abrirForm('gastos'); return; }
  if (a==='passoConta'){ aba = 'contas'; render(); window.scrollTo(0, 0); setTimeout(() => abrirForm('contas'), 150); return; }
  if (a==='passoLembrete'){ if (!suportaPush()){ S.passoLembretePulado = true; salvar(); render(); return toast(/iphone|ipad/i.test(navigator.userAgent) ? 'No iPhone, os lembretes funcionam com o app instalado na tela de início' : 'Este navegador não permite lembretes'); }
    aba = 'ajustes'; render(); setTimeout(() => { const h = [...document.querySelectorAll('.card h3')].find(x => x.textContent.trim() === 'Notificações'); if (h) window.scrollTo(0, h.closest('.card').getBoundingClientRect().top + scrollY - 80); }, 100); return; }
  if (a==='passosFechar'){ S.passosFechado = true; salvar(); render(); return; }
  if (a==='modoCompleto'){ S.modoSimples = false; salvar(); render(); toast('Tela completa ✓ Dá para voltar ao modo simples em Ajustes.'); return; }
  if (a==='modoSimplesVoltar'){ S.modoSimples = true; S.simplesDesde = new Date().toISOString(); S.avisoCompleto = false; salvar(); render(); return; }
  if (a==='avisoCompletoOk'){ S.avisoCompleto = false; salvar(); render(); return; }
  if (a==='modoSimplesTg'){ S.modoSimples = !S.modoSimples; if (S.modoSimples) S.simplesDesde = new Date().toISOString(); S.avisoCompleto = false; t.classList.toggle('on', S.modoSimples); salvar(); toast(S.modoSimples ? 'Modo simples ligado' : 'Tela completa'); return; }
  if (a==='excluirConta'){ abrirExcluirConta(); return; }
  if (a==='excluirConfirmar'){ excluirConta(t); return; }
  if (a==='orcAcum'){ S.orcAcumular = S.orcAcumular ? null : { desde: key(prevYM(hoje.getFullYear(), hoje.getMonth()).y, prevYM(hoje.getFullYear(), hoje.getMonth()).m) }; t.classList.toggle('on', !!S.orcAcumular); salvar(); render(); toast(S.orcAcumular ? 'Sobras passam a acumular a partir deste mês ✓' : 'Acúmulo desligado'); return; }
  if (a==='tom'){ S.tom = t.dataset.v; salvar(); render(); toast(S.tom === 'sincero' ? 'Modo sincero ligado 😏' : 'Modo gentil ligado 🙂'); return; }
  if (a==='rendaVariavel'){ abrirRendaVariavel(); return; }
  if (a==='salvarRenda'){ const v = parseValor(document.getElementById('rvSegura').value); if (!(v > 0)) return toast('Informe a renda segura'); S.rendaVariavel = { ativo:true, segura:v }; salvar(); fechar(); render(); toast('Renda variável ativada ✓'); return; }
  if (a==='desligarRenda'){ S.rendaVariavel = { ...(S.rendaVariavel||{}), ativo:false }; salvar(); fechar(); render(); toast('Renda variável desligada'); return; }
  if (a==='guardarExcedente'){ const v = +t.dataset.v; abrirForm('reservas'); setTimeout(() => { const i = document.getElementById('fValor'); if (i) i.value = moneyVal(v); }, 60); return; }
  if (a==='organizar'){ abrirOrganizar(); return; }
  if (a==='orgCat'){ const g = mes(cur.y,cur.m).gastos.find(x => x.id === t.dataset.id); if (g){ g.cat = t.dataset.c; g.essencial = ehEssencial(g.cat); salvar(); } abrirOrganizar(); return; }
  if (a==='colar'){ abrirColar(); return; }
  if (a==='colarLancar'){ lancarTexto(document.getElementById('cTexto').value); return; }
  if (a==='colarLer'){ navigator.clipboard.readText().then(x => { document.getElementById('cTexto').value = x; if (interpretarTextoBanco(x)) lancarTexto(x); else toast('Não encontrei um valor (R$) no que você copiou'); }).catch(() => toast('Não consegui ler. Toque no campo e use Colar.')); return; }
  if (a==='semana'){ abrirSemana(); return; }
  if (a==='analise'){ aba = 'analise'; render(); scrollTo(0,0); return; }
  if (a==='catsToggle'){ catsAbertas = !catsAbertas; render(); return; }
  if (a==='ajuda'){ abrirAjuda(); return; }
  if (a==='listaAbrir'){ abrirLista(); return; }
  if (a==='listaDispensar'){ S.listaDispensada = new Date().toISOString(); salvar(); render(); toast('Tudo bem! Se mudar de ideia, está em Ajustes.'); return; }
  if (a==='listaPreco'){ listaSel.preco = t.dataset.v; document.querySelectorAll('#lPreco button').forEach(b=>b.classList.toggle('on', b===t)); return; }
  if (a==='listaBanco'){ const v = t.dataset.v, i = listaSel.bancos.indexOf(v); i<0 ? listaSel.bancos.push(v) : listaSel.bancos.splice(i,1); t.classList.toggle('on', i<0); return; }
  if (a==='listaEntrar'){ entrarLista(t); return; }
  if (a==='nuvemAtivar'){ abrirAtivarNuvem(); return; }
  if (a==='nuvemConfirmar'){ confirmarNuvem(t); return; }
  if (a==='nuvemRestaurar'){ abrirRestaurarNuvem(false); return; }
  if (a==='nuvemRecuperar'){ recuperarNuvem(t); return; }
  if (a==='nuvemDesligar'){ desligarNuvem(); return; }
  if (a==='nuvemAgora'){ const cfg = lerNuvem(); if (!cfg) return; t.disabled = true; t.textContent = 'Enviando…';
    enviarNuvem(cfg).then(() => { render(); toast('Backup na nuvem feito ✓'); })
      .catch(e => { t.disabled = false; t.textContent = '☁️ Fazer backup na nuvem agora'; toast(e.message === 'grande' ? 'Seus dados são grandes demais para a nuvem. Use o backup em arquivo.' : 'Não foi possível enviar. Confira a internet.'); }); return; }
  if (a==='ajudaTour'){ fechar(); setTimeout(iniciarTour, 250); return; }
  if (a==='depoimento'){ abrirDepoimento(); return; }
  if (a==='npsNota'){ npsNota(+t.dataset.v); return; }
  if (a==='npsEnviar'){ enviarNps(); return; }
  if (a==='npsDepois'){ S.nps = { ...(S.nps||{}), vezes:((S.nps||{}).vezes||0)+1, depoisDe: new Date(Date.now()+14*864e5).toISOString() }; salvar(); fechar(); return; }
  if (a==='plus'){ abrirPlus(); return; }
  if (a==='plusConviteVer'){ S.plusAvisoVisto = true; salvar(); render(); abrirPlus(); return; }
  if (a==='plusConviteDepois'){ S.plusAvisoVisto = true; salvar(); render(); return; }
  if (a==='plusPedir'){ plusPedir(t); return; }
  if (a==='plusEntrar'){ plusEntrar(t); return; }
  if (a==='plusSair'){ plusApi({ acao:'sair' }).catch(()=>{}); syncGuardar(null); plusGuardar(null); fechar(); render(); toast('Você saiu do Plus neste aparelho'); return; }
  if (a==='syncLigar'){ ligarSync(t); return; }
  if (a==='waConectar'){ conectarWhatsApp(t); return; }
  if (a==='waLembretes'){ S.waLembretes = S.waLembretes === false; salvar(); toast(S.waLembretes ? 'Lembretes ligados 🔔' : 'Lembretes desligados'); abrirPlus(); return; }
  if (a==='waDesligar'){ if (!confirm('Desconectar o WhatsApp do Tino?')) return; plusApi({ acao:'waDesligar' }).then(() => { toast('WhatsApp desconectado'); abrirPlus(); }); return; }
  if (a==='syncJuntar'){ rodarPrimeiraSync('juntar'); return; }
  if (a==='syncNuvem'){ rodarPrimeiraSync('nuvem'); return; }
  if (a==='syncAgora'){ t.disabled = true; t.textContent = 'Sincronizando…'; syncAgora(undefined, true).then(ok => { toast(ok ? 'Sincronizado ✓' : 'Não foi possível sincronizar agora'); abrirPlus(); }); return; }
  if (a==='syncDesligar'){ if (!confirm('Desligar a sincronização neste aparelho? Seus dados continuam aqui e no servidor.')) return; syncGuardar(null); abrirPlus(); toast('Sincronização desligada neste aparelho'); return; }
  if (a==='indique'){ abrirIndique(); return; }
  if (a==='indiqueOcultar'){ S.indiqueOculto = true; salvar(); render(); return; }
  if (a==='indiqueEnviar'){ const txt = textoConvite();
    if (navigator.share) navigator.share({ text: txt }).catch(()=>{});
    else navigator.clipboard.writeText(txt).then(()=>toast('Convite copiado. Cole no WhatsApp.')).catch(()=>toast('Não foi possível copiar.'));
    return; }
  if (a==='indiqueCopiar'){ navigator.clipboard.writeText(LINK_INDIQUE + indique.codigo).then(()=>toast('Link copiado ✓')).catch(()=>toast('Não foi possível copiar.')); return; }
  if (a==='indiqueUsar'){ abrirUsarIndicacao(); return; }
  if (a==='indiqueConfirmar'){ confirmarIndicacao(t); return; }
  if (a==='categorias'){ abrirCategorias(); return; }
  if (a==='catNova'){ abrirCatForm(-1); return; }
  if (a==='catEditar'){ abrirCatForm(+t.dataset.i); return; }
  if (a==='catEmoji'){ catEd.emoji = t.dataset.e; $sh.querySelectorAll('[data-act="catEmoji"]').forEach(b => b.classList.toggle('on', b === t)); return; }
  if (a==='catEss'){ catEd.ess = !catEd.ess; t.classList.toggle('on', catEd.ess); return; }
  if (a==='catSalvar'){ salvarCatForm(); return; }
  if (a==='catApagar'){ apagarCatForm(); return; }
  if (a==='catOcultar'){ const c = t.dataset.c, oc = S.catsOcultas = S.catsOcultas || [];
    if (oc.includes(c)) oc.splice(oc.indexOf(c), 1); else oc.push(c);
    t.classList.toggle('on', !oc.includes(c)); salvar(); return; }
  if (a==='depoNota'){ depoNota(+t.dataset.v); return; }
  if (a==='depoEnviar'){ enviarDepoimento(); return; }
  if (a==='depoDepois'){ S.depo = { ...(S.depo||{}), vezes:((S.depo||{}).vezes||0)+1, depoisDe: new Date(Date.now()+10*864e5).toISOString() }; salvar(); fechar(); return; }
  if (a==='depoNunca'){ S.depo = { ...(S.depo||{}), nunca:true }; salvar(); fechar(); return; }
  if (a==='limparBusca'){ busca=''; render(); }
  else if (a==='prev'){ cur = prevYM(cur.y,cur.m); evoSel=null; render(); }
  else if (a==='next'){ cur = nextYM(cur.y,cur.m); evoSel=null; render(); }
  else if (a==='add'){ abrirForm(aba==='contas'?'contas': aba==='lanc'?subLanc:'gastos'); }
  else if (a==='addConta'){ abrirForm('contas'); }
  else if (a==='salvarForm'){ salvarForm(); }
  else if (a==='tgPago'){ form.v.pago=!form.v.pago; t.classList.toggle('on',form.v.pago); }
  else if (a==='tgFixa'){ form.v.fixa=!form.v.fixa; t.classList.toggle('on',form.v.fixa); }
  else if (a==='excluir'){
    const M = form.mk ? S.meses[form.mk] : mes(cur.y,cur.m,true);
    const it = M[form.tipo].find(x=>x.id===form.id);
    if (!confirm(it && ehParcelado(it) ? `Excluir esta compra e todas as ${it.parcelas} parcelas?` : 'Excluir este lançamento?')) return;
    M[form.tipo] = M[form.tipo].filter(x=>x.id!==form.id);
    if (form.tipo==='gastos') S.aReceber = (S.aReceber||[]).filter(r => r.recebido || r.gastoId !== form.id);
    salvar(); fechar(); render(); toast('Excluído');
  }
  else if (a==='copiarContas'){
    const p = prevYM(cur.y,cur.m), Mp = mes(p.y,p.m), M = mes(cur.y,cur.m,true);
    const existentes = new Set(M.contas.map(c=>c.nome.toLowerCase()));
    let n=0; Mp.contas.forEach(c=>{ if(existentes.has(c.nome.toLowerCase())) return;
      M.contas.push({ id:uid(), nome:c.nome, planejado:c.planejado||c.valor, valor:0, pago:false, data:'', venc:c.venc||'' }); n++; });
    salvar(); render(); toast(n ? n+' contas copiadas' : 'Essas contas já estão no mês');
  }
  else if (a==='orcamentos'){ abrirOrcamentos(); }
  else if (a==='orcMedia'){ $sh.querySelectorAll('[data-orc]').forEach(i=>{ if (!i.value && +i.dataset.media) i.value = (+i.dataset.media).toLocaleString('pt-BR'); }); }
  else if (a==='salvarOrc'){
    const novo = {}; $sh.querySelectorAll('[data-orc]').forEach(i=>{ const v = parseValor(i.value); if (v>0) novo[orcCats[+i.dataset.orc]] = v; });
    S.orcamentos = novo; salvar(); fechar(); render(); toast('Orçamentos salvos ✓');
  }
  else if (a==='salvarOrcCat'){
    const v = parseValor(document.getElementById('oCat').value), c = t.dataset.c;
    if (v>0) S.orcamentos[c] = v; else delete S.orcamentos[c];
    salvar(); fechar(); render(); toast(v>0 ? 'Orçamento salvo ✓' : 'Limite removido');
  }
  else if (a==='salvarPerfil'){
    S.perfil.nome = document.getElementById('pNome').value.trim(); S.perfil.pronome = document.getElementById('pPron').value;
    salvar(); render(); toast('Perfil salvo ✓');
  }
  else if (a==='tema'){ S.tema = t.dataset.v; salvar(); aplicarTema(); render(); }
  else if (a==='carry'){ S.carry=!S.carry; salvar(); render(); }
  else if (a==='instalar'){
    if (deferredPrompt){ deferredPrompt.prompt(); deferredPrompt.userChoice.finally(()=>{deferredPrompt=null;}); }
    else toast('Use o menu do navegador → Instalar app');
  }
  else if (a==='exportar'){ fazerBackup(); }
  else if (a==='exportarCsv'){ exportarCsv(); }
  else if (a==='sair'){ sairDaConta(); }
  else if (a==='aparelhos'){ abrirAparelhos(); }
  else if (a==='removerAp'){ if (confirm(`Remover “${t.dataset.nome}” da sua conta?`)) carregarAparelhos('remover', t.dataset.alvo); }
  else if (a==='fecharDicaTransf'){ S.dicaTransfFechada = true; salvar(); render(); }
  else if (a==='adiarBackup'){ S.backupAdiado = new Date().toISOString(); salvar(); render(); toast('Vamos lembrar de novo em 3 dias'); }
  else if (a==='importar'){ document.getElementById('fileImp').click(); }
  else if (a==='zerar'){
    if (!confirm('Apagar TODOS os dados deste aparelho? Isso não pode ser desfeito.')) return;
    const lib = S.liberado, conta = S.conta; S = novoEstado(); S.liberado = lib; S.conta = conta; salvar(); aba='resumo'; render();
  }
  else if (a==='onbOk'){
    const v=(i)=>document.getElementById(i).value.trim();
    if (!v('oNome')) return toast('Como podemos te chamar?');
    S.perfil = { nome:v('oNome'), pronome:document.getElementById('oPron').value, metaNome:v('oMeta'),
      metaValor:parseValor(v('oMetaV')), reservaMeta:parseValor(v('oRes')), ok:true };
    S.cofrinhos = [];
    if (S.perfil.reservaMeta > 0) S.cofrinhos.push({ id:'reserva', nome:'Reserva de emergência', emoji:'🛟', alvo:S.perfil.reservaMeta, prazo:'' });
    if (S.perfil.metaValor > 0 || S.perfil.metaNome) S.cofrinhos.push({ id:'meta', nome:S.perfil.metaNome||'Minha meta', emoji:'🎯', alvo:S.perfil.metaValor, prazo:'' });
    S.modoSimples = true; S.simplesDesde = new Date().toISOString();
    S.tourVisto = false; S.versaoVista = APP_VERSAO; aba = 'resumo'; salvar(); render(); iniciarTour();
  }
  else if (a==='fecharNovidades'){ S.versaoVista = APP_VERSAO; salvar(); fechar(); }
  else if (a==='novoCof'){ editarCofrinho(); }
  else if (a==='editarCof'){ editarCofrinho(t.dataset.cofId); }
  else if (a==='salvarCof'){ salvarCofrinho(); }
  else if (a==='excluirCof'){ excluirCofrinho(); }
  else if (a==='guardarCof'){ abrirForm('reservas', null, null, { cof:t.dataset.cofId }); }
  else if (a==='retirarCof'){ abrirForm('reservas', null, null, { cof:t.dataset.cofId, retirada:true }); }
  else if (a==='tgRetirada'){ form.v.retirada=!form.v.retirada; t.classList.toggle('on',form.v.retirada); }
  else if (a==='ouvir'){ ouvirFrase(t); }
  else if (a==='retro'){ abrirRetro(+t.dataset.y, +t.dataset.m); }
  else if (a==='retroAno'){ abrirRetroAno(+t.dataset.ano); }
  else if (a==='olho'){ S.ocultar = !S.ocultar; salvar(); render(); toast(S.ocultar ? 'Valores escondidos 👁️' : 'Valores visíveis'); }
  else if (a==='criarSenha' || a==='trocarSenha'){ telaPin('criar'); }
  else if (a==='removerSenha'){ if (confirm('Remover a senha do app?')){ delete S.seguranca; salvar(); render(); toast('Senha removida'); } }
  else if (a==='bio'){
    if (S.seguranca.bio){ delete S.seguranca.bio; salvar(); render(); }
    else bioCadastrar().then(()=>{ toast('Face ID/digital ativado ✓'); render(); }).catch(()=>toast('Não foi possível ativar neste aparelho.'));
  }
  else if (a==='assinaturas'){ abrirAssinaturas(); }
  else if (a==='ignorarAssin'){ S.assinIgnoradas = [...new Set([...(S.assinIgnoradas||[]), t.dataset.chave])]; salvar(); render(); abrirAssinaturas(); toast('Removido da lista'); }
  else if (a==='restaurarAssin'){ S.assinIgnoradas = []; salvar(); render(); abrirAssinaturas(); }
  else if (a==='importarExtrato'){ let f = document.getElementById('fileExtrato'); if (!f){ f = document.createElement('input'); f.type = 'file'; f.id = 'fileExtrato'; f.hidden = true; document.body.appendChild(f); } f.value = ''; f.click(); }
  else if (a==='confirmarImp'){ confirmarImportacao(); }
  else if (a==='notif'){ alternarNotif(t.dataset.tipo); }
  else if (a==='notifTeste'){ testarNotif(); }
  else if (a==='possoComprar'){ abrirPossoComprar(); }
  else if (a==='tagAtiva'){ const tg = t.dataset.tag; S.tagAtiva = S.tagAtiva === tg ? null : tg; salvar(); render(); if (form === null && document.getElementById('overlay').classList.contains('open')) abrirEtiqueta(tg); toast(S.tagAtiva ? `Gastos novos serão marcados com “${tg}”` : 'Etiqueta desligada'); }
  else if (a==='renomearTag'){ const velho = t.dataset.tag, novo = normTag(prompt('Novo nome da etiqueta:', velho)); if (!novo || novo === velho) return;
    Object.values(S.meses).forEach(M => M.gastos.forEach(g => { if ((g.tags||[]).includes(velho)) g.tags = [...new Set(g.tags.map(x => x === velho ? novo : x))]; }));
    if (S.tagAtiva === velho) S.tagAtiva = novo; salvar(); render(); abrirEtiqueta(novo); toast('Etiqueta renomeada ✓'); }
  else if (a==='removerTag'){ const tg = t.dataset.tag; if (!confirm(`Remover a etiqueta “${tg}” de todos os gastos? Os gastos continuam lançados.`)) return;
    Object.values(S.meses).forEach(M => M.gastos.forEach(g => { if (g.tags){ g.tags = g.tags.filter(x => x !== tg); if (!g.tags.length) delete g.tags; } }));
    if (S.tagAtiva === tg) S.tagAtiva = null; salvar(); fechar(); render(); toast('Etiqueta removida'); }
  else if (a==='novoAReceber'){ novoAReceber(); }
  else if (a==='salvarAReceber'){ salvarAReceber(); }
  else if (a==='tgEmprestei'){ form.v.emprestei = !form.v.emprestei; t.classList.toggle('on', form.v.emprestei); }
  else if (a==='divCats'){
    if (form.v.partes){ form.v.partes = null; document.getElementById('boxDivCats').hidden = true; t.textContent = '➗ Dividir entre categorias'; return; }
    if (!form.v.cat) return toast('Escolha primeiro a categoria principal');
    form.v.partes = [{ cat:'', valor:0 }]; document.getElementById('boxDivCats').hidden = false; t.textContent = 'Cancelar divisão'; desenharPartes();
  }
  else if (a==='divCatsMais'){ form.v.partes.push({ cat:'', valor:0 }); desenharPartes(); }
  else if (a==='divCatsTirar'){ form.v.partes.splice(+t.dataset.i, 1); if (!form.v.partes.length) form.v.partes.push({ cat:'', valor:0 }); desenharPartes(); }
  else if (a==='tgDividir'){ form.v.dividir = !form.v.dividir; t.classList.toggle('on', form.v.dividir); document.getElementById('boxDividir').hidden = !form.v.dividir; if (form.v.dividir) document.getElementById('fPessoas').focus(); }
  else if (a==='receber'){ receber(t.dataset.ids.split(',')); }
  else if (a==='editarReceber'){ novoAReceber(t.dataset.id); }
  else if (a==='voltarPessoa'){ abrirPessoa(t.dataset.pessoaNome); }
  else if (a==='cobrarEnviar'){ cobrar(t.dataset.pessoaNome, [...document.querySelectorAll('[data-cobrar]:checked')].map(c => c.dataset.cobrar)); }
  else if (a==='receberParteAbrir'){ document.getElementById('boxRecParte').hidden = false; t.hidden = true; document.getElementById('recParte').focus(); }
  else if (a==='receberParte'){ receberParte(t.dataset.pessoaNome, parseValor(document.getElementById('recParte').value)); }
  else if (a==='excluirReceber'){ const r = (S.aReceber||[]).find(x => x.id === t.dataset.id); if (!r || !confirm(`Excluir "${r.desc}" (${brl(r.valor)}) de ${r.pessoa}?`)) return;
    S.aReceber = S.aReceber.filter(x => x.id !== r.id); salvar(); render(); abrirPessoa(r.pessoa); toast('Excluído'); }
  else if (a==='fatAbrir'){ abrirFatura(t.dataset.c); }
  else if (a==='fatCheck'){ abrirFatura(t.dataset.c); }
  else if (a==='fatPagar'){ pagarFatura(t.dataset.c, undefined, (document.getElementById('fatData')||{}).value); }
  else if (a==='fatSalvarData'){ const d = (document.getElementById('fatData')||{}).value, reg = statusFatura(t.dataset.c, cur.y, cur.m);
    if (reg && d){ reg.em = d; salvar(); render(); fechar(); toast('Data do pagamento salva ✓'); } }
  else if (a==='fatParcialAbrir'){ document.getElementById('boxFatParcial').hidden = false; t.hidden = true; document.getElementById('fatPago').focus(); }
  else if (a==='fatParcial'){ const v = parseValor(document.getElementById('fatPago').value); if (!(v > 0)) return toast('Digite quanto você pagou'); pagarFatura(t.dataset.c, v, (document.getElementById('fatData')||{}).value); }
  else if (a==='fatDesfazer'){ desfazerFatura(t.dataset.c); }
  else if (a==='cobrar'){ abrirCobrar(t.dataset.pessoaNome); }
  else if (a==='tgLancarRec'){ S.lancarRecebidos = S.lancarRecebidos === false; salvar(); t.classList.toggle('on', S.lancarRecebidos !== false); }
  else if (a==='meDevem'){ abrirPessoa(t.dataset.pessoaNome); }
  else if (a==='novaDivida'){ editarDivida(); }
  else if (a==='editarDivida'){ editarDivida(t.dataset.dividaId); }
  else if (a==='salvarDivida'){ salvarDivida(); }
  else if (a==='excluirDivida'){ if (confirm('Excluir esta dívida? Os pagamentos lançados como gasto continuam.')){ S.dividas = S.dividas.filter(x=>x.id!==form.id); salvar(); fechar(); render(); toast('Dívida excluída'); } }
  else if (a==='pagarDivida'){ pagarDivida(t.dataset.dividaId); }
  else if (a==='tgExtra'){ form.v.extra = !form.v.extra; t.classList.toggle('on', form.v.extra); }
  else if (a==='tgLancar'){ form.v.lancar = !form.v.lancar; t.classList.toggle('on', form.v.lancar); }
  else if (a==='confirmarPagamento'){ confirmarPagamento(); }
  else if (a==='planoQuitacao'){ abrirPlanoQuitacao(); }
  else if (a==='usarIdeal'){ const c = cofPorId(t.dataset.cofId); c.alvo = reservaIdeal(+t.dataset.meses); salvar(); render(); abrirCofrinho(c.id); toast('Meta da reserva atualizada ✓'); }
  else if (a==='criarReserva'){ if (!cofPorId('reserva')) S.cofrinhos.unshift({ id:'reserva', nome:'Reserva de emergência', emoji:'🛟', alvo:reservaIdeal(6), prazo:'' }); salvar(); render(); abrirCofrinho(cofReserva().id); toast('Reserva criada ✓'); checarConquistas(); }
  else if (a==='abrirReserva'){ abrirCofrinho(cofReserva().id); }
  else if (a==='novoCartao'){ editarCartao(); }
  else if (a==='salvarCartao'){ salvarCartao(); }
  else if (a==='excluirCartao'){ excluirCartao(); }
  else if (a==='maisDicas'){ dicasAbertas = !dicasAbertas; render(); }
  else if (a==='guardarAgora'){ const C = calc(hoje.getFullYear(), hoje.getMonth()); abrirForm('reservas'); document.getElementById('fValor').value = moneyVal(Math.round(C.renda*0.1/10)*10); }
  else if (a==='simFechar'){ fechar(); }
  else if (a==='simLancar'){
    const valor = parseValor(document.getElementById('sValor').value), nome = document.getElementById('sNome').value.trim(), credito = form.v.credito, n = credito ? +document.getElementById('sParc').value : 1;
    abrirForm('gastos'); document.getElementById('fValor').value = moneyVal(valor); if (nome) document.getElementById('fDesc').value = nome;
    if (nome){ const c = categorizar(nome); if (c.cat) selecionarCat(c.cat); }
    if (credito){ form.v.forma = 'Crédito'; $sh.querySelectorAll('[data-chips="forma"] button').forEach(b=>b.classList.toggle('on', b.dataset.v==='Crédito')); document.getElementById('boxParc').hidden = false; document.getElementById('fParc').value = String(n); infoParcelas(); }
  }
  else if (a==='simCofrinho'){
    const valor = parseValor(document.getElementById('sValor').value), nome = document.getElementById('sNome').value.trim() || 'Minha compra';
    const r = simularCompra(valor, form.v.credito, 1), q = somaMeses(hoje.getFullYear(), hoje.getMonth(), r.mesesJuntando);
    editarCofrinho(null, { nome, emoji:'🎯', alvo:valor, prazo:key(q.y,q.m) });
  }
  else if (a==='verTour'){ aba = 'resumo'; render(); iniciarTour(); }
  else if (a==='liberar'){
    const c = document.getElementById('aCod').value.trim();
    if (!c) return toast('Digite o e-mail da compra');
    fetch('api/liberar', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({codigo:c, aparelho:idAparelho(), nome:nomeAparelho()}) })
      .then(r => r.json().then(d => ({ok:r.ok, d})))
      .then(({ok,d}) => { if (ok && d.ok) entrarNaConta(c); else toast(d.erro || 'Código inválido'); })
      .catch(() => toast('Sem internet. Conecte-se para liberar o acesso.'));
  }
});

// Nome amigável deste aparelho para a lista de "Aparelhos conectados".
function nomeAparelho(){
  const ua = navigator.userAgent;
  const instalado = navigator.standalone || matchMedia('(display-mode: standalone)').matches;
  const sist = /iphone/i.test(ua) ? 'iPhone' : /ipad/i.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1) ? 'iPad'
    : /android/i.test(ua) ? 'Android' : /windows/i.test(ua) ? 'Computador Windows' : /mac os/i.test(ua) ? 'Mac' : 'Computador';
  if (instalado) return `${sist} · App instalado`;
  const nav = /SamsungBrowser/.test(ua) ? 'Samsung Internet' : /Edg/.test(ua) ? 'Edge' : /CriOS|Chrome/.test(ua) ? 'Chrome'
    : /FxiOS|Firefox/.test(ua) ? 'Firefox' : /Safari/.test(ua) ? 'Safari' : 'Navegador';
  return `${sist} · ${nav}`;
}
const apiAparelhos = (dados) => fetch('api/aparelhos', { method:'POST', headers:{'Content-Type':'application/json'},
  body: JSON.stringify({ conta:S.conta, aparelho:idAparelho(), nome:nomeAparelho(), lancou: (S.diasAtivos || []).length > 0, ...dados }) })
  .then(r => r.json().then(d => ({ status:r.status, d })));

// Ao abrir com internet (no máximo uma vez por dia), confere se este aparelho ainda tem acesso.
// Desconecta se foi removido pelo dono, se o acesso foi excluído ou reembolsado. Erros de rede são ignorados.
function verificarAcesso(){
  if (!CONFIG.exigirCodigo || !S.liberado || !S.conta || !navigator.onLine) return;
  if (S.verificadoEm && Date.now() - new Date(S.verificadoEm).getTime() < 24*3600e3) return;
  apiAparelhos({ acao:'verificar' }).then(({status,d}) => {
    if (status === 403) desconectar(d.motivo === 'removido'
      ? 'Este aparelho foi removido da sua conta. Para usar aqui de novo, entre com seu e-mail.'
      : 'Seu acesso não está mais ativo. Se acha que é um engano, fale com o suporte.');
    else if (d && d.ok){ S.verificadoEm = new Date().toISOString(); salvar(); }
  }).catch(()=>{});
}
function desconectar(msg){
  try { localStorage.setItem(CONTA_KEY(S.conta), JSON.stringify({ ...S, liberado:false, verificadoEm:null })); } catch(e){}
  S = novoEstado(); fechar(); aba = 'resumo'; salvar(); render(); alert(msg);
}

// Lista de aparelhos conectados (Ajustes → Conta).
function abrirAparelhos(){
  abrir(`<h2>Aparelhos conectados</h2><div id="listaAp"><div class="empty">Carregando…</div></div>`);
  carregarAparelhos();
}
function carregarAparelhos(acao, alvo){
  const box = () => document.getElementById('listaAp');
  apiAparelhos(acao ? { acao, alvo } : { acao:'listar' }).then(({status,d}) => {
    if (!box()) return;
    if (status === 403) return desconectar('Este aparelho não está mais conectado à sua conta. Entre de novo com seu e-mail.');
    if (!d.ok) return box().innerHTML = `<div class="empty">${esc(d.erro || 'Não foi possível carregar.')}</div>`;
    if (d.fixo) return box().innerHTML = `<div class="empty">Este código de acesso não tem controle de aparelhos.</div>`;
    const quando = (iso) => iso ? new Date(iso).toLocaleDateString('pt-BR') : '—';
    box().innerHTML = `<p class="note" style="margin:-6px 0 12px">${d.lista.length} de ${d.max} aparelhos em uso. Remover um aparelho libera a vaga; ele é desconectado na próxima vez que abrir o app com internet.</p>
      <div class="list flat">${d.lista.sort((a,b)=>b.atual-a.atual).map(x=>`<div class="item"><div class="ic">${/iPhone|Android|iPad/.test(x.nome)?'📱':'💻'}</div>
        <div class="tx"><div class="t1">${esc(x.nome)}</div><div class="t2">${x.atual?'<span class="tag auto" style="margin:0 4px 0 0">este aparelho</span>':''}Desde ${quando(x.desde)} · último uso ${quando(x.visto)}</div></div>
        ${x.atual?'':`<button class="btn dan mini" data-act="removerAp" data-alvo="${x.id}" data-nome="${esc(x.nome)}">Remover</button>`}</div>`).join('')}</div>`;
    if (acao === 'remover') toast('Aparelho removido ✓');
  }).catch(() => { if (box()) box().innerHTML = '<div class="empty">Sem internet. Conecte-se para ver seus aparelhos.</div>'; });
}

// Contas no mesmo aparelho: ao entrar, recupera os dados guardados daquela conta (se houver).
const idConta = (c) => { c = String(c||'').trim(); return c.includes('@') ? c.toLowerCase() : c.toUpperCase(); };
function entrarNaConta(c){
  const id = idConta(c);
  let guardado = null;
  try {
    guardado = localStorage.getItem(CONTA_KEY(id));
    if (guardado) localStorage.removeItem(CONTA_KEY(id));
    else if ((guardado = localStorage.getItem(CONTA_KEY()))) localStorage.removeItem(CONTA_KEY());   // dados de antes de existir "sair"
  } catch(e){}
  if (guardado){ try { S = JSON.parse(guardado); } catch(e){ S = novoEstado(); } }
  else if (S.conta && S.conta !== id) S = novoEstado();
  S.liberado = true; S.conta = id; S.verificadoEm = new Date().toISOString(); migrar(); aba = 'resumo'; salvar(); render();
  if (guardado) toast('Bem-vindo de volta! Seus dados foram recuperados ✓');
  // Aparelho novo, sem dados: se houver backup na nuvem, oferece recuperar.
  else if (!Object.keys(S.meses).length) setTimeout(() => abrirRestaurarNuvem(true), 600);
}
function sairDaConta(){
  if (!confirm('Sair da conta neste aparelho?\n\nSeus dados ficam guardados aqui e voltam quando você entrar de novo com o mesmo e-mail.')) return;
  try { localStorage.setItem(CONTA_KEY(S.conta), JSON.stringify(S)); } catch(e){ return toast('Não foi possível guardar os dados. Faça um backup antes de sair.'); }
  S = novoEstado(); aba = 'resumo'; busca = ''; salvar(); render();
}


// Entrega um arquivo: no celular, abre o menu de compartilhar (salvar em Arquivos, Drive, WhatsApp, e-mail);
// onde não houver, baixa o arquivo.
function entregarArquivo(nome, dados, tipo, titulo, aoConcluir){
  let arquivo = null;
  try { arquivo = new File([dados], nome, { type:tipo }); } catch(e){}
  const baixar = () => {
    const l = document.createElement('a'); l.href = URL.createObjectURL(new Blob([dados],{type:tipo}));
    l.download = nome; document.body.appendChild(l); l.click(); l.remove(); setTimeout(()=>URL.revokeObjectURL(l.href),1000);
    aoConcluir();
  };
  if (arquivo && navigator.canShare && navigator.canShare({ files:[arquivo] }) && matchMedia('(pointer:coarse)').matches){
    navigator.share({ files:[arquivo], title:titulo }).then(aoConcluir).catch(err => { if (err && err.name !== 'AbortError') baixar(); });
  } else baixar();
}
function fazerBackup(){
  const dados = JSON.stringify({ ...S, backupEm: new Date().toISOString() }, null, 2);
  entregarArquivo('backup-financas-'+dataHoje()+'.json', dados, 'application/json', 'Backup Tino Finanças',
    () => { S.ultimoBackup = new Date().toISOString(); S.novosDesdeBackup = 0; S.backupAdiado = null; salvar(); render(); toast('Backup feito ✓'); checarConquistas(); });
}
// Planilha (CSV no padrão brasileiro: ; entre colunas, vírgula decimal, BOM para o Excel reconhecer acentos).
// Compras parceladas viram uma linha por parcela, no mês de cada parcela.
function exportarCsv(){
  memoParc = null;
  const linhas = [];
  const dataBR = (d) => d ? d.split('-').reverse().join('/') : '';
  const mesBR = (k) => { const o = ymDe(k); return `${MESES[o.m]}/${o.y}`; };
  const valorBR = (v) => (Math.round((+v||0)*100)/100).toFixed(2).replace('.',',');
  const add = (k, data, tipo, desc, cat, forma, parc, valor, ess, sit) => { const l = [dataBR(data), mesBR(k), tipo, desc, cat, forma, parc, valorBR(valor), ess, sit]; l.ordem = data || k+'-00'; linhas.push(l); };
  Object.keys(S.meses).sort().forEach(k=>{
    const M = S.meses[k];
    M.entradas.forEach(e=>add(k, e.data, 'Entrada', e.nome, '', '', '', e.valor, '', e.fixa?'Repete todo mês':''));
    const formaCsv = (g) => g.forma + (cartaoPorId(g.cartao) ? ` (${cartaoPorId(g.cartao).nome})` : '');
    M.gastos.filter(g=>!ehParcelado(g)).forEach(g=>add(k, g.data, 'Gasto', g.desc||nomeCat(g.cat), nomeCat(g.cat), formaCsv(g), '', g.valor, g.essencial?'Sim':'Não', (g.tags||[]).length ? 'Etiqueta: ' + g.tags.join(', ') : ''));
    (parcelas()[k]||[]).forEach(x=>{ const o = ymDe(k), d = x.g.data ? key(o.y,o.m)+'-'+String(Math.min(+x.g.data.slice(8,10), diasNoMes(o.y,o.m))).padStart(2,'0') : '';
      add(k, d, 'Gasto', x.g.desc||nomeCat(x.g.cat), nomeCat(x.g.cat), 'Crédito', `${x.i+1}/${x.n}`, x.valor, x.g.essencial?'Sim':'Não', `Compra de ${valorBR(x.g.valor)} em ${mesBR(x.origem)}`); });
    M.contas.forEach(c=>add(k, c.data, 'Conta', c.nome, 'Contas fixas', '', '', c.pago?c.valor:(c.planejado||c.valor), '', c.pago?'Paga':`Pendente${c.venc?' (vence dia '+c.venc+')':''}`));
    M.reservas.forEach(r=>{ const c = cofPorId(cofDe(r)); add(k, r.data, r.valor<0?'Retirada':'Reserva', r.nome||(c?c.nome:r.tipo), c?'Cofrinho: '+c.nome:r.tipo, '', '', r.valor, '', ''); });
  });
  if (!linhas.length) return toast('Ainda não há lançamentos para exportar');
  linhas.sort((a,b)=> a.ordem.localeCompare(b.ordem));
  const cel = (v) => { v = String(v??''); return /[;"\n]/.test(v) ? '"'+v.replace(/"/g,'""')+'"' : v; };
  const cab = ['Data','Mês','Tipo','Descrição','Categoria','Forma de pagamento','Parcela','Valor (R$)','Essencial','Observação'];
  const csv = '\ufeff' + [cab, ...linhas].map(l=>l.map(cel).join(';')).join('\r\n');
  entregarArquivo('lancamentos-financas-'+dataHoje()+'.csv', csv, 'text/csv', 'Lançamentos Tino Finanças', () => toast('Planilha exportada ✓'));
}

// Campos de dinheiro: os centavos entram sozinhos enquanto digita (4 → 0,04 → 0,45 → 4,59 → 45,90), como nos apps de banco.
document.addEventListener('input', e=>{
  const el = e.target;
  if (el.tagName !== 'INPUT' || el.getAttribute('inputmode') !== 'decimal') return;
  const digitos = el.value.replace(/\D/g,'').replace(/^0+/,'').slice(0,11);
  el.value = digitos ? (parseInt(digitos,10)/100).toLocaleString('pt-BR',{minimumFractionDigits:2, maximumFractionDigits:2}) : '';
  try { el.setSelectionRange(el.value.length, el.value.length); } catch(_){}
}, true);
let esperaFrase = null;
document.addEventListener('input', e=>{
  if (e.target.id !== 'fFrase') return;
  clearTimeout(esperaFrase);
  const el = e.target;
  esperaFrase = setTimeout(() => { if (el.value.trim() && el.dataset.aplicado !== el.value){ el.dataset.aplicado = el.value; aplicarFrase(el.value); } }, 1200);
});
document.addEventListener('focusout', e=>{ if (e.target.id==='fFrase' && e.target.value.trim() && e.target.dataset.aplicado !== e.target.value){ e.target.dataset.aplicado = e.target.value; aplicarFrase(e.target.value); } });
document.addEventListener('input', e=>{
  if (e.target.id==='fValor' || e.target.id==='fParc') infoParcelas();
  if (e.target.id==='fValor' || e.target.id==='fEntParc' || e.target.id==='fData') infoEntParc();
  if (e.target.dataset.parte && form && form.v.partes){ form.v.partes[+e.target.dataset.parte].valor = parseValor(e.target.value); infoPartes(); }
  if (e.target.id==='fValor' && form && form.v.partes) infoPartes();
  if (e.target.id==='sValor') atualizarSimulacao();
  if (e.target.id==='pExtra') desenharPlano();
  if (e.target.id==='fPessoas' || (e.target.id==='fValor' && document.getElementById('divInfo'))) infoDivisao();
  if (e.target.id==='chavePix'){ S.chavePix = e.target.value.trim(); salvar(); }
  if (e.target.id==='fBusca'){
    busca = e.target.value;
    memo = {}; memoParc = null; memoFat = null;
    document.getElementById('resBusca').innerHTML = busca.trim() ? resultadosBusca(busca) : '';
    document.getElementById('lancNormal').hidden = !!busca.trim();
    document.querySelector('.busca .x').hidden = !busca;
  }
});
document.addEventListener('change', e=>{
  if (e.target.id === 'fileExtrato' && e.target.files[0]) return abrirImportacao(e.target.files[0]);
  if (e.target.dataset.impsel){ const x = imp.itens[+e.target.dataset.impsel]; x.sel = e.target.checked; e.target.closest('.imp').classList.toggle('off', !x.sel);
    const n = imp.itens.filter(y=>y.sel).length; $sh.querySelector('[data-act=confirmarImp]').textContent = `Importar ${n} lançamento${n===1?'':'s'}`; return; }
  if (e.target.id === 'impCartao'){ imp.cartao = e.target.value; return; }
  if (e.target.dataset.impcat){ imp.itens[+e.target.dataset.impcat].cat = e.target.value; return; }
  if (e.target.id==='fParc' || e.target.id==='fData') return infoParcelas();
  if (e.target.id==='sParc') return atualizarSimulacao();
  if (e.target.id!=='fileImp' || !e.target.files[0]) return;
  const r = new FileReader();
  r.onload = () => { try {
      const d = JSON.parse(r.result); if (!d.meses || !d.perfil) throw 0;
      if (!confirm('Substituir os dados atuais pelo backup?')) return;
      d.liberado = S.liberado || d.liberado; d.conta = S.conta || d.conta; delete d.backupEm; S = d; aba = 'resumo'; migrar(); S.tourVisto = true; S.novosDesdeBackup = 0; S.ultimoBackup = S.ultimoBackup || new Date().toISOString(); salvar(); render(); toast('Backup restaurado ✓');
    } catch(_){ toast('Arquivo de backup inválido'); } };
  r.readAsText(e.target.files[0]);
});
document.addEventListener('keydown', e=>{ if(e.key==='Escape') fechar(); if(e.key==='Enter' && e.target.id==='fFrase'){ e.preventDefault(); clearTimeout(esperaFrase); e.target.dataset.aplicado = e.target.value; aplicarFrase(e.target.value); e.target.blur(); return; } if(e.key==='Enter' && form && !['cofrinho','simulacao','cartao','divida','pagamentoDivida','plano','aReceber'].includes(form.tipo) && e.target.tagName==='INPUT') salvarForm(); });

/* ---------- atualizações ----------
   versao.json diz qual é a versão publicada. Se for mais nova que este código:
   - voltando ao app depois de 30 min minimizado, recarrega sozinho (se nada estiver aberto);
   - senão, mostra uma faixa "Nova versão disponível".
   Depois de atualizar, mostra uma vez a lista de novidades. */
let escondidoEm = 0;
function buscarVersao(){
  return fetch('versao.json', { cache:'no-store' }).then(r => r.ok ? r.json() : null).catch(() => null);
}
function ocupado(){ return !!form || tour !== null || $ov.classList.contains('open') || document.activeElement?.tagName === 'INPUT'; }
function checarVersao(podeRecarregar){
  if (!navigator.onLine) return;
  buscarVersao().then(v => {
    if (!v || !(+v.versao > APP_VERSAO)) return;
    if (podeRecarregar && !ocupado()) return location.reload();
    if (document.getElementById('faixaAtualizar')) return;
    const f = document.createElement('div');
    f.id = 'faixaAtualizar'; f.className = 'upd'; f.setAttribute('role','status');
    f.innerHTML = '<span>✨ Nova versão disponível</span><button data-upd="1">Atualizar</button>';
    document.body.appendChild(f);
  });
}
function mostrarNovidades(){
  if (!S.liberado || !S.perfil.ok || tour !== null) return;
  if ((S.versaoVista || 0) >= APP_VERSAO) return;
  buscarVersao().then(v => {
    if (!v || +v.versao !== APP_VERSAO || !(v.novidades||[]).length || ocupado()) return;
    abrir(`<h2>✨ O que há de novo</h2><ul class="novidades">${v.novidades.map(n=>`<li>${esc(n)}</li>`).join('')}</ul>
      <button class="btn pri" data-act="fecharNovidades">Entendi</button>`);
  });
}
document.addEventListener('click', e => { if (e.target.closest('[data-upd]')) location.reload(); });
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') { escondidoEm = Date.now(); return; }
  checarVersao(escondidoEm && Date.now() - escondidoEm > 30*60e3);
});
window.addEventListener('online', () => checarVersao(false));

/* ---------- tutorial do primeiro acesso ----------
   Escurece a tela, destaca um elemento por vez e explica. Passa pelas abas sozinho. */
const PASSOS_TOUR = [
  { titulo: () => `👋 ${S.perfil.pronome==='Femininos'?'Bem-vinda':S.perfil.pronome==='Masculinos'?'Bem-vindo':'Boas-vindas'}, ${esc(S.perfil.nome)}!`,
    texto: 'Em 30 segundos você aprende o básico. Toque em <b>Próximo</b> para avançar.' },
  { aba:'resumo', sel:'.hero', titulo:'Pode gastar hoje',
    texto:'O número mais importante do app: quanto você ainda pode gastar hoje, já descontando as contas que vão vencer. Ele se atualiza sozinho conforme você anota.' },
  { aba:'resumo', sel:'nav .fab', titulo:'Anotar é rápido',
    texto:'Toque no <b>+</b>, digite o valor e escolha a categoria. Ou escreva (ou fale 🎤) <b>“gastei 45 no ifood no crédito”</b> que o app preenche tudo.' },
  { aba:'resumo', sel:'#passos', titulo:'Seus primeiros passos',
    texto:'Siga estes 4 passos para o app começar a trabalhar por você. Cada um leva menos de um minuto.' },
  { aba:'resumo', titulo:'🎉 Tudo pronto!',
    texto:'O resto você descobre com calma, nas abas lá embaixo. Se precisar, a ajuda fica em <b>Ajustes</b>.', final:true }
];
let tour = null;
function iniciarTour(){ tour = 0; mostrarPasso(); }
function mostrarPasso(rolar = true){
  const p = PASSOS_TOUR[tour];
  if (p.aba && aba !== p.aba){ aba = p.aba; render(); }
  const el = p.sel ? document.querySelector(p.sel) : null;
  // Rola só esta janela (scrollIntoView também rolaria a página de vendas quando o app está embutido)
  if (rolar){ if (el && !el.closest('nav')){ const r = el.getBoundingClientRect(); scrollTo(0, Math.max(0, r.top + scrollY - (innerHeight - r.height) / 2)); } else scrollTo(0,0); }
  requestAnimationFrame(() => desenharTour(el, p));
}
function desenharTour(el, p){
  if (tour === null) return;   // o tutorial pode ter sido fechado antes deste quadro ser desenhado
  let ov = document.getElementById('tour');
  if (!ov){ ov = document.createElement('div'); ov.id = 'tour'; ov.setAttribute('role','dialog'); ov.setAttribute('aria-modal','true'); document.body.appendChild(ov); }
  const r = el ? el.getBoundingClientRect() : null, pad = 6;
  const embaixo = r && (r.top + r.height/2) < innerHeight/2;
  const pos = !r ? 'top:50%;transform:translateY(-50%)' : embaixo ? `top:${Math.min(r.bottom + pad + 12, innerHeight - 220)}px` : `bottom:${Math.min(innerHeight - r.top + pad + 12, innerHeight - 220)}px`;
  const titulo = typeof p.titulo === 'function' ? p.titulo() : p.titulo;
  ov.innerHTML = (r ? `<div class="t-spot" style="top:${r.top-pad}px;left:${r.left-pad}px;width:${r.width+pad*2}px;height:${r.height+pad*2}px"></div>` : '<div class="t-dim"></div>') +
    `<div class="t-box" style="${pos}" aria-live="polite">
      <div class="t-passo">${tour+1} de ${PASSOS_TOUR.length}</div>
      <h4>${titulo}</h4><p>${p.texto}</p>
      <div class="t-acts">
        ${p.final ? `<button class="pular" data-tour="fim">Explorar sozinho</button><button class="btn pri" data-tour="renda">Lançar minha renda</button>`
          : `<button class="pular" data-tour="fim">Pular</button>${tour>0?'<button class="btn sec" data-tour="voltar">Voltar</button>':''}<button class="btn pri" data-tour="proximo">Próximo</button>`}
      </div></div>`;
}
function fecharTour(){
  tour = null; const ov = document.getElementById('tour'); if (ov) ov.remove();
  S.tourVisto = true; aba = 'resumo'; salvar(); render(); scrollTo(0,0);
}
document.addEventListener('click', e => {
  const b = e.target.closest('[data-tour]'); if (!b) return;
  e.stopPropagation();
  const acao = b.dataset.tour;
  if (acao === 'proximo'){ tour++; mostrarPasso(); }
  else if (acao === 'voltar'){ tour--; mostrarPasso(); }
  else if (acao === 'fim') fecharTour();
  else if (acao === 'renda'){ fecharTour(); abrirForm('entradas'); }
}, true);
window.addEventListener('resize', () => { if (tour !== null) mostrarPasso(false); });

/* ---------- telas de entrada ---------- */
function renderOnboarding(){
  $app.innerHTML = `<div class="onb"><div class="in">
    <img class="logo" src="icons/icon-192.png" alt="">
    <h1>Vamos organizar seu dinheiro</h1>
    <p>Leva 30 segundos. Você pode mudar tudo depois.</p>
    <div class="f"><label>Quero ser chamado(a) de</label><input id="oNome" autocomplete="given-name" placeholder="Seu nome"></div>
    <div class="f"><label>Meus pronomes são</label><select id="oPron"><option>Masculinos</option><option>Femininos</option><option>Neutros</option></select></div>
    <div class="row2"><div class="f"><label>Minha meta é</label><input id="oMeta" placeholder="Ex.: Carro"></div>
    <div class="f"><label>Quanto custa</label><input id="oMetaV" inputmode="decimal" placeholder="R$ 0,00"></div></div>
    <div class="f"><label>Quero guardar de reserva de emergência</label><input id="oRes" inputmode="decimal" placeholder="R$ 0,00"></div>
    <button class="btn pri" data-act="onbOk">Começar</button>
    <button class="btn link" data-act="importar">Já usava o app em outro lugar? <b>Restaurar backup</b></button>
    <input type="file" id="fileImp" hidden>
  </div></div>`;
}
function renderAcesso(){
  // No iPhone, o app instalado na tela de início não enxerga o que foi feito no Safari (são separados).
  // Por isso orientamos a instalar antes de liberar.
  const iosNavegador = /iphone|ipad|ipod/i.test(navigator.userAgent) && !navigator.standalone && !matchMedia('(display-mode: standalone)').matches;
  $app.innerHTML = `<div class="onb"><div class="in">
    <img class="logo" src="icons/icon-192.png" alt="">
    <h1>${esc(CONFIG.nomeApp)}</h1>
    <p class="slogan">${esc(CONFIG.slogan)}</p>
    ${iosNavegador ? `<div class="dica-ios"><b>📲 Instale antes de entrar</b>
      <ol><li>Toque em <b>Compartilhar</b> <span class="kbd">⬆︎</span> ${/CriOS/.test(navigator.userAgent)?'ao lado do endereço':'na barra de baixo'}.</li>
      <li>Toque em <b>Adicionar à Tela de Início</b>.</li>
      <li>Abra o app pelo ícone na tela de início e digite seu e-mail lá.</li></ol>
      <small>No iPhone, o que você fizer aqui no navegador não aparece no app instalado.</small></div>
      <p style="margin-top:18px">Prefere usar pelo navegador mesmo? Digite o e-mail da compra:</p>` : `<p>Digite o e-mail que você usou na compra para liberar o app neste aparelho.</p>`}
    <div class="f"><label>E-mail da compra (ou código de acesso)</label><input id="aCod" type="email" inputmode="email" autocapitalize="none" autocomplete="email" placeholder="seuemail@exemplo.com"></div>
    <button class="btn pri" data-act="liberar">Liberar acesso</button>
  </div></div>`;
}

// Atalhos vindos da notificação.
const parametros = new URLSearchParams(location.search);
if (['aba','novo','semana','colar','texto','titulo','link'].some(k => parametros.has(k))) history.replaceState(null, '', location.pathname + (DEMO ? location.search.replace(/[?&](aba|novo|semana|colar|texto|titulo|link)=[^&]*/g,'') : ''));
if (parametros.get('aba') === 'contas') aba = 'contas';
/* ---------- dados da demonstração ---------- */
function dadosDemo(){
  let semente = 20261;
  const rnd = () => { semente = (semente * 16807) % 2147483647; return semente / 2147483647; };
  const entre = (a, b) => Math.round((a + rnd()*(b-a)) * 100) / 100;
  const D = novoEstado();
  S = D;   // mes() escreve em S
  Object.assign(D, { liberado:true, tourVisto:false, versaoVista:APP_VERSAO, carry:false,
    perfil:{ nome:'visitante', pronome:'Neutros', metaNome:'', metaValor:0, reservaMeta:0, ok:true },
    cofrinhos:[
      { id:'reserva', nome:'Reserva de emergência', emoji:'🛟', alvo:15000, prazo:'' },
      { id:'viagem', nome:'Viagem para a praia', emoji:'🏖️', alvo:4000, prazo:key(somaMeses(hoje.getFullYear(),hoje.getMonth(),5).y, somaMeses(hoje.getFullYear(),hoje.getMonth(),5).m) },
      { id:'note', nome:'Notebook novo', emoji:'💻', alvo:5000, prazo:'' } ],
    orcamentos:{ '🧺 Mercado':900, '🍗 Alimentação':600, '🎉 Lazer':300 },
    cartoes:[{ id:'nubank', nome:'Nubank', fechamento:3, vencimento:10, limite:6000 }],
    aReceber:[],
    dividas:[{ id:'emp', nome:'Empréstimo pessoal', tipo:'emprestimo', saldo:4800, juros:3.5, parcela:450, venc:15, inicial:8000, criada:'', pagamentos:[] }] });
  const hojeDia = hoje.getDate();
  for (let off = -4; off <= 0; off++){
    const o = somaMeses(hoje.getFullYear(), hoje.getMonth(), off), k = key(o.y, o.m), M = mes(o.y, o.m, true);
    const lim = off === 0 ? hojeDia : diasNoMes(o.y, o.m);
    const dia = (d) => k + '-' + String(Math.min(d, diasNoMes(o.y,o.m))).padStart(2,'0');
    const g = (cat, desc, valor, forma, d, extra) => { if (d <= lim) M.gastos.push({ id:uid(), cat, desc, valor, forma, data:dia(d), essencial:ESSENCIAIS.includes(cat), parcelas:1, ...(forma==='Crédito'?{ cartao:'nubank' }:{}), ...(extra||{}) }); };
    M.entradas.push({ id:uid(), nome:'Salário', valor:5400, fixa:true, data:dia(5) });
    if (off === -2 || off === -1) M.entradas.push({ id:uid(), nome:'Freela', valor:entre(500,900), data:dia(18) });
    if (off === 0) M.entradas.push({ id:uid(), nome:'Freela', valor:900, data:dia(2) });   // folga no mês atual: o "Posso comprar?" da demonstração não pode dizer "não" para tudo
    [3,11,24].forEach(d => g('🧺 Mercado','Supermercado', entre(160,320), rnd()<.5?'Débito':'Pix / Dinheiro', d));
    [7,21].forEach(d => g('🧺 Mercado','Feira', entre(40,75), 'Pix / Dinheiro', d));
    [2,9,14,19,27].forEach(d => g('🍗 Alimentação','iFood', entre(35,72), 'Crédito', d));
    [4,12,22].forEach(d => g('🍗 Alimentação','Padaria', entre(14,28), 'Pix / Dinheiro', d));
    g('🍗 Alimentação','Restaurante', entre(90,150), 'Crédito', 16);
    [6,20].forEach(d => g('⛽ Gasolina','Posto', entre(150,210), 'Débito', d));
    [8,15,26].forEach(d => g('🚗 Transporte','Uber', entre(16,38), 'Crédito', d));
    g('📱 Assinaturas','Netflix', off >= -1 ? 59.9 : 55.9, 'Crédito', 8);
    g('📱 Assinaturas','Spotify', 21.9, 'Crédito', 12);
    g('💊 Saúde','Academia', 99.9, 'Débito', 3);
    g('💊 Saúde','Farmácia', entre(35,90), 'Pix / Dinheiro', 13);
    g('🎉 Lazer', rnd()<.5?'Cinema':'Bar com amigos', entre(60,160), 'Crédito', 17);
    if (rnd() < .6) g('👕 Vestuário','Renner', entre(120,260), 'Crédito', 23);
    g('💄 Beleza','Salão', entre(65,110), 'Pix / Dinheiro', 10);
    g('📦 Compras Online','Shopee', entre(45,140), 'Crédito', 25);
    if (off === -2) g('📦 Compras Online','Celular novo', 1800, 'Crédito', 14, { parcelas:10, essencial:false });
    [['Aluguel',1400,10],['Energia',entre(160,215),15],['Internet',99.9,20],['Água',entre(70,95),25]].forEach(([nome,v,venc]) => {
      const pago = off < 0 || venc < hojeDia;
      M.contas.push({ id:uid(), nome, planejado:Math.round(v), valor:pago?v:0, pago, data:pago?dia(venc):'', venc });
    });
    if (off === -4){ M.reservas.push({ id:uid(), tipo:'Cofrinho', cof:'reserva', valor:3000, nome:'Saldo inicial', data:dia(1) });
      M.reservas.push({ id:uid(), tipo:'Renda Fixa', valor:2500, nome:'CDB', data:dia(1) }); }
    if (6 <= lim){ M.reservas.push({ id:uid(), tipo:'Cofrinho', cof:'reserva', valor:300, nome:'Nubank', data:dia(6) });
      M.reservas.push({ id:uid(), tipo:'Cofrinho', cof:'viagem', valor:250, nome:'', data:dia(6) }); }
    if (off === -1) M.reservas.push({ id:uid(), tipo:'Cofrinho', cof:'note', valor:400, nome:'', data:dia(28) });
    if (off === 0 && lim >= 9){ const jt = { id:uid(), cat:'🍗 Alimentação', desc:'Jantar com amigos', valor:240, minha:80, dividido:['Ana','Bruno'], forma:'Crédito', cartao:'nubank', data:dia(9), essencial:false, parcelas:1 };
      M.gastos.push(jt); ['Ana','Bruno'].forEach(p => D.aReceber.push({ id:uid(), pessoa:p, desc:'Jantar com amigos', valor:80, data:jt.data, recebido:false, gastoId:jt.id, mk:k })); }
    if (off === -1){ g('🎉 Lazer','Passeio de barco', 180, 'Pix / Dinheiro', 20, { tags:['Viagem Praia'] }); g('🍗 Alimentação','Restaurante na praia', 145, 'Débito', 21, { tags:['Viagem Praia'] }); g('⛽ Gasolina','Posto na estrada', 210, 'Débito', 19, { tags:['Viagem Praia'] }); g('🏠 Casa','Pousada', 620, 'Pix / Dinheiro', 19, { tags:['Viagem Praia'] }); }
    if (off === -1) D.aReceber.push({ id:uid(), pessoa:'Carlos', desc:'Ingresso do show', valor:150, data:dia(12), recebido:false });
    M.auto = true;
  }
  for (let i = 0; i < 9; i++){ const d = new Date(); d.setDate(d.getDate() - i); D.diasAtivos = D.diasAtivos || []; D.diasAtivos.unshift(key(d.getFullYear(),d.getMonth()) + '-' + String(d.getDate()).padStart(2,'0')); }
  return D;
}
// Na demonstração, ações que dependem de conta, servidor ou dos dados reais ficam desligadas.
const BLOQ_DEMO = new Set(['plus','plusPedir','plusEntrar','syncLigar','syncAgora','excluirConta','listaAbrir','nuvemAtivar','nuvemRestaurar','nuvemAgora','depoimento','depoEnviar','npsEnviar','indique','indiqueUsar','exportar','importar','sair','aparelhos','criarSenha','trocarSenha','removerSenha','bio','notif','notifTeste','zerar']);

function iniciarApp(){
  if (parametros.has('novo') && S.liberado && S.perfil.ok) setTimeout(() => abrirForm('gastos'), 300);
  // Atalhos: notificação de domingo (?semana), atalho do ícone (?colar) e "Compartilhar → Tino" no Android (?texto=...)
  if (S.liberado && S.perfil.ok){
    if (parametros.has('plus') && !DEMO){ S.plusLink = true; salvar(); setTimeout(abrirPlus, 300); }
    else if (parametros.has('semana')) setTimeout(abrirSemana, 300);
    else if (parametros.has('texto') || parametros.has('titulo')){ const txt = [parametros.get('titulo'), parametros.get('texto')].filter(Boolean).join(' '); setTimeout(() => interpretarTextoBanco(txt) ? lancarTexto(txt) : (abrirColar(), setTimeout(()=>{ const c = document.getElementById('cTexto'); if (c) c.value = txt; }, 50)), 300); }
    else if (parametros.has('colar')) setTimeout(abrirColar, 300);
  }
  if (notifLigada() && S.notifSync !== dataHoje()){ S.notifSync = dataHoje(); salvar(); sincronizarNotif(); }
  if (S.liberado && S.perfil.ok && S.tourVisto === false) iniciarTour();
  mostrarNovidades();
  setTimeout(checarConquistas, 1200);
  setTimeout(talvezPedirDepoimento, 2500);
  setTimeout(talvezPedirNps, 3500);
  setTimeout(backupAutomatico, 4000);
  agendarSync(1500);
  setTimeout(conferirConvitePlus, 2000);
}
if (TESTE && !DEMO){
  document.body.classList.add('demo');
  const barra = document.createElement('div'); barra.id = 'demoBar'; barra.className = 'teste';
  barra.innerHTML = `<span>🧪 <b>Endereço de teste</b> · v${APP_VERSAO}</span><a href="#" id="recomecarTeste">Recomeçar como cliente novo</a>`;
  document.body.appendChild(barra);
  document.getElementById('recomecarTeste').addEventListener('click', e => {
    e.preventDefault();
    if (!confirm('Apagar os dados deste teste e começar do zero, como um cliente novo?')) return;
    try { Object.keys(localStorage).filter(k => k.startsWith('orgfin:')).forEach(k => localStorage.removeItem(k)); } catch(err){}
    location.reload();
  });
}
if (DEMO){
  const salvo = S;   // mantém só preferências visuais do aparelho
  S = dadosDemo(); S.tema = salvo.tema; S = Object.assign(S, { liberado:true }); migrar();
  // ?embed=1: demonstração dentro da página de vendas (sem a faixa, a pessoa já está na página de compra)
  if (!new URLSearchParams(location.search).has('embed')){
    document.body.classList.add('demo');
    const barra = document.createElement('div'); barra.id = 'demoBar';
    barra.innerHTML = `<span>👀 <b>Demonstração</b> com dados de exemplo</span><a href="${LINK_COMPRA}" target="_blank" rel="noopener">Quero o meu</a>`;
    document.body.appendChild(barra);
  }
}
render();
if (S.liberado && S.perfil.ok && temSenha()){ aoDestravar = iniciarApp; travar(); } else iniciarApp();
if (!DEMO) verificarAcesso();
checarVersao(false);
window.addEventListener('online', verificarAcesso);
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible'){ verificarAcesso(); setTimeout(backupAutomatico, 3000); } });
if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
  window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(()=>{}));
}

document.addEventListener('change', e => { if (e.target.dataset.partecat && form && form.v.partes){ form.v.partes[+e.target.dataset.partecat].cat = e.target.value; infoPartes(); } });

document.addEventListener('change', e => { if (e.target.dataset && e.target.dataset.cobrar) totalCobrar(); });
