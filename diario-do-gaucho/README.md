# Diário do Gaúcho — plataforma de fotografia esportiva

Aplicação completa para venda de fotografias esportivas: galeria editorial com filtros,
prévias protegidas por marca d'água gerada no servidor, checkout Pix, confirmação segura de
pagamento, liberação do original por URL assinada e painel administrativo.

**Stack:** Next.js 16 (App Router) · TypeScript · Tailwind CSS 4 · Framer Motion ·
PostgreSQL/Supabase · Supabase Storage (privado) · Sharp · Pix (BR Code + Mercado Pago/webhook).

---

## Como funciona

### Fluxo de compra
1. O visitante abre uma foto (prévia com marca d'água) e clica em **Comprar fotografia**.
2. O navegador envia **apenas o ID da foto e o e-mail**. O servidor lê o preço no banco,
   grava o pedido com o preço do momento (snapshot em `order_items.price_cents`) e gera a cobrança Pix.
3. A página `/pedido/<token>` mostra QR Code + copia e cola e fica em **Aguardando pagamento**,
   consultando o status a cada poucos segundos.
4. O botão **"Já paguei"** apenas avisa o administrador — **não libera nada**.
5. O pedido só vira **pago** por um destes caminhos, ambos no servidor:
   - **Mercado Pago**: webhook com assinatura HMAC válida → o servidor consulta o pagamento
     na API do provedor → confere `approved`, valor em centavos, moeda BRL e `external_reference`.
     Há também consulta ativa (polling) caso o webhook atrase.
   - **Pix estático**: o administrador confere o crédito no extrato e confirma no painel
     informando o identificador E2E da transação (fica registrado em `transactions`).
6. Com o pedido pago, a página exibe a confirmação animada e o botão **Baixar**, que gera
   uma **URL assinada e temporária** (5 min por padrão) para o **arquivo original** sem marca d'água.
7. O link do pedido contém um token aleatório de 256 bits (só o hash SHA-256 fica no banco)
   e serve para recuperar a compra em `/recuperar`.

### Proteção das imagens
- O original vai do navegador do admin **direto para o bucket privado** (`originals`) via URL
  de upload assinada; nunca há URL pública para ele.
- O servidor valida o arquivo pelo conteúdo real (Sharp), gera **prévia (1600px)** e
  **miniatura (720px)** em WebP, remove EXIF/GPS e **grava a marca d'água "Diário do Gaúcho"
  nos pixels**, repetida na diagonal por toda a imagem + selo central. O texto é convertido em
  contornos vetoriais (não depende de fontes do servidor).
- As prévias ficam em armazenamento separado (`previews`) e são servidas por `/media/<id>/<variante>`.
  Fotos ocultas ou excluídas não são servidas ao público.
- A compra não "remove" a marca d'água: ela autoriza o download de **outro arquivo** — o original.

### Segurança
- Senha administrativa vinda de variável de ambiente, armazenada como hash **scrypt**.
- Sessão em cookie `HttpOnly`, `Secure`, `SameSite=Strict` (prefixo `__Host-` em produção);
  token de sessão guardado apenas como hash.
- Bloqueio após 5 tentativas falhas por IP (e 30 globais) em 15 minutos.
- Todas as rotas `/api/admin/*` validam a sessão no servidor e exigem mesma origem (CSRF).
- Webhook rejeitado sem assinatura válida; processamento idempotente
  (`webhook_events` + `unique(provider, provider_payment_id, status)` + `for update`).
- Preços sempre em **centavos** (`integer`) — nunca confiados ao navegador.
- RLS habilitado em todas as tabelas sem políticas públicas (a chave `anon` do Supabase não acessa nada).
- Limite de requisições para criação de pedidos e downloads; limite de downloads por item.

---

## Estrutura

```
src/
  app/
    page.tsx                    Hero + galeria
    comprar/[id]/               Checkout
    pedido/[token]/             Aguardando pagamento / aprovado / downloads
    recuperar/                  Recuperar compra pelo link/token
    media/[id]/[variant]/       Prévias e miniaturas (com marca d'água)
    admin/login/                Login
    admin/(painel)/             Dashboard, fotos, envio em lote, eventos, pedidos, vendidas, configurações
    api/                        Rotas públicas, administrativas e webhook
  components/                   UI (glass, animações, modal, uploader…)
  lib/
    db.ts                       PostgreSQL (postgres.js) ou PGlite em dev/testes + migrations
    storage.ts                  Supabase Storage / disco local, URLs assinadas
    images.ts, watermark.ts     Sharp: validação, prévias e marca d'água
    pix/brcode.ts               Gerador de BR Code (EMV + CRC16)
    pix/mercadopago.ts          Cobrança Pix, consulta e verificação de webhook
    services/                   Catálogo, fotos, pedidos, pagamentos, auth, estatísticas
  proxy.ts                      Barreira de acesso às páginas /admin
supabase/migrations/            Esquema SQL
scripts/                        migrate, setup-storage, hash de senha
tests/                          Vitest: Pix, marca d'água, autenticação e fluxo de compra
```

---

## Desenvolvimento local

Requisitos: Node.js 20.9+.

```bash
cd diario-do-gaucho
npm install
cp .env.example .env.local
# edite .env.local: APP_SECRET, ADMIN_PASSWORD, PIX_MERCHANT_NAME, PIX_MERCHANT_CITY
npm run dev
```

Sem `DATABASE_URL`, o app usa **PGlite** (PostgreSQL embutido) em `.data/pglite`, e o
armazenamento local em `.data/storage` — nada a instalar. Acesse:

- Site: http://localhost:3000
- Painel: http://localhost:3000/admin

### Testes

```bash
npm test          # Vitest — usa Postgres em memória (PGlite) e armazenamento temporário
npm run typecheck
```

Os testes cobrem: geração e validação do BR Code (CRC, chave, valor, txid), conversões em
centavos, marca d'água gravada nos pixels e validação de arquivos, autenticação (hash, sessão,
bloqueio, troca de senha) e o **fluxo de compra completo** — preço definido pelo servidor,
"Já paguei" não libera, download bloqueado antes do pagamento, confirmação manual exige E2E,
webhook com assinatura inválida/ausente rejeitado, pagamento pendente não libera, webhook
duplicado deduplicado, valor divergente não libera, e URL de download assinada e expirável.

