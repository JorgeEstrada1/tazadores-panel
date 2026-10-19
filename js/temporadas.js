// Temporadas de Tarija (sección Desarrollador del panel, solo administradores).
// Carnaval chapaco, Fiesta de la Vendimia, San Roque y la Tarija Coffee Week cambian de fecha cada año:
// aquí se crea cada temporada con su tema, nombre, días (hora de Bolivia), puntos por nivel y la tabla
// de premios del pase (20 niveles, fila gratis y fila premium). Solo puede haber una temporada a la vez.
// Necesita el PASO 24 (PEGAR_EN_SUPABASE_24.sql). Todo pasa por funciones del servidor que revisan que seas administrador.
// Usa las globales del panel: sb, $, mostrar, msg, textoError, dosToques y esAdmin.
// Se dibuja dentro de <div id="temporadas-anchor"></div> y se carga con cargarTemporadas() (desde cargarAdmin).
(function () {
  "use strict";

  const FALTA_PASO = "Falta actualizar el servidor: ejecuta PEGAR_EN_SUPABASE_24.sql en Supabase.";
  const NIVELES = 20;

  // Tipos de premio (iguales a season_rewards_error en el servidor)
  const TIPOS = [
    ["", "— sin premio —", 0, 0],
    ["tazas", "Tazas", 1, 1000],
    ["granos", "Granos dorados", 1, 100],
    ["aromas", "Aromas", 1, 20],
    ["semilla5", "Semillas de 5 km", 1, 3],
    ["semilla10", "Semillas de 10 km", 1, 2],
    ["ropa", "Ropa del tema (capibara)", 1, 1],
    ["disfraz", "Disfraz de lujo (Granitos)", 1, 1],
  ];
  const tipo = (k) => TIPOS.find((t) => t[0] === k) || TIPOS[0];

  // Tabla base: la fila gratis da algo en cada nivel; la premium da más, el disfraz de lujo en el 10 y la ropa en el 20
  const P = (k, n) => ({ k, n });
  const BASE_GRATIS = [P("tazas", 30), P("granos", 2), P("tazas", 40), P("aromas", 1), P("semilla5", 1), P("tazas", 50), P("granos", 3),
    P("tazas", 60), P("aromas", 1), P("semilla5", 1), P("tazas", 70), P("granos", 4), P("tazas", 80), P("aromas", 2), P("semilla10", 1),
    P("tazas", 90), P("granos", 5), P("tazas", 100), P("aromas", 2), P("semilla10", 1)];
  const BASE_PREMIUM = [P("tazas", 100), P("granos", 5), P("aromas", 2), P("semilla5", 2), P("tazas", 150), P("granos", 8), P("aromas", 3),
    P("semilla10", 1), P("tazas", 200), P("disfraz", 1), P("granos", 10), P("aromas", 3), P("tazas", 250), P("semilla5", 3), P("granos", 12),
    P("semilla10", 1), P("tazas", 300), P("aromas", 4), P("granos", 15), P("ropa", 1)];

  const TEMAS = {
    carnaval: {
      nombre: "Carnaval chapaco", dias: 14, cuando: "Cambia cada año (antes de la Cuaresma): Compadres, Comadres y el Carnaval suelen caer en febrero o marzo.",
      ropa: "Antifaz de carnaval", disfraz: "corona de flores con serpentinas y cascarón", colores: ["#FF7A59", "#B3194F"],
      banderas: ["#E5484D", "#F2C94C", "#2F80ED", "#6FCF97", "#B08BFF", "#FF8FC7"],
      ajuste: (r) => (r.k === "tazas" ? P("tazas", Math.round((r.n * 1.2) / 10) * 10) : r),   // fiesta: más tazas para lanzar
    },
    vendimia: {
      nombre: "Fiesta de la Vendimia", dias: 21, cuando: "Época de cosecha de la uva: casi siempre en marzo.",
      ropa: "Corona de la Vendimia", disfraz: "corona de vid con racimos y aro dorado", colores: ["#A2477E", "#3E0D33"],
      banderas: ["#7B2D8E", "#A23B6B", "#5B8C2A", "#E9B44C", "#C77DDB", "#8BC34A"],
      ajuste: (r) => (r.k === "granos" ? P("granos", Math.ceil(r.n * 1.3)) : r),   // cosecha: más granos dorados
    },
    sanroque: {
      nombre: "Fiesta de San Roque", dias: 21, cuando: "Agosto: la novena y el día grande, el 16 de agosto, con la procesión de los chunchos.",
      ropa: "Penacho de chuncho", disfraz: "penacho de chuncho con más plumas, espejitos y cintas", colores: ["#F2683C", "#6E1A5C"],
      banderas: ["#E5484D", "#F2C94C", "#2E9E5B", "#2F80ED", "#FF5FA2", "#FFFFFF"],
      ajuste: (r) => (r.k === "aromas" ? P("aromas", r.n + 1) : r),   // procesión: más aromas
    },
    cafe: {
      nombre: "Tarija Coffee Week", dias: 7, cuando: "Una semana; la fecha la anuncian las cafeterías de Tarija.",
      ropa: "Bufanda Coffee Week", disfraz: "boina de barista con una tacita humeante", colores: ["#C08A57", "#3B2412"],
      banderas: ["#6B4423", "#C68B4E", "#FFBE55", "#FFF1DD", "#3EDBAE", "#A0703F"],
      ajuste: (r) => (r.k === "semilla5" ? P("aromas", r.n + 1) : r),   // semana corta: aromas en vez de semillas de 5 km
    },
  };

  let temporadas = [], editando = null, armado = false, cargando = false, otraVez = false;

  // ---------------------------------------------------------------- Ayudas
  const crear = (tag, clase, texto) => {
    const e = document.createElement(tag);
    if (clase) e.className = clase;
    if (texto != null) e.textContent = texto;
    return e;
  };
  const boton = (texto, clase, alTocar) => {
    const b = crear("button", "btn " + (clase || ""), texto);
    b.type = "button";
    if (alTocar) b.onclick = alTocar;
    return b;
  };
  const faltaFuncion = (e) => /Could not find the function|PGRST202/i.test((e && e.message) || "");
  const error = (e) => (faltaFuncion(e) ? FALTA_PASO : textoError(e));
  const num = (n) => Number(n || 0).toLocaleString("es-BO");

  // Hora de Bolivia (UTC−4 fija)
  const BO = 4 * 36e5;
  const hoyBo = () => new Date(Date.now() - BO).toISOString().slice(0, 10);
  const sumarDias = (dia, n) => { const d = new Date(dia + "T12:00:00Z"); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
  const diasEntre = (a, b) => Math.round((Date.parse(b + "T12:00:00Z") - Date.parse(a + "T12:00:00Z")) / 864e5);
  const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
  function rango(a, b) {   // "Del 6 al 19 de febrero de 2027" con días "YYYY-MM-DD"
    const [ya, ma, da] = a.split("-").map(Number), [yb, mb, db] = b.split("-").map(Number);
    if (ya === yb && ma === mb) return da === db ? `El ${da} de ${MESES[ma - 1]} de ${ya}` : `Del ${da} al ${db} de ${MESES[mb - 1]} de ${yb}`;
    if (ya === yb) return `Del ${da} de ${MESES[ma - 1]} al ${db} de ${MESES[mb - 1]} de ${yb}`;
    return `Del ${da} de ${MESES[ma - 1]} de ${ya} al ${db} de ${MESES[mb - 1]} de ${yb}`;
  }
  function estado(t, ahora = Date.now()) {
    return ahora < Date.parse(t.starts_at) ? "prox" : ahora >= Date.parse(t.ends_at) ? "fin" : "curso";
  }
  // Puntos por nivel sugeridos: un jugador constante (≈300 pts por día) completa los 20 niveles en ~70 % de la temporada
  const sugeridos = (dias) => Math.min(400, Math.max(50, Math.round((dias * 10) / 10) * 10));
  function premiosDelTema(tema) {
    const t = TEMAS[tema] || TEMAS.carnaval;
    return { free: BASE_GRATIS.map((r) => t.ajuste({ ...r })), premium: BASE_PREMIUM.map((r) => t.ajuste({ ...r })) };
  }
  function etiqueta(texto, clase, color) {
    const s = crear("span", "etq" + (clase ? " " + clase : ""));
    if (color) { const i = crear("i"); i.style.background = color; s.append(i); }
    s.append(texto);
    return s;
  }

  // ---------------------------------------------------------------- Estructura (se arma una sola vez)
  function armar() {
    if (armado) return true;
    const ancla = $("temporadas-anchor");
    if (!ancla) return false;
    armado = true;

    const css = crear("style");
    css.textContent = `
      .tp-vista { position: relative; overflow: hidden; border-radius: 14px; padding: 46px 18px 16px; color: #fff; margin: 10px 0 4px; min-height: 120px; }
      .tp-vista .tp-chip { display: inline-block; font-size: 11px; font-weight: 700; letter-spacing: 1px; background: rgba(20,8,24,.35); border-radius: 99px; padding: 3px 10px; }
      .tp-vista .tp-nom { font-family: Fraunces, Georgia, serif; font-size: 26px; font-weight: 700; line-height: 1.15; margin-top: 6px; text-shadow: 0 2px 0 rgba(0,0,0,.2); }
      .tp-vista .tp-cuando { font-size: 14px; opacity: .92; }
      .tp-banderas { position: absolute; left: 0; right: 0; top: 0; height: 38px; display: flex; justify-content: space-around; padding: 0 6px;
        background: linear-gradient(transparent 5px, rgba(255,255,255,.75) 5px, rgba(255,255,255,.75) 7px, transparent 7px); }
      .tp-banderas i { width: 22px; height: 28px; margin-top: 6px; clip-path: polygon(0 0, 100% 0, 50% 100%); transform-origin: top center; animation: tpMecer 2.4s ease-in-out infinite; }
      .tp-banderas i:nth-child(2n) { animation-delay: -1.1s; }
      @keyframes tpMecer { 0%, 100% { transform: rotate(-6deg); } 50% { transform: rotate(6deg); } }
      @media (prefers-reduced-motion: reduce) { .tp-banderas i { animation: none; } }
      .tp-temas { display: grid; grid-template-columns: repeat(auto-fill, minmax(180px, 1fr)); gap: 8px; }
      .tp-tema { border: 2px solid #e4dccd; border-radius: 12px; padding: 10px 12px; background: #fff; cursor: pointer; text-align: left; }
      .tp-tema[aria-pressed=true] { border-color: var(--noche); box-shadow: 0 0 0 2px rgba(18,35,58,.15); }
      .tp-tema b { display: block; font-size: 15px; }
      .tp-tema small { color: var(--suave); font-size: 12px; }
      .tp-tema .tp-sw { display: block; height: 8px; border-radius: 99px; margin-bottom: 8px; }
      .tp-tabla { width: 100%; border-collapse: collapse; font-size: 14px; }
      .tp-tabla th, .tp-tabla td { padding: 5px 6px; border-bottom: 1px solid var(--linea); vertical-align: middle; }
      .tp-tabla th { font-size: 12px; color: var(--suave); text-align: left; }
      .tp-tabla td.nv { font-weight: 700; width: 46px; text-align: center; color: var(--noche); }
      .tp-tabla .celda { display: flex; gap: 6px; }
      .tp-tabla select { padding: 7px 8px; font-size: 14px; min-width: 0; flex: 1; }
      .tp-tabla input[type=number] { width: 84px !important; padding: 7px 8px; font-size: 14px; flex: none; }
      .tp-tabla tr.premio-especial td { background: #fff8e8; }
      .tp-num { display: flex; flex-wrap: wrap; gap: 14px; font-size: 13px; color: var(--suave); margin-top: 6px; }
      .tp-num b { font-family: Fraunces, serif; font-size: 18px; color: var(--noche); margin-right: 3px; }
      .tp-reglas { margin: 8px 0 0; padding-left: 18px; color: var(--suave); font-size: 14px; }
      @media (max-width: 640px) { .tp-tabla .celda { flex-direction: column; } .tp-tabla input[type=number] { width: 100% !important; } }
    `;
    document.head.append(css);

    const caja = crear("div", "tarjeta");
    caja.id = "t-temporadas";
    const enc = crear("div", "enc-tarjeta");
    const txt = crear("div");
    const h2 = crear("h2", null, "Temporadas de Tarija ");
    h2.append(crear("span", "chip", "Administrador"));
    txt.append(h2, crear("p", "sub", "Carnaval chapaco, Vendimia, San Roque y la Tarija Coffee Week. Las fechas cambian cada año: crea aquí cada temporada. Mientras dura, los Granitos llevan el disfraz del tema, el mapa muestra el estandarte y los jugadores suben de nivel con su Pase de temporada."));
    enc.append(txt, boton("+ Nueva temporada", "oro", () => abrirForm(null)));
    caja.append(enc);

    const reglas = crear("details", "mt-datos");
    reglas.append(crear("summary", null, "Cómo suman puntos los jugadores (lo cuenta el servidor)"));
    const ul = crear("ul", "tp-reglas");
    for (const l of [
      "Granito atrapado (incluye el de la casa y los jefes): 10 pts, hasta 30 por día. No cuentan evoluciones, intercambios, semillas ni el Granito de una ruta.",
      "Check-in en una cafetería: 40 pts, hasta 5 por día.",
      "Partida de minijuego en una cafetería: 15 pts, hasta 10 por día.",
      "Intercambio hecho con un amigo: 30 pts, hasta 3 por día.",
      "Ruta del café completada: 150 pts.",
      "Solo cuenta lo que pasa entre el inicio y el final de la temporada (días en hora de Bolivia). Los premios se cobran hasta 7 días después del final.",
      "El Pase de temporada (producto pase_temporada de Google Play) solo se vende con la temporada activa y vale para esa temporada. Ver TIENDA_PASOS.md.",
    ]) ul.append(crear("li", null, l));
    reglas.append(ul);
    caja.append(reglas);

    const lista = crear("div");
    lista.id = "tp-lista";
    caja.append(lista);
    const m = crear("p", "msg"); m.id = "m-temporadas"; m.setAttribute("role", "status");
    caja.append(m);

    // ---------------- Formulario
    const f = crear("form", "ev-form oculto");
    f.id = "f-temporada"; f.noValidate = true;
    f.innerHTML = `
      <h3 id="tp-titulo-form">Nueva temporada</h3>
      <label>Tema</label>
      <div class="tp-temas" id="tp-temas"></div>
      <div class="tp-vista" id="tp-vista"><div class="tp-banderas" id="tp-banderas"></div>
        <span class="tp-chip">TEMPORADA DE TARIJA</span><div class="tp-nom" id="tp-vista-nom"></div><div class="tp-cuando" id="tp-vista-cuando"></div></div>
      <p class="ayuda" id="tp-cuando-ayuda"></p>
      <div class="grid2">
        <div>
          <label for="tp-nombre">Nombre <span class="contador" id="tp-cont">0/60</span></label>
          <input id="tp-nombre" type="text" maxlength="60" required placeholder="Carnaval chapaco 2027">
        </div>
        <div>
          <label for="tp-puntos">Puntos por nivel</label>
          <input id="tp-puntos" type="number" min="10" max="2000" step="10" required>
          <p class="ayuda" id="tp-puntos-ayuda"></p>
        </div>
        <div>
          <label for="tp-inicio">Primer día (empieza a las 00:00 de Bolivia)</label>
          <input id="tp-inicio" type="date" required>
        </div>
        <div>
          <label for="tp-fin">Último día (termina a las 23:59 de Bolivia)</label>
          <input id="tp-fin" type="date" required>
          <div class="atajos" id="tp-atajos"></div>
        </div>
      </div>
      <label>Premios del pase</label>
      <p class="ayuda">Fila gratis para todos; fila premium para quien compra el Pase de temporada. "Ropa del tema" y "Disfraz de lujo" van en un solo nivel cada uno.</p>
      <div class="atajos"><button type="button" id="tp-sugeridos">Cargar los premios sugeridos del tema</button></div>
      <div class="tabla-scroll"><table class="tp-tabla"><thead><tr><th>Nivel</th><th>Gratis</th><th>Premium</th></tr></thead><tbody id="tp-filas"></tbody></table></div>
      <div class="fila" style="margin-top:16px">
        <button class="btn" type="submit" id="tp-guardar">Guardar temporada</button>
        <button class="btn borde" type="button" id="tp-cancelar">Cancelar</button>
      </div>
      <p class="msg" id="m-temporada" role="status"></p>`;
    caja.append(f);
    ancla.append(caja);

    // Temas
    for (const [id, t] of Object.entries(TEMAS)) {
      const b = crear("button", "tp-tema");
      b.type = "button"; b.dataset.tema = id; b.setAttribute("aria-pressed", "false");
      const sw = crear("span", "tp-sw"); sw.style.background = `linear-gradient(90deg, ${t.colores[0]}, ${t.colores[1]})`;
      b.append(sw, crear("b", null, t.nombre), crear("small", null, `${t.dias} días · ${t.ropa}`));
      b.onclick = () => elegirTema(id, true);
      $("tp-temas").append(b);
    }
    // Filas de premios
    const cuerpo = $("tp-filas");
    for (let i = 1; i <= NIVELES; i++) {
      const tr = crear("tr");
      tr.append(crear("td", "nv", String(i)));
      for (const fila of ["free", "premium"]) {
        const td = crear("td");
        const celda = crear("div", "celda");
        const sel = crear("select");
        sel.id = `tp-${fila}-${i}-k`;
        sel.setAttribute("aria-label", `Nivel ${i}, ${fila === "free" ? "gratis" : "premium"}: premio`);
        for (const [k, nombre] of TIPOS) { const o = crear("option", null, nombre); o.value = k; sel.append(o); }
        const n = crear("input");
        n.type = "number"; n.id = `tp-${fila}-${i}-n`; n.min = "1"; n.step = "1";
        n.setAttribute("aria-label", `Nivel ${i}, ${fila === "free" ? "gratis" : "premium"}: cantidad`);
        sel.onchange = () => { ajustarCantidad(fila, i); marcarEspeciales(); };
        celda.append(sel, n);
        td.append(celda);
        tr.append(td);
      }
      cuerpo.append(tr);
    }
    $("tp-sugeridos").onclick = () => { ponerPremios(premiosDelTema(temaElegido() || "carnaval")); msg("m-temporada", "Premios sugeridos cargados. Puedes cambiarlos.", "ok"); };
    $("tp-puntos").addEventListener("input", () => { $("tp-puntos").dataset.auto = "0"; });
    $("tp-cancelar").onclick = cerrarForm;
    $("tp-nombre").addEventListener("input", vistaPrevia);
    $("tp-inicio").addEventListener("change", () => { fechasCambiaron(); vistaPrevia(); });
    $("tp-fin").addEventListener("change", () => { fechasCambiaron(); vistaPrevia(); });
    f.addEventListener("submit", (ev) => { ev.preventDefault(); guardar(); });
    return true;
  }

  // ---------------------------------------------------------------- Lista
  async function cargarTemporadas() {
    if (!esAdmin || !armar()) return;
    if (cargando) { otraVez = true; return; }
    cargando = true;
    try {
      const { data, error: e } = await sb.rpc("admin_seasons");
      if (e) { msg("m-temporadas", error(e), "error"); pintarLista(); return; }
      temporadas = (data && data.seasons) || [];
      if ($("m-temporadas").classList.contains("error")) msg("m-temporadas");   // el aviso de "guardada" o "terminada" se queda
      pintarLista();
    } finally {
      cargando = false;
      if (otraVez) { otraVez = false; cargarTemporadas(); }
    }
  }

  function pintarLista() {
    const lista = $("tp-lista");
    lista.innerHTML = "";
    if (!temporadas.length) {
      lista.append(crear("p", "vacio-estado", "Todavía no hay temporadas. Crea la primera con el botón de arriba."));
      return;
    }
    const ahora = Date.now();
    for (const t of temporadas) {
      const tema = TEMAS[t.theme] || TEMAS.carnaval;
      const est = estado(t, ahora);
      const item = crear("div", "evento");
      item.style.setProperty("--c", tema.colores[0]);
      item.append(crear("div", "franja"));
      const cuerpo = crear("div", "cuerpo");
      cuerpo.append(crear("div", "nom", t.name));
      cuerpo.append(crear("div", "cuando", rango(t.start_day, t.end_day)));
      const etq = crear("div", "etiquetas");
      etq.style.cssText = "display:flex;flex-wrap:wrap;gap:6px;margin-top:6px";
      etq.append(etiqueta(est === "curso" ? "En curso" : est === "prox" ? "Próxima" : "Terminada", "estado-" + est),
        etiqueta(tema.nombre, null, tema.colores[0]), etiqueta(`${t.tier_points} pts por nivel`, "xp"));
      cuerpo.append(etq);
      const numeros = crear("div", "tp-num");
      const dato = (v, texto) => { const s = crear("span"); s.append(crear("b", null, num(v)), texto); return s; };
      numeros.append(dato(t.passes, t.passes === 1 ? " pase vendido" : " pases vendidos"));
      if (t.passes_test) numeros.append(dato(t.passes_test, " de prueba"));
      numeros.append(dato(t.players, t.players === 1 ? " jugador cobró" : " jugadores cobraron"), dato(t.claims, " premios cobrados"));
      if (t.top_tier) numeros.append(dato(t.top_tier, " nivel más alto"));
      cuerpo.append(numeros);
      item.append(cuerpo);

      const acciones = crear("div", "acciones");
      if (est !== "fin") acciones.append(boton("Editar", "borde", () => abrirForm(t)));
      if (est === "curso") {
        const b = boton("Terminar ahora", "borde");
        b.onclick = () => dosToques(b, "¿Terminarla ya? Toca otra vez", () => terminar(t, b));
        acciones.append(b);
      }
      if (!t.passes && !t.passes_test && !t.claims) {
        const b = boton("Borrar", "borde peligro");
        b.onclick = () => dosToques(b, "¿Borrarla? Toca otra vez", () => borrar(t, b));
        acciones.append(b);
      }
      if (est === "fin") acciones.append(boton("Repetir el próximo año", "borde", () => abrirForm(t, true)));
      item.append(acciones);
      lista.append(item);
    }
  }

  async function terminar(t, b) {
    b.disabled = true;
    const { data, error: e } = await sb.rpc("admin_season_end", { p_id: t.id });
    b.disabled = false;
    if (e) { msg("m-temporadas", error(e), "error"); return; }
    if (!data || !data.ok) { msg("m-temporadas", (data && data.message) || "No se pudo terminar.", "error"); return; }
    msg("m-temporadas", `"${t.name}" terminó. Los jugadores tienen 7 días para cobrar lo que ganaron.`, "ok");
    cargarTemporadas();
  }

  async function borrar(t, b) {
    b.disabled = true;
    const { data, error: e } = await sb.rpc("admin_season_delete", { p_id: t.id });
    b.disabled = false;
    if (e) { msg("m-temporadas", error(e), "error"); return; }
    if (!data || !data.ok) { msg("m-temporadas", (data && data.message) || "No se pudo borrar.", "error"); return; }
    msg("m-temporadas", "Temporada borrada.", "ok");
    if (editando && editando.id === t.id) cerrarForm();
    cargarTemporadas();
  }

  // ---------------------------------------------------------------- Formulario
  const temaElegido = () => { const b = document.querySelector("#tp-temas [aria-pressed=true]"); return b ? b.dataset.tema : null; };

  function elegirTema(id, alTocar) {
    const anterior = temaElegido();
    for (const b of document.querySelectorAll("#tp-temas .tp-tema")) b.setAttribute("aria-pressed", String(b.dataset.tema === id));
    const t = TEMAS[id];
    $("tp-cuando-ayuda").textContent = t.cuando;
    // Nombre por defecto: "Carnaval chapaco 2027" (si no lo escribiste tú)
    const nom = $("tp-nombre");
    const anio = ($("tp-inicio").value || hoyBo()).slice(0, 4);
    if (alTocar && (!nom.value.trim() || Object.values(TEMAS).some((x) => nom.value.trim().startsWith(x.nombre)))) nom.value = `${t.nombre} ${anio}`;
    // Atajos de duración
    const at = $("tp-atajos");
    at.innerHTML = "";
    for (const d of [...new Set([t.dias, 7, 10, 14, 21])].sort((a, b) => a - b)) {
      const b = crear("button", null, d === t.dias ? `${d} días (típico)` : `${d} días`);
      b.type = "button";
      b.onclick = () => { if (!$("tp-inicio").value) $("tp-inicio").value = hoyBo(); $("tp-fin").value = sumarDias($("tp-inicio").value, d - 1); fechasCambiaron(); vistaPrevia(); };
      at.append(b);
    }
    if (alTocar && anterior !== id && !editando) ponerPremios(premiosDelTema(id));
    marcarEspeciales();
    vistaPrevia();
  }

  function fechasCambiaron() {
    const a = $("tp-inicio").value, b = $("tp-fin").value;
    const ayuda = $("tp-puntos-ayuda");
    if (!a || !b || b < a) { ayuda.textContent = "Elige las fechas para ver una sugerencia."; return; }
    const dias = diasEntre(a, b) + 1;
    const s = sugeridos(dias);
    ayuda.textContent = `${dias} días → sugerido: ${s} (20 niveles = ${num(s * 20)} pts).`;
    const p = $("tp-puntos");
    if (!editando || !yaEmpezo(editando)) {
      if (!p.value || p.dataset.auto === "1") { p.value = s; p.dataset.auto = "1"; }
    }
  }

  function vistaPrevia() {
    const t = TEMAS[temaElegido() || "carnaval"];
    const v = $("tp-vista");
    v.style.background = `linear-gradient(160deg, ${t.colores[0]}, ${t.colores[1]})`;
    const ban = $("tp-banderas");
    ban.innerHTML = "";
    for (let i = 0; i < 12; i++) { const b = crear("i"); b.style.background = t.banderas[i % t.banderas.length]; ban.append(b); }
    $("tp-vista-nom").textContent = $("tp-nombre").value.trim() || t.nombre;
    const a = $("tp-inicio").value, b = $("tp-fin").value;
    $("tp-vista-cuando").textContent = a && b && b >= a ? rango(a, b) : "Elige las fechas";
    $("tp-cont").textContent = `${$("tp-nombre").value.length}/60`;
  }

  function ajustarCantidad(fila, i) {
    const k = $(`tp-${fila}-${i}-k`).value, n = $(`tp-${fila}-${i}-n`);
    const [, , min, max] = tipo(k);
    n.disabled = !k || max === 1;
    n.min = String(min || 1); n.max = String(max || 1);
    if (!k) n.value = "";
    else if (max === 1) n.value = "1";
    else if (!n.value || +n.value < min || +n.value > max) n.value = String(Math.min(max, Math.max(min, +n.value || min)));
  }

  function marcarEspeciales() {
    for (let i = 1; i <= NIVELES; i++) {
      const esp = ["ropa", "disfraz"].includes($(`tp-free-${i}-k`).value) || ["ropa", "disfraz"].includes($(`tp-premium-${i}-k`).value);
      $(`tp-free-${i}-k`).closest("tr").classList.toggle("premio-especial", esp);
    }
  }

  function ponerPremios(r) {
    for (const fila of ["free", "premium"]) {
      for (let i = 1; i <= NIVELES; i++) {
        const p = (r && r[fila] && r[fila][i - 1]) || null;
        $(`tp-${fila}-${i}-k`).value = p ? p.k : "";
        $(`tp-${fila}-${i}-n`).value = p ? String(p.n) : "";
        ajustarCantidad(fila, i);
      }
    }
    marcarEspeciales();
  }

  function leerPremios() {
    const r = { free: [], premium: [] };
    let ropa = 0, disfraz = 0;
    for (const fila of ["free", "premium"]) {
      for (let i = 1; i <= NIVELES; i++) {
        const k = $(`tp-${fila}-${i}-k`).value;
        if (!k) { r[fila].push(null); continue; }
        const [, nombre, min, max] = tipo(k);
        const n = Number($(`tp-${fila}-${i}-n`).value);
        const donde = ` (nivel ${i}, fila ${fila === "free" ? "gratis" : "premium"}).`;
        if (!Number.isInteger(n) || n < min || n > max) throw new Error(max === 1 ? `${nombre}: es 1${donde}` : `${nombre}: de ${min} a ${max}${donde}`);
        if (k === "ropa") ropa++;
        if (k === "disfraz") disfraz++;
        r[fila].push({ k, n });
      }
    }
    if (ropa > 1) throw new Error("La ropa del tema va en un solo nivel.");
    if (disfraz > 1) throw new Error("El disfraz de lujo va en un solo nivel.");
    return r;
  }

  const yaEmpezo = (t) => t && Date.now() >= Date.parse(t.starts_at);

  // t: temporada a editar (o null). repetir: copia una terminada para el año siguiente (temporada nueva).
  function abrirForm(t, repetir) {
    if (!armar()) return;
    editando = t && !repetir ? t : null;
    const f = $("f-temporada");
    mostrar("f-temporada", true);
    msg("m-temporada");
    $("tp-titulo-form").textContent = editando ? `Editar: ${t.name}` : repetir ? "Repetir la temporada" : "Nueva temporada";
    const p = $("tp-puntos");
    p.dataset.auto = t ? "0" : "1";
    if (t) {
      elegirTema(t.theme, false);
      $("tp-nombre").value = repetir ? t.name.replace(/\b(20\d\d)\b/, (a) => String(+a + 1)) : t.name;
      $("tp-inicio").value = repetir ? "" : t.start_day;
      $("tp-fin").value = repetir ? "" : t.end_day;
      p.value = t.tier_points;
      ponerPremios(t.rewards);
    } else {
      $("tp-nombre").value = "";
      $("tp-inicio").value = ""; $("tp-fin").value = ""; p.value = "";
      for (const b of document.querySelectorAll("#tp-temas .tp-tema")) b.setAttribute("aria-pressed", "false");
      elegirTema("carnaval", true);
    }
    // Ya empezada: el tema, el primer día y los puntos por nivel quedan fijos
    const fijo = yaEmpezo(editando);
    for (const b of document.querySelectorAll("#tp-temas .tp-tema")) b.disabled = fijo;
    $("tp-inicio").disabled = fijo;
    p.disabled = fijo;
    $("tp-inicio").min = fijo ? "" : hoyBo();
    $("tp-fin").min = hoyBo();
    if (fijo) msg("m-temporada", "Ya empezó: puedes cambiar el nombre, el último día y los premios.", "");
    fechasCambiaron();
    vistaPrevia();
    f.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function cerrarForm() {
    editando = null;
    mostrar("f-temporada", false);
    msg("m-temporada");
  }

  async function guardar() {
    const nombre = $("tp-nombre").value.trim();
    const ini = $("tp-inicio").value, fin = $("tp-fin").value;
    const puntos = Number($("tp-puntos").value);
    if (nombre.length < 3) { msg("m-temporada", "El nombre debe tener al menos 3 letras.", "error"); return; }
    if (!ini || !fin) { msg("m-temporada", "Elige el primer y el último día.", "error"); return; }
    if (fin < ini) { msg("m-temporada", "El último día tiene que ser después del primero.", "error"); return; }
    if (diasEntre(ini, fin) + 1 > 62) { msg("m-temporada", "Una temporada dura como máximo 62 días.", "error"); return; }
    if (!Number.isInteger(puntos) || puntos < 10 || puntos > 2000) { msg("m-temporada", "Los puntos por nivel van de 10 a 2000.", "error"); return; }
    let premios;
    try { premios = leerPremios(); } catch (e) { msg("m-temporada", e.message, "error"); return; }
    const b = $("tp-guardar");
    b.disabled = true;
    msg("m-temporada", "Guardando…");
    const { data, error: e } = await sb.rpc("admin_season_save", {
      p_id: editando ? editando.id : null, p_theme: temaElegido() || "carnaval", p_name: nombre,
      p_start: ini, p_end: fin, p_tier_points: puntos, p_rewards: premios,
    });
    b.disabled = false;
    if (e) { msg("m-temporada", error(e), "error"); return; }
    if (!data || !data.ok) { msg("m-temporada", (data && data.message) || "No se pudo guardar.", "error"); return; }
    msg("m-temporadas", editando ? "Temporada actualizada." : `Temporada creada: ${rango(ini, fin)}.`, "ok");
    cerrarForm();
    cargarTemporadas();
  }

  window.cargarTemporadas = cargarTemporadas;
})();
