-- VAMO · Mi rendimiento y Mi flota (etapa 5) + plan VAMO Conductor (etapa 6).
-- Solo agrega tablas, columnas y funciones. No borra datos.
-- Kilómetros: se suman en el servidor a partir de las posiciones que el conductor ya comparte con permiso.
-- No se guarda el trayecto completo: solo el último punto usado para medir y los totales.

-- ===== Medición de kilómetros por sesión =====
alter table flota.sesion_servicio
  add column if not exists km_gps numeric(9,3) not null default 0,
  add column if not exists puntos_ok int not null default 0,
  add column if not exists puntos_descartados int not null default 0,
  add column if not exists brechas int not null default 0;

create table if not exists flota.medicion (            -- último punto aceptado para medir (se borra al finalizar)
  sesion_id uuid primary key references flota.sesion_servicio(id) on delete cascade,
  punto extensions.geography(point) not null,
  en timestamptz not null default now()
);
alter table flota.medicion enable row level security;   -- sin políticas: solo funciones del servidor

-- Vueltas (bus/colectivo) y viajes (taxi/auto). con_pasajeros solo para viajes; en buses no se supone.
create table if not exists flota.tramo (
  id bigint generated always as identity primary key,
  sesion_id uuid not null references flota.sesion_servicio(id) on delete cascade,
  vehiculo_id uuid not null references flota.vehiculo(id),
  conductor_id uuid not null,
  tipo text not null check (tipo in ('vuelta', 'viaje')),
  recorrido_id text references public.recorrido(id),
  sentido text,
  variante text not null default '',
  con_pasajeros boolean,
  inicio timestamptz not null default now(),
  fin timestamptz,
  km_gps numeric(9,3) not null default 0,
  puntos_ok int not null default 0,
  puntos_descartados int not null default 0,
  brechas int not null default 0,
  ingreso int check (ingreso is null or ingreso >= 0),
  estado text not null default 'en_curso' check (estado in ('en_curso', 'cerrado', 'anulado'))
);
create unique index if not exists tramo_abierto_unico on flota.tramo (sesion_id) where estado = 'en_curso';
create index if not exists tramo_vehiculo_inicio on flota.tramo (vehiculo_id, inicio desc);
alter table flota.tramo enable row level security;
create policy tramo_propio on flota.tramo for select to authenticated using (conductor_id = auth.uid() or flota.es_dueno(vehiculo_id) or flota.es_admin());
grant select on flota.tramo to authenticated;

-- Distancia de referencia por recorrido, sentido y variante. Versionada por fecha; nunca se inventa:
-- la carga el equipo VAMO (propietario_id nulo, vale para todos) o el dueño para su flota.
create table if not exists flota.distancia_referencia (
  id bigint generated always as identity primary key,
  recorrido_id text not null references public.recorrido(id),
  sentido text not null,
  variante text not null default '',
  km numeric(7,2) not null check (km > 0 and km < 2000),
  tolerancia_pct numeric(4,1) not null default 5 check (tolerancia_pct > 0 and tolerancia_pct <= 50),
  vigente_desde date not null default current_date,
  propietario_id uuid references flota.propietario(id),
  fuente text,
  creado_por uuid default auth.uid(),
  creado_en timestamptz not null default now()
);
alter table flota.distancia_referencia enable row level security;
create policy referencia_lectura on flota.distancia_referencia for select to authenticated using (true);
create policy referencia_alta on flota.distancia_referencia for insert to authenticated with check (
  (propietario_id is null and flota.es_admin()) or propietario_id in (select id from flota.propietario where usuario_id = auth.uid()));
grant select, insert on flota.distancia_referencia to authenticated;

