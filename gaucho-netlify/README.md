# Diário do Gaúcho — site para Netlify

Site de fotografia esportiva feito para rodar **nativamente na Netlify**: páginas estáticas
(HTML, CSS e JavaScript puro) + uma Netlify Function para o servidor + Netlify Blobs para guardar
os dados. **Não precisa de banco de dados nem de outro serviço.**

## O que tem

- **Site:** hero cinematográfico, galeria com busca e filtro por modalidade, foto ampliada,
  compra com Pix (QR Code e copia e cola), página do pedido que atualiza sozinha, recuperação de compra.
- **Pix direto para a conta do Gaúcho:** chave `47992145561` (celular). O dinheiro cai na conta, sem intermediário.
- **Painel `/admin` com senha:** visão geral, pedidos (confirmar pagamento), fotografias (editar preço,
  nome, modalidade, ocultar, excluir), envio de várias fotos de uma vez e configurações.
- **Prévia protegida:** a marca d'água "Diário do Gaúcho" é gravada nos pixels, no servidor (não é CSS).
  O original nunca é público: só sai por link assinado de 5 minutos depois do pagamento confirmado.

## Como o pagamento funciona (importante)

O Pix vai direto para a chave do Gaúcho e **não existe confirmação automática** sem um provedor de
pagamento. Então o fluxo é:

1. O cliente paga o QR Code.
2. O cliente clica em **Já paguei** (isso só avisa; **não libera nada**).
3. O Gaúcho vê o aviso no painel (`Pedidos`), confere o Pix no app do banco e clica em
   **Confirmar e liberar download**.
4. A página do cliente atualiza sozinha e libera o download do original.

## Publicar na Netlify

1. Em **Add new site → Import an existing project**, escolha o repositório no GitHub.
2. Em **Branch to deploy**, escolha `claude/nifty-planck-rue96z` (ou a branch onde esta pasta estiver).
3. Em **Base directory**, coloque `gaucho-netlify`. O resto (publish `public`, funções) já está no `netlify.toml`.
4. Clique em **Deploy**. Pronto: o site e o painel (`/admin`) funcionam, sem configurar mais nada.

> Se já existe um site (por exemplo `gauchosite`), abra **Site configuration → Build & deploy → Build settings**
> e troque o *Base directory* para `gaucho-netlify` e a branch, depois refaça o deploy.

Também dá para publicar pela linha de comando, dentro desta pasta: `npx netlify-cli deploy --prod`.

### Senha do painel

A senha inicial é **89221570** (guardada como hash, nunca em texto no código). Para trocar:
**Painel → Configurações → Alterar senha**. Como é uma senha só de números, recomendo trocar por uma
mais longa. Alternativa: definir a variável `ADMIN_PASSWORD` no Netlify (vale enquanto a senha não
tiver sido trocada pelo painel). O painel bloqueia por 15 minutos depois de 5 tentativas erradas.

### Variáveis opcionais (Site configuration → Environment variables)

| Variável | Para quê | Padrão |
|---|---|---|
| `PIX_KEY` | Chave Pix que recebe | `47992145561` |
| `PIX_NAME` | Nome que aparece no QR Code | `Diario do Gaucho` |
| `PIX_CITY` | Cidade no QR Code | `BRASIL` |
| `ADMIN_PASSWORD` | Senha do painel | (hash embutido) |

## Fotos

- As 8 fotos de exemplo já vêm no site. Troque ou apague pelo painel em **Fotografias**.
- Para enviar novas: **Painel → Enviar fotos**. Dá para arrastar dezenas de uma vez.
- **Limite de 5 MB por foto**, por causa do limite das Netlify Functions. Fotos maiores são
  otimizadas automaticamente no navegador antes do envio (a qualidade é preservada o máximo possível).
- Foto já vendida não é apagada, só arquivada, para o comprador não perder o acesso.

## Rodar no seu computador

```bash
npm install
npm run local        # abre http://localhost:8888  (painel em /admin)
npm test             # testes do Pix e da senha
npm run smoke        # teste de fluxo completo (com o servidor local ligado)
```

Os dados locais ficam em `.local-data/` e não vão para o Git.

## Estrutura

```
public/            site estático (index, pedido, recuperar, admin) + css/js/fontes + prévias das fotos de exemplo
netlify/functions/api.mjs   toda a API (catálogo, pedidos, download assinado, painel)
netlify/lib/       Pix (BR Code), senha, armazenamento, marca d'água, processamento de imagem
tools/             servidor local, teste de fluxo, gerador das fotos de exemplo
tests/             testes automáticos
netlify.toml       configuração de build, rotas e cabeçalhos de segurança
```

## Segurança

Senha com hash scrypt; sessão em cookie `HttpOnly`, `Secure` e `SameSite=Strict`; bloqueio por tentativas;
proteção contra requisições de outra origem; o preço é sempre definido pelo servidor; "Já paguei"
nunca libera arquivo; links de download assinados e com validade de 5 minutos; cabeçalhos CSP.

## Aviso sobre as fotos de exemplo

As 8 fotos de exemplo foram geradas por IA. Para vender de verdade, troque por fotos reais dos seus
eventos, com autorização de uso de imagem dos atletas.
