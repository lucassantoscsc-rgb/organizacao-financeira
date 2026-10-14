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

## Liberar só para quem comprou (opcional)

No começo do arquivo `app.js`, troque:

```js
codigosAcesso: [],
```

por, por exemplo:

```js
codigosAcesso: ['BRIO2026'],
```

e envie o código junto com o link na entrega da Cakto/Payt. Quem abrir o link sem o código vê uma tela pedindo o código.
Observação: é uma trava simples (fica no próprio app), suficiente para venda low ticket, mas não substitui login com servidor.

## Personalizar

- **Nome e cores:** `manifest.webmanifest` (nome do app) e o bloco `:root` no `index.html` (cores).
- **Frases motivacionais e categorias:** começo do `app.js`.
- **Ícones:** pasta `icons/`.

## Publicar uma atualização

Sempre que mudar algum arquivo, abra `sw.js` e aumente a versão (`financas-v1` → `financas-v2`) antes de publicar de novo. Assim os celulares baixam a versão nova.

## Onde ficam os dados

No próprio aparelho de cada cliente (nada vai para servidor). Em Metas → Ajustes há **Baixar backup** e **Restaurar backup** para trocar de celular.
