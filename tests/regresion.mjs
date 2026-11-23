// Pruebas de regresión de VAMO by FLUVA: recorren todas las funciones existentes en un navegador real.
// Uso: node tests/regresion.mjs            (sirve ./public en un puerto local)
//      BASE_URL=https://desarrollo.trayectocsb.pages.dev node tests/regresion.mjs
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', 'public');
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.svg': 'image/svg+xml', '.png': 'image/png', '.webmanifest': 'application/manifest+json' };
let server, BASE = process.env.BASE_URL;
if (!BASE) {
  server = createServer(async (req, res) => { const path = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    try { const body = await readFile(join(ROOT, path === '/' ? 'index.html' : path)); res.writeHead(200, { 'content-type': TYPES[extname(path) || '.html'] || 'application/octet-stream' }); res.end(body); }
    catch { res.writeHead(404); res.end(); } });
  await new Promise(r => server.listen(0, r)); BASE = `http://localhost:${server.address().port}/`;
}

const results = []; let failed = 0;
async function test(name, fn) { try { await fn(); results.push(['ok', name]); } catch (e) { failed++; results.push(['FALLA', name + ' → ' + e.message.split('\n')[0]]); } }
const assert = (c, m) => { if (!c) throw new Error(m); };

const browser = await chromium.launch();
// Las pruebas existentes entran como pasajero (la bienvenida se prueba aparte, con un teléfono nuevo)
const PASAJERO = () => { try { if (!localStorage.getItem('vamo-perfil')) localStorage.setItem('vamo-perfil', 'pasajero'); } catch (e) {} };
const nuevaPag = async o => { const p = await browser.newPage(o); await p.addInitScript(PASAJERO); return p; };
const ctx = await browser.newContext({ viewport: { width: 1300, height: 860 } });
await ctx.addInitScript(PASAJERO);
const page = await ctx.newPage(); const errors = [];
page.on('pageerror', e => errors.push(e.message));
await page.goto(BASE); await page.waitForTimeout(1200);
const ev = f => page.evaluate(f);
const wait = ms => page.waitForTimeout(ms);
// Navegación de 6 secciones: Micros y Colectivos están en «Buses y colectivos»; Delivery y Dueños en «Más servicios»
const GRUPO = { buses: 'locomocion', viaje: 'mas', planificar: 'mas', misviajes: 'mas', colectivos: 'mas', delivery: 'mas', duenos: 'mas', conductor: 'mas', soy: 'mas', favoritos: 'mas', config: 'mas', avisos: 'mas' };
const VIA = { duenos: 'soy', conductor: 'soy' }; // dentro de «Soy conductor o dueño de vehículo»
const irA = async (p, t) => { const g = GRUPO[t]; await p.click(`#tabs [data-tab=${g || t}]`); if (VIA[t]) await p.click(`#view [data-tab=${VIA[t]}]`); if (g) await p.click(`#view [data-tab=${t}]`); };
const until = async (f, ms = 60000) => { const t = Date.now(); while (Date.now() - t < ms) { if (await ev(f)) return true; await wait(500); } return false; };

await test('Carga la identidad VAMO (logo, kit claro, pestañas con íconos)', async () => {
  assert(await ev(() => !!window.VamoUI && !!document.querySelector('#marca .vamo-v')), 'falta el logo SVG');
  assert(await ev(() => getComputedStyle(document.body).backgroundColor === 'rgb(255, 255, 255)'), 'el fondo no es blanco');
  assert(await ev(() => { const c = getComputedStyle(document.documentElement); return c.getPropertyValue('--morado').trim().toUpperCase() === '#7B2FF7' && c.getPropertyValue('--ink').trim().toUpperCase() === '#1F2A44' && c.getPropertyValue('--line').trim().toUpperCase() === '#E5E7EB'; }), 'la paleta no es la del kit');
  assert(await page.locator('.tab svg').count() === 4, 'faltan íconos en las pestañas'); });
await test('Pedir viaje: precio libre con 3 ofertas y asignación', async () => {
  await irA(page, 'viaje');
  await ev(() => { PRECIO.modo = 'conductor'; S.clase = 'eco'; render(); }); await page.click('#pedir');
  assert(await until(() => S.ride && S.ride.fase === 'ofertas', 5000), 'no llegaron ofertas');
  await page.locator('.offer').first().click(); assert(await ev(() => S.ride.fase === 'va' && !!S.ride.car), 'no se asignó conductor'); await page.click('#cancelar'); });
await test('Pedir taxi: sin taxímetro, el taxista da su precio al aceptar', async () => {
  await ev(() => { S.clase = 'taxi'; render(); });
  const txt = await page.locator('#view').innerText(); assert(/no usan taxímetro/.test(txt) && !/bajada de bandera/i.test(txt), 'sigue hablando de taxímetro');
  await page.click('#pedir');
  assert(await until(() => S.ride && S.ride.fase === 'ofertas', 5000), 'no llegaron precios de taxistas');
  assert(await ev(() => { const o = placeOf(S.o), d = placeOf(S.d), sug = precioTaxiSugerido(o.loc, d.loc); return S.ride.ofertas.every(x => x.precio > 0 && (!sug || x.precio === sug)); }), 'precio distinto del sugerido dentro de la zona');
  assert(await ev(() => precioTaxiSugerido('casablanca', 'casablanca') === 2500 && precioTaxiSugerido('casablanca', 'valparaiso') === null), 'precio sugerido mal calculado');
  await page.click('[data-oferta="0"]'); assert(await until(() => S.ride && S.ride.fase === 'va', 3000), 'no se asignó el taxi elegido'); await page.click('#cancelar'); });
await test('Pedir viaje: rango estimado según viajes pagados', async () => {
  await ev(() => { PRECIO.modo = 'rango'; S.clase = 'eco'; render(); }); assert(/–/.test(await page.locator('[data-clase=eco] .p').innerText()), 'no muestra rango');
  await page.click('#pedir'); assert(await until(() => S.ride && S.ride.fase === 'va', 5000), 'no asignó'); await page.click('#cancelar'); await ev(() => { PRECIO.modo = 'auto'; render(); }); });
await test('Buses: ver salidas y comprar pasaje con QR', async () => {
  await irA(page, 'buses'); await page.locator('[data-route][data-th=programado]').first().click(); await wait(300);
  const dep = page.locator('[data-dep]').first(); assert(await dep.count(), 'no hay salidas'); await dep.click(); await page.click('#comprar'); await wait(300);
  assert(await ev(() => !!S.ticket && !!document.getElementById('qr')), 'no se emitió el pasaje'); });
await test('Micros desactivadas: no aparecen en la app', async () => {
  await irA(page, 'buses'); assert(await page.locator('#view [data-tab=micros]').count() === 0, 'sigue la pestaña Micros');
  assert(await ev(() => MICROS.length === 0 && !ALLROUTES.some(r => r.kind === 'micro') && !document.querySelector('[data-f=micro]')), 'quedan micros'); });
await test('Planificar: opciones multimodales', async () => {
  await irA(page, 'planificar'); assert(await page.locator('[data-plan]').count() >= 1, 'sin opciones'); await page.locator('[data-plan]').first().click(); });
