-- Etapa 2: recorridos, paraderos y horarios administrables desde la base de datos.
-- Revisión previa (2026-11-18): recorrido, horario y parada_recorrido estaban vacías; lugar tenía 9 filas.
-- Dependencias: pasaje.recorrido_id, horario.recorrido_id y parada_recorrido.recorrido_id → recorrido; parada_recorrido.lugar_id → lugar.
-- Sin vistas ni funciones que dependan de estas tablas. RLS: solo "lectura publica" (select). Todos los cambios son aditivos.
set search_path = public, extensions;

-- Origen del horario: oficial (lo entrega el operador), programado (cargado por Fluva), estimado (calculado), sin_horario
create type tipo_horario as enum ('oficial', 'programado', 'estimado', 'sin_horario');

alter table recorrido
  add column if not exists codigo text unique,
  add column if not exists localidad_id text references localidad(id),
  add column if not exists operador_nombre text,
  add column if not exists color text,
  add column if not exists descripcion text,
  add column if not exists tipo_horario tipo_horario not null default 'sin_horario',
  add column if not exists fuente_horario text,
  add column if not exists frecuencia_aprox_min int,
  add column if not exists activo boolean not null default true,
  add column if not exists permite_reportes boolean not null default true,
  add column if not exists orden int not null default 100,
  add column if not exists actualizado_en timestamptz not null default now();

alter table horario
  add column if not exists tipo tipo_horario not null default 'programado',
  add column if not exists sentido text not null default 'ida' check (sentido in ('ida', 'vuelta')),
  add column if not exists fuente text,
  add column if not exists vigente_desde date not null default current_date;

-- null = la parada aplica en ambos sentidos (la clave primaria no cambia)
alter table parada_recorrido add column if not exists sentido text check (sentido in ('ida', 'vuelta'));

alter table lugar add column if not exists activo boolean not null default true;

create index if not exists recorrido_localidad_idx on recorrido (localidad_id) where activo;
create index if not exists parada_lugar_idx on parada_recorrido (lugar_id);

-- Vistas de lectura para la app: coordenadas como GeoJSON (la API devuelve geography en binario)
create or replace view lugar_publico with (security_invoker = true) as
  select l.id, l.localidad_id, l.nombre, l.tipo, st_y(l.punto::geometry) as lat, st_x(l.punto::geometry) as lon
  from lugar l where l.activo;

create or replace view recorrido_publico with (security_invoker = true) as
  select r.id, r.codigo, r.nombre, r.tipo, r.localidad_id, r.operador_nombre, r.color, r.descripcion,
         r.precio, r.duracion_min, r.tipo_horario, r.fuente_horario, r.frecuencia_aprox_min, r.permite_reportes, r.orden,
         st_asgeojson(r.trazado::geometry, 5)::json -> 'coordinates' as trazado,
         coalesce((select json_agg(json_build_object('lugar', p.lugar_id, 'orden', p.orden, 'min', p.minutos_desde_inicio, 'sentido', p.sentido) order by p.orden)
                   from parada_recorrido p where p.recorrido_id = r.id), '[]') as paradas,
         coalesce((select json_agg(json_build_object('tipo', h.tipo, 'sentido', h.sentido, 'dias', h.dias, 'primera', to_char(h.primera_salida, 'HH24:MI'), 'ultima', to_char(h.ultima_salida, 'HH24:MI'), 'cada', h.frecuencia_min, 'fuente', h.fuente))
                   from horario h where h.recorrido_id = r.id), '[]') as horarios,
         r.actualizado_en
  from recorrido r where r.activo;

grant select on lugar_publico, recorrido_publico to anon, authenticated;
