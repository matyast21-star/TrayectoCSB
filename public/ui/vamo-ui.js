/* VAMO by FLUVA · componentes SVG reutilizables (logo, íconos, pines de mapa, chips).
   Se usan en la app y, más adelante, en el panel de administración. Todo es SVG propio: el kit UI es solo referencia. */
(function () {
  const C = {
    fondo: '#0B0F24', turquesa: '#00E5FF', fucsia: '#FF00B8', violeta: '#8A2BE2', amarillo: '#FFC107', blanco: '#FFFFFF',
    auto: '#FF8A1F', taxi: '#FFC107', bus: '#2F8BFF', micro: '#22C55E', moto: '#B44CFF', ocupado: '#8C93B0'
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
    senal: 'M2 9a15 15 0 0 1 20 0 M5 12.5a10 10 0 0 1 14 0 M8.5 16a5 5 0 0 1 7 0 M12 19.5h.01'
  };
  const icono = (n, size = 20, extra = '') =>
    `<svg viewBox="0 0 24 24" width="${size}" height="${size}" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" ${extra}><path d="${P[n] || P.inicio}"/></svg>`;

  // Logo: V con carretera integrada (degradado turquesa → violeta → fucsia)
  let uid = 0;
  function logoV(size = 34) {
    const g = 'vg' + (++uid);
    return `<svg viewBox="0 0 120 100" width="${size * 1.2}" height="${size}" aria-hidden="true" class="vamo-v">
      <defs><linearGradient id="${g}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${C.turquesa}"/><stop offset=".55" stop-color="${C.violeta}"/><stop offset="1" stop-color="${C.fucsia}"/></linearGradient></defs>
      <path d="M14 12L60 86L106 12" fill="none" stroke="url(#${g})" stroke-width="26" stroke-linecap="round" stroke-linejoin="round"/>
      <path d="M58 88Q72 52 106 12" fill="none" stroke="${C.fondo}" stroke-width="12" stroke-linecap="round"/>
      <path d="M58 88Q72 52 106 12" fill="none" stroke="${C.blanco}" stroke-width="2.2" stroke-dasharray="6 6" stroke-linecap="round"/>
    </svg>`;
  }
  // Marca completa: V + VAMO + sello "by fluva."
  function marca() {
    return `<span class="vamo-marca" role="img" aria-label="VAMO by fluva">${logoV(30)}<span class="vamo-palabra"><span class="vamo-nombre">VAMO</span><svg class="vamo-swoosh" viewBox="0 0 100 10" preserveAspectRatio="none" aria-hidden="true"><path d="M2 8Q50 0 98 3" fill="none" stroke="${C.amarillo}" stroke-width="2.4" stroke-linecap="round"/></svg><span class="vamo-sello">by <b>fluva.</b></span></span></span>`;
  }
  // Ícono de app en 3 variantes: oscuro, amarillo, blanco
  function iconoApp(variante = 'oscuro', size = 96) {
    const fondo = { oscuro: C.fondo, amarillo: C.amarillo, blanco: C.blanco }[variante] || C.fondo;
    const g = 'ia' + (++uid);
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120" width="${size}" height="${size}">
      <defs><linearGradient id="${g}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${C.turquesa}"/><stop offset=".55" stop-color="${C.violeta}"/><stop offset="1" stop-color="${C.fucsia}"/></linearGradient></defs>
      <rect width="120" height="120" rx="28" fill="${fondo}"/>
      ${variante === 'oscuro' ? `<rect x="3" y="3" width="114" height="114" rx="25" fill="none" stroke="url(#${g})" stroke-width="3" opacity=".9"/>` : ''}
      <g transform="translate(18 26) scale(.7)"><path d="M14 12L60 86L106 12" fill="none" stroke="${variante === 'amarillo' ? C.fondo : `url(#${g})`}" stroke-width="26" stroke-linecap="round" stroke-linejoin="round"/>
      <path d="M58 88Q72 52 106 12" fill="none" stroke="${variante === 'amarillo' ? C.amarillo : C.fondo}" stroke-width="12" stroke-linecap="round"/>
      <path d="M58 88Q72 52 106 12" fill="none" stroke="${variante === 'amarillo' ? C.fondo : C.blanco}" stroke-width="2.4" stroke-dasharray="6 6" stroke-linecap="round"/></g>
    </svg>`;
  }

  // Pin de mapa por tipo (40 × 52, punta abajo)
  const PIN_TIPOS = ['auto', 'taxi', 'bus', 'micro', 'moto', 'ocupado'];
  function pin(tipo, size = 40) {
    const col = C[tipo] || C.ocupado;
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 52" width="${size}" height="${size * 1.3}">
      <ellipse cx="20" cy="49.5" rx="6" ry="2" fill="#000" opacity=".35"/>
      <path d="M20 49C20 49 4.5 32.5 4.5 20a15.5 15.5 0 0 1 31 0C35.5 32.5 20 49 20 49z" fill="${col}" opacity=".35" transform="translate(20 22) scale(1.12) translate(-20 -22)"/>
      <path d="M20 49C20 49 4.5 32.5 4.5 20a15.5 15.5 0 0 1 31 0C35.5 32.5 20 49 20 49z" fill="${col}" stroke="${C.fondo}" stroke-width="1.5"/>
      <circle cx="20" cy="20" r="11" fill="${C.fondo}"/>
      <g transform="translate(11 11) scale(.75)" fill="none" stroke="${col}" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="${P[tipo] || P.auto}"/></g>
    </svg>`;
  }
  const svgUrl = s => 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(s);
  // Imágenes listas para map.addImage (2× para pantallas nítidas)
  function pinImagenes() {
    return Promise.all(PIN_TIPOS.map(t => new Promise(res => { const img = new Image(80, 104); img.onload = () => res([t, img]); img.onerror = () => res([t, null]); img.src = svgUrl(pin(t, 80)); })))
      .then(list => Object.fromEntries(list.filter(([, i]) => i)));
  }
  const chip = (tipo, texto) => `<span class="vchip" style="--c:${C[tipo] || C.turquesa}">${icono(tipo, 15)}${texto}</span>`;

  window.VamoUI = { C, P, icono, logoV, marca, iconoApp, pin, pinImagenes, PIN_TIPOS, chip, svgUrl };
})();
