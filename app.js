/* =========================================================
   Organização Financeira — app PWA
   Todos os dados ficam salvos no próprio aparelho (localStorage).
   ========================================================= */

const CONFIG = {
  nomeApp: 'Organização Financeira',
  // true = pede o e-mail da compra (ou código) na primeira abertura.
  // A conferência é feita no servidor (api/liberar.js).
  exigirCodigo: true,
  // Link que aparece na imagem da retrospectiva compartilhada (ex.: sua página de vendas). Vazio = só o nome do app.
  linkDivulgacao: 'planilhadeorganizacaofinanceira.online',
  frases: [
    'Pequenas ações geram grandes resultados.',
    'Quem anota, controla. Quem controla, conquista.',
    'Cada real no lugar certo é um passo para sua meta.',
    'Constância vale mais que intensidade.',
    'Seu futuro agradece o que você organiza hoje.'
  ]
};

// Versão do código. Ao publicar: aumente aqui, em versao.json e o CACHE do sw.js.
const APP_VERSAO = 25;
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
let S;
try { S = JSON.parse(localStorage.getItem(STORE_KEY)) || novoEstado(); } catch(e){ S = novoEstado(); }
function migrar(){
  if (!S.orcamentos) S.orcamentos = {}; if (!S.meses) S.meses = {}; S.v = 2;
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
function salvar(){ try { localStorage.setItem(STORE_KEY, JSON.stringify(S)); } catch(e){ toast('Não foi possível salvar no aparelho'); } if (typeof agendarSyncNotif === 'function') agendarSyncNotif(); }

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
  { id:'retro', e:'🎬', t:'Olhando para trás', d:'Viu uma retrospectiva do mês', ok:()=>Object.keys(S.retroVistas||{}).length>0 },
];
function contextoConquistas(){
  memo = {}; memoParc = null;
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
  memo = {}; memoParc = null;
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
  g.fillStyle = '#fff'; g.font = `800 96px ${F}`; g.fillText(`${MESES[d.m]} ${d.y}`, 540, 320);
  g.font = `260px ${F}`; g.fillText(d.titulo[0], 540, 690);
  g.font = `800 92px ${F}`; quebra(g, d.titulo[1], 540, 860, 940, 104);
  g.fillStyle = 'rgba(255,255,255,.85)'; g.font = `500 44px ${F}`; quebra(g, d.titulo[2], 540, 1000, 900, 58);
  const linhas = [`${emojiCat(d.cats[0][0])}  Categoria campeã: ${nomeCat(d.cats[0][0])}`,
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
// Cartão no Resumo: retrospectiva do mês passado (até o dia 10) ou do mês aberto, se já passou.
function cardRetro(){
  const kc = key(cur.y,cur.m), kh = chaveHoje();
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
  ['🧺 Mercado', ['mercado','supermercado','feira','atacadao','assai','carrefour','hortifruti','sacolao','acougue','atacarejo','compras do mes']],
  ['🍗 Alimentação', ['ifood','i food','rappi','restaurante','lanche','lanchonete','pizza','pizzaria','hamburguer','hamburgueria','almoco','jantar','padaria','cafe','sorvete','acai','delivery','marmita','mcdonalds','mc donalds','burger king','comida','salgado','churrasco','sushi']],
  ['⛽ Gasolina', ['gasolina','posto','combustivel','etanol','abasteci','abastecer','diesel']],
  ['🚗 Transporte', ['uber','99 pop','onibus','metro','passagem','estacionamento','pedagio','taxi','trem','bilhete unico','oficina','mecanico','lava jato','ipva','seguro do carro','licenciamento']],
  ['🏠 Casa', ['aluguel','condominio','movel','moveis','reforma','material de construcao','produtos de limpeza','decoracao','iptu','eletrodomestico']],
  ['💊 Saúde', ['farmacia','remedio','remedios','medico','consulta','dentista','exame','exames','plano de saude','hospital','academia','terapia','psicologo','drogaria','smart fit','smartfit','bluefit','selfit','bodytech','gympass','wellhub','totalpass','pague menos','raia','drogasil','panvel']],
  ['📦 Compras Online', ['amazon','shopee','mercado livre','shein','aliexpress','magalu','temu','compra online','compras online']],
  ['👕 Vestuário', ['roupa','roupas','tenis','sapato','sapatos','camisa','camiseta','calca','vestido','blusa','bermuda','renner','riachuelo','zara','sandalia','chinelo']],
  ['🎉 Lazer', ['cinema','show','bar','cerveja','festa','viagem','passeio','balada','ingresso','ingressos','parque','praia','hotel','pousada','boliche','jogo']],
  ['📚 Educação', ['curso','faculdade','escola','livro','livros','mensalidade da escola','material escolar','apostila','udemy']],
  ['📱 Assinaturas', ['netflix','spotify','assinatura','prime video','amazon prime','disney','hbo','youtube premium','icloud','globoplay','deezer','chatgpt','streaming']],
  ['💄 Beleza', ['salao','cabelo','manicure','unha','unhas','maquiagem','barbearia','barbeiro','cosmetico','cosmeticos','perfume','skincare','depilacao','sobrancelha']],
  ['🐾 Pets', ['pet','racao','veterinario','petshop','pet shop','cachorro','gato','banho e tosa']],
  ['🎁 Presentes', ['presente','presentes','lembrancinha','aniversario']],
  ['🧾 Contas', ['conta de luz','luz','energia','conta de agua','agua','internet','telefone','conta do celular','recarga','gas','boleto','conta']],
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
  let kw = null;
  PALAVRAS_CAT.forEach(([cat, ws]) => ws.forEach(w => { if (temPalavra(tt, w) && (!kw || w.length > kw.w.length)) kw = { w, cat }; }));
  return { cat: kw ? kw.cat : null };
}
function interpretarFrase(frase){
  const out = { tipo:'gastos' };
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
  if (/\s(cartao de credito|credito|no cartao)\s/.test(t)){ out.forma = 'Crédito'; tira(/\s(?:no|na|com|pelo|via)?\s?(?:cartao de credito|credito|no cartao)\s/); }
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
    if (r.forma){ form.v.forma = r.forma; $sh.querySelectorAll('[data-chips="forma"] button').forEach(b=>b.classList.toggle('on', b.dataset.v===r.forma)); document.getElementById('boxParc').hidden = r.forma!=='Crédito'; }
    if (r.parcelas) set('fParc', String(Math.min(24, r.parcelas)));
    set('fDesc', r.desc);
    infoParcelas();
  }
  const partes = [r.valor ? brl(r.valor) : null,
    r.tipo==='entradas' ? 'Entrada' : r.tipo==='reservas' ? (r.cof ? 'Cofrinho ' + (cofPorId(r.cof)||{}).nome : 'Reserva') : r.cat ? nomeCat(r.cat) : null,
    r.tipo==='gastos' ? r.forma : null, r.parcelas>1 ? r.parcelas+'x' : null, r.data ? fmtData(r.data) : null].filter(Boolean);
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
    imp = { modo: r.cartao ? 'cartao' : 'conta', sinalCompra: ehOFX ? -1 : (r.cartao ? 1 : -1),
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
  const opts = (c) => CATEGORIAS.map(k=>`<option value="${esc(k)}" ${k===c?'selected':''}>${k}</option>`).join('');
  abrir(`<h2>📥 Importar extrato</h2>
    <p class="note" style="margin:-6px 0 12px">${it.length} transações de ${fmtData(datas[0])}/${datas[0].slice(2,4)} a ${fmtData(datas[datas.length-1])}/${datas[datas.length-1].slice(2,4)}. Confira as categorias e desmarque o que não quiser.</p>
    <div class="seg sm"><button type="button" class="${imp.modo==='conta'?'on':''}" data-impmodo="conta">Conta (débito/Pix)</button><button type="button" class="${imp.modo==='cartao'?'on':''}" data-impmodo="cartao">Cartão de crédito</button></div>
    <div class="list flat imp-lista">${it.map(x=>`<div class="item imp ${x.sel?'':'off'}">
      <input type="checkbox" data-impsel="${x.i}" ${x.sel?'checked':''} aria-label="Importar ${esc(x.desc)}">
      <div class="tx"><div class="t1">${esc(x.desc)}</div>
        <div class="t2">${fmtData(x.data)} · ${x.tipo==='gastos' ? `<select data-impcat="${x.i}" aria-label="Categoria">${opts(x.cat)}</select>` : 'Entrada'}
        ${x.dup?'<span class="tag warn">já lançado</span>':''}${x.fatura?'<span class="tag">pagamento de fatura</span>':''}</div></div>
      <div class="val num ${x.tipo==='entradas'?'up':''}">${brl(Math.abs(x.valor))}</div></div>`).join('')}</div>
    <p class="note">${imp.modo==='cartao' ? 'Gastos do cartão entram como Crédito (vão para a fatura do mês seguinte).' : 'Gastos da conta entram como Débito ou Pix.'}</p>
    <button class="btn pri" data-act="confirmarImp">Importar ${sel.length} lançamento${sel.length===1?'':'s'}</button>`);
}
function confirmarImportacao(){
  const sel = imp.itens.filter(x=>x.sel); if (!sel.length) return toast('Nenhum lançamento marcado');
  sel.forEach(x => {
    const o = ymDe(x.data.slice(0,7)), M = mes(o.y, o.m, true), valor = Math.round(Math.abs(x.valor)*100)/100;
    if (x.tipo === 'gastos'){
      const forma = imp.modo === 'cartao' ? 'Crédito' : /pix/i.test(x.original) ? 'Pix / Dinheiro' : 'Débito';
      M.gastos.push({ id:uid(), cat:x.cat, forma, valor, data:x.data, essencial:ESSENCIAIS.includes(x.cat), desc:x.desc, parcelas:1, importado:true });
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
  olho:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/></svg>',
  olhoFechado:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 3l18 18M10.6 5.1A10.4 10.4 0 0 1 12 5c6.4 0 10 7 10 7a17 17 0 0 1-3.2 4.1M6.6 6.6C3.9 8.3 2 12 2 12s3.6 7 10 7c1.7 0 3.2-.5 4.5-1.2M9.9 9.9a3 3 0 0 0 4.2 4.2"/></svg>',
  plus:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>'
};

function render(){
  memo = {}; memoParc = null;
  if (aba==='ajustes' && temSenha()) bioDisponivel().then(ok => { const l = document.getElementById('linhaBio'); if (l) l.hidden = !ok; });
  if (CONFIG.exigirCodigo && !S.liberado) return renderAcesso();
  if (!S.perfil.ok) return renderOnboarding();
  aplicarRecorrentes(cur.y,cur.m);
  const p = S.perfil;
  const saud = p.pronome==='Femininos' ? 'Bem-vinda' : p.pronome==='Masculinos' ? 'Bem-vindo' : 'Boas-vindas';
  const frase = CONFIG.frases[hoje.getDate() % CONFIG.frases.length];
  const telas = { resumo:telaResumo, lanc:telaLanc, contas:telaContas, metas:telaMetas, ajustes:telaAjustes };
  $app.innerHTML = `
    <header class="top ${aba==='resumo'?'hero-top':''}">
      <button class="olho" data-act="olho" aria-label="${S.ocultar?'Mostrar valores':'Esconder valores'}" aria-pressed="${!!S.ocultar}">${S.ocultar ? ICON.olhoFechado : ICON.olho}</button>
      <div class="hello">Olá, ${esc(p.nome||'você')}!${sequenciaAtual()>=1?`<button class="streak" data-tab="metas" aria-label="Sequência de ${sequenciaAtual()} dias">🔥 ${sequenciaAtual()}</button>`:''}</div>
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
    <div class="big num ${neg && !S.ocultar?'neg':''}">${brl(C.restante)}</div>
    <div class="eq num">${brl(C.entradas)} entradas − ${brl(C.saidas)} saídas − ${brl(C.reservas)} reservas</div>
    ${blocoPrevisao(C)}
  </section>`;

  html += cardRetro();
  html += dicaTransferir();
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
  const fut = comprometidoFuturo();
  if (fut > 0) h += `<div class="eq">💳 ${brl(fut)} em parcelas nos próximos meses.</div>`;
  return h;
}

// No iPhone, quem usa pelo Safari e depois instala o app começa vazio (são armazenamentos separados).
const noNavegadorIOS = () => /iphone|ipad|ipod/i.test(navigator.userAgent) && !navigator.standalone && !matchMedia('(display-mode: standalone)').matches;
function dicaTransferir(){
  if (!noNavegadorIOS() || S.dicaTransfFechada || !primeiraChave()) return '';
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
  let h = `<section class="card" id="cardCategorias"><h3>Onde você gastou <small>${brl(C.consumo)}</small></h3>`;
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
  const lst = Object.entries(S.orcamentos).filter(([,l])=>l>0);
  if (!lst.length) return `<section class="card" id="cardOrcamentos"><h3>Orçamentos</h3><div class="note" style="margin:0 0 12px">Defina um limite por categoria e o app avisa antes de você estourar.</div><button class="btn sec" data-act="orcamentos">Definir orçamentos</button></section>`;
  const tot = soma(lst, x=>x[1]), gasto = soma(lst, ([c])=>C.cats[c]||0);
  let h = `<section class="card" id="cardOrcamentos"><h3>Orçamentos <small>${brl(gasto)} de ${brl(tot)}</small></h3>`;
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
      ${compacto?'':previsaoCofrinho(c, total)}</button>`;
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
  return `<section class="card" id="cardMetas"><h3>Cofrinhos <small>${compacto?'acumulado até '+MESES[cur.m].toLowerCase():''}</small></h3>${blocoCofrinhos(compacto)}
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
    <div class="row2" style="margin:14px 0"><button class="btn pri" data-act="guardarCof" data-cof-id="${id}">+ Guardar</button><button class="btn sec" data-act="retirarCof" data-cof-id="${id}">− Retirar</button></div>
    <h4 class="sub-h">Movimentações</h4>
    <div class="list flat">${movs.slice(0,30).map(({mk,r})=>`<button class="item" data-edit="reservas" data-id="${r.id}" data-mk="${mk}"><div class="tx"><div class="t1">${r.valor<0?'Retirada':esc(r.nome||'Guardado')}</div><div class="t2">${r.data?fmtData(r.data)+'/'+mk.slice(0,4):MESES[ymDe(mk).m]}</div></div><div class="val num ${r.valor<0?'down':'up'}">${r.valor<0?'−':'+'}${brl(Math.abs(r.valor))}</div></button>`).join('') || '<div class="empty">Nada guardado ainda.</div>'}</div>
    <button class="btn sec" data-act="editarCof" data-cof-id="${id}" style="margin-top:14px">Editar cofrinho</button>`);
}
function editarCofrinho(id){
  const c = id ? cofPorId(id) : { nome:'', emoji:'🎯', alvo:0, prazo:'' };
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
    if (C.faturaAnterior) h += `<div class="item"><div class="ic">💳</div><div class="tx"><div class="t1">Fatura do crédito <span class="tag auto">automático</span></div><div class="t2">Crédito usado em ${MESES[prevYM(cur.y,cur.m).m]}</div></div><div class="val num down">${brl(C.faturaAnterior)}</div></div>`;
    gs.forEach(g=>{
      const parc = ehParcelado(g);
      h += `<button class="item" data-edit="gastos" data-id="${g.id}"><div class="ic">${emojiCat(g.cat)}</div><div class="tx"><div class="t1">${esc(g.desc||nomeCat(g.cat))}</div><div class="t2">${esc(g.forma)}${parc?`<span class="tag cr">1/${g.parcelas} de ${brl(g.valor)}</span>`:g.forma==='Crédito'?'<span class="tag cr">fatura</span>':''}${g.data?' · '+fmtData(g.data):''} · ${g.essencial?'✅':'❌'}</div></div><div class="val num">${brl(parc?parcelasDoMes(cur.y,cur.m).find(x=>x.g===g).valor:g.valor)}</div></button>`; });
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
  h += `<div class="list">${x.itens.map(i=>`<button class="item" data-edit="${i.tipo}" data-id="${i.id}" data-mk="${i.mk}"><div class="ic">${i.ic}</div><div class="tx"><div class="t1">${esc(i.t)}</div><div class="t2">${esc(i.s)}</div></div><div class="val num ${i.v>0?'up':''}" ${i.pendente?'style="color:var(--muted)"':''}>${brl(Math.abs(i.v))}</div></button>`).join('')
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
    M.gastos.forEach(g=>{ if (bate([g.desc, nomeCat(g.cat), g.forma], g.valor)) res.push({ k, tipo:'gastos', it:g, ic:emojiCat(g.cat), t:g.desc||nomeCat(g.cat),
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
  if (Mp.contas.length) h += `<button class="btn sec" data-act="copiarContas">Copiar contas de ${MESES[p.m]} (${Mp.contas.length})</button>`;
  h += `<p class="note" style="margin-top:12px">Marque ✓ quando pagar. Só as contas pagas entram nas saídas do mês. Ao começar um mês novo, suas contas são copiadas automaticamente.</p>`;
  return h;
}

function telaMetas(){
  const C = calc(cur.y,cur.m), p = S.perfil;
  return `${cardCofrinhos(false)}
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
    'pc': ['Computador (Chrome ou Edge)', ['Clique no ícone de <b>instalar</b> <span class="kbd">⊕</span> no fim da barra de endereço.', 'Ou abra o menu do navegador e clique em <b>Instalar Organização Financeira</b>.']]
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
  ${instalado?'':cardInstalar()}
  <section class="card" id="cardBackup"><h3>Backup dos dados</h3>
    <p class="note" style="margin:0 0 12px">Seus dados ficam só neste aparelho. Faça backup antes de trocar de celular ou limpar o navegador. Guarde o arquivo no Google Drive, iCloud, WhatsApp ou e-mail.</p>
    <p class="note" style="margin:0 0 12px">Último backup: <b>${S.ultimoBackup ? new Date(S.ultimoBackup).toLocaleDateString('pt-BR') + ` (${diasDesde(S.ultimoBackup)===0?'hoje':'há '+diasDesde(S.ultimoBackup)+' dias'})` : 'nunca'}</b>${S.novosDesdeBackup?` · ${S.novosDesdeBackup} lançamento${S.novosDesdeBackup>1?'s':''} desde então`:''}</p>
    <button class="btn sec" data-act="exportar">⬇️ Fazer backup</button>
    <button class="btn sec" data-act="importar">⬆️ Restaurar backup</button>
    <input type="file" id="fileImp" hidden></section>
  
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
    <button class="btn sec" data-act="sair">Sair da conta</button></section>
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
    abrir(`${topo}${it?'':blocoFrase()}<h2>${it?'Editar':'Novo'} gasto</h2>
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
    let valor=Math.abs(parseValor(g('fValor'))); if(!valor) return toast('Informe o valor');
    if (v.retirada) valor = -valor;
    const ehCof = v.dest.startsWith('cof:');
    obj = { tipo: ehCof ? 'Cofrinho' : v.dest, cof: ehCof ? v.dest.slice(4) : undefined, nome:g('fNome'), valor, data:g('fData') };
  }
  if (id){ const i=M[tipo].findIndex(x=>x.id===id); M[tipo][i] = {...M[tipo][i], ...obj}; }
  else { M[tipo].push({ id:uid(), ...obj }); S.novosDesdeBackup = (S.novosDesdeBackup||0) + 1; registrarDiaAtivo(); }
  salvar(); fechar();
  if (aba==='lanc' && subLanc==='calendario') {} else if (tipo!=='contas'){ aba='lanc'; subLanc=tipo; } else aba='contas';
  render();
  toast(tipo==='gastos' ? avisoOrcamento(obj.cat) : 'Salvo ✓');
  checarConquistas();
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
  const t = e.target.closest('[data-act],[data-tab],[data-sub],[data-edit],[data-new],[data-pay],[data-chips] button:not([data-act]),[data-cat],[data-catsel],[data-rec],[data-cof],[data-dia],[data-impmodo]');
  if (!t) return;
  if (t.parentElement && t.parentElement.dataset.chips && !t.dataset.act){
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
  if (t.dataset.cof){ abrirCofrinho(t.dataset.cof); return; }
  if (t.dataset.tab){ fechar(); aba=t.dataset.tab; render(); scrollTo(0,0); return; }
  if (t.dataset.sub){ subLanc=t.dataset.sub; render(); return; }
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
  body: JSON.stringify({ conta:S.conta, aparelho:idAparelho(), nome:nomeAparelho(), ...dados }) })
  .then(r => r.json().then(d => ({ status:r.status, d })));

// Ao abrir com internet (no máximo a cada 6 horas), confere se este aparelho ainda tem acesso.
// Desconecta se foi removido pelo dono, se o acesso foi excluído ou reembolsado. Erros de rede são ignorados.
function verificarAcesso(){
  if (!CONFIG.exigirCodigo || !S.liberado || !S.conta || !navigator.onLine) return;
  if (S.verificadoEm && Date.now() - new Date(S.verificadoEm).getTime() < 6*3600e3) return;
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
  entregarArquivo('backup-financas-'+dataHoje()+'.json', dados, 'application/json', 'Backup Organização Financeira',
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
    M.gastos.filter(g=>!ehParcelado(g)).forEach(g=>add(k, g.data, 'Gasto', g.desc||nomeCat(g.cat), nomeCat(g.cat), g.forma, '', g.valor, g.essencial?'Sim':'Não', ''));
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
  entregarArquivo('lancamentos-financas-'+dataHoje()+'.csv', csv, 'text/csv', 'Lançamentos Organização Financeira', () => toast('Planilha exportada ✓'));
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
  if (e.target.id==='fBusca'){
    busca = e.target.value;
    memo = {}; memoParc = null;
    document.getElementById('resBusca').innerHTML = busca.trim() ? resultadosBusca(busca) : '';
    document.getElementById('lancNormal').hidden = !!busca.trim();
    document.querySelector('.busca .x').hidden = !busca;
  }
});
document.addEventListener('change', e=>{
  if (e.target.id === 'fileExtrato' && e.target.files[0]) return abrirImportacao(e.target.files[0]);
  if (e.target.dataset.impsel){ const x = imp.itens[+e.target.dataset.impsel]; x.sel = e.target.checked; e.target.closest('.imp').classList.toggle('off', !x.sel);
    const n = imp.itens.filter(y=>y.sel).length; $sh.querySelector('[data-act=confirmarImp]').textContent = `Importar ${n} lançamento${n===1?'':'s'}`; return; }
  if (e.target.dataset.impcat){ imp.itens[+e.target.dataset.impcat].cat = e.target.value; return; }
  if (e.target.id==='fParc') return infoParcelas();
  if (e.target.id!=='fileImp' || !e.target.files[0]) return;
  const r = new FileReader();
  r.onload = () => { try {
      const d = JSON.parse(r.result); if (!d.meses || !d.perfil) throw 0;
      if (!confirm('Substituir os dados atuais pelo backup?')) return;
      d.liberado = S.liberado || d.liberado; d.conta = S.conta || d.conta; delete d.backupEm; S = d; aba = 'resumo'; migrar(); S.tourVisto = true; S.novosDesdeBackup = 0; S.ultimoBackup = S.ultimoBackup || new Date().toISOString(); salvar(); render(); toast('Backup restaurado ✓');
    } catch(_){ toast('Arquivo de backup inválido'); } };
  r.readAsText(e.target.files[0]);
});
document.addEventListener('keydown', e=>{ if(e.key==='Escape') fechar(); if(e.key==='Enter' && e.target.id==='fFrase'){ e.preventDefault(); clearTimeout(esperaFrase); e.target.dataset.aplicado = e.target.value; aplicarFrase(e.target.value); e.target.blur(); return; } if(e.key==='Enter' && form && form.tipo!=='cofrinho' && e.target.tagName==='INPUT') salvarForm(); });

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
    texto: 'Em 1 minuto você aprende a usar o app. Toque em <b>Próximo</b> para avançar.' },
  { aba:'resumo', sel:'.hero', titulo:'Restante para gastar',
    texto:'Quanto você ainda pode gastar no mês: suas entradas menos o que já saiu e o que você guardou. No mês atual, mostra também <b>quanto dá para gastar por dia</b>.' },
  { aba:'resumo', sel:'.monthbar', titulo:'Mês a mês',
    texto:'Use as setas para ver outros meses. O que sobra num mês passa para o seguinte (dá para desligar em Ajustes).' },
  { aba:'resumo', sel:'nav .fab', titulo:'Lançar é rápido',
    texto:'Toque no <b>+</b>, digite o valor, escolha a categoria e salve. Ou só escreva (ou fale 🎤) algo como <b>“gastei 45 no ifood no crédito”</b> que o app preenche tudo.' },
  { aba:'resumo', sel:'#cardCategorias', titulo:'Para onde vai seu dinheiro',
    texto:'Gráficos dos seus gastos por categoria. Toque numa categoria para ver o histórico dos últimos meses.' },
  { aba:'lanc', sel:'.busca', titulo:'Seus lançamentos',
    texto:'Em <b>Lançamentos</b> ficam entradas, gastos e reservas de cada mês. A busca encontra qualquer lançamento, de todos os meses.' },
  { aba:'contas', sel:'[data-act=addConta]', titulo:'Contas fixas',
    texto:'Cadastre aluguel, luz, internet… com o dia do vencimento. Marque ✓ quando pagar. O app avisa quando uma conta está para vencer e copia suas contas para o mês seguinte.' },
  { aba:'metas', sel:'#cardOrcamentos', titulo:'Orçamentos',
    texto:'Defina um limite por categoria, como Mercado R$ 800. O app avisa quando você chega perto e quando estoura.' },
  { aba:'metas', sel:'#cardMetas', titulo:'Cofrinhos',
    texto:'Crie cofrinhos para cada objetivo: viagem, carro, reserva de emergência… Defina um prazo e o app diz <b>quanto guardar por mês</b>.' },
  { aba:'ajustes', sel:'#cardBackup', titulo:'Faça backup',
    texto:'Seus dados ficam só neste aparelho. Faça backup de vez em quando para não perder nada ao trocar de celular — o app te lembra.' },
  { aba:'resumo', titulo:'🎉 Tudo pronto!',
    texto:'Que tal começar lançando sua renda do mês? Depois é só ir anotando seus gastos.', final:true }
];
let tour = null;
function iniciarTour(){ tour = 0; mostrarPasso(); }
function mostrarPasso(rolar = true){
  const p = PASSOS_TOUR[tour];
  if (p.aba && aba !== p.aba){ aba = p.aba; render(); }
  const el = p.sel ? document.querySelector(p.sel) : null;
  if (rolar){ if (el && !el.closest('nav')) el.scrollIntoView({ block:'center' }); else scrollTo(0,0); }
  requestAnimationFrame(() => desenharTour(el, p));
}
function desenharTour(el, p){
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
if (parametros.has('aba') || parametros.has('novo')) history.replaceState(null, '', location.pathname);
if (parametros.get('aba') === 'contas') aba = 'contas';
function iniciarApp(){
  if (parametros.has('novo') && S.liberado && S.perfil.ok) setTimeout(() => abrirForm('gastos'), 300);
  if (notifLigada() && S.notifSync !== dataHoje()){ S.notifSync = dataHoje(); salvar(); sincronizarNotif(); }
  if (S.liberado && S.perfil.ok && S.tourVisto === false) iniciarTour();
  mostrarNovidades();
  setTimeout(checarConquistas, 1200);
}
render();
if (S.liberado && S.perfil.ok && temSenha()){ aoDestravar = iniciarApp; travar(); } else iniciarApp();
verificarAcesso();
checarVersao(false);
window.addEventListener('online', verificarAcesso);
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') verificarAcesso(); });
if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
  window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(()=>{}));
}