---

## Implantação (produção)

### 1. Supabase
1. Crie um projeto em https://supabase.com.
2. **Banco**: copie a *connection string* (Project Settings → Database). Use-a em `DATABASE_URL`.
   As migrations rodam automaticamente na inicialização (ou manualmente: `npm run db:migrate`).
   Também é possível colar `supabase/migrations/*.sql` no SQL Editor.
3. **Storage**: com `SUPABASE_URL` e `SUPABASE_SERVICE_ROLE_KEY` definidos, rode
   `npm run storage:setup` para criar os buckets **privados** `originals` e `previews`.

### 2. Pix
- `PIX_KEY=47992145561` (celular; normalizada para `+5547992145561`, formato exigido pelo Pix).
- `PIX_MERCHANT_NAME` e `PIX_MERCHANT_CITY`: nome e cidade do titular da conta — **obrigatórios**
  para o Pix estático. Sem eles o checkout fica desativado (nenhum Pix inválido é gerado).
- **Recomendado — Mercado Pago (confirmação automática):**
  1. Crie uma aplicação em https://www.mercadopago.com.br/developers/panel/app e copie o
     *Access Token* de produção → `MERCADOPAGO_ACCESS_TOKEN`.
  2. Em *Webhooks*, cadastre `https://SEU-DOMINIO/api/webhooks/mercadopago`, evento **Pagamentos**,
     e copie a *assinatura secreta* → `MERCADOPAGO_WEBHOOK_SECRET`.
  3. Cadastre a chave Pix 47992145561 na conta Mercado Pago que receberá os valores.
  4. `PIX_PROVIDER=mercadopago`.
- **Sem provedor (Pix estático):** `PIX_PROVIDER=static`. O cliente paga pelo QR Code; o
  pedido permanece pendente até você conferir o extrato e confirmar em **Painel → Pedidos**.

### 3. Hospedagem
O app precisa de um servidor Node (Sharp + processamento em segundo plano).

**Render / Railway / Fly.io / VPS (recomendado)** — use o `Dockerfile` ou:
```
Build:  npm ci && npm run build
Start:  npm start
Root directory: diario-do-gaucho
```

**Vercel** também funciona com `STORAGE_DRIVER=supabase` (o upload vai direto para o
Supabase, sem passar pelo limite de corpo das funções). O processamento das prévias usa
`after()`; fotos que ficarem presas em "processando" são retomadas automaticamente pela
fila do painel.

Variáveis obrigatórias em produção: `APP_URL`, `APP_SECRET`, `ADMIN_PASSWORD`,
`DATABASE_URL`, `STORAGE_DRIVER=supabase`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`,
`PIX_KEY`, `PIX_MERCHANT_NAME`, `PIX_MERCHANT_CITY` e, para confirmação automática,
`MERCADOPAGO_ACCESS_TOKEN` + `MERCADOPAGO_WEBHOOK_SECRET`.

### 4. Primeiro acesso
1. Abra `/admin` e entre com a senha definida em `ADMIN_PASSWORD`.
2. Crie eventos e modalidades em **Eventos**.
3. Envie fotos em **Enviar fotos** (arraste dezenas ou centenas de uma vez).
4. Ajuste o preço padrão (R$ 9,00) em **Configurações**; edite preços individuais em **Fotografias**.

---

## Observações
- Nenhuma credencial de pagamento está no código. Nenhum pagamento é simulado: sem
  provedor configurado, a confirmação depende de conferência humana no extrato.
- O `localStorage` não é usado para nada sensível; o acesso à compra é o link com token.
- Animações respeitam `prefers-reduced-motion`.
