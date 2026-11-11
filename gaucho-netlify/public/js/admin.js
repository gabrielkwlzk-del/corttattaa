import { $, $$, ApiError, api, centsToInput, dateTime, esc, icons, LOGO, price, toast } from "./common.js";

const root = $("#root");
const MAX = 5 * 1024 * 1024;
const small = (svg) => svg.replace('width="20" height="20"', 'width="16" height="16"');

// ============================================================== login ======
function showLogin() {
  root.innerHTML = `<div class="adm-login"><form class="login-card glass-strong" id="lf" novalidate>
    <div class="ic">${icons.lock}</div>
    <div style="display:flex;justify-content:center;margin-bottom:6px">${LOGO}</div>
    <h1 style="text-align:center;font-size:1.4rem;font-weight:600;letter-spacing:-.03em;margin-top:18px">Painel administrativo</h1>
    <p class="muted" style="text-align:center;font-size:.875rem;margin-top:4px">Acesso restrito</p>
    <label class="label" for="pw" style="margin-top:26px">Senha</label>
    <input class="field" id="pw" type="password" autocomplete="current-password" required autofocus>
    <p class="err hidden" id="le" role="alert" style="margin-top:12px"></p>
    <button class="btn btn-primary btn-block" id="lb" style="margin-top:22px">Entrar</button>
  </form></div>`;
  $("#lf").addEventListener("submit", async (e) => {
    e.preventDefault();
    const b = $("#lb");
    b.disabled = true;
    b.textContent = "Entrando…";
    try {
      await api("/api/admin/login", { method: "POST", json: { password: $("#pw").value } });
      showApp();
    } catch (ex) {
      $("#le").textContent = ex.message;
      $("#le").classList.remove("hidden");
      $("#pw").value = "";
      b.disabled = false;
      b.textContent = "Entrar";
      const c = $(".login-card");
      c.classList.remove("shake");
      void c.offsetWidth;
      c.classList.add("shake");
    }
  });
}

// ============================================================== shell ======
const VIEWS = {
  visao: { label: "Visão geral", icon: icons.grid, render: viewOverview },
  pedidos: { label: "Pedidos", icon: icons.receipt, render: viewOrders },
  fotos: { label: "Fotografias", icon: icons.image, render: viewPhotos },
  enviar: { label: "Enviar fotos", icon: icons.upload, render: viewUpload },
  config: { label: "Configurações", icon: icons.settings, render: viewSettings },
};
let badge = 0;

async function guard(fn) {
  try {
    return await fn();
  } catch (e) {
    if (e instanceof ApiError && e.status === 401) return showLogin();
    toast(e.message || "Erro inesperado");
    throw e;
  }
}

async function logout() {
  await api("/api/admin/logout", { method: "POST" }).catch(() => {});
  showLogin();
}

function showApp() {
  root.innerHTML = `<div class="shell">
    <aside class="side-nav"><div class="glass">
      <div class="side-top">${LOGO}<button class="btn btn-glass btn-sm lo-mobile" id="lo2" type="button" aria-label="Sair">${small(icons.logout)}</button></div>
      <nav class="menu" id="menu" aria-label="Painel administrativo">${Object.entries(VIEWS)
        .map(([k, v]) => `<button type="button" data-v="${k}">${v.icon}<span>${v.label}</span>${k === "pedidos" ? '<i class="dot hidden" id="badge"></i>' : ""}</button>`)
        .join("")}</nav>
      <button class="logout" id="lo" type="button">${icons.logout} Sair</button>
    </div></aside>
    <main class="main" id="main"></main></div>`;
  $("#lo").addEventListener("click", logout);
  $("#lo2").addEventListener("click", logout);
  $("#menu").addEventListener("click", (e) => {
    const b = e.target.closest("[data-v]");
    if (b) location.hash = b.dataset.v;
  });
  route();
}

async function route() {
  const v = location.hash.slice(1) in VIEWS ? location.hash.slice(1) : "visao";
  $$("#menu button").forEach((b) => b.setAttribute("aria-current", b.dataset.v === v ? "page" : "false"));
  const main = $("#main");
  if (!main) return;
  main.innerHTML = `<div class="skeleton" style="height:240px;border-radius:28px"></div>`;
  window.scrollTo({ top: 0 });
  await guard(() => VIEWS[v].render(main));
  setBadge();
}
addEventListener("hashchange", () => $("#main") && route());

