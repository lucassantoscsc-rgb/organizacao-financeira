/* =========================================================
   Organização Financeira — app PWA
   Todos os dados ficam salvos no próprio aparelho (localStorage).
   ========================================================= */

const CONFIG = {
  nomeApp: 'Organização Financeira',
  // true = pede código de acesso na primeira abertura.
  // Os códigos válidos ficam na Vercel (variável ACCESS_CODES), não aqui.
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
const CATEGORIAS = ['🧾 Parcela','🧾 Contas','🧺 Mercado','🍗 Alimentação','⛽ Gasolina','🚗 Transporte','🏠 Casa','💊 Saúde',
  '📦 Compras Online','👕 Vestuário','🎉 Lazer','📚 Educação','📱 Assinaturas','💄 Beleza','🐾 Pets','🎁 Presentes','❓ Outros'];
const FORMAS = ['Pix / Dinheiro','Débito','Crédito'];
const TIPOS_RES = ['Reserva de emergência','Meta','Renda Fixa','Renda Variável','Outros'];

/* ---------- estado ---------- */
function novoEstado(){
  return { v:1, liberado:false,
    perfil:{ nome:'', pronome:'Masculinos', metaNome:'', metaValor:0, reservaMeta:0, ok:false },
    carry:true, meses:{} };
}
let S;
try { S = JSON.parse(localStorage.getItem(STORE_KEY)) || novoEstado(); } catch(e){ S = novoEstado(); }
function salvar(){ try { localStorage.setItem(STORE_KEY, JSON.stringify(S)); } catch(e){ toast('Não foi possível salvar no aparelho'); } }

const hoje = new Date();
let cur = { y: hoje.getFullYear(), m: hoje.getMonth() };   // mês aberto
let aba = 'resumo', subLanc = 'gastos';

/* ---------- utilidades ---------- */
const brl = (n) => (n<0?'-':'') + 'R$ ' + Math.abs(n||0).toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2});
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
const prevYM = (y,m) => m===0 ? {y:y-1,m:11} : {y,m:m-1};
const nextYM = (y,m) => m===11 ? {y:y+1,m:0} : {y,m:m+1};
const fmtData = (d) => d ? d.split('-').reverse().slice(0,2).join('/') : '';
const soma = (arr,f) => arr.reduce((a,x)=>a+(+f(x)||0),0);
function mes(y,m,criar){
  const k = key(y,m);
  if (!S.meses[k] && criar) S.meses[k] = { entradas:[], gastos:[], contas:[], reservas:[] };
  return S.meses[k] || { entradas:[], gastos:[], contas:[], reservas:[] };
}
// Identificação aleatória deste aparelho (para cada código liberar um só celular).
function idAparelho(){
  let id; try { id = localStorage.getItem('orgfin:aparelho'); } catch(e){}
  if (!id){ id = (crypto.randomUUID ? crypto.randomUUID() : Date.now()+'-'+Math.random().toString(36).slice(2));
    try { localStorage.setItem('orgfin:aparelho', id); } catch(e){} }
  return id;
}
function toast(msg){ const t=document.getElementById('toast'); t.textContent=msg; t.classList.add('show'); clearTimeout(t._h); t._h=setTimeout(()=>t.classList.remove('show'),2200); }

