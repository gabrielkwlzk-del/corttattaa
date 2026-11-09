/**
 * Aplica as migrations de supabase/migrations no banco de DATABASE_URL.
 * Uso: npm run db:migrate
 */
import { getDb, migrate } from "../src/lib/db";

(async () => {
  process.env.AUTO_MIGRATE = "false";
  const db = await getDb();
  const applied = await migrate(db);
  console.log(applied.length ? `Migrations aplicadas: ${applied.join(", ")}` : "Banco já está atualizado.");
  await db.close();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