async function setBadge() {
  try {
    const { stats } = await api("/api/admin/orders");
    badge = stats.awaitingReview;
    const el = $("#badge");
    if (el) {
      el.textContent = badge;
      el.classList.toggle("hidden", !badge);
    }
  } catch {}
}

const head = (title, sub, actions = "") =>
  `<div class="phead"><div><p class="eyebrow">${sub}</p><h1 style="margin-top:8px">${title}</h1></div><div class="row">${actions}</div></div>`;

// drawer ------------------------------------------------------------------
const drawer = $("#drawer");
function openDrawer(html) {
  $("#dPanel").innerHTML = html;
  drawer.classList.add("open");
  drawer.setAttribute("aria-hidden", "false");
  return $("#dPanel");
}
function closeDrawer() {
  drawer.classList.remove("open");
  drawer.setAttribute("aria-hidden", "true");
}
$("#dBg").addEventListener("click", closeDrawer);
addEventListener("keydown", (e) => e.key === "Escape" && closeDrawer());

// ============================================================ visão geral ===
async function viewOverview(main) {
  const [{ orders, stats }, { photos }] = await Promise.all([api("/api/admin/orders"), api("/api/admin/photos")]);
  const pend = orders.filter((o) => o.status === "pending").slice(0, 6);
  main.innerHTML = `${head("Bom trabalho hoje.", "Visão geral", `<a class="btn btn-primary btn-sm" href="#enviar">Enviar fotos</a>`)}
    ${stats.awaitingReview ? `<a class="alert sky" href="#pedidos">${stats.awaitingReview} pedido(s) em que o cliente avisou que pagou aguardam sua conferência →</a>` : ""}
    <div class="stats">
      <div class="stat glass hot"><p>Faturamento</p><b>${price(stats.revenueCents)}</b></div>
      <div class="stat glass"><p>Pedidos pagos</p><b>${stats.paid}</b></div>
      <div class="stat glass"><p>Aguardando pagamento</p><b>${stats.pending}</b></div>
      <div class="stat glass"><p>Fotos no site</p><b>${photos.filter((p) => !p.hidden).length}</b></div>
    </div>
    <section class="glass card" style="margin-top:24px">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px"><h2 style="font-size:1.05rem;font-weight:600">Pedidos aguardando</h2><a href="#pedidos" style="color:var(--sky);font-size:.875rem">Ver todos</a></div>
      ${
        pend.length
          ? `<ul style="list-style:none;margin:0;padding:0">${pend
              .map(
                (o) => `<li><button type="button" data-o="${o.id}" style="display:flex;width:100%;align-items:center;justify-content:space-between;gap:12px;padding:14px 0;border:0;border-top:1px solid rgba(255,255,255,.06);background:none;text-align:left">
                  <span style="min-width:0"><b style="display:block;font-size:.9rem">${esc(o.code)}</b><small class="muted" style="display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(o.email)} · ${dateTime(o.createdAt)}</small></span>
                  <span style="text-align:right;flex:none"><b style="display:block;font-size:.9rem">${price(o.amountCents)}</b>${o.reportedAt ? '<span class="badge b-sky">Cliente avisou</span>' : '<span class="badge b-warn">Aguardando</span>'}</span></button></li>`,
              )
              .join("")}</ul>`
          : `<p class="muted" style="padding:28px 0;text-align:center;font-size:.9rem">Nenhum pedido aguardando. 🎉</p>`
      }
    </section>`;
  $$("[data-o]", main).forEach((b) => b.addEventListener("click", () => orderDrawer(orders.find((o) => o.id === b.dataset.o))));
}

// ================================================================ pedidos ===
const STATUS = { pending: ["b-warn", "Aguardando"], paid: ["b-ok", "Pago"], cancelled: ["b-bad", "Cancelado"] };
let orderFilter = "";

