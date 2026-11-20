-- Módulo 2: avisos de locomoción.
-- Revisión previa (2026-11-19): flota.sesion_servicio tiene cupos/completo/salida_informada pero no un estado operacional;
-- los reportes comunitarios no se guardaban (solo prototipo en el teléfono). Todo es aditivo.
--  * estado del servicio (disponible, en punto de salida, en recorrido, completo, fuera de servicio) lo fija solo el conductor
--  * evento_servicio: eventos reales (inicio, cambio de estado, fin) generados por el servidor, sin datos personales
--  * reporte_comunitario: voluntario, ubicación redondeada (~100 m), vence a los 20 min; se publica agregado
--  * alerta_pasajero, preferencia_pasajero, notificacion, suscripcion_push: de cada identidad anónima, RLS propia
set search_path = public, extensions;

-- ===== Estado operacional del servicio =====
alter table flota.sesion_servicio
  add column if not exists estado text not null default 'disponible' check (estado in ('disponible', 'en_punto_salida', 'en_recorrido', 'completo', 'fuera_servicio')),
  add column if not exists estado_en timestamptz not null default now(),
  add column if not exists cupos_en timestamptz;
grant select (estado, estado_en, cupos_en) on flota.sesion_servicio to anon;

create or replace function flota.cambiar_estado(s uuid, e text) returns void language plpgsql security definer set search_path = '' as $$
begin
  if e not in ('disponible', 'en_punto_salida', 'en_recorrido', 'completo', 'fuera_servicio') then raise exception 'Estado no válido'; end if;
  update flota.sesion_servicio set estado = e, estado_en = now(),
         completo = (e = 'completo'), cupos = case when e = 'completo' then 0 else cupos end,
         salida_informada = case when e = 'en_recorrido' then coalesce(salida_informada, now()) else salida_informada end
   where id = s and fin is null and conductor_id = auth.uid();
  if not found then raise exception 'No hay una sesión activa tuya con ese id'; end if;
end $$;

create or replace function flota.actualizar_cupos(s uuid, n int) returns void language plpgsql security definer set search_path = '' as $$
declare cap int;
begin
  select ve.capacidad into cap from flota.sesion_servicio ss join flota.vehiculo ve on ve.id = ss.vehiculo_id
    where ss.id = s and ss.fin is null and ss.conductor_id = auth.uid();
  if cap is null then raise exception 'No hay una sesión activa tuya con ese id'; end if;
  if n < 0 or n > cap then raise exception 'Los cupos deben estar entre 0 y %', cap; end if;
  update flota.sesion_servicio set cupos = n, completo = (n = 0), cupos_en = now(),
         estado = case when n = 0 then 'completo' when estado = 'completo' then 'disponible' else estado end,
         estado_en = case when (n = 0) <> (estado = 'completo') then now() else estado_en end
   where id = s;
end $$;

create or replace function flota.marcar_completo(s uuid, si boolean) returns void language plpgsql security definer set search_path = '' as $$
begin
  update flota.sesion_servicio set completo = si, cupos = case when si then 0 else cupos end, cupos_en = now(),
         estado = case when si then 'completo' when estado = 'completo' then 'disponible' else estado end, estado_en = now()
   where id = s and fin is null and conductor_id = auth.uid();
  if not found then raise exception 'No hay una sesión activa tuya con ese id'; end if;
end $$;

create or replace function flota.informar_salida(s uuid, retraso int default 0) returns void language plpgsql security definer set search_path = '' as $$
begin
  if retraso < 0 or retraso > 180 then raise exception 'Retraso fuera de rango'; end if;
  update flota.sesion_servicio set salida_informada = now(), retraso_min = retraso,
         estado = case when estado = 'completo' then estado else 'en_recorrido' end, estado_en = now()
   where id = s and fin is null and conductor_id = auth.uid();
  if not found then raise exception 'No hay una sesión activa tuya con ese id'; end if;
end $$;
grant execute on function flota.cambiar_estado(uuid, text) to authenticated;

