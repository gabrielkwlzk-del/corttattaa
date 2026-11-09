import "server-only";

/** Leitura centralizada de variáveis de ambiente (somente servidor). */
function str(name: string): string | undefined {
  const v = process.env[name];
  return v && v.trim() !== "" ? v.trim() : undefined;
}

export const env = {
  get isProd() {
    return process.env.NODE_ENV === "production";
  },
  get appUrl() {
    return (str("APP_URL") ?? "http://localhost:3000").replace(/\/$/, "");
  },
  /** Segredo para assinar URLs locais e tokens. Obrigatório em produção. */
  get appSecret() {
    const s = str("APP_SECRET");
    if (!s) {
      if (process.env.NODE_ENV === "production") {
        throw new Error("APP_SECRET não configurado.");
      }
      return "dev-only-insecure-secret-change-me-0000000000";
    }
    if (s.length < 32) throw new Error("APP_SECRET deve ter ao menos 32 caracteres.");
    return s;
  },
  get databaseUrl() {
    return str("DATABASE_URL");
  },
  get adminPassword() {
    return str("ADMIN_PASSWORD");
  },
  get adminPasswordHash() {
    return str("ADMIN_PASSWORD_HASH");
  },
  get storageDriver(): "local" | "supabase" {
    const d = str("STORAGE_DRIVER");
    if (d === "supabase" || d === "local") return d;
    return str("SUPABASE_URL") && str("SUPABASE_SERVICE_ROLE_KEY") ? "supabase" : "local";
  },
  get localStorageDir() {
    return str("LOCAL_STORAGE_DIR") ?? ".data/storage";
  },
  get supabaseUrl() {
    return str("SUPABASE_URL");
  },
  get supabaseServiceRoleKey() {
    return str("SUPABASE_SERVICE_ROLE_KEY");
  },
  get originalsBucket() {
    return str("SUPABASE_ORIGINALS_BUCKET") ?? "originals";
  },
  get previewsBucket() {
    return str("SUPABASE_PREVIEWS_BUCKET") ?? "previews";
  },
  get maxUploadBytes() {
    const mb = Number(str("MAX_UPLOAD_MB") ?? "40");
    return Math.max(1, Math.min(200, Number.isFinite(mb) ? mb : 40)) * 1024 * 1024;
  },
  get downloadUrlTtlSeconds() {
    return Number(str("DOWNLOAD_URL_TTL_SECONDS") ?? "300");
  },
  // ---------- Pix ----------
  get pixKey() {
    return str("PIX_KEY");
  },
  get pixMerchantName() {
    return str("PIX_MERCHANT_NAME");
  },
  get pixMerchantCity() {
    return str("PIX_MERCHANT_CITY");
  },
  get pixProvider(): "mercadopago" | "static" | "none" {
    const p = str("PIX_PROVIDER");
    if (p === "mercadopago" || p === "static" || p === "none") return p;
    if (str("MERCADOPAGO_ACCESS_TOKEN")) return "mercadopago";
    return "static";
  },
  get mercadoPagoAccessToken() {
    return str("MERCADOPAGO_ACCESS_TOKEN");
  },
  get mercadoPagoWebhookSecret() {
    return str("MERCADOPAGO_WEBHOOK_SECRET");
  },
  get mercadoPagoApiBase() {
    return str("MERCADOPAGO_API_BASE") ?? "https://api.mercadopago.com";
  },
  get pixExpirationMinutes() {
    return Number(str("PIX_EXPIRATION_MINUTES") ?? "30");
  },
};
