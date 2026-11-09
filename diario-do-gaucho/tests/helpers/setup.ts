import os from "node:os";
import path from "node:path";
import fs from "node:fs";

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "dg-test-"));
Object.assign(process.env, {
  NODE_ENV: "test",
  DATABASE_URL: "memory://",
  STORAGE_DRIVER: "local",
  LOCAL_STORAGE_DIR: path.join(dir, "storage"),
  APP_SECRET: "test-secret-0123456789-0123456789-abcdef",
  APP_URL: "http://localhost:3000",
  ADMIN_PASSWORD: "senha-forte-de-teste",
  PIX_PROVIDER: "static",
  PIX_KEY: "47992145561",
  PIX_MERCHANT_NAME: "Diário do Gaúcho",
  PIX_MERCHANT_CITY: "Porto Alegre",
});
