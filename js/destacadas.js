// Cafetería destacada (migración 0035, PEGAR_EN_SUPABASE_30.sql). Es un servicio pagado que se cobra FUERA de
// la app (efectivo o QR con el equipo de Tazadores; nunca en la Tienda ni con Google Play).
// - Dueño (ficha de su cafetería): ve si está destacada y hasta cuándo, escribe su eslogan (3 a 60 letras) y
//   pide "Quiero destacar mi cafetería" (7, 15 o 30 días), como las solicitudes de premium.
// - Administrador (pestaña Desarrollador): solicitudes, marcar una cafetería de una fecha a otra con nota y monto
//   internos, editar y cancelar períodos.
// En el juego: pin más grande con aura dorada y cinta "Destacada", primera en "Cerca", eslogan en la ficha y más
// Granitos salvajes alrededor.
// Usa lo que ya define index.html: sb, $, msg, textoError, dosToques, actual, esAdmin.
(function () {
  "use strict";

  const SIN_SERVIDOR = /Could not find the function|PGRST202/i;
  const DIAS = [7, 15, 30];

  // ------------------------------------------------------------------ utilidades
  function el(tag, clase, texto) {
    const e = document.createElement(tag);
    if (clase) e.className = clase;
    if (texto !== undefined && texto !== null) e.textContent = texto;
    return e;
  }
  const num = (v) => Number(v || 0).toLocaleString("es-BO");
  const bs = (v) => "Bs " + Number(v || 0).toLocaleString("es-BO", { minimumFractionDigits: Number(v) % 1 ? 2 : 0, maximumFractionDigits: 2 });
  const fechaDe = (d) => new Date(String(d).slice(0, 10) + "T12:00:00Z");
  const fechaLarga = (d) => fechaDe(d).toLocaleDateString("es-BO", { timeZone: "UTC", day: "numeric", month: "long" });
  const fechaCorta = (d) => fechaDe(d).toLocaleDateString("es-BO", { timeZone: "UTC", day: "numeric", month: "short" }).replace(".", "");
  const momento = (t) => new Date(t).toLocaleDateString("es-BO", { timeZone: "America/La_Paz", day: "numeric", month: "long" });
  function sumarDias(dia, n) {
    const d = fechaDe(dia);
    d.setUTCDate(d.getUTCDate() + n);
    return d.toISOString().slice(0, 10);
  }
  const diasEntre = (a, b) => Math.round((fechaDe(b) - fechaDe(a)) / 864e5);
  const plural = (v, uno, varios) => `${num(v)} ${Number(v) === 1 ? uno : varios}`;
  const errorDe = (error, data, porDefecto) => error
    ? (SIN_SERVIDOR.test(error.message || "") ? "La cafetería destacada se activa pronto." : textoError(error))
    : (data && data.message) || porDefecto;

  // Mismas reglas que el servidor (featured_set_slogan)
  function revisarEslogan(t) {
    const s = String(t || "").trim().replace(/\s+/g, " ");
    if (!s) return { ok: true, valor: "" };
    if (s.length < 3 || s.length > 60) return { ok: false, msg: "El eslogan tiene que tener de 3 a 60 letras." };
    if (/[<>{}\\]/.test(s)) return { ok: false, msg: "El eslogan no puede tener los signos < > { } \\." };
    if (/(https?:|www\.|\.(com|net|org|bo|app|io)(\s|\/|$))/i.test(s)) return { ok: false, msg: "El eslogan no puede tener enlaces." };
    return { ok: true, valor: s };
  }

  function estilos() {
    if (document.getElementById("dest-estilos")) return;
    const s = el("style");
    s.id = "dest-estilos";
    s.textContent = `
      .dest-cab { display: flex; gap: 16px; align-items: center; flex-wrap: wrap; margin: -22px -22px 16px; padding: 20px 22px;
        border-radius: var(--radio) var(--radio) 0 0; background: linear-gradient(120deg, #fff3cf, #ffe2a1 60%, #ffd27c); }
      .dest-cab .ico { width: 64px; height: 64px; border-radius: 50%; flex: none; display: grid; place-items: center;
        background: radial-gradient(circle at 35% 30%, #ffe9a8, #f2b43c 55%, #c9871b); box-shadow: 0 3px 0 rgba(120, 70, 10, .25); }
      .dest-cab .tx { flex: 1; min-width: 220px; }
      .dest-cab .sub { margin: 0; color: #5a4632; }
      .dest-estado { font-size: 16px; font-weight: 600; margin: 0 0 10px; }
      .dest-estado.activa { color: #1f6b3e; }
      .dest-cuerpo { display: grid; grid-template-columns: minmax(0, 1fr) 260px; gap: 18px; align-items: start; }
      .dest-cuerpo ul { margin: 0; padding-left: 18px; color: var(--tinta); font-size: 14px; }
      .dest-cuerpo li { margin: 3px 0; }
      .dest-previa { border-radius: 14px; overflow: hidden; border: 1px solid #c9dccb; background: linear-gradient(160deg, #cfe7d6, #e7efd9); }
      .dest-previa svg { display: block; width: 100%; height: auto; }
      .dest-previa .rotulo { font-size: 12px; font-weight: 600; color: #3d5245; letter-spacing: .3px; padding: 8px 12px 0; }
      .dest-bloque { border-top: 1px solid var(--linea); margin-top: 16px; padding-top: 4px; }
      .dest-fila { display: flex; gap: 10px; flex-wrap: wrap; align-items: center; margin-top: 8px; }
      .dest-fila .crece { flex: 1; min-width: 200px; }
      .dest-fila select { max-width: 140px; }
      .dest-pedido { background: #fff8e8; border: 1px solid #f0d89c; border-radius: 10px; padding: 10px 12px; font-size: 14px; margin-top: 10px; }
      .dest-periodo { display: grid; grid-template-columns: 8px 1fr auto; gap: 0 14px; border: 1px solid var(--linea); border-radius: 12px; background: #fff;
        overflow: hidden; margin-bottom: 10px; }
      .dest-periodo .franja { background: var(--c, #c9c1b2); }
      .dest-periodo .cuerpo { padding: 12px 0; min-width: 0; }
      .dest-periodo .nom { font-family: Fraunces, Georgia, serif; font-size: 18px; font-weight: 700; color: var(--noche); line-height: 1.25; overflow-wrap: anywhere; }
      .dest-periodo .cuando { font-size: 13px; color: var(--suave); margin-top: 2px; }
      .dest-periodo .nota { font-size: 14px; margin: 6px 0 0; overflow-wrap: anywhere; }
      .dest-periodo .acciones { display: flex; flex-direction: column; gap: 6px; padding: 12px 12px 12px 0; justify-content: center; }
      .dest-form { border-top: 1px solid var(--linea); margin-top: 6px; padding-top: 4px; }
      .dest-form h3 { margin-top: 14px; }
      .dest-aprobando { background: #dff3e6; color: #1f6b3e; border-radius: 10px; padding: 8px 12px; font-size: 14px; font-weight: 600; margin-top: 10px; }
      @media (max-width: 760px) { .dest-cuerpo { grid-template-columns: 1fr; } }
      @media (max-width: 560px) {
        .dest-periodo { grid-template-columns: 8px 1fr; }
        .dest-periodo .acciones { grid-column: 2; flex-direction: row; flex-wrap: wrap; padding: 0 12px 12px 0; }
      }
    `;
    document.head.append(s);
  }

  const ICONO = `<svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="#5a3a0c" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
    <path d="m12 3 2.6 5.3 5.8.8-4.2 4.1 1 5.8L12 16.3 6.8 19l1-5.8-4.2-4.1 5.8-.8Z" fill="#fff3cf"/></svg>`;

  // Así se ve en el juego: pin dorado más grande, aura, cinta "DESTACADA" y el eslogan
  const PREVIA = `<svg viewBox="0 0 260 190" role="img" aria-label="Vista previa de una cafetería destacada en el mapa">
      <defs>
        <radialGradient id="dest-aura"><stop offset="0" stop-color="#ffd76a" stop-opacity=".85"/><stop offset=".55" stop-color="#f2b43c" stop-opacity=".35"/><stop offset="1" stop-color="#f2b43c" stop-opacity="0"/></radialGradient>
        <linearGradient id="dest-cinta" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="#ffe08a"/><stop offset="1" stop-color="#e9a62c"/></linearGradient>
      </defs>
      <path d="M0 120 L260 70 M40 190 L170 0 M150 190 L260 120" stroke="#fff" stroke-width="9" opacity=".7"/>
      <ellipse cx="130" cy="138" rx="96" ry="34" fill="url(#dest-aura)"/>
      <ellipse cx="130" cy="138" rx="74" ry="25" fill="none" stroke="#f2b43c" stroke-width="2.5" stroke-dasharray="12 7"/>
      <ellipse cx="130" cy="138" rx="34" ry="11" fill="#12233a"/><ellipse cx="130" cy="135" rx="28" ry="9" fill="#fffdf8"/>
      <rect x="120" y="86" width="20" height="50" rx="3" fill="#fffdf8" stroke="#e8b04a" stroke-width="2"/>
      <circle cx="130" cy="58" r="30" fill="#f2b43c"/><circle cx="130" cy="58" r="24" fill="#6f4e37"/>
      <path d="M118 52h20v7a8 8 0 0 1-8 8h-4a8 8 0 0 1-8-8Z" fill="#fffdf8"/><path d="M138 55h3a3 3 0 0 1 0 6h-3" fill="none" stroke="#fffdf8" stroke-width="2.5"/>
      <path d="M78 96 h12 l-6 9 6 9 h-14 Z M182 96 h-12 l6 9 -6 9 h14 Z" fill="#c9871b"/>
      <rect x="86" y="92" width="88" height="22" rx="4" fill="url(#dest-cinta)" stroke="#b5791a" stroke-width="1.5"/>
      <text x="130" y="107.5" text-anchor="middle" font-family="Inter, sans-serif" font-size="11" font-weight="800" fill="#3b2412" letter-spacing="1.2">DESTACADA</text>
      <g fill="#fff6c8"><circle cx="70" cy="70" r="2.2"/><circle cx="196" cy="62" r="2.6"/><circle cx="210" cy="118" r="1.8"/><circle cx="54" cy="128" r="2"/><circle cx="160" cy="24" r="1.8"/></g>
      <rect x="18" y="160" width="224" height="24" rx="12" fill="#1b283d" opacity=".92"/>
      <text id="dest-previa-eslogan" x="130" y="176" text-anchor="middle" font-family="Inter, sans-serif" font-size="11" font-weight="600" fill="#ffd27c"></text>
    </svg>`;

  // ================================================================== Dueño
  let raizD = null, datosD = null, pedidoD = 0;

  function construirDueno() {
    raizD = $("destacada-anchor");
    if (!raizD) return false;
    if (raizD.dataset.listo) return true;
    raizD.dataset.listo = "1";
    estilos();
    raizD.innerHTML = `
      <div class="tarjeta" id="dest-tarjeta">
        <div class="dest-cab">
          <div class="ico">${ICONO}</div>
          <div class="tx">
            <h2>Cafetería destacada <span class="chip" id="dest-chip">—</span></h2>
            <p class="sub">Un servicio aparte de tu plan, por los días que elijas. Se paga directo al equipo de Tazadores (efectivo o QR), nunca dentro del juego.</p>
          </div>
        </div>
        <p class="vacio-estado oculto" id="dest-pronto"></p>
        <div id="dest-contenido">
          <p class="dest-estado" id="dest-estado"></p>
          <div class="aviso oculto" id="dest-oculta">Tu cafetería está oculta en el juego. Hazla visible (más abajo, en Ubicación) para que se vea destacada.</div>
          <div class="dest-cuerpo">
            <div>
              <ul>
                <li>Tu pin se ve más grande en el mapa, con un aura dorada y la cinta «Destacada».</li>
                <li>Sale primera en la lista «Cerca» de los jugadores.</li>
                <li>Tu eslogan aparece en la ficha de tu cafetería.</li>
                <li>Salen más Granitos salvajes alrededor de tu local.</li>
              </ul>
              <form id="dest-f-eslogan" class="dest-bloque" novalidate>
                <label for="dest-eslogan">Tu eslogan <span class="contador" id="dest-contador">0/60</span></label>
                <div class="dest-fila">
                  <input id="dest-eslogan" class="crece" type="text" maxlength="60" placeholder="El mejor capuchino de la plaza" autocomplete="off">
                  <button class="btn" type="submit" id="dest-guardar">Guardar eslogan</button>
                </div>
                <p class="ayuda">De 3 a 60 letras, sin enlaces. Se ve en el juego mientras tu cafetería es destacada.</p>
              </form>
            </div>
            <div class="dest-previa"><div class="rotulo">ASÍ SE VE EN EL MAPA</div>${PREVIA}</div>
          </div>
          <div class="dest-bloque" id="dest-pedir-bloque">
            <div id="dest-pedido" class="dest-pedido oculto"></div>
            <form id="dest-f-pedir" novalidate>
              <div class="dest-fila">
                <select id="dest-dias" aria-label="Días destacada">${DIAS.map((d) => `<option value="${d}"${d === 15 ? " selected" : ""}>${d} días</option>`).join("")}</select>
                <input id="dest-mensaje" class="crece" type="text" maxlength="300" placeholder="Mensaje (opcional): desde qué día, cómo prefieres pagar, tu WhatsApp…" aria-label="Mensaje para el equipo">
                <button class="btn oro" type="submit" id="dest-pedir">Quiero destacar mi cafetería</button>
              </div>
              <p class="ayuda">El equipo de Tazadores te escribe para coordinar el pago y las fechas.</p>
            </form>
          </div>
          <p class="aviso oculto" id="dest-admin-aviso" style="margin-top:12px">Como administrador, destácala desde Desarrollador › Cafeterías destacadas.</p>
          <p class="msg" id="dest-m" role="status"></p>
        </div>
      </div>`;
    $("dest-eslogan").addEventListener("input", pintarPrevia);
    $("dest-f-eslogan").addEventListener("submit", guardarEslogan);
    $("dest-f-pedir").addEventListener("submit", pedir);
    return true;
  }

  function pintarPrevia() {
    const v = $("dest-eslogan").value;
    $("dest-contador").textContent = `${v.length}/60`;
    const s = v.trim().replace(/\s+/g, " ");
    const t = $("dest-previa-eslogan");
    t.textContent = s ? "«" + s + "»" : (actual ? actual.name : "Tu cafetería");
    // Que entre en la pastilla (210 de ancho): si es más largo, se angosta
    t.removeAttribute("textLength"); t.removeAttribute("lengthAdjust");
    try { if (t.getComputedTextLength() > 210) { t.setAttribute("textLength", "210"); t.setAttribute("lengthAdjust", "spacingAndGlyphs"); } } catch (_) {}
  }

  async function cargarDueno() {
    if (!construirDueno() || !actual) return;
    const id = actual.id, yo = ++pedidoD;
    const { data, error } = await sb.rpc("featured_my", { p_place: id });
    if (yo !== pedidoD || !actual || actual.id !== id) return;
    const listo = !error && data && data.ok;
    $("dest-contenido").classList.toggle("oculto", !listo);
    $("dest-pronto").classList.toggle("oculto", !!listo);
    if (!listo) { datosD = null; $("dest-pronto").textContent = errorDe(error, data, "No se pudo cargar."); return; }
    datosD = data;
    pintarDueno();
  }

  function pintarDueno() {
    const d = datosD;
    const chip = $("dest-chip"), estado = $("dest-estado");
    estado.className = "dest-estado";
    if (d.active) {
      chip.textContent = "Activa"; chip.className = "chip ok";
      const quedan = Number(d.active.daysLeft) || 0;
      estado.textContent = `Tu cafetería está destacada hasta el ${fechaLarga(d.active.to)} (${quedan === 1 ? "hoy es el último día" : "quedan " + quedan + " días"}).`;
      estado.classList.add("activa");
    } else if ((d.upcoming || []).length) {
      const u = d.upcoming[0];
      chip.textContent = "Programada"; chip.className = "chip";
      estado.textContent = `Tu cafetería será destacada del ${fechaLarga(u.from)} al ${fechaLarga(u.to)}.`;
    } else {
      chip.textContent = "No activa"; chip.className = "chip";
      estado.textContent = Number(d.pastCount) > 0 ? "Hoy no está destacada. Ya lo estuvo antes: puedes pedirla otra vez." : "Hoy no está destacada.";
    }
    $("dest-oculta").classList.toggle("oculto", d.placeActive !== false);
    $("dest-eslogan").value = d.slogan || "";
    pintarPrevia();

    const admin = typeof esAdmin !== "undefined" && esAdmin;
    $("dest-pedir-bloque").classList.toggle("oculto", admin);
    $("dest-admin-aviso").classList.toggle("oculto", !admin);
    const r = d.request, caja = $("dest-pedido");
    caja.classList.add("oculto");
    $("dest-f-pedir").classList.remove("oculto");
    if (r && r.status === "pendiente") {
      caja.textContent = `Pediste ${plural(r.days, "día", "días")} de cafetería destacada el ${momento(r.createdAt)}. Te escribimos para coordinar el pago y las fechas.`;
      caja.classList.remove("oculto");
      $("dest-f-pedir").classList.add("oculto");
    } else if (r && r.status === "rechazada" && r.resolvedAt && Date.now() - new Date(r.resolvedAt) < 14 * 864e5) {
      caja.textContent = "Tu última solicitud no se aprobó. Si tienes dudas, escríbenos a tazadores@gmail.com.";
      caja.classList.remove("oculto");
    }
    $("dest-pedir").textContent = d.active ? "Quiero más días destacada" : "Quiero destacar mi cafetería";
  }

  async function guardarEslogan(ev) {
    ev.preventDefault();
    const r = revisarEslogan($("dest-eslogan").value);
    if (!r.ok) { msg("dest-m", r.msg, "error"); return; }
    $("dest-guardar").disabled = true;
    msg("dest-m", "Guardando…");
    const { data, error } = await sb.rpc("featured_set_slogan", { p_place: actual.id, p_slogan: r.valor || null });
    $("dest-guardar").disabled = false;
    if (error || !data || !data.ok) { msg("dest-m", errorDe(error, data, "No se pudo guardar."), "error"); return; }
    if (datosD) datosD.slogan = data.slogan || null;
    $("dest-eslogan").value = data.slogan || "";
    pintarPrevia();
    msg("dest-m", data.slogan ? "Eslogan guardado." : "Eslogan borrado.", "ok");
  }

  async function pedir(ev) {
    ev.preventDefault();
    const dias = Number($("dest-dias").value), mensaje = $("dest-mensaje").value.trim();
    if (!DIAS.includes(dias)) { msg("dest-m", "Elige 7, 15 o 30 días.", "error"); return; }
    $("dest-pedir").disabled = true;
    msg("dest-m", "Enviando…");
    const { data, error } = await sb.rpc("featured_request", { p_place: actual.id, p_days: dias, p_message: mensaje || null });
    $("dest-pedir").disabled = false;
    if (error || !data || !data.ok) { msg("dest-m", errorDe(error, data, "No se pudo enviar."), "error"); if (data && data.code === "pending") cargarDueno(); return; }
    $("dest-mensaje").value = "";
    msg("dest-m", data.message || "¡Listo! Recibimos tu solicitud.", "ok");
    cargarDueno();
  }

  // ================================================================== Administrador
  let raizA = null, datosA = null, filtro = "vigentes", editando = null, solicitud = null;

  function construirAdmin() {
    raizA = $("destacadas-admin-anchor");
    if (!raizA) return false;
    if (raizA.dataset.listo) return true;
    raizA.dataset.listo = "1";
    estilos();
    raizA.innerHTML = `
      <div class="tarjeta" id="dest-admin">
        <div class="enc-tarjeta">
          <div>
            <h2>Cafeterías destacadas <span class="chip" id="dest-a-cuenta">0</span> <span class="chip">Administrador</span></h2>
            <p class="sub">Servicio pagado fuera de la app (efectivo o QR, nunca Google Play). Marca de qué día a qué día una cafetería sale destacada en el juego. Los días son de Bolivia y se incluyen los dos.</p>
          </div>
          <button class="btn oro" type="button" id="dest-a-nuevo">+ Destacar una cafetería</button>
        </div>
        <p class="vacio-estado oculto" id="dest-a-pronto"></p>
        <div id="dest-a-cuerpo">
          <div class="kpis" id="dest-a-kpis"></div>
          <div id="dest-a-solicitudes"></div>
          <form id="dest-a-form" class="dest-form oculto" novalidate>
            <h3 id="dest-a-titulo">Destacar una cafetería</h3>
            <div id="dest-a-aprobando" class="dest-aprobando oculto"></div>
            <div class="grid2">
              <div>
                <label for="dest-a-lugar">Cafetería</label>
                <select id="dest-a-lugar" required></select>
              </div>
              <div>
                <label for="dest-a-monto">Monto cobrado (Bs, interno)</label>
                <input id="dest-a-monto" type="text" inputmode="decimal" maxlength="12" placeholder="150" autocomplete="off">
              </div>
              <div>
                <label for="dest-a-desde">Desde</label>
                <input id="dest-a-desde" type="date" required>
              </div>
              <div>
                <label for="dest-a-hasta">Hasta (incluido)</label>
                <input id="dest-a-hasta" type="date" required>
                <div class="atajos" id="dest-a-atajos">${DIAS.map((d) => `<button type="button" data-n="${d}">${d} días</button>`).join("")}</div>
              </div>
            </div>
            <label for="dest-a-nota">Nota interna (no la ve el dueño) <span class="contador" id="dest-a-cont">0/300</span></label>
            <input id="dest-a-nota" type="text" maxlength="300" placeholder="Pagó por QR el 19/10. Factura a nombre de…">
            <p class="ayuda" id="dest-a-resumen"></p>
            <div class="fila" style="margin-top:14px">
              <button class="btn" type="submit" id="dest-a-guardar">Guardar</button>
              <button class="btn borde" type="button" id="dest-a-cancelar">Cancelar</button>
            </div>
          </form>
          <p class="msg" id="dest-a-m" role="status"></p>
          <div class="filtros" id="dest-a-filtros" aria-label="Filtrar períodos" style="margin-top:16px">
            <button type="button" data-f="vigentes" aria-pressed="true">Activas y programadas <span></span></button>
            <button type="button" data-f="terminada" aria-pressed="false">Terminadas <span></span></button>
            <button type="button" data-f="cancelada" aria-pressed="false">Canceladas <span></span></button>
          </div>
          <div id="dest-a-lista"></div>
        </div>
      </div>`;
    $("dest-a-nuevo").addEventListener("click", () => abrirForm(null, null));
    $("dest-a-cancelar").addEventListener("click", cerrarForm);
    $("dest-a-form").addEventListener("submit", guardarPeriodo);
    $("dest-a-form").addEventListener("input", resumenForm);
    $("dest-a-form").addEventListener("change", resumenForm);
    for (const b of raizA.querySelectorAll("#dest-a-atajos button")) {
      b.addEventListener("click", () => {
        const desde = $("dest-a-desde").value || (datosA && datosA.today);
        if (!desde) return;
        if (!$("dest-a-desde").value) $("dest-a-desde").value = desde;
        $("dest-a-hasta").value = sumarDias(desde, Number(b.dataset.n) - 1);
        resumenForm();
      });
    }
    for (const b of raizA.querySelectorAll("#dest-a-filtros button")) {
      b.addEventListener("click", () => {
        filtro = b.dataset.f;
        for (const x of raizA.querySelectorAll("#dest-a-filtros button")) x.setAttribute("aria-pressed", String(x === b));
        pintarLista();
      });
    }
    return true;
  }

  async function cargarAdmin() {
    if (!construirAdmin()) return;
    const { data, error } = await sb.rpc("featured_admin_list");
    const listo = !error && data && data.ok;
    $("dest-a-cuerpo").classList.toggle("oculto", !listo);
    $("dest-a-pronto").classList.toggle("oculto", !!listo);
    $("dest-a-nuevo").disabled = !listo;
    if (!listo) { datosA = null; $("dest-a-pronto").textContent = errorDe(error, data, "No se pudo cargar."); return; }
    datosA = data;
    pintarAdmin();
  }

  function pintarAdmin() {
    const d = datosA, t = d.totals || {};
    const pend = Number(t.pendientes) || 0;
    $("dest-a-cuenta").textContent = pend + (pend === 1 ? " pendiente" : " pendientes");
    $("dest-a-cuenta").className = "chip " + (pend ? "no" : "ok");
    const k = $("dest-a-kpis"); k.innerHTML = "";
    for (const [v, txt, alerta] of [[num(t.activas), "destacadas hoy"], [num(t.programadas), "programadas"], [num(pend), "solicitudes pendientes", pend > 0], [bs(t.monto30), "cobrado (períodos de los últimos 30 días)"]]) {
      const c = el("div", "kpi" + (alerta ? " alerta" : ""));
      c.append(el("div", "v", v), el("div", "t", txt));
      k.append(c);
    }
    // Cafeterías del formulario
    const sel = $("dest-a-lugar"), antes = sel.value;
    sel.innerHTML = "";
    sel.append(new Option("Elige una cafetería…", ""));
    for (const p of d.places || []) sel.append(new Option(p.name + (p.active ? "" : " (oculta)") + (p.premium ? " · premium" : ""), p.id));
    sel.value = antes;
    pintarSolicitudes();
    pintarLista();
  }

  function pintarSolicitudes() {
    const caja = $("dest-a-solicitudes"); caja.innerHTML = "";
    const todas = datosA.requests || [];
    const mostrar = todas.filter((r, i) => r.status === "pendiente" || i < 5);
    if (!mostrar.length) return;
    caja.append(el("h3", null, "Solicitudes de los dueños"));
    for (const r of mostrar) {
      const s = el("div", "solicitud");
      s.append(el("b", null, `${r.place} · ${plural(r.days, "día", "días")}`));
      const ahora = r.activeUntil ? `destacada hasta el ${fechaLarga(r.activeUntil)}` : "no destacada";
      s.append(el("div", "meta", `Pedido el ${momento(r.createdAt)} · ${r.email || "sin correo"} · ahora: ${ahora}`));
      if (r.message) s.append(el("p", null, r.message));
      const fila = el("div", "fila"); fila.style.marginTop = "8px";
      if (r.status === "pendiente") {
        const si = el("button", "btn", `Destacar ${plural(r.days, "día", "días")}`); si.type = "button";
        si.addEventListener("click", () => abrirForm(null, r));
        const no = el("button", "btn borde", "Rechazar"); no.type = "button";
        no.addEventListener("click", () => dosToques(no, "¿Rechazar? Toca otra vez", async () => {
          no.disabled = si.disabled = true;
          const { data, error } = await sb.rpc("featured_admin_reject", { p_request: r.id });
          if (error || !data || !data.ok) { msg("dest-a-m", errorDe(error, data, "No se pudo rechazar."), "error"); no.disabled = si.disabled = false; return; }
          msg("dest-a-m", `Solicitud de ${r.place} rechazada.`, "ok");
          if (solicitud && solicitud.id === r.id) cerrarForm();
          cargarAdmin();
        }));
        fila.append(si, no);
      } else {
        fila.append(el("span", "chip " + (r.status === "aprobada" ? "ok" : "no"), r.status));
      }
      s.append(fila);
      caja.append(s);
    }
  }

  const ESTADOS = { activa: ["Activa", "estado-curso", "#2f9e5b"], programada: ["Programada", "estado-prox", "#1f4e79"], terminada: ["Terminada", "estado-fin", "#c9c1b2"], cancelada: ["Cancelada", "estado-fin", "#b4412b"] };

  function pintarLista() {
    const lista = $("dest-a-lista"); lista.innerHTML = "";
    const todos = datosA ? datosA.periods || [] : [];
    const cuenta = { vigentes: 0, terminada: 0, cancelada: 0 };
    for (const p of todos) cuenta[p.state === "activa" || p.state === "programada" ? "vigentes" : p.state]++;
    for (const b of raizA.querySelectorAll("#dest-a-filtros button")) b.querySelector("span").textContent = cuenta[b.dataset.f] ? `(${cuenta[b.dataset.f]})` : "";
    const ver = todos.filter((p) => filtro === "vigentes" ? p.state === "activa" || p.state === "programada" : p.state === filtro);
    if (!ver.length) { lista.append(el("p", "vacio-estado", filtro === "vigentes" ? "No hay cafeterías destacadas ahora." : "No hay nada aquí.")); return; }
    for (const p of ver) {
      const [nombre, clase, color] = ESTADOS[p.state] || ESTADOS.terminada;
      const caja = el("div", "dest-periodo");
      caja.style.setProperty("--c", color);
      const cuerpo = el("div", "cuerpo");
      cuerpo.append(el("div", "nom", p.place + (p.placeActive ? "" : " (oculta)")));
      const n = diasEntre(p.from, p.to) + 1;
      let cuando = `Del ${fechaCorta(p.from)} al ${fechaCorta(p.to)} · ${plural(n, "día", "días")}`;
      if (p.state === "activa" && datosA) cuando += ` · quedan ${diasEntre(datosA.today, p.to) + 1}`;
      if (p.state === "programada" && datosA) cuando += ` · empieza en ${plural(diasEntre(datosA.today, p.from), "día", "días")}`;
      if (p.state === "cancelada" && p.cancelledAt) cuando += ` · cancelada el ${momento(p.cancelledAt)}`;
      cuerpo.append(el("div", "cuando", cuando));
      const et = el("div", "etiquetas");
      et.append(el("span", "etq " + clase, nombre));
      if (p.amount !== null && p.amount !== undefined) et.append(el("span", "etq xp", bs(p.amount)));
      if (p.requestId) et.append(el("span", "etq", "pedida por el dueño"));
      if (p.createdBy) et.append(el("span", "etq", p.createdBy));
      cuerpo.append(et);
      if (p.note) cuerpo.append(el("p", "nota", "Nota: " + p.note));
      if (p.slogan) cuerpo.append(el("p", "nota", "Eslogan: «" + p.slogan + "»"));
      const acc = el("div", "acciones");
      if (p.state !== "cancelada") {
        const ed = el("button", "btn borde chico", "Editar"); ed.type = "button";
        ed.addEventListener("click", () => abrirForm(p, null));
        acc.append(ed);
      }
      if (p.state === "activa" || p.state === "programada") {
        const ca = el("button", "btn peligro chico", "Cancelar"); ca.type = "button";
        ca.addEventListener("click", () => dosToques(ca, "¿Cancelar? Toca otra vez", async () => {
          ca.disabled = true;
          const { data, error } = await sb.rpc("featured_admin_cancel", { p_id: p.id });
          if (error || !data || !data.ok) { msg("dest-a-m", errorDe(error, data, "No se pudo cancelar."), "error"); ca.disabled = false; return; }
          msg("dest-a-m", `${p.place}: ${data.message}`, "ok");
          if (editando && editando.id === p.id) cerrarForm();
          cargarAdmin();
        }));
        acc.append(ca);
      }
      caja.append(el("div", "franja"), cuerpo, acc);
      lista.append(caja);
    }
  }

  function abrirForm(periodo, req) {
    if (!datosA) return;
    editando = periodo; solicitud = req;
    const hoy = datosA.today;
    $("dest-a-titulo").textContent = periodo ? `Editar: ${periodo.place}` : "Destacar una cafetería";
    $("dest-a-lugar").value = periodo ? periodo.placeId : req ? req.placeId : "";
    $("dest-a-lugar").disabled = !!(periodo || req);
    let desde = hoy;
    if (req && req.activeUntil) desde = sumarDias(req.activeUntil, 1);   // seguido del período que ya tiene
    $("dest-a-desde").value = periodo ? periodo.from : desde;
    $("dest-a-hasta").value = periodo ? periodo.to : sumarDias(desde, (req ? Number(req.days) : 7) - 1);
    $("dest-a-monto").value = periodo && periodo.amount !== null && periodo.amount !== undefined ? String(periodo.amount).replace(".", ",") : "";
    $("dest-a-nota").value = periodo ? periodo.note || "" : "";
    const ap = $("dest-a-aprobando");
    ap.textContent = req ? `Apruebas la solicitud de ${req.place} (${plural(req.days, "día", "días")}). Al guardar queda aprobada.` : "";
    ap.classList.toggle("oculto", !req);
    $("dest-a-form").classList.remove("oculto");
    msg("dest-a-m");
    resumenForm();
    $("dest-a-form").scrollIntoView({ behavior: "smooth", block: "nearest" });
  }

  function cerrarForm() {
    editando = null; solicitud = null;
    $("dest-a-form").classList.add("oculto");
    $("dest-a-lugar").disabled = false;
  }

  function resumenForm() {
    const desde = $("dest-a-desde").value, hasta = $("dest-a-hasta").value;
    $("dest-a-cont").textContent = `${$("dest-a-nota").value.length}/300`;
    const r = $("dest-a-resumen");
    if (!desde || !hasta) { r.textContent = ""; return; }
    const n = diasEntre(desde, hasta) + 1;
    r.textContent = n > 0 ? `${plural(n, "día", "días")}: del ${fechaLarga(desde)} al ${fechaLarga(hasta)} (hasta las 23:59 de Bolivia).` : "La fecha de fin tiene que ser igual o posterior a la de inicio.";
  }

  async function guardarPeriodo(ev) {
    ev.preventDefault();
    const lugar = $("dest-a-lugar").value, desde = $("dest-a-desde").value, hasta = $("dest-a-hasta").value;
    const montoTxt = $("dest-a-monto").value.trim(), nota = $("dest-a-nota").value.trim();
    if (!lugar) { msg("dest-a-m", "Elige una cafetería.", "error"); return; }
    if (!desde || !hasta) { msg("dest-a-m", "Pon la fecha de inicio y la de fin.", "error"); return; }
    if (hasta < desde) { msg("dest-a-m", "La fecha de fin tiene que ser igual o posterior a la de inicio.", "error"); return; }
    const limpio = montoTxt.replace(/^bs\.?\s*/i, "").replace(/\s/g, "");
    if (limpio !== "" && !/^-?\d+([.,]\d{1,2})?$/.test(limpio)) { msg("dest-a-m", "Escribe el monto en números, por ejemplo 150 o 150,50.", "error"); return; }
    const monto = limpio === "" ? null : Number(limpio.replace(",", "."));
    if (monto !== null && (!isFinite(monto) || monto < 0 || monto > 100000)) { msg("dest-a-m", "El monto tiene que estar entre 0 y 100.000 Bs.", "error"); return; }
    $("dest-a-guardar").disabled = true;
    msg("dest-a-m", "Guardando…");
    const { data, error } = await sb.rpc("featured_admin_save", {
      p_place: lugar, p_from: desde, p_to: hasta, p_note: nota || null, p_amount: monto,
      p_id: editando ? editando.id : null, p_request: solicitud ? solicitud.id : null,
    });
    $("dest-a-guardar").disabled = false;
    if (error || !data || !data.ok) { msg("dest-a-m", errorDe(error, data, "No se pudo guardar."), "error"); return; }
    const nombre = ($("dest-a-lugar").selectedOptions[0] || {}).textContent || "";
    msg("dest-a-m", `${data.message} ${nombre.replace(/ \(oculta\)| · premium/g, "")}: del ${fechaLarga(desde)} al ${fechaLarga(hasta)}.`, "ok");
    cerrarForm();
    cargarAdmin();
  }

  // Se llaman desde index.html: abrir() (ficha de la cafetería) y cargarAdmin() (Desarrollador)
  window.cargarDestacada = function () {
    if (!construirDueno()) return;
    msg("dest-m");
    $("dest-mensaje").value = "";
    datosD = null;
    cargarDueno();
  };
  window.cargarDestacadasAdmin = function () {
    if (!construirAdmin()) return;
    cargarAdmin();
  };
})();
