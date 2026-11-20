/* VAMO by FLUVA · componentes SVG reutilizables (logo, íconos, pines de mapa, chips).
   Se usan en la app y, más adelante, en el panel de administración. Todo es SVG propio: el kit UI es solo referencia. */
(function () {
  const C = {
    // Paleta del kit visual VAMO (claro)
    fondo: '#0B0F24', morado: '#7B2FF7', turquesa: '#00C8FF', fucsia: '#FF007A', violeta: '#7B2FF7', amarillo: '#FFC107', blanco: '#FFFFFF',
    texto: '#1F2A44', texto2: '#6B7280', borde: '#E5E7EB', tarjeta: '#F3F4F6',
    auto: '#1F2A44', taxi: '#FFC107', bus: '#7B2FF7', colectivo: '#00C8FF', micro: '#22C55E', moto: '#FF7A00', ocupado: '#9CA3AF'
  };

  // Íconos de línea en una grilla de 24 × 24 (trazo = currentColor)
  const P = {
    auto: 'M5 17h14v-4l-2-5H7l-2 5v4z M5 13h14 M7.5 17v2 M16.5 17v2 M8 15h.01 M16 15h.01',
    taxi: 'M5 17h14v-4l-2-5H7l-2 5v4z M5 13h14 M7.5 17v2 M16.5 17v2 M8 15h.01 M16 15h.01 M10 5h4v3h-4z',
    bus: 'M6 4h12a2 2 0 0 1 2 2v11H4V6a2 2 0 0 1 2-2z M4 11h16 M7 17v3 M17 17v3 M8 14h.01 M16 14h.01',
    micro: 'M5 6h14a1 1 0 0 1 1 1v9H4V7a1 1 0 0 1 1-1z M4 11h16 M9 6v5 M14 6v5 M7 16v2 M17 16v2',
    moto: 'M2 17a3 3 0 1 0 6 0a3 3 0 1 0-6 0 M16 17a3 3 0 1 0 6 0a3 3 0 1 0-6 0 M5 17l4-6h5l3 6 M14 11l-1-4h3',
    ocupado: 'M5 17h14v-4l-2-5H7l-2 5v4z M5 13h14 M7.5 17v2 M16.5 17v2',
    inicio: 'M3 11l9-7 9 7 M5 10v10h14V10',
    rutas: 'M4 19a2 2 0 1 0 4 0a2 2 0 1 0-4 0 M16 6a2 2 0 1 0 4 0a2 2 0 1 0-4 0 M8 19h7a3 3 0 0 0 0-6H9a3 3 0 0 1 0-6h7',
    delivery: 'M5 8h14l-1 12H6z M9 8V6a3 3 0 0 1 6 0v2',
    duenos: 'M3 14a4 4 0 1 0 8 0a4 4 0 1 0-8 0 M10.5 12.5L20 4 M17 7l2 2 M15 9l2 2',
    planificar: 'M3 6l6-2 6 2 6-2v14l-6 2-6-2-6 2z M9 4v14 M15 6v14',
    ubicacion: 'M12 21s-7-6.2-7-11a7 7 0 0 1 14 0c0 4.8-7 11-7 11z M9.5 10a2.5 2.5 0 1 0 5 0a2.5 2.5 0 1 0-5 0',
    paradero: 'M7 3h10v8H7z M12 11v10 M9 21h6 M9 6h6',
    estrella: 'M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.2 9.5l6.1-.9z',
    campana: 'M6 16V11a6 6 0 0 1 12 0v5l2 2H4z M10 20a2 2 0 0 0 4 0',
    filtro: 'M3 5h18l-7 8v6l-4 2v-8z',
    sol: 'M7 12a5 5 0 1 0 10 0a5 5 0 1 0-10 0 M12 1v2 M12 21v2 M4.2 4.2l1.4 1.4 M18.4 18.4l1.4 1.4 M1 12h2 M21 12h2 M4.2 19.8l1.4-1.4 M18.4 5.6l1.4-1.4',
    luna: 'M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z',
    comunidad: 'M5 9a3 3 0 1 0 6 0a3 3 0 1 0-6 0 M13 9a3 3 0 1 0 6 0a3 3 0 1 0-6 0 M2 20c0-3 3-5 6-5s6 2 6 5 M12 15.5c1-.3 2-.5 4-.5 3 0 6 2 6 5',
    misviajes: 'M4 7h16v4a2 2 0 0 0 0 4v4H4v-4a2 2 0 0 0 0-4z M10 7v12',
    mas: 'M4 4h6v6H4z M14 4h6v6h-6z M4 14h6v6H4z M14 14h6v6h-6z',
    colectivo: 'M4 16V9a2 2 0 0 1 2-2h9l4 4v5H4z M4 12h15 M8 7v5 M7.5 16v2 M16.5 16v2',
    qr: 'M4 4h6v6H4z M14 4h6v6h-6z M4 14h6v6H4z M14 14h2v2h-2z M18 18h2v2h-2z M14 18h2 M18 14h2',
    hoja: 'M5 19c0-8 5-14 15-14 0 10-6 15-14 15 M5 19l7-7',
    senal: 'M2 9a15 15 0 0 1 20 0 M5 12.5a10 10 0 0 1 14 0 M8.5 16a5 5 0 0 1 7 0 M12 19.5h.01',
    capas: 'M12 3l9 5-9 5-9-5z M3 13l9 5 9-5',
    cambiar: 'M7 4L3 8l4 4 M3 8h14 M17 20l4-4-4-4 M21 16H7',
    reloj: 'M3 12a9 9 0 1 0 18 0a9 9 0 1 0-18 0 M12 7v5l3 2',
    cupos: 'M5 8a3 3 0 1 0 6 0a3 3 0 1 0-6 0 M2 20c0-3 3-5 6-5s6 2 6 5 M15 6a3 3 0 0 1 0 6 M17 15c3 .5 5 2.3 5 5',
    megafono: 'M3 10v4h4l8 5V5L7 10z M18 9a4 4 0 0 1 0 6 M7 14l1.5 6h3L10 15',
    bandera: 'M5 21V4 M5 4h12l-2 4 2 4H5',
    play: 'M7 4l13 8-13 8z',
    check: 'M4 12l5 5L20 6',
    alerta: 'M12 3l10 18H2z M12 10v4 M12 17.5h.01',
    miubicacion: 'M12 2v3 M12 19v3 M2 12h3 M19 12h3 M6 12a6 6 0 1 0 12 0a6 6 0 1 0-12 0 M10 12a2 2 0 1 0 4 0a2 2 0 1 0-4 0'
  };
  const icono = (n, size = 20, extra = '') =>
    `<svg viewBox="0 0 24 24" width="${size}" height="${size}" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" ${extra}><path d="${P[n] || P.inicio}"/></svg>`;

  // Logo 2026: V turquesa con carretera que sube hasta el marcador de ubicación (paleta FLUVA).
  // Geometría en un lienzo de 140 × 110; la usan la marca, el ícono de la app y la animación de inicio.
  const MARCA = { turquesa: '#00E5D6', turquesa2: '#00B3C6', azul: '#0A4B7A', noche: '#0B1E3F', blanco: '#FFFFFF' };
  const LOGO = {
    brazo: 'M8 16Q6 8 14 8H32Q39 8 41 15L60 76Q52 92 50 100Q42 100 39 90Z',
    hoja: 'M50 100C58 80 66 64 78 54C90 44 104 39 120 36C108 46 100 58 92 74C82 94 68 102 50 100Z',
    via: 'M39 90C48 62 76 40 118 31L120 36C104 39 90 44 78 54C66 64 58 80 50 100Q42 99 39 90Z',
    borde: 'M39 90C48 62 76 40 118 31',
    eje: 'M45 94C54 66 78 44 119 33.5',
    pin: 'M122 44C114 35 108 30 108 22A14 14 0 1 1 136 22C136 30 130 35 122 44Z'
  };
  let uid = 0;
  function logoDefs(g) {
    return `<linearGradient id="${g}a" x1="0" y1="0" x2=".6" y2="1"><stop offset="0" stop-color="#3FF5E6"/><stop offset=".55" stop-color="${MARCA.turquesa2}"/><stop offset="1" stop-color="#0A6FA0"/></linearGradient>
      <linearGradient id="${g}h" x1="0" y1="1" x2="1" y2="0"><stop offset="0" stop-color="${MARCA.turquesa}"/><stop offset="1" stop-color="${MARCA.turquesa2}"/></linearGradient>
      <linearGradient id="${g}v" x1="0" y1="1" x2="1" y2="0"><stop offset="0" stop-color="${MARCA.azul}"/><stop offset="1" stop-color="#1E6FB0"/></linearGradient>`;
  }
  // Cuerpo del logo (sin <svg>), con clases para poder animar cada pieza
  function logoCuerpo(g) {
    return `<path class="lv-brazo" d="${LOGO.brazo}" fill="url(#${g}a)"/>
      <path class="lv-hoja" d="${LOGO.hoja}" fill="url(#${g}h)"/>
      <path class="lv-via" d="${LOGO.via}" fill="url(#${g}v)"/>
      <path class="lv-eje" d="${LOGO.eje}" fill="none" stroke="#fff" stroke-width="2.4" stroke-dasharray="7 6" stroke-linecap="round"/>
      <path class="lv-borde" d="${LOGO.borde}" fill="none" stroke="#fff" stroke-width="1.8" stroke-linecap="round"/>
      <g class="lv-pin"><path d="${LOGO.pin}" fill="#00C9CF" stroke="#fff" stroke-width="3" stroke-linejoin="round"/><circle cx="122" cy="21" r="4.6" fill="#fff"/></g>`;
  }
  function logoV(size = 34) {
    const g = 'vg' + (++uid);
    return `<svg viewBox="0 0 140 110" width="${Math.round(size * 140 / 110)}" height="${size}" aria-hidden="true" class="vamo-v"><defs>${logoDefs(g)}</defs>${logoCuerpo(g)}</svg>`;
  }
  // Marca completa: V + VAMO + «by FLUVA» (la A final en turquesa)
  function marca() {
    return `<span class="vamo-marca" role="img" aria-label="VAMO by FLUVA">${logoV(34)}<span class="vamo-palabra"><span class="vamo-nombre">VAMO</span><span class="vamo-sello">by <b>FLUV<i>A</i></b></span></span></span>`;
  }
  // Ícono de app en 3 variantes: oscuro, amarillo, blanco
  // Ícono de app: logo sobre azul noche (oscuro), turquesa (amarillo, se mantiene el nombre) o blanco
  function iconoApp(variante = 'oscuro', size = 96) {
    const fondo = { oscuro: MARCA.noche, amarillo: MARCA.turquesa, blanco: MARCA.blanco }[variante] || MARCA.noche;
    const g = 'ia' + (++uid);
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120" width="${size}" height="${size}">
      <defs>${logoDefs(g)}<radialGradient id="${g}r" cx=".3" cy=".2" r="1"><stop offset="0" stop-color="${variante === 'oscuro' ? '#0A4B7A' : fondo}"/><stop offset="1" stop-color="${fondo}"/></radialGradient></defs>
      <rect width="120" height="120" rx="28" fill="url(#${g}r)"/>
      <g transform="translate(12 22) scale(.7)">${logoCuerpo(g)}</g>
    </svg>`;
  }

  // Pin de mapa por tipo (40 × 52, punta abajo)
  const PIN_TIPOS = ['auto', 'taxi', 'bus', 'colectivo', 'micro', 'moto', 'ocupado'];
  function pin(tipo, size = 40) {
    const col = C[tipo] || C.ocupado;
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 52" width="${size}" height="${size * 1.3}">
      <ellipse cx="20" cy="49.5" rx="6" ry="2" fill="#000" opacity=".35"/>
      <path d="M20 49C20 49 4.5 32.5 4.5 20a15.5 15.5 0 0 1 31 0C35.5 32.5 20 49 20 49z" fill="${col}" opacity=".35" transform="translate(20 22) scale(1.12) translate(-20 -22)"/>
      <path d="M20 49C20 49 4.5 32.5 4.5 20a15.5 15.5 0 0 1 31 0C35.5 32.5 20 49 20 49z" fill="${col}" stroke="${C.blanco}" stroke-width="2"/>
      <circle cx="20" cy="20" r="11" fill="${C.blanco}"/>
      <g transform="translate(11 11) scale(.75)" fill="none" stroke="${col}" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="${P[tipo] || P.auto}"/></g>
    </svg>`;
  }
  const svgUrl = s => 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(s);
  // Imágenes listas para map.addImage (2× para pantallas nítidas)
  function pinImagenes() {
    return Promise.all(PIN_TIPOS.map(t => new Promise(res => { const img = new Image(80, 104); img.onload = () => res([t, img]); img.onerror = () => res([t, null]); img.src = svgUrl(pin(t, 80)); })))
      .then(list => Object.fromEntries(list.filter(([, i]) => i)));
  }
  // Semáforo de disponibilidad: color + texto + hora (nunca solo color)
  const SEM = { confirmado: ['Confirmado', '#16A34A'], porconfirmar: ['Por confirmar', '#F59E0B'], sininfo: ['Sin información', '#9CA3AF'], sinservicio: ['Sin servicio', '#DC2626'] };
  const semaforo = (estado, texto, hora) => { const [n, col] = SEM[estado] || SEM.sininfo;
    return `<span class="sem" data-sem="${estado}" style="--sc:${col}"><i aria-hidden="true"></i><b>${n}</b>${texto ? `<span>${texto}</span>` : ''}${hora ? `<time>${hora}</time>` : ''}</span>`; };
  const chip = (tipo, texto) => `<span class="vchip" style="--c:${C[tipo] || C.turquesa}">${icono(tipo, 15)}${texto}</span>`;

  // ===== Componentes del kit visual (devuelven HTML; los estilos viven en index.html) =====
  const esc = t => String(t == null ? '' : t).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  // Botón: variante principal | secundario | terciario | peligro
  const boton = (texto, o = {}) => { const cls = { principal: 'btn', secundario: 'btn secundario', terciario: 'btn ghost', peligro: 'btn peligro' }[o.variante || 'principal'];
    return `<button class="${cls}${o.sm ? ' sm' : ''}" ${o.id ? `id="${o.id}"` : ''} ${o.attrs || ''}>${o.icono ? icono(o.icono, 18) + ' ' : ''}${esc(texto)}</button>`; };
  // Origen del dato: oficial (empresa u horario publicado), operador (GPS del conductor) o comunidad (reportes)
  const FUENTE = { oficial: 'Información oficial', operador: 'Ubicación del operador', comunidad: 'Reporte de la comunidad', ejemplo: 'Dato de ejemplo', ninguna: 'Sin datos en vivo' };
  const fuente = (tipo, texto) => `<span class="fuente" data-f="${tipo}">${esc(texto || FUENTE[tipo] || FUENTE.ninguna)}</span>`;
  // Tarjeta de vehículo / servicio: tipo, título, subtítulo, estado (semaforo), ETA y líneas extra
  const tarjetaVehiculo = o => `<button class="tarjeta" style="--c:${C[o.tipo] || C.morado}" ${o.attrs || ''}>
    <div class="vh"><span class="vi">${icono(o.tipo === 'colectivo' ? 'colectivo' : o.tipo, 26)}</span><span><b>${esc(o.titulo)}</b>${o.sub ? `<div class="hint">${o.sub}</div>` : ''}</span><span class="ve">${o.eta || ''}</span></div>
    ${o.estado || ''}${(o.lineas || []).map(l => `<div class="hint">${l}</div>`).join('')}</button>`;
  const buscador = (id, ph, o = {}) => `<div class="buscar">${icono(o.icono || 'ubicacion', 18)}<input id="${id}" type="search" autocomplete="off" placeholder="${esc(ph)}" aria-label="${esc(o.label || ph)}" ${o.attrs || ''}></div>`;
  const selector = (id, opciones, sel, label) => `<select id="${id}" aria-label="${esc(label || '')}">${opciones.map(([v, n]) => `<option value="${esc(v)}" ${v === sel ? 'selected' : ''}>${esc(n)}</option>`).join('')}</select>`;
  const vacio = (titulo, texto, accion) => `<div class="vacio">${icono('rutas', 30)}<h3>${esc(titulo)}</h3>${texto ? `<p>${texto}</p>` : ''}${accion || ''}</div>`;
  const error = (titulo, texto, accion) => `<div class="vacio" data-t="error" role="alert">${icono('alerta', 30)}<h3>${esc(titulo)}</h3>${texto ? `<p>${texto}</p>` : ''}${accion || ''}</div>`;

  window.VamoUI = { C, P, icono, MARCA, LOGO, logoDefs, logoCuerpo, logoV, marca, iconoApp, pin, pinImagenes, PIN_TIPOS, chip, svgUrl, semaforo, SEM, boton, fuente, FUENTE, tarjetaVehiculo, buscador, selector, vacio, error };
})();