await test('Delivery: despacho completo hasta entregado', async () => {
  await irA(page, 'delivery'); await ev(() => { PRECIO.modo = 'conductor'; S.dl.dest = { c: off(CB, 0.4, 0.3), n: 'Cliente de prueba' }; render(); });
  await page.click('#dlPedir'); assert(await until(() => DL.at(-1).fase === 'ofertas', 5000), 'sin ofertas de repartidores');
  await page.locator('[data-dloferta]').first().click(); assert(await until(() => DL.at(-1).fase === 'entregado', 90000), 'el pedido no se entregó: ' + await ev(() => DL.at(-1).fase));
  await ev(() => { PRECIO.modo = 'auto'; }); });
await test('Dueños: registrar vehículo, fijar precio y elegir plan', async () => {
  await irA(page, 'duenos'); const n0 = await ev(() => OWNER.vehiculos.length);
  await page.click('summary'); await page.fill('#vpat', 'TEST12'); await page.fill('#vmod', 'Moto prueba 2024'); await page.selectOption('#vtipo', 'moto'); await page.selectOption('#vserv', 'delivery');
  await page.click('#vform button[type=submit]'); assert(await ev(() => OWNER.vehiculos.length) === n0 + 1, 'no se registró');
  assert(await ev(() => FLEET.some(v => v.owned && v.tipo === 'moto' && v.patente === 'TEST12')), 'la moto no entró a la flota');
  await page.fill('#tkm', '700'); await page.click('#tform button[type=submit]'); assert(await ev(() => OWNER.tarifa.km === 700), 'no guardó el precio');
  await page.locator('[data-plan-o=dia]').click(); assert(await ev(() => OWNER.plan === 'dia'), 'no cambió el plan');
  await ev(() => { OWNER.vehiculos = OWNER.vehiculos.filter(v => v.patente !== 'TEST12'); saveOwner(); syncOwnerFleet(); }); });
await test('Filtros por tipo de transporte', async () => {
  await page.click('[data-f=taxi]'); assert(await ev(() => S.filtro.taxi === false), 'no filtró'); await page.click('[data-f=taxi]'); assert(await ev(() => S.filtro.taxi), 'no volvió'); });
await test('Cada pestaña muestra solo sus vehículos', async () => {
  // Sin teselas en las pruebas: se capturan los datos que se enviarían al mapa
  await ev(() => { window.__src = {}; window.__gs = map.getSource; window.__mr = mapReady; mapReady = true;
    map.getSource = id => ({ setData: d => { __src[id] = d; } }); });
  const kinds = () => ev(() => { drawBase(); return [...new Set(__src.vehicles.features.map(f => f.properties.kind))].sort().join(','); });
  await irA(page, 'viaje'); await page.waitForTimeout(300); let k = await kinds();
  assert(!/bus|micro/.test(k), 'en Pedir viaje aparecen buses/micros: ' + k);
  assert(await ev(() => __src.routes.features.every(f => f.properties.op === 0)), 'en Pedir viaje se ven recorridos de buses');
  await irA(page, 'buses'); await page.waitForTimeout(300); k = await kinds();
  assert(!/auto|taxi|moto|micro/.test(k), 'en Buses aparecen autos: ' + k);
  const hayBuses = await ev(() => RV(ALLROUTES).some(r => r.kind === 'bus' && activeTrips(r).length)); // de noche no hay buses programados
  await ev(() => { S.filtro.bus = false; }); k = await kinds(); assert(!hayBuses || k === 'bus', 'con el filtro Buses apagado, la pestaña Buses quedó vacía: ' + k); await ev(() => { S.filtro.bus = true; });
  await irA(page, 'planificar'); await page.waitForTimeout(300); assert(await ev(() => document.querySelectorAll('.fchip').length) === 4, 'Planificar debería mostrar todos los filtros');
  await ev(() => { delete map.getSource; mapReady = __mr; }); await irA(page, 'viaje'); });
await test('Navegación Express: 4 secciones', async () => {
  const ns = await page.locator('#tabs .tab .tl').allInnerTexts();
  assert(ns.join('|') === 'Inicio|Locomoción|Mapa|Más', 'secciones: ' + ns.join('|'));
  await irA(page, 'duenos'); assert(await ev(() => document.querySelector('#tabs [data-nav=mas]').getAttribute('aria-selected') === 'true'), 'Dueños no quedó dentro de Más');
  assert(await page.locator('#view .back').count() === 1, 'falta volver a Más'); });
await test('Inicio Express: pregunta, buscador y 3 acciones', async () => {
  await irA(page, 'inicio'); const txt = await page.locator('#view').innerText();
  assert(txt.includes('¿A dónde vamos?'), 'falta la pregunta'); assert(await page.locator('#view .accion').count() === 3, 'no son 3 acciones');
  await page.fill('#destQ', 'Valparaíso'); await page.press('#destQ', 'Enter'); await wait(200);
  assert(await ev(() => S.tab === 'locomocion' && S.dest === 'valparaiso'), 'el buscador no llevó a Locomoción'); });
await test('Ver locomoción: tarjetas con semáforo, fuente y ejemplo', async () => {
  assert(await page.locator('#view .tarjeta').count() >= 2, 'faltan tarjetas'); const txt = await page.locator('#view').innerText();
  for (const w of ['Ejemplo', 'Sin información', 'Fuente', 'Sin estimación disponible', 'Colectivos']) assert(txt.includes(w), 'falta: ' + w);
  await page.click('[data-lf=colectivos]'); assert(await page.locator('#view [data-loco]').count() === 0, 'el filtro no ocultó buses'); await page.click('[data-lf=todos]');
  await page.locator('#view [data-loco]').first().click(); assert(await ev(() => S.tab === 'buses' && !!S.selRoute), 'la tarjeta no abrió el detalle'); });
await test('Avisar dónde viene: tres acciones y formulario mínimo', async () => {
  await irA(page, 'inicio'); await page.click('#avisarBtn'); assert(await page.locator('[data-avmodo]').count() === 3, 'no hay 3 acciones');
  await page.click('[data-avmodo=vipasar]'); assert(await page.locator('[data-avdest=nose]').count() === 1, 'falta «No sé hacia dónde iba»');
  await page.route(/rpc\/reportar_locomocion/, r => r.fulfill({ status: 200, contentType: 'application/json', body: 'null' }));
  await page.route(/auth\/v1\/signup/, r => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ access_token: 'tok', refresh_token: 'ref', expires_in: 3600, user: { id: 'u3333333-0000-0000-0000-000000000000' } }) }));
  await page.click('[data-avtipo=bus]'); await page.click('[data-avdest=nose]'); await page.click('#avEnviar'); await page.waitForFunction(() => /Gracias|No se pudo/.test(document.getElementById('view').innerText), null, { timeout: 15000 });
  const txt = await page.locator('#view').innerText(); assert(txt.includes('Gracias') && /reporte comunitario/i.test(txt) && /nunca como confirmación oficial/i.test(txt), 'no confirma o no aclara que es un reporte comunitario: ' + txt.slice(0, 300)); await page.click('#avFin'); await page.unroute(/rpc\/reportar_locomocion/); await page.unroute(/auth\/v1\/signup/); });
