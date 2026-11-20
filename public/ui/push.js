/* VAMO · Avisos con la app cerrada (Web Push). Opcional: el permiso se pide solo cuando la persona toca el botón.
   La clave pública VAPID va aquí (es pública por diseño); la privada la generó el servidor y vive solo en la base (flota.config_privada, sin acceso desde la app).
   Honestidad: el aviso depende del navegador y del sistema; en iPhone requiere agregar VAMO a la pantalla de inicio. */
window.PUSH = (() => {
  // Una clave pública por proyecto. Producción queda sin clave (sin push) hasta desplegar allí la función de avisos.
  const CLAVES = { desarrollo: 'BLdDMCXFVrWTyKD8hQpnCs7MU0cUiZRaYWW9fbnK5UFfqNefgwzuh3Zzc-Gnm5PTHXL7YQRZOGltBR6S6lG6GdM', produccion: null };
  const VAPID_PUBLICA = window.FLOTA ? CLAVES[FLOTA.entorno] || null : null;
  const soportado = () => 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window && window.FLOTA && FLOTA.on && !!VAPID_PUBLICA;
  const esIOS = () => /iPhone|iPad|iPod/.test(navigator.userAgent);
  const instalada = () => (window.matchMedia && matchMedia('(display-mode: standalone)').matches) || navigator.standalone === true;
  const permiso = () => ('Notification' in window ? Notification.permission : 'denied');
  const b64 = s => { const p = '='.repeat((4 - s.length % 4) % 4), r = atob((s + p).replace(/-/g, '+').replace(/_/g, '/')); return Uint8Array.from(r, c => c.charCodeAt(0)); };
  const P = (path, o = {}) => FLOTA.pedir(path, { esquema: 'public', ...o });
  const estado = () => { let e = null; try { e = JSON.parse(localStorage.getItem('vamo-push') || 'null'); } catch (x) {} return e; };
  const guardar = e => { try { e ? localStorage.setItem('vamo-push', JSON.stringify(e)) : localStorage.removeItem('vamo-push'); } catch (x) {} };
  const activo = () => !!(estado() && permiso() === 'granted');

  // Texto de estado para la tarjeta de la alerta
  function aviso() {
    if (!soportado()) return esIOS() && !instalada() ? 'Para recibir avisos con VAMO cerrado en iPhone, agrega VAMO a la pantalla de inicio (Compartir › Agregar a inicio, iOS 16.4 o superior).' : '';
    if (permiso() === 'denied') return 'Bloqueaste las notificaciones de VAMO. Puedes permitirlas en la configuración del navegador.';
    return ''; }

  async function suscribir() {
    if (!soportado()) throw new Error('Este navegador no permite avisos con la app cerrada.');
    const p = await Notification.requestPermission();   // solo aquí, tras tocar el botón
    if (p !== 'granted') throw new Error('No diste permiso de notificaciones. Seguirás recibiendo avisos con VAMO abierto.');
    const reg = await navigator.serviceWorker.register('sw.js'); await navigator.serviceWorker.ready;
    let sub = await reg.pushManager.getSubscription();
    if (!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64(VAPID_PUBLICA) });
    const j = sub.toJSON();
    await P('suscripcion_push?on_conflict=endpoint', { method: 'POST', prefer: 'resolution=merge-duplicates', body: { endpoint: j.endpoint, p256dh: j.keys.p256dh, auth: j.keys.auth, user_agent: navigator.userAgent.slice(0, 200) } });
    guardar({ endpoint: j.endpoint, en: Date.now() }); return true; }

  // Copia de la alerta en el servidor para poder avisar con la app cerrada. Devuelve el id.
  async function subirAlerta(al) {
    const body = { origen: al.origen, destino: al.destino, abordaje_lugar: al.abordaje || null, modos: al.modos, anticipacion_min: al.anticip, salida_id: al.salida || null, vence_en: new Date(al.vence).toISOString(),
      silenciada_hasta: al.silencio > Date.now() ? new Date(al.silencio).toISOString() : null };
    if (al.srv) { await P(`alerta_pasajero?id=eq.${al.srv}`, { method: 'PATCH', body }); return al.srv; }
    const r = await P('alerta_pasajero', { method: 'POST', prefer: 'return=representation', body }); return r && r[0] && r[0].id; }
  async function cancelarAlerta(srv) { if (srv) await P(`alerta_pasajero?id=eq.${srv}`, { method: 'PATCH', body: { activa: false } }).catch(() => {}); }
  async function desactivar() { const e = estado(); guardar(null);
    try { const reg = await navigator.serviceWorker.getRegistration(); const sub = reg && await reg.pushManager.getSubscription(); if (sub) await sub.unsubscribe(); } catch (x) {}
    if (e && e.endpoint) await P(`suscripcion_push?endpoint=eq.${encodeURIComponent(e.endpoint)}`, { method: 'DELETE' }).catch(() => {}); }
  return { soportado, permiso, activo, aviso, suscribir, subirAlerta, cancelarAlerta, desactivar, esIOS, instalada };
})();
