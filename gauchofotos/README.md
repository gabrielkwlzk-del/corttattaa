# Esporte Show Online — versão Vercel (definitiva)

Mesmo site, mesmo visual e mesmas funções do site anterior — agora sobre uma base feita para **não cair**:

| Antes (Netlify Blobs) | Agora |
|---|---|
| Dados num armazenamento simples, lido item por item a cada visita | **PostgreSQL** de verdade (pedidos, fotos, configurações) |
| Segredo de assinatura gravado pelo próprio servidor (podia ser sobrescrito) | Segredo fixo em variável de ambiente; **sessão e links de download assinados**, sem depender do banco |
| Fotos limitadas a ~5 MB e passando pela função | Originais enviados **direto ao Vercel Blob privado** (até 40 MB), entregues por streaming |
| Cliques simultâneos podiam se atropelar | Confirmação, contagem de downloads e limites de tentativas **atômicos** no banco |
| Sem diagnóstico | `/api/health` testa banco, armazenamento, imagens, Pix e marca d'água |

## Como funciona

- `public/` — site estático (HTML/CSS/JS puro): galeria, pedido com Pix, painel `/admin`.
- `api/[...path].mjs` — a única função da Vercel; a lógica está em `lib/`.
- PostgreSQL guarda fotos (informações), pedidos e configurações. As migrações rodam sozinhas, com trava.
- Vercel Blob (privado) guarda os originais e as prévias. Os originais nunca têm URL pública.
- **Pix direto para a chave `47992145561`**. A confirmação é manual no painel (sem provedor, o site não sabe que o dinheiro chegou): o cliente paga, clica "Já paguei" (só avisa), você confere no banco e confirma; o download é liberado na hora.

## Publicar (resumo)

1. Projeto na Vercel com **Root Directory = `gauchofotos`** (sem *Framework*; o `vercel.json` já define tudo).
2. **Storage → Create → Blob** (privado) e conecte ao projeto (cria `BLOB_READ_WRITE_TOKEN`).
3. **Storage → Create → Neon (Postgres)** e conecte ao projeto (cria `DATABASE_URL`).
4. Variáveis: `APP_SECRET` (obrigatória, 32+ caracteres, **não mude depois**) e, se quiser, `ADMIN_PASSWORD`.
5. Faça um novo deploy e abra `/api/health`: tudo precisa estar `ok`.

A senha inicial do painel é **89221570** (guardada como hash). Troque em **Painel → Configurações → Alterar senha**.

## Trazer os dados do site antigo (Netlify)

1. No site **antigo**, faça o deploy da versão da pasta `gaucho-netlify` deste repositório (ela ganhou a exportação para o administrador).
2. No site **novo**: **Painel → Configurações → Importar do site antigo**, informe o endereço (`https://….netlify.app`) e a senha do painel antigo.
3. Fotos, pedidos e preço padrão são importados **com os mesmos ids**: os links `/pedido/…` que os clientes já têm continuam funcionando. É seguro repetir (não duplica).

Backup a qualquer momento: **Painel → Configurações → Baixar backup** (informações das fotos e todos os pedidos; as imagens ficam no Blob).

## Rodar no seu computador

```bash
npm install
# precisa de um PostgreSQL local:
DATABASE_URL=postgres://postgres@localhost:5432/gf npm run local     # http://localhost:8890
npm test                                                             # testes do núcleo
npm run smoke                                                        # fluxo completo contra o servidor local
```

## Segurança

Senha com scrypt; sessão `HttpOnly` + `Secure` + `SameSite=Strict`; bloqueio após 5 tentativas erradas; checagem de origem em
toda requisição que altera dados; preço sempre definido pelo servidor; "Já paguei" nunca libera arquivo; links de download
assinados e válidos por 5 minutos; limite de 25 downloads por foto; importação só aceita sites `*.netlify.app`.