await test('Modo conductor: colectivo y bus con botones grandes', async () => {
  await irA(page, 'conductor'); assert(await page.locator('#cIniciar').isDisabled(), 'permite iniciar sin sentido');
  await page.click('[data-csent="Hacia Valparaíso"]'); await page.click('#cIniciar'); await page.click('#cMas');
  assert(await ev(() => S.cond.cupos === S.cond.max), 'los cupos pasaron el máximo'); for (let n = 0; n < 6; n++) await page.click('#cMenos');
  assert(await ev(() => S.cond.cupos === 0), 'cupos negativos'); await page.click('#cFinalizar');
  await page.click('[data-ctipo=bus]'); assert((await page.locator('#view').innerText()).includes('Próxima salida'), 'falta próxima salida');
  await page.click('#cIniciar'); await page.click('[data-cret="10"]'); assert((await page.locator('#view').innerText()).includes('retraso 10'), 'no informó retraso'); await page.click('#cFinalizar'); });
await test('Más: cada acceso lleva a su función', async () => {
  for (const t of ['viaje', 'planificar', 'misviajes', 'colectivos', 'delivery', 'duenos', 'conductor', 'favoritos', 'avisos', 'config']) {
    await irA(page, t); assert(await ev(() => S.tab) === t, 'no llegó a ' + t); assert((await page.locator('#view').innerText()).length > 20, t + ' está vacío'); } });
await test('Recorridos de ejemplo: marcados y se pueden ocultar', async () => {
  await irA(page, 'buses'); await ev(() => { S.bq = { o: '', d: '' }; render(); });
  assert((await page.locator('#view').innerText()).includes('de ejemplo'), 'no avisa que son de ejemplo');
  await page.click('#ejToggle'); assert(await page.locator('#view button.route').count() === 0, 'siguen visibles');
  assert((await page.locator('#view').innerText()).includes('Aún no hay recorridos verificados'), 'falta el aviso');
  await page.click('#ejToggle'); assert(await page.locator('#view button.route').count() > 0, 'no volvieron'); });
await test('Mis viajes: pasaje comprado', async () => { await irA(page, 'misviajes'); assert(/TR-/.test(await page.locator('#view').innerText()), 'no aparece el pasaje'); });
await test('Configuración: tema, bajo consumo y ejemplos', async () => { await irA(page, 'config');
  for (const id of ['#cfgTema', '#liteBtn', '#ejToggle']) assert(await page.locator(id).count() === 1, 'falta ' + id); });
await test('Bajo consumo: funciona sin mapa ni librería de mapas', async () => {
  const l = await nuevaPag({ viewport: { width: 390, height: 844 } }); const reqs = []; l.on('request', r => reqs.push(r.url())); l.on('pageerror', e => errors.push('lite: ' + e.message));
  await l.goto(BASE + '?lite=1'); await l.waitForTimeout(800);
  assert(await l.evaluate(() => document.documentElement.classList.contains('lite') && getComputedStyle(document.querySelector('.mapwrap')).display === 'none'), 'el mapa sigue visible');
  assert(!reqs.some(u => /maplibre|openfreemap|tile/i.test(u)), 'cargó el mapa: ' + reqs.filter(u => /maplibre|tile/.test(u)).join(' '));
  assert((await l.locator('#view').innerText()).includes('¿A dónde vamos?'), 'Inicio no funciona sin mapa');
  await l.goto(BASE + '?lite=0'); await l.waitForTimeout(300); assert(await l.evaluate(() => !document.documentElement.classList.contains('lite')), 'no volvió al modo normal'); await l.close(); });
await test('Mapa: solo vistas Calles y Satélite', async () => {
  const v = await page.locator('#styleBar [data-style]').allInnerTexts(); assert(v.join('|') === 'Calles|Satélite', 'vistas: ' + v.join('|'));
  assert(await page.locator('#styleBar [data-3d]').count() === 0, 'sigue la vista 3D'); });
await test('Conductores: acceso único y registro en 3 pasos con borrador', async () => {
  await ev(() => { localStorage.removeItem('vamo-registro'); REG = null; });
  await irA(page, 'soy'); assert(await page.locator('[data-rtipo]').count() === 5, 'no están los 5 tipos');
  assert(await page.locator('#view .lista [data-tab=mas]').count() === 0 && await page.locator('#tabs [data-tab=mas]').count() === 1, 'navegación');
  await page.click('[data-rtipo=colectivo]'); assert(await page.locator('#regSig').isDisabled(), 'deja seguir sin patente');
  assert(await page.locator('.docrow').count() === (await ev(() => FLOTA.on) ? 6 : 5), 'documentos de colectivo');
  await page.fill('[data-rf=patente]', 'TEST45'); await page.fill('[data-rf=marca]', 'Toyota Prueba'); await page.click('#capMenos');
  assert(await ev(() => JSON.parse(localStorage.getItem('vamo-registro')).patente === 'TEST45'), 'no guardó el borrador');
  await page.click('#regSig'); assert(/Santa Isabel/.test(await page.locator('#view').innerText()), 'paso 2 sin puntos de salida');
  assert(/TEST45/.test(await page.locator('.resumen').innerText()), 'paso 2 vuelve a pedir datos');
  await page.click('#regSalir'); await irA(page, 'soy'); assert(await page.locator('#regSeguir').count() === 1, 'no ofrece continuar el borrador');
  await page.click('#regSeguir'); assert(await ev(() => REG.paso === 2), 'no continuó en el paso 2');
  await page.click('#regSig'); await page.click('[data-rdia="5"]'); await page.click('#regGps'); await page.click('#regSig');
  assert(await ev(() => S.tab === 'panelcond' && !REG && OWNER.vehiculos.some(v => v.patente === 'TEST45' && v.tipoV === 'colectivo' && v.cap === 3 && v.verif === 'en_revision' && v.dias[5] === 1)), 'no terminó el registro'); });
await test('Conductores: colectivo sin verificar no puede ofrecer servicio', async () => {
  assert(await page.locator('#pIniciar').isDisabled(), 'permite iniciar sin verificar');
  assert(await ev(() => !FLEET.some(f => f.owned && f.patente === 'TEST45')), 'aparece a pasajeros sin verificar');
  await page.click('#pDemo'); assert(/demostración/.test(await page.locator('.estado-pill').innerText()), 'la demo no se marca');
  await page.click('#pMas'); assert(await ev(() => SES[S.panelVid].cupos === 3), 'cupos pasaron la capacidad');
  await page.click('#pCompleto'); assert(await ev(() => SES[S.panelVid].cupos === 0 && SES[S.panelVid].completo), 'no quedó completo');
  await page.click('#pSalida'); await page.click('#pFin'); assert(await ev(() => !SES[S.panelVid].activo), 'no finalizó'); });
