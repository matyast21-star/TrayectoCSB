/* VAMO · Solicitudes de viaje reales y colectivos (esquema «flota» de Supabase).
   Conductor de taxi o auto con jornada iniciada: le llega una tarjeta grande con sonido y vibración (origen → destino,
   distancia, a cuántos minutos está el pasajero) y tiene 30 segundos para Aceptar o Rechazar. El primero que acepta se
   lleva el viaje. El taxi pone su precio al aceptar ($2.500 sugerido dentro de la zona; fuera, su precio fijo).
   El auto acepta el precio de referencia o propone otro, y el pasajero elige.
   Colectivos (sin reservas): el pasajero marca «estoy esperando colectivo aquí» y los colectiveros en servicio lo ven en
   una lista (solo informativo). El colectivero avisa «disponible con N cupos» y les llega a quienes esperan.
   Si no hay conductores reales en servicio, el pasajero sigue viendo la demostración de siempre. */
window.SOL = (() => {
  const SEG = 30;                                   // segundos para responder una solicitud
  const st = { sid: null, tipo: null, vid: null, timer: null, visto: {}, cola: [], modal: null, viaje: null, viajeAt: 0,
    esperas: null, esperasAt: 0, avisoMsg: '', avisoAt: 0, pas: null, pasTimer: null, avisos: [], avisosAt: 0 };
  const rpc = (fn, a) => FLOTA.rpc(fn, a);
  const $ = (s, el = document) => el.querySelector(s);
  const e_ = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const pesos = n => '$' + Math.round(n).toLocaleString('es-CL');
  const km1 = n => n == null ? '' : String(Math.round(n * 10) / 10).replace('.', ',') + ' km';
  const hace = t => { const m = Math.max(0, Math.round((Date.now() - new Date(t)) / 60000)); return m < 1 ? 'recién' : `hace ${m} min`; };
  const msgErr = e => String((e && e.message) || e || 'Error').replace(/^.*?:\s*/, '').slice(0, 160);
  const redraw = () => { try { if (typeof rerender === 'function') rerender(); } catch (x) {} };
  const real = s => !!(window.FLOTA && FLOTA.on && s && s.activo && s.rsid && !s.demo);

  // ===== Sonido y vibración (se habilitan con el primer toque, como exige el navegador) =====
  let ctx = null;
  document.addEventListener('pointerdown', () => { try { ctx = ctx || new (window.AudioContext || window.webkitAudioContext)(); if (ctx.state === 'suspended') ctx.resume(); } catch (x) {} }, { passive: true });
  function timbre() {
    try { if (navigator.vibrate) navigator.vibrate([300, 150, 300, 150, 500]); } catch (x) {}
    if (!ctx) return;
    const t0 = ctx.currentTime;
    [[880, 0], [1175, 0.18], [1568, 0.36]].forEach(([f, d]) => { const o = ctx.createOscillator(), g = ctx.createGain();
      o.type = 'sine'; o.frequency.value = f; g.gain.setValueAtTime(0.0001, t0 + d); g.gain.exponentialRampToValueAtTime(0.35, t0 + d + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, t0 + d + 0.32);
      o.connect(g).connect(ctx.destination); o.start(t0 + d); o.stop(t0 + d + 0.35); });
  }

  // ===== Estilos propios del módulo =====
  const css = document.createElement('style');
  css.textContent = `
  .sol-velo{position:fixed;inset:0;z-index:9000;background:rgba(11,15,36,.62);display:flex;align-items:flex-end;justify-content:center;padding:12px}
  .sol-card{width:100%;max-width:460px;background:var(--surface,#fff);color:var(--ink,#1F2A44);border-radius:22px;padding:18px 18px 16px;box-shadow:0 12px 40px rgba(0,0,0,.35);display:flex;flex-direction:column;gap:12px;animation:solsube .25s ease-out}
  @keyframes solsube{from{transform:translateY(40px);opacity:.4}to{transform:none;opacity:1}}
  .sol-top{display:flex;align-items:center;justify-content:space-between;gap:10px}
  .sol-tit{font-size:20px;font-weight:800;margin:0}
  .sol-seg{font:800 22px/1 Montserrat,system-ui,sans-serif;min-width:52px;height:52px;border-radius:50%;display:grid;place-items:center;border:4px solid var(--c,#16A34A);color:var(--c,#16A34A)}
  .sol-ruta{display:flex;flex-direction:column;gap:6px;font-size:18px;font-weight:700}
  .sol-ruta span{display:flex;gap:8px;align-items:baseline}.sol-ruta i{font-style:normal;font-size:12px;font-weight:800;border-radius:50%;width:22px;height:22px;display:inline-grid;place-items:center;flex:none;color:#fff}
  .sol-dat{display:grid;grid-template-columns:repeat(3,1fr);gap:8px}
  .sol-dat div{background:var(--surface2,#F3F4F6);border-radius:12px;padding:8px;text-align:center}.sol-dat b{display:block;font-size:18px}.sol-dat small{color:var(--muted,#6B7280);font-size:12px}
  .sol-barra{height:6px;border-radius:3px;background:var(--line,#E5E7EB);overflow:hidden}.sol-barra i{display:block;height:100%;background:var(--c,#16A34A);transition:width 1s linear}
  .sol-btns{display:grid;grid-template-columns:1fr 1.4fr;gap:10px}
  .sol-btns button{min-height:64px;border-radius:16px;border:0;font:800 18px Montserrat,system-ui,sans-serif;cursor:pointer}
  .sol-no{background:var(--surface2,#F3F4F6);color:var(--ink,#1F2A44)}.sol-si{background:#16A34A;color:#fff}
  .sol-precio{display:flex;align-items:center;justify-content:space-between;gap:8px;background:var(--surface2,#F3F4F6);border-radius:14px;padding:8px 10px}
  .sol-precio button{width:44px;height:44px;border-radius:50%;border:2px solid var(--morado,#7B2FF7);background:none;color:var(--morado,#7B2FF7);font-size:22px;font-weight:800;cursor:pointer}
  .sol-precio output{font-size:24px;font-weight:800}
  .sol-aviso{font-size:18px;font-weight:800;text-align:center;padding:18px 6px}
  .sol-espera{display:flex;gap:10px;align-items:flex-start;padding:10px 0;border-top:1px solid var(--line,#E5E7EB)}.sol-espera:first-of-type{border-top:0}
  .sol-espera b{font-size:16px}.sol-pulso{width:12px;height:12px;border-radius:50%;background:var(--ok,#16A34A);flex:none;margin-top:5px;animation:solpul 1.4s infinite}
  @keyframes solpul{0%{box-shadow:0 0 0 0 rgba(22,163,74,.5)}100%{box-shadow:0 0 0 12px rgba(22,163,74,0)}}
  .sol-pat{font:800 26px/1 Montserrat,system-ui,sans-serif;letter-spacing:2px;border:3px solid var(--ink,#1F2A44);border-radius:10px;padding:6px 12px;display:inline-block}`;
  document.head.appendChild(css);

  // ===================== CONDUCTOR: taxi y auto =====================
  function vigilar(sid, tipo, vid) {
    if (st.sid === sid && st.timer) return;
    detener(); st.sid = sid; st.tipo = tipo; st.vid = vid; st.visto = {}; st.cola = []; st.viaje = null; st.esperas = null;
    sondear(); st.timer = setInterval(sondear, tipo === 'colectivo' ? 15000 : 4000);
  }
  function detener() { clearInterval(st.timer); st.timer = null; st.sid = null; st.viaje = null; st.esperas = null; cerrarModal(); }
  let ocupado = false;
  async function sondear() {
    if (!st.sid || ocupado || document.hidden && st.tipo === 'colectivo') return; ocupado = true;
    try {
      if (st.tipo === 'colectivo') { st.esperas = await rpc('esperas_colectivo', { s: st.sid }); st.esperasAt = Date.now(); if (S.tab === 'panelcond') redraw(); return; }
      if (st.viaje || Date.now() - st.viajeAt > 20000) {      // viaje en curso (o revisar de vez en cuando por si se aceptó en otro lado)
        const v = await rpc('mi_viaje_en_curso', { s: st.sid }); st.viajeAt = Date.now();
        const antes = st.viaje && st.viaje.estado; st.viaje = v && v.id ? v : null;
        if ((st.viaje && st.viaje.estado) !== antes && S.tab === 'panelcond') redraw();
        if (st.viaje && st.viaje.estado !== 'cancelada') return;
      }
      const lista = await rpc('solicitudes_cercanas', { s: st.sid }) || [];
      const ids = new Set(lista.map(x => x.id));
      if (st.modal && st.modal.sol && !ids.has(st.modal.sol.id) && !st.modal.done) avisoModal('Ya lo tomó otro conductor o el pasajero canceló.');
      for (const x of lista) if (!st.visto[x.id]) { st.visto[x.id] = 1; st.cola.push(x); }
      st.cola = st.cola.filter(x => ids.has(x.id));
      if (!st.modal && st.cola.length) mostrar(st.cola.shift());
    } catch (e) { if (/sesión|jornada/i.test(msgErr(e))) detener(); }
    finally { ocupado = false; }
  }

  function mostrar(sol) {
    const taxi = sol.tipo === 'taxi', ref = sol.precio_ref || 0;
    st.modal = { sol, fin: Date.now() + SEG * 1000, precio: ref || (taxi ? 0 : 3000), done: false };
    const velo = document.createElement('div'); velo.className = 'sol-velo'; velo.setAttribute('role', 'dialog'); velo.setAttribute('aria-modal', 'true'); velo.setAttribute('aria-label', 'Nueva solicitud de viaje');
    velo.innerHTML = `<div class="sol-card" style="--c:var(--ok,#16A34A)">
      <div class="sol-top"><div><p class="sol-tit">${taxi ? '🚕 Nueva solicitud de taxi' : '🚗 Nueva solicitud de viaje'}</p><small class="hint">${hace(sol.creada_en)} · el primero que acepta se lo lleva</small></div><div class="sol-seg" id="solSeg">${SEG}</div></div>
      <div class="sol-ruta"><span><i style="background:#16A34A">A</i>${e_(sol.origen_texto)}</span><span><i style="background:#DC2626">B</i>${e_(sol.destino_texto)}</span></div>
      <div class="sol-dat"><div><b>${sol.min_al_pasajero != null ? sol.min_al_pasajero + ' min' : '—'}</b><small>${sol.km_al_pasajero != null ? 'pasajero a ' + km1(sol.km_al_pasajero) : 'activa tu ubicación'}</small></div>
        <div><b>${sol.distancia_km != null ? km1(+sol.distancia_km) : '—'}</b><small>del viaje</small></div>
        <div><b>${ref ? pesos(ref) : '—'}</b><small>${taxi ? (ref ? 'sugerido en la zona' : 'fuera de la zona') : 'referencia'}</small></div></div>
      ${!taxi && !ref ? '' : `<div class="sol-precio"><button data-solp="-500" aria-label="Bajar precio">−</button><span style="text-align:center"><small class="hint">${taxi ? 'Tu precio para este viaje' : 'Tu precio'}</small><br>${taxi ? `<input id="solPrecioIn" inputmode="numeric" aria-label="Tu precio" value="${st.modal.precio || ''}" placeholder="Escribe tu precio" style="width:150px;text-align:center;font-size:22px;font-weight:800;border:1px solid var(--line);border-radius:10px;padding:4px">` : `<output id="solPrecio">${pesos(st.modal.precio)}</output>`}</span><button data-solp="500" aria-label="Subir precio">+</button></div>`}
      <div class="sol-barra"><i id="solBarra" style="width:100%"></i></div>
      <div class="sol-btns"><button class="sol-no" data-solr="rechazar">Rechazar</button><button class="sol-si" data-solr="aceptar" id="solSi">Aceptar${st.modal.precio ? ' ' + pesos(st.modal.precio) : ''}</button></div></div>`;
    document.body.appendChild(velo); st.modal.el = velo;
    timbre(); st.modal.sonido = setInterval(() => { if (st.modal && !st.modal.done) timbre(); }, 6000);
    st.modal.reloj = setInterval(() => { const m = st.modal; if (!m || m.done) return; const r = Math.max(0, Math.ceil((m.fin - Date.now()) / 1000));
      const a = $('#solSeg', velo), b = $('#solBarra', velo); if (a) a.textContent = r; if (b) b.style.width = (r / SEG * 100) + '%';
      if (r <= 10) velo.firstElementChild.style.setProperty('--c', '#DC2626');
      if (r <= 0) avisoModal('Se acabó el tiempo. La solicitud sigue para otros conductores.'); }, 250);
  }
  function avisoModal(txt) { const m = st.modal; if (!m || !m.el) return; m.done = true; clearInterval(m.sonido); clearInterval(m.reloj);
    m.el.firstElementChild.innerHTML = `<div class="sol-aviso">${e_(txt)}</div>`; setTimeout(cerrarModal, 2600); }
  function cerrarModal() { const m = st.modal; if (!m) return; clearInterval(m.sonido); clearInterval(m.reloj); if (m.el) m.el.remove(); st.modal = null;
    if (st.cola.length && !st.viaje) setTimeout(() => { if (!st.modal && st.cola.length) mostrar(st.cola.shift()); }, 400); }

  async function responder(accion) {
    const m = st.modal; if (!m || m.done) return; const sol = m.sol, ref = sol.precio_ref || 0;
    const proponer = accion === 'aceptar' && sol.tipo === 'auto' && ref && m.precio !== ref;
    if (accion === 'aceptar' && sol.tipo === 'taxi' && !(m.precio >= 500)) { const i = $('#solPrecioIn', m.el); if (i) { i.focus(); i.style.borderColor = '#DC2626'; } return; }
    m.done = true; clearInterval(m.sonido); clearInterval(m.reloj);
    try {
      const r = await rpc('responder_solicitud', { s: st.sid, sol: sol.id, accion: accion === 'rechazar' ? 'rechazar' : proponer ? 'proponer' : 'aceptar', p_precio: proponer || sol.tipo === 'taxi' ? m.precio : null, p_eta: sol.min_al_pasajero });
      if (r === 'rechazada') { cerrarModal(); return; }
      if (r === 'propuesta') { m.done = false; avisoModal(`Propuesta enviada: ${pesos(m.precio)}. Si el pasajero la elige, te aparece el viaje.`); return; }
      st.viaje = await rpc('mi_viaje_en_curso', { s: st.sid }); st.viajeAt = Date.now(); st.cola = [];
      m.done = false; avisoModal('¡Viaje aceptado! Ve a buscar al pasajero.'); if (typeof ir === 'function') { if (st.vid) S.panelVid = st.vid; ir('panelcond'); }
    } catch (e) { m.done = false; avisoModal(msgErr(e)); }
  }

  // Lo que va en el panel del conductor (taxi o auto) en vez de «Sin solicitudes por ahora»
  function panelHTML(v, k, s) {
    if (!real(s)) return null;
    vigilar(s.rsid, k, v.id);
    const x = st.viaje;
    if (x && x.estado === 'cancelada') return `<div class="card"><h3>El pasajero canceló el viaje</h3><p class="hint" style="margin:0">${e_(x.origen_texto)} → ${e_(x.destino_texto)}</p><button class="btn" data-sol="visto">Entendido</button></div>`;
    if (x) {
      const nav = (la, ln) => `https://www.google.com/maps/dir/?api=1&destination=${la},${ln}&travelmode=driving`;
      const paso = { tomada: ['Ve a buscar al pasajero', 'llego', 'LLEGUÉ AL ORIGEN', nav(x.o_lat, x.o_lng), 'Cómo llegar al pasajero'],
        llego: ['El pasajero sabe que llegaste', 'en_viaje', 'INICIAR VIAJE', null, ''],
        en_viaje: ['En viaje hacia el destino', 'finalizada', 'FINALIZAR VIAJE', nav(x.d_lat, x.d_lng), 'Cómo llegar al destino'] }[x.estado];
      return `<div class="card" style="border:2px solid var(--ok)"><span class="tag ok">Viaje aceptado</span><h3 style="margin:4px 0">${paso[0]}</h3>
        <div class="sol-ruta" style="font-size:16px"><span><i style="background:#16A34A">A</i>${e_(x.origen_texto)}</span><span><i style="background:#DC2626">B</i>${e_(x.destino_texto)}</span></div>
        <div class="row" style="justify-content:space-between"><span class="hint">${x.distancia_km ? km1(+x.distancia_km) : ''}</span><b style="font-size:22px">${x.precio_final ? pesos(x.precio_final) : 'Precio a convenir'}</b></div>
        <button class="gbtn" data-solv="${paso[1]}" style="--c:var(--ok)">${paso[2]}</button>
        ${paso[3] ? `<a class="btn secundario" href="${paso[3]}" target="_blank" rel="noopener">${paso[4]}</a>` : ''}
        ${x.estado !== 'en_viaje' ? '<button class="btn sm ghost" data-solv="cancelada">Cancelar este viaje</button>' : ''}</div>`;
    }
    const push = window.PUSH && PUSH.soportado() && !PUSH.activo() ? `<button class="btn secundario" data-sol="push">🔔 Recibir solicitudes con VAMO cerrado</button>` : window.PUSH && PUSH.activo() ? '<p class="hint" style="margin:0">🔔 Avisos con VAMO cerrado: activados en este teléfono.</p>' : (window.PUSH && PUSH.aviso() ? `<p class="hint" style="margin:0">${e_(PUSH.aviso())}</p>` : '');
    return `<div class="card"><div class="row" style="gap:10px;align-items:flex-start"><span class="sol-pulso"></span><span><h3 style="margin:0">Esperando solicitudes</h3>
      <p class="hint" style="margin:4px 0 0">Cuando un pasajero cerca pida ${k === 'taxi' ? 'un taxi' : 'un auto'}, te aparece una tarjeta con sonido y vibración. Tienes ${SEG} segundos para aceptar o rechazar; el primero que acepta se lleva el viaje.${k === 'taxi' ? ' Pones tu precio al aceptar: te sugerimos $2.500 dentro de la zona y fuera escribes tu precio fijo.' : ' Puedes aceptar el precio de referencia o proponer otro.'}</p></span></div>
      ${s.gpsOk ? '' : '<p class="hint" style="margin:0">Comparte tu ubicación para recibir solo las solicitudes cercanas y ver a cuántos minutos está el pasajero.</p>'}${push}</div>`;
  }

  // ===================== CONDUCTOR: colectivo =====================
  function colectivoHTML(v, s) {
    if (!real(s)) return '';
    vigilar(s.rsid, 'colectivo', v.id);
    const es = st.esperas, n = s.cupos || 0;
    const lista = es == null ? '<p class="hint" style="margin:0">Buscando pasajeros que esperan…</p>' : !es.length ? '<p class="hint" style="margin:0">Por ahora nadie marcó que está esperando.</p>'
      : es.map(x => `<div class="sol-espera"><span class="sol-pulso"></span><span><b>${x.personas} ${x.personas === 1 ? 'pasajero esperando' : 'pasajeros esperando'}</b><div>${e_(x.lugar_texto)} · ${e_(x.sentido)}</div><small class="hint">${hace(x.desde)}${x.km != null ? ' · a ' + km1(+x.km) : ''} · <a href="https://www.google.com/maps/search/?api=1&query=${x.lat},${x.lng}" target="_blank" rel="noopener">ver en el mapa</a></small></span></div>`).join('');
    const espera = Math.max(0, 180 - Math.round((Date.now() - st.avisoAt) / 1000));
    return `<div class="paso"><h3 class="paso-n">🙋 PASAJEROS ESPERANDO</h3>${lista}<p class="hint" style="margin:0">Solo informativo: no se acepta ni se rechaza. La ubicación es aproximada (unos 100 m).</p></div>
      <div class="paso"><h3 class="paso-n">📣 AVISAR A LOS PASAJEROS</h3>
      <button class="gbtn" data-sol="cupos" style="--c:var(--colectivo)" ${n < 1 || espera > 0 && st.avisoAt ? 'disabled' : ''}>DISPONIBLE CON ${n} ${n === 1 ? 'CUPO' : 'CUPOS'}</button>
      <p class="hint" style="margin:0">${st.avisoMsg ? e_(st.avisoMsg) + ' ' : ''}Les llega a quienes marcaron que esperan colectivo ${e_(s.sentido ? s.sentido.replace(/^H/, 'h') : '')} y a quienes tienen alerta Casablanca–Valparaíso. Ajusta los cupos arriba antes de avisar.${n < 1 ? ' Sin cupos no se puede avisar.' : ''}</p>
      ${window.PUSH && PUSH.soportado() && !PUSH.activo() ? '<button class="btn sm secundario" data-sol="push">🔔 Saber de pasajeros esperando con VAMO cerrado</button>' : ''}</div>`;
  }

  // ===================== PASAJERO: pedir taxi o auto real =====================
  async function hayReales(tipo) {
    try { const r = await FLOTA.pedir(`en_servicio?select=sesion_id&tipo=eq.${tipo}`, { publico: true }); return r.length; } catch (e) { return 0; }
  }
  // Devuelve true si la solicitud quedó en manos de conductores reales; false para seguir con la demostración
  async function pedirViaje({ tipo, o, d, km, precio, clase }) {
    if (!(window.FLOTA && FLOTA.on)) return false;
    const n = await hayReales(tipo); if (!n) return false;
    S.ride = { real: true, fase: 'real', tipo, clase, precio, km, o: o.c, d: d.c, oN: o.n, dN: d.n, info: null, n }; S.note = ''; redraw();
    try { S.ride.sol = await rpc('crear_solicitud', { p_tipo: tipo, o_lat: o.c[0], o_lng: o.c[1], o_texto: o.n || 'Origen', d_lat: d.c[0], d_lng: d.c[1], d_texto: d.n || 'Destino', p_km: Math.round(km * 10) / 10, p_precio: precio > 0 ? Math.round(precio) : null }); }
    catch (e) { S.ride = null; S.note = msgErr(e); redraw(); return true; }
    seguir(); return true;
  }
  function seguir() { clearInterval(st.pasTimer); st.pasTimer = setInterval(actualizarPas, 3000); actualizarPas(); }
  async function actualizarPas() {
    const R = S.ride; if (!R || !R.real || !R.sol) { clearInterval(st.pasTimer); return; }
    try { const antes = R.info && R.info.estado + (R.info.propuestas || []).length; R.info = await rpc('mi_solicitud', { sol: R.sol });
      const ahora = R.info && R.info.estado + (R.info.propuestas || []).length;
      if (R.info && ['finalizada', 'cancelada', 'vencida'].includes(R.info.estado)) clearInterval(st.pasTimer);
      if (R.info && R.info.estado === 'tomada' && antes !== ahora) { try { if (navigator.vibrate) navigator.vibrate(200); } catch (x) {} }
      if (R.info && R.info.estado === 'finalizada' && antes !== ahora && typeof HIST !== 'undefined') { HIST.unshift({ f: Date.now(), o: R.oN || 'Origen', d: R.dN || 'Destino', clase: R.tipo === 'taxi' ? 'Taxi' : 'Auto', precio: R.info.precio_final || R.precio }); try { saveMis(); } catch (x) {} }
      if (antes !== ahora && S.tab === 'viaje') redraw(); else { const el = document.getElementById('solPasSeg'); if (el && R.info && R.info.estado === 'buscando') el.textContent = restante(R.info); }
    } catch (e) { /* sin conexión: se reintenta */ }
  }
  const restante = i => { const r = Math.max(0, Math.round((new Date(i.vence_en) - Date.now()) / 1000)); return r ? `Quedan ${Math.floor(r / 60)}:${String(r % 60).padStart(2, '0')}` : ''; };
  function pasajeroHTML(R) {
    const i = R.info || { estado: 'buscando', propuestas: [], rechazos: 0 }, veh = R.tipo === 'taxi' ? 'taxi' : 'auto';
    const cab = (t, c, pulso, sub = '') => `<div class="status"><span class="dot ${pulso ? 'pulse' : ''}" style="background:${c}"></span><div><h3>${t}</h3><div class="hint" id="solPasSeg">${sub}</div></div></div>`;
    const ruta = `<div class="sol-ruta" style="font-size:15px"><span><i style="background:#16A34A">A</i>${e_(R.oN || 'Origen')}</span><span><i style="background:#DC2626">B</i>${e_(R.dN || 'Destino')}</span></div>`;
    let h = '<div class="card">';
    if (!R.sol || i.estado === 'buscando') {
      h += cab(`Buscando ${veh} cerca…`, 'var(--warn)', true, R.info ? restante(i) : '') + ruta
        + `<p class="hint" style="margin:0">Avisamos a ${R.n === 1 ? 'el conductor' : 'los ' + (R.n || '') + ' conductores'} de ${veh} en servicio cerca de ti. El primero que acepte se lleva el viaje.${i.rechazos ? ` ${i.rechazos} no pudo${i.rechazos > 1 ? 'ieron' : ''} tomarlo.` : ''}</p>`
        + `<div class="row" style="justify-content:space-between"><span>${R.tipo === 'taxi' ? 'Precio' : 'Precio de referencia'}</span><span class="mono">${R.precio > 0 ? (R.tipo === 'taxi' ? 'sugerido ' : '') + pesos(R.precio) : 'lo pone el taxista al aceptar'}</span></div>`
        + (R.tipo === 'taxi' ? '<p class="hint" style="margin:0">El taxista confirma su precio al aceptar. Lo verás antes de que llegue; si no te acomoda, puedes cancelar.</p>' : '');
      if ((i.propuestas || []).length) h += `<h3>Conductores que proponen otro precio</h3><div class="list">${i.propuestas.map(p => `<button class="offer" data-solprop="${p.sesion}"><span class="plate">${e_(p.patente)}</span><span><div style="font-weight:600">${e_(p.marca_modelo)}</div><div class="hint">${p.eta_min ? 'llega en ' + p.eta_min + ' min' : 'conductor real'}</div></span><span class="p">${pesos(p.precio)}</span></button>`).join('')}</div>`;
      h += `<button class="btn ghost" data-sol="cancelar">Cancelar</button>`;
    } else if (['tomada', 'llego', 'en_viaje'].includes(i.estado)) {
      const t = { tomada: [`¡${veh === 'taxi' ? 'Taxi' : 'Auto'} en camino!`, 'var(--auto)', true, i.eta_min ? `Llega en unos ${i.eta_min} min` : 'El conductor va hacia ti'], llego: ['Tu conductor llegó', 'var(--ok)', false, 'Te espera en el punto A'], en_viaje: ['En viaje hacia B', 'var(--accent)', true, ''] }[i.estado];
      h += cab(...t) + (i.vehiculo ? `<div class="row" style="gap:12px"><span class="sol-pat">${e_(i.vehiculo.patente)}</span><span><b>${e_(i.vehiculo.marca_modelo)}</b><div class="hint">${i.vehiculo.tipo === 'taxi' ? 'Taxi' : 'Auto'} · conductor verificado por patente</div></span></div>` : '') + ruta
        + `<div class="row" style="justify-content:space-between"><span>${R.tipo === 'taxi' ? 'Precio del taxista' : 'Precio acordado'}</span><b class="mono" style="font-size:20px">${i.precio_final || R.precio > 0 ? pesos(i.precio_final || R.precio) : 'a convenir'}</b></div>`
        + (i.conductor_pos ? `<a class="btn sm ghost" href="https://www.google.com/maps/search/?api=1&query=${i.conductor_pos.lat},${i.conductor_pos.lng}" target="_blank" rel="noopener">Ver dónde viene</a>` : '')
        + (i.estado !== 'en_viaje' ? `<button class="btn ghost" data-sol="cancelar">Cancelar viaje</button>` : '');
    } else if (i.estado === 'finalizada') {
      h += cab('Llegaste a tu destino', 'var(--ok)', false) + `<div class="row" style="justify-content:space-between"><span>Pagaste</span><b class="mono">${pesos(i.precio_final || R.precio)}</b></div><button class="btn" data-sol="cerrar">Nuevo viaje</button>`;
    } else {
      const t = i.estado === 'cancelada' ? 'El viaje se canceló' : `Ningún ${veh} aceptó a tiempo`;
      h += cab(t, 'var(--muted)', false) + `<p class="hint" style="margin:0">${i.estado === 'vencida' ? 'Puedes volver a pedirlo o probar otra opción.' : ''}</p><div class="grid2"><button class="btn" data-sol="repedir">Volver a pedir</button><button class="btn ghost" data-sol="cerrar">Cerrar</button></div>`;
    }
    return h + '</div><p class="hint">Conductores reales de VAMO (versión de desarrollo). El pago se acuerda directo con el conductor.</p>';
  }

  // ===================== PASAJERO: esperando colectivo =====================
  let ESP = null; try { ESP = JSON.parse(localStorage.getItem('vamo-espera') || 'null'); } catch (x) {}
  const guardarEsp = () => { try { ESP ? localStorage.setItem('vamo-espera', JSON.stringify(ESP)) : localStorage.removeItem('vamo-espera'); } catch (x) {} };
  const ui = { sentido: 'Hacia Valparaíso', personas: 1, msg: '' };
  async function cargarAvisos() { if (Date.now() - st.avisosAt < 20000) return; st.avisosAt = Date.now();
    try { st.avisos = await FLOTA.pedir(`aviso_colectivo?select=*&order=creado_en.desc&limit=10`, { publico: true }); if (S.tab === 'colectivos') redraw(); } catch (e) {} }
  function esperaHTML() {
    if (!(window.FLOTA && FLOTA.on)) return '';
    cargarAvisos();
    if (ESP && ESP.vence < Date.now()) { ESP = null; guardarEsp(); }
    const av = (st.avisos || []).filter(a => Date.now() - new Date(a.creado_en) < 20 * 60000);
    const avHTML = av.length ? `<div class="card"><h3>📣 Avisos de colectiveros</h3>${av.map(a => `<div class="sol-espera"><span class="sol-pulso"></span><span><b>Disponible con ${a.cupos} ${a.cupos === 1 ? 'cupo' : 'cupos'}</b><div>${e_(a.sentido || '')}${a.lugar_texto ? ' · ' + e_(a.lugar_texto) : ''}</div><small class="hint">${hace(a.creado_en)} · lo informa el conductor</small></span></div>`).join('')}</div>` : '';
    if (ESP) return avHTML + `<div class="card" style="border:2px solid var(--colectivo)"><div class="row" style="gap:10px;align-items:flex-start"><span class="sol-pulso"></span><span><h3 style="margin:0">Estás esperando colectivo</h3>
      <p class="hint" style="margin:4px 0 0">${e_(ESP.lugar)} · ${e_(ESP.sentido)} · ${ESP.personas} ${ESP.personas === 1 ? 'persona' : 'personas'}. Los colectiveros en servicio lo ven hasta las ${new Date(ESP.vence).toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' })}.</p></span></div>
      ${window.PUSH && PUSH.soportado() && !PUSH.activo() ? '<button class="btn sm secundario" data-sol="push">🔔 Avísame cuando un colectivo tenga cupos</button>' : ''}
      <div class="grid2"><button class="btn" data-sol="subi">Ya me subí</button><button class="btn ghost" data-sol="noespero">Ya no espero</button></div></div>`;
    return avHTML + `<div class="card"><h3>¿Estás esperando colectivo?</h3><p class="hint" style="margin:0">Márcalo y los colectiveros en servicio verán que hay gente esperando donde estás (ubicación aproximada). No es una reserva.</p>
      <div class="seg">${['Hacia Valparaíso', 'Hacia Casablanca'].map(x => `<button data-solsent="${x}" aria-pressed="${ui.sentido === x}">${x}</button>`).join('')}</div>
      <div class="row"><span class="hint">Personas</span>${[1, 2, 3, 4].map(n => `<button class="chip ${ui.personas === n ? 'sel' : ''}" data-solper="${n}">${n}</button>`).join('')}</div>
      <button class="gbtn" data-sol="espero" style="--c:var(--colectivo)">🙋 ESTOY ESPERANDO AQUÍ</button>${ui.msg ? `<p class="note">${e_(ui.msg)}</p>` : ''}</div>`;
  }
  async function marcarEspera(b) {
    b.disabled = true; b.textContent = 'Buscando tu ubicación…';
    const pos = await new Promise(res => { if (!navigator.geolocation) return res(null); navigator.geolocation.getCurrentPosition(p => res([p.coords.latitude, p.coords.longitude]), () => res(null), { enableHighAccuracy: true, timeout: 10000, maximumAge: 30000 }); });
    let c = pos, lugar = '';
    if (!c) { const p = typeof placeOf === 'function' && placeOf(S.o); if (p) { c = p.c; lugar = p.n; } }
    if (!c) { ui.msg = 'No pudimos saber dónde estás. Permite la ubicación o elige tu punto A en «Pedir auto».'; redraw(); return; }
    if (!lugar && typeof nearPlace === 'function') { const np = nearPlace(c); lugar = np.d < 0.6 ? 'Cerca de ' + np.n : 'Punto en el mapa'; }
    try { await rpc('marcar_espera', { p_lugar: lugar, p_lat: c[0], p_lng: c[1], p_sentido: ui.sentido, p_personas: ui.personas });
      ESP = { lugar, sentido: ui.sentido, personas: ui.personas, vence: Date.now() + 20 * 60000 }; ui.msg = ''; guardarEsp(); }
    catch (e) { ui.msg = msgErr(e); }
    redraw();
  }

  function precioModal(desdeInput) { const m = st.modal; if (!m || !m.el) return;
    const o = $('#solPrecio', m.el), i = $('#solPrecioIn', m.el); if (o) o.textContent = pesos(m.precio); if (i && !desdeInput) i.value = m.precio || '';
    const si = $('#solSi', m.el); if (si) si.textContent = m.sol.tipo === 'auto' && m.precio !== m.sol.precio_ref ? 'Proponer ' + pesos(m.precio) : 'Aceptar' + (m.precio ? ' ' + pesos(m.precio) : ''); }
  document.addEventListener('input', e => { if (e.target.id !== 'solPrecioIn' || !st.modal) return; st.modal.precio = +e.target.value.replace(/\D/g, '').slice(0, 6) || 0; e.target.style.borderColor = ''; precioModal(true); });

  // ===================== Botones =====================
  document.addEventListener('click', async e => {
    const b = e.target.closest('button[data-sol],button[data-solr],button[data-solp],button[data-solv],button[data-solprop],button[data-solsent],button[data-solper]'); if (!b) return;
    const d = b.dataset;
    if (d.solr) return responder(d.solr);
    if (d.solp && st.modal) { const m = st.modal; m.precio = Math.max(500, (m.precio || 2500 - +d.solp) + +d.solp); precioModal(); return; }
    if (d.solv) { if (!st.viaje) return; if (d.solv === 'cancelada' && !confirm('¿Cancelar este viaje? El pasajero recibirá el aviso.')) return;
      b.disabled = true; try { await rpc('avanzar_viaje', { sol: st.viaje.id, e: d.solv }); } catch (x) { alert(msgErr(x)); }
      st.viaje = d.solv === 'finalizada' || d.solv === 'cancelada' ? null : await rpc('mi_viaje_en_curso', { s: st.sid }).catch(() => st.viaje); st.viajeAt = Date.now(); redraw(); return; }
    if (d.solprop && S.ride && S.ride.real) { b.disabled = true; try { await rpc('elegir_propuesta', { sol: S.ride.sol, s: d.solprop }); } catch (x) { S.note = msgErr(x); } actualizarPas(); return; }
    if (d.solsent) { ui.sentido = d.solsent; redraw(); return; }
    if (d.solper) { ui.personas = +d.solper; redraw(); return; }
    switch (d.sol) {
      case 'visto': st.viaje = null; st.viajeAt = Date.now(); redraw(); break;
      case 'push': b.disabled = true; try { await PUSH.suscribir(); } catch (x) { alert(msgErr(x)); } redraw(); break;
      case 'cupos': { const s = Object.values(SES).find(x => x.rsid === st.sid); if (!s) return; b.disabled = true;
        try { await rpc('avisar_disponible', { s: st.sid, n: s.cupos }); st.avisoAt = Date.now(); st.avisoMsg = `Aviso enviado: disponible con ${s.cupos} ${s.cupos === 1 ? 'cupo' : 'cupos'}.`; setTimeout(redraw, 181000); }
        catch (x) { st.avisoMsg = msgErr(x); } redraw(); break; }
      case 'cancelar': if (S.ride && S.ride.sol) rpc('cancelar_solicitud', { sol: S.ride.sol }).catch(() => {}); clearInterval(st.pasTimer); S.ride = null; redraw(); break;
      case 'cerrar': clearInterval(st.pasTimer); S.ride = null; redraw(); break;
      case 'repedir': { const R = S.ride; S.ride = null; if (R) { const ok = await pedirViaje({ tipo: R.tipo, clase: R.clase, km: R.km, precio: R.precio, o: { c: R.o, n: R.oN }, d: { c: R.d, n: R.dN } }); if (!ok) { S.note = `Ya no hay ${R.tipo === 'taxi' ? 'taxis' : 'autos'} reales en servicio. Prueba otra opción.`; redraw(); } } break; }
      case 'espero': marcarEspera(b); break;
      case 'subi': case 'noespero': rpc('cancelar_espera', {}).catch(() => {}); ESP = null; guardarEsp(); redraw(); break;
    }
  });

  // ===================== Al abrir desde una notificación y al recargar con jornada activa =====================
  function reanudar() {
    if (!(window.FLOTA && FLOTA.on) || typeof OWNER === 'undefined' || typeof SES === 'undefined') return;
    if (st.timer) return;
    for (const v of OWNER.vehiculos) { const s = SES[v.id], k = tipoDe(v); if (real(s) && ['taxi', 'auto', 'colectivo'].includes(k)) { vigilar(s.rsid, k, v.id); return; } }
  }
  function abrirPanel() { reanudar(); if (st.vid && typeof ir === 'function') { S.panelVid = st.vid; ir('panelcond'); } st.viajeAt = 0; sondear(); }
  window.addEventListener('load', () => {
    setTimeout(() => { reanudar(); const q = new URLSearchParams(location.search); if (q.get('solicitud') || q.get('esperas')) abrirPanel(); }, 1500);
    setInterval(reanudar, 15000);
    if (navigator.serviceWorker) navigator.serviceWorker.addEventListener('message', ev => { if (ev.data && ev.data.tipo === 'abrir-solicitud') abrirPanel(); });
  });

  return { panelHTML, colectivoHTML, pedirViaje, pasajeroHTML, esperaHTML, detener, vigilar, _st: st };
})();
