/* =========================================================
   Organização Financeira — app PWA
   Todos os dados ficam salvos no próprio aparelho (localStorage).
   ========================================================= */

const CONFIG = {
  nomeApp: 'Organização Financeira',
  // true = pede o e-mail da compra (ou código) na primeira abertura.
  // A conferência é feita no servidor (api/liberar.js).
  exigirCodigo: true,
  frases: [
    'Pequenas ações geram grandes resultados.',
    'Quem anota, controla. Quem controla, conquista.',
    'Cada real no lugar certo é um passo para sua meta.',
    'Constância vale mais que intensidade.',
    'Seu futuro agradece o que você organiza hoje.'
  ]
};

const STORE_KEY = 'orgfin:v1';
const MESES = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];
const MES_CURTO = ['jan','fev','mar','abr','mai','jun','jul','ago','set','out','nov','dez'];
const CATEGORIAS = ['🧾 Parcela','🧾 Contas','🧺 Mercado','🍗 Alimentação','⛽ Gasolina','🚗 Transporte','🏠 Casa','💊 Saúde',
  '📦 Compras Online','👕 Vestuário','🎉 Lazer','📚 Educação','📱 Assinaturas','💄 Beleza','🐾 Pets','🎁 Presentes','❓ Outros'];
// Categorias que já vêm marcadas como essenciais ao lançar um gasto.
const ESSENCIAIS = ['🧾 Parcela','🧾 Contas','🧺 Mercado','⛽ Gasolina','🚗 Transporte','🏠 Casa','💊 Saúde','📚 Educação'];
const CAT_CONTAS = '📄 Contas fixas';
const FORMAS = ['Pix / Dinheiro','Débito','Crédito'];
const TIPOS_RES = ['Reserva de emergência','Meta','Renda Fixa','Renda Variável','Outros'];

/* ---------- estado ---------- */
function novoEstado(){
  return { v:2, liberado:false,
    perfil:{ nome:'', pronome:'Masculinos', metaNome:'', metaValor:0, reservaMeta:0, ok:false },
    carry:true, meses:{}, orcamentos:{} };
}
let S;
try { S = JSON.parse(localStorage.getItem(STORE_KEY)) || novoEstado(); } catch(e){ S = novoEstado(); }
function migrar(){
  if (!S.orcamentos) S.orcamentos = {}; if (!S.meses) S.meses = {}; S.v = 2;
  // Quem já usava antes do lembrete de backup: conta os lançamentos existentes como "sem backup".
  if (S.novosDesdeBackup == null) S.novosDesdeBackup = S.ultimoBackup ? 0 :
    Object.values(S.meses).reduce((a,M)=>a+M.entradas.length+M.gastos.length+M.contas.length+M.reservas.length, 0);
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
function salvar(){ try { localStorage.setItem(STORE_KEY, JSON.stringify(S)); } catch(e){ toast('Não foi possível salvar no aparelho'); } }

const hoje = new Date();
let cur = { y: hoje.getFullYear(), m: hoje.getMonth() };   // mês aberto
let aba = 'resumo', subLanc = 'gastos';
let evoSel = null;
let busca = '';      // texto da busca em Lançamentos   // mês destacado no gráfico de evolução

/* ---------- utilidades ---------- */
const brl = (n) => (n<0?'-':'') + 'R$ ' + Math.abs(n||0).toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2});
const brl0 = (n) => (n<0?'-':'') + 'R$ ' + Math.abs(Math.round(n||0)).toLocaleString('pt-BR');
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
  const faturaAnterior = P ? P.credito : 0;            // crédito do mês passado vira saída agora
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
  const cats = {};
  simples.forEach(g=>{ cats[g.cat] = (cats[g.cat]||0) + (+g.valor||0); });
  parc.forEach(x=>{ cats[x.g.cat] = (cats[x.g.cat]||0) + x.valor; });
  if (contasPagas) cats[CAT_CONTAS] = (cats[CAT_CONTAS]||0) + contasPagas;
  const consumo = soma(Object.values(cats), v=>v);
  const essenciais = soma(simples.filter(g=>g.essencial), g=>g.valor) + soma(parc.filter(x=>x.g.essencial), x=>x.valor) + contasPagas;

  const acumEm = (P ? P.acumEmerg : 0) + resEmerg;
  const acumMt = (P ? P.acumMeta : 0) + resMeta;

  return memo[k] = { entradas, entradasLanc, saldoAnterior, faturaAnterior, saidas, reservas, restante,
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
  plus:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>'
};

function render(){
  memo = {}; memoParc = null;
  if (CONFIG.exigirCodigo && !S.liberado) return renderAcesso();
  if (!S.perfil.ok) return renderOnboarding();
  aplicarRecorrentes(cur.y,cur.m);
  const p = S.perfil;
  const saud = p.pronome==='Femininos' ? 'Bem-vinda' : p.pronome==='Masculinos' ? 'Bem-vindo' : 'Boas-vindas';
  const frase = CONFIG.frases[hoje.getDate() % CONFIG.frases.length];
  const telas = { resumo:telaResumo, lanc:telaLanc, contas:telaContas, metas:telaMetas, ajustes:telaAjustes };
  $app.innerHTML = `
    <header class="top ${aba==='resumo'?'hero-top':''}">
      <div class="hello">Olá, ${esc(p.nome||'você')}!</div>
      <div class="sub">${aba==='resumo' ? esc(frase) : saud + ' de volta'}</div>
      <div class="monthbar">
        <button data-act="prev" aria-label="Mês anterior">‹</button>
        <div class="m">${MESES[cur.m]} ${cur.y}</div>
        <button data-act="next" aria-label="Próximo mês">›</button>
      </div>
    </header>
    <main>${telas[aba]()}</main>
    <nav>
      ${navBtn('resumo','Resumo')}${navBtn('lanc','Lançamentos')}
      <button class="fab" data-act="add" aria-label="Novo lançamento">${ICON.plus}</button>
      ${navBtn('contas','Contas')}${navBtn('metas','Planejar')}
    </nav>`;
}
const navBtn = (id,l) => `<button class="${aba===id?'on':''}" data-tab="${id}">${ICON[id]}${l}</button>`;

