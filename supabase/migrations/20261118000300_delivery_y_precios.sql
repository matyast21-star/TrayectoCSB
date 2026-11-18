-- Delivery para restaurantes + precio libre del conductor / rango por viajes pagados
set search_path = public, extensions;

create type estado_delivery as enum ('buscando', 'ofertas', 'asignado', 'retirando', 'en_camino', 'entregado', 'cancelado');
create type modo_precio as enum ('conductor', 'rango');

-- Umbrales por localidad: con pocos conductores el precio lo pone el conductor; con muchos, rango estimado
create table config_precio (
  localidad_id text primary key references localidad(id),
  min_conductores int not null default 30,
  min_pagados int not null default 40,
  forzar_modo modo_precio            -- null = automático
);

alter table viaje add column if not exists localidad_id text references localidad(id);
alter table viaje add column if not exists modo modo_precio;

create table restaurante (
  id uuid primary key default gen_random_uuid(),
  dueno_id uuid references auth.users(id),
  localidad_id text not null references localidad(id),
  nombre text not null,
  rubro text,
  direccion text,
  punto geography(point, 4326) not null,
  activo boolean not null default true,
  creado_en timestamptz not null default now()
);

create table pedido_delivery (
  id uuid primary key default gen_random_uuid(),
  restaurante_id uuid not null references restaurante(id) on delete cascade,
  localidad_id text not null references localidad(id),
  vehiculo_id uuid references vehiculo(id),
  conductor_id uuid references conductor(id),
  tipo_vehiculo text not null check (tipo_vehiculo in ('moto', 'auto')),
  tamano text not null default 'chico' check (tamano in ('chico', 'mediano', 'grande')),
  destino geography(point, 4326) not null,
  destino_texto text,
  nota text,
  cobrar_efectivo boolean not null default false,
  distancia_km numeric,
  modo modo_precio not null,
  precio_final int,
  estado estado_delivery not null default 'buscando',
  codigo text not null unique,
  creado_en timestamptz not null default now(),
  entregado_en timestamptz
);

-- Ofertas de precio que hace cada conductor (para viajes o despachos)
create table oferta (
  id uuid primary key default gen_random_uuid(),
  viaje_id uuid references viaje(id) on delete cascade,
  pedido_id uuid references pedido_delivery(id) on delete cascade,
  vehiculo_id uuid not null references vehiculo(id),
  conductor_id uuid references conductor(id),
  precio int not null check (precio > 0),
  eta_min int,
  aceptada boolean not null default false,
  creada_en timestamptz not null default now(),
  check ((viaje_id is null) <> (pedido_id is null))
);

-- Precio propio de cada conductor/dueño (modo precio libre)
create table tarifa_conductor (
  vehiculo_id uuid primary key references vehiculo(id) on delete cascade,
  base int not null default 800,
  por_km int not null default 600,
  minimo int not null default 2500
);

-- Rango estimado: percentiles del valor por km de lo realmente pagado (sin exponer filas individuales)
create or replace function rango_precio(p_localidad text, p_servicio text, p_km numeric)
returns table (n int, bajo int, medio int, alto int, modo modo_precio)
language sql stable security definer set search_path = public, extensions as $$
  with pagos as (
    select v.precio_final::numeric as precio, greatest(v.distancia_km, 0.5) as km from viaje v
      where p_servicio = 'viaje' and v.localidad_id = p_localidad and v.estado = 'finalizado' and v.precio_final is not null and v.distancia_km is not null
    union all
    select d.precio_final, greatest(d.distancia_km, 0.5) from pedido_delivery d
      where p_servicio = 'delivery' and d.localidad_id = p_localidad and d.estado = 'entregado' and d.precio_final is not null and d.distancia_km is not null
  ), cerca as (select * from pagos where km between p_km / 2 and p_km * 2),
  base as (select * from cerca where (select count(*) from cerca) >= 5 union all select * from pagos where (select count(*) from cerca) < 5),
  conf as (select coalesce(c.min_conductores, 30) mc, coalesce(c.min_pagados, 40) mp, c.forzar_modo fm from (select 1) x left join config_precio c on c.localidad_id = p_localidad),
  cond as (select count(*) n from vehiculo where localidad_id = p_localidad and activo and (case when p_servicio = 'delivery' then servicio::text = 'delivery' else servicio::text in ('viajes') end))
  select (select count(*) from pagos)::int,
    (round(percentile_cont(0.25) within group (order by precio / km) * greatest(p_km, 0.5) / 100) * 100)::int,
    (round(percentile_cont(0.50) within group (order by precio / km) * greatest(p_km, 0.5) / 100) * 100)::int,
    (round(percentile_cont(0.75) within group (order by precio / km) * greatest(p_km, 0.5) / 100) * 100)::int,
    coalesce((select fm from conf), case when (select n from cond) >= (select mc from conf) and (select count(*) from pagos) >= (select mp from conf) then 'rango'::modo_precio else 'conductor'::modo_precio end)
  from base;
