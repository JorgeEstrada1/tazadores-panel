// Tarjeta de sellos y café pendiente (migración 0023, PEGAR_EN_SUPABASE_18.sql):
// - Café pendiente: el cliente paga el café en la caja como siempre (efectivo o QR) y muestra un código de
//   6 letras de la app; aquí se confirma. Tazadores no cobra nada. Al amigo le llega el café a su app o,
//   si es "para la comunidad", queda en el pozo de la cafetería.
// - Tarjeta de sellos: cada check-in suma un sello (1 por día); con la tarjeta llena el jugador recibe su
//   premio y se canjea con su código en "Canjear un cupón", como cualquier cupón.
// Usa lo que ya define index.html: sb, $, msg, textoError, actual, esAdmin.
(function () {
  "use strict";

  const ZONA = "America/La_Paz";
  const SIN_SERVIDOR = /Could not find the function|PGRST202/i;

  let datos = null;        // última respuesta de sello_admin
  let desfase = 0;         // reloj del servidor - reloj del navegador (ms)
  let reloj = null;        // refresco de los códigos que esperan en la caja
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
  function fecha(epoch) {
    return new Date(epoch * 1000).toLocaleString("es-BO", { timeZone: ZONA, day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
  }
  function falta(epoch) {
    let s = Math.max(0, Math.round((epoch * 1000 - ahora()) / 1000));
    const h = Math.floor(s / 3600); s -= h * 3600;
    const m = Math.floor(s / 60);
    if (h > 0) return `${h} h ${m} min`;
    return m > 0 ? `${m} min` : "menos de 1 min";
  }
  function numero(valor, texto) {
    const d = el("div", "numero");
    d.append(el("b", null, num(valor)), el("span", null, texto));
    return d;
  }

  function estilos() {
    if (document.getElementById("sello-estilos")) return;
    const s = el("style");
    s.id = "sello-estilos";
    s.textContent = `
      .sello-confirmar { background: linear-gradient(120deg, #fbeee6, #fffdf8); border: 1px solid #ecc9b5; border-radius: 12px; padding: 14px 16px; margin: 4px 0 16px; }
      .sello-confirmar h3 { margin: 0 0 4px; }
      .sello-confirmar .canje { margin-top: 8px; }
      .sello-bloque { border-top: 1px solid var(--linea); margin-top: 18px; padding-top: 14px; }
      .sello-fila { display: flex; gap: 12px; flex-wrap: wrap; align-items: flex-end; }
      .sello-fila .crece { flex: 1; min-width: 220px; }
      .sello-fila .chico-sel { width: 130px; }
      .sello-fila label { margin-top: 10px; }
      .sello-espera { display: grid; gap: 8px; margin: 8px 0 4px; }
      .sello-espera .item-espera { display: flex; gap: 10px; align-items: center; flex-wrap: wrap; background: #fff; border: 1px dashed #d9b46a; border-radius: 10px; padding: 8px 12px; font-size: 14px; }
      .sello-espera .item-espera b { overflow-wrap: anywhere; }
      .sello-espera .vence { margin-left: auto; color: var(--suave); font-size: 13px; white-space: nowrap; }
      .sello-tarjeta { display: flex; gap: 8px; flex-wrap: wrap; margin: 10px 0 4px; }
      .sello-tarjeta i { width: 34px; height: 34px; border-radius: 50%; border: 2px dashed #c9a46a; background: #fff6e6; display: inline-block; }
      .sello-tarjeta i.lleno { border: 3px solid #6b3a1e; background: radial-gradient(circle, #fff6e6 52%, #9c6a43 56%, #6b3a1e 64%, #fff6e6 70%); }
      .sello-tarjeta i.premio { border-color: #c98a1e; background: #ffe7b3; }
      .sello-estado { font-size: 12px; font-weight: 600; padding: 2px 8px; border-radius: 99px; white-space: nowrap; }
      .sello-estado.si { background: #dff3e6; color: #1f6b3e; }
      .sello-estado.no { background: #fff1cc; color: #6d4a0c; }
      .sello-estado.pozo { background: #e3ecf7; color: #1f4e79; }
      .sello-estado.borrado { background: #eee6d6; color: var(--suave); }
      table.mt td.sello-texto { max-width: 220px; overflow-wrap: anywhere; }
      #sello-pend-numeros, #sello-sel-numeros { grid-template-columns: repeat(4, 1fr); }
      @media (max-width: 760px) { #sello-pend-numeros, #sello-sel-numeros { grid-template-columns: repeat(2, 1fr); } }
    `;
    document.head.append(s);
  }

  function construir() {
    raiz = $("sello-tarjeta");
    if (!raiz) return false;
    if (raiz.dataset.listo) return true;
    raiz.dataset.listo = "1";
    estilos();
    raiz.innerHTML = `
      <div class="tarjeta" id="sello-pendiente">
        <h2>Café pendiente</h2>
        <p class="sub">Tus clientes invitan un café a un amigo o a la comunidad. Lo pagan en tu caja como siempre (efectivo o QR): Tazadores no cobra nada, solo les da un código para que sepas a quién se lo invitan.</p>
        <p class="vacio-estado oculto" id="sello-pronto"></p>
        <div id="sello-cuerpo-pend">
          <div class="sello-confirmar">
            <h3>Confirmar café pendiente</h3>
            <p class="ayuda" style="margin:0">Cuando el cliente ya pagó, escribe el código de 6 letras que te muestra en la app.</p>
            <form class="canje" id="sello-f-confirmar">
              <input id="sello-codigo" type="text" maxlength="8" placeholder="ABC123" autocomplete="off" required aria-label="Código del café pendiente">
              <button class="btn oro" type="submit" id="sello-b-confirmar">Confirmar</button>
            </form>
            <div id="sello-r-confirmar" class="resultado oculto" role="status"></div>
          </div>
          <div class="numeros" id="sello-pend-numeros"></div>
          <h3 style="margin-top:4px">Esperando en tu caja</h3>
          <div class="sello-espera" id="sello-espera"></div>
          <h3 style="margin-top:14px">Últimos cafés confirmados</h3>
          <div id="sello-pend-recientes"></div>
          <label class="interruptor"><input type="checkbox" id="sello-pend-activo"> <span>Recibir cafés pendientes en mi cafetería</span></label>
          <p class="ayuda">Un café para un amigo vale 30 días; si no lo usa, pasa al pozo. Del pozo, cada jugador toma 1 café cada 7 días estando en tu cafetería, y lo canjeas con su código en «Canjear un cupón».</p>
          <p class="msg" id="sello-m-pend" role="status"></p>
        </div>
      </div>

      <div class="tarjeta" id="sello-sellos">
        <h2>Tarjeta de sellos</h2>
        <p class="sub">La tarjeta de cliente frecuente, pero en el celular: cada check-in en tu cafetería suma un sello (1 por día). Con la tarjeta llena, el jugador recibe su premio en la app (Menú → Mis cupones) y tú lo canjeas con su código en «Canjear un cupón».</p>
        <div id="sello-cuerpo-sel">
          <form id="sello-f-config" class="sello-fila">
            <div class="chico-sel">
              <label for="sello-necesarios">Sellos</label>
              <select id="sello-necesarios"></select>
            </div>
            <div class="crece">
              <label for="sello-premio">Premio</label>
              <input id="sello-premio" type="text" maxlength="80" placeholder="Un café gratis" autocomplete="off">
            </div>
            <label class="interruptor" style="margin-bottom:10px"><input type="checkbox" id="sello-activo"> <span>Activa</span></label>
            <button class="btn" type="submit" id="sello-b-guardar">Guardar</button>
          </form>
          <div class="sello-tarjeta" id="sello-vista" aria-hidden="true"></div>
          <p class="ayuda" style="margin-top:2px">Si la pausas, los jugadores conservan sus sellos. Las tarjetas que ya empezaron mantienen su premio y sus sellos aunque cambies la configuración.</p>
          <p class="msg" id="sello-m-config" role="status"></p>
          <div class="numeros" id="sello-sel-numeros"></div>
          <h3>Últimas tarjetas completas</h3>
          <div id="sello-sel-recientes"></div>
        </div>
      </div>`;

    for (let n = 3; n <= 10; n++) {
      const o = el("option", null, `${n} sellos`); o.value = String(n); $("sello-necesarios").append(o);
    }
    $("sello-necesarios").value = "5";
    $("sello-necesarios").addEventListener("change", vistaPrevia);
    $("sello-f-confirmar").addEventListener("submit", confirmar);
    $("sello-f-config").addEventListener("submit", guardarConfig);
    $("sello-pend-activo").addEventListener("change", activarPendiente);
    $("sello-codigo").addEventListener("input", () => {
      const i = $("sello-codigo");
      const limpio = i.value.toUpperCase().replace(/[^A-Z0-9]/g, "");
      if (limpio !== i.value) i.value = limpio;
    });
    // Al canjear un cupón en la tarjeta Cupones, se actualizan los premios y cafés canjeados
    const canje = $("f-canje");
    if (canje) canje.addEventListener("submit", () => setTimeout(() => { if (actual) cargar(); }, 1500));
    return true;
  }

  // ------------------------------------------------------------------ carga
  async function cargar() {
    if (!construir() || !actual) return;
    const id = actual.id;
    const { data, error } = await sb.rpc("sello_admin", { p_place: id });
    if (!actual || actual.id !== id) return;
    const listo = !error && data && data.ok;
    $("sello-cuerpo-pend").classList.toggle("oculto", !listo);
    $("sello-sellos").classList.toggle("oculto", !listo);
    $("sello-pronto").classList.toggle("oculto", !!listo);
    if (!listo) {
      $("sello-pronto").textContent = error
        ? (SIN_SERVIDOR.test(error.message || "") ? "La tarjeta de sellos y los cafés pendientes se activan pronto." : textoError(error))
        : (data && data.message) || "No se pudo cargar.";
      clearInterval(reloj);
      return;
    }
    datos = data;
    desfase = data.now ? data.now * 1000 - Date.now() : 0;
    pintarPendiente();
    pintarSellos();
  }

  function pintarPendiente() {
    const p = datos.pend || {};
    const c = datos.config || {};
    const nums = $("sello-pend-numeros"); nums.innerHTML = "";
    nums.append(numero((p.waiting || []).length, "esperando en tu caja"), numero(p.confirmed, "cafés confirmados"),
      numero(p.redeemed, "canjeados"), numero(p.pool, "en el pozo de la comunidad"));

    $("sello-pend-activo").checked = c.pendiente !== false;
    if (datos.hasOwner === false) msg("sello-m-pend", "Los cafés pendientes funcionan cuando la cafetería tiene dueño en el panel.", "error");

    // Códigos que esperan en la caja (sin el código: lo tiene que mostrar el cliente)
    const lista = $("sello-espera"); lista.innerHTML = "";
    const espera = p.waiting || [];
    if (!espera.length) lista.append(el("p", "ayuda", "Ningún código esperando ahora."));
    for (const w of espera) {
      const it = el("div", "item-espera");
      it.append(el("b", null, w.giver || "Tazador"));
      it.append(el("span", null, w.kind === "amigo" ? `invita a ${w.to || "un amigo"}` : "invita a la comunidad"));
      const v = el("span", "vence");
      v.dataset.vence = String(w.expiresAt);
      v.textContent = "vence en " + falta(w.expiresAt);
      it.append(v);
      lista.append(it);
    }

    const rec = $("sello-pend-recientes"); rec.innerHTML = "";
    const ultimos = p.recent || [];
    if (!ultimos.length) {
      rec.append(el("p", "ayuda", "Aquí vas a ver los cafés que confirmaste, a quién le llegaron y si ya se canjearon."));
    } else {
      const sc = el("div", "tabla-scroll");
      const tb = el("table", "mt");
      const th = el("tr");
      for (const t of ["Confirmado", "Invitó", "Para", "Estado"]) th.append(el("th", null, t));
      const thead = el("thead"); thead.append(th); tb.append(thead);
      const body = el("tbody");
      for (const r of ultimos) {
        const tr = el("tr");
        let para = r.kind === "amigo" ? (r.to || "un amigo") : "La comunidad";
        if (r.takenBy) para += ` (lo tomó ${r.takenBy})`;
        else if (r.kind === "amigo" && r.status === "en_pozo") para += " (no lo usó: pasó al pozo)";
        const est = el("span", "sello-estado " + (r.status === "canjeado" ? "si" : r.status === "en_pozo" ? "pozo" : "no"),
          r.status === "canjeado" ? `Canjeado ${r.redeemedAt ? fecha(r.redeemedAt) : ""}`.trim()
            : r.status === "en_pozo" ? "En el pozo" : "Por usar");
        const tdEst = el("td"); tdEst.append(est);
        tr.append(el("td", null, r.confirmedAt ? fecha(r.confirmedAt) : "—"), el("td", "sello-texto", r.giver || "Tazador"),
          el("td", "sello-texto", para), tdEst);
        body.append(tr);
      }
      tb.append(body); sc.append(tb); rec.append(sc);
    }

    // Cuenta regresiva de los códigos y refresco cada 30 s mientras la cafetería está abierta
    clearInterval(reloj);
    const id = actual.id;
    let vueltas = 0;
    reloj = setInterval(() => {
      if (!actual || actual.id !== id || !document.body.contains(lista)) { clearInterval(reloj); return; }
      for (const v of lista.querySelectorAll(".vence")) v.textContent = "vence en " + falta(+v.dataset.vence);
      if (++vueltas % 3 === 0 && !document.hidden && document.activeElement !== $("sello-codigo") && document.activeElement !== $("sello-premio")) cargar();
    }, 10000);
  }

  function pintarSellos() {
    const c = datos.config || {};
    const s = datos.stamps || {};
    if (document.activeElement !== $("sello-premio")) $("sello-premio").value = c.prize || "";
    $("sello-necesarios").value = String(c.needed || 5);
    $("sello-activo").checked = !!c.active;
    vistaPrevia();

    const nums = $("sello-sel-numeros"); nums.innerHTML = "";
    nums.append(numero(s.activeCards, "tarjetas activas"), numero(s.completed, "tarjetas completas"),
      numero(s.redeemed, "premios canjeados"), numero(s.stamps30, "sellos (30 días)"));

    const rec = $("sello-sel-recientes"); rec.innerHTML = "";
    const ultimas = datos.recent || [];
    if (!ultimas.length) {
      rec.append(el("p", "ayuda", "Aquí vas a ver quién llenó su tarjeta y si ya canjeó su premio."));
      return;
    }
    const sc = el("div", "tabla-scroll");
    const tb = el("table", "mt");
    const th = el("tr");
    for (const t of ["Completó", "Jugador", "Premio", "Estado"]) th.append(el("th", null, t));
    const thead = el("thead"); thead.append(th); tb.append(thead);
    const body = el("tbody");
    for (const r of ultimas) {
      const tr = el("tr");
      const est = el("span", "sello-estado " + (r.status === "canjeado" ? "si" : r.status === "borrado" ? "borrado" : "no"),
        r.status === "canjeado" ? `Canjeado ${r.redeemedAt ? fecha(r.redeemedAt) : ""}`.trim()
          : r.status === "borrado" ? "Cupón borrado" : "Sin canjear");
      const tdEst = el("td"); tdEst.append(est);
      tr.append(el("td", null, r.completedAt ? fecha(r.completedAt) : "—"), el("td", "sello-texto", r.name || "Tazador"),
        el("td", "sello-texto", r.prize || ""), tdEst);
      body.append(tr);
    }
    tb.append(body); sc.append(tb); rec.append(sc);
  }

  // Dibujito de la tarjeta (círculos; el último es el premio)
  function vistaPrevia() {
    const v = $("sello-vista"); v.innerHTML = "";
    const n = +$("sello-necesarios").value || 5;
    for (let i = 0; i < n; i++) v.append(el("i", i === n - 1 ? "premio" : i < 2 ? "lleno" : ""));
  }

  // ------------------------------------------------------------------ acciones
  async function confirmar(ev) {
    ev.preventDefault();
    if (!actual) return;
    const r = $("sello-r-confirmar");
    const codigo = $("sello-codigo").value.trim();
    if (codigo.length < 6) { r.className = "resultado no"; r.textContent = "El código tiene 6 letras."; return; }
    r.className = "resultado"; r.textContent = "Revisando…";
    $("sello-b-confirmar").disabled = true;
    const { data, error } = await sb.rpc("pendiente_confirmar", { p_place: actual.id, p_code: codigo });
    $("sello-b-confirmar").disabled = false;
    if (error) { r.className = "resultado no"; r.textContent = textoError(error); return; }
    if (data && data.ok) {
      r.className = "resultado ok";
      r.textContent = "✔ " + data.message;
      $("sello-codigo").value = "";
      cargar();
    } else {
      r.className = "resultado no";
      r.textContent = "✖ " + ((data && data.message) || "No se pudo confirmar.");
    }
  }

  async function guardarConfig(ev) {
    ev.preventDefault();
    if (!actual) return;
    const premio = $("sello-premio").value.trim(), activo = $("sello-activo").checked;
    const necesarios = +$("sello-necesarios").value || 5;
    if (activo && premio.length < 3) { msg("sello-m-config", "Escribe el premio (mínimo 3 letras), por ejemplo: Un café gratis.", "error"); $("sello-premio").focus(); return; }
    msg("sello-m-config", "Guardando…");
    $("sello-b-guardar").disabled = true;
    const { data, error } = await sb.rpc("sello_guardar", { p_place: actual.id, p_needed: necesarios, p_prize: premio, p_active: activo });
    $("sello-b-guardar").disabled = false;
    if (error || !data || !data.ok) { msg("sello-m-config", error ? textoError(error) : (data && data.message) || "No se pudo guardar.", "error"); return; }
    msg("sello-m-config", data.message, "ok");
    cargar();
  }

  async function activarPendiente() {
    if (!actual) return;
    const ch = $("sello-pend-activo");
    ch.disabled = true;
    const { data, error } = await sb.rpc("pendiente_activar", { p_place: actual.id, p_on: ch.checked });
    ch.disabled = false;
    if (error || !data || !data.ok) {
      ch.checked = !ch.checked;
      msg("sello-m-pend", error ? textoError(error) : (data && data.message) || "No se pudo guardar.", "error");
      return;
    }
    msg("sello-m-pend", data.message, "ok");
  }

  // Se llama al abrir una cafetería (abrir() en index.html)
  window.cargarSellos = function () {
    if (!construir()) return;
    for (const id of ["sello-m-pend", "sello-m-config"]) msg(id);
    const r = $("sello-r-confirmar"); r.className = "resultado oculto"; r.textContent = "";
    $("sello-codigo").value = "";
    $("sello-premio").value = "";
    datos = null;
    clearInterval(reloj);
    cargar();
  };
})();
