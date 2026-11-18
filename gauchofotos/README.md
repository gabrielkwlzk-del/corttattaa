# Esporte Show Online

Site Next.js para vender fotos esportivas por Pix, com confirmação manual. Os originais ficam em bucket privado e cada download recebe um link assinado de 60 segundos. O envio por e-mail está desativado conforme solicitado; a entrega acontece na página permanente do pedido.

## Configuração

1. Crie um projeto **novo** no Supabase na região de São Paulo. Execute `supabase/schema.sql` no SQL Editor. Ele cria as tabelas e os buckets privados `previews` e `originais`.
2. Na Vercel, vincule este repositório ao projeto `gauchofotos`. Configure as variáveis abaixo em **Production**. Não use chaves no código.
3. O e-mail está desativado. Se quiser habilitá-lo depois, verifique um domínio no Resend e configure `EMAIL_ENABLED=true`, `RESEND_API_KEY` e `RESEND_FROM_EMAIL`.
4. Rode `npm install`, `npm run build` e `npm test`. Para o teste integrado, defina `TEST_BASE_URL` e `ADMIN_TEST_PASSWORD` somente no ambiente de teste. O teste limpa seus registros ao terminar.
5. Verifique `/api/health`. Banco e storage devem aparecer como `ok`; o e-mail aparece como `desativado`.

## Variáveis da Vercel

| Variável | Valor |
| --- | --- |
| `SUPABASE_URL` | URL do projeto Supabase |
| `SUPABASE_SERVICE_ROLE_KEY` | Chave secreta do projeto, só no servidor |
| `NEXT_PUBLIC_SUPABASE_URL` | Mesma URL do Supabase |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Chave publishable ou anon do Supabase |
| `ADMIN_PASSWORD_HASH` | `salt:hash` em hex, gerado com scrypt para a senha escolhida |
| `SESSION_SECRET` | Segredo aleatório com pelo menos 32 bytes |
| `EMAIL_ENABLED` | Opcional; deixe ausente para não enviar e-mails |
| `RESEND_API_KEY` | Opcional, somente quando habilitar e-mail |
| `RESEND_FROM_EMAIL` | Opcional, remetente verificado no Resend |
| `NEXT_PUBLIC_SITE_URL` | `https://gauchofotos.vercel.app` |

Para gerar o hash, rode localmente: `node scripts/hash-password.mjs`. Informe a senha pelo prompt; ela não é gravada em arquivo. Copie somente o hash para a Vercel.

O botão **Baixar backup JSON** exporta os registros do banco. Ele não contém os arquivos das fotos; faça também backups separados dos dois buckets no Supabase. Não apague fotos vendidas: o painel impede isso para preservar pedidos pagos.