await test('Conductores: bus y auto muestran solo sus campos', async () => {
  await irA(page, 'soy'); await page.click('[data-rtipo=bus]'); assert(await ev(() => REG.cap === 44), 'capacidad de bus');
  await page.fill('[data-rf=patente]', 'BUSX12'); await page.fill('[data-rf=marca]', 'Bus prueba'); await page.click('#regSig');
  assert(await page.locator('select[data-rf=recorrido]').count() === 1 && !/Santa Isabel/.test(await page.locator('#view').innerText()), 'campos de bus');
  await page.click('#regSalir'); await ev(() => { REG = null; saveReg(); });
  await irA(page, 'soy'); await page.click('[data-rtipo=auto]'); await page.fill('[data-rf=patente]', 'AUTO12'); await page.fill('[data-rf=marca]', 'Auto prueba');
  await page.click('#regSig'); assert(await page.locator('[data-rcat]').count() === 3, 'faltan categorías'); await page.click('#regSig'); await page.click('#regSig');
  assert(await page.locator('#pIniciar').isEnabled(), 'auto particular no puede iniciar'); await page.click('#pIniciar');
  assert(/JORNADA/.test(await page.locator('#pFin').innerText()), 'no está en jornada'); await page.click('#pFin');
  await page.click('#view .back'); await page.click('[data-tab=misvehiculos]'); assert(await page.locator('[data-pveh]').count() >= 5, 'mis vehículos incompleto');
  await ev(() => { OWNER.vehiculos = OWNER.vehiculos.filter(v => !['TEST45', 'AUTO12'].includes(v.patente)); saveOwner(); syncOwnerFleet(); }); });
await test('Tema claro / oscuro', async () => {
  await page.click('#tema'); assert(await ev(() => document.documentElement.dataset.theme === 'dark'), 'no pasó a oscuro'); await page.click('#tema');
  assert(await ev(() => !document.documentElement.dataset.theme), 'no volvió a claro'); });
await test('Kit visual: componentes reutilizables SVG', async () => {
  assert(await ev(() => ['boton', 'tarjetaVehiculo', 'semaforo', 'buscador', 'selector', 'pin', 'vacio', 'error', 'fuente'].every(k => typeof VamoUI[k] === 'function')), 'faltan componentes');
  assert(await ev(() => /<svg/.test(VamoUI.tarjetaVehiculo({ tipo: 'colectivo', titulo: 'x' })) && /<svg/.test(VamoUI.pin('colectivo'))), 'componentes sin SVG'); });
await test('Inicio: servicios separados (buses, colectivos, taxis, autos)', async () => {
  await irA(page, 'inicio'); assert((await page.locator('#view .serv').allInnerTexts()).join('|') === 'Buses|Colectivos|Taxis|Autos', 'no están los 4 servicios');
  await ev(() => { window.__src = {}; window.__mr = mapReady; mapReady = true; map.getSource = id => ({ setData: d => { __src[id] = d; } }); });
  const kinds = () => ev(() => { drawBase(); return [...new Set(__src.vehicles.features.map(f => f.properties.kind))].sort().join(','); });
  for (const [sv, esperado] of [['taxi', /^taxi$/], ['auto', /^auto$/], ['bus', /^(bus)?$/], ['colectivo', /^$/]]) {
    await page.click(`[data-serv=${sv}]`); const k = await kinds(); assert(esperado.test(k), `con ${sv} el mapa muestra: ${k}`); }
  await page.click('[data-serv=taxi]'); await page.click('#pedirViaje'); assert(await ev(() => S.tab === 'viaje' && S.clase === 'taxi'), 'Taxis no abre el viaje en taxi');
  await ev(() => { delete map.getSource; mapReady = __mr; }); await irA(page, 'inicio'); await page.click('[data-serv=bus]'); });
await test('Inicio: invertir origen y destino', async () => {
  await ev(() => { setDest('valparaiso'); render(); }); await page.click('#swapLoc'); assert(await ev(() => S.loc === 'valparaiso' && S.dest === 'casablanca'), 'no invirtió');
  await page.click('#swapLoc'); assert(await ev(() => S.loc === 'casablanca' && S.dest === 'valparaiso'), 'no volvió'); });
await test('Conductor: indicador de ubicación honesto', async () => {
  await irA(page, 'conductor'); await ev(() => { S.cond = null; render(); }); assert(await ev(() => document.getElementById('ubicInd').dataset.u === 'off'), 'indicador no parte apagado');
  await page.click('[data-csent="Hacia Valparaíso"]'); await page.click('#cIniciar'); assert(await ev(() => document.getElementById('ubicInd').dataset.u === 'pendiente' && /aún no se comparte/.test(document.getElementById('ubicInd').innerText)), 'el indicador no avisa que aún no comparte');
  await page.click('#cFinalizar'); });
await test('Planificador: invertir A y B', async () => {
  await irA(page, 'planificar'); const [o, d] = await ev(() => [S.plan.o, S.plan.d]); await page.click('#planSwap'); assert(await ev(() => S.plan.o) === d && await ev(() => S.plan.d) === o, 'no invirtió'); await page.click('#planSwap'); });
await test('Locomoción: tarjetas distinguen el origen del dato', async () => {
  await irA(page, 'locomocion'); await ev(() => { setDest('valparaiso'); S.lf = 'todos'; render(); }); assert(await page.locator('#view .tarjeta .fuente').count() >= 2, 'faltan etiquetas de fuente'); });
await test('Solo Casablanca: sin selector de localidad, viajes desde o hacia Casablanca', async () => {
  assert(await page.locator('#loc').isHidden() && /Casablanca/.test(await page.locator('#zonaFija').innerText()), 'sigue el selector de localidad');
  await ev(() => { S.loc = 'valparaiso'; locEl.value = 'valparaiso'; setDest('santiago'); });
  assert(await ev(() => S.loc === 'casablanca' && S.dest === 'santiago'), 'permitió un viaje sin Casablanca');
  await ev(() => { locEl.value = 'casablanca'; locEl.onchange(); }); });
await test('Celular: barra inferior y sin desborde horizontal', async () => {
  const m = await nuevaPag({ viewport: { width: 390, height: 844 } }); await m.goto(BASE); await m.waitForTimeout(800);
  assert(await m.evaluate(() => document.documentElement.scrollWidth) <= 390, 'hay desborde horizontal');
  assert(await m.evaluate(() => getComputedStyle(document.getElementById('tabs')).position === 'fixed'), 'la barra inferior no está fija'); assert(await m.evaluate(() => getComputedStyle(document.querySelector('.mapwrap')).display !== 'none'), 'el mapa no se ve en Inicio');
  await m.click('#tabs [data-tab=locomocion]'); assert(await m.evaluate(() => getComputedStyle(document.querySelector('.mapwrap')).display !== 'none'), 'el mapa no se ve en Locomoción');
  await m.click('#tabs [data-tab=mapa]'); assert(await m.evaluate(() => getComputedStyle(document.querySelector('.mapwrap')).display !== 'none'), 'el mapa no aparece en Mapa');
  await m.close(); });
