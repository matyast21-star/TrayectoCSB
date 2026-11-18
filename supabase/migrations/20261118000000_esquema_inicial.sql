-- Trayecto: esquema inicial multi-localidad
-- Todo cuelga de "localidad": sumar una comuna nueva es cargar datos, no cambiar código.
create extension if not exists postgis with schema extensions;
set search_path = public, extensions;

create type estado_localidad as enum ('piloto', 'activa', 'proximamente', 'destino');
create type tipo_operador as enum ('dueno_independiente', 'taxi', 'empresa_buses', 'linea_micros');
create type tipo_vehiculo as enum ('auto', 'taxi', 'van', 'micro', 'bus');
create type tipo_servicio as enum ('viajes', 'taxi', 'urbana', 'rural', 'interurbano');
create type tipo_recorrido as enum ('interurbano', 'urbano', 'rural');
create type estado_vehiculo as enum ('libre', 'asignado', 'ocupado', 'fuera_de_servicio');
create type estado_viaje as enum ('buscando', 'asignado', 'en_camino', 'en_viaje', 'finalizado', 'cancelado');
create type plan_cobro_tipo as enum ('por_viaje', 'por_dia', 'por_hora');

create table localidad (
  id text primary key,
  nombre text not null,
  comuna text,
  region text default 'Valparaíso',
  centro geography(point, 4326) not null,
  cobertura geography(polygon, 4326),
  estado estado_localidad not null default 'proximamente'
);

create table tarifa (
  id bigint generated always as identity primary key,
  localidad_id text not null references localidad(id),
  clase text not null,                 -- eco, xl, comp, taxi
  base int not null default 0,
  por_km int not null default 0,
  por_min int not null default 0,
  minimo int not null default 0,
  bajada_bandera int,                  -- solo taxis
  por_200m int,                        -- solo taxis
  vigente_desde date not null default current_date
);

create table lugar (
  id text primary key,
  localidad_id text not null references localidad(id),
  nombre text not null,
  tipo text,                           -- terminal, plaza, hospital, paradero, aeropuerto
  punto geography(point, 4326) not null
);

create table operador (
  id uuid primary key default gen_random_uuid(),
  dueno_id uuid references auth.users(id),
  razon_social text not null,
  rut text,
  tipo tipo_operador not null,
  creado_en timestamptz not null default now()
);

create table vehiculo (
  id uuid primary key default gen_random_uuid(),
  operador_id uuid not null references operador(id) on delete cascade,
  localidad_id text references localidad(id),
  tipo tipo_vehiculo not null,
  servicio tipo_servicio not null,
  patente text not null unique,
  modelo text,
  capacidad int,
  activo boolean not null default false,
  estado estado_vehiculo not null default 'fuera_de_servicio',
  permiso_circulacion_vence date,
  soap_vence date,
  revision_tecnica_vence date
);

create table conductor (
  id uuid primary key default gen_random_uuid(),
  usuario_id uuid references auth.users(id),
  operador_id uuid references operador(id),
  nombre text not null,
  licencia_clase text,
  calificacion numeric(2,1) default 5.0
);

create table recorrido (
  id text primary key,
  operador_id uuid references operador(id),
  tipo tipo_recorrido not null,
  nombre text not null,
  trazado geography(linestring, 4326),
  precio int not null,
  duracion_min int not null
);

create table parada_recorrido (
  recorrido_id text references recorrido(id) on delete cascade,
  lugar_id text references lugar(id),
  orden int not null,
  minutos_desde_inicio int,
  primary key (recorrido_id, orden)
);

create table horario (
  id bigint generated always as identity primary key,
  recorrido_id text not null references recorrido(id) on delete cascade,
  dias text not null default 'L-D',
  primera_salida time not null,
  ultima_salida time not null,
  frecuencia_min int not null
);

-- Última posición conocida de cada vehículo (se actualiza cada 5-10 s; Realtime la difunde)
create table posicion_vehiculo (
  vehiculo_id uuid primary key references vehiculo(id) on delete cascade,
  punto geography(point, 4326) not null,
  rumbo int,
  velocidad_kmh numeric,
  actualizado_en timestamptz not null default now()
);
create index on posicion_vehiculo using gist (punto);

