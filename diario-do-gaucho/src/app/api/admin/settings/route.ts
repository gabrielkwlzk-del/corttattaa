import { UserError } from "@/lib/errors";
import { errorResponse, json, requireAdminApi } from "@/lib/http";
import { parseBRLToCents } from "@/lib/money";
import { setDefaultPriceCents } from "@/lib/services/settings";

export async function PUT(req: Request) {
  try {
    await requireAdminApi(req);
    const { defaultPrice } = (await req.json()) as { defaultPrice: string };
    const cents = parseBRLToCents(String(defaultPrice ?? ""));
    if (cents === null) throw new UserError("Preço inválido.");
    await setDefaultPriceCents(cents);
    return json({ ok: true, defaultPriceCents: cents });
  } catch (e) {
    return errorResponse(e);
  }
}
