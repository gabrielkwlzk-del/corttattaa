import type { NextConfig } from "next";

const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
];

const nextConfig: NextConfig = {
  poweredByHeader: false,
  // Arquivos lidos em tempo de execução (migrations e fonte da marca d'água).
  outputFileTracingIncludes: {
    "/**": ["./supabase/migrations/**", "./assets/fonts/**"],
  },
  serverExternalPackages: ["sharp", "@electric-sql/pglite", "postgres", "opentype.js"],
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