create table viaje (
  id uuid primary key default gen_random_uuid(),
  pasajero_id uuid references auth.users(id),
  vehiculo_id uuid references vehiculo(id),
  conductor_id uuid references conductor(id),
  clase text not null,
  origen geography(point, 4326) not null,
  origen_texto text,
  destino geography(point, 4326) not null,
  destino_texto text,
  distancia_km numeric,
  precio_estimado int,
  precio_final int,
  estado estado_viaje not null default 'buscando',
  creado_en timestamptz not null default now()
);

create table pasaje (
  id uuid primary key default gen_random_uuid(),
  pasajero_id uuid references auth.users(id),
  recorrido_id text references recorrido(id),
  salida timestamptz not null,
  asiento int,
  codigo text not null unique,
  estado text not null default 'emitido'
);

create table plan_cobro (
  operador_id uuid primary key references operador(id) on delete cascade,
  tipo plan_cobro_tipo not null default 'por_viaje',
  porcentaje numeric default 8,
  monto_dia int default 3500,
  monto_hora int default 450,
  desde date not null default current_date
);

create table cargo_plataforma (
  id bigint generated always as identity primary key,
  operador_id uuid not null references operador(id),
  periodo date not null,
  tipo plan_cobro_tipo not null,
  base_calculo int not null,
  monto int not null,
  pagado boolean not null default false
);

-- Buscar vehículos libres cerca de un punto
create or replace function vehiculos_cercanos(lat double precision, lon double precision, radio_m int default 3000, p_tipo tipo_vehiculo default null)
returns table (vehiculo_id uuid, patente text, tipo tipo_vehiculo, distancia_m double precision)
language sql stable set search_path = public, extensions as $$
  select v.id, v.patente, v.tipo, st_distance(p.punto, st_makepoint(lon, lat)::geography)
  from posicion_vehiculo p join vehiculo v on v.id = p.vehiculo_id
  where v.activo and v.estado = 'libre' and (p_tipo is null or v.tipo = p_tipo)
    and st_dwithin(p.punto, st_makepoint(lon, lat)::geography, radio_m)
    and p.actualizado_en > now() - interval '2 minutes'
  order by 4 limit 10;
$$;

-- Seguridad: datos públicos de solo lectura; cada dueño gestiona lo suyo
alter table localidad enable row level security;
alter table tarifa enable row level security;
alter table lugar enable row level security;
alter table recorrido enable row level security;
alter table parada_recorrido enable row level security;
alter table horario enable row level security;
alter table posicion_vehiculo enable row level security;
alter table operador enable row level security;
alter table vehiculo enable row level security;
alter table conductor enable row level security;
alter table viaje enable row level security;
alter table pasaje enable row level security;
alter table plan_cobro enable row level security;
alter table cargo_plataforma enable row level security;

create policy "lectura publica" on localidad for select using (true);
create policy "lectura publica" on tarifa for select using (true);
create policy "lectura publica" on lugar for select using (true);
create policy "lectura publica" on recorrido for select using (true);
create policy "lectura publica" on parada_recorrido for select using (true);
create policy "lectura publica" on horario for select using (true);
create policy "lectura publica" on posicion_vehiculo for select using (true);
create policy "dueno gestiona su operador" on operador for all using (dueno_id = auth.uid()) with check (dueno_id = auth.uid());
create policy "dueno gestiona sus vehiculos" on vehiculo for all
  using (exists (select 1 from operador o where o.id = operador_id and o.dueno_id = auth.uid()))
  with check (exists (select 1 from operador o where o.id = operador_id and o.dueno_id = auth.uid()));
create policy "vehiculos activos visibles" on vehiculo for select using (activo);
create policy "dueno gestiona sus conductores" on conductor for all
  using (exists (select 1 from operador o where o.id = operador_id and o.dueno_id = auth.uid()));
create policy "conductor publica su posicion" on posicion_vehiculo for all
  using (exists (select 1 from vehiculo v join conductor c on c.operador_id = v.operador_id where v.id = vehiculo_id and c.usuario_id = auth.uid()));
create policy "pasajero ve sus viajes" on viaje for select using (pasajero_id = auth.uid());
create policy "pasajero crea viajes" on viaje for insert with check (pasajero_id = auth.uid());
create policy "pasajero ve sus pasajes" on pasaje for select using (pasajero_id = auth.uid());
create policy "dueno ve su plan" on plan_cobro for all using (exists (select 1 from operador o where o.id = operador_id and o.dueno_id = auth.uid()));
create policy "dueno ve sus cargos" on cargo_plataforma for select using (exists (select 1 from operador o where o.id = operador_id and o.dueno_id = auth.uid()));

alter publication supabase_realtime add table posicion_vehiculo;