$$;

alter table config_precio enable row level security;
alter table restaurante enable row level security;
alter table pedido_delivery enable row level security;
alter table oferta enable row level security;
alter table tarifa_conductor enable row level security;

create policy "lectura publica" on config_precio for select using (true);
create policy "restaurantes activos visibles" on restaurante for select using (activo);
create policy "dueno gestiona su restaurante" on restaurante for all using (dueno_id = auth.uid()) with check (dueno_id = auth.uid());
create policy "restaurante gestiona sus pedidos" on pedido_delivery for all
  using (exists (select 1 from restaurante r where r.id = restaurante_id and r.dueno_id = auth.uid()))
  with check (exists (select 1 from restaurante r where r.id = restaurante_id and r.dueno_id = auth.uid()));
create policy "conductor ve pedidos asignados" on pedido_delivery for select
  using (exists (select 1 from conductor c where c.id = conductor_id and c.usuario_id = auth.uid()));
create policy "conductor ve pedidos buscando" on pedido_delivery for select using (estado in ('buscando', 'ofertas'));
create policy "conductor crea sus ofertas" on oferta for insert
  with check (exists (select 1 from vehiculo v join conductor c on c.operador_id = v.operador_id where v.id = vehiculo_id and c.usuario_id = auth.uid()));
create policy "partes ven ofertas" on oferta for select using (
  exists (select 1 from viaje v where v.id = viaje_id and v.pasajero_id = auth.uid())
  or exists (select 1 from pedido_delivery d join restaurante r on r.id = d.restaurante_id where d.id = pedido_id and r.dueno_id = auth.uid())
  or exists (select 1 from vehiculo v join conductor c on c.operador_id = v.operador_id where v.id = vehiculo_id and c.usuario_id = auth.uid()));
create policy "lectura publica" on tarifa_conductor for select using (true);
create policy "dueno fija su tarifa" on tarifa_conductor for all
  using (exists (select 1 from vehiculo v join operador o on o.id = v.operador_id where v.id = vehiculo_id and o.dueno_id = auth.uid()))
  with check (exists (select 1 from vehiculo v join operador o on o.id = v.operador_id where v.id = vehiculo_id and o.dueno_id = auth.uid()));

grant select on config_precio, restaurante, tarifa_conductor to anon, authenticated;
grant select, insert, update, delete on restaurante, pedido_delivery, oferta, tarifa_conductor to authenticated;
grant select on pedido_delivery, oferta to authenticated;
grant execute on function rango_precio(text, text, numeric) to anon, authenticated;

alter publication supabase_realtime add table pedido_delivery, oferta;

insert into config_precio (localidad_id) select id from localidad on conflict do nothing;
-- Tarifas de referencia de delivery (ejemplo)
insert into tarifa (localidad_id, clase, base, por_km, minimo) values
  ('casablanca', 'delivery_moto', 1000, 350, 1500), ('casablanca', 'delivery_auto', 1400, 450, 2000);
