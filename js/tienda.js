// =====================================================================
// Panel › Desarrollador › Ventas de la Tienda (migración 0021, PEGAR_EN_SUPABASE_16.sql)
// Compras con Google Play: cuántas, quiénes, qué productos y cuánto (montos informativos:
// los manda el celular tal como los mostró Google; el dinero real está en Play Console).
// Usa las globales del panel: sb, $, msg, mostrar, textoError, esAdmin.
// Se dibuja dentro de <div class="tarjeta oculto mt-root" id="t-tienda"></div> y se carga con cargarTienda().
// =====================================================================
(function () {
  "use strict";

  const ZONA = "America/La_Paz";
  let armado = false, cargando = false;

  const nodo = (tag, clase, texto) => {
    const e = document.createElement(tag);
    if (clase) e.className = clase;
    if (texto != null) e.textContent = texto;
    return e;
  };
  const num = (n) => Number(n || 0).toLocaleString("es-BO");
  const sinServidor = (m) => /Could not find the function|PGRST202|shop_admin_summary/i.test(m || "");
  // Montos en micros (1.000.000 = 1 unidad de la moneda)
  function plata(micros, moneda) {
    const v = Number(micros || 0) / 1e6;
    try { return v.toLocaleString("es-BO", { style: "currency", currency: moneda, minimumFractionDigits: 2 }); }
    catch { return v.toFixed(2) + " " + moneda; }
  }
  function plataLista(ingresos) {
    const partes = Object.entries(ingresos || {}).map(([m, v]) => plata(v, m));
    return partes.length ? partes.join(" + ") : "—";
  }
  const cuando = (t) => new Date(t).toLocaleString("es-BO", { timeZone: ZONA, day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

  function armar() {
    const caja = $("t-tienda");
    if (!caja || armado) return !!caja;
    armado = true;
    caja.classList.add("mt-root");
    const h2 = nodo("h2", null, "Ventas de la Tienda ");
    h2.append(nodo("span", "chip", "Administrador"));
    caja.append(h2);
    caja.append(nodo("p", "sub", "Compras con Google Play (tazas, granos, aromas, semillas, ropa exclusiva y el pack de inicio). Las compras de prueba (cuentas de prueba de licencias) se cuentan aparte. Los montos son informativos: lo que realmente cobraste está en Play Console › Informes financieros."));
    const fila = nodo("div", "fila");
    fila.style.marginBottom = "6px";
    const sel = nodo("select");
    sel.id = "ti-dias";
    sel.setAttribute("aria-label", "Período");
    sel.style.maxWidth = "200px";
    for (const [v, t] of [[7, "Últimos 7 días"], [30, "Últimos 30 días"], [90, "Últimos 90 días"], [365, "Último año"]]) {
      const o = nodo("option", null, t); o.value = String(v); if (v === 30) o.selected = true; sel.append(o);
    }
    sel.addEventListener("change", () => cargarTienda());
    const recargar = nodo("button", "btn borde", "Actualizar");
    recargar.type = "button";
    recargar.onclick = () => cargarTienda();
    fila.append(sel, recargar);
    caja.append(fila);
    const kpis = nodo("div", "kpis"); kpis.id = "ti-kpis";
    caja.append(kpis);
    caja.append(nodo("h3", null, "Por producto"));
    const t1 = nodo("div", "tabla-scroll"); const tp = nodo("table", "mt"); tp.id = "ti-productos"; t1.append(tp);
    caja.append(t1);
    caja.append(nodo("h3", null, "Últimas compras"));
    const t2 = nodo("div", "tabla-scroll"); const tr = nodo("table", "mt"); tr.id = "ti-recientes"; t2.append(tr);
    caja.append(t2);
    const m = nodo("p", "msg"); m.id = "m-tienda"; m.setAttribute("role", "status");
    caja.append(m);
    for (const h of caja.querySelectorAll("h3")) { h.style.fontSize = "17px"; h.style.margin = "10px 0 2px"; }
    return true;
  }

  function tabla(t, cabeza, filas) {
    t.textContent = "";
    const thead = nodo("thead"), tr = nodo("tr");
    for (const [txt, n] of cabeza) { const th = nodo("th", n ? "n" : null, txt); tr.append(th); }
    thead.append(tr); t.append(thead);
    const tb = nodo("tbody");
    for (const f of filas) {
      const r = nodo("tr");
      f.forEach((v, i) => r.append(nodo("td", cabeza[i][1] ? "n" : null, v)));
      tb.append(r);
    }
    if (!filas.length) { const r = nodo("tr"); const td = nodo("td", null, "Todavía no hay compras."); td.colSpan = cabeza.length; r.append(td); tb.append(r); }
    t.append(tb);
  }

  function pintar(d) {
    const k = d.kpi || {}, caja = $("ti-kpis");
    caja.textContent = "";
    const tiles = [
      [num(k.compras), "compras reales"], [num(k.compradores), "compradores"], [plataLista(d.ingresos), "ingresos informados"],
      [num(k.pruebas), "compras de prueba"], [num(k.reembolsos), "reembolsadas", k.reembolsos > 0],
      [num(k.total), "compras desde el inicio"], [num(k.semillasEsperando), "semillas esperando lugar"],
    ];
    for (const [v, t, alerta] of tiles) {
      const div = nodo("div", "kpi" + (alerta ? " alerta" : ""));
      div.append(nodo("div", "v", v), nodo("div", "t", t));
      caja.append(div);
    }
    tabla($("ti-productos"), [["Producto"], ["Compras", 1], ["Unidades", 1], ["Pruebas", 1], ["Ingresos", 1]],
      (d.productos || []).map((p) => [`${p.title} (${p.id})${p.active ? "" : " · inactivo"}`, num(p.compras), num(p.unidades), num(p.pruebas), plataLista(p.ingresos)]));
    tabla($("ti-recientes"), [["Cuándo"], ["Jugador"], ["Producto"], ["Monto", 1], ["Estado"]],
      (d.recientes || []).map((r) => [
        cuando(r.at), r.user || "(cuenta borrada)", (r.title || r.product) + (r.quantity > 1 ? ` × ${r.quantity}` : ""),
        r.priceMicros && r.currency ? plata(r.priceMicros * (r.quantity || 1), r.currency) : "—",
        r.test ? "Prueba" : r.state === "refunded" ? "Reembolsada" : "Entregada",
      ]));
  }

  async function cargarTienda() {
    if (!esAdmin || !armar() || cargando) return;
    mostrar("t-tienda", true);
    cargando = true;
    try {
      msg("m-tienda", "Cargando…");
      const { data, error } = await sb.rpc("shop_admin_summary", { p_days: +$("ti-dias").value });
      if (error) {
        msg("m-tienda", sinServidor(error.message) ? "Falta actualizar el servidor: ejecuta PEGAR_EN_SUPABASE_16.sql en Supabase." : textoError(error), "error");
        return;
      }
      msg("m-tienda");
      pintar(data || {});
    } finally {
      cargando = false;
    }
  }

  window.cargarTienda = cargarTienda;
})();
