import { $, $$, api, esc, footer, icons, mountChrome, price, reveal } from "./common.js";

mountChrome();
$("#footer").innerHTML = footer();
$("#icDown").innerHTML = icons.down;
$("#icSearch").innerHTML = icons.search;
$("#mPrev").innerHTML = icons.left;
$("#mNext").innerHTML = icons.right;
$("#mClose").innerHTML = icons.close;
$("#mProt").innerHTML = `${icons.shield.replace('width="20" height="20"', 'width="14" height="14" style="color:var(--sky)"')} Prévia protegida`;
$("#mNote").innerHTML = `${icons.lock.replace('width="20" height="20"', 'width="14" height="14"')}<span>Após a confirmação do Pix você baixa o arquivo original em alta resolução, sem marca d'água.</span>`;

const state = { all: [], q: "", mod: "", open: null };
const io = reveal();

// ---------------------------------------------------------------- hero ----
function initHero(photos) {
  const bg = $("#heroBg");
  const strip = $("#strip");
  const show = photos.slice(0, 5);
  if (!show.length) return;
  bg.innerHTML = show.map((p, i) => `<img src="${p.previewUrl}" alt="" draggable="false" ${i === 0 ? 'fetchpriority="high"' : ""}>`).join("");
  const imgs = $$("img", bg);
  let cur = 0;
  const set = (i) => {
    cur = i;
    imgs.forEach((im, n) => im.classList.toggle("on", n === i));
    $$("button", strip).forEach((b, n) => b.setAttribute("aria-current", n === i ? "true" : "false"));
  };
  strip.innerHTML = show.map((p, i) => `<button type="button" aria-label="Ver destaque ${i + 1}: ${esc(p.title)}"><img src="${p.thumbUrl}" alt="" draggable="false"></button>`).join("");
  $$("button", strip).forEach((b, i) => b.addEventListener("click", () => set(i)));
  if (show.length < 2) strip.remove();
  set(0);
  if (!matchMedia("(prefers-reduced-motion: reduce)").matches && show.length > 1) setInterval(() => set((cur + 1) % show.length), 7000);
}

// ------------------------------------------------------------- galeria ----
const norm = (s) => String(s).normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
const filtered = () => {
  const q = norm(state.q.trim());
  return state.all.filter((p) => (!state.mod || p.modalidade === state.mod) && (!q || norm(`${p.title} ${p.description} ${p.modalidade} ${p.evento}`).includes(q)));
};

function renderChips() {
  const mods = [...new Set(state.all.map((p) => p.modalidade).filter(Boolean))].sort();
  const box = $("#chips");
  if (!mods.length) return (box.hidden = true);
  box.innerHTML = [`<button class="chip" type="button" data-m="" aria-pressed="${!state.mod}">Todas</button>`, ...mods.map((m) => `<button class="chip" type="button" data-m="${esc(m)}" aria-pressed="${state.mod === m}">${esc(m)}</button>`)].join("");
}

function renderGrid() {
  const list = filtered();
  const grid = $("#grid");
  const active = Boolean(state.mod || state.q.trim());
  $("#count").textContent = `${list.length} fotografia${list.length === 1 ? "" : "s"}`;
  $("#clear").classList.toggle("hidden", !active);
  $("#empty").classList.toggle("hidden", list.length > 0);
  if (!list.length) {
    $("#emptyT").textContent = active ? "Nenhuma fotografia encontrada" : "As fotografias chegam em breve";
    $("#emptyP").textContent = active ? "Tente outro termo ou modalidade." : "Estamos preparando os registros. Volte em breve.";
  }
  grid.innerHTML = list
    .map(
      (p, i) => `<li><button class="photo" type="button" data-id="${p.id}" style="--d:${(i % 8) * 0.04}s" aria-label="${esc(p.title)}${p.modalidade ? ` — ${esc(p.modalidade)}` : ""}, ${price(p.priceCents)}">
        <div class="ph skeleton"><img src="${p.thumbUrl}" alt="${esc(p.title)}" loading="lazy" decoding="async" draggable="false" style="opacity:0"></div>
        <span class="price glass">${price(p.priceCents)}</span>
        <span class="cap"><b>${esc(p.title)}</b>${p.modalidade || p.evento ? `<small>${esc([p.evento, p.modalidade].filter(Boolean).join(" · "))}</small>` : ""}</span>
      </button></li>`,
    )
    .join("");
  const seen = new IntersectionObserver(
    (entries) => entries.forEach((e) => e.isIntersecting && (e.target.classList.add("in"), seen.unobserve(e.target))),
    { rootMargin: "0px 0px -30px 0px" },
  );
  $$(".photo", grid).forEach((el) => {
    seen.observe(el);
    const img = $("img", el);
    const done = () => {
      img.style.opacity = 1;
      img.parentElement.classList.remove("skeleton");
    };
    img.complete && img.naturalWidth ? done() : img.addEventListener("load", done, { once: true });
    img.addEventListener("contextmenu", (e) => e.preventDefault());
  });
}

$("#chips").addEventListener("click", (e) => {
  const b = e.target.closest("[data-m]");
  if (!b) return;
  state.mod = b.dataset.m === state.mod ? "" : b.dataset.m;
  renderChips();
  renderGrid();
});
let t;
$("#q").addEventListener("input", (e) => {
  clearTimeout(t);
  t = setTimeout(() => {
    state.q = e.target.value;
    renderGrid();
  }, 200);
});
$("#clear").addEventListener("click", () => {
  state.q = state.mod = "";
  $("#q").value = "";
  renderChips();
  renderGrid();
});
$("#grid").addEventListener("click", (e) => {
  const b = e.target.closest(".photo");
  if (b) openPhoto(b.dataset.id);
});