-- ===== Gastos, ingresos y mantenciones (los registra el dueño o un conductor autorizado) =====
create table if not exists flota.gasto (
  id bigint generated always as identity primary key,
  vehiculo_id uuid not null references flota.vehiculo(id),
  usuario_id uuid not null default auth.uid(),
  fecha date not null default current_date,
  tipo text not null check (tipo in ('combustible', 'peaje', 'mantencion', 'lavado', 'estacionamiento', 'multa', 'otro')),
  monto int not null check (monto >= 0 and monto < 100000000),
  litros numeric(7,2) check (litros is null or litros > 0),
  estanque_lleno boolean,
  odometro int check (odometro is null or odometro >= 0),
  nota text check (char_length(nota) <= 200),
  creado_en timestamptz not null default now()
);
create table if not exists flota.ingreso (
  id bigint generated always as identity primary key,
  vehiculo_id uuid not null references flota.vehiculo(id),
  usuario_id uuid not null default auth.uid(),
  fecha date not null default current_date,
  origen text not null default 'otro' check (origen in ('vueltas', 'viajes', 'delivery', 'otro')),
  monto int not null check (monto >= 0 and monto < 100000000),
  pasajeros int check (pasajeros is null or pasajeros >= 0),
  nota text check (char_length(nota) <= 200),
  creado_en timestamptz not null default now()
);
create table if not exists flota.mantencion (
  id bigint generated always as identity primary key,
  vehiculo_id uuid not null references flota.vehiculo(id),
  tipo text not null check (char_length(tipo) between 2 and 60),
  cada_km int check (cada_km is null or cada_km > 0),
  cada_dias int check (cada_dias is null or cada_dias > 0),
  ultimo_km int,
  ultima_fecha date,
  nota text,
  activo boolean not null default true,
  creado_en timestamptz not null default now(),
  check (cada_km is not null or cada_dias is not null)
);
do $$ declare t text; begin
  foreach t in array array['gasto', 'ingreso'] loop
    execute format('alter table flota.%I enable row level security', t);
    execute format('create policy ver_%s on flota.%I for select to authenticated using (usuario_id = auth.uid() or flota.es_dueno(vehiculo_id))', t, t);
    execute format('create policy alta_%s on flota.%I for insert to authenticated with check (usuario_id = auth.uid() and (flota.es_dueno(vehiculo_id) or flota.es_conductor(vehiculo_id)))', t, t);
    execute format('create policy borrar_%s on flota.%I for delete to authenticated using (usuario_id = auth.uid() or flota.es_dueno(vehiculo_id))', t, t);
    execute format('grant select, insert, delete on flota.%I to authenticated', t);
  end loop;
end $$;
alter table flota.mantencion enable row level security;
create policy ver_mantencion on flota.mantencion for select to authenticated using (flota.es_dueno(vehiculo_id) or flota.es_conductor(vehiculo_id));
create policy gestiona_mantencion on flota.mantencion for all to authenticated using (flota.es_dueno(vehiculo_id)) with check (flota.es_dueno(vehiculo_id));
grant select, insert, update, delete on flota.mantencion to authenticated;

-- ===== Funciones de medición =====
-- Filtros de calidad: precisión > 50 m, saltos a más de 140 km/h y lecturas a menos de 3 s se descartan;
-- movimientos menores a 15 m se ignoran (ruido del GPS parado); pausas de más de 5 min cuentan como brecha.
create or replace function flota.medir(s uuid, p extensions.geography, precision_m double precision) returns void
language plpgsql security definer set search_path = '' as $$
declare m flota.medicion; d double precision; dt double precision; brecha boolean := false;
begin
  if not exists (select 1 from flota.sesion_servicio where id = s and fin is null and conductor_id = auth.uid() and consentimiento_gps_en is not null) then
    raise exception 'Sin sesión activa con ubicación autorizada';
  end if;
  if precision_m is not null and precision_m > 50 then
    update flota.sesion_servicio set puntos_descartados = puntos_descartados + 1 where id = s;
    update flota.tramo set puntos_descartados = puntos_descartados + 1 where sesion_id = s and estado = 'en_curso';
    return;
  end if;
  select * into m from flota.medicion where sesion_id = s;
  if m.sesion_id is null then insert into flota.medicion (sesion_id, punto) values (s, p); return; end if;
  d := extensions.st_distance(m.punto, p); dt := extract(epoch from now() - m.en);
  if dt < 3 then return; end if;
  if d / dt * 3.6 > 140 then
    update flota.sesion_servicio set puntos_descartados = puntos_descartados + 1 where id = s;
    update flota.tramo set puntos_descartados = puntos_descartados + 1 where sesion_id = s and estado = 'en_curso';
    return;
  end if;
  if d < 15 then update flota.medicion set en = case when dt > 300 then now() else en end where sesion_id = s; return; end if;
  brecha := dt > 300;
  update flota.medicion set punto = p, en = now() where sesion_id = s;
  update flota.sesion_servicio set km_gps = km_gps + d / 1000, puntos_ok = puntos_ok + 1, brechas = brechas + brecha::int where id = s;
  update flota.tramo set km_gps = km_gps + d / 1000, puntos_ok = puntos_ok + 1, brechas = brechas + brecha::int where sesion_id = s and estado = 'en_curso';
end $$;