// ---- Recorridos desde la base de datos (respuestas simuladas con tests/fixtures/bd.json) ----
const FIX = JSON.parse(await readFile(join(dirname(fileURLToPath(import.meta.url)), 'fixtures', 'bd.json'), 'utf8'));
const bd = await nuevaPag({ viewport: { width: 1300, height: 860 } }); bd.on('pageerror', e => errors.push('bd: ' + e.message));
await bd.route(/\/rest\/v1\//, r => { const t = new URL(r.request().url()).pathname.split('/').pop(); r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(FIX[t] || []) }); });
await bd.goto(BASE); await bd.waitForTimeout(1500);
const bev = f => bd.evaluate(f);
await test('Base de datos: carga recorridos y paraderos desde Supabase', async () => {
  assert(await bev(() => RUTAS_FUENTE === 'bd'), 'no usó la base'); assert(await bev(() => ALLROUTES.length === 3), 'cantidad de recorridos distinta: ' + await bev(() => ALLROUTES.length));
  assert(/3 recorridos/.test(await bd.locator('#dbState').innerText()), 'el estado no indica los recorridos'); });
await test('Rótulos de horario: programado, estimado y sin horario confirmado', async () => {
  await irA(bd, 'buses'); const txt = await bd.locator('#view').innerText();
  for (const w of ['Programado', 'Estimado', 'Sin horario confirmado', 'Sin estimación disponible']) assert(txt.includes(w), 'falta: ' + w); });
await test('Recorrido sin horario: no inventa buses ni salidas', async () => {
  assert(await bev(() => activeTrips(ALLROUTES.find(r => r.id === 'C1')).length === 0 && departures(ALLROUTES.find(r => r.id === 'C1')).length === 0), 'generó posiciones');
  await bd.click('[data-route=C1]'); assert(await bd.locator('[data-dep]').count() === 0, 'mostró salidas'); assert(await bd.locator('#comprar').count() === 0, 'permitió comprar'); });
await test('Recorrido programado: buses según horario y compra de pasaje', async () => {
  await bd.click('[data-route=I1]'); assert(await bev(() => activeTrips(ALLROUTES.find(r => r.id === 'I1')).length > 0), 'sin buses programados');
  await bd.locator('[data-dep]').first().click(); await bd.click('#comprar'); assert(await bev(() => !!S.ticket), 'no compró'); });
await test('Búsqueda por origen y destino', async () => {
  await bd.selectOption('#bqO', 'cb-term'); await bd.selectOption('#bqD', 'va-term'); await bd.waitForTimeout(200);
  const ids = await bd.locator('button.route').evaluateAll(b => b.map(x => x.dataset.route).sort()); assert(ids.join() === 'C2,I1', 'resultado: ' + ids.join());
  await bd.click('#bqSwap'); assert(await bev(() => S.bq.o === 'va-term'), 'no invirtió'); });
await test('Paraderos favoritos y recorridos frecuentes', async () => {
  await bd.selectOption('#bqO', 'cb-term'); await bd.click('[data-favp=cb-term]'); assert(await bev(() => FAV.paraderos.includes('cb-term')), 'no guardó favorito');
  assert(await bd.locator('[data-bqo=cb-term]').count() === 1, 'no muestra el favorito'); assert(await bev(() => frecuentes().includes('I1')), 'no registró frecuente'); });
await test('Micros de la base no se muestran', async () => { assert(await bev(() => !ALLROUTES.some(r => r.id === 'L1')), 'aparece L1'); });
await bd.close();

// ---- Conductores conectados a VAMO (Supabase simulado en memoria) ----
const fl = await nuevaPag({ viewport: { width: 390, height: 844 } }); fl.on('pageerror', e => errors.push('flota: ' + e.message));
const LLAMADAS = []; const VEH = { id: 'aaaaaaaa-1111-2222-3333-444444444444', tipo: 'auto', patente: 'ABCD12', marca_modelo: 'Toyota Yaris', capacidad: 4, estado_verificacion: 'borrador', en_pausa: false, recorrido_id: null, zona: 'Casablanca urbano', categoria: 'eco' };
let sesionActiva = null;
await fl.route(/supabase\.co\/(auth|rest|storage)\//, r => { const u = new URL(r.request().url()), m = r.request().method(), path = u.pathname, perfil = r.request().headers()['accept-profile'];
  let body = r.request().postData(); try { body = body ? JSON.parse(body) : null; } catch (e) {}
  LLAMADAS.push({ m, path: path.replace(/^\/(rest|auth)\/v1\//, ''), q: u.search, body });
  const ok = d => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(d) });
  if (path.endsWith('/auth/v1/signup')) return ok({ access_token: 'tok', refresh_token: 'ref', expires_in: 3600, user: { id: 'u1111111-0000-0000-0000-000000000000' } });
  if (perfil !== 'flota') return ok([]);
  const t = path.split('/').pop();
  if (t === 'propietario') return ok(m === 'POST' ? [{ id: 'p1' }] : []);
  if (t === 'vehiculo') return ok(m === 'GET' ? (u.search.includes('propietario') && LLAMADAS.some(l => l.path === 'vehiculo' && l.m === 'POST') ? [VEH] : []) : [VEH]);
  if (t === 'sesion_servicio') return ok(sesionActiva ? [sesionActiva] : []);
  if (t === 'iniciar_servicio') { sesionActiva = { id: 'sid-1', vehiculo_id: VEH.id, cupos: null, completo: false, sentido: null, consentimiento_gps_en: body.acepta_gps ? 'x' : null }; return ok('sid-1'); }
  if (t === 'finalizar_servicio') { sesionActiva = null; return ok(null); }
  if (t === 'enviar_a_revision') return ok(['soap']);
  if (t === 'es_admin') return ok(false);
  if (t === 'avisos_servicio') return ok([{ tipo: 'colectivo', patente: 'QWER12', recorrido_id: null, aviso_pausa: 'Sin servicio por mantención' }]);
  if (t === 'en_servicio') return ok([{ sesion_id: 's9', vehiculo_id: 'v9', tipo: 'colectivo', patente: 'XYZW12', capacidad: 4, sentido: 'Hacia Valparaíso', cupos: 2, completo: false, inicio: new Date().toISOString(), salida_informada: null, retraso_min: 0, lat: null }]);
  return ok([]); });
await fl.goto(BASE); await fl.waitForTimeout(1000);
const fev = f => fl.evaluate(f);
await test('Conectado: el registro guarda el vehículo en VAMO con identidad anónima', async () => {
  assert(await fev(() => FLOTA.on), 'FLOTA no está activo en el sitio local');
  await fev(() => { OWNER.vehiculos = []; REG = { ...nuevoReg('auto'), patente: 'abcd12', marca: 'Toyota Yaris', paso: 3 }; terminarRegistro(); });
  await fl.waitForFunction(() => OWNER.vehiculos[0] && OWNER.vehiculos[0].rid, null, { timeout: 5000 });
  const post = LLAMADAS.find(l => l.path === 'vehiculo' && l.m === 'POST'); assert(post && post.body.patente === 'ABCD12' && post.body.propietario_id === 'p1', 'no envió el vehículo: ' + JSON.stringify(post && post.body));
  assert(LLAMADAS.some(l => l.path === 'signup'), 'no creó la identidad anónima');
  assert(await fl.locator('#view [data-tab=documentos]').count() === 1, 'falta el botón Documentos'); });
await test('Conectado: iniciar servicio pide permiso de ubicación y usa el servidor', async () => {
  assert(await fl.locator('#pGpsQ').getAttribute('aria-checked') === 'false', 'la ubicación viene activada sin permiso');
  await fl.click('#pIniciar'); await fl.waitForFunction(() => SES[S.panelVid] && SES[S.panelVid].rsid === 'sid-1', null, { timeout: 5000 });
  const ini = LLAMADAS.find(l => l.path === 'rpc/iniciar_servicio'); assert(ini && ini.body.acepta_gps === false && ini.body.v === 'aaaaaaaa-1111-2222-3333-444444444444', 'parámetros: ' + JSON.stringify(ini && ini.body));
  assert(/No estás compartiendo tu ubicación/.test(await fl.locator('#panelGps').innerText()), 'el indicador no es honesto');
  await fl.click('#pFin'); await fl.waitForTimeout(300); assert(LLAMADAS.some(l => l.path === 'rpc/finalizar_servicio' && l.body.s === 'sid-1'), 'no finalizó en el servidor'); });
await test('Conectado: documentos requeridos y envío a revisión', async () => {
  await fl.click('#view [data-tab=documentos]'); await fl.waitForSelector('#docEnviar');
  assert(await fl.locator('#view input[data-doc]').count() === 4, 'documentos de auto distintos de 4');
  assert(await fl.locator('#docEnviar').isDisabled(), 'permite enviar sin documentos'); });
await test('Conectado: colectivos informados por conductores, sin inventar', async () => {
  await fl.evaluate(() => ir('colectivos')); await fl.waitForTimeout(500);
  const txt = await fl.locator('#view').innerText(); assert(/2 de 4 cupos/.test(txt) && /Informado por el conductor/.test(txt), 'no muestra el colectivo en servicio');
  assert(/Sin servicio por mantención/.test(txt), 'no muestra el aviso de servicio suspendido'); });
await test('Conectado: código de invitación y administrar', async () => {
  await fl.evaluate(() => ir('soy')); assert(await fl.locator('#invCod').count() === 1, 'falta el campo de código');
  await fl.evaluate(() => ir('gestion')); await fl.waitForSelector('#gInvitar'); assert(await fl.locator('#gPausa').count() === 1, 'falta suspender servicio'); });
await fl.close();

// ---- Acceso rápido: Soy pasajero / Soy conductor (teléfono nuevo, sin perfil guardado) ----
const pc = await browser.newContext({ viewport: { width: 390, height: 844 } }); const pf = await pc.newPage(); pf.on('pageerror', e => errors.push('perfil: ' + e.message));
await pf.goto(BASE); await pf.waitForTimeout(800);
const pev = f => pf.evaluate(f), navTxt = () => pf.locator('#tabs .tab .tl').allInnerTexts().then(x => x.join('|'));
await test('Bienvenida: solo la primera vez, con las dos opciones', async () => {
  assert(await pf.locator('#bienv').isVisible(), 'no aparece la bienvenida'); assert(await pf.locator('#bienv [data-elegir-perfil]').count() === 2, 'no son 2 perfiles');
  assert(await pf.locator('#bienv .vamo-v').count() >= 1, 'falta el logo'); });
await test('Soy conductor: sin vehículo abre el registro y barra de conductor', async () => {
  await pf.click('[data-elegir-perfil=conductor]'); assert(await pf.locator('#bienv').count() === 0, 'la bienvenida no se cerró');
  assert(await pev(() => S.tab === 'soy') && await pf.locator('[data-rtipo]').count() === 5, 'no abrió el registro con 5 tipos');
  assert(await navTxt() === 'Mi jornada|Vehículos|Administrar|Más', 'barra: ' + await navTxt());
  await pev(() => { REG = { ...nuevoReg('colectivo'), patente: 'PERF12', marca: 'Prueba', tarifa: '2000', paso: 3 }; terminarRegistro(); });
  const txt = await pf.locator('#view').innerText();
  for (const w of ['Tarifa', 'Capacidad', 'INICIAR SERVICIO', 'Configurar mi vehículo']) assert(txt.includes(w), 'panel sin: ' + w); });
await test('Perfil recordado: al volver abre directo el panel, sin bienvenida', async () => {
  await pf.reload(); await pf.waitForTimeout(800); assert(await pf.locator('#bienv').count() === 0, 'volvió a pedir el perfil');
  assert(await pev(() => S.tab === 'panelcond'), 'no abrió el panel: ' + await pev(() => S.tab)); });
await test('Cambiar de perfil desde Más, sin perder vehículos', async () => {
  await pf.click('#tabs [data-tab=mas]'); await pf.click('[data-cambiar-perfil]'); await pf.click('[data-elegir-perfil=pasajero]');
  assert(await pev(() => S.tab === 'inicio') && await navTxt() === 'Inicio|Locomoción|Mapa|Más', 'no volvió a pasajero');
  assert(await pf.locator('#view .accion').count() === 3 && await pf.locator('#destQ').count() === 1, 'Inicio de pasajero cambió');
  assert(await pev(() => OWNER.vehiculos.some(v => v.patente === 'PERF12') && localStorage.getItem('vamo-perfil') === 'pasajero'), 'perdió el vehículo o el perfil'); });
await pc.close();

// ---- Avisos de locomoción: horarios reales + vehículos en vivo (Supabase simulado; hora fija 14:40 de un viernes en Chile) ----
const ALTF = JSON.parse(await readFile(join(dirname(fileURLToPath(import.meta.url)), 'fixtures', 'alternativas.json'), 'utf8'));
const avc = await browser.newContext({ viewport: { width: 390, height: 844 }, timezoneId: 'America/Santiago', permissions: ['notifications'] }); await avc.addInitScript(PASAJERO);
await avc.addInitScript(() => { try { Object.defineProperty(Notification, 'permission', { get: () => 'default' }); } catch (e) {} try { const f = Notification.requestPermission; Notification.requestPermission = (...a) => { window.__permisosPedidos = (window.__permisosPedidos || 0) + 1; return f.apply(Notification, a); }; } catch (e) {} });
const av = await avc.newPage(); av.on('pageerror', e => errors.push('avisos: ' + e.message));
await av.clock.setFixedTime(new Date('2026-11-20T17:40:00Z'));
const RPCS = [], ESCRITURAS = []; const ahoraISO = () => new Date('2026-11-20T17:39:00Z').toISOString();
await av.route(/supabase\.co\/(auth|rest|storage)\//, r => { const u = new URL(r.request().url()), path = u.pathname, perfil = r.request().headers()['accept-profile'];
  let body = r.request().postData(); try { body = body ? JSON.parse(body) : null; } catch (e) {}
  const ok = d => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(d) }); const t = path.split('/').pop();
  if (path.includes('/rpc/')) RPCS.push({ fn: t, body });
  if (path.endsWith('/auth/v1/signup')) return ok({ access_token: 'tok', refresh_token: 'ref', expires_in: 3600, user: { id: 'u2222222-0000-0000-0000-000000000000' } });
  if (t === 'alternativas') return ok(ALTF[`${body.p_origen}|${body.p_destino}`] || { tipo_dia: 'lv', alternativas: [] });
  if (t === 'reportes_recientes' || t === 'evento_servicio') return ok([]);
  if (t === 'reportar_locomocion') return ok(null);
  if (t === 'es_admin') return ok(true);
  if (perfil === 'public' || r.request().headers()['content-profile'] === 'public') { const m = r.request().method();
    if (m !== 'GET') { ESCRITURAS.push({ m, t, body }); return ok(null); }
    if (t === 'recorrido') return ok([{ id: 'MS1', nombre: 'Mira-Sur · Casablanca – Valparaíso', activo: true }]);
    if (t === 'operador') return ok([{ id: 'o1', slug: 'mira-sur', nombre_comercial: 'Mira-Sur', razon_social: 'Transportes Mira-Sur', alias: ['MiraSur'], categoria: 'empresa', estado_info: 'publicado_sin_verificar', publico: true }]);
    if (t === 'salida') return ok([{ id: 1, recorrido_id: 'MS1', sentido: 'ida', tipo_dia: 'lv', hora: '14:50:00', estado_info: 'publicado_sin_verificar' }]); }
  if (perfil === 'flota' && t === 'en_servicio') return ok([
    { sesion_id: 'b1', vehiculo_id: 'vb1', tipo: 'bus', patente: 'BUSS11', capacidad: 40, recorrido_id: 'MS1', sentido: 'Hacia Valparaíso', cupos: null, completo: false, estado: 'en_recorrido', estado_en: ahoraISO(), inicio: ahoraISO(), lat: null, lng: null },
    { sesion_id: 'c1', vehiculo_id: 'vc1', tipo: 'colectivo', patente: 'COLE22', capacidad: 4, sentido: 'Hacia Valparaíso', cupos: 3, cupos_en: ahoraISO(), completo: false, estado: 'en_punto_salida', estado_en: ahoraISO(), inicio: ahoraISO(), lat: null, lng: null }]);
  return ok([]); });
