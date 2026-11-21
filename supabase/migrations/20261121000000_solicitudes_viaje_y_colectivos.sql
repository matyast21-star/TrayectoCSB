-- VAMO · Solicitudes de viaje reales para taxis y autos + pasajeros esperando colectivo + aviso «disponible con N cupos».
-- Solo aditiva: tablas y funciones nuevas en el esquema flota. No cambia tablas existentes (public.viaje / public.oferta
-- siguen intactas; esas apuntan a la flota antigua de ejemplo, no a los conductores reales de flota.vehiculo).
--
-- Permisos:
--   · Las tablas nuevas tienen RLS. Nadie escribe directo: todo pasa por funciones security definer que validan quién llama.
--   · El pasajero ve solo sus solicitudes y sus esperas. El conductor ve solicitudes solo mientras tiene una sesión activa
--     de taxi o auto (función solicitudes_cercanas), y esperas de colectivo solo con sesión activa de colectivo.
--   · La ubicación del pasajero que espera colectivo se guarda redondeada (~100 m).
set search_path = public, extensions;

-- ===== Solicitudes de viaje (taxi / auto) =====
create table flota.solicitud_viaje (
  id uuid primary key default gen_random_uuid(),
  pasajero_id uuid not null default auth.uid(),
  tipo flota.tipo_vehiculo not null check (tipo in ('taxi', 'auto')),
  origen geography(point, 4326) not null,
  origen_texto text not null check (length(origen_texto) <= 120),
  destino geography(point, 4326) not null,
  destino_texto text not null check (length(destino_texto) <= 120),
  distancia_km numeric(6, 1),
  precio_ref int check (precio_ref between 0 and 500000),
  estado text not null default 'buscando' check (estado in ('buscando', 'tomada', 'llego', 'en_viaje', 'finalizada', 'cancelada', 'vencida')),
  sesion_id uuid references flota.sesion_servicio(id),
  vehiculo_id uuid references flota.vehiculo(id),
  conductor_id uuid,
  precio_final int,
  eta_min int,
  cancelada_por text check (cancelada_por in ('pasajero', 'conductor')),
  creada_en timestamptz not null default now(),
  vence_en timestamptz not null default now() + interval '3 minutes',
  tomada_en timestamptz,
  estado_en timestamptz not null default now()
);
create index solicitud_buscando_idx on flota.solicitud_viaje (tipo, vence_en) where estado = 'buscando';
create index solicitud_pasajero_idx on flota.solicitud_viaje (pasajero_id, creada_en desc);
create index solicitud_sesion_idx on flota.solicitud_viaje (sesion_id) where sesion_id is not null;

-- Respuesta de cada conductor: rechazo o contraoferta (solo autos). Aceptar no deja fila: asigna la solicitud.
create table flota.respuesta_solicitud (
  solicitud_id uuid not null references flota.solicitud_viaje(id) on delete cascade,
  sesion_id uuid not null references flota.sesion_servicio(id) on delete cascade,
  conductor_id uuid not null,
  respuesta text not null check (respuesta in ('rechazada', 'propuesta')),
  precio int check (precio between 500 and 500000),
  eta_min int,
  creada_en timestamptz not null default now(),
  primary key (solicitud_id, sesion_id)
);

alter table flota.solicitud_viaje enable row level security;
alter table flota.respuesta_solicitud enable row level security;
create policy sol_pasajero on flota.solicitud_viaje for select to authenticated using (pasajero_id = auth.uid());
create policy sol_conductor_asignado on flota.solicitud_viaje for select to authenticated using (conductor_id = auth.uid());
create policy resp_propia on flota.respuesta_solicitud for select to authenticated using (conductor_id = auth.uid());
revoke all on flota.solicitud_viaje, flota.respuesta_solicitud from anon, authenticated;
grant select on flota.solicitud_viaje, flota.respuesta_solicitud to authenticated;
grant all on flota.solicitud_viaje, flota.respuesta_solicitud to service_role;

-- Sesión activa del que llama, con su vehículo
create or replace function flota.mi_sesion_activa(s uuid) returns table (sesion_id uuid, vehiculo_id uuid, tipo flota.tipo_vehiculo, punto geography, posicion_en timestamptz)
language sql stable security definer set search_path = '' as $$
  select ss.id, ve.id, ve.tipo, p.punto, p.actualizado_en
  from flota.sesion_servicio ss join flota.vehiculo ve on ve.id = ss.vehiculo_id
  left join flota.posicion p on p.sesion_id = ss.id
  where ss.id = s and ss.fin is null and ss.conductor_id = auth.uid() $$;

