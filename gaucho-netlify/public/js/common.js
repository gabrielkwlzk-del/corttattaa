export const $ = (s, r = document) => r.querySelector(s);
export const $$ = (s, r = document) => [...r.querySelectorAll(s)];

export const esc = (s) =>
  String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

export const price = (cents) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(cents / 100);
export const centsToInput = (c) => (c / 100).toFixed(2).replace(".", ",");
export const dateTime = (iso) =>
  iso
    ? new Intl.DateTimeFormat("pt-BR", {
        timeZone: "America/Sao_Paulo",
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      }).format(new Date(iso))
    : "—";

export class ApiError extends Error {
  constructor(message, status) {
    super(message);
    this.status = status;
  }
}

export async function api(url, { json, ...opts } = {}) {
  const res = await fetch(url, {
    ...opts,
    headers: { ...(json !== undefined ? { "content-type": "application/json" } : {}), ...(opts.headers || {}) },
    body: json !== undefined ? JSON.stringify(json) : opts.body,
    cache: "no-store",
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(data.detail ? `${data.error} (${data.detail})` : data.error || `Erro ${res.status}`, res.status);
  return data;
}

let toastTimer;
export function toast(msg) {
  let t = $("#toast");
  if (!t) {
    t = document.createElement("div");
    t.id = "toast";
    t.className = "toast glass-strong";
    t.setAttribute("role", "status");
    document.body.appendChild(t);
  }
  t.textContent = msg;
  t.classList.add("on");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove("on"), 2600);
}

const ic = (d, w = 1.8) =>
  `<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;

export const icons = {
  search: ic('<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>'),
  close: ic('<path d="M18 6 6 18M6 6l12 12"/>'),
  left: ic('<path d="m15 18-6-6 6-6"/>'),
  right: ic('<path d="m9 18 6-6-6-6"/>'),
  arrow: ic('<path d="M5 12h14M13 6l6 6-6 6"/>'),
  down: ic('<path d="M12 5v14M6 13l6 6 6-6"/>'),
  copy: ic('<rect x="9" y="9" width="11" height="11" rx="2.5"/><path d="M5 15V6a2 2 0 0 1 2-2h9"/>'),
  check: ic('<path d="M20 6 9 17l-5-5"/>'),
  download: ic('<path d="M12 4v11M7 10l5 5 5-5M5 20h14"/>'),
  lock: ic('<rect x="4.5" y="10.5" width="15" height="10" rx="2.5"/><path d="M8 10.5V7a4 4 0 0 1 8 0v3.5"/>'),
  shield: ic('<path d="M12 3 4.5 6v5.5c0 4.6 3.2 8.3 7.5 9.5 4.3-1.2 7.5-4.9 7.5-9.5V6L12 3Z"/><path d="m9 12 2 2 4-4"/>'),
  grid: ic('<rect x="3.5" y="3.5" width="7" height="7" rx="2"/><rect x="13.5" y="3.5" width="7" height="7" rx="2"/><rect x="3.5" y="13.5" width="7" height="7" rx="2"/><rect x="13.5" y="13.5" width="7" height="7" rx="2"/>'),
  image: ic('<rect x="3" y="4" width="18" height="16" rx="3"/><circle cx="9" cy="10" r="1.8"/><path d="m21 16-5-5-9 9"/>'),
  upload: ic('<path d="M12 16V4M7 9l5-5 5 5M5 20h14"/>'),
  receipt: ic('<path d="M6 3h12v18l-3-2-3 2-3-2-3 2V3Z"/><path d="M9 8h6M9 12h6"/>'),
  settings: ic('<circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M4.2 4.2l2.1 2.1M17.7 17.7l2.1 2.1M2 12h3M19 12h3M4.2 19.8l2.1-2.1M17.7 6.3l2.1-2.1"/>'),
  logout: ic('<path d="M15 4h3a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-3M10 17l5-5-5-5M15 12H3"/>'),
  pix: ic('<path d="m12 2.8 4.3 4.3-2.1 2.1a3 3 0 0 1-4.3 0L7.7 7.1 12 2.8ZM12 21.2l-4.3-4.3 2.1-2.1a3 3 0 0 1 4.3 0l2.1 2.1-4.2 4.3ZM2.8 12l3.1-3.1h1.6l2.4 2.4a1 1 0 0 0 1.4 0M21.2 12l-3.1 3.1h-1.6l-2.4-2.4a1 1 0 0 0-1.4 0"/>', 1.6),
};

export const LOGO = `<a class="logo" href="/" aria-label="Esporte Show Online — início"><i><svg viewBox="0 0 24 24" fill="none" stroke="#08090D" stroke-width="2.2" stroke-linecap="round"><circle cx="12" cy="12" r="4.2"/><path d="M4 8.5V7a3 3 0 0 1 3-3h1.5M20 8.5V7a3 3 0 0 0-3-3h-1.5M4 15.5V17a3 3 0 0 0 3 3h1.5M20 15.5V17a3 3 0 0 1-3 3h-1.5"/></svg></i>Esporte Show Online</a>`;

export function mountChrome() {
  const nav = document.createElement("header");
  nav.className = "nav";
  nav.innerHTML = `<nav class="nav-in glass" aria-label="Principal">${LOGO}<div class="nav-links"><a href="/#galeria" class="hide-sm">Galeria</a><button class="btn btn-glass btn-sm nav-lock" data-admin-open type="button" aria-label="Área do administrador">${icons.lock.replace('width="20" height="20"', 'width="16" height="16"')}<span class="nav-lock-t">Painel</span></button><a href="/#galeria" class="btn btn-primary btn-sm">Explorar</a></div></nav>`;
  document.body.prepend(nav);
  const on = () => nav.classList.toggle("scrolled", scrollY > 40);
  addEventListener("scroll", on, { passive: true });
  on();
}

export function footer() {
  return `<footer class="foot"><div class="wrap foot-in"><div>${LOGO}<p>Fotografia esportiva com cuidado editorial. Prévias protegidas por marca d'água; o arquivo original em alta resolução é liberado somente após a confirmação do pagamento.</p></div><div class="foot-links"><div><b>Navegar</b><a href="/#galeria">Galeria</a></div><div><b>Pagamento</b><span>Pix · BRL</span><span>Liberação segura</span></div></div></div><div class="wrap copy">© ${new Date().getFullYear()} Esporte Show Online. Todos os direitos reservados. · <button class="linkbtn" data-admin-open type="button">Área do administrador</button></div></footer>`;
}

