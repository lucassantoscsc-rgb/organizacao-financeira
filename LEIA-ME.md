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

## Código de acesso (só para quem comprou)

O app pede um código na primeira abertura. O código é conferido no servidor da Vercel
(arquivo `api/liberar.js`), então não aparece no código do app.

- Os códigos válidos ficam na Vercel: **Project → Settings → Environment Variables**,
  variável `ACCESS_CODES`, separados por vírgula. Ex.: `BRIO2026,CLIENTEVIP`.
- Depois de mudar a variável, faça **Redeploy** (aba Deployments → ⋯ → Redeploy).
- Para trocar o código de novas vendas, adicione o novo e remova o antigo. Quem já liberou continua liberado.
- Para abrir o app sem código, troque `exigirCodigo: true` por `false` no começo do `app.js`.
- Envie o código junto com o link na entrega da Cakto/Payt.

## Personalizar

- **Nome e cores:** `manifest.webmanifest` (nome do app) e o bloco `:root` no `index.html` (cores).
- **Frases motivacionais e categorias:** começo do `app.js`.
- **Ícones:** pasta `icons/`.

## Publicar uma atualização

Sempre que mudar algum arquivo, abra `sw.js` e aumente a versão (`financas-v1` → `financas-v2`) antes de publicar de novo. Assim os celulares baixam a versão nova.

## Onde ficam os dados

No próprio aparelho de cada cliente (nada vai para servidor). Em Metas → Ajustes há **Baixar backup** e **Restaurar backup** para trocar de celular.
