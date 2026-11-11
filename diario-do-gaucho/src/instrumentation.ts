/**
 * Executado ao iniciar o servidor. Conecta ao banco e aplica as migrations,
 * para que uma configuração errada apareça já no deploy.
 *
 * Em servidor próprio (Render, Docker, VPS) uma falha encerra o processo, para
 * o deploy aparecer como falho. Em ambientes serverless (Netlify, Vercel, Lambda)
 * encerrar o processo derruba a função inteira, então apenas registramos o erro:
 * as requisições seguintes respondem com a mensagem de configuração.
 */
const SERVERLESS = Boolean(
  process.env.NETLIFY || process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME,
);

export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { getDb } = await import("./lib/db");
  try {
    await getDb();
    console.log("[startup] banco conectado e migrations aplicadas");
  } catch (err) {
    console.error("[startup] falha ao conectar ao banco:", err);
    if (!SERVERLESS) process.exit(1);
  }
}