-- Vista pública: se agregan columnas al final
create or replace view flota.en_servicio with (security_invoker = true) as
  select s.id as sesion_id, v.id as vehiculo_id, v.tipo, v.patente, v.capacidad, v.recorrido_id, v.zona, v.categoria,
         s.inicio, s.sentido, s.cupos, s.completo, s.salida_informada, s.retraso_min,
         case when p.actualizado_en > now() - interval '2 minutes' then extensions.st_y(p.punto::extensions.geometry) end as lat,
         case when p.actualizado_en > now() - interval '2 minutes' then extensions.st_x(p.punto::extensions.geometry) end as lng,
         p.actualizado_en as posicion_en,
         s.estado, s.estado_en, s.cupos_en
  from flota.sesion_servicio s
  join flota.vehiculo v on v.id = s.vehiculo_id
  left join flota.posicion p on p.sesion_id = s.id
  where s.fin is null and (not flota.es_publico(v.tipo) or v.estado_verificacion = 'verificado');

-- ===== Eventos de servicio (los genera el servidor; nunca el pasajero) =====
create table flota.evento_servicio (
  id bigint generated always as identity primary key,
  tipo text not null check (tipo in ('inicio', 'disponible', 'en_punto_salida', 'en_recorrido', 'completo', 'fuera_servicio', 'fin')),
  sesion_id uuid not null,
  vehiculo_tipo flota.tipo_vehiculo not null,
  recorrido_id text,
  sentido text,
  cupos int,
  creado_en timestamptz not null default now()
);
create index evento_reciente_idx on flota.evento_servicio (creado_en desc);
alter table flota.evento_servicio enable row level security;
create policy eventos_recientes on flota.evento_servicio for select using (creado_en > now() - interval '6 hours');
grant select on flota.evento_servicio to anon, authenticated;

create or replace function flota.registrar_evento() returns trigger language plpgsql security definer set search_path = '' as $$
declare v record; t text;
begin
  select ve.tipo, ve.recorrido_id, ve.estado_verificacion into v from flota.vehiculo ve where ve.id = new.vehiculo_id;
  -- solo vehículos que el público puede ver (verificados si son de transporte público)
  if flota.es_publico(v.tipo) and v.estado_verificacion <> 'verificado' then return new; end if;
  if tg_op = 'INSERT' then t := 'inicio';
  elsif new.fin is not null and old.fin is null then t := 'fin';
  elsif new.estado is distinct from old.estado then t := new.estado;
  else return new; end if;
  insert into flota.evento_servicio (tipo, sesion_id, vehiculo_tipo, recorrido_id, sentido, cupos)
  values (t, new.id, v.tipo, v.recorrido_id, new.sentido, case when new.cupos_en > now() - interval '10 minutes' then new.cupos end);
  return new;
end $$;
create trigger evento_sesion after insert or update of estado, fin on flota.sesion_servicio
  for each row execute function flota.registrar_evento();

-- ===== Reportes comunitarios =====
create table reporte_comunitario (
  id bigint generated always as identity primary key,
  autor uuid not null default auth.uid(),
  tipo text not null check (tipo in ('en_locomocion', 'vi_pasar', 'esperando')),
  modo text not null check (modo in ('bus', 'colectivo')),
  origen text references localidad(id),
  destino text references localidad(id),
  recorrido_id text references recorrido(id),
  lat numeric(7,3),     -- redondeado (~100 m); nunca la ubicación exacta
  lng numeric(7,3),
  creado_en timestamptz not null default now(),
  vence_en timestamptz not null default now() + interval '20 minutes'
);
create index reporte_vigente_idx on reporte_comunitario (destino, vence_en);
alter table reporte_comunitario enable row level security;
create policy autor_ve_sus_reportes on reporte_comunitario for select to authenticated using (autor = auth.uid());
grant select on reporte_comunitario to authenticated;

-- Enviar un reporte: máximo 1 cada 2 minutos por identidad; la ubicación se redondea
create or replace function reportar_locomocion(p_tipo text, p_modo text, p_origen text, p_destino text, p_lat double precision default null, p_lng double precision default null, p_recorrido text default null)
returns bigint language plpgsql security definer set search_path = public as $$
declare nid bigint;
begin
  if auth.uid() is null then raise exception 'Se necesita una identidad para reportar'; end if;
  if exists (select 1 from reporte_comunitario where autor = auth.uid() and creado_en > now() - interval '2 minutes') then
    raise exception 'Ya enviaste un aviso hace poco. Espera 2 minutos.'; end if;
  if p_lat is not null and (p_lat not between -56 and -17 or p_lng not between -76 and -66) then raise exception 'Ubicación fuera de Chile'; end if;
  insert into reporte_comunitario (tipo, modo, origen, destino, recorrido_id, lat, lng)
  values (p_tipo, p_modo, p_origen, nullif(p_destino, 'nose'), p_recorrido, round(p_lat::numeric, 3), round(p_lng::numeric, 3))
  returning id into nid;
  return nid;
