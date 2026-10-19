// Estadísticas Pro de la cafetería (migración 0035, PEGAR_EN_SUPABASE_30.sql):
// check-ins por día de los últimos 7, 30 o 90 días, mapa de calor hora × día de la semana, jugadores nuevos y
// los que vuelven, cupones ganados y canjeados, tarjetas de sellos, cafés pendientes, minijuegos, Hora feliz
// (contra un día normal), Granitos de la casa, días como cafetería destacada y "Descargar CSV".
// Todo se calcula en el servidor (pro_stats) y solo llegan cantidades: nunca quién te visitó.
// Plan gratis: los check-ins por día (hasta 30 días); lo demás se ve borroso con "Disponible en Premium".
// Usa lo que ya define index.html: sb, $, msg, textoError, actual, esAdmin.
(function () {
  "use strict";

  const SIN_SERVIDOR = /Could not find the function|PGRST202/i;
  const SVGNS = "http://www.w3.org/2000/svg";
  const DIAS_SEMANA = ["Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado", "Domingo"];
  const DIAS_CORTOS = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];
  const MINIJUEGOS = { espresso: "Espresso perfecto", granos: "Lluvia de granos", barista: "Barista rápido", latte: "Arte latte", cata: "Cata a ciegas" };
  const TIPOS_CUPON = [["cupones", "Tus cupones"], ["sellos", "Tarjeta de sellos"], ["pendiente", "Café pendiente"], ["competencias", "Competencias"]];
  // Rampa secuencial azul (validada): de "casi nada" a "mucho"
  const RAMPA = ["#b7d3f6", "#86b6ef", "#5598e7", "#2a78d6", "#184f95"];
  const CERO = "#efe9dd";

  let raiz = null;
  let dias = 30;
  let datos = null;          // última respuesta de pro_stats
  let pedido = 0;            // para descartar respuestas viejas
  let lugarId = null;

  // ------------------------------------------------------------------ utilidades
  function el(tag, clase, texto) {
    const e = document.createElement(tag);
    if (clase) e.className = clase;
    if (texto !== undefined && texto !== null) e.textContent = texto;
    return e;
  }
  function svg(tag, attrs, padre) {
    const e = document.createElementNS(SVGNS, tag);
    for (const k in attrs) e.setAttribute(k, attrs[k]);
    if (padre) padre.append(e);
    return e;
  }
  const n0 = (v) => Number(v || 0);
  const num = (v) => n0(v).toLocaleString("es-BO");
  const dec = (v, d = 1) => n0(v).toLocaleString("es-BO", { minimumFractionDigits: d, maximumFractionDigits: d });
  const pct = (v) => v === null || v === undefined ? "—" : dec(v, Number(v) % 1 === 0 ? 0 : 1) + " %";
  const plural = (v, uno, varios) => `${num(v)} ${n0(v) === 1 ? uno : varios}`;
  const fechaDe = (d) => new Date(d + "T12:00:00Z");
  const diaCorto = (d) => fechaDe(d).toLocaleDateString("es-BO", { timeZone: "UTC", day: "numeric", month: "short" }).replace(".", "");
  const diaLargo = (d) => fechaDe(d).toLocaleDateString("es-BO", { timeZone: "UTC", weekday: "long", day: "numeric", month: "long" });
  const horaTxt = (h) => `${String(h).padStart(2, "0")}:00`;

  function estilos() {
    if (document.getElementById("pro-estilos")) return;
    const s = el("style");
    s.id = "pro-estilos";
    s.textContent = `
      .pro-cab { display: flex; gap: 12px 18px; align-items: flex-start; justify-content: space-between; flex-wrap: wrap; }
      .pro-cab .sub { margin-bottom: 10px; max-width: 620px; }
      .pro-controles { display: flex; gap: 10px; flex-wrap: wrap; align-items: center; margin: 0 0 14px; }
      .pro-controles .filtros { margin: 0; }
      .pro-controles .esp { flex: 1; }
      .pro-candado { display: inline-block; vertical-align: -2px; margin-left: 4px; }
      .pro-cuerpo { transition: opacity .15s; }
      .pro-cuerpo.cargando { opacity: .5; }
      .kpi .pro-delta { font-size: 12px; font-weight: 600; margin-top: 4px; color: var(--suave); }
      .kpi .pro-delta.sube { color: #1f6b3e; }
      .kpi .pro-delta.baja { color: #8a3520; }
      .pro-sec { border-top: 1px solid var(--linea); margin-top: 18px; padding-top: 14px; }
      .pro-sec > h3 { margin-bottom: 2px; }
      .pro-sec > .ayuda:first-of-type { margin-top: 0; }
      .pro-grid { display: grid; grid-template-columns: minmax(0, 1.5fr) minmax(0, 1fr); gap: 18px; }
      .pro-mini { display: grid; grid-template-columns: repeat(auto-fill, minmax(190px, 1fr)); gap: 10px; margin: 8px 0 4px; }
      .pro-caja { border: 1px solid var(--linea); border-radius: 12px; background: #fff; padding: 12px 14px; min-width: 0; }
      .pro-caja h4 { margin: 0 0 6px; font-size: 14px; color: var(--noche); display: flex; align-items: center; gap: 8px; }
      .pro-caja h4 i { width: 10px; height: 10px; border-radius: 50%; display: inline-block; flex: none; }
      .pro-caja .cifras { display: flex; gap: 6px 16px; flex-wrap: wrap; }
      .pro-caja .cifras div { font-size: 12px; color: var(--suave); line-height: 1.25; }
      .pro-caja .cifras b { display: block; font-family: Fraunces, Georgia, serif; font-size: 22px; color: var(--noche); }
      .pro-caja .nota { font-size: 12px; color: var(--suave); margin: 6px 0 0; }
      .pro-barras { display: grid; gap: 8px; margin: 8px 0 0; }
      .pro-barra { display: grid; grid-template-columns: 92px 1fr auto; gap: 10px; align-items: center; font-size: 13px; }
      .pro-barra .pista { height: 14px; border-radius: 0 4px 4px 0; background: transparent; position: relative; }
      .pro-barra .pista span { position: absolute; left: 0; top: 0; bottom: 0; border-radius: 0 4px 4px 0; background: #2a78d6; min-width: 2px; }
      .pro-barra b { font-variant-numeric: tabular-nums; color: var(--tinta); }
      .pro-calor .scroll { overflow-x: auto; }
      .pro-calor svg { display: block; width: 100%; min-width: 520px; height: auto; }
      .pro-calor svg text { font: 11px Inter, system-ui, sans-serif; fill: var(--suave); }
      .pro-calor rect.celda:hover, .pro-calor rect.celda:focus { stroke: var(--noche); stroke-width: 1.5px; outline: none; }
      .pro-ley { display: flex; gap: 4px; align-items: center; font-size: 12px; color: var(--suave); margin: 6px 0 0; flex-wrap: wrap; }
      .pro-ley i { width: 14px; height: 10px; border-radius: 2px; display: inline-block; }
      .pro-ley .sep { width: 12px; }
      .pro-ley .lavado { background: rgba(242, 180, 60, .28); width: 14px; }
      .pro-grafico { position: relative; }
      .pro-grafico svg { display: block; width: 100%; height: auto; overflow: visible; }
      .pro-grafico svg text { font: 11px Inter, system-ui, sans-serif; fill: var(--suave); }
      .pro-grafico svg text.valor { font-weight: 600; fill: var(--tinta); }
      .pro-grafico rect.toque:focus { outline: none; }
      .pro-hf { display: flex; gap: 12px 18px; align-items: center; flex-wrap: wrap; background: linear-gradient(120deg, #fff1d6, #ffe6dc); border: 1px solid #f3b98f;
        border-radius: 12px; padding: 12px 14px; margin: 8px 0 10px; }
      .pro-hf .grande { font-family: Fraunces, Georgia, serif; font-size: 30px; font-weight: 700; color: #a4501a; line-height: 1; }
      .pro-hf .tx { flex: 1; min-width: 220px; font-size: 14px; }
      table.mt td .comp { display: inline-flex; gap: 2px; align-items: flex-end; height: 16px; vertical-align: middle; margin-left: 6px; }
      table.mt td .comp i { width: 8px; display: inline-block; border-radius: 2px 2px 0 0; }
      .pro-bloqueo { position: relative; margin-top: 4px; }
      .pro-bloqueo .borroso { filter: blur(6px) saturate(.8); opacity: .75; pointer-events: none; user-select: none; }
      .pro-bloqueo .velo { position: absolute; inset: 0; display: flex; align-items: flex-start; justify-content: center; padding-top: 70px; }
      .pro-bloqueo .velo > div { background: var(--papel); border: 2px solid var(--oro); border-radius: 14px; padding: 16px 18px; max-width: 380px; text-align: center;
        box-shadow: 0 10px 30px rgba(18, 35, 58, .18); position: sticky; top: 90px; }
      .pro-bloqueo .velo h3 { margin: 6px 0 4px; }
      .pro-bloqueo .velo p { margin: 0 0 12px; color: var(--suave); font-size: 14px; }
      .pro-dest { background: #fff8e8; border: 1px solid #f0d89c; border-radius: 12px; padding: 10px 14px; font-size: 14px; margin-top: 10px; }
      @media (max-width: 760px) { .pro-grid { grid-template-columns: 1fr; } .pro-bloqueo .velo { padding-top: 40px; } }
    `;
    document.head.append(s);
  }

  const CANDADO = `<svg class="pro-candado" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-hidden="true"><rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/></svg>`;

  function construir() {
    raiz = $("pro-anchor");
    if (!raiz) return false;
    if (raiz.dataset.listo) return true;
    raiz.dataset.listo = "1";
    estilos();
    raiz.innerHTML = `
      <div class="tarjeta mt-root" id="pro-tarjeta">
        <div class="pro-cab">
          <div>
            <h2>Estadísticas <span class="chip" id="pro-chip">Pro</span></h2>
            <p class="sub">Cómo te va con Tazadores. Solo mostramos cantidades: nunca quién te visitó.</p>
          </div>
        </div>
        <div class="pro-controles">
          <div class="filtros" id="pro-periodos" role="group" aria-label="Período">
            <button type="button" data-d="7" aria-pressed="false">7 días</button>
            <button type="button" data-d="30" aria-pressed="true">30 días</button>
            <button type="button" data-d="90" aria-pressed="false">90 días</button>
          </div>
          <span class="esp"></span>
          <button class="btn borde chico" type="button" id="pro-csv">Descargar CSV</button>
        </div>
        <p class="vacio-estado oculto" id="pro-pronto"></p>
        <div class="pro-cuerpo" id="pro-cuerpo"></div>
        <p class="msg" id="pro-m" role="status"></p>
      </div>`;
    for (const b of raiz.querySelectorAll("#pro-periodos button")) b.addEventListener("click", () => elegirPeriodo(+b.dataset.d));
    $("pro-csv").addEventListener("click", descargarCsv);
    window.addEventListener("resize", () => {
      clearTimeout(construir.t);
      construir.t = setTimeout(() => { if (datos && raiz && raiz.offsetParent !== null) pintar(); }, 150);
    });
    return true;
  }

  function elegirPeriodo(d) {
    if (d === dias) return;
    if (d === 90 && datos && !datos.full) {
      msg("pro-m", "Los 90 días son del plan premium.", "error");
      return;
    }
    dias = d;
    for (const b of raiz.querySelectorAll("#pro-periodos button")) b.setAttribute("aria-pressed", String(+b.dataset.d === d));
    cargar();
  }

  // ------------------------------------------------------------------ carga
  async function cargar() {
    if (!construir() || !actual) return;
    const id = actual.id, yo = ++pedido;
    $("pro-cuerpo").classList.add("cargando");
    msg("pro-m");
    const { data, error } = await sb.rpc("pro_stats", { p_place: id, p_days: dias });
    if (yo !== pedido || !actual || actual.id !== id) return;
    $("pro-cuerpo").classList.remove("cargando");
    const listo = !error && data && data.ok;
    $("pro-pronto").classList.toggle("oculto", !!listo);
    $("pro-cuerpo").classList.toggle("oculto", !listo);
    $("pro-csv").disabled = !listo;
    if (!listo) {
      datos = null;
      $("pro-pronto").textContent = error
        ? (SIN_SERVIDOR.test(error.message || "") ? "Las estadísticas Pro se activan pronto." : textoError(error))
        : (data && data.message) || "No se pudieron cargar las estadísticas.";
      return;
    }
    datos = data;
    if (data.days !== dias) {   // el servidor ajustó el período (plan gratis)
      dias = data.days;
      for (const b of raiz.querySelectorAll("#pro-periodos button")) b.setAttribute("aria-pressed", String(+b.dataset.d === dias));
    }
    pintar();
  }

  // ------------------------------------------------------------------ pintar
  function pintar() {
    const d = datos, cuerpo = $("pro-cuerpo");
    cuerpo.innerHTML = "";
    $("pro-chip").textContent = d.full ? (d.premium ? "Premium" : "Administrador") : "Plan gratis";
    $("pro-chip").className = "chip" + (d.full ? " ok" : "");
    const b90 = raiz.querySelector('#pro-periodos button[data-d="90"]');
    b90.innerHTML = "90 días" + (d.full ? "" : CANDADO);
    b90.title = d.full ? "" : "Disponible en Premium";

    cuerpo.append(kpis(d));
    cuerpo.append(seccionDiaria(d));
    if (d.full) cuerpo.append(...seccionesPremium(d));
    else cuerpo.append(bloqueado(d));
  }

  function delta(actualV, previo) {
    const a = n0(actualV), p = n0(previo);
    if (p === 0) return a > 0 ? { t: "antes: 0", c: "" } : null;
    const v = Math.round((a - p) / p * 100);
    if (v === 0) return { t: "igual que antes", c: "" };
    return { t: `${v > 0 ? "↑" : "↓"} ${Math.abs(v)} % contra los ${d0()} días anteriores`, c: v > 0 ? "sube" : "baja" };
  }
  const d0 = () => (datos ? datos.days : dias);

  function tile(valor, texto, extra) {
    const k = el("div", "kpi");
    k.append(el("div", "v", valor), el("div", "t", texto));
    if (extra) { const x = el("div", "pro-delta " + (extra.c || ""), extra.t); k.append(x); }
    return k;
  }

  function kpis(d) {
    const s = d.summary || {}, caja = el("div", "kpis");
    caja.append(tile(num(s.checkins), "check-ins", delta(s.checkins, s.prevCheckins)));
    caja.append(tile(num(s.players), "jugadores distintos", delta(s.players, s.prevPlayers)));
    if (d.full) {
      const p = d.players || {}, c = d.coupons || {};
      caja.append(tile(num(p.nuevos), "nuevos (primera visita)"));
      caja.append(tile(pct(p.tasaRegreso), "volvieron (2 o más visitas)", { t: plural(p.volvieron, "jugador", "jugadores"), c: "" }));
      caja.append(tile(p.visitasPromedio == null ? "—" : dec(p.visitasPromedio, 1), "visitas por jugador"));
      caja.append(tile(pct(c.tasa), "de los cupones se canjearon", { t: `${num(c.canjeadosDeGanados)} de ${num(c.ganados)} ganados`, c: "" }));
    }
    return caja;
  }

  // ---- Check-ins por día (columnas)
  function seccionDiaria(d) {
    const sec = el("div", "mt-graf pro-grafico");
    const serie = d.serie || [];
    const total = serie.reduce((a, x) => a + n0(x.checkins), 0);
    sec.append(el("h3", null, `Check-ins por día · últimos ${d.days} días`));
    const marcoSvg = el("div", "svg");
    const tip = el("div", "mt-tip");
    sec.append(marcoSvg, tip);
    // se dibuja cuando ya está en la página (necesita el ancho)
    requestAnimationFrame(() => columnas(marcoSvg, tip, serie, d.full));
    const hayDest = serie.some((x) => x.destacada);
    const ley = el("div", "pro-ley");
    ley.innerHTML = `<i style="background:#2a78d6"></i><span>Check-ins</span>` + (hayDest ? `<span class="sep"></span><i class="lavado"></i><span>Días como cafetería destacada</span>` : "");
    sec.append(ley);
    if (total > 0) {
      let max = serie[0];
      for (const x of serie) if (n0(x.checkins) > n0(max.checkins)) max = x;
      sec.append(el("p", "ayuda", `Tu mejor día fue el ${diaLargo(max.d)}, con ${plural(max.checkins, "check-in", "check-ins")}. Hoy cuenta hasta este momento.`));
    } else {
      sec.append(el("p", "ayuda", "Todavía no hay check-ins en este período. Pon tu afiche y tu QR de caja a la vista."));
    }
    // Vista en tabla (accesible y para revisar los números)
    const det = el("details", "mt-datos");
    det.append(el("summary", null, "Ver los datos por día en una tabla"));
    const sc = el("div", "tabla-scroll"), t = el("table", "mt");
    const cols = d.full
      ? [["Día", "d"], ["Check-ins", "checkins"], ["Nuevos", "nuevos"], ["Cupones ganados", "cupones"], ["Cupones canjeados", "canjes"], ["Minijuegos", "minijuegos"], ["Granito de la casa", "casa"]]
      : [["Día", "d"], ["Check-ins", "checkins"]];
    const th = el("thead"), trh = el("tr");
    cols.forEach(([n], i) => { const c = el("th", i ? "n" : null, n); trh.append(c); });
    th.append(trh); t.append(th);
    const tb = el("tbody");
    for (const x of [...serie].reverse()) {
      const tr = el("tr");
      cols.forEach(([, k], i) => tr.append(el("td", i ? "n" : null, i ? num(x[k]) : diaCorto(x.d) + (x.destacada ? " · destacada" : ""))));
      tb.append(tr);
    }
    t.append(tb); sc.append(t); det.append(sc);
    sec.append(det);
    return sec;
  }

  function escala(max) {
    const crudo = Math.max(1, max) / 4, pot = Math.pow(10, Math.floor(Math.log10(crudo)));
    const paso = Math.max(1, [1, 2, 5, 10].map((m) => m * pot).find((p) => p >= crudo));
    return { paso, tope: paso * 4 };
  }

  function columnas(cont, tip, serie, full) {
    cont.innerHTML = "";
    if (!serie.length) return;
    const W = Math.max(300, Math.round(cont.clientWidth || cont.parentNode.clientWidth || 640)), H = 220;
    const m = { t: 18, r: 10, b: 26, l: 34 };
    const max = Math.max(...serie.map((x) => n0(x.checkins)));
    const { paso, tope } = escala(max);
    const s = svg("svg", { viewBox: `0 0 ${W} ${H}`, role: "img", "aria-label": "Check-ins por día" });
    const y = (v) => H - m.b - v / tope * (H - m.t - m.b);
    const banda = (W - m.l - m.r) / serie.length;
    const ancho = Math.max(2, Math.min(24, banda - 2));
    const xc = (i) => m.l + banda * (i + 0.5);
    // Días destacada: un lavado dorado detrás de las columnas (tramos seguidos juntos)
    for (let i = 0; i < serie.length; i++) {
      if (!serie[i].destacada || (i > 0 && serie[i - 1].destacada)) continue;
      let j = i; while (j + 1 < serie.length && serie[j + 1].destacada) j++;
      svg("rect", { x: m.l + banda * i, y: m.t - 6, width: banda * (j - i + 1), height: H - m.t - m.b + 6, fill: "rgba(242,180,60,.22)", rx: 3 }, s);
    }
    for (let v = 0; v <= tope; v += paso) {
      svg("line", { x1: m.l, x2: W - m.r, y1: y(v), y2: y(v), stroke: "#ece5d8", "stroke-width": 1 }, s);
      const t = svg("text", { x: m.l - 6, y: y(v) + 4, "text-anchor": "end" }, s); t.textContent = v >= 1000 ? (v / 1000) + "K" : v;
    }
    const cada = Math.ceil(serie.length / Math.max(2, Math.floor((W - m.l - m.r) / 64)));
    let iMax = 0;
    serie.forEach((x, i) => { if (n0(x.checkins) > n0(serie[iMax].checkins)) iMax = i; });
    const barras = [];
    serie.forEach((x, i) => {
      if (!(i % cada) || i === serie.length - 1) {
        if (i === serie.length - 1 || serie.length - 1 - i >= cada / 2) {
          const t = svg("text", { x: xc(i), y: H - 8, "text-anchor": "middle" }, s);
          t.textContent = i === serie.length - 1 ? "Hoy" : diaCorto(x.d);
        }
      }
      const v = n0(x.checkins), base = y(0), alto = Math.max(0, base - y(v));
      const rr = Math.min(4, alto, ancho / 2), x0 = xc(i) - ancho / 2;
      let barra = null;
      if (alto > 0) {
        barra = svg("path", {
          d: `M${x0},${base}V${base - alto + rr}Q${x0},${base - alto} ${x0 + rr},${base - alto}H${x0 + ancho - rr}Q${x0 + ancho},${base - alto} ${x0 + ancho},${base - alto + rr}V${base}Z`,
          fill: "#2a78d6",
        }, s);
      }
      barras.push(barra);
    });
    // Valor solo en el día más alto (etiqueta selectiva)
    if (n0(serie[iMax].checkins) > 0) {
      const t = svg("text", { x: xc(iMax), y: y(n0(serie[iMax].checkins)) - 5, "text-anchor": "middle", class: "valor" }, s);
      t.textContent = num(serie[iMax].checkins);
    }
    // Toques: cada día es una franja completa (más grande que la columna)
    serie.forEach((x, i) => {
      const hit = svg("rect", { x: m.l + banda * i, y: m.t, width: banda, height: H - m.t - m.b, fill: "transparent", class: "toque" }, s);
      const ver = () => {
        barras.forEach((b, k) => { if (b) b.setAttribute("fill", k === i ? "#184f95" : "#2a78d6"); });
        const r = s.getBoundingClientRect();
        tip.textContent = "";
        const b = el("b", null, plural(x.checkins, "check-in", "check-ins"));
        tip.append(b, document.createElement("br"), document.createTextNode(diaLargo(x.d) + (i === serie.length - 1 ? " (hasta ahora)" : "")));
        if (full) {
          const extra = [];
          if (n0(x.nuevos)) extra.push(plural(x.nuevos, "nuevo", "nuevos"));
          if (n0(x.cupones) || n0(x.canjes)) extra.push(`cupones: ${num(x.cupones)} ganados · ${num(x.canjes)} canjeados`);
          if (n0(x.minijuegos)) extra.push(plural(x.minijuegos, "partida de minijuego", "partidas de minijuegos"));
          if (n0(x.casa)) extra.push(plural(x.casa, "Granito de la casa", "Granitos de la casa"));
          for (const e of extra) tip.append(document.createElement("br"), document.createTextNode(e));
        }
        if (x.destacada) tip.append(document.createElement("br"), document.createTextNode("Cafetería destacada"));
        tip.style.left = Math.min(Math.max(xc(i) * r.width / W, 80), r.width - 80) + "px";
        tip.style.top = (cont.offsetTop + y(n0(x.checkins)) * r.height / H - 8) + "px";
        tip.style.opacity = 1;
      };
      const salir = () => { tip.style.opacity = 0; barras.forEach((b) => b && b.setAttribute("fill", "#2a78d6")); };
      hit.addEventListener("pointerenter", ver);
      hit.addEventListener("pointerleave", salir);
    });
    cont.append(s);
  }

  // ---- Secciones premium
  function seccionesPremium(d) {
    const out = [];

    // Cuándo vienen + clientes que vuelven
    const sec1 = el("div", "pro-sec");
    const grid = el("div", "pro-grid");
    const izq = el("div"), der = el("div");
    izq.append(el("h3", null, "Cuándo vienen"));
    izq.append(calor(d));
    const top = (d.topHours || []).filter((h) => n0(h.n) > 0);
    izq.append(el("p", "ayuda", top.length
      ? "Tus horas más fuertes: " + top.map((h) => `${horaTxt(h.h)} a ${horaTxt((h.h + 1) % 24)} (${plural(h.n, "check-in", "check-ins")})`).join(" · ") + ". Usa el aroma o una Hora feliz en las horas flojas."
      : "Todavía no hay suficientes visitas para ver tus horas pico."));
    der.append(el("h3", null, "Clientes que vuelven"));
    const p = d.players || {}, dist = p.distribucion || {};
    der.append(el("p", "ayuda", `De ${plural(p.total, "jugador", "jugadores")} en estos ${d.days} días, ${num(p.volvieron)} ${n0(p.volvieron) === 1 ? "volvió" : "volvieron"} al menos una vez y ${num(p.nuevos)} ${n0(p.nuevos) === 1 ? "vino" : "vinieron"} por primera vez.`));
    const filas = [["1 visita", dist["1"]], ["2 visitas", dist["2"]], ["3 o 4 visitas", dist["3-4"]], ["5 o más", dist["5+"]]];
    const maxD = Math.max(1, ...filas.map((f) => n0(f[1])));
    const barras = el("div", "pro-barras");
    for (const [txt, v] of filas) {
      const f = el("div", "pro-barra");
      const pista = el("div", "pista"), sp = el("span");
      sp.style.width = (n0(v) / maxD * 100) + "%";
      pista.append(sp);
      f.append(el("span", null, txt), pista, el("b", null, num(v)));
      f.setAttribute("aria-label", `${txt}: ${num(v)} jugadores`);
      barras.append(f);
    }
    der.append(barras);
    der.append(el("p", "ayuda", "Cada jugador cuenta 1 check-in por día en tu cafetería."));
    grid.append(izq, der);
    sec1.append(grid);
    out.push(sec1);

    // Lo que te trae Tazadores
    const sec2 = el("div", "pro-sec");
    sec2.append(el("h3", null, "Lo que te trae Tazadores"));
    const mini = el("div", "pro-mini");
    const c = d.coupons || {}, porTipo = c.porTipo || {};
    const cupCaja = caja("Cupones", "#2a78d6", [[c.ganados, "ganados"], [c.canjeados, "canjeados en tu caja"]],
      `${pct(c.tasa)} de los ganados en el período ya se canjeó. ${plural(c.activos, "cupón activo", "cupones activos")}.`);
    mini.append(cupCaja);
    const sl = d.sellos || {};
    mini.append(caja("Tarjeta de sellos", "#eb6834", [[sl.sellos, "sellos dados"], [sl.completas, "tarjetas llenas"]],
      sl.activa ? `${plural(sl.abiertas, "tarjeta empezada", "tarjetas empezadas")} ahora.` : "Está apagada. Actívala en Tarjeta de sellos."));
    const pe = d.pendiente || {};
    mini.append(caja("Café pendiente", "#1baf7a", [[pe.confirmados, "confirmados"], [pe.enPozo, "en el pozo"]],
      pe.activo ? `${num(pe.amigo)} para amigos y ${num(pe.comunidad)} para la comunidad · ${plural(pe.tomados, "tomado", "tomados")} del pozo.` : "Está apagado en tu cafetería."));
    const mj = d.minijuegos || {}, pj = mj.porJuego || {};
    const masJugado = Object.keys(pj).sort((a, b) => pj[b] - pj[a])[0];
    mini.append(caja("Minijuegos", "#e87ba4", [[mj.partidas, "partidas"], [mj.jugadores, "jugadores"]],
      masJugado ? `El favorito: ${MINIJUEGOS[masJugado] || masJugado} (${plural(pj[masJugado], "partida", "partidas")}).` : "Nadie jugó todavía en tu cafetería."));
    const ca = d.casa || {};
    mini.append(caja("Granito de la casa", "#6250d6", [[ca.atrapados, "atrapados"], [ca.total, "en total"]],
      ca.disponible ? `${ca.nombre || "Tu Granito"} vive en tu puerta.` : "Aparece en tu puerta solo con el plan premium."));
    mini.append(caja("Alrededor de tu local", "#008300", [[d.cerca, "Granitos atrapados a 150 m"], [d.aromas, "aromas activados"]], null));
    sec2.append(mini);
    // Cupones por origen (tabla)
    const tabla = el("table", "mt");
    tabla.innerHTML = "<thead><tr><th>Cupones por origen</th><th class='n'>Ganados</th><th class='n'>Canjeados</th><th class='n'>Canje de los ganados</th></tr></thead>";
    const tb = el("tbody");
    for (const [k, nombre] of TIPOS_CUPON) {
      const x = porTipo[k];
      if (!x) continue;
      const tr = el("tr");
      tr.append(el("td", null, nombre), el("td", "n", num(x.ganados)), el("td", "n", num(x.canjeados)),
        el("td", "n", n0(x.ganados) ? pct(Math.round(1000 * n0(x.deGanados) / n0(x.ganados)) / 10) : "—"));
      tb.append(tr);
    }
    if (tb.children.length) { tabla.append(tb); const sc = el("div", "tabla-scroll"); sc.append(tabla); sec2.append(sc); }
    out.push(sec2);

    // Hora feliz
    const sec3 = el("div", "pro-sec");
    sec3.append(el("h3", null, "Hora feliz"));
    const hf = d.horaFeliz || {};
    if (!n0(hf.cantidad)) {
      sec3.append(el("p", "ayuda", "No hiciste ninguna Hora feliz en este período. Prográmala en la tarjeta Hora feliz para llenar tus horas tranquilas."));
    } else {
      const banda = el("div", "pro-hf");
      const normal = n0(hf.normal), durante = n0(hf.durante);
      let grande, texto;
      if (normal >= 0.5 && hf.aumento !== null && hf.aumento !== undefined) {
        grande = (hf.aumento > 0 ? "+" : "") + num(hf.aumento) + " %";
        texto = `En tus ${plural(hf.cantidad, "Hora feliz", "Horas felices")} hubo ${plural(durante, "check-in", "check-ins")}. En esas mismas horas, los días normales suman ${dec(normal, 1)}.`;
      } else {
        grande = "+" + num(durante);
        texto = `${plural(durante, "check-in", "check-ins")} en tus ${plural(hf.cantidad, "Hora feliz", "Horas felices")}, en horas en que normalmente casi no viene nadie (${dec(normal, 1)}).`;
      }
      banda.append(el("div", "grande", grande), el("div", "tx", texto));
      sec3.append(banda);
      const t = el("table", "mt");
      t.innerHTML = "<thead><tr><th>Día</th><th>Horario</th><th class='n'>Durante</th><th class='n'>Un día normal</th><th>Mensaje</th></tr></thead>";
      const tbh = el("tbody");
      const maxH = Math.max(1, ...(hf.lista || []).map((x) => Math.max(n0(x.durante), n0(x.normal))));
      for (const x of hf.lista || []) {
        const tr = el("tr");
        const tdD = el("td", "n", num(x.durante));
        const comp = el("span", "comp");
        comp.setAttribute("aria-hidden", "true");
        const a = el("i"); a.style.height = Math.max(2, n0(x.durante) / maxH * 16) + "px"; a.style.background = "#eb6834";
        const b = el("i"); b.style.height = Math.max(2, n0(x.normal) / maxH * 16) + "px"; b.style.background = "#c9c1b2";
        comp.append(a, b); tdD.append(comp);
        tr.append(el("td", null, diaCorto(x.dia)), el("td", null, `${x.inicio} a ${x.fin}`), tdD,
          el("td", "n", x.normal === null || x.normal === undefined ? "—" : dec(x.normal, 1)), el("td", null, x.mensaje || ""));
        tbh.append(tr);
      }
      t.append(tbh);
      const sc = el("div", "tabla-scroll"); sc.append(t); sec3.append(sc);
      sec3.append(el("p", "ayuda", "«Un día normal» es el promedio de check-ins en ese mismo horario en los 28 días anteriores sin Hora feliz."));
    }
    out.push(sec3);

    // Destacada
    const de = d.destacada || {};
    if (n0(de.dias) > 0) {
      const caj = el("div", "pro-dest");
      const b = el("b", null, `${plural(de.dias, "día", "días")} como cafetería destacada. `);
      caj.append(b, document.createTextNode(`Esos días tuviste ${dec(de.promedioDestacada, 1)} check-ins por día; los demás días, ${de.promedioNormal === null || de.promedioNormal === undefined ? "—" : dec(de.promedioNormal, 1)}.`));
      out.push(caj);
    }
    return out;
  }

  function caja(titulo, color, cifras, nota) {
    const c = el("div", "pro-caja");
    const h = el("h4");
    const i = el("i"); i.style.background = color;
    h.append(i, document.createTextNode(titulo));
    const cf = el("div", "cifras");
    for (const [v, t] of cifras) { const x = el("div"); x.append(el("b", null, num(v)), document.createTextNode(t)); cf.append(x); }
    c.append(h, cf);
    if (nota) c.append(el("p", "nota", nota));
    return c;
  }

  // ---- Mapa de calor hora × día de la semana
  function calor(d) {
    const cont = el("div", "pro-calor mt-graf");
    const heat = d.heat || [];
    let hMin = 7, hMax = 22, max = 0;
    heat.forEach((fila) => fila.forEach((v, h) => { if (v > 0) { hMin = Math.min(hMin, h); hMax = Math.max(hMax, h); max = Math.max(max, v); } }));
    const horas = hMax - hMin + 1;
    const W = 560, celdaH = 22, gap = 2, izq = 36, arriba = 16;
    const celdaW = (W - izq) / horas;
    const H = arriba + 7 * celdaH + 4;
    const s = svg("svg", { viewBox: `0 0 ${W} ${H}`, role: "img", "aria-label": "Check-ins por hora y día de la semana" });
    const tip = el("div", "mt-tip");
    for (let h = hMin; h <= hMax; h++) {
      if ((h - hMin) % 3 && h !== hMax) continue;
      const t = svg("text", { x: izq + (h - hMin + 0.5) * celdaW, y: 11, "text-anchor": "middle" }, s); t.textContent = h + "h";
    }
    const tono = (v) => v <= 0 ? CERO : RAMPA[Math.min(RAMPA.length - 1, Math.floor((v / Math.max(1, max)) * RAMPA.length - 1e-9))];
    for (let w = 0; w < 7; w++) {
      const t = svg("text", { x: izq - 6, y: arriba + w * celdaH + celdaH / 2 + 4, "text-anchor": "end" }, s); t.textContent = DIAS_CORTOS[w];
      for (let h = hMin; h <= hMax; h++) {
        const v = n0((heat[w] || [])[h]);
        const r = svg("rect", {
          x: izq + (h - hMin) * celdaW + gap / 2, y: arriba + w * celdaH + gap / 2, width: Math.max(1, celdaW - gap), height: celdaH - gap,
          rx: 3, fill: tono(v), class: "celda", tabindex: "-1",
        }, s);
        const etiqueta = `${DIAS_SEMANA[w]} de ${horaTxt(h)} a ${horaTxt((h + 1) % 24)}`;
        r.setAttribute("aria-label", `${etiqueta}: ${v} check-ins`);
        r.addEventListener("pointerenter", () => {
          // posición de la celda dentro de la tarjeta (el mapa puede tener scroll horizontal en el celular)
          const cb = cont.getBoundingClientRect(), rb = r.getBoundingClientRect();
          tip.textContent = "";
          tip.append(el("b", null, plural(v, "check-in", "check-ins")), document.createElement("br"), document.createTextNode(etiqueta));
          tip.style.left = Math.min(Math.max(rb.left - cb.left + rb.width / 2, 80), cb.width - 80) + "px";
          tip.style.top = (rb.top - cb.top - 6) + "px";
          tip.style.opacity = 1;
        });
        r.addEventListener("pointerleave", () => { tip.style.opacity = 0; });
      }
    }
    const scroll = el("div", "scroll");
    scroll.append(s);
    cont.append(scroll, tip);
    const ley = el("div", "pro-ley");
    ley.append(el("span", null, "Menos"));
    for (const c of [CERO, ...RAMPA]) { const i = el("i"); i.style.background = c; ley.append(i); }
    ley.append(el("span", null, "Más"), el("span", "sep"), el("span", null, "Hora de Bolivia"));
    cont.append(ley);
    return cont;
  }

  // ---- Plan gratis: lo premium se ve borroso con datos de ejemplo
  function bloqueado(d) {
    const envoltura = el("div", "pro-bloqueo");
    const borroso = el("div", "borroso");
    borroso.setAttribute("aria-hidden", "true");
    borroso.append(...seccionesPremium(ejemplo(d)));
    const velo = el("div", "velo"), card = el("div");
    card.innerHTML = `<svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="#b5791a" stroke-width="2" stroke-linecap="round" aria-hidden="true"><rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/></svg>`;
    card.append(el("h3", null, "Disponible en Premium"),
      el("p", null, "Horas y días con más visitas, clientes que vuelven, cupones canjeados, sellos, cafés pendientes, minijuegos, resultados de la Hora feliz, 90 días y el CSV completo."));
    const b = el("button", "btn oro", "Ver el plan premium");
    b.type = "button";
    b.addEventListener("click", () => { const t = $("t-plan"); if (t) t.scrollIntoView({ behavior: "smooth", block: "start" }); });
    card.append(b);
    velo.append(card);
    envoltura.append(borroso, velo);
    return envoltura;
  }

  // Datos inventados (siempre iguales) solo para el ejemplo borroso
  function ejemplo(d) {
    const heat = [];
    for (let w = 0; w < 7; w++) {
      const fila = [];
      for (let h = 0; h < 24; h++) {
        const pico = Math.exp(-Math.pow(h - 9, 2) / 3) * 4 + Math.exp(-Math.pow(h - 17.5, 2) / 4) * 6;
        fila.push(h < 7 || h > 22 ? 0 : Math.round(pico * (w >= 5 ? 1.4 : 1) + ((w * 7 + h) % 3) * 0.4));
      }
      heat.push(fila);
    }
    return {
      days: d.days, heat, topHours: [{ h: 17, n: 41 }, { h: 18, n: 33 }, { h: 9, n: 28 }],
      players: { total: 86, nuevos: 39, volvieron: 31, tasaRegreso: 36, distribucion: { "1": 55, "2": 17, "3-4": 10, "5+": 4 } },
      coupons: { ganados: 64, canjeados: 41, tasa: 62.5, activos: 1, porTipo: { cupones: { ganados: 40, canjeados: 27, deGanados: 25 }, sellos: { ganados: 9, canjeados: 7, deGanados: 7 } } },
      sellos: { activa: true, sellos: 120, completas: 9, abiertas: 37 },
      pendiente: { activo: true, confirmados: 14, amigo: 9, comunidad: 5, tomados: 4, enPozo: 1 },
      minijuegos: { partidas: 212, jugadores: 48, porJuego: { espresso: 80 } },
      casa: { disponible: true, nombre: "Tu Granito", atrapados: 23, total: 140 }, cerca: 860, aromas: 12,
      horaFeliz: { cantidad: 3, durante: 27, normal: 9, aumento: 200, lista: [] },
    };
  }

  // ------------------------------------------------------------------ CSV
  function descargarCsv() {
    const d = datos;
    if (!d) return;
    const SEP = ";";
    const celda = (v) => {
      if (v === null || v === undefined) return "";
      if (typeof v === "number") return String(v).replace(".", ",");
      const s = String(v);
      return /[";\n\r]/.test(s) || /^[=+\-@]/.test(s) ? '"' + s.replace(/^([=+\-@])/, "'$1").replace(/"/g, '""') + '"' : s;
    };
    const filas = [];
    const fila = (...v) => filas.push(v.map(celda).join(SEP));
    fila("Tazadores · Estadísticas de " + (d.place || "tu cafetería"));
    fila("Período", d.from + " a " + d.to + " (hora de Bolivia)");
    fila();
    const cols = d.full
      ? ["Día", "Check-ins", "Jugadores nuevos", "Cupones ganados", "Cupones canjeados", "Partidas de minijuegos", "Granitos de la casa", "Destacada"]
      : ["Día", "Check-ins"];
    fila(...cols);
    for (const x of d.serie || []) {
      if (d.full) fila(x.d, n0(x.checkins), n0(x.nuevos), n0(x.cupones), n0(x.canjes), n0(x.minijuegos), n0(x.casa), x.destacada ? "sí" : "no");
      else fila(x.d, n0(x.checkins));
    }
    fila();
    fila("Resumen");
    const s = d.summary || {};
    fila("Check-ins", n0(s.checkins));
    fila("Jugadores distintos", n0(s.players));
    fila("Check-ins del período anterior", n0(s.prevCheckins));
    if (d.full) {
      const p = d.players || {}, c = d.coupons || {}, sl = d.sellos || {}, pe = d.pendiente || {}, mj = d.minijuegos || {}, hf = d.horaFeliz || {}, ca = d.casa || {};
      fila("Jugadores nuevos", n0(p.nuevos));
      fila("Volvieron (2 o más visitas)", n0(p.volvieron));
      fila("Tasa de regreso (%)", p.tasaRegreso === null ? "" : Number(p.tasaRegreso));
      fila("Visitas por jugador", p.visitasPromedio === null ? "" : Number(p.visitasPromedio));
      fila("Cupones ganados", n0(c.ganados));
      fila("Cupones canjeados", n0(c.canjeados));
      fila("Canje de los ganados (%)", c.tasa === null ? "" : Number(c.tasa));
      fila("Sellos dados", n0(sl.sellos));
      fila("Tarjetas de sellos llenas", n0(sl.completas));
      fila("Cafés pendientes confirmados", n0(pe.confirmados));
      fila("Partidas de minijuegos", n0(mj.partidas));
      fila("Horas felices", n0(hf.cantidad));
      fila("Check-ins en Horas felices", n0(hf.durante));
      fila("Check-ins de un día normal en esas horas", Number(hf.normal || 0));
      fila("Granitos de la casa atrapados", n0(ca.atrapados));
      fila("Granitos atrapados a 150 m", n0(d.cerca));
      fila("Aromas activados", n0(d.aromas));
      fila();
      fila("Check-ins por hora", ...Array.from({ length: 24 }, (_, h) => horaTxt(h)));
      (d.heat || []).forEach((f, w) => fila(DIAS_SEMANA[w], ...f.map(n0)));
    }
    const blob = new Blob(["﻿" + filas.join("\r\n") + "\r\n"], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a");
    const nombre = String(d.place || "cafeteria").normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "").toLowerCase() || "cafeteria";
    a.href = URL.createObjectURL(blob);
    a.download = `tazadores-${nombre}-${d.from}-a-${d.to}.csv`;
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
    descargarCsv.ultimo = filas;   // para las pruebas
  }

  // Se llama al abrir una cafetería (abrir() en index.html)
  window.cargarPro = function () {
    if (!construir() || !actual) return;
    if (lugarId !== actual.id) {
      lugarId = actual.id;
      datos = null;
      dias = 30;
      $("pro-cuerpo").innerHTML = "";
      for (const b of raiz.querySelectorAll("#pro-periodos button")) b.setAttribute("aria-pressed", String(+b.dataset.d === dias));
    }
    cargar();
  };
  window.proCsvFilas = () => descargarCsv.ultimo || null;
})();
