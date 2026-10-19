// Día del Granito (sección Desarrollador del panel, solo administradores).
// Una tarde al mes un Granito sale muchísimo más en todo Tarija (1 de cada 3 apariciones, el doble en plazas y
// parques, brillante 5 veces más seguido) con XP extra y tareas especiales con premios. Aquí se programa (día, horas
// en hora de Bolivia, Granito protagonista, XP y tareas), se ve cómo queda el próximo y cómo le fue al último.
// Necesita el PASO 29 (PEGAR_EN_SUPABASE_29.sql). Todo pasa por funciones del servidor que revisan que seas administrador.
// Usa las globales del panel: sb, $, mostrar, msg, textoError, dosToques y esAdmin.
// Se dibuja dentro de <div id="diagranito-anchor"></div> y se carga con cargarDiaGranito() (desde cargarAdmin).
(function () {
  "use strict";

  const FALTA_PASO = "Falta actualizar el servidor: ejecuta PEGAR_EN_SUPABASE_29.sql en Supabase.";

  // Generación 1 (igual que species_catalog y Especies.cs): id, nombre, rareza, color del cuerpo
  const ESPECIES_DG = [
    ["arabica", "Arábica", "comun", "#7A4A2B"], ["cortado", "Cortadito", "comun", "#B07A4E"], ["capuchino", "Capuchino", "rara", "#6FA8DC"],
    ["robusta", "Robusta", "comun", "#5A3420"], ["americano", "Americano", "comun", "#E2A541"], ["moka", "Moka", "rara", "#6B3E26"],
    ["espresso", "Espressito", "comun", "#C0392B"], ["macchiato", "Macchiato", "rara", "#D2A679"], ["latte", "Lattecito", "comun", "#F4B6C2"],
    ["frappe", "Frappé", "rara", "#C9A27E"], ["florcita", "Florcita", "comun", "#7CB342"], ["cascarita", "Cascarita", "rara", "#B23A3A"],
    ["geisha", "Geisha", "epica", "#8C5A8E"], ["hielito", "Hielito", "comun", "#6FC3EE"], ["coldbrew", "Cold Brew", "comun", "#4A2A18"],
    ["nitro", "Nitro", "rara", "#2B1A12"], ["cacaito", "Cacaíto", "comun", "#E07A2E"], ["chocolatito", "Chocolatito", "rara", "#C62828"],
    ["jarrita", "Jarrita", "comun", "#A9B6C3"], ["espumon", "Espumón", "rara", "#E9DCC8"], ["molinillo", "Molinillo", "comun", "#A0703F"],
    ["prensita", "Prensita", "comun", "#3B2214"], ["chemex", "Chemex", "rara", "#8FB8C9"], ["italianita", "Italianita", "comun", "#B8C0C8"],
    ["terroncito", "Terroncito", "comun", "#E6DCCB"], ["caramelon", "Caramelón", "rara", "#D18A2B"], ["rosquete", "Rosquetito", "comun", "#E9C48A"],
    ["empanada", "Empanadita", "comun", "#E8D2A8"], ["alfajor", "Alfajorcito", "comun", "#D9BE8E"], ["bourbon", "Bourbon", "epica", "#D6A23A"],
    ["caranavi", "Caranavi", "epica", "#3E8E5A"],
  ];
  const LEGENDARIOS = ["bourbon", "caranavi"];
  const RAREZAS_DG = { comun: ["Comunes", "#c9b48d"], rara: ["Raras", "#4fd1c5"], epica: ["Épicas", "#c590ff"] };
  const especie = (id) => ESPECIES_DG.find((e) => e[0] === id) || [id, id, "comun", "#8A5A3C"];
  const nombreEsp = (id) => especie(id)[1];

  // Tareas y premios (iguales a community_day_tasks_error en el servidor)
  const TAREAS = [
    ["especie", "Atrapar al protagonista", 1, 100], ["capturas", "Atrapar Granitos", 1, 200], ["excelentes", "Tiros ¡Excelente!", 1, 50],
    ["paradas", "Girar paradas", 1, 60], ["brillante", "Atrapar al protagonista brillante", 1, 3],
  ];
  const PREMIOS = [["tazas", "Tazas", 5, 100], ["granos", "Granos dorados", 1, 10], ["aromas", "Aromas", 1, 3], ["semilla5", "Semillas de 5 km", 1, 2], ["semilla10", "Semilla de 10 km", 1, 1]];
  const SUGERIDAS = [
    { k: "especie", n: 10, r: "tazas", q: 30 }, { k: "capturas", n: 30, r: "granos", q: 3 }, { k: "paradas", n: 8, r: "aromas", q: 1 },
    { k: "excelentes", n: 3, r: "semilla5", q: 1 }, { k: "brillante", n: 1, r: "semilla10", q: 1 },
  ];
  const XPS = [[1, "Normal"], [1.5, "×1,5"], [2, "×2"], [3, "×3"]];
  const HORARIOS = [["14:00", "17:00", "Tarde (14 a 17)"], ["15:00", "18:00", "15 a 18"], ["16:00", "19:00", "16 a 19"], ["10:00", "13:00", "Mañana (10 a 13)"]];

  let dias = [], editando = null, armado = false, cargando = false, otraVez = false, reloj = null;

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
  function etiqueta(texto, clase, color) {
    const s = crear("span", "etq" + (clase ? " " + clase : ""));
    if (color) { const i = crear("i"); i.style.background = color; s.append(i); }
    s.append(texto);
    return s;
  }

  // Hora de Bolivia (UTC−4 fija)
  const BO = 4 * 36e5;
  const hoyBo = () => new Date(Date.now() - BO).toISOString().slice(0, 10);
  const DIAS = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];
  const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
  function fechaLarga(dia) {   // "sábado 24 de octubre de 2026" con "YYYY-MM-DD"
    const [y, m, d] = dia.split("-").map(Number);
    const w = new Date(Date.UTC(y, m - 1, d, 12)).getUTCDay();
    return `${DIAS[w]} ${d} de ${MESES[m - 1]} de ${y}`;
  }
  const instante = (dia, hora) => Date.parse(`${dia}T${hora}:00-04:00`);
  function falta(ms) {   // como el juego: "47 min", "2 h 15 min"
    const min = Math.max(1, Math.ceil(ms / 6e4));
    if (min < 60) return min + " min";
    const h = Math.floor(min / 60), m = min % 60;
    return m === 0 ? h + " h" : `${h} h ${m} min`;
  }
  function cuandoTexto(ini, fin, ahora) {   // lo que dice el cartel del juego
    if (ahora < ini) {
      if (ini - ahora <= 864e5) return "empieza en " + falta(ini - ahora);
      const d = new Date(ini - BO), h = new Date(ahora - BO);
      const dif = Math.round((Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()) - Date.UTC(h.getUTCFullYear(), h.getUTCMonth(), h.getUTCDate())) / 864e5);
      const hora = d.toISOString().slice(11, 16);
      return (dif === 1 ? "mañana" : `el ${String(d.getUTCDate()).padStart(2, "0")}/${String(d.getUTCMonth() + 1).padStart(2, "0")}`) + " a las " + hora;
    }
    if (ahora < fin) return "termina en " + falta(fin - ahora);
    return "terminó";
  }
  const textoTarea = (t, esp) => ({
    especie: t.n === 1 ? `Atrapa un ${esp}` : `Atrapa ${t.n} ${esp}`,
    capturas: t.n === 1 ? "Atrapa un Granito" : `Atrapa ${t.n} Granitos`,
    excelentes: t.n === 1 ? "Haz un tiro ¡Excelente!" : `Haz ${t.n} tiros ¡Excelente!`,
    paradas: t.n === 1 ? "Gira una parada" : `Gira ${t.n} paradas`,
    brillante: t.n === 1 ? `Atrapa un ${esp} brillante` : `Atrapa ${t.n} ${esp} brillantes`,
  }[t.k] || "Tarea especial");
  const textoPremio = (t) => ({
    tazas: `${t.q} tazas`, granos: t.q === 1 ? "1 grano dorado" : `${t.q} granos dorados`, aromas: t.q === 1 ? "1 aroma" : `${t.q} aromas`,
    semilla5: t.q === 1 ? "1 semilla de 5 km" : `${t.q} semillas de 5 km`, semilla10: "1 semilla de 10 km",
  }[t.r] || "premio");
  const xpTexto = (x) => "×" + String(+x).replace(".", ",");

  // ---------------------------------------------------------------- Estructura (se arma una sola vez)
  function armar() {
    if (armado) return true;
    const ancla = $("diagranito-anchor");
    if (!ancla) return false;
    armado = true;

    const css = crear("style");
    css.textContent = `
      .dg-vista { position: relative; overflow: hidden; border-radius: 14px; padding: 46px 16px 16px; color: #fff; margin: 4px 0 12px;
        background: linear-gradient(160deg, #3a1838, #12233a); }
      .dg-vista.curso { background: linear-gradient(160deg, #ff7a59, #b9322a); }
      .dg-vista .dg-band { position: absolute; left: 0; right: 0; top: 0; height: 38px; display: flex; justify-content: space-around; padding: 0 6px;
        background: linear-gradient(transparent 5px, rgba(255,255,255,.75) 5px, rgba(255,255,255,.75) 7px, transparent 7px); }
      .dg-vista .dg-band i { width: 20px; height: 26px; margin-top: 6px; clip-path: polygon(0 0, 100% 0, 50% 100%); transform-origin: top center; animation: dgMecer 2.4s ease-in-out infinite; }
      .dg-vista .dg-band i:nth-child(2n) { animation-delay: -1.1s; }
      @keyframes dgMecer { 0%, 100% { transform: rotate(-6deg); } 50% { transform: rotate(6deg); } }
      @media (prefers-reduced-motion: reduce) { .dg-vista .dg-band i { animation: none; } }
      .dg-rotulo { font-size: 11px; font-weight: 700; letter-spacing: 1px; opacity: .85; }
      .dg-banner { display: inline-flex; align-items: center; gap: 10px; border-radius: 99px; padding: 6px 18px 6px 6px; margin: 8px 0 10px; max-width: 100%;
        background: linear-gradient(#ff8a5b, #d2452f); box-shadow: 0 3px 0 rgba(0,0,0,.2); }
      .dg-banner.prox { background: linear-gradient(#4e2a4c, #3a1838); }
      .dg-banner .dg-foto { width: 42px; height: 42px; border-radius: 50%; border: 3px solid #fff; flex: none; display: grid; place-items: center;
        font-family: Fraunces, Georgia, serif; font-weight: 700; color: #fff; text-shadow: 0 1px 2px rgba(0,0,0,.4); }
      .dg-banner b { display: block; font-size: 15px; line-height: 1.2; }
      .dg-banner.prox b { color: #ffbe55; }
      .dg-banner small { display: block; font-size: 13px; opacity: .92; }
      .dg-banner > span:last-child { min-width: 0; }
      .dg-banner b, .dg-banner small { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
      .dg-detalle { font-size: 14px; opacity: .95; }
      .dg-chips { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 10px; }
      .dg-chips span { background: rgba(255,255,255,.18); border-radius: 99px; padding: 3px 10px; font-size: 12px; font-weight: 600; }
      .dg-tareas { margin: 10px 0 0; padding-left: 18px; font-size: 14px; }
      .dg-tareas li { margin: 2px 0; }
      .dg-tareas li span { opacity: .8; }
      .dg-num { display: flex; flex-wrap: wrap; gap: 14px; font-size: 13px; color: var(--suave); margin-top: 6px; }
      .dg-num b { font-family: Fraunces, serif; font-size: 18px; color: var(--noche); margin-right: 3px; }
      .dg-especies .opcion span i { width: 12px; height: 12px; box-shadow: inset 0 0 0 1px rgba(0,0,0,.15); }
      .dg-filas { width: 100%; border-collapse: collapse; font-size: 14px; }
      .dg-filas td { padding: 5px 4px; border-bottom: 1px solid var(--linea); vertical-align: middle; }
      .dg-filas select { padding: 7px 8px; font-size: 14px; width: 100%; min-width: 0; }
      .dg-filas input[type=number] { width: 76px !important; padding: 7px 8px; font-size: 14px; }
      .dg-filas .quitar { min-height: 34px; padding: 4px 10px; }
      .dg-horas { display: flex; gap: 10px; flex-wrap: wrap; }
      .dg-horas > div { flex: 1; min-width: 130px; }
      .dg-ultimo { border: 1px solid var(--linea); border-radius: 12px; padding: 12px 14px; margin-bottom: 12px; background: #fff; }
      .dg-ultimo h3 { font-size: 16px; margin: 0 0 8px; }
      @media (max-width: 640px) { .dg-filas td { display: block; border: 0; padding: 3px 0; } .dg-filas tr { display: block; border-bottom: 1px solid var(--linea); padding: 6px 0; }
        .dg-filas input[type=number] { width: 100% !important; } }
    `;
    document.head.append(css);

    const caja = crear("div", "tarjeta");
    caja.id = "t-diagranito";
    const enc = crear("div", "enc-tarjeta");
    const txt = crear("div");
    const h2 = crear("h2", null, "Día del Granito ");
    h2.append(crear("span", "chip", "Administrador"));
    txt.append(h2, crear("p", "sub", "Una tarde al mes un Granito sale muchísimo más en todo Tarija: 1 de cada 3 apariciones, el doble de Granitos en plazas y parques y brillante 5 veces más seguido. Con XP extra y tareas especiales con premios que se cobran hasta 24 horas después."));
    enc.append(txt, boton("+ Programar", "oro", () => abrirForm(null)));
    caja.append(enc);

    const vista = crear("div"); vista.id = "dg-proximo";
    const ultimo = crear("div"); ultimo.id = "dg-ultimo";
    const lista = crear("div"); lista.id = "dg-lista";
    const m = crear("p", "msg"); m.id = "m-diagranito"; m.setAttribute("role", "status");
    caja.append(vista, ultimo, lista, m);

    // ---------------- Formulario
    const f = crear("form", "ev-form oculto");
    f.id = "f-diagranito"; f.noValidate = true;
    f.innerHTML = `
      <h3 id="dg-titulo-form">Programar un Día del Granito</h3>
      <label>Granito protagonista</label>
      <div class="dg-especies" id="dg-especies"></div>
      <div class="grid2">
        <div>
          <label for="dg-titulo">Título <span class="contador" id="dg-cont">0/60</span></label>
          <input id="dg-titulo" type="text" maxlength="60" placeholder="Día del Granito: Bourbon">
          <p class="ayuda">Si lo dejas vacío: "Día del Granito: " y el nombre del Granito.</p>
        </div>
        <div>
          <label for="dg-dia">Día</label>
          <input id="dg-dia" type="date" required>
        </div>
      </div>
      <label>Horario (hora de Bolivia, el mismo día)</label>
      <div class="dg-horas">
        <div><label for="dg-desde">Empieza</label><input id="dg-desde" type="time" step="300" required></div>
        <div><label for="dg-hasta">Termina</label><input id="dg-hasta" type="time" step="300" required></div>
      </div>
      <div class="atajos" id="dg-atajos"></div>
      <p class="ayuda">Dura entre 30 minutos y 8 horas. Nunca puede haber dos al mismo tiempo.</p>
      <label>XP extra</label>
      <div class="opciones" id="dg-xp"></div>
      <p class="ayuda">Usa el multiplicador de los eventos: crea (y mantiene al día) un evento "Día del Granito" con la especie y la XP.</p>
      <label>Tareas especiales (hasta 6)</label>
      <div class="tabla-scroll"><table class="dg-filas"><tbody id="dg-tareas"></tbody></table></div>
      <div class="atajos"><button type="button" id="dg-mas">+ Agregar tarea</button><button type="button" id="dg-sugeridas">Usar las tareas sugeridas</button></div>
      <div id="dg-previa"></div>
      <div class="fila" style="margin-top:16px">
        <button class="btn" type="submit" id="dg-guardar">Guardar</button>
        <button class="btn borde" type="button" id="dg-cancelar">Cancelar</button>
      </div>
      <p class="msg" id="m-dg-form" role="status"></p>`;
    caja.append(f);
    ancla.append(caja);

    // Especies por rareza
    const cont = $("dg-especies");
    for (const r of ["epica", "rara", "comun"]) {
      const grupo = crear("div", "grupo-rareza");
      grupo.append(crear("b", null, RAREZAS_DG[r][0]));
      const ops = crear("div", "opciones");
      for (const [id, nombre, rz, color] of ESPECIES_DG.filter((e) => e[2] === r)) {
        const l = crear("label", "opcion");
        const i = crear("input"); i.type = "radio"; i.name = "dg-especie"; i.value = id;
        i.onchange = () => { tituloAuto(); previa(); };
        const s = crear("span");
        const punto = crear("i"); punto.style.background = color;
        s.append(punto, nombre + (LEGENDARIOS.includes(id) ? " (legendario)" : ""));
        l.append(i, s);
        ops.append(l);
      }
      grupo.append(ops);
      cont.append(grupo);
    }
    // XP
    for (const [v, t] of XPS) {
      const l = crear("label", "opcion");
      const i = crear("input"); i.type = "radio"; i.name = "dg-xp"; i.value = String(v); i.onchange = previa;
      const s = crear("span", null, t);
      l.append(i, s);
      $("dg-xp").append(l);
    }
    // Atajos de horario
    for (const [a, b, t] of HORARIOS) {
      const bt = crear("button", null, t); bt.type = "button";
      bt.onclick = () => { $("dg-desde").value = a; $("dg-hasta").value = b; if (!$("dg-dia").value) $("dg-dia").value = proximoSabado(); previa(); };
      $("dg-atajos").append(bt);
    }
    const sab = crear("button", null, "Próximo sábado"); sab.type = "button";
    sab.onclick = () => { $("dg-dia").value = proximoSabado(); previa(); };
    $("dg-atajos").append(sab);

    $("dg-mas").onclick = () => { if (filasTareas().length >= 6) { msg("m-dg-form", "Como máximo 6 tareas.", "error"); return; } agregarTarea({ k: "capturas", n: 20, r: "tazas", q: 20 }); previa(); };
    $("dg-sugeridas").onclick = () => { ponerTareas(SUGERIDAS); previa(); };
    $("dg-cancelar").onclick = cerrarForm;
    for (const id of ["dg-titulo", "dg-dia", "dg-desde", "dg-hasta"]) $(id).addEventListener("input", previa);
    f.addEventListener("submit", (ev) => { ev.preventDefault(); guardar(); });

    // La cuenta regresiva de la vista previa se mueve sola
    reloj = setInterval(() => { if (document.body.contains(caja) && !caja.closest(".oculto")) { pintarProximo(); if (!$("f-diagranito").classList.contains("oculto")) previa(); } }, 30000);
    return true;
  }

  function proximoSabado() {
    const h = hoyBo();
    const [y, m, d] = h.split("-").map(Number);
    const base = new Date(Date.UTC(y, m - 1, d, 12));
    const w = base.getUTCDay();
    base.setUTCDate(base.getUTCDate() + ((6 - w + 7) % 7 || 7));
    return base.toISOString().slice(0, 10);
  }

  // ---------------------------------------------------------------- Lista
  async function cargarDiaGranito() {
    if (!esAdmin || !armar()) return;
    if (cargando) { otraVez = true; return; }
    cargando = true;
    try {
      const { data, error: e } = await sb.rpc("admin_community_days");
      if (e) { msg("m-diagranito", error(e), "error"); dias = []; pintarTodo(); return; }
      dias = (data && data.days) || [];
      if ($("m-diagranito").classList.contains("error")) msg("m-diagranito");
      pintarTodo();
    } finally {
      cargando = false;
      if (otraVez) { otraVez = false; cargarDiaGranito(); }
    }
  }

  function estadoDe(d, ahora = Date.now()) {
    if (!d.active) return "cancelado";
    return ahora < Date.parse(d.starts_at) ? "prox" : ahora >= Date.parse(d.ends_at) ? "fin" : "curso";
  }

  function pintarTodo() { pintarProximo(); pintarUltimo(); pintarLista(); }

  // El que viene (o el que está pasando): así se ve en el juego
  function pintarProximo() {
    const caja = $("dg-proximo");
    if (!caja) return;
    caja.innerHTML = "";
    const ahora = Date.now();
    const vigentes = dias.filter((d) => d.active && Date.parse(d.ends_at) > ahora).sort((a, b) => Date.parse(a.starts_at) - Date.parse(b.starts_at));
    if (!vigentes.length) {
      caja.append(crear("p", "vacio-estado", "No hay ningún Día del Granito programado. Programa el próximo con el botón de arriba."));
      return;
    }
    caja.append(vistaJuego(vigentes[0], ahora));
  }

  function vistaJuego(d, ahora) {
    const ini = Date.parse(d.starts_at), fin = Date.parse(d.ends_at);
    const curso = ahora >= ini && ahora < fin;
    const v = crear("div", "dg-vista" + (curso ? " curso" : ""));
    const band = crear("div", "dg-band");
    const colores = ["#FF7A59", "#FFD27C", "#3EDBAE", "#62BEFF", "#FF8FC7", "#B08BFF", "#E5484D"];
    for (let i = 0; i < 12; i++) { const b = crear("i"); b.style.background = colores[i % colores.length]; band.append(b); }
    v.append(band, crear("div", "dg-rotulo", curso ? "EN CURSO · ASÍ SE VE EN EL MAPA" : "PRÓXIMO · ASÍ SE VE EN EL MAPA"));
    const ban = crear("div", "dg-banner" + (curso ? "" : " prox"));
    const foto = crear("span", "dg-foto", (d.name || nombreEsp(d.species)).charAt(0));
    foto.style.background = especie(d.species)[3];
    const tx = crear("span");
    tx.append(crear("b", null, "Día del Granito: " + (d.name || nombreEsp(d.species))), crear("small", null, cuandoTexto(ini, fin, ahora)));
    ban.append(foto, tx);
    v.append(ban);
    v.append(crear("div", "dg-detalle", `${d.title} · ${fechaLarga(d.day)} · de ${d.from} a ${d.to}`));
    const chips = crear("div", "dg-chips");
    for (const t of [`1 de cada 3 es ${d.name}`, "Más en plazas y parques", "Brillante ×5", +d.xp_mult > 1 ? `XP ${xpTexto(d.xp_mult)}` : null].filter(Boolean)) chips.append(crear("span", null, t));
    v.append(chips);
    const ul = crear("ul", "dg-tareas");
    for (const t of d.tasks || []) {
      const li = crear("li", null, textoTarea(t, d.name) + " ");
      li.append(crear("span", null, "→ " + textoPremio(t)));
      ul.append(li);
    }
    v.append(ul);
    return v;
  }

  // Cómo le fue al último que terminó
  function pintarUltimo() {
    const caja = $("dg-ultimo");
    if (!caja) return;
    caja.innerHTML = "";
    const ultimo = dias.filter((d) => estadoDe(d) === "fin").sort((a, b) => Date.parse(b.ends_at) - Date.parse(a.ends_at))[0];
    if (!ultimo) return;
    const box = crear("div", "dg-ultimo");
    box.append(crear("h3", null, `Cómo le fue al último: ${ultimo.title}`));
    box.append(crear("p", "ayuda", `${fechaLarga(ultimo.day)}, de ${ultimo.from} a ${ultimo.to}.`));
    const nums = crear("div", "numeros");
    const dato = (v, t) => { const n = crear("div", "numero"); n.append(crear("b", null, num(v)), crear("span", null, t)); return n; };
    nums.append(dato(ultimo.players, ultimo.players === 1 ? "jugador" : "jugadores"),
      dato(ultimo.species_catches, `${ultimo.name} atrapados`),
      dato(ultimo.catches, "Granitos atrapados en total"),
      dato(ultimo.shinies, `${ultimo.name} brillantes`),
      dato(ultimo.claims, `premios cobrados (${num(ultimo.claim_players)} ${ultimo.claim_players === 1 ? "jugador" : "jugadores"})`));
    box.append(nums);
    caja.append(box);
  }

  function pintarLista() {
    const lista = $("dg-lista");
    lista.innerHTML = "";
    if (!dias.length) return;
    const ahora = Date.now();
    for (const d of dias) {
      const est = estadoDe(d, ahora);
      const item = crear("div", "evento");
      item.style.setProperty("--c", especie(d.species)[3]);
      item.append(crear("div", "franja"));
      const cuerpo = crear("div", "cuerpo");
      cuerpo.append(crear("div", "nom", d.title));
      const ini = Date.parse(d.starts_at), fin = Date.parse(d.ends_at);
      const resto = est === "curso" ? ` · ${cuandoTexto(ini, fin, ahora)}` : est === "prox" ? ` · ${cuandoTexto(ini, fin, ahora)}` : "";
      cuerpo.append(crear("div", "cuando", `${fechaLarga(d.day)} · de ${d.from} a ${d.to}${resto}`));
      const etq = crear("div", "etiquetas");
      const nombreEstado = { curso: "En curso", prox: "Próximo", fin: "Terminado", cancelado: "Cancelado" }[est];
      etq.append(etiqueta(nombreEstado, "estado-" + (est === "cancelado" ? "fin" : est)),
        etiqueta(d.name + (LEGENDARIOS.includes(d.species) ? " (legendario)" : ""), null, especie(d.species)[3]));
      if (+d.xp_mult > 1) etq.append(etiqueta(`${xpTexto(d.xp_mult)} XP`, "xp"));
      etq.append(etiqueta(`${(d.tasks || []).length} ${(d.tasks || []).length === 1 ? "tarea" : "tareas"}`));
      cuerpo.append(etq);
      if (est === "curso" || est === "fin") {
        const nums = crear("div", "dg-num");
        const dato = (v, t) => { const s = crear("span"); s.append(crear("b", null, num(v)), t); return s; };
        nums.append(dato(d.players, d.players === 1 ? " jugador" : " jugadores"), dato(d.species_catches, ` ${d.name}`),
          dato(d.catches, " Granitos"), dato(d.shinies, " brillantes"), dato(d.claims, " premios cobrados"));
        cuerpo.append(nums);
      }
      item.append(cuerpo);

      const acciones = crear("div", "acciones");
      if (est === "prox" || est === "curso") acciones.append(boton("Editar", "borde chico", () => abrirForm(d)));
      if (est === "curso") {
        const b = boton("Terminar ahora", "borde chico");
        b.onclick = () => dosToques(b, "¿Terminarlo ya? Toca otra vez", () => terminar(d, b));
        acciones.append(b);
      }
      if (est === "prox") {
        const b = boton("Cancelar", "borde chico");
        b.onclick = () => dosToques(b, "¿Cancelarlo? Toca otra vez", () => terminar(d, b));
        acciones.append(b);
      }
      if (!d.claims) {
        const b = boton("Borrar", "peligro chico");
        b.onclick = () => dosToques(b, "¿Borrarlo? Toca otra vez", () => borrar(d, b));
        acciones.append(b);
      }
      if (est === "fin" || est === "cancelado") acciones.append(boton("Repetir", "borde chico", () => abrirForm(d, true)));
      item.append(acciones);
      lista.append(item);
    }
  }

  function refrescarEventos() {
    // El evento enlazado ("Día del Granito") aparece en la tarjeta Eventos
    if (typeof cargarEventos === "function") { try { cargarEventos(); } catch (e) { /* la tarjeta de eventos no está */ } }
  }

  async function terminar(d, b) {
    b.disabled = true;
    const { data, error: e } = await sb.rpc("admin_community_day_end", { p_id: d.id });
    b.disabled = false;
    if (e) { msg("m-diagranito", error(e), "error"); return; }
    if (!data || !data.ok) { msg("m-diagranito", (data && data.message) || "No se pudo terminar.", "error"); return; }
    msg("m-diagranito", data.cancelled ? `"${d.title}" quedó cancelado.` : `"${d.title}" terminó. Los jugadores tienen 24 horas para cobrar sus premios.`, "ok");
    cargarDiaGranito();
    refrescarEventos();
  }

  async function borrar(d, b) {
    b.disabled = true;
    const { data, error: e } = await sb.rpc("admin_community_day_delete", { p_id: d.id });
    b.disabled = false;
    if (e) { msg("m-diagranito", error(e), "error"); return; }
    if (!data || !data.ok) { msg("m-diagranito", (data && data.message) || "No se pudo borrar.", "error"); return; }
    msg("m-diagranito", "Día del Granito borrado.", "ok");
    if (editando && editando.id === d.id) cerrarForm();
    cargarDiaGranito();
    refrescarEventos();
  }

  // ---------------------------------------------------------------- Formulario
  const especieElegida = () => { const i = document.querySelector('input[name="dg-especie"]:checked'); return i ? i.value : null; };
  const xpElegida = () => { const i = document.querySelector('input[name="dg-xp"]:checked'); return i ? Number(i.value) : 1; };
  const filasTareas = () => Array.from($("dg-tareas").querySelectorAll("tr"));

  function elegirEspecie(id) { for (const i of document.querySelectorAll('input[name="dg-especie"]')) i.checked = i.value === id; }
  function elegirXp(v) { for (const i of document.querySelectorAll('input[name="dg-xp"]')) i.checked = Number(i.value) === Number(v); }

  // El título por defecto sigue al Granito (si no lo escribiste tú)
  function tituloAuto() {
    const t = $("dg-titulo");
    const esp = especieElegida();
    if (!esp) return;
    if (!t.value.trim() || /^Día del Granito: /.test(t.value.trim())) t.value = "Día del Granito: " + nombreEsp(esp);
  }

  function agregarTarea(t) {
    const tr = crear("tr");
    const tdK = crear("td"), tdN = crear("td"), tdR = crear("td"), tdQ = crear("td"), tdX = crear("td");
    const k = crear("select"); k.setAttribute("aria-label", "Tarea");
    for (const [id, nombre] of TAREAS) { const o = crear("option", null, nombre); o.value = id; k.append(o); }
    const n = crear("input"); n.type = "number"; n.min = "1"; n.step = "1"; n.setAttribute("aria-label", "Meta");
    const r = crear("select"); r.setAttribute("aria-label", "Premio");
    for (const [id, nombre] of PREMIOS) { const o = crear("option", null, nombre); o.value = id; r.append(o); }
    const q = crear("input"); q.type = "number"; q.min = "1"; q.step = "1"; q.setAttribute("aria-label", "Cantidad del premio");
    const quitar = boton("Quitar", "borde chico quitar", () => { tr.remove(); previa(); });
    k.value = t.k; n.value = t.n; r.value = t.r; q.value = t.q;
    const limites = () => {
      const tk = TAREAS.find((x) => x[0] === k.value) || TAREAS[0];
      n.min = String(tk[2]); n.max = String(tk[3]);
      const pr = PREMIOS.find((x) => x[0] === r.value) || PREMIOS[0];
      q.min = String(pr[2]); q.max = String(pr[3]);
      q.disabled = pr[2] === pr[3];
      if (q.disabled) q.value = String(pr[2]);
    };
    k.onchange = () => { limites(); previa(); };
    r.onchange = () => { limites(); if (+q.value > +q.max || +q.value < +q.min) q.value = q.max === q.min ? q.min : String(Math.min(+q.max, Math.max(+q.min, +q.value || +q.min))); previa(); };
    n.oninput = previa; q.oninput = previa;
    limites();
    tdK.append(k); tdN.append(n); tdR.append(r); tdQ.append(q); tdX.append(quitar);
    tr.append(tdK, tdN, tdR, tdQ, tdX);
    $("dg-tareas").append(tr);
  }

  function ponerTareas(lista) {
    $("dg-tareas").innerHTML = "";
    for (const t of lista || SUGERIDAS) agregarTarea(t);
  }

  function leerTareas() {
    const filas = filasTareas();
    if (!filas.length || filas.length > 6) throw new Error("Pon entre 1 y 6 tareas.");
    return filas.map((tr, i) => {
      const [k, r] = tr.querySelectorAll("select");
      const [n, q] = tr.querySelectorAll("input");
      const tk = TAREAS.find((x) => x[0] === k.value), pr = PREMIOS.find((x) => x[0] === r.value);
      const vn = Number(n.value), vq = Number(q.value);
      if (!Number.isInteger(vn) || vn < tk[2] || vn > tk[3]) throw new Error(`Tarea ${i + 1}: la meta va de ${tk[2]} a ${tk[3]}.`);
      if (!Number.isInteger(vq) || vq < pr[2] || vq > pr[3]) throw new Error(`Tarea ${i + 1}: el premio va de ${pr[2]} a ${pr[3]}.`);
      return { k: k.value, n: vn, r: r.value, q: vq };
    });
  }

  function previa() {
    const caja = $("dg-previa");
    if (!caja) return;
    $("dg-cont").textContent = `${$("dg-titulo").value.length}/60`;
    caja.innerHTML = "";
    const esp = especieElegida(), dia = $("dg-dia").value, a = $("dg-desde").value, b = $("dg-hasta").value;
    if (!esp || !dia || !a || !b || b <= a) return;
    let tareas;
    try { tareas = leerTareas(); } catch (e) { tareas = []; }
    const d = {
      species: esp, name: nombreEsp(esp), title: $("dg-titulo").value.trim() || "Día del Granito: " + nombreEsp(esp),
      starts_at: new Date(instante(dia, a)).toISOString(), ends_at: new Date(instante(dia, b)).toISOString(),
      day: dia, from: a, to: b, xp_mult: xpElegida(), tasks: tareas,
    };
    caja.append(vistaJuego(d, Date.now()));
  }

  const yaEmpezo = (d) => d && Date.now() >= Date.parse(d.starts_at);

  // d: día a editar (o null). repetir: copia uno terminado para el mes siguiente (día nuevo).
  function abrirForm(d, repetir) {
    if (!armar()) return;
    editando = d && !repetir ? d : null;
    mostrar("f-diagranito", true);
    msg("m-dg-form");
    $("dg-titulo-form").textContent = editando ? `Editar: ${d.title}` : repetir ? "Repetir el Día del Granito" : "Programar un Día del Granito";
    if (d) {
      elegirEspecie(d.species);
      $("dg-titulo").value = d.title;
      $("dg-dia").value = repetir ? "" : d.day;
      $("dg-desde").value = d.from; $("dg-hasta").value = d.to;
      elegirXp(d.xp_mult);
      ponerTareas(d.tasks);
    } else {
      elegirEspecie("bourbon");
      $("dg-titulo").value = "";
      tituloAuto();
      $("dg-dia").value = proximoSabado();
      $("dg-desde").value = "14:00"; $("dg-hasta").value = "17:00";
      elegirXp(2);
      ponerTareas(SUGERIDAS);
    }
    // Ya empezado: el Granito, el día, la hora de inicio y las tareas quedan fijos
    const fijo = yaEmpezo(editando);
    for (const i of document.querySelectorAll('input[name="dg-especie"]')) i.disabled = fijo;
    $("dg-dia").disabled = fijo; $("dg-desde").disabled = fijo;
    for (const el of $("f-diagranito").querySelectorAll("#dg-tareas select, #dg-tareas input, #dg-tareas button, #dg-mas, #dg-sugeridas")) el.disabled = fijo;
    for (const bt of $("dg-atajos").querySelectorAll("button")) bt.disabled = fijo;
    $("dg-dia").min = fijo ? "" : hoyBo();
    if (fijo) msg("m-dg-form", "Ya empezó: puedes cambiar el título, la hora de fin y la XP.", "");
    previa();
    $("f-diagranito").scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function cerrarForm() {
    editando = null;
    mostrar("f-diagranito", false);
    msg("m-dg-form");
  }

  async function guardar() {
    const esp = especieElegida(), dia = $("dg-dia").value, a = $("dg-desde").value, b = $("dg-hasta").value;
    const titulo = $("dg-titulo").value.trim();
    if (!esp) { msg("m-dg-form", "Elige el Granito protagonista.", "error"); return; }
    if (titulo && (titulo.length < 3 || titulo.length > 60)) { msg("m-dg-form", "El título debe tener entre 3 y 60 letras.", "error"); return; }
    if (!dia || !a || !b) { msg("m-dg-form", "Elige el día y las horas de inicio y de fin.", "error"); return; }
    if (b <= a) { msg("m-dg-form", "La hora de fin tiene que ser después de la de inicio (el mismo día).", "error"); return; }
    const dur = (instante(dia, b) - instante(dia, a)) / 6e4;
    if (dur < 30 || dur > 480) { msg("m-dg-form", "El Día del Granito dura entre 30 minutos y 8 horas.", "error"); return; }
    if (!yaEmpezo(editando) && instante(dia, a) < Date.now()) { msg("m-dg-form", "La hora de inicio ya pasó.", "error"); return; }
    let tareas;
    try { tareas = leerTareas(); } catch (e) { msg("m-dg-form", e.message, "error"); return; }
    const bt = $("dg-guardar");
    bt.disabled = true;
    msg("m-dg-form", "Guardando…");
    const { data, error: e } = await sb.rpc("admin_community_day_save", {
      p_id: editando ? editando.id : null, p_species: esp, p_title: titulo || null, p_day: dia, p_from: a, p_to: b,
      p_xp_mult: xpElegida(), p_tasks: tareas,
    });
    bt.disabled = false;
    if (e) { msg("m-dg-form", error(e), "error"); return; }
    if (!data || !data.ok) { msg("m-dg-form", (data && data.message) || "No se pudo guardar.", "error"); return; }
    msg("m-diagranito", editando ? "Día del Granito actualizado." : `Listo: ${nombreEsp(esp)} el ${fechaLarga(dia)}, de ${a} a ${b}.`, "ok");
    cerrarForm();
    cargarDiaGranito();
    refrescarEventos();
  }

  window.cargarDiaGranito = cargarDiaGranito;
})();