export function reveal(root = document) {
  const io = new IntersectionObserver(
    (entries) =>
      entries.forEach((e) => {
        if (e.isIntersecting) {
          e.target.classList.add("in");
          io.unobserve(e.target);
        }
      }),
    { rootMargin: "0px 0px -40px 0px" },
  );
  $$(".reveal:not(.in)", root).forEach((el) => io.observe(el));
  return io;
}

// ----------------------------------------------- entrada do painel pelo site ----
let isAdminCached = false;
let admModal;

function openAdminLogin() {
  if (!admModal) {
    admModal = document.createElement("div");
    admModal.className = "modal";
    admModal.innerHTML = `<button class="modal-bg" type="button" tabindex="-1" aria-label="Fechar"></button>
      <form class="sheet mini glass-strong" role="dialog" aria-modal="true" aria-labelledby="admT" novalidate>
        <div class="mini-ic">${icons.lock}</div>
        <h2 id="admT">Área do administrador</h2>
        <p class="muted">Digite a senha para entrar no painel.</p>
        <div><label class="label" for="admPw">Senha</label><input class="field" id="admPw" type="password" autocomplete="current-password" required></div>
        <p class="err hidden" id="admErr" role="alert"></p>
        <button class="btn btn-primary btn-block" id="admGo">Entrar</button>
        <button class="btn btn-glass btn-block" type="button" id="admX">Cancelar</button>
      </form>`;
    document.body.appendChild(admModal);
    const close = () => admModal.classList.remove("open");
    $(".modal-bg", admModal).addEventListener("click", close);
    $("#admX", admModal).addEventListener("click", close);
    addEventListener("keydown", (e) => e.key === "Escape" && close());
    $("form", admModal).addEventListener("submit", async (e) => {
      e.preventDefault();
      const btn = $("#admGo", admModal);
      const err = $("#admErr", admModal);
      err.classList.add("hidden");
      btn.disabled = true;
      btn.textContent = "Entrando…";
      try {
        await api("/api/admin/login", { method: "POST", json: { password: $("#admPw", admModal).value } });
        location.href = "/admin";
      } catch (ex) {
        err.textContent = ex.message;
        err.classList.remove("hidden");
        btn.disabled = false;
        btn.textContent = "Entrar";
        $("#admPw", admModal).value = "";
        $("#admPw", admModal).focus();
      }
    });
  }
  admModal.classList.add("open");
  setTimeout(() => $("#admPw", admModal).focus(), 50);
}

document.addEventListener("click", (e) => {
  if (!e.target.closest("[data-admin-open]")) return;
  e.preventDefault();
  // Já logado? Vai direto ao painel. Senão, pede a senha aqui mesmo, sem sair do site.
  isAdminCached ? (location.href = "/admin") : openAdminLogin();
});

// Se já houver sessão de administrador, o botão do menu vira um atalho direto.
fetch("/api/admin/me", { cache: "no-store" })
  .then((r) => r.json())
  .then((r) => {
    isAdminCached = Boolean(r.admin);
  })
  .catch(() => {});
