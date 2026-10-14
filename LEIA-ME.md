# Organização Financeira (app PWA)

## Publicar de graça (5 minutos)

**Jeito mais fácil, sem instalar nada (Netlify Drop):**
1. Descompacte o .zip no seu computador.
2. Acesse **app.netlify.com/drop** e arraste a pasta `organizacao-financeira-app` inteira.
3. Crie a conta gratuita quando pedir, para o site não expirar.
4. Sai um link tipo `seu-app.netlify.app`. Esse é o link que o cliente recebe.
5. (Opcional) Em **Domain settings**, troque o nome do link ou coloque um domínio seu.

**Pela Vercel (como o seu quiz):** suba a pasta num repositório do GitHub e importe em **vercel.com/new**, ou rode `npx vercel` dentro da pasta.

O app precisa estar em um link **https** para poder ser instalado. Os dois serviços já fazem isso sozinhos.

## Como o cliente instala

- **Android (Chrome):** abre o link → menu ⋮ → **Instalar app**. Ou usa o botão "Instalar app" em Metas → Ajustes.
- **iPhone (Safari):** abre o link → botão **Compartilhar** → **Adicionar à Tela de Início**.

Depois de instalado, abre como app, em tela cheia, e funciona sem internet.

## Acesso só para quem comprou (automático pela Cakto)

O cliente entra no app com o **e-mail usado na compra**. Cada e-mail libera **um único aparelho**.

- A cada venda aprovada, a Cakto avisa o app (webhook `api/cakto.js`) e o e-mail é cadastrado sozinho.
- Reembolso ou chargeback: o e-mail é removido (não libera novos aparelhos).
- Painel `SEU-LINK/admin.html`: ver compradores, **Liberar de novo** (cliente trocou de celular),
  excluir, e gerar códigos manuais para vendas fora da Cakto.

**Configuração (uma vez só):**
- Vercel → **Storage → Upstash for Redis** ligado ao projeto.
- Vercel → variáveis `ADMIN_SENHA` (senha do painel) e `CAKTO_SECRET` (o secret do webhook da Cakto).
- `ACCESS_CODES` (opcional): códigos fixos sem limite de aparelhos, separados por vírgula.
- Cakto → webhook com a URL `SEU-LINK/api/cakto`, eventos **Compra aprovada**, **Reembolso** e **Chargeback**.
- Depois de mudar variáveis na Vercel, faça **Redeploy**.

Para abrir o app sem pedir acesso, troque `exigirCodigo: true` por `false` no começo do `app.js`.

## Personalizar

- **Nome e cores:** `manifest.webmanifest` (nome do app) e o bloco `:root` no `index.html` (cores).
- **Frases motivacionais e categorias:** começo do `app.js`.
- **Ícones:** pasta `icons/`.

## Publicar uma atualização

Sempre que mudar algum arquivo, abra `sw.js` e aumente a versão (`financas-v1` → `financas-v2`) antes de publicar de novo. Assim os celulares baixam a versão nova.

## Onde ficam os dados

No próprio aparelho de cada cliente (nada vai para servidor). Em Metas → Ajustes há **Baixar backup** e **Restaurar backup** para trocar de celular.
