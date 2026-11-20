// VAMO · Avisos push de «Avísame cuando venga» con la app cerrada.
// Se ejecuta cada minuto (pg_cron). Revisa las alertas activas guardadas por los pasajeros que aceptaron push y envía:
//   · inicio de servicio y «en punto de salida» de buses/colectivos compatibles (lo que marca el conductor)
//   · próxima salida programada dentro de la anticipación elegida (horario publicado, pendiente de confirmación)
//   · suspensiones del día registradas por el equipo VAMO
// No calcula aproximación por GPS en el servidor (eso queda en la app abierta).
// Cada aviso se registra en public.notificacion con una clave única: nunca se envía dos veces.
// Secretos: la clave privada VAPID la genera esta misma función la primera vez y queda en flota.config_privada
// (sin acceso para anon ni authenticated; solo service_role). El token de pg_cron se genera dentro de la base.
// Ningún secreto pasa por el navegador ni por el repositorio.
import { createClient } from 'npm:@supabase/supabase-js@2.45.4';
import webpush from 'npm:web-push@3.6.7';

const url = Deno.env.get('SUPABASE_URL')!, key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const NOMBRES: Record<string, string> = { casablanca: 'Casablanca', valparaiso: 'Valparaíso', vina: 'Viña del Mar', quilpue: 'Quilpué', villa_alemana: 'Villa Alemana', santiago: 'Santiago', curacavi: 'Curacaví' };
const norm = (s: string) => (s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
const aMin = (h: string) => { const [a, b] = h.split(':').map(Number); return a * 60 + b; };
const hm = (m: number) => `${String(Math.floor(m / 60) % 24).padStart(2, '0')}:${String(Math.round(m) % 60).padStart(2, '0')}`;

function ahoraChile() {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Santiago', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(new Date()).map(x => [x.type, x.value]));
  return { fecha: `${p.year}-${p.month}-${p.day}`, min: Number(p.hour) * 60 + Number(p.minute) };
}
const enSilencio = (pref: any, min: number) => { if (!pref || !pref.silencio_desde || !pref.silencio_hasta) return false;
  const a = aMin(pref.silencio_desde), b = aMin(pref.silencio_hasta); return a <= b ? min >= a && min < b : min >= a || min < b; };

const b64u = (u: Uint8Array) => btoa(String.fromCharCode(...u)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const desB64u = (s: string) => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - s.length % 4) % 4)), c => c.charCodeAt(0));

