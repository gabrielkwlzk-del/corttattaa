import "server-only";
import { UserError } from "../errors";
import { q } from "../db";
import { DEFAULT_PRICE_CENTS, MAX_PRICE_CENTS, MIN_PRICE_CENTS } from "../money";

export async function getSetting<T>(key: string): Promise<T | null> {
  const rows = await q<{ value: T }>("select value from settings where key = $1", [key]);
  return rows[0]?.value ?? null;
}

export async function setSetting(key: string, value: unknown) {
  await q(
    `insert into settings (key, value, updated_at) values ($1, $2::text::jsonb, now())
     on conflict (key) do update set value = excluded.value, updated_at = now()`,
    [key, JSON.stringify(value)],
  );
}

export async function getDefaultPriceCents(): Promise<number> {
  const v = await getSetting<number>("default_price_cents");
  return typeof v === "number" && Number.isInteger(v) ? v : DEFAULT_PRICE_CENTS;
}

export function assertValidPrice(cents: number) {
  if (!Number.isInteger(cents) || cents < MIN_PRICE_CENTS || cents > MAX_PRICE_CENTS) {
    throw new UserError("Preço inválido. Use um valor entre R$ 1,00 e R$ 100.000,00.");
  }
}

export async function setDefaultPriceCents(cents: number) {
  assertValidPrice(cents);
  await setSetting("default_price_cents", cents);
}