-- Pasajero pide un viaje. Una sola solicitud abierta por persona.
create or replace function flota.crear_solicitud(p_tipo text, o_lat double precision, o_lng double precision, o_texto text,
  d_lat double precision, d_lng double precision, d_texto text, p_km numeric default null, p_precio int default null) returns uuid
language plpgsql security definer set search_path = '' as $$
declare nid uuid;
begin
  if auth.uid() is null then raise exception 'Se necesita una identidad para pedir un viaje'; end if;
  if p_tipo not in ('taxi', 'auto') then raise exception 'Tipo de viaje no válido'; end if;
  if o_lat not between -56 and -17 or o_lng not between -76 and -66 or d_lat not between -56 and -17 or d_lng not between -76 and -66 then raise exception 'Ubicación fuera de Chile'; end if;
  update flota.solicitud_viaje set estado = 'cancelada', cancelada_por = 'pasajero', estado_en = now()
    where pasajero_id = auth.uid() and estado = 'buscando';
  if exists (select 1 from flota.solicitud_viaje where pasajero_id = auth.uid() and estado in ('tomada', 'llego', 'en_viaje') and creada_en > now() - interval '4 hours') then
    raise exception 'Ya tienes un viaje en curso'; end if;
  if (select count(*) from flota.solicitud_viaje where pasajero_id = auth.uid() and creada_en > now() - interval '10 minutes') >= 6 then
    raise exception 'Pediste muchos viajes seguidos. Espera unos minutos.'; end if;
  insert into flota.solicitud_viaje (tipo, origen, origen_texto, destino, destino_texto, distancia_km, precio_ref)
  values (p_tipo::flota.tipo_vehiculo,
    extensions.st_setsrid(extensions.st_makepoint(o_lng, o_lat), 4326)::extensions.geography, left(coalesce(nullif(trim(o_texto), ''), 'Punto en el mapa'), 120),
    extensions.st_setsrid(extensions.st_makepoint(d_lng, d_lat), 4326)::extensions.geography, left(coalesce(nullif(trim(d_texto), ''), 'Punto en el mapa'), 120),
    round(p_km, 1), p_precio)
  returning id into nid;
  return nid;
end $$;

create or replace function flota.cancelar_solicitud(sol uuid) returns void language plpgsql security definer set search_path = '' as $$
begin
  update flota.solicitud_viaje set estado = 'cancelada', cancelada_por = 'pasajero', estado_en = now()
    where id = sol and pasajero_id = auth.uid() and estado in ('buscando', 'tomada', 'llego');
end $$;

-- Lo que ve el pasajero: su solicitud, el conductor asignado (patente y vehículo, sin datos personales) y contraofertas
create or replace function flota.mi_solicitud(sol uuid) returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'id', s.id, 'tipo', s.tipo, 'estado', case when s.estado = 'buscando' and s.vence_en < now() then 'vencida' else s.estado end,
    'precio_ref', s.precio_ref, 'precio_final', s.precio_final, 'eta_min', s.eta_min, 'vence_en', s.vence_en, 'tomada_en', s.tomada_en,
    'rechazos', (select count(*) from flota.respuesta_solicitud r where r.solicitud_id = s.id and r.respuesta = 'rechazada'),
    'vehiculo', case when ve.id is not null then jsonb_build_object('patente', ve.patente, 'marca_modelo', ve.marca_modelo, 'tipo', ve.tipo) end,
    'conductor_pos', case when p.actualizado_en > now() - interval '2 minutes' then jsonb_build_object('lat', extensions.st_y(p.punto::extensions.geometry), 'lng', extensions.st_x(p.punto::extensions.geometry)) end,
    'propuestas', coalesce((select jsonb_agg(jsonb_build_object('sesion', r.sesion_id, 'precio', r.precio, 'eta_min', r.eta_min, 'patente', v2.patente, 'marca_modelo', v2.marca_modelo) order by r.precio)
        from flota.respuesta_solicitud r join flota.sesion_servicio s2 on s2.id = r.sesion_id and s2.fin is null join flota.vehiculo v2 on v2.id = s2.vehiculo_id
        where r.solicitud_id = s.id and r.respuesta = 'propuesta' and s.estado = 'buscando'), '[]'::jsonb))
  from flota.solicitud_viaje s
  left join flota.vehiculo ve on ve.id = s.vehiculo_id
  left join flota.posicion p on p.sesion_id = s.sesion_id and s.estado in ('tomada', 'llego', 'en_viaje')
  where s.id = sol and s.pasajero_id = auth.uid() $$;