function variacao(atual, anterior, menorMelhor){
  if (anterior==null) return '<div class="d">Primeiro mês</div>';
  const dif = atual - anterior;
  if (Math.abs(dif) < 0.005) return `<div class="d">= mês anterior</div>`;
  const bom = menorMelhor ? dif<0 : dif>0;
  return `<div class="d"><span class="${bom?'up':'down'}">${dif>0?'▲':'▼'} ${brl(Math.abs(dif))}</span> vs. anterior</div>`;
}

function telaResumo(){
  const C = calc(cur.y,cur.m), P = C.P;
  const prox = nextYM(cur.y,cur.m);
  const neg = C.restante < 0;
  let html = `
  <section class="card hero">
    <div class="lbl">Restante para gastar</div>
    <div class="big num ${neg?'neg':''}">${brl(C.restante)}</div>
    <div class="eq num">${brl(C.entradas)} entradas − ${brl(C.saidas)} saídas − ${brl(C.reservas)} reservas</div>
    ${blocoPrevisao(C)}
  </section>`;

  html += lembreteBackup();
  html += alertasContas();
  html += alertasOrcamento(C);

  html += `<div class="grid">
    ${stat('Entradas','#0f9f6e',C.entradas, variacao(C.entradas, P&&P.entradas, false))}
    ${stat('Saídas','#d64045',C.saidas, variacao(C.saidas, P&&P.saidas, true))}
    ${stat('Reservas & invest.','#14b8a6',C.reservas, variacao(C.reservas, P&&P.reservas, false))}
    ${stat('Uso do crédito','#b7791f',C.credito, variacao(C.credito, P&&P.credito, true))}
  </div>`;
  if (C.credito > 0) html += `<div class="alert"><span>💳</span><div><b>${brl(C.credito)} no crédito</b> ainda não saiu do seu saldo. Esse valor entra como fatura nas saídas de ${MESES[prox.m]}.</div></div>`;
  if (C.faturaAnterior > 0) html += `<div class="alert info"><span>📥</span><div>A fatura de <b>${brl(C.faturaAnterior)}</b> do crédito usado em ${MESES[prevYM(cur.y,cur.m).m]} já está somada nas saídas deste mês.</div></div>`;

  html += cardCategorias(C);
  html += cardOrcamentos(C);
  html += cardEvolucao();

  html += `<section class="card"><h3>Metas <small>acumulado até ${MESES[cur.m].toLowerCase()}</small></h3>${blocoMetas(C)}</section>`;

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
function blocoPrevisao(C){
  if (key(cur.y,cur.m) !== chaveHoje()) return '';
  const D = diasNoMes(cur.y,cur.m), d = hoje.getDate(), rest = D - d + 1;
  const livre = C.restante - C.contasPend;
  const porDia = livre / rest;
  const ritmo = (C.gastosVista) / d;
  const fim = livre - ritmo * (rest - 1);
  let h = `<div class="prev">
    <div><span>Pode gastar por dia</span><b class="num ${porDia<0?'neg':''}">${brl(Math.max(porDia,0))}</b><small>pelos próximos ${rest} dia${rest>1?'s':''}</small></div>
    <div><span>No ritmo atual</span><b class="num ${fim<0?'neg':''}">${brl(fim)}</b><small>no fim do mês (${brl0(ritmo)}/dia)</small></div>
  </div>`;
  if (C.contasPend > 0) h += `<div class="eq">Já descontando ${brl(C.contasPend)} de contas a pagar.</div>`;
  const fut = comprometidoFuturo();
  if (fut > 0) h += `<div class="eq">💳 ${brl(fut)} em parcelas nos próximos meses.</div>`;
  return h;
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
  if (!precisaBackup()) return '';
  const quando = S.ultimoBackup ? `Seu último backup foi há ${diasDesde(S.ultimoBackup)} dia${diasDesde(S.ultimoBackup)===1?'':'s'}` : 'Você ainda não fez nenhum backup';
  return `<div class="alert info backup"><span>💾</span><div><b>Proteja seus dados</b><br>${quando} e tem ${S.novosDesdeBackup} lançamento${S.novosDesdeBackup>1?'s':''} novo${S.novosDesdeBackup>1?'s':''}. Se trocar de celular ou limpar o navegador, eles se perdem.
    <div class="acts"><button class="btn pri" data-act="exportar">Fazer backup</button><button class="btn sec" data-act="adiarBackup">Depois</button></div></div></div>`;
}
function alertasContas(){
  if (key(cur.y,cur.m) !== chaveHoje()) return '';
  const M = mes(cur.y,cur.m);
  const lst = M.contas.map(c=>({c, s:statusConta(c,cur.y,cur.m)})).filter(x=>x.s && x.s.cls);
  if (!lst.length) return '';
  return `<button class="alert warnbox" data-tab="contas"><span>⏰</span><div><b>${lst.length===1?'1 conta precisa':'' + lst.length + ' contas precisam'} de atenção</b><br>
    ${lst.slice(0,3).map(x=>`${esc(x.c.nome)}: ${x.s.t}`).join(' · ')}</div></button>`;
}

function alertasOrcamento(C){
  const est = Object.entries(S.orcamentos).filter(([c,l])=>l>0 && (C.cats[c]||0) > l);
  if (!est.length) return '';
  return `<div class="alert crit"><span>⚠️</span><div><b>Orçamento estourado</b><br>${est.map(([c,l])=>`${esc(nomeCat(c))}: ${brl(C.cats[c]-l)} acima`).join(' · ')}</div></div>`;
}

// Gráfico: onde o dinheiro foi (barras horizontais ordenadas, um toque abre o detalhe).
function cardCategorias(C){
  const cats = Object.entries(C.cats).filter(([,v])=>v>0).sort((a,b)=>b[1]-a[1]);
  let h = `<section class="card"><h3>Onde você gastou <small>${brl(C.consumo)}</small></h3>`;
  if (!cats.length) return h + `<div class="note">Seus gastos por categoria aparecem aqui.</div></section>`;
  const max = cats[0][1];
  h += `<div class="hbars" role="list">`;
  cats.forEach(([c,v])=>{
    h += `<button class="hb" role="listitem" data-cat="${esc(c)}" aria-label="${esc(nomeCat(c))}: ${brl(v)}, ${(v/C.consumo*100).toFixed(0)}% do total">
      <span class="hb-l"><span class="hb-e">${emojiCat(c)}</span>${esc(nomeCat(c))}</span>
      <span class="hb-v num">${brl(v)} <small>${(v/C.consumo*100).toFixed(0)}%</small></span>
      <span class="hb-t"><span style="width:${Math.max(v/max*100,1.5)}%"></span></span></button>`;
  });
  h += `</div>`;
  h += `<div class="ess"><span><i class="dot ok"></i>Essenciais ${brl(C.essenciais)}</span><span><i class="dot no"></i>Não essenciais ${brl(C.consumo-C.essenciais)}</span></div>`;
  h += `<div class="note">Toque numa categoria para ver o histórico e os lançamentos. Compras no crédito contam no mês da compra (parceladas, no mês de cada parcela).</div></section>`;
  return h;
}

// Medidores de orçamento por categoria.
function cardOrcamentos(C){
  const lst = Object.entries(S.orcamentos).filter(([,l])=>l>0);
  if (!lst.length) return `<section class="card"><h3>Orçamentos</h3><div class="note" style="margin:0 0 12px">Defina um limite por categoria e o app avisa antes de você estourar.</div><button class="btn sec" data-act="orcamentos">Definir orçamentos</button></section>`;
  const tot = soma(lst, x=>x[1]), gasto = soma(lst, ([c])=>C.cats[c]||0);
  let h = `<section class="card"><h3>Orçamentos <small>${brl(gasto)} de ${brl(tot)}</small></h3>`;
  lst.sort((a,b)=>((C.cats[b[0]]||0)/b[1])-((C.cats[a[0]]||0)/a[1])).forEach(([c,l])=>{
    const v = C.cats[c]||0, pct = v/l*100;
    const st = pct>100 ? 'crit' : pct>=80 ? 'warn' : '';
    const txt = pct>100 ? `⚠️ ${brl(v-l)} acima` : `Resta ${brl(l-v)}`;
    h += `<button class="meter ${st}" data-cat="${esc(c)}">
      <span class="row"><b>${emojiCat(c)} ${esc(nomeCat(c))}</b><span class="num">${brl(v)} de ${brl(l)}</span></span>
      <span class="bar"><span style="width:${Math.min(pct,100)}%"></span></span>
      <span class="foot"><span>${txt}</span><span class="num">${pct.toFixed(0)}%</span></span></button>`;
  });
  return h + `<button class="btn sec" data-act="orcamentos">Editar orçamentos</button></section>`;
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
  const lim = S.orcamentos[c]||0;
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
    if (x.v>0) svg += `<text x="${cx}" y="${base-h-5}" text-anchor="middle" class="lbl-v">${brl0(x.v)}</text>`;
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

function blocoMetas(C){
  const p = S.perfil; let h='';
  const g = (nome, alvo, total, mesV, campo) => {
    const pct = alvo>0 ? Math.min(100, total/alvo*100) : 0;
    return `<div class="goal"><div class="row"><b>${esc(nome)}</b><span class="num">${brl(total)} de ${brl(alvo)}</span></div>
      <div class="bar"><div style="width:${pct}%"></div></div>
      <div class="foot num"><span>+${brl(mesV)} este mês</span><span>Faltam ${brl(Math.max(0,alvo-total))} · ${pct.toFixed(0)}%</span></div>${previsaoMeta(alvo,total,campo)}</div>`;
  };
  if (p.reservaMeta>0) h += g('🛟 Reserva de emergência', p.reservaMeta, C.acumEmerg, C.resEmerg, 'resEmerg');
  if (p.metaValor>0) h += g('🎯 '+(p.metaNome||'Minha meta'), p.metaValor, C.acumMeta, C.resMeta, 'resMeta');
  return h || `<div class="note">Defina sua meta e sua reserva em Planejar.</div>`;
}
// Em quanto tempo a meta é atingida, pela média guardada nos últimos 3 meses.
function previsaoMeta(alvo, total, campo){
  if (total >= alvo) return `<div class="gprev ok">🎉 Meta atingida!</div>`;
  let t = 0; for (let i=0;i<3;i++){ const o = somaMeses(cur.y,cur.m,-i); t += calc(o.y,o.m)[campo]; }
  const media = t/3;
  if (media <= 0) return `<div class="gprev">Guarde um pouco todo mês para ver a previsão de quando você chega lá.</div>`;
  const n = Math.ceil((alvo-total)/media), quando = somaMeses(cur.y,cur.m,n);
  return `<div class="gprev">📅 No seu ritmo (${brl0(media)}/mês), você chega lá em <b>${MESES[quando.m].toLowerCase()} de ${quando.y}</b>${n>1?` (${n} meses)`:''}.</div>`;
}

const ICON_BUSCA = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/></svg>';
function telaLanc(){
  const M = mes(cur.y,cur.m), C = calc(cur.y,cur.m);
  let h = `<div class="busca">${ICON_BUSCA}<input id="fBusca" type="search" enterkeyhint="search" placeholder="Buscar em todos os meses" value="${esc(busca)}" autocomplete="off"><button class="x" data-act="limparBusca" aria-label="Limpar busca" ${busca?'':'hidden'}>×</button></div>
  <div id="resBusca">${busca ? resultadosBusca(busca) : ''}</div><div id="lancNormal" ${busca?'hidden':''}>`;
  h += `<div class="seg">
    <button class="${subLanc==='entradas'?'on':''}" data-sub="entradas">Entradas</button>
    <button class="${subLanc==='gastos'?'on':''}" data-sub="gastos">Gastos</button>
    <button class="${subLanc==='reservas'?'on':''}" data-sub="reservas">Reservas</button></div>`;
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
    if (C.faturaAnterior) h += `<div class="item"><div class="ic">💳</div><div class="tx"><div class="t1">Fatura do crédito <span class="tag auto">automático</span></div><div class="t2">Crédito usado em ${MESES[prevYM(cur.y,cur.m).m]}</div></div><div class="val num down">${brl(C.faturaAnterior)}</div></div>`;
    gs.forEach(g=>{
      const parc = ehParcelado(g);
      h += `<button class="item" data-edit="gastos" data-id="${g.id}"><div class="ic">${emojiCat(g.cat)}</div><div class="tx"><div class="t1">${esc(g.desc||nomeCat(g.cat))}</div><div class="t2">${esc(g.forma)}${parc?`<span class="tag cr">1/${g.parcelas} de ${brl(g.valor)}</span>`:g.forma==='Crédito'?'<span class="tag cr">fatura</span>':''}${g.data?' · '+fmtData(g.data):''} · ${g.essencial?'✅':'❌'}</div></div><div class="val num">${brl(parc?parcelasDoMes(cur.y,cur.m).find(x=>x.g===g).valor:g.valor)}</div></button>`; });
    parcOutras.forEach(x=>{
      h += `<button class="item" data-edit="gastos" data-id="${x.g.id}" data-mk="${x.origem}"><div class="ic">${emojiCat(x.g.cat)}</div><div class="tx"><div class="t1">${esc(x.g.desc||nomeCat(x.g.cat))}</div><div class="t2">Crédito<span class="tag cr">parcela ${x.i+1}/${x.n}</span> · compra em ${MESES[ymDe(x.origem).m].toLowerCase()}</div></div><div class="val num">${brl(x.valor)}</div></button>`; });
    if (!gs.length && !C.faturaAnterior && !parcOutras.length) h += vazio('🧾','Nenhum gasto neste mês','Toque no + para lançar.');
    h += `</div>`;
  }
  if (subLanc==='reservas'){
    h += `<div class="totalrow"><span>Total reservado/investido</span><b class="num">${brl(C.reservas)}</b></div><div class="list">`;
    M.reservas.forEach(r=>{ h += `<button class="item" data-edit="reservas" data-id="${r.id}"><div class="ic">${r.tipo==='Reserva de emergência'?'🛟':r.tipo==='Meta'?'🎯':'📈'}</div><div class="tx"><div class="t1">${esc(r.nome||r.tipo)}</div><div class="t2">${esc(r.tipo)}${r.data?' · '+fmtData(r.data):''}</div></div><div class="val num">${brl(r.valor)}</div></button>`; });
    if (!M.reservas.length) h += vazio('🛟','Nada reservado neste mês','Guarde para a reserva, para a meta ou invista.');
    h += `</div>`;
  }
  return h + `</div>`;
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
    M.gastos.forEach(g=>{ if (bate([g.desc, nomeCat(g.cat), g.forma], g.valor)) res.push({ k, tipo:'gastos', it:g, ic:emojiCat(g.cat), t:g.desc||nomeCat(g.cat),
      s:`${nomeCat(g.cat)} · ${g.forma}${ehParcelado(g)?` · ${g.parcelas}x`:''}${g.data?' · '+fmtData(g.data):''}`, v:-g.valor, d:g.data||k }); });
    M.entradas.forEach(e=>{ if (bate([e.nome,'entrada'], e.valor)) res.push({ k, tipo:'entradas', it:e, ic:'💰', t:e.nome, s:`Entrada${e.data?' · '+fmtData(e.data):''}`, v:e.valor, d:e.data||k }); });
    M.contas.forEach(c=>{ if (bate([c.nome,'conta'], c.pago?c.valor:c.planejado)) res.push({ k, tipo:'contas', it:c, ic:'📄', t:c.nome, s:c.pago?`Conta paga${c.data?' em '+fmtData(c.data):''}`:'Conta pendente', v:-(c.pago?c.valor:c.planejado), d:c.data||k }); });
    M.reservas.forEach(r=>{ if (bate([r.nome, r.tipo], r.valor)) res.push({ k, tipo:'reservas', it:r, ic:r.tipo==='Reserva de emergência'?'🛟':r.tipo==='Meta'?'🎯':'📈', t:r.nome||r.tipo, s:`${r.tipo}${r.data?' · '+fmtData(r.data):''}`, v:-r.valor, d:r.data||k }); });
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
  if (Mp.contas.length) h += `<button class="btn sec" data-act="copiarContas">Copiar contas de ${MESES[p.m]} (${Mp.contas.length})</button>`;
  h += `<p class="note" style="margin-top:12px">Marque ✓ quando pagar. Só as contas pagas entram nas saídas do mês. Ao começar um mês novo, suas contas são copiadas automaticamente.</p>`;
  return h;
}

function telaMetas(){
  const C = calc(cur.y,cur.m), p = S.perfil;
  return `<section class="card"><h3>Seu progresso</h3>${blocoMetas(C)}</section>
  ${cardOrcamentos(C)}
  <section class="card"><h3>Editar metas</h3>
    <div class="f"><label>Minha meta é</label><input id="mNome" value="${esc(p.metaNome)}" placeholder="Ex.: Carro, Viagem, Casa"></div>
    <div class="row2"><div class="f"><label>Quanto custa</label><input id="mValor" inputmode="decimal" value="${p.metaValor?p.metaValor.toLocaleString('pt-BR'):''}" placeholder="0,00"></div>
    <div class="f"><label>Reserva de emergência</label><input id="mRes" inputmode="decimal" value="${p.reservaMeta?p.reservaMeta.toLocaleString('pt-BR'):''}" placeholder="0,00"></div></div>
    <button class="btn pri" data-act="salvarMetas">Salvar metas</button>
    <p class="note">Para avançar, lance em Reservas com o tipo “Reserva de emergência” ou “Meta”.</p>
  </section>
  <button class="btn sec" data-tab="ajustes">⚙️ Ajustes, backup e instalação</button>`;
}

function telaAjustes(){
  const p = S.perfil;
  const ios = /iphone|ipad|ipod/i.test(navigator.userAgent);
  const instalado = matchMedia('(display-mode: standalone)').matches || navigator.standalone;
  const tema = S.tema || 'auto';
  return `<section class="card"><h3>Aparência</h3>
    <div class="temas">${[['auto','Automático'],['claro','☀️ Claro'],['escuro','🌙 Escuro']].map(([v,l])=>`<button class="${tema===v?'on':''}" data-act="tema" data-v="${v}">${l}</button>`).join('')}</div>
    <p class="note">Automático segue o modo claro/escuro do seu celular.</p></section>
  <section class="card"><h3>Perfil</h3>
    <div class="f"><label>Quero ser chamado(a) de</label><input id="pNome" value="${esc(p.nome)}"></div>
    <div class="f"><label>Meus pronomes são</label><select id="pPron">${['Masculinos','Femininos','Neutros'].map(o=>`<option ${o===p.pronome?'selected':''}>${o}</option>`).join('')}</select></div>
    <button class="btn pri" data-act="salvarPerfil">Salvar perfil</button></section>
  <section class="card"><h3>Saldo entre meses</h3>
    <div class="switch"><span>Levar o que sobrou para o mês seguinte</span><button class="tg ${S.carry?'on':''}" data-act="carry" aria-label="Alternar"></button></div>
    <p class="note">Ligado: o “restante para gastar” de um mês entra como entrada no próximo.</p></section>
  ${instalado?'':`<section class="card"><h3>Instalar no celular</h3>
    ${ios ? '<p class="note">No Safari, toque em <b>Compartilhar</b> e depois em <b>Adicionar à Tela de Início</b>.</p>'
          : `<button class="btn pri" data-act="instalar">📲 Instalar app</button><p class="note">Se o botão não funcionar, abra o menu do navegador e toque em “Instalar app” ou “Adicionar à tela inicial”.</p>`}</section>`}
  <section class="card"><h3>Backup dos dados</h3>
    <p class="note" style="margin:0 0 12px">Seus dados ficam só neste aparelho. Faça backup antes de trocar de celular ou limpar o navegador. Guarde o arquivo no Google Drive, iCloud, WhatsApp ou e-mail.</p>
    <p class="note" style="margin:0 0 12px">Último backup: <b>${S.ultimoBackup ? new Date(S.ultimoBackup).toLocaleDateString('pt-BR') + ` (${diasDesde(S.ultimoBackup)===0?'hoje':'há '+diasDesde(S.ultimoBackup)+' dias'})` : 'nunca'}</b>${S.novosDesdeBackup?` · ${S.novosDesdeBackup} lançamento${S.novosDesdeBackup>1?'s':''} desde então`:''}</p>
    <button class="btn sec" data-act="exportar">⬇️ Fazer backup</button>
    <button class="btn sec" data-act="importar">⬆️ Restaurar backup</button>
    <input type="file" id="fileImp" accept="application/json,.json" hidden></section>
  <button class="btn dan" data-act="zerar">Apagar todos os dados</button>`;
}

/* ---------- formulários (bottom sheet) ---------- */
const $ov = document.getElementById('overlay'), $sh = document.getElementById('sheet');
let form = null;
function abrir(html){ $sh.innerHTML = '<div class="grab"></div>'+html; $ov.classList.add('open'); const i=$sh.querySelector('input.money'); if(i&&!i.value) setTimeout(()=>i.focus(),250); }
function fechar(){ $ov.classList.remove('open'); form=null; }
$ov.addEventListener('click', e=>{ if(e.target===$ov) fechar(); });

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

function abrirForm(tipo, id, mk){
  const M = mk ? S.meses[mk] : mes(cur.y,cur.m);
  const it = id ? M[tipo].find(x=>x.id===id) : null;
  form = { tipo, id, mk, v:{} };
  const del = it ? `<button class="btn dan" data-act="excluir">Excluir</button>` : '';
  const topo = it ? '' : abasForm(tipo);
  if (tipo==='entradas'){
    form.v = { fixa: it?!!it.fixa:false };
    abrir(`${topo}<h2>${it?'Editar':'Nova'} entrada</h2>
      <div class="f"><label>Valor</label><input class="money num" id="fValor" inputmode="decimal" placeholder="0,00" value="${moneyVal(it&&it.valor)}"></div>
      <div class="f"><label>Nome</label><input id="fNome" placeholder="Ex.: Salário, Freela, Vendas" value="${esc(it?it.nome:'')}"></div>
      <div class="f"><label>Data</label><input type="date" id="fData" value="${it?it.data||'':dataPadrao()}"></div>
      <div class="switch f"><span>Repete todo mês <small class="muted">(ex.: salário)</small></span><button type="button" class="tg ${form.v.fixa?'on':''}" data-act="tgFixa"></button></div>
      <button class="btn pri" data-act="salvarForm">Salvar</button>${del}`);
  }
  if (tipo==='gastos'){
    form.v = { cat: it?it.cat:'', forma: it?it.forma:'Pix / Dinheiro', essencial: it?!!it.essencial:true, parcelas: it?(+it.parcelas||1):1 };
    const rec = it ? [] : recentes();
    abrir(`${topo}<h2>${it?'Editar':'Novo'} gasto</h2>
      <div class="f"><input class="money num big" id="fValor" inputmode="decimal" placeholder="R$ 0,00" aria-label="Valor" value="${moneyVal(it&&it.valor)}"></div>
      ${rec.length?`<div class="f"><label>Usados com frequência</label><div class="chips rec">${rec.map((g,i)=>`<button type="button" data-rec="${i}">${emojiCat(g.cat)} ${esc(g.desc||nomeCat(g.cat))}</button>`).join('')}</div></div>`:''}
      <div class="f"><label>Categoria</label><div class="catgrid">${CATEGORIAS.map(c=>`<button type="button" class="${c===form.v.cat?'on':''}" data-catsel="${esc(c)}"><span>${emojiCat(c)}</span>${esc(nomeCat(c))}</button>`).join('')}</div></div>
      <div class="f"><label>Forma de pagamento</label>${chips('forma',FORMAS,form.v.forma)}</div>
      <div class="f" id="boxParc" ${form.v.forma==='Crédito'?'':'hidden'}><label>Parcelas</label><select id="fParc">${Array.from({length:24},(_,i)=>i+1).map(n=>`<option value="${n}" ${n===form.v.parcelas?'selected':''}>${n===1?'À vista (1x)':n+'x'}</option>`).join('')}</select><div class="note" id="parcInfo"></div></div>
      <details class="mais" ${it?'open':''}><summary>Descrição, data e essencial</summary>
        <div class="f"><label>Descrição (opcional)</label><input id="fDesc" placeholder="Ex.: Feira da semana" value="${esc(it?it.desc||'':'')}"></div>
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
    form.v = { tipo: it?it.tipo:'Reserva de emergência' };
    abrir(`${topo}<h2>${it?'Editar':'Nova'} reserva ou investimento</h2>
      <div class="f"><label>Valor</label><input class="money num" id="fValor" inputmode="decimal" placeholder="0,00" value="${moneyVal(it&&it.valor)}"></div>
      <div class="f"><label>Tipo</label>${chips('tipo',TIPOS_RES,form.v.tipo)}</div>
      <div class="f"><label>Onde (opcional)</label><input id="fNome" placeholder="Ex.: Nubank, Tesouro, CDB" value="${esc(it?it.nome:'')}"></div>
      <div class="f"><label>Data</label><input type="date" id="fData" value="${it?it.data||'':dataPadrao()}"></div>
      <button class="btn pri" data-act="salvarForm">Salvar</button>${del}`);
  }
}
function infoParcelas(){
  const el = document.getElementById('parcInfo'); if (!el || !form) return;
  const n = +(document.getElementById('fParc')||{}).value || 1, v = parseValor((document.getElementById('fValor')||{}).value);
  el.textContent = n>1 && v ? `${n}x de ${brl(v/n)} · a primeira entra na fatura de ${MESES[nextYM(cur.y,cur.m).m]}` : '';
}
function selecionarCat(c){
  form.v.cat = c;
  $sh.querySelectorAll('[data-catsel]').forEach(b=>b.classList.toggle('on', b.dataset.catsel===c));
  if (!form.id){ form.v.essencial = ESSENCIAIS.includes(c);
    $sh.querySelectorAll('[data-chips="essencial"] button').forEach(b=>b.classList.toggle('on', b.dataset.v===(form.v.essencial?'Sim':'Não'))); }
}

function salvarForm(){
  const {tipo,id,v,mk} = form; const g = (x)=>{ const el=document.getElementById(x); return el?el.value.trim():''; };
  const M = mk ? S.meses[mk] : mes(cur.y,cur.m,true);
  let obj;
  if (tipo==='entradas'){
    const valor=parseValor(g('fValor')); if(!valor) return toast('Informe o valor');
    obj = { nome:g('fNome')||'Entrada', valor, data:g('fData'), fixa:v.fixa };
  }
  if (tipo==='gastos'){
    const valor=parseValor(g('fValor')); if(!valor) return toast('Informe o valor');
    if (!v.cat) return toast('Escolha a categoria');
    const parcelas = v.forma==='Crédito' ? (+g('fParc')||1) : 1;
    obj = { cat:v.cat, forma:v.forma, valor, data:g('fData'), essencial:v.essencial, desc:g('fDesc'), parcelas };
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
    const valor=parseValor(g('fValor')); if(!valor) return toast('Informe o valor');
    obj = { tipo:v.tipo, nome:g('fNome'), valor, data:g('fData') };
  }
  if (id){ const i=M[tipo].findIndex(x=>x.id===id); M[tipo][i] = {...M[tipo][i], ...obj}; }
  else { M[tipo].push({ id:uid(), ...obj }); S.novosDesdeBackup = (S.novosDesdeBackup||0) + 1; }
  salvar(); fechar();
  if (tipo!=='contas'){ aba='lanc'; subLanc=tipo; } else aba='contas';
  render();
  toast(tipo==='gastos' ? avisoOrcamento(obj.cat) : 'Salvo ✓');
}
// Mensagem depois de lançar um gasto numa categoria com orçamento.
function avisoOrcamento(c){
  const l = S.orcamentos[c]; if (!l) return 'Salvo ✓';
  const v = calc(cur.y,cur.m).cats[c]||0, pct = v/l*100;
  if (pct > 100) return `⚠️ ${nomeCat(c)}: orçamento estourado em ${brl(v-l)}`;
  if (pct >= 80) return `Atenção: ${nomeCat(c)} em ${pct.toFixed(0)}% do orçamento`;
  return `Salvo ✓ · ${nomeCat(c)}: resta ${brl(l-v)}`;
}

// Tela de orçamentos: um campo por categoria, com a média dos últimos 3 meses como referência.
function abrirOrcamentos(){
  const medias = {};
  CATEGORIAS.forEach(c=>{ let t=0,n=0; for (let i=1;i<=3;i++){ const o=somaMeses(cur.y,cur.m,-i), v=calc(o.y,o.m).cats[c]||0; if (temDados(S.meses[key(o.y,o.m)])){ t+=v; n++; } } medias[c] = n ? t/n : 0; });
  const algumaMedia = Object.values(medias).some(v=>v>0);
  abrir(`<h2>Orçamento mensal por categoria</h2>
    <p class="note" style="margin:-6px 0 14px">Deixe em branco as categorias sem limite.${algumaMedia?' Abaixo de cada uma, a sua média dos últimos 3 meses.':''}</p>
    ${algumaMedia?'<button class="btn sec" data-act="orcMedia" style="margin-bottom:14px">Preencher com as minhas médias</button>':''}
    <div class="orclist">${CATEGORIAS.map((c,i)=>`<div class="orc"><span class="lbl">${emojiCat(c)} ${esc(nomeCat(c))}${medias[c]?`<small>média ${brl0(medias[c])}</small>`:''}</span>
      <input class="num" inputmode="decimal" data-orc="${i}" data-media="${Math.round(medias[c])}" placeholder="—" value="${S.orcamentos[c]?moneyVal(S.orcamentos[c]):''}"></div>`).join('')}</div>
    <button class="btn pri" data-act="salvarOrc" style="margin-top:14px">Salvar orçamentos</button>`);
}

/* ---------- eventos ---------- */
let deferredPrompt = null;
window.addEventListener('beforeinstallprompt', e=>{ e.preventDefault(); deferredPrompt=e; });

document.addEventListener('click', e=>{
  const evo = e.target.closest('[data-evo]');
  if (evo){ evoSel = evo.dataset.evo; render(); return; }
  const t = e.target.closest('[data-act],[data-tab],[data-sub],[data-edit],[data-new],[data-pay],[data-chips] button,[data-cat],[data-catsel],[data-rec]');
  if (!t) return;
  if (t.parentElement && t.parentElement.dataset.chips){
    const name = t.parentElement.dataset.chips;
    t.parentElement.querySelectorAll('button').forEach(b=>b.classList.toggle('on', b===t));
    form.v[name] = name==='essencial' ? t.dataset.v==='Sim' : t.dataset.v;
    if (name==='forma'){ const bp = document.getElementById('boxParc'); if (bp) bp.hidden = form.v.forma!=='Crédito'; if (form.v.forma==='Crédito') toast('Crédito: entra na fatura do mês seguinte'); }
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
  if (t.dataset.tab){ fechar(); aba=t.dataset.tab; render(); scrollTo(0,0); return; }
  if (t.dataset.sub){ subLanc=t.dataset.sub; render(); return; }
  if (t.dataset.edit){ abrirForm(t.dataset.edit, t.dataset.id, t.dataset.mk); return; }
  if (t.dataset.new){ const v = document.getElementById('fValor'); const val = v ? v.value : ''; abrirForm(t.dataset.new); const n = document.getElementById('fValor'); if (n && val) n.value = val; return; }
  if (t.dataset.pay){
    const M = mes(cur.y,cur.m,true), c = M.contas.find(x=>x.id===t.dataset.pay);
    c.pago = !c.pago;
    if (c.pago){ if(!c.valor) c.valor = c.planejado; c.data = c.data || dataHoje(); } else { c.valor = 0; c.data=''; }
    salvar(); render(); return;
  }
  const a = t.dataset.act;
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
    const novo = {}; $sh.querySelectorAll('[data-orc]').forEach(i=>{ const v = parseValor(i.value); if (v>0) novo[CATEGORIAS[+i.dataset.orc]] = v; });
    S.orcamentos = novo; salvar(); fechar(); render(); toast('Orçamentos salvos ✓');
  }
  else if (a==='salvarOrcCat'){
    const v = parseValor(document.getElementById('oCat').value), c = t.dataset.c;
    if (v>0) S.orcamentos[c] = v; else delete S.orcamentos[c];
    salvar(); fechar(); render(); toast(v>0 ? 'Orçamento salvo ✓' : 'Limite removido');
  }
  else if (a==='salvarMetas'){
    const v=(i)=>document.getElementById(i).value;
    S.perfil.metaNome = v('mNome').trim(); S.perfil.metaValor = parseValor(v('mValor')); S.perfil.reservaMeta = parseValor(v('mRes'));
    salvar(); render(); toast('Metas salvas ✓');
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
  else if (a==='adiarBackup'){ S.backupAdiado = new Date().toISOString(); salvar(); render(); toast('Vamos lembrar de novo em 3 dias'); }
  else if (a==='importar'){ document.getElementById('fileImp').click(); }
  else if (a==='zerar'){
    if (!confirm('Apagar TODOS os dados deste aparelho? Isso não pode ser desfeito.')) return;
    const lib = S.liberado; S = novoEstado(); S.liberado = lib; salvar(); aba='resumo'; render();
  }
  else if (a==='onbOk'){
    const v=(i)=>document.getElementById(i).value.trim();
    if (!v('oNome')) return toast('Como podemos te chamar?');
    S.perfil = { nome:v('oNome'), pronome:document.getElementById('oPron').value, metaNome:v('oMeta'),
      metaValor:parseValor(v('oMetaV')), reservaMeta:parseValor(v('oRes')), ok:true };
    salvar(); render();
  }
  else if (a==='liberar'){
    const c = document.getElementById('aCod').value.trim();
    if (!c) return toast('Digite o e-mail da compra');
    fetch('api/liberar', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({codigo:c, aparelho:idAparelho()}) })
      .then(r => r.json().then(d => ({ok:r.ok, d})))
      .then(({ok,d}) => { if (ok && d.ok){ S.liberado=true; salvar(); render(); } else toast(d.erro || 'Código inválido'); })
      .catch(() => toast('Sem internet. Conecte-se para liberar o acesso.'));
  }
});

// Gera o arquivo de backup. No celular, abre o menu de compartilhar (salvar em Arquivos, Drive, WhatsApp, e-mail);
// onde não houver, baixa o arquivo.
function fazerBackup(){
  const nome = 'backup-financas-'+dataHoje()+'.json';
  const marcar = () => { S.ultimoBackup = new Date().toISOString(); S.novosDesdeBackup = 0; S.backupAdiado = null; salvar(); render(); toast('Backup feito ✓'); };
  const dados = JSON.stringify({ ...S, backupEm: new Date().toISOString() }, null, 2);
  let arquivo = null;
  try { arquivo = new File([dados], nome, { type:'application/json' }); } catch(e){}
  if (arquivo && navigator.canShare && navigator.canShare({ files:[arquivo] }) && matchMedia('(pointer:coarse)').matches){
    navigator.share({ files:[arquivo], title:'Backup Organização Financeira' })
      .then(marcar)
      .catch(err => { if (err && err.name !== 'AbortError') baixar(); });
    return;
  }
  baixar();
  function baixar(){
    const l = document.createElement('a'); l.href = URL.createObjectURL(new Blob([dados],{type:'application/json'}));
    l.download = nome; document.body.appendChild(l); l.click(); l.remove(); setTimeout(()=>URL.revokeObjectURL(l.href),1000);
    marcar();
  }
}

document.addEventListener('input', e=>{
  if (e.target.id==='fValor' || e.target.id==='fParc') infoParcelas();
  if (e.target.id==='fBusca'){
    busca = e.target.value;
    memo = {}; memoParc = null;
    document.getElementById('resBusca').innerHTML = busca.trim() ? resultadosBusca(busca) : '';
    document.getElementById('lancNormal').hidden = !!busca.trim();
    document.querySelector('.busca .x').hidden = !busca;
  }
});
document.addEventListener('change', e=>{
  if (e.target.id==='fParc') return infoParcelas();
  if (e.target.id!=='fileImp' || !e.target.files[0]) return;
  const r = new FileReader();
  r.onload = () => { try {
      const d = JSON.parse(r.result); if (!d.meses || !d.perfil) throw 0;
      if (!confirm('Substituir os dados atuais pelo backup?')) return;
      d.liberado = S.liberado || d.liberado; delete d.backupEm; S = d; migrar(); S.novosDesdeBackup = 0; S.ultimoBackup = S.ultimoBackup || new Date().toISOString(); salvar(); render(); toast('Backup restaurado ✓');
    } catch(_){ toast('Arquivo de backup inválido'); } };
  r.readAsText(e.target.files[0]);
});
document.addEventListener('keydown', e=>{ if(e.key==='Escape') fechar(); if(e.key==='Enter' && form && e.target.tagName==='INPUT') salvarForm(); });

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
  </div></div>`;
}
function renderAcesso(){
  $app.innerHTML = `<div class="onb"><div class="in">
    <img class="logo" src="icons/icon-192.png" alt="">
    <h1>${esc(CONFIG.nomeApp)}</h1>
    <p>Digite o e-mail que você usou na compra para liberar o app neste aparelho.</p>
    <div class="f"><label>E-mail da compra (ou código de acesso)</label><input id="aCod" type="email" inputmode="email" autocapitalize="none" autocomplete="email" placeholder="seuemail@exemplo.com"></div>
    <button class="btn pri" data-act="liberar">Liberar acesso</button>
  </div></div>`;
}

render();
if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
  window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(()=>{}));
}
