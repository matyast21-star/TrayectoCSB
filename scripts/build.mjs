// Genera public/config.js con el token público de Mapbox desde la variable de entorno MAPBOX_TOKEN.
import { writeFileSync } from 'node:fs';
const token = process.env.MAPBOX_TOKEN || '';
if (!token) console.warn('Aviso: falta MAPBOX_TOKEN; el sitio se publica sin mapa hasta que la agregues.');
writeFileSync(new URL('../public/config.js', import.meta.url), `window.MAPBOX_TOKEN = ${JSON.stringify(token)};\n`);
console.log('public/config.js generado');