-- reportar_posicion (misma firma) ahora también mide kilómetros. La app no envía lecturas con precisión peor que 50 m.
create or replace function flota.reportar_posicion(s uuid, lat double precision, lng double precision) returns void
language plpgsql security definer set search_path = '' as $$
declare p extensions.geography;
begin
  if not exists (select 1 from flota.sesion_servicio where id = s and fin is null and conductor_id = auth.uid() and consentimiento_gps_en is not null) then
    raise exception 'Sin sesión activa con ubicación autorizada';
  end if;
  if lat not between -90 and 90 or lng not between -180 and 180 then raise exception 'Coordenadas inválidas'; end if;
  p := extensions.st_setsrid(extensions.st_makepoint(lng, lat), 4326)::extensions.geography;
  insert into flota.posicion (sesion_id, punto, actualizado_en) values (s, p, now())
    on conflict (sesion_id) do update set punto = excluded.punto, actualizado_en = now();
  perform flota.medir(s, p, null);
end $$;

-- Abrir una vuelta o un viaje: cierra el que estuviera abierto en la sesión.
create or replace function flota.iniciar_tramo(s uuid, con_pasajeros boolean default null, variante text default '') returns bigint
language plpgsql security definer set search_path = '' as $$
declare se flota.sesion_servicio; ve flota.vehiculo; t bigint;
begin
  select * into se from flota.sesion_servicio where id = s and fin is null and conductor_id = auth.uid();
  if se.id is null then raise exception 'No hay una sesión activa tuya con ese id'; end if;
  select * into ve from flota.vehiculo where id = se.vehiculo_id;
  update flota.tramo set estado = 'cerrado', fin = now() where sesion_id = s and estado = 'en_curso';
  insert into flota.tramo (sesion_id, vehiculo_id, conductor_id, tipo, recorrido_id, sentido, variante, con_pasajeros)
    values (s, se.vehiculo_id, auth.uid(), case when ve.tipo in ('bus', 'colectivo') then 'vuelta' else 'viaje' end,
            case when ve.tipo in ('bus', 'colectivo') then ve.recorrido_id end, se.sentido, coalesce(variante, ''),
            case when ve.tipo in ('bus', 'colectivo') then null else coalesce(con_pasajeros, true) end)
    returning id into t;
  return t;
end $$;

create or replace function flota.cerrar_tramo(s uuid, ingreso int default null, anular boolean default false) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if ingreso is not null and (ingreso < 0 or ingreso > 10000000) then raise exception 'Monto fuera de rango'; end if;
  update flota.tramo set estado = case when anular then 'anulado' else 'cerrado' end, fin = now(), ingreso = cerrar_tramo.ingreso
    where sesion_id = s and estado = 'en_curso' and conductor_id = auth.uid();
  if not found then raise exception 'No hay una vuelta o viaje en curso'; end if;
end $$;
grant execute on function flota.iniciar_tramo(uuid, boolean, text), flota.cerrar_tramo(uuid, int, boolean) to authenticated;

-- Al cambiar de sentido con una vuelta en curso, se cierra y comienza la siguiente en el nuevo sentido.
create or replace function flota.cambiar_sentido(s uuid, sentido text) returns void language plpgsql security definer set search_path = '' as $$
declare abierta boolean;
begin
  update flota.sesion_servicio set sentido = cambiar_sentido.sentido where id = s and fin is null and conductor_id = auth.uid();
  if not found then raise exception 'No hay una sesión activa tuya con ese id'; end if;
  select exists (select 1 from flota.tramo where sesion_id = s and estado = 'en_curso' and tipo = 'vuelta') into abierta;
  if abierta then perform flota.iniciar_tramo(s); end if;
end $$;

-- Al finalizar el servicio se cierran los tramos y se borra el punto de medición.
create or replace function flota.finalizar_servicio(s uuid) returns void language plpgsql security definer set search_path = '' as $$
begin
  update flota.sesion_servicio set fin = now() where id = s and fin is null and conductor_id = auth.uid();
  if not found then raise exception 'No hay una sesión activa tuya con ese id'; end if;
  update flota.tramo set estado = 'cerrado', fin = now() where sesion_id = s and estado = 'en_curso';
  delete from flota.posicion where sesion_id = s;
  delete from flota.medicion where sesion_id = s;
end $$;

create or replace function flota.detener_ubicacion(s uuid) returns void language plpgsql security definer set search_path = '' as $$
begin
  update flota.sesion_servicio set consentimiento_gps_en = null where id = s and fin is null and conductor_id = auth.uid();
  if not found then raise exception 'No hay una sesión activa tuya con ese id'; end if;
  delete from flota.posicion where sesion_id = s;
  delete from flota.medicion where sesion_id = s;
end $$;

-- Jornadas (sesiones) visibles para su conductor y para el dueño del vehículo
create policy sesion_dueno_lee on flota.sesion_servicio for select to authenticated using (flota.es_dueno(vehiculo_id));

