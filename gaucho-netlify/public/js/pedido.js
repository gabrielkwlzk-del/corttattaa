import { $, $$, api, esc, footer, icons, mountChrome, price, toast, dateTime } from "./common.js";

mountChrome();
$("#footer").innerHTML = footer();

const token = location.pathname.split("/").filter(Boolean).pop();
const app = $("#app");
let order = null;
let timer = null;

function itemsHtml(items, paid) {
  return `<ul class="items">${items
    .map(
      (it) => `<li class="item glass"><img src="${it.thumbUrl}" alt="" draggable="false"><div class="t"><b>${esc(it.title || "Fotografia")}</b><small>${price(it.priceCents)}</small></div>${
        paid ? `<button class="btn btn-primary btn-sm" data-dl="${it.photoId}" type="button">${icons.download.replace('width="20" height="20"', 'width="16" height="16"')} Baixar</button>` : ""
      }</li>`,
    )
    .join("")}</ul>`;
}

const saveLink = () => `<div class="card" style="border:1px solid rgba(255,255,255,.07);border-radius:24px;padding:16px;font-size:.875rem;color:var(--ti)"><p><b style="color:#fff">Guarde este link.</b> Ele é a sua chave para recuperar a compra a qualquer momento.</p><button class="btn btn-sm" id="copyLink" type="button" style="margin-top:12px;padding:0;height:auto;background:none;color:var(--sky)">${icons.copy.replace('width="20" height="20"', 'width="16" height="16"')} Copiar link do pedido</button></div>`;

function renderPending(o) {
  app.innerHTML = `<div class="pay-grid">
    <section class="glass card" aria-labelledby="pt">
      <div style="display:flex;align-items:center;justify-content:space-between;gap:12px">
        <p class="eyebrow">Pedido ${esc(o.code)}</p>
        <span class="badge b-warn"><span class="pulse"></span> Aguardando pagamento</span>
      </div>
      <h1 id="pt" class="pagetitle" style="font-size:2rem">Pague com Pix</h1>
      <p class="muted" style="margin-top:8px">Escaneie o QR Code no app do seu banco ou use o código copia e cola.</p>
      <div class="qr" role="img" aria-label="QR Code Pix">${o.qrSvg || ""}</div>
      <div class="amount"><span class="muted" style="font-size:.875rem">Valor</span><b>${price(o.amountCents)}</b></div>
      <div style="margin-top:24px">
        <label class="label" for="copia">Pix copia e cola</label>
        <div class="copy-row"><input class="field" id="copia" readonly value="${esc(o.copiaECola || "")}"><button class="btn btn-primary" id="copy" type="button" style="flex:none">${icons.copy.replace('width="20" height="20"', 'width="16" height="16"')} <span>Copiar</span></button></div>
      </div>
    </section>
    <section style="display:grid;gap:20px;align-content:start">
      <div class="glass card">
        <h2 style="font-size:1.1rem;font-weight:600">Como funciona</h2>
        <ol class="steps">
          <li>Abra o app do seu banco e escolha pagar com Pix.</li>
          <li>Escaneie o QR Code ou cole o código copia e cola.</li>
          <li>Depois que confirmarmos o recebimento, esta página se atualiza sozinha.</li>
          <li>Baixe o arquivo original em alta resolução, sem marca d'água.</li>
        </ol>
        <div style="margin-top:24px;padding-top:24px;border-top:1px solid rgba(255,255,255,.08)" id="rep">
          ${
            o.reported
              ? `<p class="badge b-sky" style="display:block;padding:14px 16px;border-radius:18px;font-weight:500;line-height:1.5" role="status">Recebemos seu aviso. A liberação acontece assim que o pagamento for confirmado.</p>`
              : `<button class="btn btn-glass btn-block" id="paid" type="button">Já paguei</button>`
          }
          <p class="note" style="margin-top:14px">${icons.lock.replace('width="20" height="20"', 'width="14" height="14"')}<span>Por segurança, o arquivo só é liberado depois da confirmação real do pagamento.</span></p>
        </div>
      </div>
      ${itemsHtml(o.items, false)}
      ${saveLink()}
    </section>
  </div>`;

  $("#copy")?.addEventListener("click", async () => {
    const v = o.copiaECola;
    try {
      await navigator.clipboard.writeText(v);
    } catch {
      const i = $("#copia");
      i.select();
      document.execCommand("copy");
    }
    const b = $("#copy span");
    b.textContent = "Copiado";
    setTimeout(() => (b.textContent = "Copiar"), 2200);
  });
  $("#copia")?.addEventListener("focus", (e) => e.target.select());
  $("#paid")?.addEventListener("click", async (e) => {
    e.target.disabled = true;
    await api(`/api/orders/${token}/reported`, { method: "POST" }).catch(() => {});
    load();
  });
}

