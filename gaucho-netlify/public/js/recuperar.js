import { $, footer, mountChrome } from "./common.js";

mountChrome();
$("#footer").innerHTML = footer();
$("#f").addEventListener("submit", (ev) => {
  ev.preventDefault();
  const m = $("#t").value.trim().match(/(?:pedido\/)?([A-Za-z0-9_-]{40,64})\/?$/);
  if (!m) {
    $("#e").textContent = "Link ou código inválido. Verifique e tente novamente.";
    $("#e").classList.remove("hidden");
    return;
  }
  location.href = `/pedido/${m[1]}`;
});
