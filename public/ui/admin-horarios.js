/* VAMO · Panel del equipo VAMO para horarios reales: salidas por día, excepciones por fecha, notas,
   operadores (con aviso de nombres parecidos para no duplicar empresas), feriados y fuentes.
   Solo administradores: Supabase rechaza cualquier escritura de otra persona (RLS con flota.es_admin()).
   Usa funciones globales de index.html (esc, UI, FLOTA, FL, render, traducir) al momento de llamarse. */
window.ADMINHOR = (() => {
  const AH = { sec: 'horarios', rec: null, rid: null, sentido: 'ida', dia: 'lv', d: null, cargando: false, msg: null, opParecido: null };
  const DIAS = [['lv', 'Lunes a viernes'], ['sabado', 'Sábado'], ['domingo', 'Domingo'], ['feriado', 'Feriado'], ['sin_dia', 'Días sin confirmar']];
  const INFO = [['oficial_verificado', 'Oficial verificado'], ['publicado_sin_verificar', 'Publicado sin verificar'], ['referencial', 'Referencial'], ['incompleto', 'Incompleto'], ['desactualizado', 'Desactualizado']];
  const EXC = [['suspendida', 'Suspendida'], ['modificada', 'Hora modificada'], ['extra', 'Salida extra'], ['reanudada', 'Reanudada'], ['reducida', 'Servicio reducido'], ['aviso', 'Aviso']];
  const norm = s => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\b(transportes?|buses?|bus|empresa|ltda|spa|s\.?a\.?)\b/g, '').replace(/[^a-z0-9]/g, '');
  const slug = s => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40);
  // Distancia de edición para detectar «Mirasur» vs «Mira-Sur» o «Brander» vs «Brander Bus»
  function lev(a, b) { const m = a.length, n = b.length; if (!m || !n) return m || n; let p = Array.from({ length: n + 1 }, (_, j) => j);
    for (let i = 1; i <= m; i++) { const c = [i]; for (let j = 1; j <= n; j++) c[j] = Math.min(p[j] + 1, c[j - 1] + 1, p[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)); p = c; } return p[n]; }
  function parecidos(nombre, ops) { const k = norm(nombre); if (!k) return [];
    return ops.filter(o => [o.nombre_comercial, o.razon_social, ...(o.alias || [])].some(x => { const y = norm(x); return y && (y === k || y.includes(k) || k.includes(y) || lev(y, k) <= Math.max(1, Math.floor(Math.min(y.length, k.length) / 5))); })); }

  const P = (path, o = {}) => FLOTA.pedir(path, { esquema: 'public', ...o });
  const msg = (t, ok) => { AH.msg = { t, ok }; };
  async function cargar(forzar) { if (AH.cargando || (AH.d && !forzar)) return; AH.cargando = true;
    try { const hoy = new Date().toISOString().slice(0, 10);
      const [rec, ops, fuentes, fer] = await Promise.all([P('recorrido?select=id,nombre,activo,operador_id,tipo&order=id'), P('operador?select=id,slug,razon_social,nombre_comercial,alias,categoria,telefono,compra_url,avisos_url,estado_info,publico,activo&order=nombre_comercial'),
        P('fuente?select=*&order=titulo'), P(`feriado?select=*&fecha=gte.${hoy}&order=fecha`)]);
      AH.rec = rec; AH.d = { ops, fuentes, fer }; if (!AH.rid || !rec.some(r => r.id === AH.rid)) AH.rid = (rec.find(r => r.activo) || rec[0] || {}).id || null;
      await cargarRec(); } catch (e) { msg(traducir(e), false); AH.d = AH.d || { ops: [], fuentes: [], fer: [] }; }
    finally { AH.cargando = false; } render(); }
  async function cargarRec() { if (!AH.rid) return; const hoy = new Date().toISOString().slice(0, 10);
    const [sal, exc, notas] = await Promise.all([P(`salida?select=*&recorrido_id=eq.${encodeURIComponent(AH.rid)}&order=hora`), P(`excepcion_servicio?select=*&recorrido_id=eq.${encodeURIComponent(AH.rid)}&fecha=gte.${hoy}&order=fecha`),
      P(`nota_horario?select=*&recorrido_id=eq.${encodeURIComponent(AH.rid)}&order=orden`)]);
    Object.assign(AH.d, { sal, exc, notas }); }
  async function hacer(p, ok) { try { await p; msg(ok, true); await cargarRec(); if (AH.sec !== 'horarios' && AH.sec !== 'excepciones') { AH.d = null; await cargar(true); return; } } catch (e) { msg(traducir(e), false); } render(); }
  const val = id => ((document.getElementById(id) || {}).value || '').trim();
  const opt = (lista, sel) => lista.map(([v, n]) => `<option value="${v}" ${v === sel ? 'selected' : ''}>${n}</option>`).join('');
  const tagInfo = ei => `<span class="tag ${ei === 'oficial_verificado' ? 'ok' : ei === 'desactualizado' ? 'err' : 'warn'}">${(INFO.find(x => x[0] === ei) || [, ei || 'Sin estado'])[1]}</span>`;
  const fuenteSel = id => `<select id="${id}" aria-label="Fuente"><option value="">Sin fuente</option>${(AH.d.fuentes || []).map(f => `<option value="${esc(f.id)}">${esc(f.titulo)}</option>`).join('')}</select>`;

  function view() {
    if (!FLOTA.on) return `<div class="vacio">${UI.icono('alerta', 30)}<h3>Disponible en la versión conectada</h3></div>`;
    if (FL.admin == null) { if (!AH.preg) { AH.preg = true; FLOTA.rpc('es_admin').then(r => { FL.admin = r === true; }).catch(() => { FL.admin = false; }).finally(() => { AH.preg = false; render(); }); }
      return `<div><h2>Horarios y operadores</h2><p class="hint">Comprobando permisos…</p></div>`; }
    if (FL.admin !== true) return `<div class="vacio">${UI.icono('alerta', 30)}<h3>Solo para el equipo de VAMO</h3><p>Los horarios los publica VAMO después de revisarlos.</p></div>`;
    if (!AH.d || !AH.rec) { cargar(); return `<div><h2>Horarios y operadores</h2><p class="hint">Cargando…</p></div>`; }
    const secs = [['horarios', 'Horarios'], ['excepciones', 'Cambios por fecha'], ['operadores', 'Operadores'], ['feriados', 'Feriados y fuentes']];
    let h = `<div><h2>Horarios y operadores</h2><p class="sub">Solo el equipo VAMO. Cada dato lleva su estado y su fuente; nada se publica como oficial sin verificarlo.</p></div>
      ${AH.msg ? `<div class="aviso-fl ${AH.msg.ok ? 'ok' : 'err'}" role="status">${esc(AH.msg.t)}</div>` : ''}
      <div class="chips" role="tablist">${secs.map(([k, n]) => `<button class="chip ${AH.sec === k ? 'sel' : ''}" data-ahsec="${k}" role="tab" aria-selected="${AH.sec === k}">${n}</button>`).join('')}</div>`;
    const recSel = `<label class="campo">Recorrido<select id="ahRec">${AH.rec.map(r => `<option value="${esc(r.id)}" ${r.id === AH.rid ? 'selected' : ''}>${esc(r.id)} · ${esc(r.nombre)}${r.activo ? '' : ' (desactivado)'}</option>`).join('')}</select></label>`;
    const sentidos = `<div class="dias">${[['ida', 'Ida'], ['vuelta', 'Vuelta']].map(([k, n]) => `<button data-ahsent="${k}" aria-pressed="${AH.sentido === k}">${n}</button>`).join('')}</div>`;
    if (AH.sec === 'horarios') {
      const sal = (AH.d.sal || []).filter(s => s.sentido === AH.sentido && s.tipo_dia === AH.dia);
      h += `<div class="card">${recSel}${sentidos}<div class="dias">${DIAS.map(([k, n]) => `<button data-ahdia="${k}" aria-pressed="${AH.dia === k}">${n}</button>`).join('')}</div>
        <p class="hint" style="margin:0">La vuelta se carga aparte: nunca se invierten los horarios de ida.</p>
        ${sal.map(s => `<div class="docrow"><span class="mono">${s.hora.slice(0, 5)}${s.variante_hora ? ' / ' + s.variante_hora.slice(0, 5) : ''}</span>${tagInfo(s.estado_info)}<button class="btn sm ghost" data-ahsdel="${s.id}" aria-label="Quitar salida ${s.hora.slice(0, 5)}">Quitar</button></div>`).join('') || '<p class="hint" style="margin:0">Sin salidas cargadas para este día y sentido.</p>'}
        <div class="row"><label class="campo">Sale<input type="time" id="ahHora"></label><label class="campo">Variante (opcional)<input type="time" id="ahVar"></label></div>
        <div class="row"><select id="ahEst" aria-label="Estado de la información">${opt(INFO, 'publicado_sin_verificar')}</select>${fuenteSel('ahFuente')}</div>
        <button class="btn sm" id="ahSalAdd">Agregar salida</button></div>
        <div class="card"><h3>Notas del recorrido</h3>${(AH.d.notas || []).map(n => `<div class="docrow"><span>${n.sentido ? n.sentido + ' · ' : ''}${n.tipo_dia ? (DIAS.find(d => d[0] === n.tipo_dia) || [, n.tipo_dia])[1] + ' · ' : ''}${esc(n.texto)}</span><button class="btn sm ghost" data-ahndel="${n.id}">Quitar</button></div>`).join('') || '<p class="hint" style="margin:0">Sin notas.</p>'}
        <label class="campo">Nueva nota (se muestra a pasajeros)<input id="ahNota" maxlength="300" placeholder="Ej.: Horarios de regreso pendientes de confirmación"></label>
        <label class="row" style="gap:6px"><input type="checkbox" id="ahNotaSent"> Solo para ${AH.sentido} · ${(DIAS.find(d => d[0] === AH.dia) || [])[1]}</label>
        <button class="btn sm" id="ahNotaAdd">Agregar nota</button></div>`;
    } else if (AH.sec === 'excepciones') {
      const salS = (AH.d.sal || []).filter(s => s.sentido === AH.sentido);
      h += `<div class="card">${recSel}${sentidos}
        ${(AH.d.exc || []).map(x => { const s = (AH.d.sal || []).find(y => y.id === x.salida_id); return `<div class="docrow"><span><b>${x.fecha}</b> · ${(EXC.find(e => e[0] === x.tipo) || [, x.tipo])[1]}${s ? ' · salida ' + s.hora.slice(0, 5) : x.sentido ? ' · ' + x.sentido : ' · todo el recorrido'}${x.nueva_hora ? ' → ' + x.nueva_hora.slice(0, 5) : ''}${x.detalle ? '<br><small>' + esc(x.detalle) + '</small>' : ''}</span><button class="btn sm ghost" data-ahxdel="${x.id}">Quitar</button></div>`; }).join('') || '<p class="hint" style="margin:0">Sin cambios registrados desde hoy.</p>'}
        <div class="row"><label class="campo">Fecha<input type="date" id="ahExF"></label><label class="campo">Tipo<select id="ahExT">${opt(EXC, 'suspendida')}</select></label></div>
        <label class="campo">Salida afectada<select id="ahExS"><option value="">Todo el recorrido (${AH.sentido})</option>${salS.map(s => `<option value="${s.id}">${(DIAS.find(d => d[0] === s.tipo_dia) || [, s.tipo_dia])[1]} · ${s.hora.slice(0, 5)}</option>`).join('')}</select></label>
        <div class="row"><label class="campo">Nueva hora (si cambia o es extra)<input type="time" id="ahExH"></label>${fuenteSel('ahExFu')}</div>
        <label class="campo">Detalle para pasajeros<input id="ahExD" maxlength="200" placeholder="Ej.: Suspendida por el operador"></label>
        <button class="btn sm" id="ahExAdd">Registrar cambio</button>
        <p class="hint" style="margin:0">Los cambios por fecha nunca modifican el horario base.</p></div>`;
    } else if (AH.sec === 'operadores') {
      h += `<div class="card"><h3>Operadores</h3>${AH.d.ops.map(o => `<div class="docrow"><span><b>${esc(o.nombre_comercial || o.razon_social)}</b><br><small>${esc(o.categoria || '')}${o.telefono ? ' · ' + esc(o.telefono) : ''}</small></span>${tagInfo(o.estado_info)}<button class="btn sm ghost" data-ahoppub="${o.id}" aria-pressed="${!!o.publico}">${o.publico ? 'Visible' : 'Oculto'}</button></div>`).join('') || '<p class="hint" style="margin:0">Sin operadores.</p>'}</div>
        <div class="card"><h3>Agregar operador</h3>
        <label class="campo">Nombre comercial<input id="ahOpN" maxlength="80"></label>
        <div class="row"><select id="ahOpC" aria-label="Categoría">${opt([['empresa', 'Empresa'], ['municipal', 'Municipal'], ['independiente', 'Independiente'], ['por_confirmar', 'Por confirmar']], 'empresa')}</select><select id="ahOpE" aria-label="Estado de la información">${opt(INFO, 'publicado_sin_verificar')}</select></div>
        <label class="campo">Teléfono (opcional)<input id="ahOpT" inputmode="tel" maxlength="30"></label>
        <label class="campo">Página de avisos (opcional)<input id="ahOpA" type="url" maxlength="300"></label>
        <label class="campo">Página de compra (opcional)<input id="ahOpU" type="url" maxlength="300"></label>
        ${AH.opParecido ? `<div class="aviso-fl err" role="alert">Ya existe un operador parecido: <b>${AH.opParecido.map(o => esc(o.nombre_comercial || o.razon_social)).join(', ')}</b>. Revisa que no sea la misma empresa. Si es distinta, toca «Agregar operador» otra vez.</div>` : ''}
        <button class="btn sm" id="ahOpAdd">Agregar operador</button></div>`;
    } else {
      h += `<div class="card"><h3>Feriados</h3>${AH.d.fer.map(f => `<div class="docrow"><span><b>${f.fecha}</b> · ${esc(f.nombre)}</span><button class="btn sm ghost" data-ahfdel="${f.fecha}">Quitar</button></div>`).join('') || '<p class="hint" style="margin:0">Sin feriados próximos.</p>'}
        <div class="row"><input type="date" id="ahFerF" aria-label="Fecha"><input id="ahFerN" maxlength="80" placeholder="Nombre del feriado" style="flex:1"><button class="btn sm" id="ahFerAdd">Agregar</button></div>
        <p class="hint" style="margin:0">En un feriado se usan los horarios cargados como «Feriado»; si no hay, VAMO lo dice en vez de suponer.</p></div>
        <div class="card"><h3>Fuentes</h3>${AH.d.fuentes.map(f => `<div class="docrow"><span>${f.url ? `<a href="${esc(f.url)}" target="_blank" rel="noopener">${esc(f.titulo)}</a>` : esc(f.titulo)}<br><small>${esc(f.tipo)}${f.verificada_en ? ' · verificada ' + f.verificada_en : ' · sin verificar'}</small></span></div>`).join('')}
        <label class="campo">Título<input id="ahFuT" maxlength="120"></label><label class="campo">Enlace (opcional)<input id="ahFuU" type="url" maxlength="300"></label>
        <div class="row"><select id="ahFuTi" aria-label="Tipo">${opt([['sitio', 'Sitio'], ['facebook', 'Facebook'], ['noticia', 'Noticia'], ['agregador', 'Agregador'], ['telefono', 'Teléfono'], ['operador', 'Operador'], ['usuario', 'Usuario']], 'sitio')}</select><label class="row" style="gap:6px"><input type="checkbox" id="ahFuV"> Verificada hoy</label></div>
        <button class="btn sm" id="ahFuAdd">Agregar fuente</button></div>`;
    }
    return h;
  }

  async function click(b) {
    if (b.dataset.ahsec) { AH.sec = b.dataset.ahsec; AH.msg = null; AH.opParecido = null; render(); return true; }
    if (b.dataset.ahsent) { AH.sentido = b.dataset.ahsent; render(); return true; }
    if (b.dataset.ahdia) { AH.dia = b.dataset.ahdia; render(); return true; }
    const hoyF = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Santiago' });
    if (b.id === 'ahSalAdd') { const hora = val('ahHora'); if (!hora) { msg('Indica la hora de salida.', false); render(); return true; }
      if ((AH.d.sal || []).some(s => s.sentido === AH.sentido && s.tipo_dia === AH.dia && s.hora.slice(0, 5) === hora)) { msg('Esa salida ya existe.', false); render(); return true; }
      return hacer(P('salida', { method: 'POST', body: { recorrido_id: AH.rid, sentido: AH.sentido, tipo_dia: AH.dia, hora, variante_hora: val('ahVar') || null, estado_info: val('ahEst'), fuente_id: val('ahFuente') || null } }), `Salida ${hora} agregada.`), true; }
    if (b.dataset.ahsdel) return hacer(P(`salida?id=eq.${b.dataset.ahsdel}`, { method: 'DELETE' }), 'Salida quitada.'), true;
    if (b.id === 'ahNotaAdd') { const texto = val('ahNota'); if (!texto) return true; const solo = (document.getElementById('ahNotaSent') || {}).checked;
      return hacer(P('nota_horario', { method: 'POST', body: { recorrido_id: AH.rid, texto, sentido: solo ? AH.sentido : null, tipo_dia: solo ? AH.dia : null } }), 'Nota agregada.'), true; }
    if (b.dataset.ahndel) return hacer(P(`nota_horario?id=eq.${b.dataset.ahndel}`, { method: 'DELETE' }), 'Nota quitada.'), true;
    if (b.id === 'ahExAdd') { const fecha = val('ahExF'), tipo = val('ahExT'), nueva = val('ahExH');
      if (!fecha || fecha < hoyF) { msg('Indica una fecha de hoy en adelante.', false); render(); return true; }
      if ((tipo === 'modificada' || tipo === 'extra') && !nueva) { msg('Indica la nueva hora.', false); render(); return true; }
      return hacer(P('excepcion_servicio', { method: 'POST', body: { recorrido_id: AH.rid, sentido: AH.sentido, salida_id: val('ahExS') ? Number(val('ahExS')) : null, fecha, tipo, nueva_hora: nueva || null, detalle: val('ahExD') || null, fuente_id: val('ahExFu') || null } }), 'Cambio registrado.'), true; }
    if (b.dataset.ahxdel) return hacer(P(`excepcion_servicio?id=eq.${b.dataset.ahxdel}`, { method: 'DELETE' }), 'Cambio quitado.'), true;
    if (b.id === 'ahOpAdd') { const n = val('ahOpN'); if (!n) { msg('Indica el nombre.', false); render(); return true; }
      const par = parecidos(n, AH.d.ops); if (par.length && !(AH.opParecido && AH.opNombre === n)) { AH.opParecido = par; AH.opNombre = n; render(); return true; }
      AH.opParecido = null; let s = slug(n); if (AH.d.ops.some(o => o.slug === s)) s += '-' + Date.now().toString(36).slice(-3);
      return hacer(P('operador', { method: 'POST', body: { slug: s, razon_social: n, nombre_comercial: n, tipo: 'empresa_buses', categoria: val('ahOpC'), estado_info: val('ahOpE'), telefono: val('ahOpT') || null, avisos_url: val('ahOpA') || null, compra_url: val('ahOpU') || null, publico: false } }), `${n} agregado (oculto hasta que lo marques visible).`), true; }
    if (b.dataset.ahoppub) { const o = AH.d.ops.find(x => x.id === b.dataset.ahoppub); return hacer(P(`operador?id=eq.${o.id}`, { method: 'PATCH', body: { publico: !o.publico } }), o.publico ? 'Operador oculto.' : 'Operador visible para pasajeros.'), true; }
    if (b.id === 'ahFerAdd') { const fecha = val('ahFerF'), nombre = val('ahFerN'); if (!fecha || !nombre) return true;
      return hacer(P('feriado', { method: 'POST', body: { fecha, nombre } }), 'Feriado agregado.'), true; }
    if (b.dataset.ahfdel) return hacer(P(`feriado?fecha=eq.${b.dataset.ahfdel}`, { method: 'DELETE' }), 'Feriado quitado.'), true;
    if (b.id === 'ahFuAdd') { const titulo = val('ahFuT'); if (!titulo) return true; let id = slug(titulo); if (AH.d.fuentes.some(f => f.id === id)) id += '-' + Date.now().toString(36).slice(-3);
      return hacer(P('fuente', { method: 'POST', body: { id, titulo, url: val('ahFuU') || null, tipo: val('ahFuTi'), verificada_en: (document.getElementById('ahFuV') || {}).checked ? hoyF : null } }), 'Fuente agregada.'), true; }
    return false;
  }
  async function change(t) { if (t.id === 'ahRec') { AH.rid = t.value; try { await cargarRec(); } catch (e) { msg(traducir(e), false); } render(); return true; } return false; }
  return { view, click, change, parecidos, norm, _estado: AH };
})();