async function viewOrders(main) {
  const { orders } = await api("/api/admin/orders");
  const list = orders.filter((o) => !orderFilter || o.status === orderFilter);
  const tabs = [["", "Todos"], ["pending", "Aguardando"], ["paid", "Pagos"], ["cancelled", "Cancelados"]];
  main.innerHTML = `${head("Pedidos", "Vendas")}
    <p class="muted" style="margin:-12px 0 20px;max-width:640px;font-size:.9rem">O Pix cai direto na sua conta. Quando o dinheiro aparecer no app do banco, abra o pedido e confirme: o cliente recebe o download na hora.</p>
    <div class="tabs" role="tablist">${tabs.map(([v, l]) => `<button type="button" class="chip" role="tab" aria-pressed="${orderFilter === v}" data-f="${v}">${l}</button>`).join("")}</div>
    <div class="glass tbl-wrap">${
      list.length
        ? `<table class="tbl"><thead><tr><th>Pedido</th><th>Cliente</th><th>Itens</th><th>Valor</th><th>Status</th><th>Criado</th></tr></thead><tbody>${list
            .map(
              (o) => `<tr data-o="${o.id}" style="cursor:pointer"><td><b>${esc(o.code)}</b></td><td>${esc(o.name || "—")}<span class="sub">${esc(o.email)}</span></td><td class="muted"><span class="sub" style="color:var(--ti)">${esc(o.titles)}</span></td><td><b>${price(o.amountCents)}</b></td><td><span class="badge ${STATUS[o.status][0]}">${STATUS[o.status][1]}</span>${o.status === "pending" && o.reportedAt ? ' <span class="badge b-sky">Cliente avisou</span>' : ""}</td><td class="muted">${dateTime(o.createdAt)}</td></tr>`,
            )
            .join("")}</tbody></table>`
        : `<p class="muted" style="padding:64px 0;text-align:center">Nenhum pedido encontrado.</p>`
    }</div>`;
  $$("[data-f]", main).forEach((b) => b.addEventListener("click", () => ((orderFilter = b.dataset.f), route())));
  $$("tr[data-o]", main).forEach((r) => r.addEventListener("click", () => orderDrawer(list.find((o) => o.id === r.dataset.o))));
}

function orderDrawer(o) {
  const p = openDrawer(`<div style="display:flex;justify-content:space-between;align-items:center"><h2 style="font-size:1.2rem;font-weight:600">Pedido ${esc(o.code)}</h2><button class="btn btn-glass x" id="dx" type="button" aria-label="Fechar">${icons.close}</button></div>
    <div><span class="badge ${STATUS[o.status][0]}">${STATUS[o.status][1]}</span>${o.status === "pending" && o.reportedAt ? ' <span class="badge b-sky">Cliente avisou que pagou</span>' : ""}</div>
    <div class="confirm-box">
      <div><span>Valor</span><b>${price(o.amountCents)}</b></div>
      <div><span>Cliente</span><b>${esc(o.name || "—")}</b></div>
      <div><span>E-mail</span><b style="word-break:break-all;text-align:right">${esc(o.email)}</b></div>
      <div><span>Itens</span><b style="text-align:right">${esc(o.titles)}</b></div>
      <div><span>Criado</span><b>${dateTime(o.createdAt)}</b></div>
      ${o.reportedAt ? `<div><span>Avisou que pagou</span><b>${dateTime(o.reportedAt)}</b></div>` : ""}
      ${o.paidAt ? `<div><span>Pago em</span><b>${dateTime(o.paidAt)}</b></div>` : ""}
    </div>
    ${
      o.status === "pending"
        ? `<p class="muted" style="font-size:.875rem;line-height:1.55">Confira no <b style="color:#fff">app do seu banco</b> se entrou um Pix de <b style="color:#fff">${price(o.amountCents)}</b> por volta de ${dateTime(o.reportedAt || o.createdAt)}. Só confirme depois de ver o dinheiro na conta.</p>
           <label class="check"><input type="checkbox" id="ck"> Conferi o crédito no meu banco e o valor está correto.</label>
           <button class="btn btn-sky btn-block" id="ok" type="button" disabled>Confirmar e liberar download</button>
           <button class="btn btn-danger btn-block" id="cx" type="button">Cancelar pedido</button>`
        : ""
    }`);
  $("#dx", p).addEventListener("click", closeDrawer);
  const ck = $("#ck", p);
  ck?.addEventListener("change", () => ($("#ok", p).disabled = !ck.checked));
  $("#ok", p)?.addEventListener("click", async (e) => {
    e.target.disabled = true;
    await guard(() => api(`/api/admin/orders/${o.id}/confirm`, { method: "POST" }));
    toast("Pagamento confirmado. Download liberado.");
    closeDrawer();
    route();
  });
  $("#cx", p)?.addEventListener("click", async () => {
    if (!confirm("Cancelar este pedido?")) return;
    await guard(() => api(`/api/admin/orders/${o.id}/cancel`, { method: "POST" }));
    closeDrawer();
    route();
  });
}

