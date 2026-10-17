// Rutas del café (sección Desarrollador del panel, solo administradores).
// Inspiradas en la Tarija Coffee Week: una ruta de 3 a 8 cafeterías con fecha y hora de inicio y fin.
// Quien hace check-in en todas dentro de las fechas reclama en el juego un Granito exclusivo, XP y una insignia.
// Necesita el PASO 14 (PEGAR_EN_SUPABASE_14.sql). Todo pasa por funciones del servidor que revisan que seas administrador.
// Usa las globales del panel: sb, $, mostrar, msg, textoError, dosToques y esAdmin.
// Las fechas se escriben y se muestran en hora de Bolivia (UTC−4, sin horario de verano).
(function () {
  "use strict";

  const XP_DEFECTO = 2000, INSIGNIA_DEFECTO = "Ruta del café", MIN_CAFES = 3, MAX_CAFES = 8;
  const RAREZAS = { comun: ["Común", "#c9b48d"], rara: ["Rara", "#4fd1c5"], epica: ["Épica", "#c590ff"] };
  const FALTA_PASO = "Falta actualizar el servidor: ejecuta PEGAR_EN_SUPABASE_14.sql en Supabase.";

  let rutas = [], filtro = "curso", editando = null, elegidas = [], lugares = [], especies = [], armado = false, cargando = false, otraVez = false;

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

  // Hora de Bolivia (UTC−4 fija)
  const BO = 4 * 36e5;
  const aInput = (fecha) => new Date(fecha.getTime() - BO).toISOString().slice(0, 16);
  const deInput = (v) => (v ? new Date(v + ":00-04:00") : new Date(NaN));
  const fechaHora = (iso) => new Date(iso).toLocaleString("es-BO", { timeZone: "America/La_Paz", weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
  const diaMes = (d) => d.toLocaleDateString("es-BO", { timeZone: "America/La_Paz", day: "numeric", month: "long" });
  function rango(iniIso, finIso) {   // "Del 20 al 26 de octubre" (como en el juego)
    const a = new Date(iniIso), b = new Date(finIso);
    const pa = new Date(a.getTime() - BO), pb = new Date(b.getTime() - BO);
    if (pa.getUTCFullYear() === pb.getUTCFullYear() && pa.getUTCMonth() === pb.getUTCMonth()) {
      if (pa.getUTCDate() === pb.getUTCDate()) return "El " + diaMes(a);
      return `Del ${pa.getUTCDate()} al ${diaMes(b)}`;
    }
    return `Del ${diaMes(a)} al ${diaMes(b)}`;
  }
  function duracion(ms) {
    const h = Math.round(ms / 36e5);
    if (h < 1) return "menos de una hora";
    if (h < 48) return h === 1 ? "1 hora" : h + " horas";
    return Math.round(h / 24) + " días";
  }
  function estado(r, ahora = Date.now()) {
    return ahora < Date.parse(r.starts_at) ? "prox" : ahora >= Date.parse(r.ends_at) ? "fin" : "curso";
  }
  function proximoLunes8() {   // próximo lunes a las 08:00 de Bolivia
    const hoy = new Date(Date.now() - BO);
    const dias = ((8 - hoy.getUTCDay()) % 7) || 7;
    return new Date(Date.UTC(hoy.getUTCFullYear(), hoy.getUTCMonth(), hoy.getUTCDate() + dias, 8, 0) + BO);
  }
  const especie = (id) => especies.find((e) => e.id === id);
  const nombreEspecie = (id) => (especie(id) || {}).name || id;

  function etiqueta(texto, clase, color) {
    const s = crear("span", "etq" + (clase ? " " + clase : ""));
    if (color) { const i = crear("i"); i.style.background = color; s.append(i); }
    s.append(texto);
    return s;
  }

  // ---------------------------------------------------------------- Estructura (se arma una sola vez)
  function armar() {
    if (armado) return true;
    const ancla = $("rutas-anchor");
    if (!ancla) return false;
    armado = true;

    const css = crear("style");
    css.textContent = `
      .rt-orden { list-style: none; margin: 6px 0 0; padding: 0; display: grid; gap: 6px; }
      .rt-orden li { display: flex; align-items: center; gap: 8px; background: #fff; border: 1px solid var(--linea); border-radius: 10px; padding: 6px 8px 6px 10px; }
      .rt-orden .n { width: 26px; height: 26px; border-radius: 50%; background: var(--noche); color: var(--crema); display: grid; place-items: center; font-size: 13px; font-weight: 700; flex: none; }
      .rt-orden .nom { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-weight: 600; }
      .rt-orden .btn.chico { min-height: 32px; padding: 4px 10px; }
      .rt-agregar { display: flex; gap: 8px; flex-wrap: wrap; margin-top: 8px; }
      .rt-agregar select { flex: 1; min-width: 200px; }
      .rt-cifras { display: flex; gap: 16px; flex-wrap: wrap; margin-top: 8px; font-size: 13px; color: var(--suave); }
      .rt-cifras b { display: block; font-family: Fraunces, Georgia, serif; font-size: 22px; color: var(--noche); line-height: 1.1; }
      .rt-cafes { font-size: 13px; color: var(--suave); margin: 6px 0 0; overflow-wrap: anywhere; }
      .rt-cafes .oculta { color: var(--error); font-weight: 600; }
      .rt-previa { background: #172c45; color: #f7f1e6; border-radius: 12px; padding: 14px 16px; margin-top: 16px; display: grid; gap: 4px; }
      .rt-previa .rotulo { font-size: 12px; font-weight: 600; color: #b9c4d3; letter-spacing: .3px; }
      .rt-previa .t { font-family: Fraunces, Georgia, serif; font-size: 20px; font-weight: 700; color: #fff; overflow-wrap: anywhere; }
      .rt-previa .d { font-size: 14px; color: #d8e0ea; }
      .rt-previa .p { font-size: 14px; color: #ffd27c; font-weight: 600; }
    `;
    document.head.append(css);

    const t = crear("div", "tarjeta");
    t.id = "t-rutas";
    t.innerHTML = `
      <div class="enc-tarjeta">
        <div>
          <h2>Rutas del café</h2>
          <p class="sub">Como la Tarija Coffee Week: elige de 3 a 8 cafeterías y las fechas. Quien hace check-in en todas antes del cierre gana un Granito exclusivo (también legendarios), XP y una insignia.</p>
        </div>
        <button class="btn oro" type="button" id="rt-nueva">+ Nueva ruta</button>
      </div>
      <div class="filtros" id="rt-filtros" aria-label="Filtrar rutas">
        <button type="button" data-f="curso" aria-pressed="true">En curso <span></span></button>
        <button type="button" data-f="prox" aria-pressed="false">Próximas <span></span></button>
        <button type="button" data-f="fin" aria-pressed="false">Terminadas <span></span></button>
      </div>
      <div id="rt-lista"><p class="vacio-estado">Cargando…</p></div>
      <p class="msg" id="m-rutas" role="status"></p>

      <form id="f-ruta" class="ev-form oculto" novalidate>
        <h3 id="rt-titulo-form">Nueva ruta</h3>
        <label>Empezar desde una idea</label>
        <div class="atajos"><button type="button" id="rt-plantilla">Ruta del café — 7 días desde el próximo lunes</button></div>
        <div class="grid2">
          <div>
            <label for="rt-nombre">Nombre <span class="contador" id="rt-cont-nombre">0/60</span></label>
            <input id="rt-nombre" type="text" maxlength="60" required placeholder="Ruta del café de octubre">
          </div>
          <div>
            <label for="rt-desc">Descripción corta <span class="contador" id="rt-cont-desc">0/200</span></label>
            <input id="rt-desc" type="text" maxlength="200" placeholder="Visita las 5 cafeterías y gana un Granito legendario.">
          </div>
          <div>
            <label for="rt-inicio">Empieza (hora de Bolivia)</label>
            <input id="rt-inicio" type="datetime-local" required>
            <div class="atajos"><button type="button" data-rt-ini="ahora">Ahora</button><button type="button" data-rt-ini="lunes">Próximo lunes 8:00</button></div>
          </div>
          <div>
            <label for="rt-fin">Termina (hora de Bolivia)</label>
            <input id="rt-fin" type="datetime-local" required>
            <div class="atajos"><button type="button" data-rt-dur="3">3 días</button><button type="button" data-rt-dur="7">1 semana</button><button type="button" data-rt-dur="14">2 semanas</button></div>
          </div>
        </div>

        <label>Cafeterías, en el orden sugerido <span class="contador" id="rt-cont-cafes">0/8</span></label>
        <p class="ayuda" id="rt-ayuda-cafes">De 3 a 8 cafeterías visibles. El orden es solo una sugerencia: vale hacer check-in en cualquier orden.</p>
        <ol class="rt-orden" id="rt-orden"></ol>
        <div class="rt-agregar">
          <select id="rt-cafe" aria-label="Cafetería para agregar"></select>
          <button class="btn borde" type="button" id="rt-agregar">Agregar</button>
        </div>

        <div class="grid2">
          <div>
            <label for="rt-especie">Granito de premio</label>
            <select id="rt-especie"></select>
            <p class="ayuda">Se guarda igual que una captura: suma en la Granidex y da tostados. Los legendarios nunca salen en el mapa.</p>
          </div>
          <div>
            <label for="rt-xp">XP de premio</label>
            <input id="rt-xp" type="number" min="0" max="20000" step="100" value="2000">
            <div class="atajos"><button type="button" data-rt-xp="1000">1.000</button><button type="button" data-rt-xp="2000">2.000</button><button type="button" data-rt-xp="5000">5.000</button></div>
            <p class="ayuda">Si hay un evento de XP extra cuando lo reclaman, también se multiplica.</p>
          </div>
          <div>
            <label for="rt-insignia">Insignia <span class="contador" id="rt-cont-insignia">0/40</span></label>
            <input id="rt-insignia" type="text" maxlength="40" placeholder="Ruta del café">
          </div>
        </div>

        <div class="rt-previa" aria-live="polite">
          <span class="rotulo">ASÍ SE VE EN EL JUEGO</span>
          <span class="t" id="rt-previa-t">Nombre de la ruta</span>
          <span class="d" id="rt-previa-d"></span>
          <span class="p" id="rt-previa-p"></span>
        </div>

        <div class="fila" style="margin-top:16px">
          <button class="btn" type="submit" id="rt-guardar">Crear ruta</button>
          <button class="btn borde" type="button" id="rt-cancelar">Cancelar</button>
        </div>
        <p class="msg" id="m-ruta" role="status"></p>
      </form>`;
    ancla.append(t);

    $("rt-nueva").onclick = () => abrirForm(null);
    $("rt-cancelar").onclick = cerrarForm;
    $("rt-plantilla").onclick = plantilla;
    $("rt-agregar").onclick = agregarCafe;
    $("rt-filtros").addEventListener("click", (e) => {
      const b = e.target.closest("button"); if (!b) return;
      filtro = b.dataset.f; pintar();
    });
    for (const id of ["rt-nombre", "rt-desc", "rt-insignia", "rt-xp", "rt-inicio", "rt-fin"]) $(id).addEventListener("input", previa);
    $("rt-especie").addEventListener("change", previa);
    $("f-ruta").addEventListener("click", (e) => {
      const b = e.target.closest("button[data-rt-ini], button[data-rt-dur], button[data-rt-xp]"); if (!b) return;
      if (b.dataset.rtIni) {
        const d = b.dataset.rtIni === "lunes" ? proximoLunes8() : new Date();
        d.setSeconds(0, 0);
        $("rt-inicio").value = aInput(d);
      } else if (b.dataset.rtDur) {
        const ini = deInput($("rt-inicio").value);
        const base = isNaN(ini) ? new Date() : ini;
        $("rt-fin").value = aInput(new Date(base.getTime() + +b.dataset.rtDur * 864e5));
      } else $("rt-xp").value = b.dataset.rtXp;
      previa();
    });
    $("f-ruta").addEventListener("submit", guardar);
    return true;
  }

  // ---------------------------------------------------------------- Cargar
  async function cargarRutas() {
    if (typeof esAdmin !== "undefined" && !esAdmin) return;
    if (!armar()) return;
    if (cargando) { otraVez = true; return; }   // se vuelve a cargar al terminar la carga en curso
    cargando = true;
    otraVez = false;
    try {
      const [rr, rl, re] = await Promise.all([
        sb.rpc("admin_routes"),
        sb.from("places").select("id,name,active").eq("active", true).order("name"),
        especies.length ? Promise.resolve({ data: especies }) : sb.from("species_catalog").select("id,num,name,rarity,legendary").order("num"),
      ]);
      if (!rl.error) lugares = rl.data || [];
      if (!re.error && re.data && re.data.length) especies = re.data;
      else if (!especies.length && typeof ESPECIES !== "undefined")
        especies = ESPECIES.map(([id, name, rarity], i) => ({ id, num: i + 1, name, rarity, legendary: id === "bourbon" || id === "caranavi" }));
      llenarEspecies();
      if (rr.error) { $("rt-lista").innerHTML = ""; msg("m-rutas", error(rr.error), "error"); return; }
      if (!rr.data || !rr.data.ok) { $("rt-lista").innerHTML = ""; msg("m-rutas", (rr.data && rr.data.message) || "No se pudieron cargar las rutas.", "error"); return; }
      rutas = rr.data.routes || [];
      pintar();
    } catch (e) {
      msg("m-rutas", error(e), "error");
    } finally {
      cargando = false;
      if (otraVez) cargarRutas();
    }
  }

  // ---------------------------------------------------------------- Lista
  function pintar() {
    const ahora = Date.now();
    const grupos = { curso: [], prox: [], fin: [] };
    for (const r of rutas) grupos[estado(r, ahora)].push(r);
    grupos.prox.sort((a, b) => Date.parse(a.starts_at) - Date.parse(b.starts_at));
    grupos.curso.sort((a, b) => Date.parse(a.ends_at) - Date.parse(b.ends_at));
    for (const b of $("rt-filtros").querySelectorAll("button")) {
      b.setAttribute("aria-pressed", String(b.dataset.f === filtro));
      b.querySelector("span").textContent = `(${grupos[b.dataset.f].length})`;
    }
    const lista = $("rt-lista");
    lista.innerHTML = "";
    const items = grupos[filtro];
    if (!items.length) {
      lista.append(crear("p", "vacio-estado", { curso: "No hay ninguna ruta en curso.", prox: "No hay rutas programadas.", fin: "Todavía no terminó ninguna ruta." }[filtro]));
      return;
    }
    for (const r of items) lista.append(itemRuta(r, filtro, ahora));
  }

  function itemRuta(r, est, ahora) {
    const caja = crear("div", "evento");
    caja.style.setProperty("--c", est === "curso" ? "#2f9e5b" : est === "prox" ? "#1f4e79" : "#b9b0a0");
    const cuerpo = crear("div", "cuerpo");
    cuerpo.append(crear("div", "nom", r.name));
    const resto = est === "curso" ? ` · quedan ${duracion(Date.parse(r.ends_at) - ahora)}`
      : est === "prox" ? ` · empieza en ${duracion(Date.parse(r.starts_at) - ahora)}` : "";
    cuerpo.append(crear("div", "cuando", `${fechaHora(r.starts_at)} → ${fechaHora(r.ends_at)}${resto}`));
    if (r.description) cuerpo.append(crear("p", "desc", r.description));

    const et = crear("div", "etiquetas");
    et.append(etiqueta({ curso: "En curso", prox: "Próxima", fin: "Terminada" }[est], "estado-" + est));
    const e = especie(r.species);
    et.append(etiqueta("Premio: " + nombreEspecie(r.species) + (e && e.legendary ? " (legendario)" : ""), "", e ? RAREZAS[e.rarity][1] : null));
    if (+r.xp > 0) et.append(etiqueta(`+${Number(r.xp).toLocaleString("es-BO")} XP`, "xp"));
    et.append(etiqueta("Insignia: " + r.badge));
    cuerpo.append(et);

    const cafes = crear("p", "rt-cafes");
    (r.places || []).forEach((p, i) => {
      if (i) cafes.append(" → ");
      const s = crear("span", p.active ? "" : "oculta", `${i + 1}. ${p.name}${p.active ? "" : " (oculta: no cuenta)"}`);
      cafes.append(s);
    });
    cuerpo.append(cafes);

    const cifras = crear("div", "rt-cifras");
    for (const [n, t] of [[r.started, "empezaron"], [r.completed, "completaron"], [r.claimed, "cobraron el premio"]]) {
      const d = crear("div"); d.append(crear("b", "", String(n || 0)), t); cifras.append(d);
    }
    cuerpo.append(cifras);

    const acc = crear("div", "acciones");
    acc.append(boton("Editar", "borde chico", () => abrirForm(r)));
    if (est === "curso") {
      const term = boton("Terminar ahora", "borde chico");
      term.onclick = () => dosToques(term, "¿Terminar? Toca otra vez", async () => {
        term.disabled = true;
        const { data, error: err } = await sb.rpc("admin_route_end", { p_route: r.id });
        if (err || !data || !data.ok) { msg("m-rutas", err ? error(err) : (data && data.message) || "No se pudo terminar.", "error"); term.disabled = false; return; }
        msg("m-rutas", `"${r.name}" terminó. Quien ya la completó puede reclamar durante 7 días.`, "ok");
        cargarRutas();
      });
      acc.append(term);
    }
    const borrar = boton("Borrar", "peligro chico");
    borrar.onclick = () => dosToques(borrar, "¿Borrar? Toca otra vez", async () => {
      borrar.disabled = true;
      const { data, error: err } = await sb.rpc("admin_route_delete", { p_route: r.id });
      if (err || !data || !data.ok) { msg("m-rutas", err ? error(err) : (data && data.message) || "No se pudo borrar.", "error"); borrar.disabled = false; return; }
      msg("m-rutas", `"${r.name}" se borró. Quien ya cobró se queda con su Granito y su insignia.`, "ok");
      if (editando && editando.id === r.id) cerrarForm();
      cargarRutas();
    });
    acc.append(borrar);
    caja.append(crear("div", "franja"), cuerpo, acc);
    return caja;
  }

  // ---------------------------------------------------------------- Formulario
  function llenarEspecies() {
    const sel = $("rt-especie");
    if (!sel || sel.options.length || !especies.length) return;
    const grupos = [["comun", false, "Comunes"], ["rara", false, "Raras"], ["epica", false, "Épicas"], [null, true, "Legendarios (nunca salen en el mapa)"]];
    for (const [rz, leg, titulo] of grupos) {
      const og = crear("optgroup"); og.label = titulo;
      for (const e of especies.filter((x) => (leg ? x.legendary : !x.legendary && x.rarity === rz))) {
        const o = crear("option", "", `#${String(e.num).padStart(2, "0")} ${e.name}`); o.value = e.id; og.append(o);
      }
      if (og.children.length) sel.append(og);
    }
  }

  function bloqueado() { return !!(editando && +editando.claimed > 0); }

  function pintarCafes() {
    const ol = $("rt-orden");
    ol.innerHTML = "";
    const bloq = bloqueado();
    elegidas.forEach((c, i) => {
      const li = crear("li");
      li.append(crear("span", "n", String(i + 1)), crear("span", "nom", c.name + (c.active === false ? " (oculta)" : "")));
      const sube = boton("↑", "borde chico", () => mover(i, -1)); sube.disabled = i === 0; sube.setAttribute("aria-label", "Subir " + c.name);
      const baja = boton("↓", "borde chico", () => mover(i, 1)); baja.disabled = i === elegidas.length - 1; baja.setAttribute("aria-label", "Bajar " + c.name);
      const quita = boton("✕", "peligro chico", () => { elegidas.splice(i, 1); pintarCafes(); previa(); });
      quita.disabled = bloq; quita.setAttribute("aria-label", "Quitar " + c.name);
      li.append(sube, baja, quita);
      ol.append(li);
    });
    if (!elegidas.length) ol.append(crear("li", "", "Todavía no elegiste cafeterías."));
    $("rt-cont-cafes").textContent = `${elegidas.length}/${MAX_CAFES}`;

    const sel = $("rt-cafe");
    sel.innerHTML = "";
    const libres = lugares.filter((l) => !elegidas.some((c) => c.id === l.id));
    const o0 = crear("option", "", libres.length ? "Elige una cafetería…" : "No quedan cafeterías visibles"); o0.value = ""; sel.append(o0);
    for (const l of libres) { const o = crear("option", "", l.name); o.value = l.id; sel.append(o); }
    const lleno = elegidas.length >= MAX_CAFES;
    sel.disabled = bloq || lleno || !libres.length;
    $("rt-agregar").disabled = sel.disabled;
    $("rt-ayuda-cafes").textContent = bloq
      ? `Ya hay ${editando.claimed} ${+editando.claimed === 1 ? "jugador que cobró" : "jugadores que cobraron"} el premio: puedes cambiar el orden, pero no las cafeterías ni el Granito.`
      : lleno ? "Ya tienes 8 cafeterías (el máximo)." : "De 3 a 8 cafeterías visibles. El orden es solo una sugerencia: vale hacer check-in en cualquier orden.";
  }

  function mover(i, paso) {
    const j = i + paso;
    if (j < 0 || j >= elegidas.length) return;
    [elegidas[i], elegidas[j]] = [elegidas[j], elegidas[i]];
    pintarCafes();
  }

  function agregarCafe() {
    const id = $("rt-cafe").value;
    if (!id || elegidas.length >= MAX_CAFES) return;
    const l = lugares.find((x) => x.id === id);
    if (l) elegidas.push({ id: l.id, name: l.name, active: true });
    pintarCafes();
    previa();
  }

  function previa() {
    const n = $("rt-nombre").value.trim();
    $("rt-cont-nombre").textContent = `${$("rt-nombre").value.length}/60`;
    $("rt-cont-desc").textContent = `${$("rt-desc").value.length}/200`;
    $("rt-cont-insignia").textContent = `${$("rt-insignia").value.length}/40`;
    $("rt-previa-t").textContent = n || "Nombre de la ruta";
    const ini = deInput($("rt-inicio").value), fin = deInput($("rt-fin").value);
    const fechas = isNaN(ini) || isNaN(fin) ? "Elige las fechas" : rango(ini.toISOString(), fin.toISOString());
    $("rt-previa-d").textContent = `${fechas} · ${elegidas.length} ${elegidas.length === 1 ? "cafetería" : "cafeterías"}`;
    const xp = Math.max(0, Math.round(+$("rt-xp").value || 0));
    const sp = $("rt-especie").value;
    $("rt-previa-p").textContent = `Premio: ${sp ? nombreEspecie(sp) : "un Granito"}${xp ? ` + ${xp.toLocaleString("es-BO")} XP` : ""} · insignia «${$("rt-insignia").value.trim() || INSIGNIA_DEFECTO}»`;
  }

  function plantilla() {
    const ini = proximoLunes8();
    const fin = new Date(ini.getTime() + 6 * 864e5 + 14 * 36e5);   // domingo a las 22:00
    $("rt-nombre").value = "Ruta del café";
    $("rt-desc").value = "Visita todas las cafeterías de la ruta esta semana y gana un Granito legendario.";
    $("rt-inicio").value = aInput(ini);
    $("rt-fin").value = aInput(fin);
    $("rt-xp").value = String(XP_DEFECTO);
    $("rt-insignia").value = INSIGNIA_DEFECTO;
    if (!bloqueado() && especie("caranavi")) $("rt-especie").value = "caranavi";
    previa();
    if (elegidas.length < MIN_CAFES) msg("m-ruta", "Ahora elige de 3 a 8 cafeterías.", "");
  }

  function abrirForm(r) {
    editando = r || null;
    llenarEspecies();
    $("rt-titulo-form").textContent = r ? "Editar ruta" : "Nueva ruta";
    $("rt-guardar").textContent = r ? "Guardar cambios" : "Crear ruta";
    if (r) {
      $("rt-nombre").value = r.name || "";
      $("rt-desc").value = r.description || "";
      $("rt-inicio").value = aInput(new Date(r.starts_at));
      $("rt-fin").value = aInput(new Date(r.ends_at));
      $("rt-xp").value = String(r.xp);
      $("rt-insignia").value = r.badge || "";
      $("rt-especie").value = r.species;
      elegidas = (r.places || []).map((p) => ({ id: p.id, name: p.name, active: p.active }));
    } else {
      $("f-ruta").reset();
      const ini = new Date(); ini.setSeconds(0, 0);
      $("rt-inicio").value = aInput(ini);
      $("rt-fin").value = aInput(new Date(ini.getTime() + 7 * 864e5));
      $("rt-xp").value = String(XP_DEFECTO);
      $("rt-insignia").value = INSIGNIA_DEFECTO;
      if (especie("caranavi")) $("rt-especie").value = "caranavi";
      elegidas = [];
    }
    $("rt-especie").disabled = bloqueado();
    pintarCafes();
    previa();
    msg("m-ruta");
    mostrar("f-ruta", true);
    $("f-ruta").scrollIntoView({ behavior: "smooth", block: "start" });
    $("rt-nombre").focus({ preventScroll: true });
  }

  function cerrarForm() { editando = null; elegidas = []; mostrar("f-ruta", false); msg("m-ruta"); }

  async function guardar(ev) {
    ev.preventDefault();
    const nombre = $("rt-nombre").value.trim();
    const ini = deInput($("rt-inicio").value), fin = deInput($("rt-fin").value);
    const xp = Math.round(+$("rt-xp").value);
    if (nombre.length < 3) { msg("m-ruta", "Ponle un nombre a la ruta (mínimo 3 letras).", "error"); $("rt-nombre").focus(); return; }
    if (isNaN(ini) || isNaN(fin)) { msg("m-ruta", "Elige cuándo empieza y cuándo termina.", "error"); return; }
    if (fin <= ini) { msg("m-ruta", "La ruta tiene que terminar después de empezar.", "error"); $("rt-fin").focus(); return; }
    if (!editando && fin <= new Date()) { msg("m-ruta", "Esa fecha de fin ya pasó. Elige una fecha futura.", "error"); $("rt-fin").focus(); return; }
    if (elegidas.length < MIN_CAFES || elegidas.length > MAX_CAFES) { msg("m-ruta", "Elige entre 3 y 8 cafeterías.", "error"); $("rt-cafe").focus(); return; }
    if (!$("rt-especie").value) { msg("m-ruta", "Elige el Granito de premio.", "error"); return; }
    if (!Number.isFinite(xp) || xp < 0 || xp > 20000) { msg("m-ruta", "La XP del premio va de 0 a 20.000.", "error"); $("rt-xp").focus(); return; }

    const eraEdicion = !!editando;
    $("rt-guardar").disabled = true;
    msg("m-ruta", "Guardando…");
    const { data, error: err } = await sb.rpc("admin_route_save", {
      p_route: editando ? editando.id : null,
      p_name: nombre,
      p_description: $("rt-desc").value.trim() || null,
      p_starts: ini.toISOString(),
      p_ends: fin.toISOString(),
      p_places: elegidas.map((c) => c.id),
      p_species: $("rt-especie").value,
      p_xp: xp,
      p_badge: $("rt-insignia").value.trim() || null,
    });
    $("rt-guardar").disabled = false;
    if (err) { msg("m-ruta", error(err), "error"); return; }
    if (!data || !data.ok) { msg("m-ruta", (data && data.message) || "No se pudo guardar la ruta.", "error"); return; }
    const st = estado({ starts_at: ini.toISOString(), ends_at: fin.toISOString() });
    filtro = st;
    cerrarForm();
    msg("m-rutas", eraEdicion ? "Cambios guardados." : st === "curso" ? `"${nombre}" ya está activa: los jugadores la ven en el juego.` : `"${nombre}" quedó programada: los jugadores la ven 7 días antes.`, "ok");
    cargarRutas();
  }

  // ---------------------------------------------------------------- Arranque
  window.cargarRutas = cargarRutas;
  // Por si la sesión de administrador ya se cargó antes que este archivo
  if (typeof esAdmin !== "undefined" && esAdmin) cargarRutas();
})();