/* ---------- cálculos (mesma lógica da planilha) ---------- */
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

  const entradasLanc = soma(M.entradas, e=>e.valor);
  const saldoAnterior = (S.carry && P) ? P.restante : 0;
  const faturaAnterior = P ? P.credito : 0;            // crédito do mês passado vira saída agora
  const gastosVista = soma(M.gastos.filter(g=>g.forma!=='Crédito'), g=>g.valor);
  const credito = soma(M.gastos.filter(g=>g.forma==='Crédito'), g=>g.valor);
  const debito = soma(M.gastos.filter(g=>g.forma==='Débito'), g=>g.valor);
  const pix = soma(M.gastos.filter(g=>g.forma==='Pix / Dinheiro'), g=>g.valor);
  const contasPagas = soma(M.contas.filter(c=>c.pago), c=>c.valor);
  const contasPend = soma(M.contas.filter(c=>!c.pago), c=>c.planejado||c.valor);
  const contasPlan = soma(M.contas, c=>c.planejado||c.valor);
  const reservas = soma(M.reservas, r=>r.valor);
  const resEmerg = soma(M.reservas.filter(r=>r.tipo==='Reserva de emergência'), r=>r.valor);
  const resMeta = soma(M.reservas.filter(r=>r.tipo==='Meta'), r=>r.valor);

  const entradas = entradasLanc + saldoAnterior;
  const saidas = gastosVista + contasPagas + faturaAnterior;
  const restante = entradas - saidas - reservas;

  const cats = {};
  M.gastos.forEach(g=>{ cats[g.cat] = (cats[g.cat]||0) + (+g.valor||0); });
  if (faturaAnterior) cats['💳 Fatura do cartão'] = (cats['💳 Fatura do cartão']||0) + faturaAnterior;
  if (contasPagas) cats['📄 Contas fixas'] = (cats['📄 Contas fixas']||0) + contasPagas;

  const essenciais = soma(M.gastos.filter(g=>g.essencial), g=>g.valor);

  const acumEm = (P ? P.acumEmerg : 0) + resEmerg;
  const acumMt = (P ? P.acumMeta : 0) + resMeta;

  return memo[k] = { entradas, entradasLanc, saldoAnterior, faturaAnterior, saidas, reservas, restante,
    debito, credito, pix, gastosVista, contasPagas, contasPend, contasPlan, cats, essenciais,
    resEmerg, resMeta, acumEmerg:acumEm, acumMeta:acumMt, P };
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
  memo = {};
  if (CONFIG.exigirCodigo && !S.liberado) return renderAcesso();
  if (!S.perfil.ok) return renderOnboarding();
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
      ${navBtn('contas','Contas')}${navBtn('metas','Metas')}
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
  </section>
  <div class="grid">
    ${stat('Entradas','#0f9f6e',C.entradas, variacao(C.entradas, P&&P.entradas, false))}
    ${stat('Saídas','#d64045',C.saidas, variacao(C.saidas, P&&P.saidas, true))}
    ${stat('Reservas & invest.','#14b8a6',C.reservas, variacao(C.reservas, P&&P.reservas, false))}
    ${stat('Uso do débito','#5f7472',C.debito, variacao(C.debito, P&&P.debito, true))}
    ${stat('Uso do crédito','#b7791f',C.credito, variacao(C.credito, P&&P.credito, true))}
    ${stat('Pix / dinheiro','#0f766e',C.pix, variacao(C.pix, P&&P.pix, true))}
  </div>`;
  if (C.credito > 0) html += `<div class="alert"><span>💳</span><div><b>${brl(C.credito)} no crédito</b> ainda não saiu do seu saldo. Esse valor entra automaticamente como fatura nas saídas de ${MESES[prox.m]}.</div></div>`;
  if (C.faturaAnterior > 0) html += `<div class="alert" style="background:#eef6f5;color:var(--deep)"><span>📥</span><div>A fatura de <b>${brl(C.faturaAnterior)}</b> do crédito usado em ${MESES[prevYM(cur.y,cur.m).m]} já está somada nas saídas deste mês.</div></div>`;

  html += `<section class="card"><h3>Metas <small>acumulado até ${MESES[cur.m].toLowerCase()}</small></h3>${blocoMetas(C)}</section>`;

  // fluxo de contas
  const tot = C.contasPagas + C.contasPend;
  html += `<section class="card"><h3>Fluxo de contas <small>${brl(C.contasPlan)} planejado</small></h3>`;
  if (tot>0){
    const pp = C.contasPagas/tot*100;
    html += `<div class="split"><div style="width:${pp}%;background:var(--teal)"></div><div style="width:${100-pp}%;background:#f2c1c3"></div></div>
    <div class="legend"><span><i style="background:var(--teal)"></i>Pagas ${brl(C.contasPagas)}</span><span><i style="background:#f2c1c3"></i>Pendentes ${brl(C.contasPend)}</span></div>`;
  } else html += `<div class="note">Nenhuma conta cadastrada neste mês.</div>`;
  html += `</section>`;

  // categorias
  const cats = Object.entries(C.cats).filter(([,v])=>v>0).sort((a,b)=>b[1]-a[1]);
  const totCat = soma(cats, c=>c[1]);
  html += `<section class="card"><h3>Alocação por categoria <small>${brl(totCat)}</small></h3>`;
  if (cats.length){
    cats.forEach(([c,v])=>{ html += `<div class="cat"><span>${esc(c)}</span><span class="num">${brl(v)} · ${(v/totCat*100).toFixed(0)}%</span><div class="bar"><div style="width:${v/cats[0][1]*100}%"></div></div></div>`; });
    const gTot = soma(mes(cur.y,cur.m).gastos, g=>g.valor);
    if (gTot>0) html += `<div class="note">✅ Essenciais: ${brl(C.essenciais)} · ❌ Não essenciais: ${brl(gTot-C.essenciais)}</div>`;
  } else html += `<div class="note">Seus gastos por categoria aparecem aqui.</div>`;
  html += `</section>`;
  return html;
}
const stat = (k,cor,v,d) => `<div class="stat"><div class="k"><i style="background:${cor}"></i>${k}</div><div class="v num">${brl(v)}</div>${d}</div>`;

function blocoMetas(C){
  const p = S.perfil; let h='';
  const g = (nome, alvo, total, mesV) => {
    const pct = alvo>0 ? Math.min(100, total/alvo*100) : 0;
    return `<div class="goal"><div class="row"><b>${esc(nome)}</b><span class="num">${brl(total)} de ${brl(alvo)}</span></div>
      <div class="bar"><div style="width:${pct}%"></div></div>
      <div class="foot num"><span>+${brl(mesV)} este mês</span><span>Faltam ${brl(Math.max(0,alvo-total))} · ${pct.toFixed(0)}%</span></div></div>`;
  };
  if (p.reservaMeta>0) h += g('🛟 Reserva de emergência', p.reservaMeta, C.acumEmerg, C.resEmerg);
  if (p.metaValor>0) h += g('🎯 '+(p.metaNome||'Minha meta'), p.metaValor, C.acumMeta, C.resMeta);
  return h || `<div class="note">Defina sua meta e sua reserva em Metas.</div>`;
}

function telaLanc(){
  const M = mes(cur.y,cur.m), C = calc(cur.y,cur.m);
  let h = `<div class="seg">
    <button class="${subLanc==='entradas'?'on':''}" data-sub="entradas">Entradas</button>
    <button class="${subLanc==='gastos'?'on':''}" data-sub="gastos">Gastos</button>
    <button class="${subLanc==='reservas'?'on':''}" data-sub="reservas">Reservas</button></div>`;
  if (subLanc==='entradas'){
    const tot = C.entradas;
    h += `<div class="totalrow"><span>Total de entradas</span><b class="num">${brl(tot)}</b></div><div class="list">`;
    if (C.saldoAnterior) h += `<div class="item"><div class="ic">↪️</div><div class="tx"><div class="t1">Saldo do mês anterior <span class="tag auto">automático</span></div><div class="t2">${tot?(C.saldoAnterior/tot*100).toFixed(1):0}% das entradas</div></div><div class="val num">${brl(C.saldoAnterior)}</div></div>`;
    M.entradas.forEach(e=>{ h += `<button class="item" data-edit="entradas" data-id="${e.id}"><div class="ic">💰</div><div class="tx"><div class="t1">${esc(e.nome)}</div><div class="t2">${tot?(e.valor/tot*100).toFixed(1):0}% das entradas${e.data?' · '+fmtData(e.data):''}</div></div><div class="val num up">${brl(e.valor)}</div></button>`; });
    if (!M.entradas.length && !C.saldoAnterior) h += vazio('💰','Nenhuma entrada neste mês','Adicione seu salário, renda extra ou vendas.');
    h += `</div>`;
  }
  if (subLanc==='gastos'){
    const gs = [...M.gastos].sort((a,b)=>(b.data||'').localeCompare(a.data||''));
    h += `<div class="totalrow"><span>Total de gastos</span><b class="num">${brl(soma(gs,g=>g.valor))}</b></div><div class="list">`;
    if (C.faturaAnterior) h += `<div class="item"><div class="ic">💳</div><div class="tx"><div class="t1">Fatura do crédito <span class="tag auto">automático</span></div><div class="t2">Crédito usado em ${MESES[prevYM(cur.y,cur.m).m]}</div></div><div class="val num down">${brl(C.faturaAnterior)}</div></div>`;
    gs.forEach(g=>{ const [ic,...rest]=g.cat.split(' ');
      h += `<button class="item" data-edit="gastos" data-id="${g.id}"><div class="ic">${ic}</div><div class="tx"><div class="t1">${esc(g.desc||rest.join(' '))}</div><div class="t2">${esc(g.forma)}${g.forma==='Crédito'?'<span class="tag cr">fatura</span>':''}${g.data?' · '+fmtData(g.data):''} · ${g.essencial?'✅':'❌'}</div></div><div class="val num">${brl(g.valor)}</div></button>`; });
    if (!gs.length && !C.faturaAnterior) h += vazio('🧾','Nenhum gasto neste mês','Toque no + para lançar.');
    h += `</div>`;
  }
  if (subLanc==='reservas'){
    h += `<div class="totalrow"><span>Total reservado/investido</span><b class="num">${brl(C.reservas)}</b></div><div class="list">`;
    M.reservas.forEach(r=>{ h += `<button class="item" data-edit="reservas" data-id="${r.id}"><div class="ic">${r.tipo==='Reserva de emergência'?'🛟':r.tipo==='Meta'?'🎯':'📈'}</div><div class="tx"><div class="t1">${esc(r.nome||r.tipo)}</div><div class="t2">${esc(r.tipo)}${r.data?' · '+fmtData(r.data):''}</div></div><div class="val num">${brl(r.valor)}</div></button>`; });
    if (!M.reservas.length) h += vazio('🛟','Nada reservado neste mês','Guarde para a reserva, para a meta ou invista.');
    h += `</div>`;
  }
  return h;
}
const vazio = (e,t,s) => `<div class="empty"><div class="e">${e}</div><b>${t}</b><div>${s}</div></div>`;

function telaContas(){
  const M = mes(cur.y,cur.m), C = calc(cur.y,cur.m);
  const p = prevYM(cur.y,cur.m), Mp = mes(p.y,p.m);
  let h = `<div class="totalrow"><span>Pagas <b class="num">${brl(C.contasPagas)}</b></span><span>Pendentes <b class="num">${brl(C.contasPend)}</b></span></div><div class="list">`;
  M.contas.forEach(c=>{
    const dif = c.pago && c.planejado && Math.abs(c.valor-c.planejado)>0.004;
    h += `<div class="item"><button class="check ${c.pago?'on':''}" data-pay="${c.id}" aria-label="Marcar como paga">${c.pago?'✓':''}</button>
    <button class="tx" style="text-align:left" data-edit="contas" data-id="${c.id}"><div class="t1">${esc(c.nome)}</div>
    <div class="t2">${c.pago ? 'Paga'+(c.data?' em '+fmtData(c.data):'') : 'Pendente'}${c.planejado?' · planejado '+brl(c.planejado):''}${dif?` <span class="tag ${c.valor>c.planejado?'cr':''}">${c.valor>c.planejado?'+':'−'}${brl(Math.abs(c.valor-c.planejado))}</span>`:''}</div></button>
    <div class="val num" style="${c.pago?'':'color:var(--muted)'}">${brl(c.pago?c.valor:(c.planejado||c.valor))}</div></div>`;
  });
  if (!M.contas.length) h += vazio('📄','Nenhuma conta neste mês','Cadastre aluguel, energia, internet, parcelas…');
  h += `</div><button class="btn sec" data-act="addConta">+ Adicionar conta</button>`;
  if (Mp.contas.length) h += `<button class="btn sec" data-act="copiarContas">Copiar contas de ${MESES[p.m]} (${Mp.contas.length})</button>`;
  h += `<p class="note" style="margin-top:12px">Marque ✓ quando pagar. Só as contas pagas entram nas saídas do mês.</p>`;
  return h;
}

function telaMetas(){
  const C = calc(cur.y,cur.m), p = S.perfil;
  return `<section class="card"><h3>Seu progresso</h3>${blocoMetas(C)}</section>
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
  return `<section class="card"><h3>Perfil</h3>
    <div class="f"><label>Quero ser chamado(a) de</label><input id="pNome" value="${esc(p.nome)}"></div>
    <div class="f"><label>Meus pronomes são</label><select id="pPron">${['Masculinos','Femininos','Neutros'].map(o=>`<option ${o===p.pronome?'selected':''}>${o}</option>`).join('')}</select></div>
    <button class="btn pri" data-act="salvarPerfil">Salvar perfil</button></section>
  <section class="card"><h3>Saldo entre meses</h3>
    <div class="switch"><span>Levar o que sobrou para o mês seguinte</span><button class="tg ${S.carry?'on':''}" data-act="carry" aria-label="Alternar"></button></div>
    <p class="note">Ligado: o “restante para gastar” de um mês entra como entrada no próximo, igual à planilha.</p></section>
  ${instalado?'':`<section class="card"><h3>Instalar no celular</h3>
    ${ios ? '<p class="note">No Safari, toque em <b>Compartilhar</b> e depois em <b>Adicionar à Tela de Início</b>.</p>'
          : `<button class="btn pri" data-act="instalar">📲 Instalar app</button><p class="note">Se o botão não funcionar, abra o menu do navegador e toque em “Instalar app” ou “Adicionar à tela inicial”.</p>`}</section>`}
  <section class="card"><h3>Backup dos dados</h3>
    <p class="note" style="margin:0 0 12px">Seus dados ficam só neste aparelho. Faça backup antes de trocar de celular ou limpar o navegador.</p>
    <button class="btn sec" data-act="exportar">⬇️ Baixar backup</button>
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

function abrirForm(tipo, id){
  const M = mes(cur.y,cur.m);
  const it = id ? M[tipo].find(x=>x.id===id) : null;
  form = { tipo, id, v:{} };
  const del = it ? `<button class="btn dan" data-act="excluir">Excluir</button>` : '';
  if (tipo==='escolher'){
    return abrir(`<h2>Novo lançamento</h2>
      <button class="btn sec" data-new="gastos">🧾 Gasto</button>
      <button class="btn sec" data-new="entradas">💰 Entrada</button>
      <button class="btn sec" data-new="contas">📄 Conta fixa</button>
      <button class="btn sec" data-new="reservas">🛟 Reserva ou investimento</button>`);
  }
  if (tipo==='entradas'){
    form.v = { };
    abrir(`<h2>${it?'Editar':'Nova'} entrada</h2>
      <div class="f"><label>Valor</label><input class="money num" id="fValor" inputmode="decimal" placeholder="0,00" value="${moneyVal(it&&it.valor)}"></div>
      <div class="f"><label>Nome</label><input id="fNome" placeholder="Ex.: Salário, Freela, Vendas" value="${esc(it?it.nome:'')}"></div>
      <div class="f"><label>Data</label><input type="date" id="fData" value="${it?it.data||'':dataPadrao()}"></div>
      <button class="btn pri" data-act="salvarForm">Salvar</button>${del}`);
  }
  if (tipo==='gastos'){
    form.v = { cat: it?it.cat:CATEGORIAS[2], forma: it?it.forma:'Pix / Dinheiro', essencial: it?!!it.essencial:true };
    abrir(`<h2>${it?'Editar':'Novo'} gasto</h2>
      <div class="f"><label>Valor</label><input class="money num" id="fValor" inputmode="decimal" placeholder="0,00" value="${moneyVal(it&&it.valor)}"></div>
      <div class="f"><label>Forma de pagamento</label>${chips('forma',FORMAS,form.v.forma)}</div>
      <div class="f"><label>Categoria</label><select id="fCat">${CATEGORIAS.map(c=>`<option ${c===form.v.cat?'selected':''}>${c}</option>`).join('')}</select></div>
      <div class="f"><label>Descrição (opcional)</label><input id="fDesc" placeholder="Ex.: Feira da semana" value="${esc(it?it.desc||'':'')}"></div>
      <div class="row2"><div class="f"><label>Data</label><input type="date" id="fData" value="${it?it.data||'':dataPadrao()}"></div>
      <div class="f"><label>Essencial?</label>${chips('essencial',['Sim','Não'],form.v.essencial?'Sim':'Não')}</div></div>
      <button class="btn pri" data-act="salvarForm">Salvar</button>${del}`);
  }
  if (tipo==='contas'){
    form.v = { pago: it?!!it.pago:false };
    abrir(`<h2>${it?'Editar':'Nova'} conta</h2>
      <div class="f"><label>Nome</label><input id="fNome" placeholder="Ex.: Aluguel, Energia, Internet" value="${esc(it?it.nome:'')}"></div>
      <div class="row2"><div class="f"><label>Planejado</label><input class="num" id="fPlan" inputmode="decimal" placeholder="0,00" value="${moneyVal(it&&it.planejado)}"></div>
      <div class="f"><label>Valor pago</label><input class="num" id="fValor" inputmode="decimal" placeholder="igual ao planejado" value="${it&&it.pago?moneyVal(it.valor):''}"></div></div>
      <div class="switch f"><span>Já paguei</span><button type="button" class="tg ${form.v.pago?'on':''}" data-act="tgPago"></button></div>
      <div class="f"><label>Data do pagamento</label><input type="date" id="fData" value="${it?it.data||'':''}"></div>
      <button class="btn pri" data-act="salvarForm">Salvar</button>${del}`);
  }
  if (tipo==='reservas'){
    form.v = { tipo: it?it.tipo:'Reserva de emergência' };
    abrir(`<h2>${it?'Editar':'Nova'} reserva ou investimento</h2>
      <div class="f"><label>Valor</label><input class="money num" id="fValor" inputmode="decimal" placeholder="0,00" value="${moneyVal(it&&it.valor)}"></div>
      <div class="f"><label>Tipo</label>${chips('tipo',TIPOS_RES,form.v.tipo)}</div>
      <div class="f"><label>Onde (opcional)</label><input id="fNome" placeholder="Ex.: Nubank, Tesouro, CDB" value="${esc(it?it.nome:'')}"></div>
      <div class="f"><label>Data</label><input type="date" id="fData" value="${it?it.data||'':dataPadrao()}"></div>
      <button class="btn pri" data-act="salvarForm">Salvar</button>${del}`);
  }
}

function salvarForm(){
  const {tipo,id,v} = form; const g = (x)=>{ const el=document.getElementById(x); return el?el.value.trim():''; };
  const M = mes(cur.y,cur.m,true);
  let obj;
  if (tipo==='entradas'){
    const valor=parseValor(g('fValor')); if(!valor) return toast('Informe o valor');
    obj = { nome:g('fNome')||'Entrada', valor, data:g('fData') };
  }
  if (tipo==='gastos'){
    const valor=parseValor(g('fValor')); if(!valor) return toast('Informe o valor');
    obj = { cat:g('fCat'), forma:v.forma, valor, data:g('fData'), essencial:v.essencial, desc:g('fDesc') };
  }
  if (tipo==='contas'){
    const nome=g('fNome'); if(!nome) return toast('Dê um nome para a conta');
    const planejado=parseValor(g('fPlan')); let valor=parseValor(g('fValor'));
    if (v.pago && !valor) valor = planejado;
    if (!planejado && !valor) return toast('Informe o valor planejado');
    obj = { nome, planejado, valor: v.pago?valor:0, pago:v.pago, data: v.pago?(g('fData')||dataHoje()):'' };
  }
  if (tipo==='reservas'){
    const valor=parseValor(g('fValor')); if(!valor) return toast('Informe o valor');
    obj = { tipo:v.tipo, nome:g('fNome'), valor, data:g('fData') };
  }
  if (id){ const i=M[tipo].findIndex(x=>x.id===id); M[tipo][i] = {...M[tipo][i], ...obj}; }
  else M[tipo].push({ id:uid(), ...obj });
  salvar(); fechar();
  if (tipo!=='contas'){ aba='lanc'; subLanc=tipo; } else aba='contas';
  render(); toast('Salvo ✓');
}

/* ---------- eventos ---------- */
let deferredPrompt = null;
window.addEventListener('beforeinstallprompt', e=>{ e.preventDefault(); deferredPrompt=e; });

document.addEventListener('click', e=>{
  const t = e.target.closest('[data-act],[data-tab],[data-sub],[data-edit],[data-new],[data-pay],[data-chips] button');
  if (!t) return;
  if (t.parentElement && t.parentElement.dataset.chips){
    const name = t.parentElement.dataset.chips;
    t.parentElement.querySelectorAll('button').forEach(b=>b.classList.toggle('on', b===t));
    form.v[name] = name==='essencial' ? t.dataset.v==='Sim' : t.dataset.v;
    if (name==='forma' && form.v.forma==='Crédito') toast('Crédito: entra como fatura no mês seguinte');
    return;
  }
  if (t.dataset.tab){ aba=t.dataset.tab; render(); scrollTo(0,0); return; }
  if (t.dataset.sub){ subLanc=t.dataset.sub; render(); return; }
  if (t.dataset.edit){ abrirForm(t.dataset.edit, t.dataset.id); return; }
  if (t.dataset.new){ abrirForm(t.dataset.new); return; }
  if (t.dataset.pay){
    const M = mes(cur.y,cur.m,true), c = M.contas.find(x=>x.id===t.dataset.pay);
    c.pago = !c.pago;
    if (c.pago){ if(!c.valor) c.valor = c.planejado; c.data = c.data || dataHoje(); } else { c.valor = 0; c.data=''; }
    salvar(); render(); return;
  }
  const a = t.dataset.act;
  if (a==='prev'){ cur = prevYM(cur.y,cur.m); render(); }
  else if (a==='next'){ cur = nextYM(cur.y,cur.m); render(); }
  else if (a==='add'){ abrirForm(aba==='contas'?'contas': aba==='lanc'?subLanc:'escolher'); }
  else if (a==='addConta'){ abrirForm('contas'); }
  else if (a==='salvarForm'){ salvarForm(); }
  else if (a==='tgPago'){ form.v.pago=!form.v.pago; t.classList.toggle('on',form.v.pago); }
  else if (a==='excluir'){
    if (!confirm('Excluir este lançamento?')) return;
    const M = mes(cur.y,cur.m,true); M[form.tipo] = M[form.tipo].filter(x=>x.id!==form.id);
    salvar(); fechar(); render(); toast('Excluído');
  }
  else if (a==='copiarContas'){
    const p = prevYM(cur.y,cur.m), Mp = mes(p.y,p.m), M = mes(cur.y,cur.m,true);
    const existentes = new Set(M.contas.map(c=>c.nome.toLowerCase()));
    let n=0; Mp.contas.forEach(c=>{ if(existentes.has(c.nome.toLowerCase())) return;
      M.contas.push({ id:uid(), nome:c.nome, planejado:c.planejado||c.valor, valor:0, pago:false, data:'' }); n++; });
    salvar(); render(); toast(n ? n+' contas copiadas' : 'Essas contas já estão no mês');
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
  else if (a==='carry'){ S.carry=!S.carry; salvar(); render(); }
  else if (a==='instalar'){
    if (deferredPrompt){ deferredPrompt.prompt(); deferredPrompt.userChoice.finally(()=>{deferredPrompt=null;}); }
    else toast('Use o menu do navegador → Instalar app');
  }
  else if (a==='exportar'){
    const blob = new Blob([JSON.stringify(S,null,2)],{type:'application/json'});
    const l = document.createElement('a'); l.href=URL.createObjectURL(blob);
    l.download = 'backup-financas-'+dataHoje()+'.json'; l.click(); setTimeout(()=>URL.revokeObjectURL(l.href),1000);
  }
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
    if (!c) return toast('Digite o seu código');
    fetch('api/liberar', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({codigo:c, aparelho:idAparelho()}) })
      .then(r => r.json().then(d => ({ok:r.ok, d})))
      .then(({ok,d}) => { if (ok && d.ok){ S.liberado=true; salvar(); render(); } else toast(d.erro || 'Código inválido'); })
      .catch(() => toast('Sem internet. Conecte-se para liberar o acesso.'));
  }
});

document.addEventListener('change', e=>{
  if (e.target.id!=='fileImp' || !e.target.files[0]) return;
  const r = new FileReader();
  r.onload = () => { try {
      const d = JSON.parse(r.result); if (!d.meses || !d.perfil) throw 0;
      if (!confirm('Substituir os dados atuais pelo backup?')) return;
      d.liberado = S.liberado || d.liberado; S = d; salvar(); render(); toast('Backup restaurado ✓');
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
    <p>Digite o código de acesso que você recebeu junto com a sua compra.</p>
    <div class="f"><label>Código de acesso</label><input id="aCod" autocapitalize="characters" placeholder="Seu código"></div>
    <button class="btn pri" data-act="liberar">Liberar acesso</button>
  </div></div>`;
}

render();
if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
  window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(()=>{}));
}
