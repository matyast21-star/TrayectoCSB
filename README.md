# VAMO by FLUVA (antes "Trayecto")

Prototipo de app web de transporte para Casablanca (Región de Valparaíso, Chile): autos a pedido, taxis locales, buses interurbanos y micros urbanas y rurales en un solo lugar, pensada para sumar Curacaví, Valparaíso, Viña del Mar, Quilpué y Santiago.

> Los vehículos, horarios, tarifas y operadores son **datos de ejemplo**. El mapa, las calles y las direcciones son reales.

## Mapa gratuito

No necesita claves ni cuentas de pago:
- Motor de mapa: MapLibre GL JS (código abierto).
- Calles, solo calles y noche: OpenFreeMap (datos de OpenStreetMap).
- Relieve: OpenTopoMap. Satélite: imágenes de Esri. Terreno 3D: Mapzen Terrain Tiles.
- Rutas por calle: servidor público de OSRM. Búsqueda de direcciones: Photon (Komoot).

Los servidores públicos de OSRM y Photon son para pruebas; con más tráfico conviene alojar los propios o usar un plan pagado.

## Qué incluye

- Pedir auto o taxi local: origen por GPS, dirección, punto en el mapa o lista; precio y ruta por calles reales; seguimiento en vivo.
- Buses interurbanos: próximas salidas, dónde va cada bus, asientos y pasaje con QR (demo).
- Micros urbanas y rurales con posición en vivo.
- Planificador multimodal (auto + micro + bus), incluido Santiago (Pajaritos, Terminal Sur, aeropuerto).
- Panel de dueños: vehículos, disponibilidad y plan de pago por uso.
- Vistas de mapa: calles, relieve, satélite, solo calles, noche y 3D.

## Ejecutar

Es un sitio estático: abre `public/index.html` en el navegador.

## Publicar en Cloudflare Pages

1. Cloudflare → Workers & Pages → Create → Pages → Connect to Git → elige este repositorio.
2. Framework preset: None. Build command: `node scripts/build.mjs`. Build output directory: `public`.
4. Cada push a `main` publica una nueva versión.

## Base de datos (Supabase)

- Proyecto en la organización TrayectoCSB (región São Paulo). La app lee localidades y tarifas con la clave publicable; si no hay conexión usa sus datos locales.

- `supabase/migrations/` tiene el esquema multi-localidad (PostGIS, RLS, Realtime para posiciones de vehículos).
- `supabase/seed.sql` carga localidades, tarifas y lugares de ejemplo.


## Delivery y precios

- Pestaña **Delivery**: un restaurante elige su local, marca o busca la dirección del cliente, elige moto o auto y tamaño del pedido, y sigue al repartidor (va al local, retira, va al cliente, entrega).
- **Precio**: mientras una localidad tenga pocos conductores (por defecto menos de 30) o pocos viajes pagados (menos de 40), cada conductor ofrece su precio y el pasajero o el local elige la oferta. Después la app muestra un rango estimado con los percentiles 25 a 75 del valor por km de viajes pagados parecidos. Los taxis siempre cobran con taxímetro.
- En Supabase: tablas `restaurante`, `pedido_delivery`, `oferta`, `tarifa_conductor`, `config_precio` (umbrales por localidad) y la función `rango_precio(localidad, servicio, km)`.