function renderPaid(o) {
  app.innerHTML = `<div style="max-width:640px;margin:0 auto"><div class="done">
      <div class="tick"><svg viewBox="0 0 52 52"><path d="M14 27l8 8 16-17"/></svg></div>
      <h1>Pagamento aprovado.</h1>
      <p class="muted" style="margin-top:12px;max-width:420px">Obrigado! Seu momento já é seu. Baixe o arquivo original em alta resolução, sem marca d'água.</p>
      <p class="muted" style="margin-top:8px;font-size:.75rem">Pedido ${esc(o.code)} · confirmado em ${dateTime(o.paidAt)}</p>
    </div>
    <div style="margin-top:40px">${itemsHtml(o.items, true)}</div>
    <p class="note" style="justify-content:center;margin-top:16px">${icons.lock.replace('width="20" height="20"', 'width="14" height="14"')}<span>Cada download gera um link seguro e temporário.</span></p>
    <div style="margin-top:28px">${saveLink()}</div>
    <div style="margin-top:28px;text-align:center"><a class="btn btn-glass" href="/#galeria">Continuar explorando</a></div></div>`;
  $$("[data-dl]").forEach((b) =>
    b.addEventListener("click", async () => {
      b.disabled = true;
      try {
        const { url } = await api(`/api/orders/${token}/download/${b.dataset.dl}`, { method: "POST" });
        location.href = url;
      } catch (e) {
        toast(e.message);
      } finally {
        setTimeout(() => (b.disabled = false), 1500);
      }
    }),
  );
}

function renderClosed(o) {
  app.innerHTML = `<div class="glass card" style="max-width:520px;margin:0 auto;text-align:center;padding:40px"><h1 style="font-size:1.6rem;font-weight:600;letter-spacing:-.03em">Pedido cancelado</h1><p class="muted" style="margin-top:12px">Nenhuma cobrança foi confirmada para o pedido ${esc(o.code)}. Se você já pagou, entre em contato informando o código.</p><a class="btn btn-primary" href="/#galeria" style="margin-top:28px">Voltar à galeria</a></div>`;
}

function render(o) {
  const prev = order?.status;
  order = o;
  if (o.status === "paid") renderPaid(o);
  else if (o.status === "pending") renderPending(o);
  else renderClosed(o);
  $("#copyLink")?.addEventListener("click", async () => {
    await navigator.clipboard?.writeText(location.href).catch(() => {});
    toast("Link copiado");
  });
  if (prev && prev !== o.status) scrollTo({ top: 0, behavior: "smooth" });
}

async function load() {
  try {
    const o = await api(`/api/orders/${token}`);
    // Atualiza só se mudou (evita piscar o QR Code a cada consulta).
    if (!order || o.status !== order.status || o.reported !== order.reported) render(o);
    else order = o;
    if (o.status !== "pending") clearInterval(timer);
  } catch (e) {
    clearInterval(timer);
    app.innerHTML = `<div class="glass card" style="max-width:520px;margin:0 auto;text-align:center;padding:40px"><h1 style="font-size:1.6rem;font-weight:600">Pedido não encontrado</h1><p class="muted" style="margin-top:12px">${esc(e.message)}</p><a class="btn btn-primary" href="/#galeria" style="margin-top:28px">Voltar à galeria</a></div>`;
  }
}

load();
timer = setInterval(load, 5000);
document.addEventListener("visibilitychange", () => document.visibilityState === "visible" && load());