-- Lo que ve el conductor con jornada iniciada: solicitudes abiertas de su tipo, cercanas (6 km) si comparte ubicación,
-- que aún no respondió. Sin GPS ve las de su tipo (la distancia al pasajero queda vacía).
create or replace function flota.solicitudes_cercanas(s uuid) returns table (id uuid, tipo flota.tipo_vehiculo, origen_texto text, destino_texto text,
  o_lat double precision, o_lng double precision, d_lat double precision, d_lng double precision,
  distancia_km numeric, precio_ref int, km_al_pasajero numeric, min_al_pasajero int, creada_en timestamptz, vence_en timestamptz)
language sql stable security definer set search_path = '' as $$
  with yo as (select * from flota.mi_sesion_activa(s))
  select x.id, x.tipo, x.origen_texto, x.destino_texto,
    extensions.st_y(x.origen::extensions.geometry), extensions.st_x(x.origen::extensions.geometry),
    extensions.st_y(x.destino::extensions.geometry), extensions.st_x(x.destino::extensions.geometry),
    x.distancia_km, x.precio_ref,
    case when yo.punto is not null then round((extensions.st_distance(yo.punto, x.origen) / 1000 * 1.3)::numeric, 1) end,
    case when yo.punto is not null then greatest(1, ceil(extensions.st_distance(yo.punto, x.origen) / 1000 * 1.3 / 30 * 60))::int end,
    x.creada_en, x.vence_en
  from yo join flota.solicitud_viaje x on x.tipo = yo.tipo
  where x.estado = 'buscando' and x.vence_en > now()
    and (yo.punto is null or yo.posicion_en < now() - interval '5 minutes' or extensions.st_dwithin(yo.punto, x.origen, 6000))
    and not exists (select 1 from flota.respuesta_solicitud r where r.solicitud_id = x.id and r.sesion_id = yo.sesion_id)
    and not exists (select 1 from flota.solicitud_viaje o where o.sesion_id = yo.sesion_id and o.estado in ('tomada', 'llego', 'en_viaje'))
  order by x.creada_en $$;

-- Conductor responde: aceptar (el primero se lo lleva; el taxi pone su precio al aceptar), rechazar o proponer otro precio (solo autos)
create or replace function flota.responder_solicitud(s uuid, sol uuid, accion text, p_precio int default null, p_eta int default null) returns text
language plpgsql security definer set search_path = '' as $$
declare yo record; x flota.solicitud_viaje;
begin
  select * into yo from flota.mi_sesion_activa(s);
  if yo.sesion_id is null then raise exception 'Inicia tu jornada para responder solicitudes'; end if;
  select * into x from flota.solicitud_viaje where id = sol for update;
  if x.id is null or x.tipo <> yo.tipo then raise exception 'Solicitud no encontrada'; end if;
  if accion = 'rechazar' then
    insert into flota.respuesta_solicitud (solicitud_id, sesion_id, conductor_id, respuesta) values (sol, s, auth.uid(), 'rechazada')
      on conflict (solicitud_id, sesion_id) do update set respuesta = 'rechazada', precio = null;
    return 'rechazada';
  end if;
  if x.estado <> 'buscando' or x.vence_en < now() then
    if x.estado = 'cancelada' then raise exception 'El pasajero canceló la solicitud'; end if;
    raise exception 'Ya lo tomó otro conductor';
  end if;
  if exists (select 1 from flota.solicitud_viaje o where o.sesion_id = s and o.estado in ('tomada', 'llego', 'en_viaje')) then
    raise exception 'Ya tienes un viaje en curso'; end if;
  if accion = 'proponer' then
    if yo.tipo <> 'auto' then raise exception 'El taxi pone su precio al aceptar'; end if;
    if p_precio is null or p_precio < 500 then raise exception 'Indica un precio válido'; end if;
    insert into flota.respuesta_solicitud (solicitud_id, sesion_id, conductor_id, respuesta, precio, eta_min) values (sol, s, auth.uid(), 'propuesta', p_precio, p_eta)
      on conflict (solicitud_id, sesion_id) do update set respuesta = 'propuesta', precio = excluded.precio, eta_min = excluded.eta_min, creada_en = now();
    update flota.solicitud_viaje set vence_en = greatest(vence_en, now() + interval '90 seconds') where id = sol;
    return 'propuesta';
  end if;
  if accion <> 'aceptar' then raise exception 'Acción no válida'; end if;
  -- Taxi: el taxista pone el precio al aceptar (lo habitual es $2.500 dentro de la zona; fuera, su precio fijo)
  if yo.tipo = 'taxi' and (p_precio is null or p_precio not between 500 and 500000) then raise exception 'Indica tu precio para aceptar'; end if;
  update flota.solicitud_viaje set estado = 'tomada', sesion_id = s, vehiculo_id = yo.vehiculo_id, conductor_id = auth.uid(),
         precio_final = case when yo.tipo = 'taxi' then p_precio else precio_ref end, eta_min = coalesce(p_eta, eta_min), tomada_en = now(), estado_en = now()
   where id = sol and estado = 'buscando';
  return 'tomada';
