// Hora feliz (PASO 17 en Supabase, migración 0022):
// El dueño (o un administrador) programa una Hora feliz para llenar sus horas tranquilas:
// día (de hoy a 7 días), hora, duración de 30 a 120 minutos y un mensaje corto opcional.
// En el juego la cafetería brilla, salen muchos más Granitos alrededor y los jugadores a 3 km reciben un aviso.
// Aquí se ven las próximas (se cancelan hasta que terminen) y los resultados de las pasadas.
// Usa lo que ya define index.html: sb, $, msg, textoError, dosToques, actual.
(function () {
  "use strict";

  const ZONA = "America/La_Paz";
  const OFFSET = "-04:00";            // Bolivia no tiene horario de verano
  const SIN_SERVIDOR = /Could not find the function|PGRST202/i;
  const DURACIONES = [30, 45, 60, 90, 120];

  let datos = null;                   // última respuesta de hora_feliz_place
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
  const ahora = () => Date.now() + desfase;
  const num = (n) => Number(n || 0).toLocaleString("es-BO");
  // Día de Bolivia ("2026-10-17") de una hora unix
  const diaDe = (epoch) => new Date(epoch * 1000 - 4 * 3600e3).toISOString().slice(0, 10);
  const hora = (epoch) => new Date(epoch * 1000).toLocaleTimeString("es-BO", { timeZone: ZONA, hour: "2-digit", minute: "2-digit", hour12: false });
  function sumarDias(dia, n) {
    const d = new Date(dia + "T12:00:00Z");
    d.setUTCDate(d.getUTCDate() + n);
    return d.toISOString().slice(0, 10);
  }
  function nombreDia(dia, conRelativo) {
    const txt = new Date(dia + "T12:00:00Z").toLocaleDateString("es-BO", { timeZone: "UTC", weekday: "short", day: "2-digit", month: "2-digit" });
    if (!conRelativo || !datos) return txt;
    if (dia === datos.today) return "Hoy · " + txt;
    if (dia === sumarDias(datos.today, 1)) return "Mañana · " + txt;
    return txt;
  }
  function cuando(epoch) {
    const dia = diaDe(epoch);
    if (datos && dia === datos.today) return "Hoy";
    if (datos && dia === sumarDias(datos.today, 1)) return "Mañana";
    return nombreDia(dia, false);
  }
  // "1 h 20 min" / "45 min"
  function falta(epoch) {
    const s = Math.max(0, Math.round((epoch * 1000 - ahora()) / 1000));
    if (s < 60) return "menos de 1 min";
    const total = Math.ceil(s / 60), h = Math.floor(total / 60), m = total % 60;
    if (h >= 24) return `${Math.floor(h / 24)} d ${h % 24} h`;
    if (h > 0) return m > 0 ? `${h} h ${m} min` : `${h} h`;
    return `${m} min`;
  }
  const minutos = (a, b) => Math.round((b - a) / 60);
  const plural = (n, uno, varios) => `${num(n)} ${Number(n) === 1 ? uno : varios}`;

  function estilos() {
    if (document.getElementById("hf-estilos")) return;
    const s = el("style");
    s.id = "hf-estilos";
    s.textContent = `
      .hf-cab { display: flex; gap: 16px; align-items: center; flex-wrap: wrap; margin: -22px -22px 18px; padding: 20px 22px;
        border-radius: var(--radio) var(--radio) 0 0; background: linear-gradient(120deg, #ffe0a3, #ffc2a8 55%, #ffd6e8); }
      .hf-cab .hf-ico { width: 64px; height: 64px; border-radius: 50%; flex: none; display: grid; place-items: center;
        background: linear-gradient(160deg, #ffc65a, #f0702e); box-shadow: 0 3px 0 rgba(150, 60, 10, .25); }
      .hf-cab .tx { flex: 1; min-width: 220px; }
      .hf-cab .sub { margin: 0; color: #5a4632; }
      .hf-lista { display: grid; gap: 10px; margin: 0 0 14px; }
      .hf-item { display: flex; gap: 12px 16px; align-items: center; flex-wrap: wrap; border-radius: 12px; padding: 12px 14px;
        background: #fff; border: 1px solid var(--linea); }
      .hf-item.activa { background: linear-gradient(120deg, #fff1d6, #ffe6dc); border-color: #f3b98f; }
      .hf-item .t { flex: 1; min-width: 210px; }
      .hf-item .t b { font-family: Fraunces, Georgia, serif; font-size: 18px; color: var(--noche); }
      .hf-item .t small { display: block; color: var(--suave); }
      .hf-item .cuenta { font-weight: 700; color: #a4501a; }
      .hf-item .hf-msj { font-size: 14px; margin-top: 4px; overflow-wrap: anywhere; }
      .hf-item .hf-vivo { font-size: 13px; color: #1f6b3e; margin-top: 4px; font-weight: 600; }
      .hf-form { border-top: 1px solid var(--linea); padding-top: 4px; }
      .hf-form h3 { margin-top: 14px; }
      .hf-form .opciones { margin-top: 2px; }
      .hf-previa { margin-top: 14px; border-radius: 14px; padding: 10px 14px 14px; background: #1b283d; color: #fff8ee; }
      .hf-previa .rotulo { font-size: 12px; font-weight: 600; color: #b9c4d3; letter-spacing: .3px; margin-bottom: 8px; }
      .hf-previa .burbuja { width: 52px; height: 52px; border-radius: 50%; background: rgba(255,255,255,.3); display: grid; place-items: center; flex: none; }
      .hf-previa .cuerpo { flex: 1; min-width: 0; border-radius: 12px; padding: 10px 14px; display: flex; gap: 12px; align-items: center;
        background: linear-gradient(180deg, #ffd27c, #f0702e); color: #3b2412; }
      .hf-previa .cuerpo .tt { font-family: Anton, Fraunces, Georgia, serif; font-weight: 700; letter-spacing: .5px; font-size: 18px; }
      .hf-previa .cuerpo .ln { font-size: 13px; font-weight: 600; }
      .hf-previa .cuerpo .ms { font-size: 13px; font-weight: 700; color: #fff; overflow-wrap: anywhere; }
      .hf-previa .pill { margin-left: auto; background: #3b2412; color: #ffbe55; border-radius: 99px; padding: 4px 10px; font-size: 12px; font-weight: 700; white-space: nowrap; }
      .hf-bloque { border-top: 1px solid var(--linea); margin-top: 18px; padding-top: 14px; }
      .hf-resumen { background: #f6f0e4; border-radius: 12px; padding: 12px 14px; margin: 6px 0 12px; font-size: 15px; }
      .hf-resumen b { font-family: Fraunces, Georgia, serif; font-size: 20px; color: var(--noche); }
      .hf-sube { color: #1f6b3e; font-weight: 700; }
      table.mt td.hf-msg { max-width: 220px; overflow-wrap: anywhere; color: var(--suave); font-size: 13px; }
    `;
    document.head.append(s);
  }

  const ICONO = `<svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
    <path d="M4 20 9.5 7.5l7 7L4 20Z"/><path d="M14 4.5c.6 1.2 1.8 1.6 3 1.2"/><path d="M19.5 9.5c-1.2-.6-2.4-.2-3 1"/><path d="M15 2v.01M21 7v.01M20 14v.01M10 3v.01"/></svg>`;
  const ICONO_CHICO = ICONO.replace(/width="34" height="34"/, 'width="26" height="26"').replace('stroke="#fff"', 'stroke="#3b2412"');

  function construir() {
    raiz = $("hf-hora-feliz");
    if (!raiz) return false;
    if (raiz.dataset.listo) return true;
    raiz.dataset.listo = "1";
    estilos();
    raiz.innerHTML = `
      <div class="tarjeta" id="hf-tarjeta">
        <div class="hf-cab">
          <div class="hf-ico">${ICONO}</div>
          <div class="tx">
            <h2>Hora feliz</h2>
            <p class="sub">Llena tus horas tranquilas. Mientras dura, tu cafetería brilla en el mapa del juego, salen muchos más Granitos a su alrededor y los jugadores a 3 km o menos reciben un aviso (y una notificación 10 minutos antes).</p>
          </div>
        </div>
        <p class="vacio-estado oculto" id="hf-pronto"></p>
        <div id="hf-cuerpo">
          <div class="aviso oculto" id="hf-oculta">Tu cafetería está oculta en el juego. Hazla visible (más abajo, en Ubicación) para usar la Hora feliz.</div>
          <div class="hf-lista" id="hf-proximas"></div>
          <form id="hf-form" class="hf-form" novalidate>
            <h3>Programar una Hora feliz</h3>
            <div class="grid2">
              <div>
                <label for="hf-dia">Día</label>
                <select id="hf-dia"></select>
              </div>
              <div>
                <label for="hf-hora">Empieza (hora de Bolivia)</label>
                <input id="hf-hora" type="time" step="300" required>
              </div>
            </div>
            <label id="hf-dur-tit">Duración</label>
            <div class="opciones" id="hf-duracion" role="radiogroup" aria-labelledby="hf-dur-tit"></div>
            <label for="hf-mensaje">Mensaje para los jugadores (opcional) <span class="contador" id="hf-contador">0/80</span></label>
            <input id="hf-mensaje" type="text" maxlength="80" placeholder="2x1 en capuchinos durante la Hora feliz" autocomplete="off">
            <div class="hf-previa">
              <div class="rotulo">Así lo ven los jugadores en la ficha de tu cafetería</div>
              <div class="cuerpo">
                <div class="burbuja">${ICONO_CHICO}</div>
                <div style="min-width:0">
                  <div class="tt">¡HORA FELIZ!</div>
                  <div class="ln">Salen muchos más Granitos aquí. ¡Ven a cazar!</div>
                  <div class="ms" id="hf-previa-msj"></div>
                </div>
                <span class="pill" id="hf-previa-min">60 MIN</span>
              </div>
            </div>
            <p class="ayuda" id="hf-explica"></p>
            <div class="fila" style="margin-top:14px"><button class="btn oro" type="submit" id="hf-crear">Programar Hora feliz</button></div>
          </form>
          <p class="msg" id="hf-m" role="status"></p>
          <div class="hf-bloque">
            <h3>Resultados</h3>
            <div id="hf-pasadas"></div>
          </div>
        </div>
      </div>`;

    for (const m of DURACIONES) {
      const lab = el("label", "opcion");
      const inp = el("input"); inp.type = "radio"; inp.name = "hf-dur"; inp.value = String(m);
      if (m === 60) inp.checked = true;
      const sp = el("span", null, m < 60 ? `${m} min` : m === 60 ? "1 hora" : m === 90 ? "1 h 30 min" : "2 horas");
      lab.append(inp, sp);
      $("hf-duracion").append(lab);
    }
    $("hf-form").addEventListener("submit", crear);
    $("hf-form").addEventListener("input", explicar);
    $("hf-form").addEventListener("change", explicar);
    return true;
  }

  // ------------------------------------------------------------------ carga
  async function cargar() {
    if (!construir() || !actual) return;
    const id = actual.id;
    const { data, error } = await sb.rpc("hora_feliz_place", { p_place: id });
    if (!actual || actual.id !== id) return;
    const listo = !error && data && data.ok;
    $("hf-cuerpo").classList.toggle("oculto", !listo);
    $("hf-pronto").classList.toggle("oculto", !!listo);
    clearInterval(reloj);
    if (!listo) {
      $("hf-pronto").textContent = error
        ? (SIN_SERVIDOR.test(error.message || "") ? "La Hora feliz se activa pronto." : textoError(error))
        : (data && data.message) || "No se pudo cargar.";
      return;
    }
    datos = data;
    desfase = data.now ? data.now * 1000 - Date.now() : 0;
    $("hf-oculta").classList.toggle("oculto", !!data.placeActive);
    $("hf-crear").disabled = !data.placeActive;
    pintarDias();
    pintarProximas();
    pintarPasadas();
    explicar();
    reloj = setInterval(tic, 30000);
  }

  // Días con Hora feliz programada (no se puede otra ese día)
  function diasOcupados() {
    const s = new Set();
    for (const h of (datos && datos.upcoming) || []) s.add(diaDe(h.startsAt));
    for (const h of (datos && datos.past) || []) s.add(diaDe(h.startsAt));
    return s;
  }

  function pintarDias() {
    const sel = $("hf-dia");
    const antes = sel.value;
    sel.innerHTML = "";
    const ocupados = diasOcupados();
    const dias = (datos.limits && datos.limits.days) || 7;
    let primero = null;
    for (let i = 0; i <= dias; i++) {
      const dia = sumarDias(datos.today, i);
      const o = el("option", null, nombreDia(dia, true) + (ocupados.has(dia) ? " (ya tiene Hora feliz)" : ""));
      o.value = dia;
      o.disabled = ocupados.has(dia);
      if (!o.disabled && !primero) primero = dia;
      sel.append(o);
    }
    sel.value = antes && !ocupados.has(antes) && sel.querySelector(`option[value="${antes}"]`) ? antes : (primero || datos.today);
    if (!$("hf-hora").value) horaPorDefecto();
  }

  // Próximo cuarto de hora + 15 min (si ya es tarde, mañana a la misma hora)
  function horaPorDefecto() {
    const ms = Math.ceil((ahora() + 15 * 60e3) / (15 * 60e3)) * 15 * 60e3;
    const loc = new Date(ms - 4 * 3600e3).toISOString();
    $("hf-hora").value = loc.slice(11, 16);
    if (loc.slice(0, 10) !== $("hf-dia").value && $("hf-dia").value === datos.today) {
      const man = sumarDias(datos.today, 1);
      const o = $("hf-dia").querySelector(`option[value="${man}"]`);
      if (o && !o.disabled) $("hf-dia").value = man;
    }
  }

  function duracion() {
    const r = document.querySelector('input[name="hf-dur"]:checked');
    return r ? +r.value : 60;
  }

  function explicar() {
    if (!datos) return;
    const m = $("hf-mensaje").value;
    $("hf-contador").textContent = `${m.length}/80`;
    $("hf-previa-msj").textContent = m.trim() ? "«" + m.trim().replace(/\s+/g, " ") + "»" : "";
    const dur = duracion();
    $("hf-previa-min").textContent = dur >= 60 ? (dur % 60 ? `${Math.floor(dur / 60)} H ${dur % 60} MIN` : `${dur / 60} H`) : `${dur} MIN`;
    const dia = $("hf-dia").value, h = $("hf-hora").value;
    if (!dia || !/^\d\d:\d\d$/.test(h)) { $("hf-explica").textContent = "Elige el día y la hora."; return; }
    const ini = Date.parse(`${dia}T${h}:00${OFFSET}`) / 1000, fin = ini + dur * 60;
    const nom = dia === datos.today ? "hoy" : dia === sumarDias(datos.today, 1) ? "mañana" : "el " + nombreDia(dia, false);
    $("hf-explica").textContent = `Será ${nom} de ${hora(ini)} a ${hora(fin)}. Una por día · de 30 minutos a 2 horas · puedes cancelarla hasta que termine.`;
  }

  function pintarProximas() {
    const c = $("hf-proximas"); c.innerHTML = "";
    const lista = datos.upcoming || [];
    if (!lista.length) return;
    for (const h of lista) {
      const activa = h.state === "active";
      const item = el("div", "hf-item" + (activa ? " activa" : ""));
      const t = el("div", "t");
      const cab = el("div", "fila");
      cab.style.gap = "8px";
      cab.append(el("b", null, `${cuando(h.startsAt)} · ${hora(h.startsAt)} a ${hora(h.endsAt)}`),
        el("span", "etq " + (activa ? "estado-curso" : "estado-prox"), activa ? "En curso" : "Programada"));
      t.append(cab);
      const cuenta = el("span", "cuenta");
      cuenta.dataset.ini = h.startsAt; cuenta.dataset.fin = h.endsAt;
      const sm = el("small", null, `${minutos(h.startsAt, h.endsAt)} minutos · `);
      sm.append(cuenta);
      t.append(sm);
      if (h.message) t.append(el("div", "hf-msj", "«" + h.message + "»"));
      if (activa) {
        t.append(el("div", "hf-vivo",
          `Hasta ahora: ${plural(h.checkins, "jugador hizo check-in", "jugadores hicieron check-in")} · ${plural(h.catchesNear, "Granito atrapado", "Granitos atrapados")} cerca`));
      }
      item.append(t);
      const b = el("button", "btn peligro chico", activa ? "Terminar ahora" : "Cancelar");
      b.type = "button";
      b.onclick = () => dosToques(b, activa ? "¿Terminar? Toca otra vez" : "¿Cancelar? Toca otra vez", () => cancelar(h, b));
      item.append(b);
      c.append(item);
    }
    tic(true);
  }

  // Cuentas regresivas; si una empieza o termina, se recarga
  function tic(sinRecargar) {
    let cambio = false;
    for (const s of document.querySelectorAll("#hf-proximas .cuenta")) {
      const ini = +s.dataset.ini, fin = +s.dataset.fin;
      const t = ahora() / 1000;
      if (t >= fin) { s.textContent = "Terminó"; cambio = true; }
      else if (t >= ini) { s.textContent = "Termina en " + falta(fin); if (!s.closest(".hf-item").classList.contains("activa")) cambio = true; }
      else s.textContent = "Empieza en " + falta(ini);
    }
    if (cambio && sinRecargar !== true) setTimeout(cargar, 1500);
  }

  function pintarPasadas() {
    const c = $("hf-pasadas"); c.innerHTML = "";
    const pasadas = datos.past || [];
    if (!pasadas.length) {
      c.append(el("p", "ayuda", "Aquí vas a ver cómo te fue en cada Hora feliz: cuántos jugadores hicieron check-in (y cuántos vienen normalmente a esa hora), cuántos venían por primera vez y cuántos Granitos atraparon cerca de tu local."));
      return;
    }
    // Resumen
    let ck = 0, usual = 0, nuevos = 0, cerca = 0;
    for (const p of pasadas) { ck += +p.checkins || 0; usual += +p.usual || 0; nuevos += +p.newPlayers || 0; cerca += +p.catchesNear || 0; }
    const r = el("div", "hf-resumen");
    if (pasadas.length === 1) r.append("En tu última Hora feliz llegaron ");
    else r.append("En tus últimas ", el("b", null, num(pasadas.length)), " horas felices llegaron ");
    r.append(el("b", null, num(ck)), ck === 1 ? " jugador" : " jugadores", ` (en esos mismos horarios suelen venir ${usual.toLocaleString("es-BO", { maximumFractionDigits: 1 })}). `);
    r.append(`${plural(nuevos, "vino", "vinieron")} por primera vez y atraparon ${plural(cerca, "Granito", "Granitos")} cerca de tu local.`);
    if (ck > usual && ck >= 2) {
      const veces = usual > 0 ? ck / usual : 0;
      r.append(" ", el("span", "hf-sube", usual > 0 && veces >= 1.5 ? `¡${veces.toLocaleString("es-BO", { maximumFractionDigits: 1 })} veces más de lo normal!` : "¡Más que lo normal!"));
    }
    c.append(r);

    const sc = el("div", "tabla-scroll");
    const tb = el("table", "mt");
    const th = el("tr");
    for (const [t, n] of [["Día", false], ["Horario", false], ["Check-ins", true], ["Normalmente", true], ["Nuevos", true], ["Granitos cerca", true], ["Mensaje", false]]) {
      const x = el("th", n ? "n" : null, t); th.append(x);
    }
    const thead = el("thead"); thead.append(th); tb.append(thead);
    const body = el("tbody");
    for (const p of pasadas) {
      const tr = el("tr");
      const hor = el("td", null, `${hora(p.startsAt)} a ${hora(p.endsAt)}`);
      if (p.state === "cancelled") { hor.append(" "); hor.append(el("span", "etq estado-fin", "terminada antes")); }
      tr.append(el("td", null, nombreDia(diaDe(p.startsAt), false)), hor,
        el("td", "n", num(p.checkins)),
        el("td", "n", (+p.usual || 0).toLocaleString("es-BO", { maximumFractionDigits: 1 })),
        el("td", "n", num(p.newPlayers)),
        el("td", "n", `${num(p.catchesNear)}${p.playersNear ? ` (${plural(p.playersNear, "jugador", "jugadores")})` : ""}`),
        el("td", "hf-msg", p.message || "—"));
      body.append(tr);
    }
    tb.append(body); sc.append(tb); c.append(sc);
    c.append(el("p", "ayuda", "Check-ins: jugadores que escanearon tu QR durante la Hora feliz. Normalmente: promedio de check-ins en ese mismo horario las 4 semanas anteriores. Granitos cerca: atrapados a 160 m o menos de tu cafetería."));
  }

  // ------------------------------------------------------------------ acciones
  async function crear(ev) {
    ev.preventDefault();
    if (!actual || !datos) return;
    const dia = $("hf-dia").value, h = $("hf-hora").value, dur = duracion();
    const mensaje = $("hf-mensaje").value.trim().replace(/\s+/g, " ");
    if (!dia) { msg("hf-m", "Elige el día.", "error"); return; }
    if (!/^\d\d:\d\d$/.test(h)) { msg("hf-m", "Elige la hora de inicio.", "error"); $("hf-hora").focus(); return; }
    if (!DURACIONES.includes(dur)) { msg("hf-m", "Elige la duración.", "error"); return; }
    if (mensaje.length > 80) { msg("hf-m", "El mensaje puede tener hasta 80 letras.", "error"); return; }
    const inicio = `${dia}T${h}:00${OFFSET}`;
    const ms = Date.parse(inicio);
    if (isNaN(ms)) { msg("hf-m", "Revisa la hora.", "error"); return; }
    if (ms < ahora() - 60e3) { msg("hf-m", "Esa hora ya pasó. Elige una hora que todavía no llegó.", "error"); $("hf-hora").focus(); return; }
    $("hf-crear").disabled = true;
    msg("hf-m", "Programando…");
    const { data, error } = await sb.rpc("hora_feliz_create", {
      p_place: actual.id, p_starts: inicio, p_minutes: dur, p_message: mensaje || null,
    });
    $("hf-crear").disabled = false;
    if (error || !data || !data.ok) {
      msg("hf-m", error ? (SIN_SERVIDOR.test(error.message || "") ? "La Hora feliz se activa pronto." : textoError(error)) : (data && data.message) || "No se pudo programar.", "error");
      return;
    }
    msg("hf-m", data.message + " Los jugadores cercanos recibirán el aviso.", "ok");
    $("hf-mensaje").value = "";
    $("hf-hora").value = "";
    await cargar();
  }

  async function cancelar(h, boton) {
    boton.disabled = true;
    const { data, error } = await sb.rpc("hora_feliz_cancel", { p_id: h.id });
    if (error || !data || !data.ok) {
      msg("hf-m", error ? textoError(error) : (data && data.message) || "No se pudo cancelar.", "error");
      boton.disabled = false;
      await cargar();
      return;
    }
    msg("hf-m", data.message, "ok");
    await cargar();
  }

  // Se llama al abrir una cafetería (abrir() en index.html)
  window.cargarHoraFeliz = function () {
    if (!construir()) return;
    msg("hf-m");
    $("hf-mensaje").value = "";
    $("hf-hora").value = "";
    datos = null;
    clearInterval(reloj);
    cargar();
  };
})();