end $$;

-- Lectura pública agregada: cuántas personas distintas reportaron; ubicación solo con 3 o más reportes compatibles
create or replace function reportes_recientes(p_destino text default null, p_minutos int default 20)
returns table (modo text, destino text, tipo text, personas int, ultimo timestamptz, lat numeric, lng numeric, respaldado boolean)
language sql stable security definer set search_path = public as $$
  with r as (
    select modo, destino, tipo, autor, creado_en, lat, lng from reporte_comunitario
    where vence_en > now() and creado_en > now() - make_interval(mins => least(greatest(p_minutos, 5), 60))
      and (p_destino is null or destino = p_destino)),
  g as (
    select modo, destino, case when tipo = 'esperando' then 'esperando' else 'locomocion' end as tipo,
           count(distinct autor)::int as personas, max(creado_en) as ultimo,
           round(avg(lat), 3) as lat, round(avg(lng), 3) as lng,
           -- compatibles: misma zona (~1,5 km entre extremos)
           (max(lat) - min(lat) < 0.015 and max(lng) - min(lng) < 0.015) as cerca
    from r group by 1, 2, 3)
  select modo, destino, tipo, personas, ultimo,
         case when personas >= 3 and cerca and tipo <> 'esperando' then lat end,
         case when personas >= 3 and cerca and tipo <> 'esperando' then lng end,
         personas >= 3 and coalesce(cerca, false)
  from g $$;
grant execute on function reportar_locomocion(text, text, text, text, double precision, double precision, text) to authenticated;
grant execute on function reportes_recientes(text, int) to anon, authenticated;

-- ===== Alertas, preferencias, historial y push del pasajero (identidad anónima, cada uno ve lo suyo) =====
create table alerta_pasajero (
  id uuid primary key default gen_random_uuid(),
  usuario_id uuid not null default auth.uid(),
  origen text not null references localidad(id),
  destino text not null references localidad(id),
  abordaje_lugar text references lugar(id),
  modos text[] not null default '{bus,colectivo}',
  anticipacion_min int not null default 10 check (anticipacion_min between 2 and 60),
  salida_id bigint references salida(id) on delete set null,     -- recordatorio de una salida programada
  activa boolean not null default true,
  silenciada_hasta timestamptz,
  creada_en timestamptz not null default now(),
  vence_en timestamptz not null default now() + interval '3 hours'
);
create unique index una_alerta_por_trayecto on alerta_pasajero (usuario_id, origen, destino) where activa;

create table preferencia_pasajero (
  usuario_id uuid primary key default auth.uid(),
  modos text[] not null default '{bus,colectivo}',
  destinos_frecuentes text[] not null default '{}',
  silencio_desde time,
  silencio_hasta time,
  actualizado_en timestamptz not null default now()
);

create table notificacion (
  id bigint generated always as identity primary key,
  usuario_id uuid not null default auth.uid(),
  alerta_id uuid references alerta_pasajero(id) on delete set null,
  clave text not null,                 -- evita repetir el mismo aviso (vehículo, salida o evento)
  tipo text not null,
  texto text not null,
  canal text not null default 'app' check (canal in ('app', 'push')),
  estado text not null default 'mostrada' check (estado in ('pendiente', 'enviada', 'mostrada', 'fallida', 'descartada')),
  creado_en timestamptz not null default now(),
  unique (usuario_id, clave, canal)
);

create table suscripcion_push (
  id uuid primary key default gen_random_uuid(),
  usuario_id uuid not null default auth.uid(),
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  user_agent text,
  creada_en timestamptz not null default now(),
  vence_en timestamptz not null default now() + interval '90 days'
);

do $$ declare t text; begin
  foreach t in array array['alerta_pasajero', 'preferencia_pasajero', 'notificacion', 'suscripcion_push'] loop
    execute format('alter table %I enable row level security', t);
    execute format('create policy propio on %I for all to authenticated using (usuario_id = auth.uid()) with check (usuario_id = auth.uid())', t);
    execute format('grant select, insert, update, delete on %I to authenticated', t);
  end loop; end $$;
grant usage on all sequences in schema public to authenticated;