end $$;

-- Pasajero elige una contraoferta (si el conductor sigue libre)
create or replace function flota.elegir_propuesta(sol uuid, s uuid) returns void language plpgsql security definer set search_path = '' as $$
declare r flota.respuesta_solicitud; ve uuid;
begin
  select * into r from flota.respuesta_solicitud where solicitud_id = sol and sesion_id = s and respuesta = 'propuesta';
  if r.solicitud_id is null then raise exception 'Esa oferta ya no está disponible'; end if;
  select vehiculo_id into ve from flota.sesion_servicio where id = s and fin is null;
  if ve is null or exists (select 1 from flota.solicitud_viaje o where o.sesion_id = s and o.estado in ('tomada', 'llego', 'en_viaje')) then
    raise exception 'Ese conductor ya tomó otro viaje. Elige otra oferta.'; end if;
  update flota.solicitud_viaje set estado = 'tomada', sesion_id = s, vehiculo_id = ve, conductor_id = r.conductor_id,
         precio_final = r.precio, eta_min = r.eta_min, tomada_en = now(), estado_en = now()
   where id = sol and pasajero_id = auth.uid() and estado = 'buscando';
  if not found then raise exception 'La solicitud ya no está abierta'; end if;
end $$;

-- Viaje en curso del conductor y avance de estado
create or replace function flota.mi_viaje_en_curso(s uuid) returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object('id', x.id, 'tipo', x.tipo, 'estado', x.estado, 'origen_texto', x.origen_texto, 'destino_texto', x.destino_texto,
    'o_lat', extensions.st_y(x.origen::extensions.geometry), 'o_lng', extensions.st_x(x.origen::extensions.geometry),
    'd_lat', extensions.st_y(x.destino::extensions.geometry), 'd_lng', extensions.st_x(x.destino::extensions.geometry),
    'distancia_km', x.distancia_km, 'precio_final', x.precio_final, 'tomada_en', x.tomada_en)
  from flota.solicitud_viaje x
  where x.sesion_id = s and x.conductor_id = auth.uid() and (x.estado in ('tomada', 'llego', 'en_viaje') or (x.estado = 'cancelada' and x.estado_en > now() - interval '2 minutes'))
  order by x.tomada_en desc limit 1 $$;

create or replace function flota.avanzar_viaje(sol uuid, e text) returns void language plpgsql security definer set search_path = '' as $$
declare x flota.solicitud_viaje;
begin
  select * into x from flota.solicitud_viaje where id = sol and conductor_id = auth.uid() for update;
  if x.id is null then raise exception 'Viaje no encontrado'; end if;
  if not ((x.estado = 'tomada' and e in ('llego', 'cancelada')) or (x.estado = 'llego' and e in ('en_viaje', 'cancelada')) or (x.estado = 'en_viaje' and e = 'finalizada')) then
    raise exception 'Este viaje ya no puede pasar a ese estado'; end if;
  update flota.solicitud_viaje set estado = e, estado_en = now(), cancelada_por = case when e = 'cancelada' then 'conductor' end where id = sol;
end $$;

-- ===== Colectivos: pasajeros esperando (solo informativo) =====
create table flota.espera_colectivo (
  id uuid primary key default gen_random_uuid(),
  usuario_id uuid not null default auth.uid(),
  lugar_texto text not null check (length(lugar_texto) <= 80),
  lat numeric(7, 3) not null,     -- redondeado (~100 m)
  lng numeric(7, 3) not null,
  sentido text not null check (sentido in ('Hacia Valparaíso', 'Hacia Casablanca')),
  personas int not null default 1 check (personas between 1 and 4),
  creada_en timestamptz not null default now(),
  vence_en timestamptz not null default now() + interval '20 minutes',
  activa boolean not null default true
);
create unique index una_espera_por_persona on flota.espera_colectivo (usuario_id) where activa;
create index espera_vigente_idx on flota.espera_colectivo (vence_en) where activa;
alter table flota.espera_colectivo enable row level security;
create policy espera_propia on flota.espera_colectivo for select to authenticated using (usuario_id = auth.uid());
revoke all on flota.espera_colectivo from anon, authenticated;
grant select on flota.espera_colectivo to authenticated;
grant all on flota.espera_colectivo to service_role;

