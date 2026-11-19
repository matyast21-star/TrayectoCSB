/* VAMO · Cliente de la base de conductores y dueños (esquema «flota» de Supabase).
   Solo se activa en el sitio de desarrollo (y en pruebas locales). En producción la app sigue usando
   su modo local hasta que la migración se apruebe y se aplique allí.
   Inicio de sesión anónimo: el teléfono recibe una identidad propia sin pedir correo ni SMS. */
window.FLOTA = (() => {
  const on = /^(desarrollo\.|localhost$|127\.0\.0\.1$)/.test(location.hostname);
  const URL_ = 'https://fryjiahvhjtuizgvtxtn.supabase.co', KEY = 'sb_publishable_EgtcjP_pcOBKVCo9PPXdGg_u2-2oJnG';
  const BUCKET = 'documentos-vehiculo';
  let ses = null; try { ses = JSON.parse(localStorage.getItem('vamo-auth') || 'null'); } catch (e) {}
  const guardar = () => { try { ses ? localStorage.setItem('vamo-auth', JSON.stringify(ses)) : localStorage.removeItem('vamo-auth'); } catch (e) {} };
  const leerError = async r => { let t = ''; try { t = await r.text(); const j = JSON.parse(t); return j.message || j.msg || j.error_description || j.error || t; } catch (e) { return t || 'HTTP ' + r.status; } };

  async function auth(path, body) {
    const r = await fetch(`${URL_}/auth/v1/${path}`, { method: 'POST', headers: { apikey: KEY, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    if (!r.ok) throw new Error(await leerError(r));
    const j = await r.json(); ses = { access_token: j.access_token, refresh_token: j.refresh_token, expires_at: j.expires_at || Math.floor(Date.now() / 1000) + (j.expires_in || 3600), user: j.user }; guardar(); return ses;
  }
  let pendiente = null;
  async function sesion() {
    if (ses && ses.expires_at * 1000 > Date.now() + 60000) return ses;
    if (pendiente) return pendiente;
    pendiente = (async () => {
      if (ses && ses.refresh_token) { try { return await auth('token?grant_type=refresh_token', { refresh_token: ses.refresh_token }); } catch (e) { /* sesión vencida: se crea otra */ } }
      return auth('signup', { data: {} });
    })().finally(() => { pendiente = null; });
    return pendiente;
  }
  async function pedir(path, { method = 'GET', body, prefer, publico = false } = {}) {
    const h = { apikey: KEY, 'Accept-Profile': 'flota', 'Content-Profile': 'flota' };
    if (!publico) h.Authorization = 'Bearer ' + (await sesion()).access_token;
    if (body !== undefined) h['Content-Type'] = 'application/json';
    if (prefer) h.Prefer = prefer;
    const r = await fetch(`${URL_}/rest/v1/${path}`, { method, headers: h, body: body === undefined ? undefined : JSON.stringify(body) });
    if (!r.ok) throw new Error(await leerError(r));
    const t = await r.text(); return t ? JSON.parse(t) : null;
  }
  const rpc = (fn, args = {}) => pedir('rpc/' + fn, { method: 'POST', body: args });
  async function subir(vid, tipo, file) {
    const ext = (file.name.split('.').pop() || 'bin').toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 5) || 'bin', ruta = `${vid}/${tipo}.${ext}`;
    const r = await fetch(`${URL_}/storage/v1/object/${BUCKET}/${ruta}`, { method: 'POST', headers: { apikey: KEY, Authorization: 'Bearer ' + (await sesion()).access_token, 'x-upsert': 'true', 'Content-Type': file.type || 'application/octet-stream' }, body: file });
    if (!r.ok) throw new Error(await leerError(r));
    return ruta;
  }
  async function verArchivo(ruta) {
    const r = await fetch(`${URL_}/storage/v1/object/sign/${BUCKET}/${ruta}`, { method: 'POST', headers: { apikey: KEY, Authorization: 'Bearer ' + (await sesion()).access_token, 'Content-Type': 'application/json' }, body: JSON.stringify({ expiresIn: 300 }) });
    if (!r.ok) throw new Error(await leerError(r));
    const j = await r.json(); return URL_ + '/storage/v1' + (j.signedURL || j.signedUrl);
  }
  return { on, URL: URL_, KEY, uid: () => (ses && ses.user ? ses.user.id : null), conSesion: () => !!ses, sesion, pedir, rpc, subir, verArchivo };
})();
