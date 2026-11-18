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
const ctx = await browser.newContext({ viewport: { width: 1300, height: 860 } });
const page = await ctx.newPage(); const errors = [];
page.on('pageerror', e => errors.push(e.message));
await page.goto(BASE); await page.waitForTimeout(1200);
const ev = f => page.evaluate(f);
const wait = ms => page.waitForTimeout(ms);
// Navegación de 6 secciones: Micros y Colectivos están en «Buses y colectivos»; Delivery y Dueños en «Más servicios»
const GRUPO = { buses: 'locomocion', viaje: 'mas', planificar: 'mas', misviajes: 'mas', colectivos: 'mas', delivery: 'mas', duenos: 'mas', conductor: 'mas', favoritos: 'mas', config: 'mas', avisos: 'mas' };
const irA = async (p, t) => { const g = GRUPO[t]; await p.click(`#tabs [data-tab=${g || t}]`); if (g) await p.click(`#view [data-tab=${t}]`); };
const until = async (f, ms = 60000) => { const t = Date.now(); while (Date.now() - t < ms) { if (await ev(f)) return true; await wait(500); } return false; };

await test('Carga la identidad VAMO (logo, tema oscuro, pestañas con íconos)', async () => {
  assert(await ev(() => !!window.VamoUI && !!document.querySelector('#marca .vamo-v')), 'falta el logo SVG');
  assert(await ev(() => getComputedStyle(document.body).backgroundColor === 'rgb(11, 15, 36)'), 'el fondo no es #0B0F24');
  assert(await page.locator('.tab svg').count() === 4, 'faltan íconos en las pestañas'); });
await test('Pedir viaje: precio libre con 3 ofertas y asignación', async () => {
  await irA(page, 'viaje');
  await ev(() => { PRECIO.modo = 'conductor'; S.clase = 'eco'; render(); }); await page.click('#pedir');
  assert(await until(() => S.ride && S.ride.fase === 'ofertas', 5000), 'no llegaron ofertas');
  await page.locator('.offer').first().click(); assert(await ev(() => S.ride.fase === 'va' && !!S.ride.car), 'no se asignó conductor'); await page.click('#cancelar'); });
await test('Pedir taxi: siempre con taxímetro, sin ofertas', async () => {
  await ev(() => { S.clase = 'taxi'; render(); }); await page.click('#pedir');
  assert(await until(() => S.ride && S.ride.fase === 'va', 5000), 'el taxi no fue asignado'); assert(await ev(() => S.ride.modo === 'taxi'), 'modo distinto de taxímetro'); await page.click('#cancelar'); });
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
  await ev(() => { S.filtro.bus = false; }); k = await kinds(); assert(k === 'bus', 'con el filtro Buses apagado, la pestaña Buses quedó vacía: ' + k); await ev(() => { S.filtro.bus = true; });
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
await test('Avisar dónde viene: dos acciones y formulario mínimo', async () => {
  await irA(page, 'inicio'); await page.click('#avisarBtn'); assert(await page.locator('[data-avmodo]').count() === 2, 'no hay 2 acciones');
  await page.click('[data-avmodo=vipasar]'); assert(await page.locator('[data-avdest=nose]').count() === 1, 'falta «No sé hacia dónde iba»');
  await page.click('[data-avtipo=bus]'); await page.click('[data-avdest=nose]'); await page.click('#avEnviar');
  const txt = await page.locator('#view').innerText(); assert(txt.includes('Gracias') && txt.includes('no se envía'), 'no confirma o no aclara que es prototipo'); await page.click('#avFin'); });
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
  const l = await browser.newPage({ viewport: { width: 390, height: 844 } }); const reqs = []; l.on('request', r => reqs.push(r.url())); l.on('pageerror', e => errors.push('lite: ' + e.message));
  await l.goto(BASE + '?lite=1'); await l.waitForTimeout(800);
  assert(await l.evaluate(() => document.documentElement.classList.contains('lite') && getComputedStyle(document.querySelector('.mapwrap')).display === 'none'), 'el mapa sigue visible');
  assert(!reqs.some(u => /maplibre|openfreemap|tile/i.test(u)), 'cargó el mapa: ' + reqs.filter(u => /maplibre|tile/.test(u)).join(' '));
  assert((await l.locator('#view').innerText()).includes('¿A dónde vamos?'), 'Inicio no funciona sin mapa');
  await l.goto(BASE + '?lite=0'); await l.waitForTimeout(300); assert(await l.evaluate(() => !document.documentElement.classList.contains('lite')), 'no volvió al modo normal'); await l.close(); });
await test('Mapa: solo vistas Calles y Satélite', async () => {
  const v = await page.locator('#styleBar [data-style]').allInnerTexts(); assert(v.join('|') === 'Calles|Satélite', 'vistas: ' + v.join('|'));
  assert(await page.locator('#styleBar [data-3d]').count() === 0, 'sigue la vista 3D'); });
await test('Tema claro / oscuro', async () => {
  await page.click('#tema'); assert(await ev(() => document.documentElement.dataset.theme === 'light'), 'no pasó a claro'); await page.click('#tema');
  assert(await ev(() => !document.documentElement.dataset.theme), 'no volvió a oscuro'); });
await test('Cambio de localidad', async () => { await page.selectOption('#loc', 'curacavi'); assert(await ev(() => S.loc === 'curacavi'), 'no cambió'); await page.selectOption('#loc', 'casablanca'); });
await test('Celular: barra inferior y sin desborde horizontal', async () => {
  const m = await browser.newPage({ viewport: { width: 390, height: 844 } }); await m.goto(BASE); await m.waitForTimeout(800);
  assert(await m.evaluate(() => document.documentElement.scrollWidth) <= 390, 'hay desborde horizontal');
  assert(await m.evaluate(() => getComputedStyle(document.getElementById('tabs')).position === 'fixed'), 'la barra inferior no está fija'); assert(await m.evaluate(() => getComputedStyle(document.querySelector('.mapwrap')).display === 'none'), 'el mapa se ve en Inicio');
  await m.click('#tabs [data-tab=mapa]'); assert(await m.evaluate(() => getComputedStyle(document.querySelector('.mapwrap')).display !== 'none'), 'el mapa no aparece en Mapa');
  await m.close(); });
// ---- Recorridos desde la base de datos (respuestas simuladas con tests/fixtures/bd.json) ----
const FIX = JSON.parse(await readFile(join(dirname(fileURLToPath(import.meta.url)), 'fixtures', 'bd.json'), 'utf8'));
const bd = await browser.newPage({ viewport: { width: 1300, height: 860 } }); bd.on('pageerror', e => errors.push('bd: ' + e.message));
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

await test('Sin errores de JavaScript', async () => { assert(!errors.length, errors.join(' | ')); });

await browser.close(); if (server) server.close();
for (const [s, n] of results) console.log(`${s === 'ok' ? '✓' : '✗'} ${n}`);
console.log(`\n${results.length - failed} de ${results.length} pruebas pasaron (${BASE})`);
process.exit(failed ? 1 : 0);
