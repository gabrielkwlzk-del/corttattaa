/**
 * Gera um hash scrypt para usar em ADMIN_PASSWORD_HASH (opcional).
 * Uso: npm run admin:hash -- "minha senha forte"
 */
import { hashPassword } from "../src/lib/crypto";

const pw = process.argv[2];
if (!pw || pw.length < 10) {
  console.error('Informe a senha (mín. 10 caracteres): npm run admin:hash -- "sua senha"');
  process.exit(1);
}
hashPassword(pw).then((h) => console.log(h));
