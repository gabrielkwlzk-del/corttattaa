import { NextResponse } from "next/server";
import { handleMercadoPagoWebhook } from "@/lib/services/webhooks";

export async function POST(req: Request) {
  const text = await req.text();
  if (text.length > 64_000) return NextResponse.json({ ok: false }, { status: 413 });
  let body: unknown = {};
  try {
    body = text ? JSON.parse(text) : {};
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }
  const r = await handleMercadoPagoWebhook({ url: req.url, headers: req.headers, body });
  return NextResponse.json(r.body, { status: r.status });
}
