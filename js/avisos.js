// Avisos al celular con el juego cerrado (PASO 32 en Supabase, migración 0037).
// - Desarrollador › "Enviar aviso" (solo administradores): título (hasta 40 letras), texto (hasta 120), para todos o
//   para los jugadores de una cafetería, ahora o programado (hora de Bolivia), con vista previa, cuántos lo recibirían
//   y el historial (también los avisos de las cafeterías) con cuántos lo recibieron.
// - Cafetería › "Avisos a tus clientes" (dueño o administrador; plan premium): 1 aviso por semana a los clientes
//   frecuentes (2 o más check-ins en los últimos 60 días), con vista previa y contador en vivo.
// Todos los límites los revisa el servidor (avisos_admin_crear, avisos_cafe_enviar). Los textos se pintan con textContent.
// Usa lo que ya define index.html: sb, $, msg, textoError, dosToques, actual.
// Anclas: <div id="avisos-admin"></div> (Desarrollador) y <div id="avisos-cafe"></div> (editor de la cafetería).
(function () {
  "use strict";

  const ZONA = "America/La_Paz";
  const OFFSET = "-04:00";   // Bolivia no tiene horario de verano
  const SIN_SERVIDOR = /Could not find the function|PGRST202/i;
  const PRONTO = "Los avisos llegan pronto (falta ejecutar PEGAR_EN_SUPABASE_32.sql en Supabase).";
  const MAX_TITULO = 40, MAX_TEXTO = 120;

  // ------------------------------------------------------------------ utilidades
  function el(tag, clase, texto) {
    const e = document.createElement(tag);
    if (clase) e.className = clase;
    if (texto !== undefined && texto !== null) e.textContent = texto;
    return e;
  }
  const num = (n) => Number(n || 0).toLocaleString("es-BO");
  const plural = (n, uno, varios) => `${num(n)} ${Number(n) === 1 ? uno : varios}`;
  const limpio = (t) => (t || "").replace(/\s+/g, " ").trim();
  const fecha = (epoch) => new Date(epoch * 1000).toLocaleString("es-BO", {
    timeZone: ZONA, weekday: "short", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false,
  });
  const horaBo = (epoch) => new Date(epoch * 1000).toLocaleTimeString("es-BO", { timeZone: ZONA, hour: "2-digit", minute: "2-digit", hour12: false });
  const deNoche = (ms) => { const h = new Date(ms - 4 * 3600e3).getUTCHours(); return h >= 22 || h < 8; };
  const errorTxt = (error, data, porDefecto) =>
    error ? (SIN_SERVIDOR.test(error.message || "") ? PRONTO : textoError(error)) : (data && data.message) || porDefecto;

  function estilos() {
    if (document.getElementById("av-estilos")) return;
    const s = el("style");
    s.id = "av-estilos";
    s.textContent = `
      .av-cab { display: flex; gap: 16px; align-items: center; flex-wrap: wrap; margin-bottom: 8px; }
      .av-cab .av-ico { width: 56px; height: 56px; border-radius: 50%; flex: none; display: grid; place-items: center;
        background: linear-gradient(160deg, #ffd27c, #f2b43c); box-shadow: 0 3px 0 rgba(150, 100, 10, .25); }
      .av-cab .tx { flex: 1; min-width: 220px; }
      .av-cab .sub { margin: 0; }
      .av-grid { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 340px); gap: 4px 22px; align-items: start; }
      @media (max-width: 760px) { .av-grid { grid-template-columns: 1fr; } }
      .av-celu { background: #1b283d; border-radius: 18px; padding: 14px 12px 16px; margin-top: 14px; }
      .av-celu .rotulo { font-size: 12px; font-weight: 600; color: #b9c4d3; letter-spacing: .3px; margin: 0 4px 8px; }
      .av-noti { background: #f4f1ec; color: #1d2a3a; border-radius: 16px; padding: 10px 12px 12px; box-shadow: 0 2px 10px rgba(0,0,0,.25); }
      .av-noti .app { display: flex; align-items: center; gap: 6px; font-size: 12px; color: #5f6b7a; }
      .av-noti .app i { width: 18px; height: 18px; border-radius: 50%; background: #f2b43c; display: grid; place-items: center; }
      .av-noti .app b { font-weight: 600; color: #3a4656; }
      .av-noti .tt { font-weight: 700; font-size: 15px; margin-top: 4px; overflow-wrap: anywhere; }
      .av-noti .tx { font-size: 14px; margin-top: 2px; overflow-wrap: anywhere; white-space: pre-wrap; }
      .av-noti .vacio { color: #9aa3ae; }
      .av-alcance { margin: 10px 4px 0; font-size: 14px; color: #d8e0ea; }
      .av-alcance b { color: #ffd27c; font-size: 18px; }
      .av-hist { display: grid; gap: 10px; margin-top: 6px; }
      .av-item { border: 1px solid var(--linea); border-radius: 12px; background: #fff; padding: 10px 14px; display: flex; gap: 10px 16px;
        align-items: center; flex-wrap: wrap; }
      .av-item .t { flex: 1; min-width: 220px; }
      .av-item .t b { font-family: Fraunces, Georgia, serif; font-size: 17px; color: var(--noche); overflow-wrap: anywhere; }
      .av-item .t p { margin: 2px 0 0; font-size: 14px; overflow-wrap: anywhere; }
      .av-item .t small { display: block; color: var(--suave); font-size: 13px; margin-top: 4px; }
      .av-item .cifra { text-align: right; font-size: 13px; color: var(--suave); }
      .av-item .cifra b { display: block; font-family: Fraunces, serif; font-size: 22px; color: var(--noche); line-height: 1; }
      .av-bloque { border-top: 1px solid var(--linea); margin-top: 18px; padding-top: 14px; }
      .av-form .opciones { margin-top: 2px; }
    `;
    document.head.append(s);
  }

  const ICONO = `<svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="#3a2a0c" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
    <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/></svg>`;
  const ICONO_CHICO = `<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#3a2a0c" stroke-width="3" stroke-linecap="round" aria-hidden="true">
    <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/></svg>`;

  // Vista previa: cómo se ve la notificación en el celular
  function vistaPrevia(contenedor, prefijo) {
    const celu = el("div", "av-celu");
    celu.append(el("div", "rotulo", "Así llega al celular"));
    const noti = el("div", "av-noti");
    const app = el("div", "app");
    const ico = el("i"); ico.innerHTML = ICONO_CHICO;
    const nombre = el("b", null, "Tazadores");
    const sub = el("span", null, "");
    sub.id = prefijo + "-pv-sub";
    app.append(ico, nombre, sub, el("span", null, "· ahora"));
    const tt = el("div", "tt"); tt.id = prefijo + "-pv-tit";
    const tx = el("div", "tx"); tx.id = prefijo + "-pv-txt";
    noti.append(app, tt, tx);
    const alc = el("div", "av-alcance"); alc.id = prefijo + "-alcance";
    celu.append(noti, alc);
    contenedor.append(celu);
  }
  function pintarPrevia(prefijo, titulo, texto, sub) {
    const t = $(prefijo + "-pv-tit"), x = $(prefijo + "-pv-txt"), s = $(prefijo + "-pv-sub");
    if (!t) return;
    t.textContent = titulo || "Título del aviso";
    t.classList.toggle("vacio", !titulo);
    x.textContent = texto || "Aquí va el texto (hasta 120 letras).";
    x.classList.toggle("vacio", !texto);
    s.textContent = sub ? "· " + sub : "";
  }
  function campoTexto(contenedor, id, etiqueta, max, ejemplo, area) {
    const lab = el("label");
    lab.htmlFor = id;
    lab.append(etiqueta + " ");
    const c = el("span", "contador", `0/${max}`); c.id = id + "-cont";
    lab.append(c);
    const inp = area ? el("textarea") : el("input");
    if (!area) inp.type = "text";
    inp.id = id; inp.maxLength = max; inp.placeholder = ejemplo; inp.autocomplete = "off";
    if (area) inp.style.minHeight = "70px";
    contenedor.append(lab, inp);
    return inp;
  }

  // =================================================================== Administrador
  let admin = null;          // última respuesta de avisos_admin_lista
  let lugares = null;        // [{id, name}] para elegir la cafetería
  let alcanceSeq = 0, alcanceTimer = null;

  function construirAdmin() {
    const raiz = $("avisos-admin");
    if (!raiz) return false;
    if (raiz.dataset.listo) return true;
    raiz.dataset.listo = "1";
    estilos();
    const t = el("div", "tarjeta");
    t.id = "av-admin-tarjeta";
    const cab = el("div", "av-cab");
    const ico = el("div", "av-ico"); ico.innerHTML = ICONO;
    const tx = el("div", "tx");
    tx.append(el("h2", null, "Enviar aviso"),
      el("p", "sub", "Una notificación al celular de los jugadores, aunque tengan el juego cerrado. Llega en los próximos 30 minutos (nunca de 22:00 a 08:00) y vale 24 horas. Cada jugador recibe como máximo 3 avisos por día y puede apagar los de Eventos."));
    cab.append(ico, tx);
    t.append(cab);

    const pronto = el("p", "vacio-estado oculto"); pronto.id = "av-a-pronto";
    t.append(pronto);
    const cuerpo = el("div"); cuerpo.id = "av-a-cuerpo";
    const nums = el("div", "numeros");
    nums.style.gridTemplateColumns = "repeat(3, 1fr)";
    for (const [id, txt] of [["av-a-dev", "Celulares con avisos"], ["av-a-sem", "Activos esta semana"], ["av-a-hoy", "Avisos entregados hoy"]]) {
      const n = el("div", "numero"); const b = el("b", null, "0"); b.id = id;
      n.append(b, el("span", null, txt));
      nums.append(n);
    }
    cuerpo.append(nums);

    const grid = el("div", "av-grid");
    const form = el("form", "av-form"); form.id = "av-a-form"; form.noValidate = true;
    form.append(el("h3", null, "Nuevo aviso"));
    campoTexto(form, "av-a-tit", "Título", MAX_TITULO, "¡Llegó el Día del Lattecito!");
    campoTexto(form, "av-a-txt", "Texto", MAX_TEXTO, "Este sábado sale muchísimo Lattecito en todo Tarija. ¡Sal a cazar!", true);

    const labPara = el("label", null, "Para"); labPara.id = "av-a-para-tit";
    const para = el("div", "opciones"); para.setAttribute("role", "radiogroup"); para.setAttribute("aria-labelledby", "av-a-para-tit");
    for (const [v, txt] of [["todos", "Todos los jugadores"], ["cafe", "Jugadores de una cafetería"]]) {
      const lab = el("label", "opcion");
      const inp = el("input"); inp.type = "radio"; inp.name = "av-a-para"; inp.value = v; if (v === "todos") inp.checked = true;
      lab.append(inp, el("span", null, txt));
      para.append(lab);
    }
    const sel = el("select"); sel.id = "av-a-lugar"; sel.className = "oculto"; sel.setAttribute("aria-label", "Cafetería");
    sel.style.marginTop = "8px";
    const ayudaPara = el("p", "ayuda", "Jugadores de una cafetería: los que hicieron check-in ahí alguna vez.");

    const labCuando = el("label", null, "Cuándo"); labCuando.id = "av-a-cuando-tit";
    const cuando = el("div", "opciones"); cuando.setAttribute("role", "radiogroup"); cuando.setAttribute("aria-labelledby", "av-a-cuando-tit");
    for (const [v, txt] of [["ahora", "Ahora"], ["prog", "Programar"]]) {
      const lab = el("label", "opcion");
      const inp = el("input"); inp.type = "radio"; inp.name = "av-a-cuando"; inp.value = v; if (v === "ahora") inp.checked = true;
      lab.append(inp, el("span", null, txt));
      cuando.append(lab);
    }
    const fechaInp = el("input"); fechaInp.type = "datetime-local"; fechaInp.id = "av-a-fecha"; fechaInp.className = "oculto";
    fechaInp.style.marginTop = "8px"; fechaInp.setAttribute("aria-label", "Fecha y hora (Bolivia)");
    const explica = el("p", "ayuda"); explica.id = "av-a-explica";
    const fila = el("div", "fila"); fila.style.marginTop = "14px";
    const enviar = el("button", "btn oro", "Enviar aviso"); enviar.type = "submit"; enviar.id = "av-a-enviar";
    fila.append(enviar);
    const m = el("p", "msg"); m.id = "av-a-m"; m.setAttribute("role", "status");
    form.append(labPara, para, sel, ayudaPara, labCuando, cuando, fechaInp, explica, fila, m);
    const lado = el("div");
    vistaPrevia(lado, "av-a");
    grid.append(form, lado);
    cuerpo.append(grid);

    const hist = el("div", "av-bloque");
    hist.append(el("h3", null, "Historial"),
      el("p", "ayuda", "Los últimos avisos del equipo y de las cafeterías. «Recibieron» cuenta a quienes de verdad les llegó."));
    const lista = el("div", "av-hist"); lista.id = "av-a-hist";
    hist.append(lista);
    cuerpo.append(hist);
    t.append(cuerpo);
    raiz.append(t);

    form.addEventListener("input", explicarAdmin);
    form.addEventListener("change", (ev) => {
      if (ev.target && (ev.target.name === "av-a-para" || ev.target.id === "av-a-lugar")) pedirAlcance();
      explicarAdmin();
    });
    form.addEventListener("submit", (ev) => { ev.preventDefault(); enviarAdmin(); });
    return true;
  }

  const paraAdmin = () => (document.querySelector('input[name="av-a-para"]:checked') || {}).value || "todos";
  const cuandoAdmin = () => (document.querySelector('input[name="av-a-cuando"]:checked') || {}).value || "ahora";

  // Próxima hora en punto (+1 h) en hora de Bolivia, para el campo de fecha
  function fechaPorDefecto() {
    const ms = Math.ceil((Date.now() + 3600e3) / 3600e3) * 3600e3;
    let loc = new Date(ms - 4 * 3600e3);
    if (loc.getUTCHours() >= 22 || loc.getUTCHours() < 8) {   // de noche no sale: mejor mañana a las 9:00
      if (loc.getUTCHours() >= 22) loc = new Date(loc.getTime() + 24 * 3600e3);
      loc.setUTCHours(9, 0, 0, 0);
    }
    return loc.toISOString().slice(0, 16);
  }

  function explicarAdmin() {
    const tit = limpio($("av-a-tit").value), txt = limpio($("av-a-txt").value);
    $("av-a-tit-cont").textContent = `${$("av-a-tit").value.length}/${MAX_TITULO}`;
    $("av-a-txt-cont").textContent = `${$("av-a-txt").value.length}/${MAX_TEXTO}`;
    pintarPrevia("av-a", tit, txt, "");
    const cafe = paraAdmin() === "cafe";
    $("av-a-lugar").classList.toggle("oculto", !cafe);
    const prog = cuandoAdmin() === "prog";
    $("av-a-fecha").classList.toggle("oculto", !prog);
    if (prog && !$("av-a-fecha").value) $("av-a-fecha").value = fechaPorDefecto();
    let e = "";
    if (prog) {
      const ms = Date.parse(`${$("av-a-fecha").value}:00${OFFSET}`);
      if (isNaN(ms)) e = "Elige el día y la hora (hora de Bolivia).";
      else {
        e = `Sale el ${fecha(ms / 1000)} y vale 24 horas.`;
        if (deNoche(ms)) e += " De 22:00 a 08:00 no se envían avisos: sale a partir de las 08:00.";
      }
    } else {
      e = "Sale en los próximos 30 minutos y vale 24 horas.";
      if (deNoche(Date.now())) e += " Ahora es de noche: sale a partir de las 08:00.";
    }
    $("av-a-explica").textContent = e + " Máximo 3 avisos del equipo por día.";
  }

  function pedirAlcance() {
    clearTimeout(alcanceTimer);
    alcanceTimer = setTimeout(cargarAlcance, 250);
  }
  async function cargarAlcance() {
    const destino = $("av-a-alcance");
    if (!destino) return;
    const cafe = paraAdmin() === "cafe";
    const lugar = cafe ? $("av-a-lugar").value : null;
    if (cafe && !lugar) { destino.textContent = "Elige la cafetería."; return; }
    const seq = ++alcanceSeq;
    destino.textContent = "Contando…";
    const { data, error } = await sb.rpc("avisos_admin_alcance", { p_place: lugar });
    if (seq !== alcanceSeq) return;
    destino.textContent = "";
    if (error || !data || !data.ok) { destino.textContent = errorTxt(error, data, "No se pudo contar."); return; }
    destino.append("Le llega a ", el("b", null, num(data.reach)), ` ${Number(data.reach) === 1 ? "persona" : "personas"} con los avisos activados`);
    destino.append(cafe ? ` (de ${plural(data.players, "jugador", "jugadores")} de la cafetería).` : ".");
  }

  async function cargarLugares() {
    if (lugares) return;
    const { data, error } = await sb.from("places").select("id,name").order("name");
    if (error) return;
    lugares = data || [];
    const sel = $("av-a-lugar");
    sel.innerHTML = "";
    const o0 = el("option", null, "Elige la cafetería…"); o0.value = "";
    sel.append(o0);
    for (const l of lugares) { const o = el("option", null, l.name); o.value = l.id; sel.append(o); }
  }

  async function cargarAdminAvisos() {
    if (!construirAdmin()) return;
    const { data, error } = await sb.rpc("avisos_admin_lista");
    const listo = !error && data && data.ok;
    $("av-a-cuerpo").classList.toggle("oculto", !listo);
    $("av-a-pronto").classList.toggle("oculto", !!listo);
    if (!listo) { $("av-a-pronto").textContent = errorTxt(error, data, "No se pudo cargar."); return; }
    admin = data;
    $("av-a-dev").textContent = num(data.devices);
    $("av-a-sem").textContent = num(data.devicesWeek);
    $("av-a-hoy").textContent = num(data.sentToday);
    pintarHistorialAdmin();
    explicarAdmin();
    await cargarLugares();
    pedirAlcance();
  }

  const ESTADOS = {
    scheduled: ["Programado", "estado-prox"], sending: ["Enviándose", "estado-curso"],
    done: ["Terminado", "estado-fin"], cancelled: ["Cancelado", "estado-fin"],
  };

  function pintarHistorialAdmin() {
    const c = $("av-a-hist"); c.innerHTML = "";
    const items = (admin && admin.items) || [];
    if (!items.length) { c.append(el("p", "ayuda", "Todavía no se envió ningún aviso.")); return; }
    for (const a of items) {
      const item = el("div", "av-item");
      const t = el("div", "t");
      const cab = el("div", "fila"); cab.style.gap = "8px";
      const [est, clase] = ESTADOS[a.state] || ESTADOS.done;
      cab.append(el("b", null, a.title), el("span", "etq " + clase, est));
      t.append(cab, el("p", null, a.body));
      const para = a.origin === "cafe" ? `Clientes frecuentes de ${a.place ? a.place.name : "una cafetería"} (de la cafetería)`
        : a.audience === "cafe" ? `Jugadores de ${a.place ? a.place.name : "una cafetería"}` : "Todos los jugadores";
      t.append(el("small", null, `${fecha(a.sendAt)} · ${para}`));
      const cifra = el("div", "cifra");
      cifra.append(el("b", null, num(a.delivered)), el("span", null, a.audience === "todos" ? "recibieron" : `recibieron de ${num(a.recipients)}`));
      item.append(t, cifra);
      if (a.origin === "admin" && (a.state === "scheduled" || a.state === "sending")) {
        const b = el("button", "btn peligro chico", a.state === "scheduled" ? "Cancelar" : "Detener");
        b.type = "button";
        b.onclick = () => dosToques(b, a.state === "scheduled" ? "¿Cancelar? Toca otra vez" : "¿Detener? Toca otra vez", () => cancelarAdmin(a, b));
        item.append(b);
      }
      c.append(item);
    }
  }

  async function enviarAdmin() {
    const titulo = limpio($("av-a-tit").value), texto = limpio($("av-a-txt").value);
    if (titulo.length < 3 || titulo.length > MAX_TITULO) { msg("av-a-m", `El título va de 3 a ${MAX_TITULO} letras.`, "error"); $("av-a-tit").focus(); return; }
    if (texto.length < 3 || texto.length > MAX_TEXTO) { msg("av-a-m", `El texto va de 3 a ${MAX_TEXTO} letras.`, "error"); $("av-a-txt").focus(); return; }
    const cafe = paraAdmin() === "cafe";
    const lugar = cafe ? $("av-a-lugar").value : null;
    if (cafe && !lugar) { msg("av-a-m", "Elige la cafetería.", "error"); return; }
    let cuando = null;
    if (cuandoAdmin() === "prog") {
      cuando = `${$("av-a-fecha").value}:00${OFFSET}`;
      const ms = Date.parse(cuando);
      if (isNaN(ms)) { msg("av-a-m", "Elige el día y la hora.", "error"); return; }
      if (ms < Date.now() - 60e3) { msg("av-a-m", "Esa hora ya pasó.", "error"); return; }
      if (ms > Date.now() + 14 * 86400e3) { msg("av-a-m", "Puedes programarlo hasta dentro de 14 días.", "error"); return; }
    }
    const b = $("av-a-enviar");
    dosToques(b, cuando ? "¿Programar? Toca otra vez" : "¿Enviar ya? Toca otra vez", async () => {
      b.dataset.confirmar = ""; b.textContent = "Enviar aviso"; b.classList.remove("confirmar");
      b.disabled = true;
      msg("av-a-m", "Enviando…");
      const { data, error } = await sb.rpc("avisos_admin_crear", { p_title: titulo, p_body: texto, p_place: lugar, p_send_at: cuando });
      b.disabled = false;
      if (error || !data || !data.ok) { msg("av-a-m", errorTxt(error, data, "No se pudo enviar."), "error"); return; }
      msg("av-a-m", data.message, "ok");
      $("av-a-tit").value = ""; $("av-a-txt").value = "";
      await cargarAdminAvisos();
      msg("av-a-m", data.message, "ok");
    });
  }

  async function cancelarAdmin(a, boton) {
    boton.disabled = true;
    const { data, error } = await sb.rpc("avisos_admin_cancelar", { p_id: a.id });
    if (error || !data || !data.ok) {
      msg("av-a-m", errorTxt(error, data, "No se pudo cancelar."), "error");
      boton.disabled = false;
      return;
    }
    await cargarAdminAvisos();
    msg("av-a-m", data.message, "ok");
  }

  // =================================================================== Cafetería
  let cafe = null;   // última respuesta de avisos_cafe_estado

  function construirCafe() {
    const raiz = $("avisos-cafe");
    if (!raiz) return false;
    if (raiz.dataset.listo) return true;
    raiz.dataset.listo = "1";
    estilos();
    const t = el("div", "tarjeta");
    const cab = el("div", "av-cab");
    const ico = el("div", "av-ico"); ico.innerHTML = ICONO;
    const tx = el("div", "tx");
    tx.append(el("h2", null, "Avisos a tus clientes"),
      el("p", "sub", "Manda un aviso al celular de tus clientes frecuentes (2 o más visitas en los últimos 60 días), aunque tengan el juego cerrado. Uno por semana: úsalo para algo que valga la pena, como una promo del día."));
    cab.append(ico, tx);
    t.append(cab);
    const pronto = el("p", "vacio-estado oculto"); pronto.id = "av-c-pronto";
    t.append(pronto);

    const cuerpo = el("div"); cuerpo.id = "av-c-cuerpo";
    const nums = el("div", "numeros");
    nums.style.gridTemplateColumns = "repeat(3, 1fr)";
    for (const [id, txt] of [["av-c-frec", "Clientes frecuentes"], ["av-c-reach", "Con los avisos activados"], ["av-c-prox", "Próximo aviso"]]) {
      const n = el("div", "numero"); const b = el("b", null, "—"); b.id = id;
      n.append(b, el("span", null, txt));
      nums.append(n);
    }
    cuerpo.append(nums);
    const bloqueo = el("div", "bloqueo oculto"); bloqueo.id = "av-c-bloqueo";
    cuerpo.append(bloqueo);

    const grid = el("div", "av-grid");
    const form = el("form", "av-form"); form.id = "av-c-form"; form.noValidate = true;
    form.append(el("h3", null, "Nuevo aviso"));
    campoTexto(form, "av-c-tit", "Título", MAX_TITULO, "Martes de torta");
    campoTexto(form, "av-c-txt", "Texto", MAX_TEXTO, "Hoy 2x1 en torta de limón hasta las 18:00. ¡Te esperamos!", true);
    const explica = el("p", "ayuda"); explica.id = "av-c-explica";
    const fila = el("div", "fila"); fila.style.marginTop = "14px";
    const enviar = el("button", "btn oro", "Enviar a mis clientes"); enviar.type = "submit"; enviar.id = "av-c-enviar";
    fila.append(enviar);
    const m = el("p", "msg"); m.id = "av-c-m"; m.setAttribute("role", "status");
    form.append(explica, fila, m);
    const lado = el("div");
    vistaPrevia(lado, "av-c");
    grid.append(form, lado);
    cuerpo.append(grid);

    const hist = el("div", "av-bloque");
    hist.append(el("h3", null, "Tus avisos"));
    const lista = el("div", "av-hist"); lista.id = "av-c-hist";
    hist.append(lista);
    cuerpo.append(hist);
    t.append(cuerpo);
    raiz.append(t);

    form.addEventListener("input", explicarCafe);
    form.addEventListener("submit", (ev) => { ev.preventDefault(); enviarCafe(); });
    return true;
  }

  // ¿Puede enviar ahora? (lo mismo revisa el servidor)
  function bloqueoCafe() {
    if (!cafe) return "Cargando…";
    if (!cafe.premium && !cafe.admin) return "Los avisos a tus clientes son del plan premium. Pásate a premium (en la sección Plan) para usarlos.";
    if (!cafe.placeActive) return "Tu cafetería está oculta en el juego. Hazla visible para enviar avisos.";
    if (cafe.nextAt && cafe.nextAt * 1000 > Date.now()) return `Ya enviaste el aviso de esta semana. El próximo, desde el ${fecha(cafe.nextAt)}.`;
    if (!cafe.regulars) return "Todavía no tienes clientes frecuentes (2 o más check-ins en los últimos 60 días). Invita a tus clientes a escanear tu QR en cada visita.";
    return null;
  }

  function explicarCafe() {
    if (!cafe) return;
    const tit = limpio($("av-c-tit").value), txt = limpio($("av-c-txt").value);
    $("av-c-tit-cont").textContent = `${$("av-c-tit").value.length}/${MAX_TITULO}`;
    $("av-c-txt-cont").textContent = `${$("av-c-txt").value.length}/${MAX_TEXTO}`;
    pintarPrevia("av-c", tit, txt, cafe.placeName);
    const alc = $("av-c-alcance");
    alc.textContent = "";
    alc.append("Le llega a ", el("b", null, num(cafe.reach)), ` de tus ${plural(cafe.regulars, "cliente frecuente", "clientes frecuentes")}`,
      " (los que tienen los avisos activados).");
    const b = bloqueoCafe();
    $("av-c-bloqueo").textContent = b || "";
    $("av-c-bloqueo").classList.toggle("oculto", !b);
    $("av-c-enviar").disabled = !!b;
    let e = "Llega en los próximos 30 minutos y vale 24 horas. Solo 1 por semana.";
    if (deNoche(Date.now())) e += " Ahora es de noche: sale a partir de las 08:00.";
    $("av-c-explica").textContent = e;
  }

  async function cargarCafeAvisos() {
    if (!construirCafe() || !actual) return;
    const id = actual.id;
    const { data, error } = await sb.rpc("avisos_cafe_estado", { p_place: id });
    if (!actual || actual.id !== id) return;
    const listo = !error && data && data.ok;
    $("av-c-cuerpo").classList.toggle("oculto", !listo);
    $("av-c-pronto").classList.toggle("oculto", !!listo);
    if (!listo) { $("av-c-pronto").textContent = errorTxt(error, data, "No se pudo cargar."); return; }
    cafe = data;
    $("av-c-frec").textContent = num(data.regulars);
    $("av-c-reach").textContent = num(data.reach);
    $("av-c-prox").textContent = data.nextAt && data.nextAt * 1000 > Date.now()
      ? new Date(data.nextAt * 1000).toLocaleDateString("es-BO", { timeZone: ZONA, day: "2-digit", month: "2-digit" }) + " " + horaBo(data.nextAt)
      : "Ahora";
    explicarCafe();
    pintarHistorialCafe();
  }

  function pintarHistorialCafe() {
    const c = $("av-c-hist"); c.innerHTML = "";
    const h = (cafe && cafe.history) || [];
    if (!h.length) { c.append(el("p", "ayuda", "Aquí vas a ver tus avisos y a cuántos clientes les llegó cada uno.")); return; }
    for (const a of h) {
      const item = el("div", "av-item");
      const t = el("div", "t");
      const cab = el("div", "fila"); cab.style.gap = "8px";
      cab.append(el("b", null, a.title));
      if (a.sending) cab.append(el("span", "etq estado-curso", "Enviándose"));
      if (a.cancelled) cab.append(el("span", "etq estado-fin", "Detenido"));
      t.append(cab, el("p", null, a.body), el("small", null, fecha(a.sendAt)));
      const cifra = el("div", "cifra");
      cifra.append(el("b", null, num(a.delivered)), el("span", null, `recibieron de ${num(a.recipients)}`));
      item.append(t, cifra);
      c.append(item);
    }
  }

  async function enviarCafe() {
    if (!actual || !cafe) return;
    const b = bloqueoCafe();
    if (b) { msg("av-c-m", b, "error"); return; }
    const titulo = limpio($("av-c-tit").value), texto = limpio($("av-c-txt").value);
    if (titulo.length < 3 || titulo.length > MAX_TITULO) { msg("av-c-m", `El título va de 3 a ${MAX_TITULO} letras.`, "error"); $("av-c-tit").focus(); return; }
    if (texto.length < 3 || texto.length > MAX_TEXTO) { msg("av-c-m", `El texto va de 3 a ${MAX_TEXTO} letras.`, "error"); $("av-c-txt").focus(); return; }
    const boton = $("av-c-enviar");
    dosToques(boton, `¿Enviar a ${plural(cafe.reach, "cliente", "clientes")}? Toca otra vez`, async () => {
      boton.dataset.confirmar = ""; boton.textContent = "Enviar a mis clientes"; boton.classList.remove("confirmar");
      boton.disabled = true;
      msg("av-c-m", "Enviando…");
      const id = actual.id;
      const { data, error } = await sb.rpc("avisos_cafe_enviar", { p_place: id, p_title: titulo, p_body: texto });
      boton.disabled = false;
      if (error || !data || !data.ok) { msg("av-c-m", errorTxt(error, data, "No se pudo enviar."), "error"); await cargarCafeAvisos(); return; }
      $("av-c-tit").value = ""; $("av-c-txt").value = "";
      await cargarCafeAvisos();
      msg("av-c-m", data.message, "ok");
    });
  }

  // Se llama desde cargarAdmin() en index.html
  window.cargarAvisosAdmin = function () {
    if (!construirAdmin()) return;
    msg("av-a-m");
    cargarAdminAvisos();
  };
  // Se llama al abrir una cafetería (abrir() en index.html)
  window.cargarAvisosCafe = function () {
    if (!construirCafe()) return;
    msg("av-c-m");
    cafe = null;
    $("av-c-tit").value = ""; $("av-c-txt").value = "";
    cargarCafeAvisos();
  };
})();
