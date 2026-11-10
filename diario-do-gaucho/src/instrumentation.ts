/**
 * Executado uma vez ao iniciar o servidor. Conecta ao banco e aplica as
 * migrations, para que uma configuração errada apareça já no deploy.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { getDb } = await import("./lib/db");
  try {
    await getDb();
    console.log("[startup] banco conectado e migrations aplicadas");
  } catch (err) {
    console.error("[startup] falha ao conectar ao banco:", err);
    process.exit(1);
  }
}