// ============================================================== fotografias ==
async function viewPhotos(main) {
  const { photos } = await api("/api/admin/photos");
  main.innerHTML = `${head("Fotografias", "Acervo", `<a class="btn btn-primary btn-sm" href="#enviar">Enviar fotos</a>`)}
    ${
      photos.length
        ? `<ul class="agrid">${photos
            .map(
              (p) => `<li><button class="acard ${p.hidden ? "off" : ""}" type="button" data-id="${p.id}"><div class="ph"><img src="${p.thumbUrl}" alt="" loading="lazy" draggable="false"><div class="tags">${p.hidden ? '<span class="badge b-dim" style="background:rgba(0,0,0,.6)">Oculta</span>' : ""}</div></div><div class="info"><b>${esc(p.title || "Sem título")}</b><small>${price(p.priceCents)} · ${esc(p.modalidade || "Sem modalidade")}</small></div></button></li>`,
            )
            .join("")}</ul>`
        : `<div class="glass card" style="text-align:center;padding:64px 20px"><p class="muted">Nenhuma fotografia ainda. <a href="#enviar" style="color:var(--sky)">Envie as primeiras</a>.</p></div>`
    }`;
  $$("[data-id]", main).forEach((b) => b.addEventListener("click", () => photoDrawer(photos.find((p) => p.id === b.dataset.id), photos)));
}

function photoDrawer(p, all) {
  const mods = [...new Set(all.map((x) => x.modalidade).filter(Boolean))];
  const panel = openDrawer(`<form id="pf" style="display:flex;flex-direction:column;gap:14px;min-height:100%">
    <div style="display:flex;justify-content:space-between;align-items:center"><h2 style="font-size:1.2rem;font-weight:600">Editar fotografia</h2><button class="btn btn-glass x" id="dx" type="button" aria-label="Fechar">${icons.close}</button></div>
    <img src="${p.thumbUrl}" alt="" style="width:100%;aspect-ratio:4/3;object-fit:cover;border-radius:20px">
    <p class="muted" style="font-size:.75rem">${p.width && p.height ? `${p.width}×${p.height}px` : ""} · ${p.seed ? "foto de exemplo" : "enviada por você"}</p>
    <div><label class="label" for="e-t">Nome</label><input class="field" id="e-t" value="${esc(p.title)}" maxlength="160"></div>
    <div><label class="label" for="e-d">Descrição</label><textarea class="field" id="e-d" maxlength="2000">${esc(p.description)}</textarea></div>
    <div class="cols2"><div><label class="label" for="e-p">Preço (R$)</label><input class="field" id="e-p" inputmode="decimal" value="${centsToInput(p.priceCents)}"></div>
      <div><label class="label" for="e-h">Visibilidade</label><select class="field" id="e-h"><option value="0" ${p.hidden ? "" : "selected"}>Visível</option><option value="1" ${p.hidden ? "selected" : ""}>Oculta</option></select></div></div>
    <div class="cols2"><div><label class="label" for="e-m">Modalidade</label><input class="field" id="e-m" list="mods" value="${esc(p.modalidade)}" maxlength="60"><datalist id="mods">${mods.map((m) => `<option value="${esc(m)}">`).join("")}</datalist></div>
      <div><label class="label" for="e-e">Evento</label><input class="field" id="e-e" value="${esc(p.evento)}" maxlength="120"></div></div>
    <p class="err hidden" id="pe" role="alert"></p>
    <div class="row" style="margin-top:auto;padding-top:12px"><button class="btn btn-primary" style="flex:1" id="ps">Salvar</button><button class="btn btn-danger" id="pd" type="button" aria-label="Excluir">${icons.close.replace("M18 6 6 18M6 6l12 12", "M4 7h16M10 11v6M14 11v6M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12M9 7V4h6v3")}</button></div></form>`);
  $("#dx", panel).addEventListener("click", closeDrawer);
  $("#pf", panel).addEventListener("submit", async (e) => {
    e.preventDefault();
    try {
      await api(`/api/admin/photos/${p.id}`, {
        method: "PATCH",
        json: { title: $("#e-t").value, description: $("#e-d").value, price: $("#e-p").value, hidden: $("#e-h").value === "1", modalidade: $("#e-m").value, evento: $("#e-e").value },
      });
      toast("Fotografia atualizada.");
      closeDrawer();
      route();
    } catch (ex) {
      $("#pe").textContent = ex.message;
      $("#pe").classList.remove("hidden");
    }
  });
  $("#pd", panel).addEventListener("click", async () => {
    if (!confirm("Excluir esta fotografia? Se ela já foi vendida, será apenas arquivada para o comprador manter o acesso.")) return;
    const r = await guard(() => api(`/api/admin/photos/${p.id}`, { method: "DELETE" }));
    toast(r?.archived ? "Fotografia arquivada." : "Fotografia excluída.");
    closeDrawer();
    route();
  });
}

