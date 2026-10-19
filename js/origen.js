// Origen del café (PASO 19 en Supabase, migración 0024):
// El dueño (o un administrador) elige de 1 a 3 regiones de Bolivia de donde viene el café que sirve.
// - Aparecen en la ficha de la cafetería dentro del juego ("Café de: Caranavi · Nor Yungas").
// - Cuando un jugador hace check-in aquí, las descubre en su "Mapa del café" (+150 XP por cada origen nuevo).
// Todo pasa por origin_place_get / origin_place_set (el servidor revisa permisos, el catálogo y el máximo de 3).
// Usa lo que ya define index.html: sb, $, msg, textoError, dosToques, actual.
(function () {
  "use strict";

  const SIN_SERVIDOR = /Could not find the function|PGRST202/i;
  const MAX = 3;
  // Los mismos colores que en el juego (Core/MundoApiOrigen.cs)
  const COLORES = {
    caranavi: "#D2453A", nor_yungas: "#2FAE6A", sud_yungas: "#1C9C9C", inquisivi: "#E39B2D",
    larecaja: "#8A5CD6", apolo: "#E0663A", samaipata: "#3B8FE0", mezcla: "#B07A45",
  };

  let datos = null;        // última respuesta de origin_place_get
  let guardados = [];      // lo que está guardado en el servidor
  let elegidos = [];       // lo marcado ahora en pantalla
  let lugar = null;        // id de la cafetería de los datos cargados
  let pedido = 0;
  let ocupado = false;

  function el(tag, clase, texto) {
    const e = document.createElement(tag);
    if (clase) e.className = clase;
    if (texto !== undefined && texto !== null) e.textContent = texto;
    return e;
  }
  const igual = (a, b) => a.length === b.length && a.every((x) => b.includes(x));

  function estilos() {
    if (document.getElementById("org-estilos")) return;
    const s = el("style");
    s.id = "org-estilos";
    s.textContent = `
      .org-grilla { display: grid; grid-template-columns: repeat(auto-fill, minmax(210px, 1fr)); gap: 10px; margin: 4px 0 6px; }
      .org-op { position: relative; display: flex; flex-direction: column; gap: 3px; text-align: left; background: var(--papel);
        border: 1px solid var(--linea); border-radius: 12px; padding: 12px 40px 12px 14px; cursor: pointer;
        transition: border-color .15s, box-shadow .15s, background .15s, opacity .15s; }
      .org-op:hover { border-color: var(--oro); }
      .org-op:focus-visible { outline: 2px solid var(--oro); outline-offset: 2px; }
      .org-op .org-cab { display: flex; align-items: center; gap: 8px; }
      .org-op .org-punto { width: 14px; height: 14px; border-radius: 50%; flex: none; box-shadow: 0 0 0 2px #fff, 0 0 0 3px rgba(0,0,0,.08); }
      .org-op b { font-family: Fraunces, Georgia, serif; font-size: 17px; color: var(--noche); line-height: 1.2; }
      .org-op .org-zona { font-size: 11px; font-weight: 700; color: var(--suave); text-transform: uppercase; letter-spacing: .5px; }
      .org-op .org-desc { font-size: 13px; color: var(--tinta); line-height: 1.4; }
      .org-op .org-cuantas { font-size: 12px; color: var(--suave); margin-top: 2px; }
      .org-op .org-check { position: absolute; top: 11px; right: 11px; width: 22px; height: 22px; border-radius: 50%;
        border: 2px solid #cdbfa6; display: grid; place-items: center; font-size: 13px; font-weight: 700; color: #fff; }
      .org-op[aria-pressed="true"] { border-color: var(--oro); background: #fff8e8; box-shadow: inset 0 0 0 1px var(--oro); }
      .org-op[aria-pressed="true"] .org-check { background: var(--ok); border-color: var(--ok); }
      .org-op[aria-pressed="true"] .org-check::after { content: "✓"; }
      .org-op.lleno { opacity: .55; }
      .org-vista { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; margin: 10px 0 0; font-size: 14px; color: var(--suave); }
      .org-chip { display: inline-flex; align-items: center; gap: 6px; padding: 3px 10px; border-radius: 99px; color: #fff; font-weight: 600; font-size: 13px; }
    `;
    document.head.append(s);
  }

  function construir() {
    const raiz = $("origen-anchor");
    if (!raiz) return false;
    if (raiz.dataset.listo) return true;
    raiz.dataset.listo = "1";
    estilos();
    raiz.innerHTML = `
      <div class="tarjeta" id="org-tarjeta">
        <h2>Origen de tu café</h2>
        <p class="sub">Cuéntales a los jugadores de dónde viene el café que sirves. Elige de 1 a 3 regiones: aparecen en la ficha de tu cafetería y, cuando un jugador hace check-in aquí, las descubre en su Mapa del café (+150 XP por cada origen nuevo).</p>
        <p class="vacio-estado oculto" id="org-pronto"></p>
        <div id="org-cuerpo">
          <div class="org-grilla" id="org-grilla" role="group" aria-label="Orígenes del café"></div>
          <p class="ayuda" id="org-cuenta"></p>
          <div class="org-vista" id="org-vista" aria-live="polite"></div>
          <div class="fila" style="margin-top:14px">
            <button class="btn" type="button" id="org-guardar">Guardar orígenes</button>
            <button class="btn borde" type="button" id="org-quitar">Quitar todos</button>
          </div>
          <p class="msg" id="org-m" role="status"></p>
          <p class="ayuda" id="org-jugadores"></p>
        </div>
      </div>`;
    $("org-guardar").addEventListener("click", guardar);
    $("org-quitar").addEventListener("click", (ev) => {
      const b = ev.currentTarget;
      dosToques(b, "¿Quitar todos? Toca otra vez", () => enviar([], b));
    });
    return true;
  }

  // ------------------------------------------------------------------ datos
  async function cargar() {
    if (!actual) return;
    const id = actual.id, n = ++pedido;
    $("org-grilla").textContent = "";
    $("org-cuenta").textContent = "Cargando orígenes…";
    $("org-vista").textContent = "";
    $("org-jugadores").textContent = "";
    const { data, error } = await sb.rpc("origin_place_get", { p_place: id });
    if (n !== pedido || !actual || actual.id !== id) return;   // ya se abrió otra cafetería
    const pronto = error && SIN_SERVIDOR.test(error.message || "");
    $("org-pronto").textContent = pronto ? "El origen del café se activa pronto (falta el PASO 19 en el servidor)." : "";
    $("org-pronto").classList.toggle("oculto", !pronto);
    $("org-cuerpo").classList.toggle("oculto", !!pronto);
    if (pronto) return;
    if (error || !data || !data.ok) {
      $("org-cuenta").textContent = "";
      msg("org-m", error ? textoError(error) : (data && data.message) || "No se pudieron cargar los orígenes.", "error");
      return;
    }
    datos = data;
    lugar = id;
    const validos = new Set((data.catalog || []).map((c) => c.id));
    guardados = (data.selected || []).filter((x) => validos.has(x));
    elegidos = guardados.slice();
    pintar();
  }

  // ------------------------------------------------------------------ pantalla
  function nombreDe(id) {
    const c = datos && (datos.catalog || []).find((x) => x.id === id);
    return c ? c.name : id;
  }

  function pintar() {
    if (!datos) return;
    const g = $("org-grilla");
    g.textContent = "";
    const lleno = elegidos.length >= MAX;
    const cafes = datos.cafes || {};
    for (const c of datos.catalog || []) {
      const marcado = elegidos.includes(c.id);
      const b = el("button", "org-op" + (lleno && !marcado ? " lleno" : ""));
      b.type = "button";
      b.setAttribute("aria-pressed", String(marcado));
      const cab = el("span", "org-cab");
      const punto = el("span", "org-punto");
      punto.style.background = COLORES[c.id] || "#9a7b5c";
      cab.append(punto, el("b", null, c.name));
      b.append(cab, el("span", "org-zona", c.area), el("span", "org-desc", c.description));
      // Cuántas cafeterías visibles lo sirven (sin contar el cambio que todavía no se guardó)
      let n = +cafes[c.id] || 0;
      if (guardados.includes(c.id) && !marcado) n = Math.max(0, n - 1);
      if (!guardados.includes(c.id) && marcado && actual && actual.active) n += 1;
      b.append(el("span", "org-cuantas", n === 0 ? "Ninguna cafetería lo sirve todavía" : n === 1 ? "Lo sirve 1 cafetería" : `Lo sirven ${n} cafeterías`));
      b.append(el("span", "org-check"));
      b.addEventListener("click", () => alternar(c.id));
      g.append(b);
    }
    const quedan = MAX - elegidos.length;
    $("org-cuenta").textContent = elegidos.length === 0
      ? "Toca de 1 a 3 orígenes."
      : quedan > 0 ? `Elegiste ${elegidos.length} de ${MAX}. Puedes sumar ${quedan === 1 ? "1 más" : quedan + " más"}.` : `Elegiste ${MAX} de ${MAX} (el máximo).`;

    // Así se ve en la ficha del juego
    const v = $("org-vista");
    v.textContent = "";
    if (elegidos.length) {
      v.append(el("span", null, "En el juego:"), el("span", null, "Café de"));
      const orden = (datos.catalog || []).map((c) => c.id).filter((id) => elegidos.includes(id));
      for (const id of orden) {
        const chip = el("span", "org-chip", nombreDe(id));
        chip.style.background = COLORES[id] || "#9a7b5c";
        v.append(chip);
      }
    }

    const cambio = !igual(elegidos, guardados);
    $("org-guardar").disabled = ocupado || !cambio || elegidos.length === 0;
    $("org-guardar").textContent = cambio ? "Guardar orígenes" : "Guardado";
    $("org-quitar").classList.toggle("oculto", guardados.length === 0);
    const jug = +datos.players || 0;
    $("org-jugadores").textContent = jug === 0
      ? "Todavía ningún jugador descubrió orígenes del café en tu cafetería."
      : jug === 1 ? "1 origen descubierto por jugadores en tu cafetería." : `${jug.toLocaleString("es-BO")} orígenes descubiertos por jugadores en tu cafetería.`;
  }

  function alternar(id) {
    msg("org-m");
    if (elegidos.includes(id)) elegidos = elegidos.filter((x) => x !== id);
    else if (elegidos.length >= MAX) { msg("org-m", "Puedes elegir hasta 3 orígenes. Quita uno primero.", "error"); return; }
    else elegidos = elegidos.concat(id);
    pintar();
  }

  // ------------------------------------------------------------------ acciones
  function guardar() {
    if (!elegidos.length) { msg("org-m", "Elige al menos 1 origen (o usa «Quitar todos»).", "error"); return; }
    enviar(elegidos.slice(), $("org-guardar"));
  }

  async function enviar(lista, boton) {
    if (!actual || ocupado) return;
    const id = actual.id;
    if (lugar !== id) return;
    ocupado = true;
    boton.disabled = true;
    msg("org-m", "Guardando…");
    const { data, error } = await sb.rpc("origin_place_set", { p_place: id, p_origins: lista });
    ocupado = false;
    boton.disabled = false;
    if (!actual || actual.id !== id) return;
    if (error || !data || !data.ok) {
      msg("org-m", error ? textoError(error) : (data && data.message) || "No se pudieron guardar los orígenes.", "error");
      pintar();
      return;
    }
    const antes = guardados.slice();
    guardados = (data.selected || []).slice();
    elegidos = guardados.slice();
    actual.coffee_origins = guardados.slice();
    // Ajusta el contador de cafeterías sin volver a pedir todo
    if (datos && datos.cafes && actual.active) {
      for (const x of antes) if (!guardados.includes(x)) datos.cafes[x] = Math.max(0, (+datos.cafes[x] || 0) - 1);
      for (const x of guardados) if (!antes.includes(x)) datos.cafes[x] = (+datos.cafes[x] || 0) + 1;
    }
    msg("org-m", guardados.length
      ? "Orígenes guardados. Ya se ven en la ficha de tu cafetería en el juego."
      : "Listo: tu cafetería ya no muestra orígenes.", "ok");
    pintar();
  }

  // Se llama al abrir una cafetería (abrir() en index.html)
  window.cargarOrigen = function () {
    if (!construir()) return;
    msg("org-m");
    datos = null; lugar = null; guardados = []; elegidos = [];
    cargar();
  };
})();
