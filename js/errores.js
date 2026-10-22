// Errores del juego (PASO 33 en Supabase, migración 0038).
// Desarrollador › "Errores del juego" (solo administradores): los errores y cierres inesperados que mandan los
// celulares, agrupados por huella. Cuántas veces pasó en los días elegidos, cuándo fue la última vez, la versión, los
// celulares, el mensaje; al abrir uno se ve la pila, las migas (qué estaba haciendo el jugador) y el contexto.
// "Marcar resuelto" lo esconde; si vuelve a pasar en una versión nueva, el servidor lo reabre solo.
// No hay datos personales: el juego y el servidor limpian correos, tokens, ids y coordenadas.
// Usa lo que ya define index.html: sb, $, msg, textoError. Los textos se pintan con textContent.
// Ancla: <div id="errores-anchor"></div> (Desarrollador). Se carga desde cargarAdmin() con cargarErrores().
(function () {
  "use strict";

  const ZONA = "America/La_Paz";
  const SIN_SERVIDOR = /Could not find the function|PGRST202/i;
  const PRONTO = "Los errores del juego llegan pronto: falta ejecutar PEGAR_EN_SUPABASE_33.sql en Supabase.";
  const TIPOS = {
    cierre: { nombre: "Cierre inesperado", color: "#b4412b" },
    excepcion: { nombre: "Excepción", color: "#d9822b" },
    error: { nombre: "Error", color: "#c79a1e" },
    assert: { nombre: "Assert", color: "#8b5cd6" },
    tarea: { nombre: "Tarea en segundo plano", color: "#2f78b4" },
  };

  let datos = null;           // última respuesta de admin_errores_lista
  let pedido = 0;             // para ignorar respuestas viejas
  const abiertos = new Set(); // huellas con el detalle abierto

  // ------------------------------------------------------------------ utilidades
  function el(tag, clase, texto) {
    const e = document.createElement(tag);
    if (clase) e.className = clase;
    if (texto !== undefined && texto !== null) e.textContent = texto;
    return e;
  }
  const num = (n) => Number(n || 0).toLocaleString("es-BO");
  const fecha = (epoch) => epoch ? new Date(epoch * 1000).toLocaleString("es-BO", {
    timeZone: ZONA, day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit", hour12: false,
  }) : "—";
  function hace(epoch, ahora) {
    if (!epoch) return "—";
    const s = Math.max(0, (ahora || Date.now() / 1000) - epoch);
    if (s < 90) return "hace un momento";
    if (s < 3600) return `hace ${Math.round(s / 60)} min`;
    if (s < 86400) return `hace ${Math.round(s / 3600)} h`;
    const d = Math.round(s / 86400);
    return d === 1 ? "hace 1 día" : `hace ${d} días`;
  }
  const primeraLinea = (t) => (t || "").split("\n")[0];

  function estilos() {
    if (document.getElementById("er-estilos")) return;
    const s = el("style");
    s.id = "er-estilos";
    s.textContent = `
      .er-cab { display: flex; gap: 16px; align-items: center; flex-wrap: wrap; margin-bottom: 8px; }
      .er-cab .er-ico { width: 56px; height: 56px; border-radius: 50%; flex: none; display: grid; place-items: center;
        background: linear-gradient(160deg, #f3a58f, #b4412b); box-shadow: 0 3px 0 rgba(120, 30, 10, .25); }
      .er-cab .tx { flex: 1; min-width: 220px; }
      .er-cab .sub { margin: 0; }
      .er-filtros { display: flex; gap: 10px 16px; align-items: center; flex-wrap: wrap; margin: 4px 0 12px; }
      .er-filtros select { max-width: 200px; }
      .er-filtros .interruptor { margin-top: 0; font-size: 14px; }
      .er-lista { display: grid; gap: 10px; }
      .er-item { display: grid; grid-template-columns: 6px 1fr; border: 1px solid var(--linea); border-radius: 12px; background: #fff; overflow: hidden; }
      .er-item.resuelto { opacity: .62; }
      .er-item .franja { background: var(--c, var(--oro)); }
      .er-item .cuerpo { padding: 10px 14px 12px; min-width: 0; }
      .er-fila { display: flex; gap: 10px 14px; align-items: flex-start; flex-wrap: wrap; }
      .er-fila .er-txt { flex: 1; min-width: 220px; }
      .er-msg { font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; font-size: 13.5px; color: var(--noche);
        overflow-wrap: anywhere; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
      .er-meta { font-size: 13px; color: var(--suave); margin-top: 4px; overflow-wrap: anywhere; }
      .er-cifra { text-align: right; min-width: 92px; }
      .er-cifra b { display: block; font-family: Fraunces, serif; font-size: 24px; color: var(--noche); line-height: 1; }
      .er-cifra span { font-size: 12px; color: var(--suave); }
      .er-barras { display: flex; align-items: flex-end; gap: 2px; height: 22px; margin-top: 6px; justify-content: flex-end; }
      .er-barras i { width: 5px; background: var(--c, var(--oro)); border-radius: 2px 2px 0 0; min-height: 1px; opacity: .85; }
      .er-acciones { display: flex; gap: 8px; flex-wrap: wrap; margin-top: 8px; }
      .er-det { border-top: 1px dashed var(--linea); margin-top: 10px; padding-top: 10px; display: grid; gap: 12px; }
      .er-det h4 { margin: 0 0 4px; font-size: 13px; color: var(--suave); font-weight: 600; font-family: inherit; }
      .er-pila { margin: 0; max-height: 260px; overflow: auto; background: #1b283d; color: #e6edf6; border-radius: 10px; padding: 10px 12px;
        font-size: 12px; line-height: 1.45; white-space: pre-wrap; overflow-wrap: anywhere; }
      .er-migas { margin: 0; padding-left: 20px; font-size: 13px; max-height: 260px; overflow: auto; }
      .er-migas li { margin: 1px 0; font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; overflow-wrap: anywhere; }
      .er-migas li:last-child { font-weight: 700; color: var(--noche); }
      .er-pares { display: flex; flex-wrap: wrap; gap: 6px; }
      .er-pares span { font-size: 12px; background: #f3ede1; border-radius: 8px; padding: 3px 8px; }
      .er-pares span b { font-weight: 600; color: var(--suave); margin-right: 4px; }
      .er-celus { display: grid; gap: 4px; font-size: 13px; }
      .er-grid2 { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); gap: 12px 18px; }
      @media (max-width: 760px) { .er-grid2 { grid-template-columns: 1fr; } .er-cifra { text-align: left; } .er-barras { justify-content: flex-start; } }
    `;
    document.head.append(s);
  }

  const ICONO = `<svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
    <path d="M8 2l1.9 1.9M16 2l-1.9 1.9"/><path d="M9 7.1V6a3 3 0 0 1 6 0v1.1"/><path d="M12 20c-3.3 0-6-2.7-6-6v-3a4 4 0 0 1 4-4h4a4 4 0 0 1 4 4v3c0 3.3-2.7 6-6 6"/>
    <path d="M12 20v-9M6.5 13H3M21 13h-3.5M6 9.5 3.5 8M18 9.5 20.5 8M6.4 17 4 19M17.6 17 20 19"/></svg>`;

  // ------------------------------------------------------------------ construcción
  function construir() {
    const raiz = $("errores-anchor");
    if (!raiz) return false;
    if (raiz.dataset.listo) return true;
    raiz.dataset.listo = "1";
    estilos();
    const t = el("div", "tarjeta");
    t.id = "t-errores";
    const cab = el("div", "er-cab");
    const ico = el("div", "er-ico"); ico.innerHTML = ICONO;
    const tx = el("div", "tx");
    tx.append(el("h2", null, "Errores del juego"),
      el("p", "sub", "Los errores y cierres inesperados que mandan los celulares, agrupados (cada fila es un mismo problema). Sin datos personales. Marca resuelto lo que arreglaste: si vuelve en una versión nueva, se reabre solo."));
    cab.append(ico, tx);
    t.append(cab);

    const filtros = el("div", "er-filtros");
    const sel = el("select"); sel.id = "er-dias"; sel.setAttribute("aria-label", "Período");
    for (const [v, txt] of [["1", "Hoy"], ["7", "Últimos 7 días"], ["30", "Últimos 30 días"], ["90", "Últimos 90 días"]]) {
      const o = el("option", null, txt); o.value = v; if (v === "7") o.selected = true; sel.append(o);
    }
    const resueltos = interruptor("er-resueltos", "Mostrar resueltos");
    const editor = interruptor("er-editor", "Incluir los del editor");
    const recargar = el("button", "btn borde chico", "Actualizar"); recargar.type = "button"; recargar.id = "er-recargar";
    filtros.append(sel, resueltos, editor, recargar);
    t.append(filtros);

    const nums = el("div", "numeros");
    for (const [id, txt] of [["er-n-abiertos", "Abiertos"], ["er-n-nuevos", "Nuevos en el período"], ["er-n-veces", "Veces que pasaron"], ["er-n-cierres", "Cierres inesperados"]]) {
      const n = el("div", "numero"); const b = el("b", null, "—"); b.id = id;
      n.append(b, el("span", null, txt));
      nums.append(n);
    }
    t.append(nums);
    const lista = el("div", "er-lista"); lista.id = "er-lista";
    lista.append(el("p", "vacio-estado", "Cargando…"));
    t.append(lista);
    const m = el("p", "msg"); m.id = "er-m"; m.setAttribute("role", "status");
    t.append(m);
    raiz.append(t);

    sel.addEventListener("change", cargar);
    recargar.addEventListener("click", cargar);
    $("er-resueltos").addEventListener("change", pintar);
    $("er-editor").addEventListener("change", pintar);
    return true;
  }

  function interruptor(id, texto) {
    const lab = el("label", "interruptor");
    const inp = el("input"); inp.type = "checkbox"; inp.id = id;
    lab.append(inp, el("span", null, texto));
    return lab;
  }

  // ------------------------------------------------------------------ datos
  async function cargar() {
    const n = ++pedido;
    const dias = Number($("er-dias").value) || 7;
    msg("er-m", "");
    $("er-recargar").disabled = true;
    const { data, error } = await sb.rpc("admin_errores_lista", { p_dias: dias });
    if (n !== pedido) return;
    $("er-recargar").disabled = false;
    if (error || !data || !data.ok) {
      datos = null;
      const lista = $("er-lista"); lista.textContent = "";
      lista.append(el("p", "vacio-estado", error ? (SIN_SERVIDOR.test(error.message || "") ? PRONTO : textoError(error)) : (data && data.message) || "No se pudo cargar."));
      for (const id of ["er-n-abiertos", "er-n-nuevos", "er-n-veces", "er-n-cierres"]) $(id).textContent = "—";
      return;
    }
    datos = data;
    pintar();
  }

  function pintar() {
    if (!datos) return;
    const tot = datos.totales || {};
    $("er-n-abiertos").textContent = num(tot.abiertos);
    $("er-n-nuevos").textContent = num(tot.nuevos);
    $("er-n-veces").textContent = num(tot.ocurrencias);
    $("er-n-cierres").textContent = num(tot.cierres);
    const verResueltos = $("er-resueltos").checked, verEditor = $("er-editor").checked;
    const items = (datos.items || []).filter((e) => (verResueltos || !e.resolved) && (verEditor || !e.editor));
    const lista = $("er-lista"); lista.textContent = "";
    if (!items.length) {
      const total = (datos.items || []).length;
      lista.append(el("p", "vacio-estado", total
        ? "No hay errores abiertos con estos filtros. Prueba \"Mostrar resueltos\" o \"Incluir los del editor\"."
        : "Ningún error en este período. ¡Todo tranquilo!"));
      return;
    }
    for (const e of items) lista.append(fila(e));
  }

  function fila(e) {
    const tipo = TIPOS[e.kind] || { nombre: e.kind, color: "var(--oro)" };
    const item = el("article", "er-item" + (e.resolved ? " resuelto" : ""));
    item.style.setProperty("--c", tipo.color);
    item.append(el("div", "franja"));
    const cuerpo = el("div", "cuerpo");

    const arriba = el("div", "er-fila");
    const txt = el("div", "er-txt");
    const etiquetas = el("div", "etiquetas"); etiquetas.style.marginTop = "0";
    const chipTipo = el("span", "etq", tipo.nombre);
    const punto = el("i"); punto.style.background = tipo.color; chipTipo.prepend(punto);
    etiquetas.append(chipTipo);
    if (e.reopened && !e.resolved) etiquetas.append(el("span", "etq estado-prox", "Reabierto: volvió en una versión nueva"));
    if (e.resolved) etiquetas.append(el("span", "etq estado-curso", "Resuelto " + (e.resolvedAt ? fecha(e.resolvedAt) : "")));
    if (e.editor) etiquetas.append(el("span", "etq estado-fin", "Editor"));
    const mensaje = el("div", "er-msg", primeraLinea(e.message));
    mensaje.title = e.message || "";
    mensaje.style.marginTop = "6px";
    const celus = (e.devices || []).map((d) => d && d.modelo).filter(Boolean);
    const meta = [
      `Última ${hace(e.lastSeen, datos.ahora)} (${fecha(e.lastSeen)})`,
      e.lastVersion ? "v" + e.lastVersion : null,
      celus.length ? celus[0] + (celus.length > 1 ? ` y ${celus.length - 1} más` : "") : null,
      e.context && e.context.vista ? "en " + e.context.vista : null,
    ].filter(Boolean).join(" · ");
    txt.append(etiquetas, mensaje, el("div", "er-meta", meta));

    const cifra = el("div", "er-cifra");
    cifra.append(el("b", null, num(e.enVentana)), el("span", null, Number(e.enVentana) === 1 ? "vez en el período" : "veces en el período"));
    const barras = el("div", "er-barras");
    barras.setAttribute("aria-hidden", "true");
    const dias = e.porDia || [];
    const max = Math.max(1, ...dias);
    for (const v of dias) { const b = el("i"); b.style.height = Math.max(1, Math.round(22 * v / max)) + "px"; b.title = num(v); barras.append(b); }
    cifra.append(barras);
    arriba.append(txt, cifra);
    cuerpo.append(arriba);

    const acciones = el("div", "er-acciones");
    const ver = el("button", "btn borde chico", abiertos.has(e.hash) ? "Ocultar detalle" : "Ver detalle");
    ver.type = "button";
    ver.setAttribute("aria-expanded", abiertos.has(e.hash) ? "true" : "false");
    const resolver = el("button", "btn chico" + (e.resolved ? " borde" : ""), e.resolved ? "Reabrir" : "Marcar resuelto");
    resolver.type = "button";
    acciones.append(ver, resolver);
    cuerpo.append(acciones);

    const det = detalle(e);
    det.hidden = !abiertos.has(e.hash);
    cuerpo.append(det);
    ver.addEventListener("click", () => {
      const abrir = det.hidden;
      det.hidden = !abrir;
      if (abrir) abiertos.add(e.hash); else abiertos.delete(e.hash);
      ver.textContent = abrir ? "Ocultar detalle" : "Ver detalle";
      ver.setAttribute("aria-expanded", abrir ? "true" : "false");
    });
    resolver.addEventListener("click", () => cambiarResuelto(e, resolver));
    item.append(cuerpo);
    return item;
  }

  function detalle(e) {
    const det = el("div", "er-det");
    if ((e.message || "").includes("\n") || (e.message || "").length > 140) {
      const b = el("div"); b.append(el("h4", null, "Mensaje completo"), el("pre", "er-pila", e.message));
      det.append(b);
    }
    const g = el("div", "er-grid2");
    const pila = el("div");
    pila.append(el("h4", null, "Pila (dónde pasó)"));
    pila.append(e.stack ? el("pre", "er-pila", e.stack) : el("p", "ayuda", e.kind === "cierre"
      ? "Un cierre inesperado no tiene pila: el juego se cerró de golpe. Mira las migas: lo último es lo que estaba pasando."
      : "Sin pila."));
    const migas = el("div");
    migas.append(el("h4", null, "Migas (lo último que pasó, la más nueva abajo)"));
    const lista = el("ol", "er-migas");
    for (const m of (e.breadcrumbs || [])) lista.append(el("li", null, m));
    migas.append((e.breadcrumbs || []).length ? lista : el("p", "ayuda", "Sin migas."));
    g.append(pila, migas);
    det.append(g);

    const g2 = el("div", "er-grid2");
    const ctx = el("div");
    ctx.append(el("h4", null, "Último reporte"));
    const pares = el("div", "er-pares");
    const nombres = { modelo: "Celular", so: "Sistema", gpu: "GPU", ram: "RAM (MB)", nucleos: "Núcleos", calidad: "Calidad", mem: "Memoria usada (MB)",
      gc: "C# (MB)", uptime: "Abierto (s)", pantalla: "Pantalla", fps: "FPS", vista: "Vista", memBaja: "Aviso de memoria baja" };
    const c = e.context || {};
    for (const k of Object.keys(nombres)) {
      if (c[k] === undefined || c[k] === null || c[k] === "") continue;
      const s = el("span"); s.append(el("b", null, nombres[k]), document.createTextNode(c[k] === true ? "sí" : String(c[k])));
      pares.append(s);
    }
    ctx.append(pares.childElementCount ? pares : el("p", "ayuda", "Sin datos del celular."));
    const otros = el("div");
    otros.append(el("h4", null, "Celulares y versiones"));
    const celus = el("div", "er-celus");
    for (const d of (e.devices || [])) {
      if (!d) continue;
      celus.append(el("div", null, [d.modelo, d.so, d.ram ? d.ram + " MB" : null, d.calidad].filter(Boolean).join(" · ") || "—"));
    }
    otros.append(celus);
    otros.append(el("p", "ayuda", `Versiones: ${(e.versions || []).join(", ") || "—"} · Primera vez: ${fecha(e.firstSeen)} · ${num(e.total)} veces en total en ${num(e.reports)} reportes · Huella ${e.hash}`));
    g2.append(ctx, otros);
    det.append(g2);
    return det;
  }

  async function cambiarResuelto(e, boton) {
    const resolver = !e.resolved;
    boton.disabled = true;
    const { data, error } = await sb.rpc("admin_errores_resolver", { p_hash: e.hash, p_resuelto: resolver });
    boton.disabled = false;
    if (error || !data || !data.ok) {
      msg("er-m", error ? (SIN_SERVIDOR.test(error.message || "") ? PRONTO : textoError(error)) : (data && data.message) || "No se pudo guardar.", "error");
      return;
    }
    e.resolved = !!data.resolved;
    e.reopened = false;
    e.resolvedAt = e.resolved ? Math.round(Date.now() / 1000) : null;
    if (datos && datos.totales) datos.totales.abiertos = Math.max(0, Number(datos.totales.abiertos || 0) + (e.resolved ? -1 : 1));
    msg("er-m", data.message, "ok");
    pintar();
  }

  // Se llama desde cargarAdmin() en index.html
  window.cargarErrores = function () {
    if (!construir()) return;
    cargar();
  };
})();