-- ===== Plan VAMO Conductor: prueba de 2 meses y pagos registrados a mano. Sin cobros automáticos. =====
create table if not exists flota.suscripcion (
  id uuid primary key default gen_random_uuid(),
  usuario_id uuid not null unique default auth.uid(),
  plan text not null default 'conductor' check (plan in ('conductor')),
  periodo text check (periodo in ('mensual', 'anual')),
  estado text not null default 'prueba' check (estado in ('prueba', 'activa', 'vencida', 'cancelada')),
  prueba_hasta date,
  vigente_hasta date,
  cancelada_en timestamptz,
  creado_en timestamptz not null default now()
);
create table if not exists flota.pago_manual (
  id bigint generated always as identity primary key,
  suscripcion_id uuid not null references flota.suscripcion(id),
  monto int not null check (monto > 0),
  periodo text not null check (periodo in ('mensual', 'anual')),
  medio text not null check (medio in ('transferencia', 'efectivo', 'otro')),
  referencia text check (char_length(referencia) <= 80),
  pagado_en date not null default current_date,
  registrado_por uuid not null default auth.uid(),
  creado_en timestamptz not null default now()
);
alter table flota.suscripcion enable row level security;
alter table flota.pago_manual enable row level security;
create policy suscripcion_propia on flota.suscripcion for select to authenticated using (usuario_id = auth.uid() or flota.es_admin());
create policy pago_propio on flota.pago_manual for select to authenticated using (flota.es_admin() or suscripcion_id in (select id from flota.suscripcion where usuario_id = auth.uid()));
grant select on flota.suscripcion, flota.pago_manual to authenticated;

create or replace function flota.estado_plan() returns jsonb language plpgsql security definer set search_path = '' as $$
declare su flota.suscripcion;
begin
  select * into su from flota.suscripcion where usuario_id = auth.uid();
  if su.id is null then return jsonb_build_object('estado', 'sin_plan'); end if;
  if su.estado = 'prueba' and su.prueba_hasta < current_date then update flota.suscripcion set estado = 'vencida' where id = su.id returning * into su; end if;
  if su.estado = 'activa' and su.vigente_hasta < current_date then update flota.suscripcion set estado = 'vencida' where id = su.id returning * into su; end if;
  return to_jsonb(su);
end $$;

create or replace function flota.iniciar_prueba() returns jsonb language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then raise exception 'Sin identidad'; end if;
  if exists (select 1 from flota.suscripcion where usuario_id = auth.uid()) then raise exception 'La prueba gratuita se usa una sola vez'; end if;
  insert into flota.suscripcion (usuario_id, estado, prueba_hasta) values (auth.uid(), 'prueba', (current_date + interval '2 months')::date);
  return flota.estado_plan();
end $$;

create or replace function flota.cancelar_plan() returns jsonb language plpgsql security definer set search_path = '' as $$
begin
  update flota.suscripcion set estado = 'cancelada', cancelada_en = now() where usuario_id = auth.uid() and estado in ('prueba', 'activa');
  if not found then raise exception 'No tienes un plan activo'; end if;
  return flota.estado_plan();
end $$;

-- Solo el equipo VAMO registra un pago recibido (transferencia o efectivo). Extiende la vigencia; no cobra nada.
create or replace function flota.registrar_pago(u_prefijo text, periodo text, monto int, medio text, referencia text default null) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare su flota.suscripcion; uid uuid; n int;
begin
  if not flota.es_admin() then raise exception 'Solo el equipo VAMO'; end if;
  if periodo not in ('mensual', 'anual') then raise exception 'Periodo inválido'; end if;
  if char_length(coalesce(u_prefijo, '')) < 8 or u_prefijo !~ '^[0-9a-fA-F-]+$' then raise exception 'Identificador inválido (8 caracteres)'; end if;
  select count(*), min(id::text)::uuid into n, uid from auth.users where id::text like lower(u_prefijo) || '%';
  if n <> 1 then raise exception 'El identificador no corresponde a una sola persona (%)', n; end if;
  select * into su from flota.suscripcion where usuario_id = uid;
  if su.id is null then insert into flota.suscripcion (usuario_id, estado) values (uid, 'activa') returning * into su; end if;
  insert into flota.pago_manual (suscripcion_id, monto, periodo, medio, referencia) values (su.id, monto, periodo, medio, referencia);
  update flota.suscripcion set estado = 'activa', periodo = registrar_pago.periodo, cancelada_en = null,
    vigente_hasta = (greatest(coalesce(vigente_hasta, current_date), coalesce(prueba_hasta, current_date), current_date)
                     + case when registrar_pago.periodo = 'anual' then interval '1 year' else interval '1 month' end)::date
    where id = su.id returning * into su;
  return to_jsonb(su);
end $$;
grant execute on function flota.estado_plan(), flota.iniciar_prueba(), flota.cancelar_plan(), flota.registrar_pago(text, text, int, text, text) to authenticated;
