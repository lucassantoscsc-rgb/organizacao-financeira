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

## Código de acesso (um por cliente)

Cada cliente recebe um código próprio que libera **um único aparelho**.
O código é conferido no servidor da Vercel (`api/liberar.js`) e fica guardado num banco Redis (Upstash).

**A cada venda na Cakto:**
1. Abra `SEU-LINK/admin.html` e entre com a senha do painel.
2. Digite o nome ou e-mail do cliente e clique em **Gerar código**.
3. Clique em **Copiar mensagem para o cliente** e envie (WhatsApp ou e-mail).

**Cliente trocou de celular:** no painel, ache o código e clique em **Liberar de novo**.
**Excluir um código:** ele deixa de funcionar para novos aparelhos (quem já liberou continua usando).

**Configuração na Vercel (uma vez só):**
- **Storage → Upstash for Redis** ligado ao projeto (cria as variáveis `KV_REST_API_URL` e `KV_REST_API_TOKEN`).
- Variável `ADMIN_SENHA`: a senha do painel (mínimo 6 caracteres).
- Variável `ACCESS_CODES` (opcional): códigos fixos sem limite de aparelhos, separados por vírgula.
- Depois de mudar variáveis, faça **Redeploy**.

Para abrir o app sem código, troque `exigirCodigo: true` por `false` no começo do `app.js`.

## Personalizar

- **Nome e cores:** `manifest.webmanifest` (nome do app) e o bloco `:root` no `index.html` (cores).
- **Frases motivacionais e categorias:** começo do `app.js`.
- **Ícones:** pasta `icons/`.

## Publicar uma atualização

Sempre que mudar algum arquivo, abra `sw.js` e aumente a versão (`financas-v1` → `financas-v2`) antes de publicar de novo. Assim os celulares baixam a versão nova.

## Onde ficam os dados

No próprio aparelho de cada cliente (nada vai para servidor). Em Metas → Ajustes há **Baixar backup** e **Restaurar backup** para trocar de celular.
