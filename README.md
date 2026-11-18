# Trayecto

Prototipo de app web de transporte para Casablanca (Región de Valparaíso, Chile): autos a pedido, taxis locales, buses interurbanos y micros urbanas y rurales en un solo lugar, pensada para sumar Curacaví, Valparaíso, Viña del Mar, Quilpué y Santiago.

> Los vehículos, horarios, tarifas y operadores son **datos de ejemplo**. El mapa, las calles y las direcciones son reales (Mapbox).

## Qué incluye

- Pedir auto o taxi local: origen por GPS, dirección, punto en el mapa o lista; precio y ruta por calles reales; seguimiento en vivo.
- Buses interurbanos: próximas salidas, dónde va cada bus, asientos y pasaje con QR (demo).
- Micros urbanas y rurales con posición en vivo.
- Planificador multimodal (auto + micro + bus), incluido Santiago (Pajaritos, Terminal Sur, aeropuerto).
- Panel de dueños: vehículos, disponibilidad y plan de pago por uso.
- Vistas de mapa: calles, relieve, satélite, solo calles, noche y 3D.

## Ejecutar

Es un sitio estático. Copia `public/config.example.js` como `public/config.js`, pon tu token público de Mapbox y abre `public/index.html` en el navegador.

## Publicar en Cloudflare Pages

1. Cloudflare → Workers & Pages → Create → Pages → Connect to Git → elige este repositorio.
2. Framework preset: None. Build command: `node scripts/build.mjs`. Build output directory: `public`.
3. En Settings → Variables, agrega `MAPBOX_TOKEN` con tu token público de Mapbox (pk.…).
4. Cada push a `main` publica una nueva versión.

## Base de datos (Supabase)

- Proyecto en la organización TrayectoCSB (región São Paulo). La app lee localidades y tarifas con la clave publicable; si no hay conexión usa sus datos locales.

- `supabase/migrations/` tiene el esquema multi-localidad (PostGIS, RLS, Realtime para posiciones de vehículos).
- `supabase/seed.sql` carga localidades, tarifas y lugares de ejemplo.

El token de Mapbox no se guarda en el repositorio. Antes de compartir el sitio, restringe el token a tu dominio en https://account.mapbox.com/access-tokens.
