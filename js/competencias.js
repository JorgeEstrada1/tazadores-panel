// Competencias de minijuegos (PASO 12 en Supabase, migración 0017):
// - Campeón del mes: el dueño pone un premio y, al terminar el mes, el #1 de cada juego lo gana.
// - Torneo de fin de semana: un juego, un horario y un premio para el #1.
// - Ganadores anteriores y si ya canjearon su premio.
// Los premios llegan solos a "Mis cupones" del ganador y se canjean con el mismo formulario de cupones.
// Usa lo que ya define index.html: sb, $, msg, textoError, dosToques, actual, esAdmin.
(function () {
  "use strict";

  const JUEGOS = { espresso: "Espresso perfecto", granos: "Lluvia de granos", barista: "Barista rápido", latte: "Arte latte", cata: "Cata a ciegas" };
  const ZONA = "America/La_Paz";
  const OFFSET = "-04:00";            // Bolivia no tiene horario de verano
  const SIN_SERVIDOR = /Could not find the function|PGRST202/i;

  let datos = null;                   // última respuesta de cmp_place_admin
  let desfase = 0;                    // reloj del servidor - reloj del navegador (ms)
  let reloj = null;
  let raiz = null;

  // ------------------------------------------------------------------ utilidades
  function el(tag, clase, texto) {
    const e = document.createElement(tag);
    if (clase) e.className = clase;
    if (texto !== undefined && texto !== null) e.textContent = texto;
    return e;
  }
  const num = (n) => Number(n || 0).toLocaleString("es-BO");
  const ahora = () => Date.now() + desfase;
  // "2026-10-24T00:00" (hora de Bolivia) -> "2026-10-24T00:00:00-04:00"
  const conZona = (v) => (v.length === 16 ? v + ":00" : v) + OFFSET;
  function fecha(epoch, conDia) {
    return new Date(epoch * 1000).toLocaleString("es-BO", {
      timeZone: ZONA, weekday: conDia ? "short" : undefined, day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit",
    });
  }
  function soloFecha(epoch) {
    return new Date(epoch * 1000).toLocaleDateString("es-BO", { timeZone: ZONA, day: "2-digit", month: "2-digit" });
  }
  // Valor para <input type="datetime-local"> en hora de Bolivia
  function aInput(epoch) {
    return new Date((epoch * 1000) - 4 * 3600 * 1000).toISOString().slice(0, 16);
  }
  // "Termina en 1 d 4 h" / "Empieza en 3 h 20 min"
  function falta(epoch) {
    let s = Math.max(0, Math.round((epoch * 1000 - ahora()) / 1000));
    const d = Math.floor(s / 86400); s -= d * 86400;
    const h = Math.floor(s / 3600); s -= h * 3600;
    const m = Math.floor(s / 60);
    if (d > 0) return `${d} d ${h} h`;
    if (h > 0) return `${h} h ${m} min`;
    return m > 0 ? `${m} min` : "menos de 1 min";
  }

  function estilos() {
    if (document.getElementById("cmp-estilos")) return;
    const s = el("style");
    s.id = "cmp-estilos";
    s.textContent = `
      .cmp-bloque { border-top: 1px solid var(--linea); margin-top: 18px; padding-top: 14px; }
      .cmp-bloque:first-of-type { border-top: 0; margin-top: 0; padding-top: 0; }
      .cmp-fila { display: flex; gap: 12px; flex-wrap: wrap; align-items: flex-end; }
      .cmp-fila .crece { flex: 1; min-width: 220px; }
      .cmp-fila label { margin-top: 10px; }
      .cmp-torneo { background: linear-gradient(120deg, #fff4dc, #fffdf8); border: 1px solid #f0d89c; border-radius: 12px; padding: 14px 16px; }
      .cmp-torneo .premio { font-family: Fraunces, Georgia, serif; font-size: 20px; color: var(--noche); margin: 4px 0 2px; overflow-wrap: anywhere; }
      .cmp-torneo .cuando { font-size: 14px; color: var(--suave); }
      .cmp-torneo .cuenta { font-weight: 700; color: #8a5a10; }
      .cmp-acciones { display: flex; gap: 8px; flex-wrap: wrap; margin-top: 10px; }
      .cmp-estado { font-size: 12px; font-weight: 600; padding: 2px 8px; border-radius: 99px; white-space: nowrap; }
      .cmp-estado.si { background: #dff3e6; color: #1f6b3e; }
      .cmp-estado.no { background: #fff1cc; color: #6d4a0c; }
      .cmp-estado.borrado { background: #eee6d6; color: var(--suave); }
      table.mt td.cmp-premio { max-width: 220px; overflow-wrap: anywhere; }
    `;
    document.head.append(s);
  }

  function construir() {
    raiz = $("cmp-competencias");
    if (!raiz) return false;
    if (raiz.dataset.listo) return true;
    raiz.dataset.listo = "1";
    estilos();
    // El consejo de la tarjeta Minijuegos ya no hace falta: ahora el premio se configura aquí
    const idea = document.querySelector("#mj-datos > p.ayuda");
    if (idea && /campeón del mes/i.test(idea.textContent)) idea.classList.add("oculto");

    raiz.innerHTML = `
      <div class="tarjeta" id="cmp-tarjeta">
        <h2>Competencias</h2>
        <p class="sub">Premios para los mejores jugadores de tus minijuegos. El ganador recibe su premio en la app (Menú → Mis cupones) y tú lo canjeas con su código, como cualquier cupón.</p>
        <p class="vacio-estado oculto" id="cmp-pronto"></p>
        <div id="cmp-cuerpo">
          <div class="cmp-bloque">
            <h3>Campeón del mes</h3>
            <p class="ayuda" style="margin:0 0 4px">Cuando termina el mes, el #1 de cada uno de los 5 juegos gana este premio. Cuenta su mejor partida del mes en tu cafetería; si empatan, gana quien llegó primero.</p>
            <form id="cmp-f-mes" class="cmp-fila">
              <div class="crece">
                <label for="cmp-mes-premio">Premio</label>
                <input id="cmp-mes-premio" type="text" maxlength="80" placeholder="Un café gratis" autocomplete="off">
              </div>
              <label class="interruptor" style="margin-bottom:10px"><input type="checkbox" id="cmp-mes-activo"> <span>Activo</span></label>
              <button class="btn" type="submit">Guardar premio</button>
            </form>
            <p class="msg" id="cmp-m-mes" role="status"></p>
            <h3 style="margin-top:10px" id="cmp-mes-tit">Así va este mes</h3>
            <div class="juegos" id="cmp-mes-lideres"></div>
          </div>

          <div class="cmp-bloque">
            <h3>Torneo de fin de semana</h3>
            <p class="ayuda" style="margin:0 0 10px">Elige un juego y un premio: gana el mejor puntaje dentro del horario del torneo. Puede durar de 1 hora a 7 días y puedes cancelarlo antes de que empiece.</p>
            <div id="cmp-torneo-actual"></div>
            <form id="cmp-f-torneo" class="oculto">
              <div class="grid2">
                <div>
                  <label for="cmp-t-juego">Juego</label>
                  <select id="cmp-t-juego"></select>
                </div>
                <div>
                  <label for="cmp-t-premio">Premio</label>
                  <input id="cmp-t-premio" type="text" maxlength="80" placeholder="Un café gratis" autocomplete="off">
                </div>
                <div>
                  <label for="cmp-t-inicio">Empieza (hora de Bolivia)</label>
                  <input id="cmp-t-inicio" type="datetime-local">
                </div>
                <div>
                  <label for="cmp-t-fin">Termina (hora de Bolivia)</label>
                  <input id="cmp-t-fin" type="datetime-local">
                </div>
              </div>
              <div class="atajos">
                <button type="button" id="cmp-t-finde">Este fin de semana</button>
                <button type="button" id="cmp-t-ya">Desde ahora, 24 horas</button>
              </div>
              <div class="fila" style="margin-top:14px"><button class="btn oro" type="submit" id="cmp-t-crear">Crear torneo</button></div>
            </form>
            <p class="msg" id="cmp-m-torneo" role="status"></p>
          </div>

          <div class="cmp-bloque">
            <h3>Ganadores anteriores</h3>
            <div id="cmp-pasados"></div>
          </div>
        </div>
        <p class="msg" id="cmp-m" role="status"></p>
      </div>`;

    for (const [id, nombre] of Object.entries(JUEGOS)) {
      const o = el("option", null, nombre); o.value = id; $("cmp-t-juego").append(o);
    }
    $("cmp-f-mes").addEventListener("submit", guardarMes);
    $("cmp-f-torneo").addEventListener("submit", crearTorneo);
    $("cmp-t-finde").onclick = () => fechasPorDefecto();
    $("cmp-t-ya").onclick = () => {
      const ini = Math.ceil(ahora() / 60000) * 60;
      $("cmp-t-inicio").value = aInput(ini);
      $("cmp-t-fin").value = aInput(ini + 24 * 3600);
    };
    // Al canjear un cupón en la tarjeta Cupones, se actualiza el estado de los premios
    const canje = $("f-canje");
    if (canje) canje.addEventListener("submit", () => setTimeout(() => { if (actual) cargar(); }, 1500));
    return true;
  }

  // ------------------------------------------------------------------ carga
  async function cargar() {
    if (!construir() || !actual) return;
    const id = actual.id;
    const { data, error } = await sb.rpc("cmp_place_admin", { p_place: id });
    if (!actual || actual.id !== id) return;
    const listo = !error && data && data.ok;
    $("cmp-cuerpo").classList.toggle("oculto", !listo);
    $("cmp-pronto").classList.toggle("oculto", !!listo);
    if (!listo) {
      $("cmp-pronto").textContent = error
        ? (SIN_SERVIDOR.test(error.message || "") ? "Las competencias se activan pronto." : textoError(error))
        : (data && data.message) || "No se pudo cargar.";
      clearInterval(reloj);
      return;
    }
    datos = data;
    desfase = data.now ? data.now * 1000 - Date.now() : 0;
    pintarMes();
    pintarTorneo();
    pintarPasados();
  }

  function pintarMes() {
    const m = datos.month || {};
    if (document.activeElement !== $("cmp-mes-premio")) $("cmp-mes-premio").value = m.prize || "";
    $("cmp-mes-activo").checked = !!m.active;
    $("cmp-mes-tit").textContent = `Así va ${m.name || "este mes"}` + (m.endsAt ? ` · termina en ${falta(m.endsAt)}` : "");
    const l = $("cmp-mes-lideres"); l.innerHTML = "";
    for (const g of datos.monthTop || []) {
      const caja = el("div", "juego");
      caja.append(el("h3", null, g.gameName || JUEGOS[g.game] || g.game));
      const jug = +g.players || 0;
      caja.append(el("p", "cifra", `${jug} ${jug === 1 ? "jugador" : "jugadores"} este mes`));
      if (g.name) {
        const ol = el("ol"), li = el("li");
        li.append(el("span", "pos uno", "#1"));
        const n = el("span", "jug", g.name); n.title = g.name;
        li.append(n, el("span", "pts", num(g.score)));
        ol.append(li); caja.append(ol);
      } else caja.append(el("p", "nadie", "Todavía nadie jugó este mes."));
      l.append(caja);
    }
  }

  function pintarTorneo() {
    const t = datos.tournament;
    const c = $("cmp-torneo-actual"); c.innerHTML = "";
    clearInterval(reloj);
    $("cmp-f-torneo").classList.toggle("oculto", !!t);
    if (!t) {
      if (!$("cmp-t-inicio").value) fechasPorDefecto();
      return;
    }
    const caja = el("div", "cmp-torneo");
    const cab = el("div", "fila");
    cab.style.gap = "8px";
    const estado = el("span", "etq " + (t.active ? "estado-curso" : "estado-prox"), t.active ? "En curso" : "Programado");
    cab.append(el("b", null, `Torneo de ${t.gameName || JUEGOS[t.game]}`), estado);
    caja.append(cab);
    caja.append(el("div", "premio", t.prize));
    const cuando = el("div", "cuando", `Del ${fecha(t.startsAt, true)} al ${fecha(t.endsAt, true)} · `);
    const cuenta = el("span", "cuenta");
    cuando.append(cuenta);
    caja.append(cuando);
    const tic = () => {
      const empezo = t.startsAt * 1000 <= ahora();
      if (t.endsAt * 1000 <= ahora()) { cuenta.textContent = "Terminó"; clearInterval(reloj); setTimeout(cargar, 2500); return; }
      cuenta.textContent = empezo ? `Termina en ${falta(t.endsAt)}` : `Empieza en ${falta(t.startsAt)}`;
      if (empezo !== !!t.active) { t.active = empezo; estado.className = "etq estado-curso"; estado.textContent = "En curso"; botones(); }
    };
    tic(); reloj = setInterval(tic, 30000);

    if (t.active) {
      const top = t.top || [];
      const jug = +t.players || 0;
      caja.append(el("p", "ayuda", `${jug} ${jug === 1 ? "jugador" : "jugadores"} en el torneo`));
      if (top.length) {
        const ol = el("ol");
        const lista = el("div", "juego"); lista.style.marginTop = "8px";
        for (const r of top) {
          const li = el("li");
          li.append(el("span", "pos" + (r.rank === 1 ? " uno" : ""), "#" + r.rank));
          const n = el("span", "jug", r.name || "Tazador"); n.title = r.name || "Tazador";
          li.append(n, el("span", "pts", num(r.score)));
          ol.append(li);
        }
        lista.append(ol); caja.append(lista);
      } else caja.append(el("p", "nadie", "Todavía nadie jugó el torneo."));
    }
    const acc = el("div", "cmp-acciones");
    caja.append(acc);
    function botones() {
      acc.innerHTML = "";
      // El dueño cancela antes de que empiece; un administrador, mientras no termine
      if (!t.active || esAdmin) {
        const b = el("button", "btn peligro chico", t.active ? "Cancelar torneo (admin)" : "Cancelar torneo");
        b.type = "button";
        b.onclick = () => dosToques(b, "¿Cancelar? Toca otra vez", () => cancelar(t, b));
        acc.append(b);
      }
    }
    botones();
    c.append(caja);
  }

  function pintarPasados() {
    const c = $("cmp-pasados"); c.innerHTML = "";
    const pasados = datos.past || [];
    if (!pasados.length) {
      c.append(el("p", "ayuda", "Aquí vas a ver a los ganadores de cada mes y de cada torneo, y si ya canjearon su premio."));
      return;
    }
    const sc = el("div", "tabla-scroll");
    const tb = el("table", "mt");
    const th = el("tr");
    for (const t of ["Periodo", "Juego", "Ganador", "Premio", "Estado"]) th.append(el("th", null, t));
    const thead = el("thead"); thead.append(th); tb.append(thead);
    const body = el("tbody");
    for (const p of pasados) {
      const periodo = p.kind === "mes" ? `Mes de ${p.label}` : `Torneo ${p.label}`;
      const ganadores = p.winners || [];
      if (!ganadores.length) {
        const tr = el("tr");
        tr.append(el("td", null, periodo), el("td", null, p.kind === "torneo" ? (p.gameName || JUEGOS[p.game] || "") : "Todos los juegos"),
          el("td", null, "Nadie jugó"), el("td", "cmp-premio", p.prize), el("td", null, "—"));
        body.append(tr);
        continue;
      }
      for (const w of ganadores) {
        const tr = el("tr");
        const est = el("span", "cmp-estado " + (w.status === "canjeado" ? "si" : w.status === "borrado" ? "borrado" : "no"),
          w.status === "canjeado" ? `Canjeado ${w.redeemedAt ? soloFecha(w.redeemedAt) : ""}`.trim()
            : w.status === "borrado" ? "Cupón borrado" : "Sin canjear");
        const tdEst = el("td"); tdEst.append(est);
        tr.append(el("td", null, periodo), el("td", null, w.gameName || JUEGOS[w.game] || w.game),
          el("td", null, `${w.name || "Tazador"} (${num(w.score)})`), el("td", "cmp-premio", p.prize), tdEst);
        body.append(tr);
      }
    }
    tb.append(body); sc.append(tb); c.append(sc);
  }

  function fechasPorDefecto() {
    if (!datos || !datos.defaultStart) return;
    $("cmp-t-inicio").value = aInput(datos.defaultStart);
    $("cmp-t-fin").value = aInput(datos.defaultEnd);
  }

  // ------------------------------------------------------------------ acciones
  async function guardarMes(ev) {
    ev.preventDefault();
    if (!actual) return;
    const premio = $("cmp-mes-premio").value.trim(), activo = $("cmp-mes-activo").checked;
    if (activo && premio.length < 3) { msg("cmp-m-mes", "Escribe el premio (mínimo 3 letras), por ejemplo: Un café gratis.", "error"); return; }
    msg("cmp-m-mes", "Guardando…");
    const { data, error } = await sb.rpc("cmp_set_month_prize", { p_place: actual.id, p_prize: premio, p_active: activo });
    if (error || !data || !data.ok) { msg("cmp-m-mes", error ? textoError(error) : (data && data.message) || "No se pudo guardar.", "error"); return; }
    msg("cmp-m-mes", data.message, "ok");
    cargar();
  }

  async function crearTorneo(ev) {
    ev.preventDefault();
    if (!actual) return;
    const premio = $("cmp-t-premio").value.trim();
    const ini = $("cmp-t-inicio").value, fin = $("cmp-t-fin").value;
    if (premio.length < 3) { msg("cmp-m-torneo", "Escribe el premio (mínimo 3 letras), por ejemplo: Un café gratis.", "error"); $("cmp-t-premio").focus(); return; }
    if (!ini || !fin) { msg("cmp-m-torneo", "Elige cuándo empieza y cuándo termina.", "error"); return; }
    const a = Date.parse(conZona(ini)), b = Date.parse(conZona(fin));
    if (isNaN(a) || isNaN(b)) { msg("cmp-m-torneo", "Revisa las fechas.", "error"); return; }
    if (b - a < 3600e3) { msg("cmp-m-torneo", "El torneo tiene que durar al menos 1 hora.", "error"); return; }
    if (b - a > 7 * 864e5) { msg("cmp-m-torneo", "El torneo puede durar como máximo 7 días.", "error"); return; }
    $("cmp-t-crear").disabled = true;
    msg("cmp-m-torneo", "Creando…");
    const { data, error } = await sb.rpc("cmp_create_tournament", {
      p_place: actual.id, p_game: $("cmp-t-juego").value, p_prize: premio,
      p_starts: conZona(ini), p_ends: conZona(fin),
    });
    $("cmp-t-crear").disabled = false;
    if (error || !data || !data.ok) { msg("cmp-m-torneo", error ? textoError(error) : (data && data.message) || "No se pudo crear.", "error"); return; }
    msg("cmp-m-torneo", data.message, "ok");
    $("cmp-t-premio").value = "";
    $("cmp-t-inicio").value = ""; $("cmp-t-fin").value = "";
    cargar();
  }

  async function cancelar(t, boton) {
    boton.disabled = true;
    const { data, error } = await sb.rpc("cmp_cancel_tournament", { p_id: t.id });
    if (error || !data || !data.ok) {
      msg("cmp-m-torneo", error ? textoError(error) : (data && data.message) || "No se pudo cancelar.", "error");
      boton.disabled = false; return;
    }
    msg("cmp-m-torneo", data.message, "ok");
    cargar();
  }

  // Se llama al abrir una cafetería (abrir() en index.html)
  window.cargarCompetencias = function () {
    if (!construir()) return;
    for (const id of ["cmp-m-mes", "cmp-m-torneo", "cmp-m"]) msg(id);
    $("cmp-t-premio").value = ""; $("cmp-t-inicio").value = ""; $("cmp-t-fin").value = "";
    datos = null;
    cargar();
  };
})();
