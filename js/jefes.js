// =====================================================================
// Panel › Desarrollador › Jefe de la semana (migración 0018, PEGAR_EN_SUPABASE_13.sql)
// Un Granito muy fuerte aparece a una hora fija en UNA cafetería y solo se atrapa si se juntan
// los jugadores que pide. Aquí se programan, se cancelan y se ve cómo les fue.
// Usa las globales del panel: sb, $, msg, mostrar, textoError, dosToques, esAdmin.
// Se dibuja dentro de <div class="tarjeta oculto" id="t-jefes"></div> y se carga con cargarJefes().
// =====================================================================
(function () {
  "use strict";

  const ZONA = "America/La_Paz";   // Bolivia: UTC-4 todo el año
  const OFFSET = "-04:00";
  const RZ = { comun: ["Común", "#c9b48d"], rara: ["Rara", "#4fd1c5"], epica: ["Épica", "#c590ff"] };
  let datos = { raids: [], places: [], species: [] };
  let filtro = "prox", armado = false, cargando = false;

  const nodo = (tag, clase, texto) => {
    const e = document.createElement(tag);
    if (clase) e.className = clase;
    if (texto != null) e.textContent = texto;
    return e;
  };
  const sinServidor = (m) => /Could not find the function|PGRST202|jefe_admin/i.test(m || "");
  const errorTexto = (e) => sinServidor(e && e.message) ? "Falta actualizar el servidor: ejecuta PEGAR_EN_SUPABASE_13.sql en Supabase." : textoError(e);

  // ---------------------------------------------------------------- Horas (siempre en hora de Bolivia)
  const z2 = (n) => String(n).padStart(2, "0");
  // Fecha "pared" de Bolivia para un instante (usa los getters UTC sobre el instante corrido 4 horas)
  function bolivia(ms) { return new Date(ms - 4 * 3600e3); }
  function aInput(ms) {
    const d = bolivia(ms);
    return `${d.getUTCFullYear()}-${z2(d.getUTCMonth() + 1)}-${z2(d.getUTCDate())}T${z2(d.getUTCHours())}:${z2(d.getUTCMinutes())}`;
  }
  function deInput(v) { return v ? Date.parse(v + ":00" + OFFSET) : NaN; }
  const fechaHora = (ms) => new Date(ms).toLocaleString("es-BO", { timeZone: ZONA, weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
  const hora = (ms) => new Date(ms).toLocaleTimeString("es-BO", { timeZone: ZONA, hour: "2-digit", minute: "2-digit" });
  function enCuanto(ms) {
    const min = Math.max(1, Math.round(ms / 60000));
    if (min < 60) return min + " min";
    const h = Math.round(min / 60);
    if (h < 48) return h === 1 ? "1 hora" : h + " horas";
    return Math.round(h / 24) + " días";
  }
  // Próximo día de la semana (0 = domingo … 6 = sábado) a la hora dada, en hora de Bolivia
  function proximo(diaSemana, h, m) {
    const ahora = Date.now(), b = bolivia(ahora);
    let dias = (diaSemana - b.getUTCDay() + 7) % 7;
    const hoyEsa = Date.UTC(b.getUTCFullYear(), b.getUTCMonth(), b.getUTCDate(), h, m) + 4 * 3600e3;
    if (dias === 0 && hoyEsa <= ahora + 5 * 60e3) dias = 7;
    return hoyEsa + dias * 864e5;
  }
  // Dentro de n días (0 = hoy) a la hora h, en hora de Bolivia
  function dia(n, h) {
    const b = bolivia(Date.now());
    return Date.UTC(b.getUTCFullYear(), b.getUTCMonth(), b.getUTCDate() + n, h, 0) + 4 * 3600e3;
  }
  // Hoy a la hora h; si ya pasó, mañana
  function hoyOMañana(h) {
    const t = dia(0, h);
    return t <= Date.now() + 5 * 60e3 ? dia(1, h) : t;
  }

  function estado(r, ahora) {
    if (r.cancelledAt) return "fin";
    const a = Date.parse(r.startsAt), b = Date.parse(r.endsAt);
    return ahora < a ? "prox" : ahora >= b ? "fin" : "curso";
  }

  // ---------------------------------------------------------------- Armado (una sola vez)
  function estilos() {
    if (document.getElementById("jf-estilos")) return;
    const s = document.createElement("style");
    s.id = "jf-estilos";
    s.textContent = `
      #t-jefes .jf-cabeza { display:flex; gap:10px; flex-wrap:wrap; align-items:center; margin:2px 0 14px; }
      #t-jefes .jf-plantilla { background:linear-gradient(120deg,#efe4ff,#fff1cc); border:1px solid #d9c6f7; color:#4b2a8a; }
      #t-jefes .evento .nom small { font-family:Inter,sans-serif; font-weight:600; font-size:13px; color:var(--suave); margin-left:6px; }
      #t-jefes .etq.jf-ok { background:#dff3e6; color:#1f6b3e; }
      #t-jefes .etq.jf-no { background:#f6e3dc; color:#8a3520; }
      #t-jefes .etq.jf-legend { background:#fff1cc; color:#6d4a0c; }
      #t-jefes .jf-cifras { display:flex; gap:16px; flex-wrap:wrap; margin-top:8px; font-size:13px; color:var(--suave); }
      #t-jefes .jf-cifras b { display:block; font-family:Fraunces,Georgia,serif; font-size:20px; color:var(--noche); line-height:1.1; }
      #t-jefes select optgroup { font-weight:700; }
    `;
    document.head.append(s);
  }

  function armar() {
    const t = $("t-jefes");
    if (!t || armado) return;
    armado = true;
    estilos();
    t.textContent = "";

    const enc = nodo("div", "enc-tarjeta");
    const izq = nodo("div");
    const h2 = nodo("h2", null, "Jefe de la semana ");
    h2.append(nodo("span", "chip", "Administrador"));
    izq.append(h2, nodo("p", "sub", "Un Granito muy fuerte (casi siempre un legendario) aparece a una hora fija en una cafetería. Solo se atrapa si se juntan los jugadores que pide: así la gente va en grupo."));
    const nuevo = nodo("button", "btn oro", "+ Nuevo jefe"); nuevo.type = "button"; nuevo.id = "jf-nuevo";
    nuevo.onclick = () => abrirForm(null);
    enc.append(izq, nuevo);

    const cabeza = nodo("div", "jf-cabeza");
    const plantilla = nodo("button", "btn chico jf-plantilla", "Jefe de la semana: próximo sábado 18:00"); plantilla.type = "button";
    plantilla.onclick = () => abrirForm({ especie: "bourbon", inicio: proximo(6, 18, 0), minutos: 30, jugadores: 3 });
    const recargar = nodo("button", "btn borde chico", "Actualizar"); recargar.type = "button";
    recargar.onclick = () => cargarJefes();
    cabeza.append(plantilla, recargar);

    const filtros = nodo("div", "filtros"); filtros.id = "jf-filtros"; filtros.setAttribute("aria-label", "Filtrar jefes");
    for (const [f, n] of [["prox", "Próximos"], ["curso", "En curso"], ["fin", "Pasados"]]) {
      const b = nodo("button", null, n + " "); b.type = "button"; b.dataset.f = f;
      b.setAttribute("aria-pressed", String(f === filtro));
      b.append(nodo("span"));
      b.onclick = () => { filtro = f; pintar(); };
      filtros.append(b);
    }
    const lista = nodo("div"); lista.id = "jf-lista";
    lista.append(nodo("p", "vacio-estado", "Cargando…"));
    const m = nodo("p", "msg"); m.id = "m-jefes"; m.setAttribute("role", "status");

    t.append(enc, cabeza, filtros, lista, m, armarForm());
  }

  function campo(etiqueta, control, ayuda) {
    const d = nodo("div");
    const l = nodo("label", null, etiqueta); l.htmlFor = control.id;
    d.append(l, control);
    if (ayuda) d.append(ayuda);
    return d;
  }
  function atajos(lista, alTocar) {
    const a = nodo("div", "atajos");
    for (const [texto, valor] of lista) {
      const b = nodo("button", null, texto); b.type = "button";
      b.onclick = () => alTocar(valor);
      a.append(b);
    }
    return a;
  }

  function armarForm() {
    const f = nodo("form", "ev-form oculto"); f.id = "jf-form"; f.noValidate = true;
    f.append(nodo("h3", null, "Nuevo jefe"));
    const g = nodo("div", "grid2");

    const cafe = nodo("select"); cafe.id = "jf-cafe"; cafe.required = true;
    const esp = nodo("select"); esp.id = "jf-especie"; esp.required = true;
    const ini = nodo("input"); ini.id = "jf-inicio"; ini.type = "datetime-local"; ini.required = true;
    const dur = nodo("input"); dur.id = "jf-minutos"; dur.type = "number"; dur.min = "10"; dur.max = "120"; dur.step = "5"; dur.value = "30"; dur.required = true;
    const jug = nodo("input"); jug.id = "jf-jugadores"; jug.type = "number"; jug.min = "2"; jug.max = "10"; jug.value = "3"; jug.required = true;

    g.append(
      campo("Cafetería", cafe, nodo("p", "ayuda", "El jefe aparece sobre esta cafetería. Los jugadores tienen que estar dentro de su radio de check-in (+60 m).")),
      campo("Granito jefe", esp, nodo("p", "ayuda", "Los legendarios (Bourbon y Caranavi) son los jefes de verdad.")),
      campo("Empieza (hora de Bolivia)", ini, atajos([["Hoy 18:00", () => dia(0, 18)], ["Mañana 18:00", () => dia(1, 18)], ["Sábado 18:00", () => proximo(6, 18, 0)], ["Domingo 10:00", () => proximo(0, 10, 0)]],
        (fn) => { ini.value = aInput(fn()); }))
    );
    const durCampo = campo("Duración (minutos)", dur, atajos([["15 min", 15], ["30 min", 30], ["1 hora", 60], ["2 horas", 120]], (v) => { dur.value = String(v); }));
    const jugCampo = campo("Jugadores que hacen falta", jug, atajos([["2", 2], ["3", 3], ["5", 5], ["10", 10]], (v) => { jug.value = String(v); }));
    g.append(durCampo, jugCampo);
    f.append(g);

    const fila = nodo("div", "fila"); fila.style.marginTop = "16px";
    const guardar = nodo("button", "btn", "Programar jefe"); guardar.type = "submit"; guardar.id = "jf-guardar";
    const cancelar = nodo("button", "btn borde", "Cancelar"); cancelar.type = "button";
    cancelar.onclick = cerrarForm;
    fila.append(guardar, cancelar);
    const m = nodo("p", "msg"); m.id = "m-jefe-form"; m.setAttribute("role", "status");
    f.append(fila, m);
    f.addEventListener("submit", (e) => { e.preventDefault(); crear(); });
    return f;
  }

  function llenarSelects() {
    const cafe = $("jf-cafe"), esp = $("jf-especie");
    if (!cafe || !esp) return;
    const cafeAntes = cafe.value, espAntes = esp.value;
    cafe.textContent = "";
    const vacio = nodo("option", null, datos.places.length ? "Elige una cafetería…" : "No hay cafeterías activas"); vacio.value = "";
    cafe.append(vacio);
    for (const p of datos.places) { const o = nodo("option", null, p.name); o.value = p.id; cafe.append(o); }
    if (cafeAntes) cafe.value = cafeAntes;

    esp.textContent = "";
    const grupos = [["Legendarios", (s) => s.legendary], ["Épicos", (s) => !s.legendary && s.rarity === "epica"],
                    ["Raros", (s) => !s.legendary && s.rarity === "rara"], ["Comunes", (s) => !s.legendary && s.rarity === "comun"]];
    for (const [titulo, filtroG] of grupos) {
      const items = datos.species.filter(filtroG);
      if (!items.length) continue;
      const og = document.createElement("optgroup"); og.label = titulo;
      for (const s of items) { const o = nodo("option", null, s.name); o.value = s.id; og.append(o); }
      esp.append(og);
    }
    esp.value = espAntes || "bourbon";
  }

  function abrirForm(p) {
    const f = $("jf-form");
    if (!f) return;
    llenarSelects();
    $("jf-especie").value = (p && p.especie) || $("jf-especie").value || "bourbon";
    $("jf-inicio").value = aInput(p && p.inicio ? p.inicio : hoyOMañana(18));
    $("jf-inicio").min = aInput(Date.now());
    $("jf-minutos").value = String((p && p.minutos) || 30);
    $("jf-jugadores").value = String((p && p.jugadores) || 3);
    msg("m-jefe-form", p ? "Elige la cafetería y revisa la hora. Los jugadores lo ven en el mapa ese mismo día." : "");
    mostrar("jf-form", true);
    f.scrollIntoView({ behavior: "smooth", block: "start" });
    $("jf-cafe").focus({ preventScroll: true });
  }
  function cerrarForm() { mostrar("jf-form", false); msg("m-jefe-form"); }

  async function crear() {
    const cafe = $("jf-cafe").value, especie = $("jf-especie").value;
    const inicio = deInput($("jf-inicio").value);
    const minutos = Math.round(+$("jf-minutos").value), jugadores = Math.round(+$("jf-jugadores").value);
    if (!cafe) { msg("m-jefe-form", "Elige la cafetería.", "error"); $("jf-cafe").focus(); return; }
    if (!especie) { msg("m-jefe-form", "Elige el Granito jefe.", "error"); $("jf-especie").focus(); return; }
    if (isNaN(inicio)) { msg("m-jefe-form", "Elige cuándo empieza.", "error"); $("jf-inicio").focus(); return; }
    if (inicio < Date.now() - 5 * 60e3) { msg("m-jefe-form", "Esa hora ya pasó. Elige una hora futura.", "error"); $("jf-inicio").focus(); return; }
    if (!(minutos >= 10 && minutos <= 120)) { msg("m-jefe-form", "La duración tiene que ser de 10 a 120 minutos.", "error"); $("jf-minutos").focus(); return; }
    if (!(jugadores >= 2 && jugadores <= 10)) { msg("m-jefe-form", "Los jugadores tienen que ser de 2 a 10.", "error"); $("jf-jugadores").focus(); return; }
    const b = $("jf-guardar");
    b.disabled = true;
    msg("m-jefe-form", "Guardando…");
    const { data, error } = await sb.rpc("jefe_admin_create", {
      p_place: cafe, p_species: especie, p_starts: new Date(inicio).toISOString(), p_minutes: minutos, p_min_players: jugadores,
    });
    b.disabled = false;
    if (error) { msg("m-jefe-form", errorTexto(error), "error"); return; }
    if (!data || !data.ok) { msg("m-jefe-form", (data && data.message) || "No se pudo programar el jefe.", "error"); return; }
    cerrarForm();
    filtro = inicio <= Date.now() ? "curso" : "prox";
    msg("m-jefes", data.message || "Jefe programado.", "ok");
    await cargarJefes();
  }

  // ---------------------------------------------------------------- Lista
  function etq(texto, clase, color) {
    const s = nodo("span", "etq" + (clase ? " " + clase : ""));
    if (color) { const i = nodo("i"); i.style.background = color; s.append(i); }
    s.append(texto);
    return s;
  }
  function cifra(valor, texto) {
    const d = nodo("div");
    d.append(nodo("b", null, String(valor)), texto);
    return d;
  }

  function item(r, st, ahora) {
    const caja = nodo("div", "evento");
    caja.style.setProperty("--c", r.legendary ? "#F2B43C" : "#8B5CF6");
    const franja = nodo("div", "franja");
    const cuerpo = nodo("div", "cuerpo");
    const nom = nodo("div", "nom", r.speciesName || r.species);
    nom.append(nodo("small", null, "en " + (r.placeName || "cafetería")));
    const a = Date.parse(r.startsAt), b = Date.parse(r.endsAt);
    const resto = r.cancelledAt ? " · cancelado" : st === "curso" ? ` · quedan ${enCuanto(b - ahora)}` : st === "prox" ? ` · empieza en ${enCuanto(a - ahora)}` : "";
    const cuando = nodo("div", "cuando", `${fechaHora(a)} → ${hora(b)}${resto}`);
    cuerpo.append(nom, cuando);

    const et = nodo("div", "etiquetas");
    if (r.cancelledAt) et.append(etq("Cancelado", "estado-fin"));
    else et.append(etq({ curso: "En curso", prox: "Próximo", fin: "Terminado" }[st], "estado-" + st));
    if (r.legendary) et.append(etq("Legendario", "jf-legend"));
    else if (RZ[r.rarity]) et.append(etq(RZ[r.rarity][0], "", RZ[r.rarity][1]));
    et.append(etq(`Mínimo ${r.minPlayers} jugadores`));
    if (st === "curso") et.append(etq(r.joined >= r.minPlayers ? "¡Desbloqueado!" : `Faltan ${r.minPlayers - r.joined}`, r.joined >= r.minPlayers ? "jf-ok" : ""));
    cuerpo.append(et);

    if (st !== "prox" && !(r.cancelledAt && !r.joined)) {
      const c = nodo("div", "jf-cifras");
      c.append(cifra(r.joined, "se unieron"), cifra(r.attempts, "lo intentaron"), cifra(r.caught, "lo atraparon"));
      if (st === "fin" && !r.cancelledAt) {
        const ok = r.joined >= r.minPlayers;
        et.append(etq(ok ? "Se juntaron los jugadores" : "No se juntaron los jugadores", ok ? "jf-ok" : "jf-no"));
      }
      cuerpo.append(c);
    }

    const acc = nodo("div", "acciones");
    if (!r.cancelledAt && st !== "fin") {
      const cancelar = nodo("button", "btn peligro chico", "Cancelar"); cancelar.type = "button";
      cancelar.onclick = () => dosToques(cancelar, "¿Cancelar? Toca otra vez", () => cancelarJefe(r, cancelar));
      acc.append(cancelar);
    } else {
      const otra = nodo("button", "btn borde chico", "Repetir"); otra.type = "button";
      otra.title = "Programar otro igual el próximo sábado";
      otra.onclick = () => {
        abrirForm({ especie: r.species, inicio: proximo(6, 18, 0), minutos: Math.round((b - a) / 60000), jugadores: r.minPlayers });
        if ($("jf-cafe").querySelector(`option[value="${CSS.escape(r.placeId)}"]`)) $("jf-cafe").value = r.placeId;
      };
      acc.append(otra);
    }
    caja.append(franja, cuerpo, acc);
    return caja;
  }

  async function cancelarJefe(r, boton) {
    boton.disabled = true;
    const { data, error } = await sb.rpc("jefe_admin_cancel", { p_raid: r.id });
    if (error) { msg("m-jefes", errorTexto(error), "error"); boton.disabled = false; return; }
    if (!data || !data.ok) { msg("m-jefes", (data && data.message) || "No se pudo cancelar.", "error"); boton.disabled = false; return; }
    msg("m-jefes", `Se canceló el jefe ${r.speciesName || r.species} de ${r.placeName}.`, "ok");
    await cargarJefes();
  }

  function pintar() {
    const lista = $("jf-lista");
    if (!lista) return;
    const ahora = Date.now();
    const grupos = { prox: [], curso: [], fin: [] };
    for (const r of datos.raids) grupos[estado(r, ahora)].push(r);
    grupos.prox.sort((x, y) => Date.parse(x.startsAt) - Date.parse(y.startsAt));
    grupos.curso.sort((x, y) => Date.parse(x.endsAt) - Date.parse(y.endsAt));
    for (const b of $("jf-filtros").querySelectorAll("button")) {
      b.setAttribute("aria-pressed", String(b.dataset.f === filtro));
      b.querySelector("span").textContent = `(${grupos[b.dataset.f].length})`;
    }
    lista.textContent = "";
    const items = grupos[filtro];
    if (!items.length) {
      lista.append(nodo("p", "vacio-estado", {
        prox: "No hay jefes programados. Prueba con «Jefe de la semana: próximo sábado 18:00».",
        curso: "No hay ningún jefe en este momento.",
        fin: "Todavía no pasó ningún jefe.",
      }[filtro]));
      return;
    }
    for (const r of items) lista.append(item(r, filtro, ahora));
  }

  async function cargarJefes() {
    if (typeof esAdmin !== "undefined" && !esAdmin) { mostrar("t-jefes", false); return; }
    if (!$("t-jefes")) return;
    armar();
    mostrar("t-jefes", true);
    if (cargando) return;
    cargando = true;
    try {
      const { data, error } = await sb.rpc("jefe_admin_list");
      if (error) { $("jf-lista").textContent = ""; msg("m-jefes", errorTexto(error), "error"); return; }
      if (!data || !data.ok) { $("jf-lista").textContent = ""; msg("m-jefes", (data && data.message) || "No se pudo cargar a los jefes.", "error"); return; }
      datos = { raids: data.raids || [], places: data.places || [], species: data.species || [] };
      if (!$("m-jefes").classList.contains("ok")) msg("m-jefes");
      llenarSelects();
      pintar();
    } finally {
      cargando = false;
    }
  }

  // El "quedan / empieza en" se mueve solo mientras la página está abierta
  setInterval(() => { if (armado && !document.hidden && $("t-jefes") && !$("t-jefes").classList.contains("oculto")) pintar(); }, 60000);

  window.cargarJefes = cargarJefes;
})();
