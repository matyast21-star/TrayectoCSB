/* VAMO · Avisos de locomoción.
   Lógica pura (sin DOM): qué servicios sirven a un trayecto, cuál destacar, cuándo avisar y cómo no repetir avisos.
   Fuentes que usa, y nunca mezcla: GPS de conductor autorizado, estado que marcó el conductor, reportes comunitarios
   agregados (3 o más personas para ubicar), salidas publicadas y excepciones registradas. Nada se simula. */
window.AVISOS = (() => {
  const LS = (k, v) => { try { if (v === undefined) return JSON.parse(localStorage.getItem(k) || 'null'); if (v === null) localStorage.removeItem(k); else localStorage.setItem(k, JSON.stringify(v)); } catch (e) { return null; } return v; };
  const norm = s => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  const aMin = t => { if (!t) return null; const [h, m] = String(t).split(':').map(Number); return h * 60 + m; };
  const hm = m => String(Math.floor(((m % 1440) + 1440) % 1440 / 60)).padStart(2, '0') + ':' + String(Math.round(m) % 60).padStart(2, '0');

  const INFO = { oficial_verificado: 'Oficial verificado', publicado_sin_verificar: 'Publicado sin verificar', referencial: 'Referencial', incompleto: 'Incompleto', desactualizado: 'Desactualizado' };
  const ESTADO = { disponible: 'Disponible', en_punto_salida: 'En punto de salida', en_recorrido: 'En recorrido', completo: 'Completo', fuera_servicio: 'Fuera de servicio' };

  // ---- Geometría simple (sin dependencias): distancia y avance sobre un trazado [[lat,lng],...] en km
  const km = (a, b) => { const r = Math.PI / 180, dLa = (b[0] - a[0]) * r, dLo = (b[1] - a[1]) * r;
    const h = Math.sin(dLa / 2) ** 2 + Math.cos(a[0] * r) * Math.cos(b[0] * r) * Math.sin(dLo / 2) ** 2; return 12742 * Math.asin(Math.sqrt(h)); };
  function proyectar(path, p) { let acc = 0, best = { d: Infinity, t: 0 };
    for (let i = 0; i < path.length - 1; i++) { const a = path[i], b = path[i + 1], cx = Math.cos(a[0] * Math.PI / 180) * 111.32;
      const bx = (b[1] - a[1]) * cx, by = (b[0] - a[0]) * 110.57, px = (p[1] - a[1]) * cx, py = (p[0] - a[0]) * 110.57, L = Math.hypot(bx, by);
      const u = L ? Math.max(0, Math.min(1, (px * bx + py * by) / (L * L))) : 0, d = Math.hypot(px - u * bx, py - u * by);
      if (d < best.d) best = { d, t: acc + u * L }; acc += L; }
    return best; }
  // Avance del vehículo hacia el punto de abordaje, medido por el trazado (no en línea recta)
  function aproximacion(v, path, abordaje) {
    if (v.lat == null || v.lng == null || !path || path.length < 2 || !abordaje) return null;
    const pv = proyectar(path, [v.lat, v.lng]), pb = proyectar(path, abordaje);
    if (pv.d > 1.5) return { fuera: true };                       // lejos del trazado: no se estima nada
    const resta = pb.t - pv.t;
    if (resta < -0.3) return { paso: true, km: -resta };           // ya pasó por el punto de abordaje
    const vel = v.tipo === 'bus' ? 35 : 45;                        // km/h de referencia, ajustable por recorrido
    return { km: Math.max(0, resta), min: Math.max(0, resta) / vel * 60 };
  }

  const colectivoCubre = (o, d) => [o, d].sort().join() === 'casablanca,valparaiso';
  const haciaDestino = (sentido, nombreDest) => sentido ? norm(sentido).includes(norm(nombreDest)) : null;

  // Salidas efectivas de una alternativa para la fecha (con excepciones aplicadas). Las «sin_dia» son solo referenciales.
  function salidas(alt) {
    return (alt.salidas || []).map(s => { const e = s.excepcion, base = aMin(s.hora);
      const hora = e && e.tipo === 'modificada' && e.nueva_hora ? aMin(e.nueva_hora) : base;
      return { ...s, min: hora, base, suspendida: !!(e && e.tipo === 'suspendida'), modificada: !!(e && e.tipo === 'modificada'), referencial: s.tipo_dia === 'sin_dia' }; }); }
  function proxima(alt, ahora, esHoy) {
    return salidas(alt).filter(s => !s.referencial && !s.suspendida && s.min != null && (!esHoy || s.min >= ahora - 0.5)).sort((a, b) => a.min - b.min)[0] || null; }

  // Vehículos en servicio compatibles con el trayecto. Un bus debe estar asignado a un recorrido que sirva el trayecto;
  // un colectivo debe ir declarado «hacia» el destino. Fuera de servicio no cuenta.
  function compatibles(ctx) {
    const alts = ctx.alts || [], ids = new Set(alts.map(a => a.recorrido_id)), out = [];
    for (const v of ctx.reales || []) { if (v.estado === 'fuera_servicio') continue;
      const hacia = haciaDestino(v.sentido, ctx.nombreDest);
      if (v.tipo === 'bus' && v.recorrido_id && ids.has(v.recorrido_id) && hacia !== false) {
        const alt = alts.find(a => a.recorrido_id === v.recorrido_id); let path = ctx.rutas && ctx.rutas[v.recorrido_id];
        if (path && alt && alt.sentido === 'vuelta') path = [...path].reverse();
        out.push({ v, alt, path, hacia, abordaje: ctx.abordaje || (alt && alt.abordaje && alt.abordaje.lat != null ? [alt.abordaje.lat, alt.abordaje.lon] : ctx.origenC) });
      } else if (v.tipo === 'colectivo' && colectivoCubre(ctx.origen, ctx.destino) && hacia === true) {
        const path = ctx.colPath ? (ctx.destino === 'casablanca' ? [...ctx.colPath].reverse() : ctx.colPath) : null;
        out.push({ v, alt: null, path, hacia, abordaje: ctx.abordaje || ctx.origenC });
      } }
    return out.map(c => ({ ...c, ap: aproximacion(c.v, c.path, c.abordaje) })); }

  const haceTxt = iso => { if (!iso) return ''; const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
    return s < 60 ? `hace ${Math.round(s)} s` : s < 3600 ? `hace ${Math.round(s / 60)} min` : `hace ${Math.round(s / 3600)} h`; };
  const cuposRecientes = v => v.cupos != null && v.cupos_en && Date.now() - new Date(v.cupos_en).getTime() < 10 * 60000;
  const nombreOp = alt => (alt && alt.operador && alt.operador.nombre) || 'Bus';

  // Estado inmediato del trayecto: líneas ordenadas por utilidad. Cada línea dice de dónde viene el dato.
  function estado(ctx) {
    const L = [], d = ctx.nombreDest, cs = compatibles(ctx);
    for (const a of ctx.alts || []) for (const e of a.excepciones || []) if (['suspendida', 'modificada', 'reducida', 'aviso'].includes(e.tipo))
      L.push({ k: 'exc', p: 0, icono: '⚠️', texto: `${nombreOp(a)}: ${e.tipo === 'suspendida' ? 'servicio suspendido hoy' : e.tipo === 'modificada' ? 'horario modificado hoy' : e.tipo === 'reducida' ? 'servicio reducido hoy' : 'aviso del operador'}`, sub: e.detalle || '', fuente: 'Registrado por un administrador' });
    for (const a of ctx.avisosPausa || []) L.push({ k: 'pausa', p: 0, icono: '⚠️', texto: a.texto, sub: 'Aviso del operador', fuente: 'operador' });
    for (const c of cs) { const v = c.v, tipo = v.tipo === 'bus' ? 'Bus' : 'Colectivo', quien = v.tipo === 'bus' ? nombreOp(c.alt) : 'Colectivo', hacia = c.hacia ? ` hacia ${d}` : ' (sentido no informado)';
      if (v.estado === 'completo') { L.push({ k: 'completo', p: 6, icono: v.tipo === 'bus' ? '🚌' : '🚕', texto: `${tipo}${hacia}: completo`, sub: 'Informado por el conductor', fuente: 'conductor', id: v.sesion_id, noRecomendar: true }); continue; }
      if (c.ap && c.ap.paso) { L.push({ k: 'paso', p: 7, icono: v.tipo === 'bus' ? '🚌' : '🚕', texto: `${quien}${hacia}: ya pasó por tu punto`, sub: `GPS del conductor · ${haceTxt(v.posicion_en)}`, fuente: 'gps', id: v.sesion_id, noRecomendar: true }); continue; }
      const cup = cuposRecientes(v) ? ` · cupos informados: ${v.cupos}` : '';
      if (v.tipo === 'colectivo' && v.estado === 'en_punto_salida') { L.push({ k: 'punto', p: 1, icono: '🚕', texto: `Colectivo${hacia} disponible en su punto de salida`, sub: `Informado por el conductor ${haceTxt(v.estado_en)}${cup}`, fuente: 'conductor', id: v.sesion_id }); continue; }
      if (c.ap && c.ap.min != null) L.push({ k: 'gps', p: 1, icono: v.tipo === 'bus' ? '🚌' : '🚕', texto: `${quien}${hacia}: en recorrido`, sub: `a ~${Math.max(1, Math.round(c.ap.min))} min de tu punto (${c.ap.km.toFixed(1)} km por el recorrido) · GPS ${haceTxt(v.posicion_en)}${cup}`, fuente: 'gps', id: v.sesion_id, min: c.ap.min });
      else L.push({ k: 'servicio', p: 2, icono: v.tipo === 'bus' ? '🚌' : '🚕', texto: `${quien}${hacia}: ${ESTADO[v.estado] ? ESTADO[v.estado].toLowerCase() : 'en servicio'}`, sub: `${v.lat != null ? 'Ubicación compartida ' + haceTxt(v.posicion_en) : 'Sin ubicación reciente'}${cup}`, fuente: 'conductor', id: v.sesion_id }); }
    for (const r of ctx.reportes || []) { if (r.tipo !== 'locomocion' || (r.destino && r.destino !== ctx.destino)) continue;
      const modo = r.modo === 'bus' ? 'un bus' : 'un colectivo';
      if (r.respaldado) L.push({ k: 'rep', p: 3, icono: '📍', texto: `${r.personas} personas reportaron ${modo} hacia ${d}`, sub: `Reporte comunitario ${haceTxt(r.ultimo)} · no es confirmación oficial`, fuente: 'comunidad', lat: r.lat, lng: r.lng });
      else L.push({ k: 'rep1', p: 5, icono: '📍', texto: `${r.personas === 1 ? 'Un reporte' : r.personas + ' reportes'} de ${modo} hacia ${d}`, sub: `Reporte comunitario ${haceTxt(r.ultimo)} · aún sin confirmar (se necesitan 3)`, fuente: 'comunidad' }); }
    let mejor = null;
    for (const a of ctx.alts || []) { const s = proxima(a, ctx.ahora, ctx.esHoy); if (s && (!mejor || s.min < mejor.s.min)) mejor = { a, s }; }
    if (mejor) { const { a, s } = mejor, enMin = ctx.esHoy ? Math.round(s.min - ctx.ahora) : null;
      L.push({ k: 'prox', p: 4, icono: '🕒', texto: `Próximo ${nombreOp(a)} programado a las ${hm(s.min)}${enMin != null && enMin <= 90 ? ` (en ${Math.max(0, enMin)} min)` : ''}`,
        sub: `${s.estado_info === 'oficial_verificado' ? 'Horario oficial verificado' : 'Salida programada, pendiente de confirmación'}${s.modificada ? ' · horario modificado' : ''}${s.variante ? ` · variante informada ${s.variante}` : ''}${!a.desde_inicio && !s.hora ? ' · hora de paso no informada' : ''}`, fuente: 'horario', salida: s.id, recorrido: a.recorrido_id }); }
    L.sort((x, y) => x.p - y.p);
    return { lineas: L, compatibles: cs, destacada: L.find(l => !l.noRecomendar && l.k !== 'exc' && l.k !== 'pausa' && l.k !== 'rep1') || null };
  }

  // ---- «Avísame cuando venga» (dentro de la app). Una alerta por trayecto; vence a las 3 h.
  const alerta = () => { const a = LS('vamo-alerta'); if (a && a.vence < Date.now()) { LS('vamo-alerta', null); return null; } return a; };
  function crearAlerta(o) { const a = { id: 'a' + Date.now().toString(36), origen: o.origen, destino: o.destino, abordaje: o.abordaje || null, abordajeNombre: o.abordajeNombre || null,
      modos: o.modos || ['bus', 'colectivo'], anticip: o.anticip || 10, salida: o.salida || null, salidaTxt: o.salidaTxt || null, creada: Date.now(), vence: Date.now() + 3 * 3600e3, silencio: 0 };
    LS('vamo-alerta', a); return a; }
  const cancelarAlerta = () => LS('vamo-alerta', null);
  function actualizarAlerta(cambios) { const a = alerta(); if (!a) return null; Object.assign(a, cambios); LS('vamo-alerta', a); return a; }

  const vistos = () => { const v = LS('vamo-vistos') || {}, lim = Date.now() - 12 * 3600e3; for (const k in v) if (v[k] < lim) delete v[k]; return v; };
  function marcarVisto(claves) { const v = vistos(); for (const k of claves) v[k] = Date.now(); LS('vamo-vistos', v); }

  // Revisa la alerta y devuelve solo los avisos nuevos (cambios relevantes, nunca uno por cada punto GPS)
  function revisar(a, ctx, eventos) {
    if (!a || (a.silencio && a.silencio > Date.now())) return [];
    const out = [], d = ctx.nombreDest, dia = ctx.fecha || '', est = estado(ctx), vis = vistos();
    const quiere = t => a.modos.includes(t);
    for (const e of eventos || []) { if (new Date(e.creado_en).getTime() < a.creada - 60000 || !quiere(e.vehiculo_tipo)) continue;
      const hacia = haciaDestino(e.sentido, d), ok = e.vehiculo_tipo === 'bus' ? (ctx.alts || []).some(x => x.recorrido_id === e.recorrido_id) && hacia !== false
        : e.vehiculo_tipo === 'colectivo' && colectivoCubre(ctx.origen, ctx.destino) && hacia === true;
      if (!ok) continue;
      if (e.tipo === 'inicio') out.push({ clave: 'ini:' + e.sesion_id, tipo: 'inicio', texto: `${e.vehiculo_tipo === 'bus' ? '🚌 Un bus' : '🚕 Un colectivo'} hacia ${d} inició su servicio` });
      if (e.tipo === 'en_punto_salida') out.push({ clave: 'pto:' + e.sesion_id + ':' + e.id, tipo: 'punto', texto: `🚕 Colectivo hacia ${d} disponible en el punto de salida${e.cupos != null ? `. Cupos informados: ${e.cupos}` : ''}` }); }
    for (const c of est.compatibles) { const v = c.v; if (!quiere(v.tipo)) continue;
      if (v.tipo === 'colectivo' && v.estado === 'en_punto_salida') out.push({ clave: 'pto:' + v.sesion_id + ':' + v.estado_en, tipo: 'punto', texto: `🚕 Colectivo hacia ${d} disponible en el punto de salida${cuposRecientes(v) ? `. Cupos informados: ${v.cupos}` : ''}` });
      if (v.estado !== 'completo' && c.ap && !c.ap.paso && c.ap.min != null && c.ap.min <= a.anticip)
        out.push({ clave: 'cerca:' + v.sesion_id, tipo: 'cerca', texto: `🔔 Tu ${v.tipo === 'bus' ? 'bus' : 'colectivo'} hacia ${d} se está acercando (~${Math.max(1, Math.round(c.ap.min))} min)` }); }
    if (ctx.esHoy) for (const alt of ctx.alts || []) for (const s of salidas(alt)) { if (s.referencial || s.min == null) continue;
      if (a.salida && s.id !== a.salida) continue;
      const falta = s.min - ctx.ahora;
      if (s.suspendida && (a.salida === s.id || (falta >= 0 && falta <= 60))) out.push({ clave: `exc:${dia}:${s.id}`, tipo: 'cambio', texto: `⚠️ La salida de ${nombreOp(alt)} de las ${hm(s.base)} fue suspendida`, recorrido: alt.recorrido_id });
      else if (s.modificada && a.salida === s.id) out.push({ clave: `mod:${dia}:${s.id}`, tipo: 'cambio', texto: `⚠️ La salida que estabas siguiendo fue modificada: ahora a las ${hm(s.min)}` });
      else if (!s.suspendida && falta >= 0 && falta <= a.anticip) out.push({ clave: `sal:${dia}:${s.id}`, tipo: 'horario', texto: `🕒 Próximo ${nombreOp(alt)} programado a las ${hm(s.min)} · salida programada, pendiente de confirmación` }); }
    for (const r of ctx.reportes || []) if (r.respaldado && r.tipo === 'locomocion' && r.destino === ctx.destino && quiere(r.modo))
      out.push({ clave: `rep:${r.destino}:${r.modo}:${Math.floor(new Date(r.ultimo).getTime() / 600000)}`, tipo: 'comunidad', texto: `📍 Pasajeros reportaron locomoción hacia ${d} (reporte comunitario)` });
    const unicos = []; for (const x of out) if (!vis[x.clave] && !unicos.some(u => u.clave === x.clave)) unicos.push(x);
    return unicos; }

  return { LS, norm, aMin, hm, km, proyectar, aproximacion, colectivoCubre, salidas, proxima, compatibles, estado, INFO, ESTADO, haceTxt,
           alerta, crearAlerta, cancelarAlerta, actualizarAlerta, vistos, marcarVisto, revisar };
})();