Deno.serve(async req => {
  let cuerpo: any = {}; try { cuerpo = await req.json(); } catch (_) { /* sin cuerpo */ }
  const db = createClient(url, key, { auth: { persistSession: false } }), fl = db.schema('flota');
  const { data: conf } = await fl.from('config_privada').select('clave,valor');
  const C = Object.fromEntries((conf || []).map((r: any) => [r.clave, r.valor]));
  if (!C.avisos_token || cuerpo.token !== C.avisos_token) return new Response('no autorizado', { status: 401 });
  if (cuerpo.accion === 'iniciar') {          // genera el par VAPID una sola vez y devuelve solo la clave pública
    if (C.vapid_publica) return Response.json({ publica: C.vapid_publica });
    const par = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
    const jwk: any = await crypto.subtle.exportKey('jwk', par.privateKey);
    const pub = new Uint8Array([4, ...desB64u(jwk.x), ...desB64u(jwk.y)]), publica = b64u(pub);
    const r = await fl.from('config_privada').insert([{ clave: 'vapid_privada', valor: jwk.d }, { clave: 'vapid_publica', valor: publica }]);
    if (r.error) return new Response(r.error.message, { status: 500 });
    return Response.json({ publica });
  }
  if (!C.vapid_privada) return new Response('sin claves', { status: 503 });
  webpush.setVapidDetails('https://desarrollo.trayectocsb.pages.dev', C.vapid_publica, C.vapid_privada);
  const { fecha, min } = ahoraChile(), resumen = { alertas: 0, enviados: 0, fallidos: 0 };

  const { data: alertas } = await db.from('alerta_pasajero').select('*').eq('activa', true).gt('vence_en', new Date().toISOString());
  if (!alertas?.length) return Response.json(resumen);
  const usuarios = [...new Set(alertas.map(a => a.usuario_id))];
  const [{ data: subs }, { data: prefs }, { data: eventos }] = await Promise.all([
    db.from('suscripcion_push').select('*').in('usuario_id', usuarios).gt('vence_en', new Date().toISOString()),
    db.from('preferencia_pasajero').select('*').in('usuario_id', usuarios),
    fl.from('evento_servicio').select('*').gt('creado_en', new Date(Date.now() - 3 * 60000).toISOString()).in('tipo', ['inicio', 'en_punto_salida'])]);
  const alts: Record<string, any> = {};

  async function enviar(a: any, clave: string, tipo: string, texto: string) {
    const ss = (subs || []).filter(s => s.usuario_id === a.usuario_id); if (!ss.length) return;
    const ins = await db.from('notificacion').insert({ usuario_id: a.usuario_id, alerta_id: a.id, clave, tipo, texto, canal: 'push', estado: 'pendiente' }).select('id');
    if (ins.error || !ins.data?.length) return;           // ya enviado antes (clave única)
    let ok = false;
    for (const s of ss) {
      try { await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, JSON.stringify({ titulo: 'VAMO!', texto, tag: clave, url: './?aviso=1' }), { TTL: 600, urgency: 'high' }); ok = true; }
      catch (e: any) { if (e?.statusCode === 404 || e?.statusCode === 410) await db.from('suscripcion_push').delete().eq('id', s.id); }
    }
    await db.from('notificacion').update({ estado: ok ? 'enviada' : 'fallida' }).eq('id', ins.data[0].id);
    ok ? resumen.enviados++ : resumen.fallidos++;
  }

  for (const a of alertas) {
    if (a.silenciada_hasta && new Date(a.silenciada_hasta) > new Date()) continue;
    if (enSilencio((prefs || []).find(p => p.usuario_id === a.usuario_id), min)) continue;
    if (!(subs || []).some(s => s.usuario_id === a.usuario_id)) continue;
    resumen.alertas++;
    const k = `${a.origen}|${a.destino}`;
    if (!alts[k]) { const { data } = await db.rpc('alternativas', { p_origen: a.origen, p_destino: a.destino, p_fecha: fecha }); alts[k] = data?.alternativas || []; }
    const lista: any[] = alts[k], ids = new Set(lista.map(x => x.recorrido_id)), dest = NOMBRES[a.destino] || a.destino;
    const opName = (alt: any) => alt?.operador?.nombre || 'Bus';
    // Vehículos compatibles (lo que marcó el conductor)
    for (const e of eventos || []) {
      const hacia = e.sentido ? norm(e.sentido).includes(norm(dest)) : null;
      const bus = e.vehiculo_tipo === 'bus' && a.modos.includes('bus') && e.recorrido_id && ids.has(e.recorrido_id) && hacia !== false;
      const col = e.vehiculo_tipo === 'colectivo' && a.modos.includes('colectivo') && [a.origen, a.destino].sort().join() === 'casablanca,valparaiso' && hacia === true;
      if (!bus && !col) continue;
      const quien = bus ? opName(lista.find(x => x.recorrido_id === e.recorrido_id)) : 'Colectivo';
      if (e.tipo === 'inicio') await enviar(a, `ini:${e.sesion_id}`, 'inicio', `🚌 ${quien} hacia ${dest} inició servicio. Informado por el conductor.`);
      else await enviar(a, `pto:${e.sesion_id}:${e.id}`, 'punto', `🚕 ${quien} hacia ${dest} está en su punto de salida${e.cupos != null ? ` · cupos informados: ${e.cupos}` : ''}.`);
    }
    // Suspensiones y próxima salida programada
    for (const alt of lista) {
      if (!a.modos.includes('bus')) break;
      for (const x of alt.excepciones || []) if (x.tipo === 'suspendida') await enviar(a, `exc:${fecha}:${alt.recorrido_id}:${x.salida_id || 'todo'}`, 'cambio', `⚠️ ${opName(alt)}: servicio suspendido hoy${x.detalle ? '. ' + x.detalle : ''}.`);
      for (const s of alt.salidas || []) {
        if (s.tipo_dia === 'sin_dia' || !s.hora || s.excepcion?.tipo === 'suspendida') continue;
        if (a.salida_id && s.id !== a.salida_id) continue;
        const sm = s.excepcion?.tipo === 'modificada' && s.excepcion?.nueva_hora ? aMin(s.excepcion.nueva_hora) : aMin(s.hora), falta = sm - min;
        if (falta >= 0 && falta <= a.anticipacion_min) await enviar(a, `sal:${fecha}:${s.id}`, 'horario', `🕒 Próximo ${opName(alt)} programado a las ${hm(sm)} (en ${falta} min). Salida programada, pendiente de confirmación.`);
      }
    }
  }
  return Response.json(resumen);
});