// ================================================================== envio ====
const uploads = [];
let running = false;

async function shrink(file) {
  // Netlify Functions aceitam ~6 MB por requisição: otimiza fotos maiores que 5 MB.
  if (file.size <= MAX || !/^image\/(jpeg|png|webp)$/.test(file.type)) return file;
  const bmp = await createImageBitmap(file, { imageOrientation: "from-image" });
  let scale = 1;
  for (let i = 0; i < 6; i++) {
    const c = document.createElement("canvas");
    c.width = Math.round(bmp.width * scale);
    c.height = Math.round(bmp.height * scale);
    c.getContext("2d").drawImage(bmp, 0, 0, c.width, c.height);
    for (const q of [0.92, 0.85, 0.78, 0.7]) {
      const blob = await new Promise((r) => c.toBlob(r, "image/jpeg", q));
      if (blob && blob.size <= MAX * 0.95) return new File([blob], file.name.replace(/\.\w+$/, ".jpg"), { type: "image/jpeg" });
    }
    scale *= 0.85;
  }
  return file;
}

function sendOne(file, fields, onProgress) {
  return new Promise((resolve, reject) => {
    const fd = new FormData();
    fd.set("file", file);
    Object.entries(fields).forEach(([k, v]) => fd.set(k, v));
    const x = new XMLHttpRequest();
    x.open("POST", "/api/admin/photos");
    x.upload.onprogress = (e) => e.lengthComputable && onProgress(e.loaded / e.total);
    x.onload = () => {
      let data = {};
      try {
        data = JSON.parse(x.responseText);
      } catch {}
      x.status >= 200 && x.status < 300 ? resolve(data) : reject(new Error(x.status === 401 ? "Sessão expirada" : data.error || `Erro ${x.status}`));
    };
    x.onerror = () => reject(new Error("Falha de rede"));
    x.send(fd);
  });
}