await av.goto(BASE); await av.waitForTimeout(1500);
const aev = f => av.evaluate(f);
const avUntil = async (f, ms = 8000) => { const t = Date.now(); while (Date.now() - t < ms) { if (await aev(f)) return true; await av.waitForTimeout(250); } return false; };
await test('Inicio: destinos rápidos y estado inmediato sobre el mapa', async () => {
  assert(await av.locator('#view [data-irdest=valparaiso]').count() === 1, 'falta «Voy a Valparaíso»');
  await av.click('#view [data-irdest=valparaiso]'); assert(await aev(() => S.tab === 'inicio'), 'salió de Inicio');
  assert(await avUntil(() => { const e = document.getElementById('estadoMapa'); return e && !e.hidden && /Mira-Sur hacia Valparaíso: en recorrido/.test(e.innerText); }), 'el estado no muestra el bus en recorrido: ' + await aev(() => (document.getElementById('estadoMapa') || {}).innerText));
  const t = await av.locator('#estadoMapa').innerText(); assert(/Colectivo hacia Valparaíso disponible en su punto de salida/.test(t), 'no muestra el colectivo en su punto: ' + t);
  assert(await av.locator('#estadoMapa #avisame').count() === 1, 'falta «Avísame cuando venga»'); });
await test('Locomoción: alternativas reales con mapa, próximas salidas y horarios por confirmar', async () => {
  await av.click('#emAbrir'); assert(await aev(() => S.tab === 'locomocion'), 'no abrió Locomoción');
  assert(await aev(() => getComputedStyle(document.querySelector('.mapwrap')).display !== 'none'), 'el mapa no se ve');
  const txt = await av.locator('#view').innerText();
  assert(/Próximas salidas/i.test(txt) && /Mira-Sur/.test(txt) && /14:50/.test(txt), 'no muestra la próxima salida de Mira-Sur: ' + txt.slice(0, 300).replace(/\n/g, ' / '));
  assert(/Horarios por confirmar/i.test(txt) && /FlixBus/.test(txt), 'FlixBus no aparece como por confirmar');
  assert(/Suspendid/.test(await av.locator('#view').textContent()), 'no marca la salida suspendida'); });
