# Cortta Pro — Como publicar (Render.com)

## Por que Render e não Vercel/Netlify?
Seu app usa Express + SQLite (arquivo local). Vercel e Netlify rodam em
"serverless functions": cada acesso pode cair em um container novo e vazio,
então o banco de dados "reseta" (por isso o erro de id) e o build às vezes
falha ao compilar o better-sqlite3 (por isso o 404 no site inteiro).
O Render roda um servidor Node de verdade, ligado o tempo todo — sem esses problemas.

## Passo a passo

1. Crie uma conta grátis em https://render.com (pode entrar com GitHub).
2. Suba esta pasta para um repositório no GitHub (crie um repo novo e
   faça upload destes arquivos: server.js, index.html, package.json).
3. No Render, clique em **New +** → **Web Service**.
4. Conecte o repositório que você criou.
5. Configure:
   - **Environment**: Node
   - **Build Command**: `npm install`
   - **Start Command**: `npm start`
   - **Instance Type**: Free
6. Em **Environment Variables**, adicione:
   - `JWT_SECRET` = uma senha longa e aleatória, só sua (ex: `c0rtt4-pro-segredo-2026-xyz`)
7. Clique em **Create Web Service** e aguarde o deploy (leva 2–3 minutos).
8. Quando aparecer "Live", acesse a URL que o Render te dá
   (algo como `https://cortta-pro.onrender.com`) — o site e o login devem
   funcionar normalmente, sem 404.

## Atenção (importante)
- No plano gratuito do Render, o servidor "dorme" após alguns minutos sem uso
  e o arquivo do banco de dados (`cortta.db`) pode ser apagado quando ele
  reinicia ou quando você faz um novo deploy. Para uso pessoal/teste isso é
  normal. Se depois você quiser manter os dados sempre salvos (cadastros de
  clientes reais), me avise que te ajudo a trocar para um banco de dados
  online gratuito (ex: Supabase ou Turso) — é uma mudança pequena no código.
- Não precisa mais dos arquivos `vercel.json` e da pasta `api/`, eles eram
  para a Vercel e não são usados no Render (por isso não estão neste pacote).