async function viewUpload(main) {
  const [{ photos }, settings] = await Promise.all([api("/api/admin/photos"), api("/api/admin/settings")]);
  const mods = [...new Set(photos.map((x) => x.modalidade).filter(Boolean))];
  uploads.length = 0;
  main.innerHTML = `${head("Enviar fotografias", "Acervo")}
    <div class="two">
      <section class="glass card"><h2 style="font-size:1.05rem;font-weight:600">Configurações do lote</h2><p class="muted" style="font-size:.875rem;margin-top:4px">Valem para todas as fotos enviadas agora. Dá para editar cada uma depois.</p>
        <div class="form" style="margin-top:18px">
          <div><label class="label" for="u-m">Modalidade</label><input class="field" id="u-m" list="u-mods" placeholder="Corrida, Ciclismo, Futebol…" maxlength="60"><datalist id="u-mods">${mods.map((m) => `<option value="${esc(m)}">`).join("")}</datalist></div>
          <div><label class="label" for="u-e">Evento <span class="muted">(opcional)</span></label><input class="field" id="u-e" maxlength="120"></div>
          <div><label class="label" for="u-p">Preço por foto (R$)</label><input class="field" id="u-p" inputmode="decimal" value="${centsToInput(settings.defaultPriceCents)}"></div>
          <button class="btn btn-sky btn-block" id="u-go" type="button" disabled>Selecione as fotos</button>
          <p class="muted" style="font-size:.75rem">JPEG, PNG, WebP ou TIFF · até 5 MB por foto. Fotos maiores são otimizadas automaticamente antes do envio.</p>
        </div></section>
      <div style="display:grid;gap:20px;min-width:0">
        <div class="drop glass" id="drop"><div class="ic">${icons.upload}</div><b style="font-size:1.1rem;letter-spacing:-.02em">Arraste as fotografias aqui</b><p class="muted" style="font-size:.875rem;margin-top:4px">ou escolha no seu aparelho — dezenas de uma vez</p><button class="btn btn-glass" id="pick" type="button" style="margin-top:18px">Escolher arquivos</button><input class="sr-only" id="file" type="file" multiple accept="image/jpeg,image/png,image/webp,image/tiff"></div>
        <section class="glass card hidden" id="ulist"><div style="display:flex;justify-content:space-between;align-items:center;gap:12px;margin-bottom:12px"><span id="ucount" style="font-size:.9rem"></span><a class="btn btn-primary btn-sm hidden" id="uview" href="#fotos">Ver no acervo</a></div><div class="progress"><i id="ubar"></i></div><ul class="uplist" id="uitems"></ul></section>
      </div>
    </div>`;
  const input = $("#file");
  $("#pick").addEventListener("click", () => input.click());
  input.addEventListener("change", () => (addFiles(input.files), (input.value = "")));
  const drop = $("#drop");
  ["dragover", "dragenter"].forEach((ev) => drop.addEventListener(ev, (e) => (e.preventDefault(), drop.classList.add("over"))));
  ["dragleave", "drop"].forEach((ev) => drop.addEventListener(ev, (e) => (e.preventDefault(), drop.classList.remove("over"))));
  drop.addEventListener("drop", (e) => addFiles(e.dataTransfer.files));
  $("#u-go").addEventListener("click", startUpload);
  renderUploads();
}

function addFiles(files) {
  for (const f of files) {
    if (!/^image\//.test(f.type)) {
      uploads.push({ file: f, state: "bad", error: "Não é uma imagem", p: 0 });
      continue;
    }
    uploads.push({ file: f, state: "queued", p: 0, preview: URL.createObjectURL(f) });
  }
  renderUploads();
}

function renderUploads() {
  const box = $("#ulist");
  if (!box) return;
  box.classList.toggle("hidden", !uploads.length);
  const q = uploads.filter((u) => u.state === "queued").length;
  const done = uploads.filter((u) => u.state === "ok").length;
  const bad = uploads.filter((u) => u.state === "bad").length;
  const fin = done + bad;
  $("#ucount").innerHTML = `<b>${uploads.length}</b> arquivo(s) <span class="muted">· ${done} enviadas · ${bad} com erro</span>`;
  $("#ubar").style.width = `${uploads.length ? (fin / uploads.length) * 100 : 0}%`;
  $("#uview").classList.toggle("hidden", running || !done);
  const go = $("#u-go");
  go.disabled = running || !q;
  go.textContent = running ? "Enviando…" : q ? `Enviar ${q} foto${q === 1 ? "" : "s"}` : "Selecione as fotos";
  $("#uitems").innerHTML = uploads
    .map((u) => {
      const st = { queued: ["", "Na fila"], busy: ["go", `${Math.round(u.p * 100)}%`], proc: ["go", "Processando…"], ok: ["ok", "Enviada"], bad: ["bad", "Erro"] }[u.state];
      return `<li class="up"><div class="ph">${u.preview ? `<img src="${u.preview}" alt="">` : ""}<span class="st ${st[0]}">${st[1]}</span></div>${u.state === "busy" ? `<div class="bar"><i style="width:${u.p * 100}%"></i></div>` : ""}<div class="nm"><b>${esc(u.file.name)}</b><small class="${u.state === "bad" ? "bad" : ""}">${u.error ? esc(u.error) : `${(u.file.size / 1048576).toFixed(1)} MB`}</small></div></li>`;
    })
    .join("");
}