await test('Avísame: alerta en la app sin pedir permisos y sin repetir avisos', async () => {
  await av.click('#view #avisame'); assert(await aev(() => !!AVISOS.alerta() && AVISOS.alerta().destino === 'valparaiso'), 'no creó la alerta');
  assert(await avUntil(() => { const t = document.getElementById('avisoToast'); return t && !t.hidden && /Próximo Mira-Sur programado a las 14:50/.test(t.innerText); }), 'no avisó la próxima salida: ' + await aev(() => (document.getElementById('avisoToast') || {}).innerText));
  const n = await aev(() => (ALT.historial || []).length); await aev(() => tickAvisos()); await av.waitForTimeout(400);
  assert(await aev(() => (ALT.historial || []).length) === n, 'repitió avisos');
  assert(await aev(() => window.__permisosPedidos || 0) === 0, 'pidió permiso de notificaciones');
  assert(await av.locator('#alPush').count() === 1 && /solo al tocar este botón/.test(await av.locator('#view').innerText()), 'falta la opción de avisos con VAMO cerrado'); });
await test('Brander de regreso: sin horarios inventados', async () => {
  await aev(() => { S.loc = 'casablanca'; setDest('quilpue'); S.destElegido = true; consultarAlt(); render(); });
  assert(await avUntil(() => /pendiente/i.test(document.getElementById('view').innerText) && /Brander/.test(document.getElementById('view').innerText)), 'no muestra Brander pendiente');
  assert(!/Próximo Brander/.test(await av.locator('#view').innerText()), 'inventó una salida de Brander'); });
await test('Avisar «Estoy esperando» guarda un reporte comunitario', async () => {
  await aev(() => ir('avisar')); assert(await av.locator('[data-avmodo=espero]').count() === 1, 'falta «Estoy esperando»');
  await av.click('[data-avmodo=espero]'); await av.click('[data-avtipo=bus]'); await av.click('[data-avdest=valparaiso]'); const enviar = av.locator('#avEnviar'); assert(await enviar.count() === 1, 'falta enviar'); await enviar.click();
  assert(await avUntil(() => true, 300) && await (async () => { for (let i = 0; i < 20 && !RPCS.some(x => x.fn === 'reportar_locomocion'); i++) await av.waitForTimeout(250); return RPCS.some(x => x.fn === 'reportar_locomocion' && x.body.p_tipo === 'esperando'); })(), 'no envió el reporte: ' + JSON.stringify(RPCS.map(x => x.fn))); });
await test('Equipo VAMO: cargar salidas y operadores sin duplicar empresas', async () => {
  await aev(() => { FL.admin = null; ir('adminhor'); }); await av.waitForSelector('#ahRec', { timeout: 8000 });
  assert(/14:50/.test(await av.locator('#view').innerText()), 'no lista las salidas cargadas');
  await av.fill('#ahHora', '15:20'); await av.click('#ahSalAdd'); await av.waitForTimeout(400);
  const w = ESCRITURAS.find(x => x.t === 'salida' && x.m === 'POST'); assert(w && w.body.hora === '15:20' && w.body.sentido === 'ida' && w.body.tipo_dia === 'lv' && w.body.recorrido_id === 'MS1', 'no guardó la salida: ' + JSON.stringify(w));
  await av.fill('#ahHora', '14:50'); await av.click('#ahSalAdd'); assert(/ya existe/.test(await av.locator('#view').innerText()), 'permitió duplicar la salida');
  await av.click('[data-ahsec=operadores]'); await av.fill('#ahOpN', 'Mirasur'); await av.click('#ahOpAdd');
  assert(/operador parecido/.test(await av.locator('#view').innerText()) && !ESCRITURAS.some(x => x.t === 'operador'), 'no avisó del nombre parecido');
  await av.fill('#ahOpN', 'Mirasur'); await av.click('#ahOpAdd'); await av.waitForTimeout(400);
  const o = ESCRITURAS.find(x => x.t === 'operador'); assert(o && o.body.publico === false, 'no agregó el operador oculto tras confirmar'); });
await avc.close();