create or replace function flota.marcar_espera(p_lugar text, p_lat double precision, p_lng double precision, p_sentido text, p_personas int default 1) returns uuid
language plpgsql security definer set search_path = '' as $$
declare nid uuid;
begin
  if auth.uid() is null then raise exception 'Se necesita una identidad'; end if;
  if p_lat not between -56 and -17 or p_lng not between -76 and -66 then raise exception 'Ubicación fuera de Chile'; end if;
  if (select count(*) from flota.espera_colectivo where usuario_id = auth.uid() and creada_en > now() - interval '30 minutes') >= 6 then
    raise exception 'Marcaste muchas esperas seguidas. Espera unos minutos.'; end if;
  update flota.espera_colectivo set activa = false where usuario_id = auth.uid() and activa;
  insert into flota.espera_colectivo (lugar_texto, lat, lng, sentido, personas)
    values (left(coalesce(nullif(trim(p_lugar), ''), 'Punto en el mapa'), 80), round(p_lat::numeric, 3), round(p_lng::numeric, 3), p_sentido, greatest(1, least(4, coalesce(p_personas, 1))))
    returning id into nid;
  return nid;
end $$;

create or replace function flota.cancelar_espera() returns void language sql security definer set search_path = '' as $$
  update flota.espera_colectivo set activa = false where usuario_id = auth.uid() and activa $$;

-- Para el colectivero en servicio: esperas vigentes agrupadas por lugar y sentido (sin identificar a nadie)
create or replace function flota.esperas_colectivo(s uuid) returns table (lugar_texto text, lat numeric, lng numeric, sentido text, personas int, desde timestamptz, km numeric)
language sql stable security definer set search_path = '' as $$
  with yo as (select * from flota.mi_sesion_activa(s) where tipo = 'colectivo')
  select min(e.lugar_texto), e.lat, e.lng, e.sentido, sum(e.personas)::int, min(e.creada_en),
    case when (select punto from yo) is not null then round((extensions.st_distance((select punto from yo),
      extensions.st_setsrid(extensions.st_makepoint(e.lng::float8, e.lat::float8), 4326)::extensions.geography) / 1000)::numeric, 1) end
  from flota.espera_colectivo e
  where exists (select 1 from yo) and e.activa and e.vence_en > now()
  group by e.lat, e.lng, e.sentido
  order by min(e.creada_en) $$;

-- Para el pasajero: cuántos colectivos en servicio tienen cupos en su sentido (lo informa el conductor)
-- (los datos ya son públicos en flota.en_servicio; esta función no agrega nada nuevo)

-- ===== Colectivo: «Disponible con N cupos» (aviso que da el conductor) =====
create table flota.aviso_colectivo (
  id bigint generated always as identity primary key,
  sesion_id uuid not null references flota.sesion_servicio(id) on delete cascade,
  sentido text,
  cupos int not null check (cupos between 1 and 80),
  lugar_texto text check (length(lugar_texto) <= 80),
  creado_en timestamptz not null default now()
);
create index aviso_colectivo_reciente_idx on flota.aviso_colectivo (creado_en desc);
alter table flota.aviso_colectivo enable row level security;
create policy aviso_reciente on flota.aviso_colectivo for select using (creado_en > now() - interval '30 minutes');
revoke all on flota.aviso_colectivo from anon, authenticated;
grant select on flota.aviso_colectivo to anon, authenticated;
grant all on flota.aviso_colectivo to service_role;

