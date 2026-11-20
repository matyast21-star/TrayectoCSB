/* VAMO · Mi rendimiento y Mi flota + plan VAMO Conductor.
   Kilómetros medidos en el servidor con el GPS que el conductor comparte con permiso (filtros de calidad en flota.medir).
   Nada se inventa: sin distancia de referencia cargada, la vuelta queda «Sin referencia»; sin datos suficientes, se dice.
   Gráficos en SVG propio (sin librerías). Usa globales de index.html (esc, UI, FLOTA, FL, OWNER, S, render, traducir, clp). */
window.REND = (() => {
  const R = { d: null, vid: null, cargando: false, per: 7, msg: null, plan: null, formRef: false };
  const COL = { a: '#7B2FF7', b: '#0095C8', rev: '#D03B3B', gris: '#9CA3AF', ref: '#1F2A44' };
  const hoyF = () => new Date().toLocaleDateString('en-CA', { timeZone: 'America/Santiago' });
  const diaDe = iso => new Date(iso).toLocaleDateString('en-CA', { timeZone: 'America/Santiago' });
  const corto = f => { const [, m, d] = f.split('-'); return `${+d}/${+m}`; };
  const hora = iso => new Date(iso).toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Santiago' });
  const n1 = x => (Math.round(x * 10) / 10).toLocaleString('es-CL');
  const pesos = x => (x < 0 ? '−' : '') + '$' + Math.abs(Math.round(x || 0)).toLocaleString('es-CL');
  const val = id => ((document.getElementById(id) || {}).value || '').trim();
  const num = id => { const v = val(id).replace(/\./g, '').replace(',', '.'); return v === '' ? null : Number(v); };
  const conPlan = () => R.plan && ['prueba', 'activa'].includes(R.plan.estado);
  const vehiculos = () => OWNER.vehiculos.filter(v => v.rid);
  const ESTADO_V = { normal: ['Normal', 'ok', '✓'], revisar: ['Revisar', 'err', '!'], insuf: ['Datos insuficientes', 'warn', '?'], sinref: ['Sin referencia', '', '–'], curso: ['En curso', '', '…'] };

  async function cargar(forzar) {
    if (R.cargando || (R.d && !forzar && R.d.vid === R.vid && R.d.per === R.per)) return; R.cargando = true;
    const v = vehiculos().find(x => x.id === R.vid) || vehiculos()[0]; if (!v) { R.cargando = false; return; } R.vid = v.id;
    const desde = new Date(Date.now() - (R.per - 1) * 864e5).toLocaleDateString('en-CA', { timeZone: 'America/Santiago' }), id = v.rid;
    try { const [tramos, ses, gastos, ingresos, mant, refs, plan] = await Promise.all([
        FLOTA.pedir(`tramo?select=*&vehiculo_id=eq.${id}&inicio=gte.${desde}&order=inicio`),
        FLOTA.pedir(`sesion_servicio?select=id,inicio,fin,km_gps,puntos_ok,puntos_descartados,brechas&vehiculo_id=eq.${id}&inicio=gte.${desde}&order=inicio`),
        FLOTA.pedir(`gasto?select=*&vehiculo_id=eq.${id}&order=fecha.desc,id.desc&limit=300`),
        FLOTA.pedir(`ingreso?select=*&vehiculo_id=eq.${id}&fecha=gte.${desde}&order=fecha.desc`),
        FLOTA.pedir(`mantencion?select=*&vehiculo_id=eq.${id}&activo=eq.true&order=id`),
        FLOTA.pedir('distancia_referencia?select=*&order=vigente_desde.desc'),
        FLOTA.rpc('estado_plan').catch(() => null)]);
      R.d = { vid: R.vid, per: R.per, v, tramos, ses, gastos, ingresos, mant, refs, desde }; R.plan = plan; R.err = null;
    } catch (e) { R.err = traducir(e); R.d = null; } finally { R.cargando = false; } render(); }

  // ---- Cálculos ----
  function referencia(t, refs, propId) {
    const dia = diaDe(t.inicio), c = refs.filter(r => r.recorrido_id === t.recorrido_id && r.sentido === (t.sentido || '') && (r.variante || '') === (t.variante || '') && r.vigente_desde <= dia);
    return c.find(r => r.propietario_id && r.propietario_id === propId) || c.find(r => !r.propietario_id) || null; }
  function evaluar(t, ref) {
    if (t.estado === 'en_curso') return { e: 'curso' };
    if (!ref) return { e: 'sinref' };
    const km = Number(t.km_gps), r = Number(ref.km), dif = (km - r) / r * 100;
    if (t.puntos_ok < 5 || km < r * 0.5 || t.brechas > 2) return { e: 'insuf', dif };
    return { e: Math.abs(dif) <= Number(ref.tolerancia_pct) ? 'normal' : 'revisar', dif }; }
  function rendimientoComb(gastos) {
    const f = gastos.filter(g => g.tipo === 'combustible' && g.odometro != null && g.litros).sort((a, b) => a.odometro - b.odometro), out = [];
    let ult = null;
    for (const g of f) { if (ult && g.estanque_lleno) { const lit = f.filter(x => x.odometro > ult.odometro && x.odometro <= g.odometro).reduce((s, x) => s + Number(x.litros), 0), km = g.odometro - ult.odometro;
        if (km > 0 && lit > 0) out.push({ fecha: g.fecha, km, litros: lit, kml: km / lit }); }
      if (g.estanque_lleno) ult = g; }
    return out; }
  function mantEstado(m, odo) {
    const hoy = hoyF(), pk = m.cada_km && m.ultimo_km != null ? m.ultimo_km + m.cada_km : null;
    const pf = m.cada_dias && m.ultima_fecha ? new Date(new Date(m.ultima_fecha + 'T12:00:00').getTime() + m.cada_dias * 864e5).toLocaleDateString('en-CA') : null;
    if (pk == null && pf == null) return { e: 'falta', t: 'Falta el último kilometraje o fecha' };
    const venc = (pk != null && odo != null && odo >= pk) || (pf != null && hoy >= pf);
    const pronto = (pk != null && odo != null && pk - odo <= 500) || (pf != null && (new Date(pf) - new Date(hoy)) / 864e5 <= 14);
    const txt = [pk != null ? `a los ${pk.toLocaleString('es-CL')} km` : '', pf ? `el ${pf}` : ''].filter(Boolean).join(' o ');
    return venc ? { e: 'vencida', t: 'Vencida: tocaba ' + txt } : pronto ? { e: 'pronto', t: 'Próxima ' + txt } : { e: 'ok', t: 'Al día · próxima ' + txt }; }

  // ---- Gráfico de barras SVG (una serie, o dos apiladas). Hover con <title>; tabla equivalente debajo. ----
  function barras(datos, o = {}) {
    if (!datos.length) return '<p class="hint" style="margin:0">Sin datos en este período.</p>';
    const W = 340, H = 170, L = 34, B = 26, T = 14, ancho = W - L - 6, alto = H - B - T;
    const max = Math.max(...datos.map(d => d.v + (d.v2 || 0)), o.ref ? o.ref * (1 + (o.tol || 0) / 100) : 0) * 1.12 || 1;
    const y = v => T + alto - v / max * alto, paso = ancho / datos.length, bw = Math.max(4, Math.min(28, paso - 6));
    const top = (x, y0, h, c) => h <= 0 ? '' : `<path d="M${x},${y0 + h} v${-(h - Math.min(4, h))} q0,-${Math.min(4, h)} ${Math.min(4, bw / 2)},-${Math.min(4, h)} h${bw - 2 * Math.min(4, bw / 2)} q${Math.min(4, bw / 2)},0 ${Math.min(4, bw / 2)},${Math.min(4, h)} v${h - Math.min(4, h)} z" fill="${c}"/>`;
    let g = '';
    for (const f of [0, 0.5, 1]) { const v = max / 1.12 * f, yy = y(v); g += `<line x1="${L}" x2="${W - 4}" y1="${yy}" y2="${yy}" stroke="currentColor" stroke-opacity=".12"/><text x="${L - 4}" y="${yy + 3}" text-anchor="end" font-size="9" fill="currentColor" fill-opacity=".6">${n1(v)}</text>`; }
    if (o.ref) { const a = o.ref * (1 - o.tol / 100), b = o.ref * (1 + o.tol / 100);
      g += `<rect x="${L}" y="${y(b)}" width="${ancho}" height="${y(a) - y(b)}" fill="${COL.ref}" fill-opacity=".07"/><line x1="${L}" x2="${W - 4}" y1="${y(o.ref)}" y2="${y(o.ref)}" stroke="${COL.ref}" stroke-width="1.5" stroke-dasharray="5 4"/>
        <text x="${W - 6}" y="${y(b) - 3}" text-anchor="end" font-size="9" fill="currentColor">Referencia ${n1(o.ref)} km ±${n1(o.tol)}%</text>`; }
    const cada = Math.ceil(datos.length / 8);
    datos.forEach((d, i) => { const x = L + i * paso + (paso - bw) / 2, h1 = d.v / max * alto, h2 = (d.v2 || 0) / max * alto;
      const c = d.estado === 'revisar' ? COL.rev : d.estado === 'insuf' || d.estado === 'sinref' || d.estado === 'curso' ? COL.gris : COL.a;
      g += `<g class="bar"><title>${esc(d.tip || `${d.et}: ${n1(d.v)} ${o.unidad || ''}`)}</title><rect x="${L + i * paso}" y="${T}" width="${paso}" height="${alto}" fill="transparent"/>`;
      if (o.apilado) { if (h2 > 0) { g += h1 > 0 ? `<rect x="${x}" y="${y(d.v)}" width="${bw}" height="${h1}" fill="${COL.a}"/>` : ''; g += top(x, y(d.v + d.v2), Math.max(0, h2 - (h1 > 0 ? 2 : 0)), COL.b); } else g += top(x, y(d.v), h1, COL.a); }
      else g += top(x, y(d.v), h1, c);
      if (d.estado && ESTADO_V[d.estado] && d.estado !== 'normal') g += `<text x="${x + bw / 2}" y="${y(d.v) - 4}" text-anchor="middle" font-size="10" font-weight="700" fill="currentColor">${ESTADO_V[d.estado][2]}</text>`;
      if (i % cada === 0) g += `<text x="${x + bw / 2}" y="${H - 10}" text-anchor="middle" font-size="9" fill="currentColor" fill-opacity=".7">${esc(d.et)}</text>`;
      g += '</g>'; });
    const ley = o.apilado ? `<div class="leyenda"><span><i style="background:${COL.a}"></i>${esc(o.n1 || '')}</span><span><i style="background:${COL.b}"></i>${esc(o.n2 || '')}</span></div>` : '';
    const tabla = `<details><summary>Ver tabla</summary><table><thead><tr><th>${esc(o.col || 'Fecha')}</th><th>${esc(o.apilado ? o.n1 : 'km')}</th>${o.apilado ? `<th>${esc(o.n2)}</th>` : ''}${datos.some(d => d.estado) ? '<th>Estado</th>' : ''}</tr></thead><tbody>${datos.map(d => `<tr><td>${esc(d.et)}</td><td class="mono">${n1(d.v)}</td>${o.apilado ? `<td class="mono">${n1(d.v2 || 0)}</td>` : ''}${d.estado ? `<td>${ESTADO_V[d.estado][0]}${d.dif != null ? ` (${d.dif > 0 ? '+' : ''}${n1(d.dif)}%)` : ''}</td>` : ''}</tr>`).join('')}</tbody></table></details>`;
    return `<svg class="graf" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(o.aria || 'Gráfico de barras')}">${g}</svg>${ley}${tabla}`; }

  // ---- Panel del conductor: medir vueltas o viajes durante el servicio ----
  function panelHTML(v, k, s) {
    if (!FLOTA.on || !v.rid || !s || !s.rsid || s.demo) return '';
    const esV = k === 'bus' || k === 'colectivo', t = s.tramo;
    const sinGps = !s.gpsOk ? '<p class="hint" style="margin:0">Para medir kilómetros activa «Compartir mi ubicación». Sin GPS la vuelta queda con datos insuficientes.</p>' : '';
    if (t) return `<div class="paso"><h3 class="paso-n">${UI.icono('planificar', 18)} ${esV ? 'VUELTA EN CURSO' : 'VIAJE CON PASAJERO'}</h3><p class="hint" style="margin:0;text-align:center">Desde las ${hora(t.inicio)}${esV && s.sentido ? ' · ' + esc(s.sentido) : ''}</p>
      <button class="gbtn" id="rTramoFin" style="--c:var(--turquesa)">${esV ? 'TERMINAR VUELTA' : 'TERMINAR VIAJE'}</button>${!esV ? '<label class="campo">Cobro del viaje (opcional)<input id="rTramoIng" inputmode="numeric" placeholder="$"></label>' : ''}${sinGps}</div>`;
    return `<div class="paso"><h3 class="paso-n">${UI.icono('planificar', 18)} KILÓMETROS</h3><button class="gbtn" id="rTramoIni" style="--c:var(--turquesa)">${esV ? 'INICIAR VUELTA' : 'PASAJERO A BORDO'}</button>
      <p class="hint" style="margin:0">${esV ? 'Al cambiar de sentido, la vuelta se cierra y empieza la siguiente.' : 'Los km entre viajes cuentan como «sin pasajeros».'}</p>${sinGps}</div>`; }

  // ---- Vista ----
  function view() {
    if (!FLOTA.on) return `<div class="vacio">${UI.icono('alerta', 30)}<h3>Disponible en la versión conectada</h3></div>`;
    const vs = vehiculos(); if (!vs.length) return `<div class="vacio">${UI.icono('auto', 30)}<h3>Primero guarda tu vehículo en VAMO</h3><button class="btn sm" data-tab="soy">Registrar vehículo</button></div>`;
    if (!R.vid || !vs.some(x => x.id === R.vid)) R.vid = (vs.find(x => x.id === S.panelVid) || vs[0]).id;
    if (!conPlan() && R.per > 7 && R.plan) R.per = 7;
    if (!R.d || R.d.vid !== R.vid || R.d.per !== R.per) { cargar(); return `<div><h2>Mi rendimiento</h2>${R.err ? `<div class="aviso-fl err">${esc(R.err)}</div>` : '<p class="hint">Cargando…</p>'}</div>`; }
    const D = R.d, v = D.v, k = TIPOS_V[v.tipoV] ? v.tipoV : 'auto', esV = k === 'bus' || k === 'colectivo', dueno = v.rol === 'dueno';
    const propId = (D.refs.find(r => r.propietario_id) || {}).propietario_id || null;
    const tr = D.tramos.filter(t => t.estado !== 'anulado'), kmTot = D.ses.reduce((a, s) => a + Number(s.km_gps), 0);
    const ing = D.ingresos.reduce((a, x) => a + x.monto, 0) + tr.reduce((a, t) => a + (t.ingreso || 0), 0), gPer = D.gastos.filter(g => g.fecha >= D.desde), gas = gPer.reduce((a, x) => a + x.monto, 0);
    const odo = D.gastos.reduce((m, g) => g.odometro != null && g.odometro > m ? g.odometro : m, -1);
    let h = `<div><h2>Mi rendimiento${dueno ? ' y mi flota' : ''}</h2><p class="sub">Kilómetros medidos con el GPS que compartes durante el servicio, con filtros de calidad. Gastos e ingresos son los que registras tú.</p></div>
      ${R.msg ? `<div class="aviso-fl ${R.msg.ok ? 'ok' : 'err'}" role="status">${esc(R.msg.t)}</div>` : ''}
      <label class="vselect" style="--c:${TIPOS_V[k].c}">${UI.icono(TIPOS_V[k].i, 18)}<select id="rVeh" aria-label="Vehículo">${vs.map(x => `<option value="${x.id}" ${x.id === R.vid ? 'selected' : ''}>${TIPOS_V[x.tipoV] ? TIPOS_V[x.tipoV].n : 'Vehículo'} · ${esc(x.patente)}${x.rol === 'dueno' ? '' : ' (conduces)'}</option>`).join('')}</select></label>
      <div class="chips" role="group" aria-label="Período">${[7, 30, 90].map(p => `<button class="chip ${R.per === p ? 'sel' : ''}" data-rper="${p}" ${p > 7 && !conPlan() ? 'disabled title="Con el plan VAMO Conductor"' : ''}>${p} días</button>`).join('')}</div>
      <div class="stats3"><div class="stat"><div class="v">${n1(kmTot)}</div><div class="l">km con GPS</div></div><div class="stat"><div class="v">${pesos(ing)}</div><div class="l">Ingresos registrados</div></div><div class="stat"><div class="v">${pesos(gas)}</div><div class="l">Gastos registrados</div></div></div>
      <div class="card"><b>Resultado operativo parcial: ${pesos(ing - gas)}</b><p class="hint" style="margin:0">Ingresos menos gastos que registraste en ${R.per} días. No incluye depreciación, seguros ni gastos no registrados: no es una utilidad contable.</p></div>`;
    // Km diarios
    const dias = []; for (let i = R.per - 1; i >= 0; i--) dias.push(new Date(Date.now() - i * 864e5).toLocaleDateString('en-CA', { timeZone: 'America/Santiago' }));
    const porDia = f => D.ses.filter(s => diaDe(s.inicio) === f).reduce((a, s) => a + Number(s.km_gps), 0);
    if (esV) {
      const sentidos = [...new Set(tr.map(t => t.sentido || ''))], sel = sentidos.includes(R.sent) ? R.sent : sentidos[0] || '';
      const vt = tr.filter(t => (t.sentido || '') === sel), refAct = vt.length ? referencia(vt[vt.length - 1], D.refs, propId) : null;
      const datos = vt.map(t => { const ref = referencia(t, D.refs, propId), ev = evaluar(t, ref); return { et: `${corto(diaDe(t.inicio))} ${hora(t.inicio)}`, v: Number(t.km_gps), estado: ev.e, dif: ev.dif,
        tip: `Vuelta ${corto(diaDe(t.inicio))} ${hora(t.inicio)}: ${n1(Number(t.km_gps))} km · ${ESTADO_V[ev.e][0]}${ev.dif != null ? ` (${ev.dif > 0 ? '+' : ''}${n1(ev.dif)}%)` : ''} · ${t.puntos_ok} lecturas GPS, ${t.puntos_descartados} descartadas` }; });
      const cuenta = e => datos.filter(d => d.estado === e).length;
      h += `<div class="card"><h3>Kilómetros por vuelta</h3>${sentidos.length > 1 ? `<div class="chips">${sentidos.map(x => `<button class="chip ${x === sel ? 'sel' : ''}" data-rsent="${esc(x)}">${esc(x || 'Sin sentido')}</button>`).join('')}</div>` : ''}
        ${barras(datos, { ref: refAct ? Number(refAct.km) : null, tol: refAct ? Number(refAct.tolerancia_pct) : 0, col: 'Vuelta', aria: 'Kilómetros por vuelta' })}
        ${datos.length ? `<p class="hint" style="margin:0">${cuenta('normal')} normales · ${cuenta('revisar')} para revisar · ${cuenta('insuf')} con datos insuficientes${cuenta('sinref') ? ` · ${cuenta('sinref')} sin referencia` : ''}. «Revisar» no acusa a nadie: puede ser un desvío, un tramo sin señal o un error del GPS.</p>` : ''}
        ${refAct ? '' : `<p class="hint" style="margin:0">Sin distancia de referencia para ${esc(v.recorrido || 'este recorrido')} ${esc(sel)}. VAMO no inventa una: ${dueno ? 'cárgala tú con el valor que conoces' : 'el dueño puede cargarla'}.</p>`}
        ${dueno && v.recorrido ? (R.formRef ? `<div class="row"><label class="campo">Km de referencia<input id="rRefKm" inputmode="decimal"></label><label class="campo">Tolerancia %<input id="rRefTol" inputmode="decimal" value="5"></label></div><label class="campo">Sentido<input id="rRefSent" value="${esc(sel)}"></label><label class="campo">De dónde sale el dato<input id="rRefFu" maxlength="120" placeholder="Ej.: odómetro, 3 vueltas medidas"></label><button class="btn sm" id="rRefOk">Guardar referencia</button>` : `<button class="btn sm ghost" id="rRefNueva">${refAct ? 'Nueva referencia (se guarda una versión nueva)' : 'Cargar distancia de referencia'}</button>`) : ''}</div>`;
    } else {
      const viajes = tr.filter(t => t.tipo === 'viaje');
      h += `<div class="card"><h3>Kilómetros por viaje</h3>${barras(viajes.map(t => ({ et: `${corto(diaDe(t.inicio))} ${hora(t.inicio)}`, v: Number(t.km_gps), estado: t.estado === 'en_curso' ? 'curso' : null, tip: `Viaje ${hora(t.inicio)}: ${n1(Number(t.km_gps))} km${t.ingreso ? ' · ' + pesos(t.ingreso) : ''}` })), { col: 'Viaje', aria: 'Kilómetros por viaje' })}</div>`;
      const conP = f => viajes.filter(t => diaDe(t.inicio) === f).reduce((a, t) => a + Number(t.km_gps), 0);
      h += `<div class="card"><h3>Km con y sin pasajeros</h3>${barras(dias.map(f => { const c = conP(f), tot = porDia(f); return { et: corto(f), v: c, v2: Math.max(0, tot - c), tip: `${corto(f)}: ${n1(c)} km con pasajeros, ${n1(Math.max(0, tot - c))} km sin pasajeros` }; }).filter(d => d.v || d.v2), { apilado: true, n1: 'Con pasajeros', n2: 'Sin pasajeros', aria: 'Kilómetros con y sin pasajeros por día' })}</div>`;
    }
    h += `<div class="card"><h3>Kilómetros por día</h3>${barras(dias.map(f => ({ et: corto(f), v: porDia(f) })).filter(d => d.v), { aria: 'Kilómetros por día' })}
      ${D.ses.some(s => s.brechas > 0 || s.puntos_descartados > 0) ? `<p class="hint" style="margin:0">Algunas jornadas tuvieron tramos sin señal o lecturas descartadas: sus km pueden ser menores a los reales.</p>` : ''}</div>`;
    // Combustible
    const rc = rendimientoComb(D.gastos), prom = rc.length ? rc.reduce((a, x) => a + x.km, 0) / rc.reduce((a, x) => a + x.litros, 0) : null;
    h += `<div class="card"><h3>Combustible</h3>${prom ? `<p style="margin:0"><b>${n1(prom)} km/L</b> promedio entre estanques llenos (${rc.length} ${rc.length === 1 ? 'tramo' : 'tramos'})</p>` : '<p class="hint" style="margin:0">Para calcular km/L registra dos cargas con «estanque lleno» y el odómetro. Los litros cargados no son los consumidos: solo entre dos estanques llenos se sabe cuánto se gastó.</p>'}
      <div class="row"><label class="campo">Monto $<input id="rcMonto" inputmode="numeric"></label><label class="campo">Litros<input id="rcLit" inputmode="decimal"></label></div>
      <div class="row"><label class="campo">Odómetro km<input id="rcOdo" inputmode="numeric"></label><label class="row" style="gap:6px"><input type="checkbox" id="rcLleno"> Estanque lleno</label></div>
      <button class="btn sm" id="rcAdd">Registrar carga</button></div>`;
    // Otros gastos e ingresos
    h += `<div class="card"><h3>Gastos e ingresos</h3>
      <div class="row"><select id="rgTipo" aria-label="Tipo de gasto">${[['peaje', 'Peaje'], ['mantencion', 'Mantención'], ['lavado', 'Lavado'], ['estacionamiento', 'Estacionamiento'], ['multa', 'Multa'], ['otro', 'Otro']].map(([a, b]) => `<option value="${a}">${b}</option>`).join('')}</select><input id="rgMonto" inputmode="numeric" placeholder="$" style="width:100px"><button class="btn sm" id="rgAdd">Agregar gasto</button></div>
      <div class="row"><select id="riOrigen" aria-label="Origen del ingreso">${[[esV ? 'vueltas' : 'viajes', esV ? 'Vueltas' : 'Viajes'], ['delivery', 'Delivery'], ['otro', 'Otro']].map(([a, b]) => `<option value="${a}">${b}</option>`).join('')}</select><input id="riMonto" inputmode="numeric" placeholder="$" style="width:100px"><button class="btn sm" id="riAdd">Agregar ingreso</button></div>
      ${k === 'colectivo' ? '<p class="hint" style="margin:0">Referencia informada para colectivos Casablanca–Valparaíso: $3.000 por pasajero (vigencia por verificar). Registra lo que realmente cobraste.</p>' : ''}
      ${[...gPer.map(g => ({ f: g.fecha, t: g.tipo, m: -g.monto, id: 'g' + g.id })), ...D.ingresos.map(x => ({ f: x.fecha, t: 'Ingreso · ' + x.origen, m: x.monto, id: 'i' + x.id }))].sort((a, b) => b.f.localeCompare(a.f)).slice(0, 12)
        .map(x => `<div class="docrow"><span>${corto(x.f)} · ${esc(x.t)}</span><b class="mono">${x.m < 0 ? '−' : '+'}${pesos(Math.abs(x.m))}</b><button class="btn sm ghost" data-rdel="${x.id}" aria-label="Quitar">Quitar</button></div>`).join('')}</div>`;
    // Mantenciones
    h += `<div class="card"><h3>Mantenciones</h3>${odo >= 0 ? `<p class="hint" style="margin:0">Último odómetro registrado: ${odo.toLocaleString('es-CL')} km</p>` : ''}
      ${D.mant.map(m => { const e = mantEstado(m, odo >= 0 ? odo : null); return `<div class="docrow"><span><b>${esc(m.tipo)}</b><br><small>${esc(e.t)}</small></span><span class="tag ${e.e === 'vencida' ? 'err' : e.e === 'pronto' || e.e === 'falta' ? 'warn' : 'ok'}">${{ vencida: 'Vencida', pronto: 'Pronto', ok: 'Al día', falta: 'Falta dato' }[e.e]}</span>${dueno ? `<button class="btn sm ghost" data-rmhecha="${m.id}">Hecha hoy</button>` : ''}</div>`; }).join('') || '<p class="hint" style="margin:0">Sin recordatorios.</p>'}
      ${dueno ? `<div class="row"><input id="rmTipo" placeholder="Ej.: Cambio de aceite" style="flex:2"><input id="rmKm" inputmode="numeric" placeholder="cada km" style="width:90px"><input id="rmDias" inputmode="numeric" placeholder="cada días" style="width:90px"></div><button class="btn sm" id="rmAdd">Agregar recordatorio</button>` : ''}</div>`;
    // Informes y plan
    h += `<div class="card"><h3>Informes</h3><div class="row"><button class="btn sm" id="rCsv" ${conPlan() ? '' : 'disabled'}>Descargar Excel (CSV)</button><button class="btn sm ghost" id="rPdf" ${conPlan() ? '' : 'disabled'}>Imprimir o guardar PDF</button></div>${conPlan() ? '' : '<p class="hint" style="margin:0">Los informes y el historial de 30 y 90 días vienen con el plan VAMO Conductor.</p>'}</div>`;
    return h + planHTML(); }

  function planHTML() { const p = R.plan || { estado: 'sin_plan' };
    const est = { sin_plan: 'Sin plan', prueba: `Prueba gratis hasta el ${p.prueba_hasta}`, activa: `Activo hasta el ${p.vigente_hasta} (${p.periodo || ''})`, vencida: 'Vencido', cancelada: 'Cancelado' }[p.estado] || p.estado;
    return `<div class="card" id="planCard"><h3>Plan VAMO Conductor</h3><p style="margin:0"><b>${esc(est)}</b></p>
      <p class="hint" style="margin:0">$3.990 al mes o $30.000 al año. Incluye historial de 30 y 90 días e informes. Registrar kilómetros, gastos y mantenciones es siempre gratis.</p>
      <p class="hint" style="margin:0">No hay cobros automáticos: pagas por transferencia o en efectivo y el equipo VAMO registra tu pago con tu identificador${FLOTA.uid() ? ` <span class="mono">${FLOTA.uid().slice(0, 8)}</span>` : ''}. Buses y flotas se conversan aparte.</p>
      ${p.estado === 'sin_plan' ? '<button class="btn sm" id="planPrueba">Probar gratis 2 meses</button>' : ['prueba', 'activa'].includes(p.estado) ? '<button class="btn sm ghost" id="planCancelar">Cancelar plan</button>' : ''}
      ${FL.admin ? `<details><summary>Registrar pago recibido (equipo VAMO)</summary><div class="row"><input id="ppId" placeholder="Identificador (8 caracteres)" maxlength="36" style="flex:2"><select id="ppPer"><option value="mensual">Mensual $3.990</option><option value="anual">Anual $30.000</option></select></div>
        <div class="row"><select id="ppMedio"><option value="transferencia">Transferencia</option><option value="efectivo">Efectivo</option><option value="otro">Otro</option></select><input id="ppRef" maxlength="80" placeholder="N° de comprobante" style="flex:1"></div><button class="btn sm" id="ppOk">Registrar pago</button></details>` : ''}</div>`; }

  // ---- Exportar ----
  function csv() { const D = R.d, sep = ';', q = x => `"${String(x ?? '').replace(/"/g, '""')}"`, filas = [['tipo', 'fecha', 'hora', 'detalle', 'km', 'monto', 'estado']];
    const propId = (D.refs.find(r => r.propietario_id) || {}).propietario_id || null;
    for (const t of D.tramos) { const ev = evaluar(t, referencia(t, D.refs, propId)); filas.push([t.tipo, diaDe(t.inicio), hora(t.inicio), t.sentido || (t.con_pasajeros ? 'con pasajeros' : ''), String(Number(t.km_gps).toFixed(2)).replace('.', ','), t.ingreso || '', ESTADO_V[ev.e][0]]); }
    for (const g of D.gastos.filter(g => g.fecha >= D.desde)) filas.push(['gasto', g.fecha, '', g.tipo + (g.litros ? ` ${g.litros} L` : ''), '', -g.monto, '']);
    for (const x of D.ingresos) filas.push(['ingreso', x.fecha, '', x.origen, '', x.monto, '']);
    const blob = new Blob(['﻿' + filas.map(f => f.map(q).join(sep)).join('\r\n')], { type: 'text/csv;charset=utf-8' }), a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = `vamo-rendimiento-${D.v.patente}-${hoyF()}.csv`; document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500); }
  function pdf() { const w = window.open('', '_blank'); if (!w) { R.msg = { t: 'Permite ventanas emergentes para imprimir.', ok: false }; render(); return; }
    const cont = document.getElementById('view').cloneNode(true); cont.querySelectorAll('button,select,input,.chips,#planCard').forEach(e => e.remove()); cont.querySelectorAll('details').forEach(d => d.open = true);
    w.document.write(`<!doctype html><meta charset="utf-8"><title>VAMO · Rendimiento ${esc(R.d.v.patente)}</title><style>body{font-family:system-ui,sans-serif;color:#1F2A44;max-width:720px;margin:20px auto}svg{width:100%;max-width:520px}table{border-collapse:collapse;width:100%}td,th{border-bottom:1px solid #E5E7EB;padding:4px;text-align:left;font-size:12px}.card{border:1px solid #E5E7EB;border-radius:12px;padding:10px;margin:10px 0}.stats3{display:flex;gap:10px}.stat{flex:1}.v{font-size:20px;font-weight:700}</style><h1>VAMO · ${esc(R.d.v.patente)} · ${R.per} días al ${hoyF()}</h1>${cont.innerHTML}`);
    w.document.close(); w.focus(); setTimeout(() => w.print(), 300); }

  // ---- Eventos ----
  const ok = t => { R.msg = { t, ok: true }; }, mal = e => { R.msg = { t: traducir(e), ok: false }; };
  async function guardar(p, t) { try { await p; ok(t); R.d = null; } catch (e) { mal(e); } await cargar(true); }
  async function click(b) {
    const D = R.d, v = D && D.v;
    if (b.id === 'rTramoIni' || b.id === 'rTramoFin') { const s = SES[S.panelVid]; if (!s || !s.rsid) return true;
      try { if (b.id === 'rTramoIni') { await FLOTA.rpc('iniciar_tramo', { s: s.rsid }); s.tramo = { inicio: new Date().toISOString() }; }
        else { const m = num('rTramoIng'); await FLOTA.rpc('cerrar_tramo', { s: s.rsid, ingreso: m && m > 0 ? Math.round(m) : null }); s.tramo = null; }
        saveSes(); R.d = null; } catch (e) { flMsg(traducir(e), false); } render(); return true; }
    if (b.dataset.rper) { R.per = +b.dataset.rper; render(); return true; }
    if (b.dataset.rsent != null) { R.sent = b.dataset.rsent; render(); return true; }
    if (b.id === 'rRefNueva') { R.formRef = true; render(); return true; }
    if (b.id === 'rRefOk') { const km = num('rRefKm'), tol = num('rRefTol') || 5; if (!km || km <= 0) { R.msg = { t: 'Indica los km de referencia.', ok: false }; render(); return true; }
      const prop = await FLOTA.pedir(`propietario?select=id&usuario_id=eq.${FLOTA.uid()}`).catch(() => []); R.formRef = false;
      return guardar(FLOTA.pedir('distancia_referencia', { method: 'POST', body: { recorrido_id: v.recorrido, sentido: val('rRefSent'), km, tolerancia_pct: tol, fuente: val('rRefFu') || null, propietario_id: (prop[0] || {}).id || null } }), 'Referencia guardada desde hoy. Las vueltas anteriores conservan la referencia que tenían.'), true; }
    if (b.id === 'rcAdd') { const monto = num('rcMonto'); if (monto == null) { R.msg = { t: 'Indica el monto de la carga.', ok: false }; render(); return true; }
      return guardar(FLOTA.pedir('gasto', { method: 'POST', body: { vehiculo_id: v.rid, tipo: 'combustible', monto: Math.round(monto), litros: num('rcLit'), odometro: num('rcOdo') != null ? Math.round(num('rcOdo')) : null, estanque_lleno: (document.getElementById('rcLleno') || {}).checked || false, fecha: hoyF() } }), 'Carga registrada.'), true; }
    if (b.id === 'rgAdd') { const monto = num('rgMonto'); if (monto == null) return true; return guardar(FLOTA.pedir('gasto', { method: 'POST', body: { vehiculo_id: v.rid, tipo: val('rgTipo'), monto: Math.round(monto), fecha: hoyF() } }), 'Gasto registrado.'), true; }
    if (b.id === 'riAdd') { const monto = num('riMonto'); if (monto == null) return true; return guardar(FLOTA.pedir('ingreso', { method: 'POST', body: { vehiculo_id: v.rid, origen: val('riOrigen'), monto: Math.round(monto), fecha: hoyF() } }), 'Ingreso registrado.'), true; }
    if (b.dataset.rdel) { const id = b.dataset.rdel; return guardar(FLOTA.pedir(`${id[0] === 'g' ? 'gasto' : 'ingreso'}?id=eq.${id.slice(1)}`, { method: 'DELETE' }), 'Quitado.'), true; }
    if (b.id === 'rmAdd') { const tipo = val('rmTipo'), km = num('rmKm'), dias = num('rmDias'); if (!tipo || (!km && !dias)) { R.msg = { t: 'Indica la mantención y cada cuántos km o días.', ok: false }; render(); return true; }
      const odo = D.gastos.reduce((m, g) => g.odometro != null && g.odometro > m ? g.odometro : m, -1);
      return guardar(FLOTA.pedir('mantencion', { method: 'POST', body: { vehiculo_id: v.rid, tipo, cada_km: km ? Math.round(km) : null, cada_dias: dias ? Math.round(dias) : null, ultimo_km: odo >= 0 ? odo : null, ultima_fecha: hoyF() } }), 'Recordatorio agregado.'), true; }
    if (b.dataset.rmhecha) { const odo = D.gastos.reduce((m, g) => g.odometro != null && g.odometro > m ? g.odometro : m, -1);
      return guardar(FLOTA.pedir(`mantencion?id=eq.${b.dataset.rmhecha}`, { method: 'PATCH', body: { ultima_fecha: hoyF(), ultimo_km: odo >= 0 ? odo : null } }), 'Mantención marcada como hecha.'), true; }
    if (b.id === 'rCsv' && conPlan()) { csv(); return true; }
    if (b.id === 'rPdf' && conPlan()) { pdf(); return true; }
    if (b.id === 'planPrueba') { try { R.plan = await FLOTA.rpc('iniciar_prueba'); ok('Prueba gratis activada por 2 meses. No se te cobrará nada automáticamente.'); } catch (e) { mal(e); } render(); return true; }
    if (b.id === 'planCancelar') { if (!confirm('¿Cancelar el plan VAMO Conductor? Tus datos se conservan.')) return true; try { R.plan = await FLOTA.rpc('cancelar_plan'); ok('Plan cancelado. Tus registros se conservan.'); } catch (e) { mal(e); } render(); return true; }
    if (b.id === 'ppOk') { const per = val('ppPer'); try { await FLOTA.rpc('registrar_pago', { u_prefijo: val('ppId'), periodo: per, monto: per === 'anual' ? 30000 : 3990, medio: val('ppMedio'), referencia: val('ppRef') || null }); ok('Pago registrado y vigencia extendida.'); } catch (e) { mal(e); } render(); return true; }
    return false; }
  async function change(t) { if (t.id === 'rVeh') { R.vid = t.value; R.d = null; R.msg = null; render(); return true; } return false; }
  return { view, click, change, panelHTML, barras, evaluar, referencia, rendimientoComb, mantEstado, _estado: R };
})();