async function startUpload() {
  const fields = { modalidade: $("#u-m").value, evento: $("#u-e").value, price: $("#u-p").value };
  running = true;
  const queue = uploads.filter((u) => u.state === "queued");
  let i = 0;
  const worker = async () => {
    while (i < queue.length) {
      const u = queue[i++];
      try {
        u.state = "busy";
        renderUploads();
        const file = await shrink(u.file);
        await sendOne(file, fields, (p) => ((u.p = p), p >= 1 && (u.state = "proc"), renderUploads()));
        u.state = "ok";
      } catch (e) {
        if (e.message === "Sessão expirada") return showLogin();
        u.state = "bad";
        u.error = e.message;
      }
      renderUploads();
    }
  };
  await Promise.all([worker(), worker()]);
  running = false;
  renderUploads();
  setBadge();
}

// ============================================================ configurações ==
async function viewSettings(main) {
  const s = await api("/api/admin/settings");
  main.innerHTML = `${head("Configurações", "Sistema")}
    <div class="stats" style="grid-template-columns:repeat(auto-fit,minmax(300px,1fr))">
      <section class="glass card"><h2 style="font-size:1.05rem;font-weight:600">Preço padrão</h2><p class="muted" style="font-size:.875rem;margin:4px 0 16px">Aplicado às próximas fotos enviadas. As fotos existentes mantêm o preço individual.</p>
        <form id="sp" class="row" style="flex-wrap:nowrap"><input class="field" id="sp-v" inputmode="decimal" value="${centsToInput(s.defaultPriceCents)}" aria-label="Preço padrão em reais"><button class="btn btn-primary" style="flex:none">Salvar</button></form></section>
      <section class="glass card"><h2 style="font-size:1.05rem;font-weight:600">Pix recebedor</h2><p class="muted" style="font-size:.875rem;margin:4px 0 16px">Os pagamentos caem direto na sua conta, sem intermediário.</p>
        <dl class="kv"><div><dt>Chave Pix</dt><dd>${esc(s.pix.key)}</dd></div><div><dt>Nome no QR</dt><dd>${esc(s.pix.name)}</dd></div><div><dt>Confirmação</dt><dd>Manual, pelo painel</dd></div></dl></section>
      <section class="glass card"><h2 style="font-size:1.05rem;font-weight:600">Alterar senha</h2><p class="muted" style="font-size:.875rem;margin:4px 0 16px">Ao trocar, todas as sessões são encerradas.</p>
        <form id="pw" class="form"><input class="field" type="password" id="pw-c" placeholder="Senha atual" autocomplete="current-password" aria-label="Senha atual"><input class="field" type="password" id="pw-n" placeholder="Nova senha (mín. 8 caracteres)" autocomplete="new-password" aria-label="Nova senha"><button class="btn btn-glass">Alterar senha</button><p class="err hidden" id="pw-e" role="alert"></p></form></section>
    </div>`;
  $("#sp").addEventListener("submit", async (e) => {
    e.preventDefault();
    await guard(() => api("/api/admin/settings", { method: "PUT", json: { defaultPrice: $("#sp-v").value } })).then(() => toast("Preço padrão atualizado."));
  });
  $("#pw").addEventListener("submit", async (e) => {
    e.preventDefault();
    try {
      await api("/api/admin/password", { method: "POST", json: { current: $("#pw-c").value, next: $("#pw-n").value } });
      toast("Senha alterada. Entre novamente.");
      showLogin();
    } catch (ex) {
      $("#pw-e").textContent = ex.message;
      $("#pw-e").classList.remove("hidden");
    }
  });
}

// ================================================================== início ===
api("/api/admin/me")
  .then((r) => (r.admin ? showApp() : showLogin()))
  .catch(showLogin);