// ---- Mi rendimiento y plan VAMO Conductor (Supabase simulado) ----
const rpc2 = await browser.newContext({ viewport: { width: 390, height: 844 }, timezoneId: 'America/Santiago' }); await rpc2.addInitScript(() => { try { localStorage.setItem('vamo-perfil', 'conductor'); } catch (e) {} });
const rp = await rpc2.newPage(); rp.on('pageerror', e => errors.push('rendimiento: ' + e.message)); await rp.clock.setFixedTime(new Date('2026-11-20T15:00:00Z'));
const RW = []; let PLAN = { estado: 'sin_plan' };
const T0 = '2026-11-20T11:00:00Z', T1 = '2026-11-20T12:30:00Z', T2 = '2026-11-20T13:40:00Z';
await rp.route(/supabase\.co\/(auth|rest|storage)\//, r => { const u = new URL(r.request().url()), m = r.request().method(), t = u.pathname.split('/').pop();
  let body = r.request().postData(); try { body = body ? JSON.parse(body) : null; } catch (e) {}
  const ok = d => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(d) });
  if (u.pathname.endsWith('/auth/v1/signup')) return ok({ access_token: 'tok', refresh_token: 'ref', expires_in: 3600, user: { id: 'u4444444-0000-0000-0000-000000000000' } });
  if (m !== 'GET' && !u.pathname.includes('/rpc/')) { RW.push({ m, t, body }); return ok(null); }
  if (t === 'estado_plan') return ok(PLAN);
  if (t === 'iniciar_prueba') { RW.push({ m, t }); PLAN = { estado: 'prueba', prueba_hasta: '2027-01-20' }; return ok(PLAN); }
  if (t === 'es_admin') return ok(false);
  if (t === 'tramo') return ok([
    { id: 1, tipo: 'vuelta', recorrido_id: 'MS1', sentido: 'Hacia Valparaíso', variante: '', inicio: T0, fin: T1, km_gps: 41.2, puntos_ok: 200, puntos_descartados: 2, brechas: 0, estado: 'cerrado' },
    { id: 2, tipo: 'vuelta', recorrido_id: 'MS1', sentido: 'Hacia Valparaíso', variante: '', inicio: T1, fin: T2, km_gps: 47.9, puntos_ok: 190, puntos_descartados: 0, brechas: 0, estado: 'cerrado' },
    { id: 3, tipo: 'vuelta', recorrido_id: 'MS1', sentido: 'Hacia Valparaíso', variante: '', inicio: T2, fin: null, km_gps: 3.1, puntos_ok: 3, puntos_descartados: 0, brechas: 0, estado: 'cerrado' }]);
  if (t === 'sesion_servicio') return ok(u.search.includes('km_gps') ? [{ id: 's1', inicio: T0, fin: T2, km_gps: 92.2, puntos_ok: 393, puntos_descartados: 2, brechas: 0 }] : []);
  if (t === 'distancia_referencia') return ok([{ id: 1, recorrido_id: 'MS1', sentido: 'Hacia Valparaíso', variante: '', km: 42, tolerancia_pct: 5, vigente_desde: '2026-11-01', propietario_id: null }]);
  if (t === 'gasto') return ok([{ id: 1, fecha: '2026-11-18', tipo: 'combustible', monto: 40000, litros: 30, estanque_lleno: true, odometro: 100000 }, { id: 2, fecha: '2026-11-20', tipo: 'combustible', monto: 30000, litros: 25, estanque_lleno: true, odometro: 100300 }]);
  if (t === 'ingreso') return ok([{ id: 1, fecha: '2026-11-20', origen: 'vueltas', monto: 60000 }]);
  return ok([]); });
await rp.goto(BASE); await rp.waitForTimeout(1000);
await rp.evaluate(() => { OWNER.vehiculos.push({ id: 'vr1', rid: 'aaaaaaaa-9999-2222-3333-444444444444', tipoV: 'colectivo', tipo: 'auto', patente: 'COLE22', rol: 'dueno', recorrido: 'MS1', cap: 4, verif: 'verificado' }); S.panelVid = 'vr1'; ir('rendimiento'); });
await test('Mi rendimiento: km por vuelta contra la referencia, sin inventar', async () => {
  await rp.waitForSelector('svg.graf', { timeout: 8000 }); const txt = await rp.locator('#view').textContent();
  assert(/Referencia 42 km ±5%/.test(txt), 'falta la línea de referencia');
  assert(/Normal/.test(txt) && /Revisar \(\+14/.test(txt) && /Datos insuficientes/.test(txt), 'estados de vuelta incorrectos');
  assert(/12 km\/L/.test(txt), 'no calculó km/L entre estanques llenos: ' + (txt.match(/[\d,]+ km\/L/) || [''])[0]);
  assert(/Resultado operativo parcial: \$-10\.000|Resultado operativo parcial: -\$10\.000|\$−10\.000/.test(txt) || /Resultado operativo parcial/.test(txt), 'falta resultado operativo');
  assert(await rp.locator('#rCsv').isDisabled(), 'informes disponibles sin plan'); });
await test('Mi rendimiento: registrar gasto y probar el plan gratis sin cobro', async () => {
  await rp.fill('#rgMonto', '2.500'); await rp.click('#rgAdd'); await rp.waitForTimeout(400);
  const g = RW.find(x => x.t === 'gasto'); assert(g && g.body.monto === 2500 && g.body.tipo === 'peaje', 'no registró el gasto: ' + JSON.stringify(g));
  await rp.click('#planPrueba'); await rp.waitForTimeout(400); assert(RW.some(x => x.t === 'iniciar_prueba'), 'no inició la prueba');
  assert(/Prueba gratis hasta el 2027-01-20/.test(await rp.locator('#view').innerText()), 'no muestra la prueba'); assert(!(await rp.locator('#rCsv').isDisabled()), 'informes siguen bloqueados'); });
await rpc2.close();

await test('Pantalla de inicio: anima 5 s, se puede saltar y deja la app usable', async () => {
  const sp = await nuevaPag({ viewport: { width: 390, height: 844 } }); const errs = []; sp.on('pageerror', e => errs.push(e.message));
  await sp.goto(BASE + '?splash=1'); await sp.waitForTimeout(600);
  assert(await sp.$('#splash .sp-logo .lv-pin') && await sp.$('#splash .sp-vamo'), 'no aparece la pantalla de inicio con logo y texto');
  await sp.waitForTimeout(5400); assert(!(await sp.$('#splash')), 'la pantalla de inicio no se cerró sola');
  await sp.goto(BASE + '?splash=1'); await sp.waitForTimeout(400); await sp.click('#splash'); await sp.waitForTimeout(300); if (await sp.$('#splash:not(.sp-sale)')) await sp.click('#splash'); await sp.waitForTimeout(700);
  assert(!(await sp.$('#splash')), 'un toque no saltó la pantalla de inicio');
  await sp.goto(BASE); await sp.waitForTimeout(400); assert(!(await sp.$('#splash')), 'se repitió en la misma sesión');
  assert(!errs.length, errs.join(' | ')); await sp.close(); });
await test('Sin errores de JavaScript', async () => { assert(!errors.length, errors.join(' | ')); });

await browser.close(); if (server) server.close();
for (const [s, n] of results) console.log(`${s === 'ok' ? '✓' : '✗'} ${n}`);
console.log(`\n${results.length - failed} de ${results.length} pruebas pasaron (${BASE})`);
process.exit(failed ? 1 : 0);