// --------------------------------------------------------------- modal ----
const modal = $("#modal");
let lastFocus;
function openPhoto(id, push = true) {
  const list = filtered();
  const p = list.find((x) => x.id === id) || state.all.find((x) => x.id === id);
  if (!p) return;
  state.open = p;
  lastFocus = document.activeElement;
  $("#mImg").src = p.previewUrl;
  $("#mImg").alt = p.title;
  $("#mTitle").textContent = p.title;
  $("#mEvt").textContent = p.evento || p.modalidade || "";
  $("#mDesc").textContent = p.description;
  $("#mDesc").hidden = !p.description;
  const meta = [p.evento && ["Evento", p.evento, true], p.modalidade && ["Modalidade", p.modalidade], p.width && p.height && ["Original", `${p.width} × ${p.height}px`]].filter(Boolean);
  $("#mMeta").innerHTML = meta.map(([k, v, full]) => `<div class="${full ? "full" : ""}"><dt>${k}</dt><dd>${esc(v)}</dd></div>`).join("");
  $("#mMeta").hidden = !meta.length;
  $("#mPrice").textContent = price(p.priceCents);
  const i = list.findIndex((x) => x.id === p.id);
  $("#mPrev").hidden = i <= 0;
  $("#mNext").hidden = i < 0 || i >= list.length - 1;
  showStep("buy");
  modal.classList.add("open");
  modal.setAttribute("aria-hidden", "false");
  document.body.style.overflow = "hidden";
  $("#sheet").focus();
  if (push) history.replaceState(null, "", `#foto=${p.id}`);
}
function closePhoto() {
  modal.classList.remove("open");
  modal.setAttribute("aria-hidden", "true");
  document.body.style.overflow = "";
  state.open = null;
  history.replaceState(null, "", location.pathname + location.search);
  lastFocus?.focus?.();
}
function step(dir) {
  const list = filtered();
  const i = list.findIndex((x) => x.id === state.open?.id);
  const next = list[i + dir];
  if (next) openPhoto(next.id);
}
function showStep(s) {
  $("#stepBuy").classList.toggle("hidden", s !== "buy");
  $("#stepForm").classList.toggle("hidden", s !== "form");
  if (s === "form") $("#email").focus();
}
$("#mClose").addEventListener("click", closePhoto);
$("#mBg").addEventListener("click", closePhoto);
$("#mPrev").addEventListener("click", () => step(-1));
$("#mNext").addEventListener("click", () => step(1));
$("#mImg").addEventListener("contextmenu", (e) => e.preventDefault());
addEventListener("keydown", (e) => {
  if (!modal.classList.contains("open")) return;
  if (e.key === "Escape") closePhoto();
  if (e.key === "ArrowLeft" && !/INPUT|TEXTAREA/.test(document.activeElement.tagName)) step(-1);
  if (e.key === "ArrowRight" && !/INPUT|TEXTAREA/.test(document.activeElement.tagName)) step(1);
  if (e.key === "Tab") {
    const f = $$("a[href],button:not([disabled]):not([hidden]),input", $("#sheet")).filter((el) => el.offsetParent !== null);
    if (!f.length) return;
    const first = f[0];
    const last = f[f.length - 1];
    if (e.shiftKey && document.activeElement === first) (e.preventDefault(), last.focus());
    else if (!e.shiftKey && document.activeElement === last) (e.preventDefault(), first.focus());
  }
});

// --------------------------------------------------------------- compra ----
$("#buyBtn").addEventListener("click", () => showStep("form"));
$("#backBtn").addEventListener("click", () => showStep("buy"));
$("#stepForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const err = $("#formErr");
  err.classList.add("hidden");
  const btn = $("#payBtn");
  btn.disabled = true;
  btn.innerHTML = '<span class="spin"></span> Gerando Pix…';
  try {
    // Só o ID da foto é enviado: o preço é definido pelo servidor.
    const r = await api("/api/orders", { method: "POST", json: { photoIds: [state.open.id], email: $("#email").value, name: $("#name").value } });
    location.href = r.url;
  } catch (ex) {
    err.textContent = ex.message;
    err.classList.remove("hidden");
    btn.disabled = false;
    btn.textContent = "Pagar com Pix";
  }
});

// ------------------------------------------------------------- iniciar ----
async function init() {
  $("#grid").innerHTML = Array.from({ length: 8 }, () => `<li><div class="photo in" style="opacity:1;transform:none"><div class="ph skeleton"></div></div></li>`).join("");
  try {
    const { photos } = await api("/api/photos");
    state.all = photos;
  } catch {
    $("#grid").innerHTML = "";
    $("#count").textContent = "Não foi possível carregar as fotografias. Atualize a página.";
    return;
  }
  const mods = new Set(state.all.map((p) => p.modalidade).filter(Boolean));
  $("#heroStats").innerHTML = [
    state.all.length && `<li><b>${state.all.length}</b> fotografias</li>`,
    mods.size && `<li><b>${mods.size}</b> modalidade${mods.size === 1 ? "" : "s"}</li>`,
    `<li style="display:inline-flex;align-items:center;gap:8px">${icons.shield.replace('width="20" height="20"', 'width="16" height="16" style="color:var(--sky)"')} Pix com liberação segura</li>`,
  ].filter(Boolean).join("");
  initHero(state.all);
  renderChips();
  renderGrid();
  const m = location.hash.match(/^#foto=(.+)$/);
  if (m) openPhoto(decodeURIComponent(m[1]), false);
  void io;
}
init();
