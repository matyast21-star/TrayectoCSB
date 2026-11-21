/* VAMO by FLUVA · pantalla de inicio animada (5 s).
   0–1 s fondo azul noche con mapa sutil · 1–2 s una línea turquesa dibuja la carretera ·
   2–3 s la carretera forma la V y cae el marcador · 3–4 s «VAMO by FLUVA» con efecto de luz ·
   4–5 s círculo de carga girando. Luego se desvanece cuando la app ya cargó.
   Se muestra una vez por apertura de la app (sessionStorage); un toque la salta.
   Con «reducir movimiento» se muestra fija y breve. ?splash=1 la fuerza (pruebas), ?splash=0 la omite. */
(function () {
  const q = location.search;
  let visto = false; try { visto = sessionStorage.getItem('vamo-splash') === '1'; } catch (e) {}
  const forzar = /[?&]splash=1\b/.test(q);
  if (!forzar && (visto || /[?&]splash=0\b/.test(q) || navigator.webdriver)) return;
  try { sessionStorage.setItem('vamo-splash', '1'); } catch (e) {}
  const UI = window.VamoUI; if (!UI || !UI.logoCuerpo) return;
  const quieto = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;

  // Calles del fondo: cuadrícula irregular, más visible abajo (como un mapa visto en perspectiva)
  const calles = [
    'M-20 560L420 520', 'M-20 620L420 600', 'M-20 690L420 660', 'M-20 760L420 745', 'M-20 830L420 800',
    'M40 500L10 900', 'M110 505L90 900', 'M190 500L185 900', 'M265 505L285 900', 'M340 500L380 900',
    'M60 640L150 590', 'M220 700L330 650', 'M120 780L240 760', 'M300 560L360 720'
  ].map(d => `<path d="${d}"/>`).join('');
  const pin = (x, y) => `<g class="sp-mpin" transform="translate(${x} ${y})"><ellipse rx="11" ry="4" cy="2" fill="none" stroke="#00E5D6" stroke-width="1.4" opacity=".7"/><path d="M0 0C-5 -6 -8 -9 -8 -14A8 8 0 1 1 8 -14C8 -9 5 -6 0 0Z" fill="#00E5D6"/><circle cy="-14" r="3" fill="#0B1E3F"/></g>`;

  const html = `<div id="splash" class="sp${quieto ? ' sp-quieto' : ''}" role="status" aria-label="Cargando VAMO! by FLUVA">
  <style>
  .sp{position:fixed;inset:0;z-index:5000;overflow:hidden;background:#0B1E3F;color:#fff;display:flex;flex-direction:column;align-items:center;justify-content:center;
    font-family:"Montserrat","Helvetica Neue",Arial,sans-serif;cursor:pointer;-webkit-tap-highlight-color:transparent}
  .sp::before{content:"";position:absolute;inset:0;opacity:0;animation:spFade .8s ease-out forwards;background:
    radial-gradient(60% 40% at 0% 0%,rgba(0,229,214,.55),transparent 70%),
    radial-gradient(55% 35% at 100% 78%,rgba(0,229,214,.45),transparent 70%),
    radial-gradient(70% 50% at 50% 45%,#0A4B7A 0%,transparent 75%)}
  .sp-mapa{position:absolute;inset:0;width:100%;height:100%;opacity:0;animation:spFade .9s .15s ease-out forwards}
  .sp-mapa .calles{fill:none;stroke:#2F8FD0;stroke-width:2;opacity:.28}
  .sp-mapa .rutas path{fill:none;stroke:#00E5D6;stroke-width:2.2;filter:url(#spBrillo)}
  .sp-centro{position:relative;display:flex;flex-direction:column;align-items:center;width:min(74vw,320px)}
  .sp-logo{width:100%;height:auto;overflow:visible;filter:drop-shadow(0 6px 18px rgba(0,0,0,.35))}
  .sp-trazo{fill:none;stroke:#00E5D6;stroke-width:3.2;stroke-linecap:round;stroke-dasharray:1;stroke-dashoffset:1;opacity:0;filter:url(#spBrillo);animation:spTrazo 1s 1s ease-in-out forwards,spFadeOut .5s 2.6s forwards}
  .sp-logo .lv-brazo{opacity:0;transform:translate(-14px,-18px);animation:spPieza .7s 2s cubic-bezier(.2,.8,.2,1) forwards}
  .sp-logo .lv-hoja{opacity:0;transform:translate(10px,14px);animation:spPieza .7s 2.15s cubic-bezier(.2,.8,.2,1) forwards}
  .sp-logo .lv-via,.sp-logo .lv-borde,.sp-logo .lv-eje{opacity:0;animation:spFade .6s 2.05s ease-out forwards}
  .sp-logo .lv-pin{opacity:0;transform-box:fill-box;transform-origin:50% 100%;transform:translateY(-26px) scale(.6);animation:spPin .7s 2.45s cubic-bezier(.3,1.6,.5,1) forwards}
  .sp-txt{display:flex;flex-direction:column;align-items:flex-end;margin-top:6px;opacity:0;transform:translateY(8px);animation:spPieza .6s 3s ease-out forwards}
  .sp-vamo,.sp-by b{background:linear-gradient(100deg,#fff 0 42%,#9FFFF7 48%,#00E5D6 50%,#9FFFF7 52%,#fff 58% 100%);background-size:320% 100%;background-position:100% 0;
    -webkit-background-clip:text;background-clip:text;color:transparent;animation:spLuz 1.1s 3.15s ease-in-out forwards}
  .sp-vamo{font-weight:800;font-style:italic;font-size:min(18vw,78px);line-height:.9;letter-spacing:.01em;filter:drop-shadow(0 0 10px rgba(0,229,214,.35))}
  .sp-by{font-size:min(6.4vw,26px);font-weight:500;margin-top:4px;color:#fff}
  .sp-by b{font-weight:800;letter-spacing:.04em}.sp-by i{font-style:normal;color:#00E5D6;-webkit-text-fill-color:#00E5D6}
  .sp-carga{position:relative;width:44px;height:44px;margin-top:min(12vh,90px);border-radius:50%;border:4px solid rgba(0,229,214,.18);border-top-color:#00E5D6;border-right-color:#00B3C6;
    opacity:0;animation:spFade .5s 4s ease-out forwards,spGira 1.1s 4s linear infinite}
  .sp.sp-sale{animation:spOut .45s ease-in forwards}
  .sp-quieto,.sp-quieto *{animation:none!important;opacity:1!important;transform:none!important}
  .sp-quieto .sp-trazo{display:none}
  @keyframes spFade{to{opacity:1}}
  @keyframes spFadeOut{to{opacity:0}}
  @keyframes spTrazo{0%{opacity:1;stroke-dashoffset:1}to{opacity:1;stroke-dashoffset:0}}
  @keyframes spPieza{to{opacity:1;transform:none}}
  @keyframes spPin{to{opacity:1;transform:none}}
  @keyframes spLuz{to{background-position:0 0}}
  @keyframes spGira{to{transform:rotate(360deg)}}
  @keyframes spOut{to{opacity:0;visibility:hidden}}
  </style>
  <svg class="sp-mapa" viewBox="0 0 400 860" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
    <defs><filter id="spBrillo" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="2.4" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
      <linearGradient id="spMasc" x1="0" y1="0" x2="0" y2="1"><stop offset=".45" stop-color="#fff" stop-opacity="0"/><stop offset=".75" stop-color="#fff"/></linearGradient>
      <mask id="spM"><rect width="400" height="860" fill="url(#spMasc)"/></mask></defs>
    <g class="calles" mask="url(#spM)">${calles}</g>
    <g class="rutas"><path d="M-10 190C60 150 110 90 200 85S300 60 410 30"/><path d="M-10 830C80 800 160 760 250 700S350 640 410 610"/></g>
    ${pin(78, 150)}${pin(318, 72)}${pin(282, 684)}
  </svg>
  <div class="sp-centro">
    <svg class="sp-logo" viewBox="0 0 140 110" aria-hidden="true"><defs>${UI.logoDefs('sp')}</defs>
      ${UI.logoCuerpo('sp')}
      <path class="sp-trazo" pathLength="1" d="${UI.LOGO.borde}"/>
    </svg>
    <div class="sp-txt"><span class="sp-vamo">VAMO!</span><span class="sp-by">by <b>FLUV<i>A</i></b></span></div>
  </div>
  <div class="sp-carga" aria-hidden="true"></div>
</div>`;
  document.body.insertAdjacentHTML('afterbegin', html);
  const el = document.getElementById('splash');
  const meta = document.querySelector('meta[name=theme-color]');
  if (meta) meta.content = '#0B1E3F';

  const inicio = performance.now(), DURA = quieto ? 1200 : 5000;
  let cerrado = false, cargado = document.readyState === 'complete';
  function cerrar() {
    if (cerrado) return; cerrado = true;
    if (meta) meta.content = document.documentElement.dataset.theme === 'dark' ? '#0B0F24' : '#FFFFFF';
    el.classList.add('sp-sale'); setTimeout(() => el.remove(), 480);
  }
  function intentar() { if (cargado && performance.now() - inicio >= DURA) cerrar(); }
  window.addEventListener('load', () => { cargado = true; intentar(); });
  setTimeout(intentar, DURA);
  setTimeout(cerrar, DURA + 4000); // si la red está lenta, no dejar la app tapada
  el.addEventListener('click', cerrar);
  window.VamoSplash = { cerrar };
})();