create or replace function flota.avisar_disponible(s uuid, n int, p_lugar text default null) returns bigint
language plpgsql security definer set search_path = '' as $$
declare cap int; sen text; nid bigint;
begin
  select ve.capacidad, ss.sentido into cap, sen from flota.sesion_servicio ss join flota.vehiculo ve on ve.id = ss.vehiculo_id
    where ss.id = s and ss.fin is null and ss.conductor_id = auth.uid() and ve.tipo = 'colectivo'
      and (ve.estado_verificacion = 'verificado');
  if cap is null then raise exception 'Necesitas un colectivo verificado en servicio'; end if;
  if n < 1 or n > cap then raise exception 'Los cupos deben estar entre 1 y %', cap; end if;
  if exists (select 1 from flota.aviso_colectivo where sesion_id = s and creado_en > now() - interval '3 minutes') then
    raise exception 'Ya avisaste hace poco. Puedes volver a avisar en 3 minutos.'; end if;
  perform flota.actualizar_cupos(s, n);
  insert into flota.aviso_colectivo (sesion_id, sentido, cupos, lugar_texto) values (s, sen, n, left(nullif(trim(p_lugar), ''), 80)) returning id into nid;
  return nid;
end $$;

-- ===== Push inmediato (sin esperar el minuto de pg_cron) =====
-- Los disparadores llaman a la función «avisos-push» con el token interno. No se pueden llamar desde la API (devuelven trigger).
create or replace function flota.push_inmediato() returns trigger language plpgsql security definer set search_path = '' as $$
declare tok text; acc text; fila jsonb;
begin
  select valor into tok from flota.config_privada where clave = 'avisos_token';
  if tok is null then return new; end if;
  if tg_table_name = 'solicitud_viaje' then
    acc := 'solicitud';
    fila := jsonb_build_object('id', new.id, 'tipo', new.tipo, 'origen_texto', new.origen_texto, 'destino_texto', new.destino_texto,
      'distancia_km', new.distancia_km, 'precio_ref', new.precio_ref,
      'o_lat', extensions.st_y(new.origen::extensions.geometry), 'o_lng', extensions.st_x(new.origen::extensions.geometry));
  elsif tg_table_name = 'espera_colectivo' then
    acc := 'espera';
    fila := jsonb_build_object('id', new.id, 'lugar_texto', new.lugar_texto, 'sentido', new.sentido, 'personas', new.personas, 'lat', new.lat, 'lng', new.lng);
  else
    acc := 'cupos';
    fila := jsonb_build_object('id', new.id, 'sesion_id', new.sesion_id, 'sentido', new.sentido, 'cupos', new.cupos, 'lugar_texto', new.lugar_texto);
  end if;
  perform net.http_post(
    url := 'https://fryjiahvhjtuizgvtxtn.supabase.co/functions/v1/avisos-push',
    headers := jsonb_build_object('Content-Type', 'application/json'),
    body := jsonb_build_object('accion', acc, 'token', tok, 'fila', fila),
    timeout_milliseconds := 15000);
  return new;
exception when others then return new;   -- un aviso fallido nunca impide pedir el viaje
end $$;
create trigger push_solicitud after insert on flota.solicitud_viaje for each row execute function flota.push_inmediato();
create trigger push_espera after insert on flota.espera_colectivo for each row execute function flota.push_inmediato();
create trigger push_cupos after insert on flota.aviso_colectivo for each row execute function flota.push_inmediato();

-- ===== Permisos de funciones =====
revoke execute on function flota.mi_sesion_activa(uuid), flota.crear_solicitud(text, double precision, double precision, text, double precision, double precision, text, numeric, int),
  flota.cancelar_solicitud(uuid), flota.mi_solicitud(uuid), flota.solicitudes_cercanas(uuid), flota.responder_solicitud(uuid, uuid, text, int, int),
  flota.elegir_propuesta(uuid, uuid), flota.mi_viaje_en_curso(uuid), flota.avanzar_viaje(uuid, text),
  flota.marcar_espera(text, double precision, double precision, text, int), flota.cancelar_espera(), flota.esperas_colectivo(uuid),
  flota.avisar_disponible(uuid, int, text), flota.push_inmediato() from public, anon;
grant execute on function flota.crear_solicitud(text, double precision, double precision, text, double precision, double precision, text, numeric, int),
  flota.cancelar_solicitud(uuid), flota.mi_solicitud(uuid), flota.solicitudes_cercanas(uuid), flota.responder_solicitud(uuid, uuid, text, int, int),
  flota.elegir_propuesta(uuid, uuid), flota.mi_viaje_en_curso(uuid), flota.avanzar_viaje(uuid, text),
  flota.marcar_espera(text, double precision, double precision, text, int), flota.cancelar_espera(), flota.esperas_colectivo(uuid),
  flota.avisar_disponible(uuid, int, text) to authenticated;
revoke execute on function flota.mi_sesion_activa(uuid), flota.push_inmediato() from authenticated;
grant select on flota.config_privada to service_role;
