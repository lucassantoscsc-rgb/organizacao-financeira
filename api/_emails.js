// E-mails automáticos para quem comprou o app (Resend, domínio tinofinancas.com.br).
//   d0  na hora da compra (webhook da Cakto): acesso liberado + como entrar e instalar
//   d1  1 dia depois: "ainda não entrou" ou "faça seu primeiro lançamento" (quem já lançou não recebe)
//   d3  3 dias depois: o truque do Colar do banco (só quem entrou no app)
//   d7  7 dias depois: 3 recursos que pouca gente descobre (só quem entrou no app)
// Redis: emails:enviados  e-mail → { d0: data, d1: ... }   ·   emails:sair  e-mail → data (não quer mais receber)
//        emails:contagem  tipo → quantos foram enviados
const crypto = require('crypto');
const { redis } = require('./_db');

const APP = 'https://organizacao-financeira-seven.vercel.app';
const REMETENTE = 'Tino Finanças <ola@tinofinancas.com.br>';
const SUPORTE = 'suporteplanilhass@gmail.com';

const token = (email) => crypto.createHmac('sha256', process.env.CRON_SECRET || 'tino').update(email).digest('hex').slice(0, 24);
const linkSair = (email) => `${APP}/api/emails?e=${encodeURIComponent(email)}&t=${token(email)}`;
const esc = (s) => String(s || '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

function layout(email, titulo, corpo, botao) {
  return `<!doctype html><html><body style="margin:0;background:#f3f6f4;font-family:Arial,Helvetica,sans-serif;color:#0f1e1a">
<div style="max-width:520px;margin:0 auto;padding:24px 16px">
  <div style="background:#0a3f2d;border-radius:18px 18px 0 0;padding:20px 24px;color:#fff;font-size:18px;font-weight:bold">Tino Finanças</div>
  <div style="background:#fff;border-radius:0 0 18px 18px;padding:24px;font-size:16px;line-height:1.55">
    <h1 style="font-size:21px;line-height:1.3;margin:0 0 14px">${titulo}</h1>
    ${corpo}
    ${botao ? `<p style="margin:24px 0 8px"><a href="${botao[1]}" style="display:inline-block;background:#34d399;color:#062e2b;text-decoration:none;font-weight:bold;padding:14px 22px;border-radius:12px">${botao[0]}</a></p>` : ''}
    <p style="margin:22px 0 0;color:#5a6e67;font-size:14px">Dúvidas? É só responder este e-mail.<br>Equipe Tino Finanças</p>
  </div>
  <p style="font-size:12px;color:#7c8f8a;text-align:center;margin:16px 0 0">Você recebe este e-mail porque comprou o Tino Finanças com ${esc(email)}.<br>
  <a href="${linkSair(email)}" style="color:#7c8f8a">Não quero receber mais dicas</a></p>
</div></body></html>`;
}
const passo = (n, txt) => `<p style="margin:0 0 10px"><b style="display:inline-block;width:24px;height:24px;line-height:24px;text-align:center;border-radius:50%;background:#e7f7f0;color:#0d9668;margin-right:6px">${n}</b>${txt}</p>`;
const instalar = `<p style="margin:16px 0 6px"><b>Para deixar o ícone na tela do celular:</b></p>
  <p style="margin:0 0 6px">📱 <b>iPhone:</b> não toque no link aqui do e-mail (ele abre dentro do app de e-mail, onde não dá para instalar). Abra o <b>Safari</b>, digite <b>${APP.replace('https://', '')}</b>, toque em <b>Compartilhar</b> (quadrado com a seta) e depois em <b>Adicionar à Tela de Início</b>. Use sempre pelo ícone.</p>
  <p style="margin:0 0 6px">🤖 <b>Android:</b> baixe o <b>Tino Finanças</b> no <a href="https://play.google.com/store/apps/details?id=br.com.tinofinancas.app" style="color:#0d9668">Google Play</a>, toque em <b>Já tenho acesso: entrar com e-mail</b> e digite o e-mail da compra. Você <b>não paga a assinatura da loja</b>: seu acesso já é vitalício.</p>`;

const MODELOS = {
  d0: (email, nome, extra = {}) => ({
    assunto: 'Seu acesso ao Tino está liberado ✅',
    html: layout(email, `${nome ? 'Oi, ' + esc(nome) + '! ' : ''}Seu acesso está liberado ✅`, `
      <p style="margin:0 0 16px">Obrigado por comprar o Tino Finanças. Para começar, são só 3 passos:</p>
      ${passo(1, `Abra o app: <a href="${APP}" style="color:#0d9668">${APP.replace('https://', '')}</a> (no iPhone, pelo <b>Safari</b>; no Android, pelo <b>Google Play</b>: veja abaixo)`)}
      ${passo(2, `Entre com este e-mail: <b>${esc(email)}</b>`)}
      ${passo(3, 'Responda as perguntas do começo e siga os primeiros passos da tela inicial.')}
      ${instalar}
      ${extra.planilha ? `<p style="margin:16px 0 0;padding:12px 14px;background:#fdf4d3;border-radius:12px;font-size:15px">🎁 <b>Seu brinde: a Planilha de Organização Financeira.</b> Para usar no computador ou imprimir. <a href="${extra.planilha}" style="color:#0d9668;font-weight:bold">Abrir a planilha</a> (ela também fica no app, em Ajustes).</p>` : ''}
      <p style="margin:16px 0 0;padding:12px 14px;background:#fef3e2;border-radius:12px;font-size:15px">⚠️ O Tino <b>não fica na App Store nem na Play Store</b>. Não precisa baixar nenhum outro app (o app da Cakto, por exemplo, é só para quem vende). Você usa o Tino pelo link acima.</p>`,
      ['Abrir o Tino', APP]) }),
  d1_entrar: (email, nome) => ({
    assunto: 'Seu Tino está te esperando',
    html: layout(email, `${nome ? esc(nome) + ', seu' : 'Seu'} Tino está te esperando`, `
      <p style="margin:0 0 14px">Vimos que você ainda não entrou no app. Leva menos de um minuto:</p>
      ${passo(1, `Abra <a href="${APP}" style="color:#0d9668">${APP.replace('https://', '')}</a> (no iPhone, pelo <b>Safari</b>; no Android, pelo <b>Google Play</b>: veja abaixo)`)}
      ${passo(2, `Entre com <b>${esc(email)}</b>, o e-mail da compra`)}
      ${instalar}
      <p style="margin:14px 0 0">Se aparecer alguma mensagem de erro, responda este e-mail com um print que a gente resolve.</p>`,
      ['Entrar no Tino', APP]) }),
  d1_lancar: (email, nome) => ({
    assunto: 'Seu primeiro lançamento leva 10 segundos',
    html: layout(email, 'Seu primeiro lançamento leva 10 segundos', `
      <p style="margin:0 0 14px">${nome ? esc(nome) + ', o' : 'O'} Tino só consegue dizer quanto você pode gastar hoje depois que sabe o que entra e o que sai.</p>
      ${passo(1, 'Toque no <b>+</b> amarelo, na parte de baixo do app')}
      ${passo(2, 'Escreva do seu jeito, por exemplo: <i>“gastei 45 no mercado no débito”</i>')}
      ${passo(3, 'Confira e toque em <b>Salvar</b>. Pronto!')}
      <p style="margin:14px 0 0">Comece pelo que entra no mês (salário, renda) e depois anote os gastos do dia. A tela inicial mostra o resto.</p>`,
      ['Fazer meu primeiro lançamento', APP + '/?novo=1']) }),
  d3: (email, nome) => ({
    assunto: 'O jeito mais rápido de anotar um gasto',
    html: layout(email, 'O jeito mais rápido de anotar um gasto ⚡', `
      <p style="margin:0 0 14px">Chegou a notificação de uma compra no seu celular? Dá para lançar no Tino sem digitar nada:</p>
      ${passo(1, 'Copie o texto da notificação do banco (ou do comprovante do Pix)')}
      ${passo(2, 'No Tino, toque em <b>Colar do banco</b>, na tela inicial')}
      ${passo(3, 'O Tino entende o valor, o lugar e a forma de pagamento. É só conferir e salvar.')}
      <p style="margin:14px 0 0">O texto é lido só no seu celular. Leva uns 3 segundos.</p>`,
      ['Abrir o Tino', APP + '/?colar=1']) }),
  d7: (email, nome) => ({
    assunto: '3 coisas que pouca gente descobre no Tino',
    html: layout(email, '3 coisas que pouca gente descobre no Tino', `
      <p style="margin:0 0 14px">${nome ? esc(nome) + ', você' : 'Você'} já está há uma semana com o Tino. Experimente estas:</p>
      <p style="margin:0 0 12px">🤔 <b>Posso comprar?</b> Antes de uma compra maior, digite o valor e veja se cabe no seu mês, à vista ou parcelado.</p>
      <p style="margin:0 0 12px">🎯 <b>Cofrinhos.</b> Crie um para cada sonho (viagem, reserva, carro). O Tino diz quanto guardar por mês para chegar lá.</p>
      <p style="margin:0 0 12px">🎁 <b>Sua planilha de brinde.</b> Quem tem o app também ganha a Planilha de Organização Financeira, para usar no computador ou imprimir. Fica em Ajustes → Seu brinde.</p>`,
      ['Abrir o Tino', APP]) }),
};

async function enviarEmail(para, modelo, nome) {
  if (!process.env.RESEND_API_KEY) throw new Error('E-mail não configurado');
  // o de boas-vindas leva o link da planilha de brinde (o mesmo configurado no painel admin)
  const extra = modelo === 'd0' ? { planilha: await require('./indique').config().then((c) => c.planilha).catch(() => '') } : {};
  const { assunto, html } = MODELOS[modelo](para, nome, extra);
  const r = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: REMETENTE, to: [para], reply_to: SUPORTE, subject: assunto, html,
      headers: { 'List-Unsubscribe': `<${linkSair(para)}>` } }),
  });
  if (!r.ok) throw new Error('Resend ' + r.status);
}

// Envia uma etapa da sequência uma vez só por pessoa (e nunca para quem pediu para sair).
async function enviarEtapa(email, etapa, modelo, nome) {
  if (await redis('HEXISTS', 'emails:sair', email)) return false;
  const reg = JSON.parse((await redis('HGET', 'emails:enviados', email)) || '{}');
  if (reg[etapa]) return false;
  await enviarEmail(email, modelo, nome);
  reg[etapa] = new Date().toISOString();
  await redis('HSET', 'emails:enviados', email, JSON.stringify(reg));
  await redis('HINCRBY', 'emails:contagem', modelo, 1);
  return true;
}

const primeiroNome = (s) => String(s || '').trim().split(/\s+/)[0].replace(/[^\p{L}'-]/gu, '').slice(0, 20);

module.exports = { MODELOS, enviarEmail, enviarEtapa, token, primeiroNome };
