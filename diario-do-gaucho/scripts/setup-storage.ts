/**
 * Cria os buckets PRIVADOS no Supabase Storage (originais e prévias).
 * Uso: npm run storage:setup
 */
import { createClient } from "@supabase/supabase-js";

(async () => {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Defina SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY.");
  const sb = createClient(url, key, { auth: { persistSession: false } });
  const max = Number(process.env.MAX_UPLOAD_MB ?? 40);
  const buckets = [
    { name: process.env.SUPABASE_ORIGINALS_BUCKET ?? "originals", size: max },
    { name: process.env.SUPABASE_PREVIEWS_BUCKET ?? "previews", size: 10 },
  ];
  for (const b of buckets) {
    const { data } = await sb.storage.getBucket(b.name);
    if (data) {
      if (data.public) throw new Error(`O bucket "${b.name}" está PÚBLICO. Torne-o privado no painel do Supabase.`);
      console.log(`✓ ${b.name} já existe (privado)`);
      continue;
    }
    const { error } = await sb.storage.createBucket(b.name, {
      public: false,
      fileSizeLimit: `${b.size}MB`,
    });
    if (error) throw error;
    console.log(`✓ ${b.name} criado (privado)`);
  }
})().catch((e) => {
  console.error(e.message ?? e);
  process.exit(1);
});
