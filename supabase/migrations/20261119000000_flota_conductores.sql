-- VAMO · Conductores y dueños (etapas 2 a 6) en el esquema «flota».
-- Solo aditiva: no modifica ni borra nada del esquema public (solo lo referencia).
-- Se prueba primero en el proyecto vamo-desarrollo; a producción solo con autorización.

create schema if not exists flota;

create type flota.tipo_vehiculo as enum ('auto', 'taxi', 'colectivo', 'bus', 'moto');
create type flota.estado_verificacion as enum ('borrador', 'en_revision', 'verificado', 'rechazado', 'suspendido');
create type flota.estado_documento as enum ('pendiente', 'aprobado', 'rechazado');

-- Personas de VAMO que revisan documentos
create table flota.administrador (usuario_id uuid primary key);

-- Propietario (persona o empresa)
create table flota.propietario (
  id uuid primary key default gen_random_uuid(),
  usuario_id uuid not null unique,
  nombre text not null,
  creado_en timestamptz not null default now()
);

create table flota.vehiculo (
  id uuid primary key default gen_random_uuid(),
  propietario_id uuid not null references flota.propietario(id),
  tipo flota.tipo_vehiculo not null,
  patente text not null unique check (patente ~ '^[A-Z0-9]{5,8}$'),
  marca_modelo text not null,
  capacidad int not null check (capacidad between 1 and 80),
  estado_verificacion flota.estado_verificacion not null default 'borrador',
  paso_borrador int not null default 1 check (paso_borrador between 1 and 3),
  borrador jsonb not null default '{}',
  recorrido_id text references public.recorrido(id),
  zona text,
  categoria text,
  dias smallint[] not null default '{1,1,1,1,1,0,0}',
  en_pausa boolean not null default false,   -- el dueño suspende el servicio
  aviso_pausa text,
  desde time, hasta time,
  creado_en timestamptz not null default now()
);

create table flota.documento_vehiculo (
  id uuid primary key default gen_random_uuid(),
  vehiculo_id uuid not null references flota.vehiculo(id) on delete cascade,
  tipo text not null,
  archivo text,                 -- ruta en el bucket privado (etapa 4)
  vence date,
  estado flota.estado_documento not null default 'pendiente',
  revisado_por uuid, revisado_en timestamptz,
  unique (vehiculo_id, tipo)
);

-- Conductores autorizados por vehículo (invitación del propietario)
create table flota.conductor_vehiculo (
  vehiculo_id uuid not null references flota.vehiculo(id) on delete cascade,
  usuario_id uuid not null,
  autorizado_por uuid not null,
  activo boolean not null default true,
  creado_en timestamptz not null default now(),
  primary key (vehiculo_id, usuario_id)
);

create table flota.tarifa_servicio (
  id bigint generated always as identity primary key,
  vehiculo_id uuid references flota.vehiculo(id) on delete cascade,
  recorrido_id text references public.recorrido(id),
  categoria_asiento text,
  monto int not null check (monto > 0),
  check (vehiculo_id is not null or recorrido_id is not null)
);

create table flota.categoria_asiento (
  id bigint generated always as identity primary key,
  vehiculo_id uuid not null references flota.vehiculo(id) on delete cascade,
  nombre text not null,
  cantidad int not null check (cantidad > 0),
  unique (vehiculo_id, nombre)
);

-- Sesión de servicio: inicio, fin, cupos. Una sola activa por vehículo (índice único parcial).
create table flota.sesion_servicio (
  id uuid primary key default gen_random_uuid(),
  vehiculo_id uuid not null references flota.vehiculo(id),
  conductor_id uuid not null,
  inicio timestamptz not null default now(),
  fin timestamptz,
  sentido text,
  cupos int,
  completo boolean not null default false,
  salida_informada timestamptz,
  retraso_min int,
  consentimiento_gps_en timestamptz
);
create unique index sesion_activa_unica on flota.sesion_servicio (vehiculo_id) where fin is null;

create table flota.posicion (
  sesion_id uuid primary key references flota.sesion_servicio(id) on delete cascade,
  punto geography(point) not null,
  actualizado_en timestamptz not null default now()
);

create table flota.horario (
  id bigint generated always as identity primary key,
  recorrido_id text not null references public.recorrido(id),
  vehiculo_id uuid references flota.vehiculo(id) on delete cascade,
  dia_semana smallint not null check (dia_semana between 0 and 6),
  salida time not null,
  validado boolean not null default false,
  cargado_por uuid not null
);

create table flota.salida_programada (
  id bigint generated always as identity primary key,
  vehiculo_id uuid not null references flota.vehiculo(id) on delete cascade,
  conductor_id uuid,
  recorrido_id text references public.recorrido(id),
  sale_en timestamptz not null,
  estado text not null default 'programada' check (estado in ('programada', 'suspendida', 'realizada'))
);

-- ===== Funciones de apoyo (security definer, search_path fijo) =====
create or replace function flota.es_admin() returns boolean language sql stable security definer set search_path = '' as
$$ select exists (select 1 from flota.administrador where usuario_id = auth.uid()) $$;

create or replace function flota.es_dueno(v uuid) returns boolean language sql stable security definer set search_path = '' as
$$ select exists (select 1 from flota.vehiculo ve join flota.propietario p on p.id = ve.propietario_id where ve.id = v and p.usuario_id = auth.uid()) $$;

create or replace function flota.es_conductor(v uuid) returns boolean language sql stable security definer set search_path = '' as
$$ select exists (select 1 from flota.conductor_vehiculo where vehiculo_id = v and usuario_id = auth.uid() and activo) $$;

create or replace function flota.es_publico(t flota.tipo_vehiculo) returns boolean language sql immutable set search_path = '' as
$$ select t in ('taxi'::flota.tipo_vehiculo, 'colectivo', 'bus') $$;

-- El dueño no puede cambiar la verificación de su vehículo: solo un administrador
create or replace function flota.proteger_verificacion() returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.estado_verificacion is distinct from coalesce(old.estado_verificacion, 'borrador')
     and not (new.estado_verificacion = 'en_revision' and coalesce(old.estado_verificacion, 'borrador') = 'borrador')
     and not flota.es_admin()
     and current_setting('flota.aprobando', true) is distinct from 'si' then
    raise exception 'Solo VAMO puede cambiar el estado de verificación';
  end if;
  return new;
end $$;
create trigger proteger_verificacion before insert or update on flota.vehiculo for each row execute function flota.proteger_verificacion();

-- Iniciar servicio: conductor autorizado, vehículo verificado si es servicio público, una sola sesión activa
create or replace function flota.iniciar_servicio(v uuid, sentido text default null, acepta_gps boolean default false) returns uuid
language plpgsql security definer set search_path = '' as $$
declare ve flota.vehiculo; s uuid;
begin
  select * into ve from flota.vehiculo where id = v;
  if ve.id is null then raise exception 'Vehículo no encontrado'; end if;
  if not (flota.es_conductor(v) or flota.es_dueno(v)) then raise exception 'No estás autorizado para este vehículo'; end if;
  if flota.es_publico(ve.tipo) and ve.estado_verificacion <> 'verificado' then raise exception 'El vehículo aún no está verificado'; end if;
  if ve.estado_verificacion in ('suspendido', 'rechazado') then raise exception 'El vehículo no está habilitado'; end if;
  if ve.en_pausa then raise exception 'El dueño suspendió el servicio de este vehículo'; end if;
  if exists (select 1 from flota.sesion_servicio where vehiculo_id = v and fin is null) then raise exception 'Este vehículo ya tiene una sesión activa'; end if;
  insert into flota.sesion_servicio (vehiculo_id, conductor_id, sentido, cupos, consentimiento_gps_en)
    values (v, auth.uid(), sentido, case when ve.tipo = 'colectivo' then ve.capacidad end, case when acepta_gps then now() end)
    returning id into s;
  return s;
end $$;

create or replace function flota.finalizar_servicio(s uuid) returns void language plpgsql security definer set search_path = '' as $$
begin
  update flota.sesion_servicio set fin = now() where id = s and fin is null and conductor_id = auth.uid();
  if not found then raise exception 'No hay una sesión activa tuya con ese id'; end if;
  delete from flota.posicion where sesion_id = s;
end $$;

create or replace function flota.actualizar_cupos(s uuid, n int) returns void language plpgsql security definer set search_path = '' as $$
declare cap int;
begin
  select ve.capacidad into cap from flota.sesion_servicio ss join flota.vehiculo ve on ve.id = ss.vehiculo_id
    where ss.id = s and ss.fin is null and ss.conductor_id = auth.uid();
  if cap is null then raise exception 'No hay una sesión activa tuya con ese id'; end if;
  if n < 0 or n > cap then raise exception 'Los cupos deben estar entre 0 y %', cap; end if;
  update flota.sesion_servicio set cupos = n, completo = (n = 0) where id = s;
end $$;

create or replace function flota.aprobar_documento(d uuid, aprobar boolean) returns void language plpgsql security definer set search_path = '' as $$
declare v uuid; t flota.tipo_vehiculo; faltan int;
begin
  if not flota.es_admin() then raise exception 'Solo administradores de VAMO'; end if;
  update flota.documento_vehiculo set estado = case when aprobar then 'aprobado'::flota.estado_documento else 'rechazado' end,
    revisado_por = auth.uid(), revisado_en = now() where id = d returning vehiculo_id into v;
  select count(*) into faltan from flota.documento_vehiculo where vehiculo_id = v and estado <> 'aprobado';
  if faltan = 0 then perform set_config('flota.aprobando', 'si', true); update flota.vehiculo set estado_verificacion = 'verificado' where id = v; end if;
end $$;

create or replace function flota.copiar_horario(rec text, v uuid, dia_origen smallint, dias_destino smallint[]) returns int
language plpgsql security definer set search_path = '' as $$
declare n int;
begin
  if not flota.es_dueno(v) then raise exception 'Solo el propietario copia horarios'; end if;
  delete from flota.horario where recorrido_id = rec and vehiculo_id = v and dia_semana = any(dias_destino);
  insert into flota.horario (recorrido_id, vehiculo_id, dia_semana, salida, validado, cargado_por)
    select rec, v, d, h.salida, true, auth.uid() from flota.horario h, unnest(dias_destino) d
    where h.recorrido_id = rec and h.vehiculo_id = v and h.dia_semana = dia_origen;
  get diagnostics n = row_count; return n;
end $$;

-- ===== RLS =====
alter table flota.administrador enable row level security;
alter table flota.propietario enable row level security;
alter table flota.vehiculo enable row level security;
alter table flota.documento_vehiculo enable row level security;
alter table flota.conductor_vehiculo enable row level security;
alter table flota.tarifa_servicio enable row level security;
alter table flota.categoria_asiento enable row level security;
alter table flota.sesion_servicio enable row level security;
alter table flota.posicion enable row level security;
alter table flota.horario enable row level security;
alter table flota.salida_programada enable row level security;

create policy admin_ve on flota.administrador for select using (usuario_id = auth.uid());
create policy propio on flota.propietario for all using (usuario_id = auth.uid() or flota.es_admin()) with check (usuario_id = auth.uid());

create policy dueno_gestiona on flota.vehiculo for all
  using (flota.es_dueno(id) or flota.es_admin())
  with check (exists (select 1 from flota.propietario p where p.id = propietario_id and p.usuario_id = auth.uid()) or flota.es_admin());
create policy conductor_ve on flota.vehiculo for select using (flota.es_conductor(id));
-- Público: solo vehículos con sesión activa y, si son servicio público, verificados
create policy publico_en_servicio on flota.vehiculo for select using (
  (not flota.es_publico(tipo) or estado_verificacion = 'verificado')
  and exists (select 1 from flota.sesion_servicio s where s.vehiculo_id = vehiculo.id and s.fin is null));

create policy docs_dueno on flota.documento_vehiculo for select using (flota.es_dueno(vehiculo_id) or flota.es_admin());
create policy docs_dueno_sube on flota.documento_vehiculo for insert with check (flota.es_dueno(vehiculo_id) and estado = 'pendiente' and revisado_por is null);

create policy cv_dueno on flota.conductor_vehiculo for all using (flota.es_dueno(vehiculo_id)) with check (flota.es_dueno(vehiculo_id) and autorizado_por = auth.uid());
create policy cv_conductor on flota.conductor_vehiculo for select using (usuario_id = auth.uid());

create policy tarifa_dueno on flota.tarifa_servicio for all using (vehiculo_id is not null and flota.es_dueno(vehiculo_id)) with check (vehiculo_id is not null and flota.es_dueno(vehiculo_id));
create policy tarifa_lectura on flota.tarifa_servicio for select using (true);
create policy asientos_dueno on flota.categoria_asiento for all using (flota.es_dueno(vehiculo_id)) with check (flota.es_dueno(vehiculo_id));
create policy asientos_lectura on flota.categoria_asiento for select using (true);

-- Sesiones: se crean y cambian solo con las funciones; se leen las propias, las del dueño y las activas
create policy sesion_lectura on flota.sesion_servicio for select using (conductor_id = auth.uid() or flota.es_dueno(vehiculo_id) or fin is null);

-- Posición: la escribe solo el conductor de una sesión activa; se lee solo mientras la sesión está activa
create policy pos_escribe on flota.posicion for insert with check (exists (select 1 from flota.sesion_servicio s where s.id = sesion_id and s.fin is null and s.conductor_id = auth.uid()));
create policy pos_actualiza on flota.posicion for update using (exists (select 1 from flota.sesion_servicio s where s.id = sesion_id and s.fin is null and s.conductor_id = auth.uid()));
create policy pos_lectura on flota.posicion for select using (exists (select 1 from flota.sesion_servicio s where s.id = sesion_id and s.fin is null));

-- Horarios: el dueño los carga validados; el conductor autorizado solo como pendientes
create policy horario_dueno on flota.horario for all using (vehiculo_id is not null and flota.es_dueno(vehiculo_id)) with check (vehiculo_id is not null and flota.es_dueno(vehiculo_id));
create policy horario_conductor on flota.horario for insert with check (vehiculo_id is not null and flota.es_conductor(vehiculo_id) and not validado and cargado_por = auth.uid());
create policy horario_lectura on flota.horario for select using (validado or cargado_por = auth.uid());

create policy salida_dueno on flota.salida_programada for all using (flota.es_dueno(vehiculo_id)) with check (flota.es_dueno(vehiculo_id));
create policy salida_lectura on flota.salida_programada for select using (true);

create policy docs_dueno_actualiza on flota.documento_vehiculo for update
  using (flota.es_dueno(vehiculo_id) and estado <> 'aprobado')
  with check (flota.es_dueno(vehiculo_id) and estado = 'pendiente' and revisado_por is null);

-- ===== Etapa 4: documentos en bucket privado y revisión =====
-- El dueño envía a revisión cuando están todos los documentos requeridos
create or replace function flota.documentos_requeridos(t flota.tipo_vehiculo) returns text[] language sql immutable set search_path = '' as $$
  select case t
    when 'auto' then array['licencia', 'padron', 'revision_tecnica', 'soap']
    when 'moto' then array['licencia', 'padron', 'soap']
    when 'taxi' then array['licencia_profesional', 'padron', 'revision_tecnica', 'soap', 'permiso_circulacion', 'inscripcion_rnstp']
    when 'colectivo' then array['licencia_profesional', 'padron', 'revision_tecnica', 'soap', 'permiso_circulacion', 'inscripcion_rnstp']
    when 'bus' then array['licencia_profesional', 'padron', 'revision_tecnica', 'soap', 'permiso_circulacion', 'inscripcion_rnstp', 'seguro_pasajeros']
  end $$;

create or replace function flota.enviar_a_revision(v uuid) returns text[] language plpgsql security definer set search_path = '' as $$
declare ve flota.vehiculo; faltan text[];
begin
  select * into ve from flota.vehiculo where id = v;
  if ve.id is null or not flota.es_dueno(v) then raise exception 'Solo el propietario envía su vehículo a revisión'; end if;
  select array_agg(r) into faltan from unnest(flota.documentos_requeridos(ve.tipo)) r
    where not exists (select 1 from flota.documento_vehiculo d where d.vehiculo_id = v and d.tipo = r and d.archivo is not null and d.estado <> 'rechazado');
  if faltan is not null then return faltan; end if;
  if ve.estado_verificacion = 'borrador' then update flota.vehiculo set estado_verificacion = 'en_revision' where id = v; end if;
  return '{}';
end $$;

-- Aprobar exige todos los requeridos aprobados (reemplaza la versión anterior)
create or replace function flota.aprobar_documento(d uuid, aprobar boolean) returns void language plpgsql security definer set search_path = '' as $$
declare v uuid; t flota.tipo_vehiculo; faltan int;
begin
  if not flota.es_admin() then raise exception 'Solo administradores de VAMO'; end if;
  update flota.documento_vehiculo set estado = case when aprobar then 'aprobado'::flota.estado_documento else 'rechazado' end,
    revisado_por = auth.uid(), revisado_en = now() where id = d returning vehiculo_id into v;
  if v is null then raise exception 'Documento no encontrado'; end if;
  select tipo into t from flota.vehiculo where id = v;
  select count(*) into faltan from unnest(flota.documentos_requeridos(t)) r
    where not exists (select 1 from flota.documento_vehiculo x where x.vehiculo_id = v and x.tipo = r and x.estado = 'aprobado');
  perform set_config('flota.aprobando', 'si', true);
  if faltan = 0 then update flota.vehiculo set estado_verificacion = 'verificado' where id = v;
  elsif not aprobar then update flota.vehiculo set estado_verificacion = 'rechazado' where id = v and estado_verificacion = 'en_revision';
  end if;
end $$;

create or replace function flota.cambiar_estado_vehiculo(v uuid, e flota.estado_verificacion) returns void language plpgsql security definer set search_path = '' as $$
begin
  if not flota.es_admin() then raise exception 'Solo administradores de VAMO'; end if;
  perform set_config('flota.aprobando', 'si', true);
  update flota.vehiculo set estado_verificacion = e where id = v;
  if e in ('suspendido', 'rechazado') then
    update flota.sesion_servicio set fin = now() where vehiculo_id = v and fin is null;
  end if;
end $$;

-- Ruta del archivo: <vehiculo_id>/<tipo>.<ext>
create or replace function flota.vehiculo_de_ruta(nombre text) returns uuid language plpgsql immutable set search_path = '' as $$
begin return split_part(nombre, '/', 1)::uuid; exception when others then return null; end $$;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('documentos-vehiculo', 'documentos-vehiculo', false, 8388608, array['image/jpeg', 'image/png', 'image/webp', 'application/pdf'])
on conflict (id) do nothing;

create policy flota_docs_subir on storage.objects for insert to authenticated
  with check (bucket_id = 'documentos-vehiculo' and flota.es_dueno(flota.vehiculo_de_ruta(name)));
create policy flota_docs_reemplazar on storage.objects for update to authenticated
  using (bucket_id = 'documentos-vehiculo' and flota.es_dueno(flota.vehiculo_de_ruta(name)));
create policy flota_docs_ver on storage.objects for select to authenticated
  using (bucket_id = 'documentos-vehiculo' and (flota.es_dueno(flota.vehiculo_de_ruta(name)) or flota.es_admin()));

-- ===== Etapa 5: servicio en curso =====
create or replace function flota.informar_salida(s uuid, retraso int default 0) returns void language plpgsql security definer set search_path = '' as $$
begin
  if retraso < 0 or retraso > 180 then raise exception 'Retraso fuera de rango'; end if;
  update flota.sesion_servicio set salida_informada = now(), retraso_min = retraso where id = s and fin is null and conductor_id = auth.uid();
  if not found then raise exception 'No hay una sesión activa tuya con ese id'; end if;
end $$;

create or replace function flota.marcar_completo(s uuid, si boolean) returns void language plpgsql security definer set search_path = '' as $$
begin
  update flota.sesion_servicio set completo = si, cupos = case when si then 0 else cupos end where id = s and fin is null and conductor_id = auth.uid();
  if not found then raise exception 'No hay una sesión activa tuya con ese id'; end if;
end $$;

create or replace function flota.cambiar_sentido(s uuid, sentido text) returns void language plpgsql security definer set search_path = '' as $$
begin
  update flota.sesion_servicio set sentido = cambiar_sentido.sentido where id = s and fin is null and conductor_id = auth.uid();
  if not found then raise exception 'No hay una sesión activa tuya con ese id'; end if;
end $$;

-- Ubicación: solo con consentimiento dado al iniciar; se borra al finalizar
create or replace function flota.reportar_posicion(s uuid, lat double precision, lng double precision) returns void language plpgsql security definer set search_path = '' as $$
begin
  if not exists (select 1 from flota.sesion_servicio where id = s and fin is null and conductor_id = auth.uid() and consentimiento_gps_en is not null) then
    raise exception 'Sin sesión activa con ubicación autorizada';
  end if;
  if lat not between -90 and 90 or lng not between -180 and 180 then raise exception 'Coordenadas inválidas'; end if;
  insert into flota.posicion (sesion_id, punto, actualizado_en) values (s, extensions.st_setsrid(extensions.st_makepoint(lng, lat), 4326)::extensions.geography, now())
    on conflict (sesion_id) do update set punto = excluded.punto, actualizado_en = now();
end $$;

create or replace function flota.detener_ubicacion(s uuid) returns void language plpgsql security definer set search_path = '' as $$
begin
  update flota.sesion_servicio set consentimiento_gps_en = null where id = s and fin is null and conductor_id = auth.uid();
  if not found then raise exception 'No hay una sesión activa tuya con ese id'; end if;
  delete from flota.posicion where sesion_id = s;
end $$;

-- Vista pública: vehículos en servicio (sin datos del dueño ni del conductor). Posición solo si se actualizó hace menos de 2 minutos.
create or replace view flota.en_servicio with (security_invoker = true) as
  select s.id as sesion_id, v.id as vehiculo_id, v.tipo, v.patente, v.capacidad, v.recorrido_id, v.zona, v.categoria,
         s.inicio, s.sentido, s.cupos, s.completo, s.salida_informada, s.retraso_min,
         case when p.actualizado_en > now() - interval '2 minutes' then extensions.st_y(p.punto::extensions.geometry) end as lat,
         case when p.actualizado_en > now() - interval '2 minutes' then extensions.st_x(p.punto::extensions.geometry) end as lng,
         p.actualizado_en as posicion_en
  from flota.sesion_servicio s
  join flota.vehiculo v on v.id = s.vehiculo_id
  left join flota.posicion p on p.sesion_id = s.id
  where s.fin is null and (not flota.es_publico(v.tipo) or v.estado_verificacion = 'verificado');

-- ===== Etapa 6: el dueño invita conductores y configura =====
create table flota.invitacion (
  codigo text primary key default upper(substr(md5(gen_random_uuid()::text), 1, 8)),
  vehiculo_id uuid not null references flota.vehiculo(id) on delete cascade,
  creada_por uuid not null,
  vence timestamptz not null default now() + interval '7 days',
  usada_por uuid, usada_en timestamptz
);
alter table flota.invitacion enable row level security;
create policy inv_dueno on flota.invitacion for all using (flota.es_dueno(vehiculo_id)) with check (flota.es_dueno(vehiculo_id) and creada_por = auth.uid() and usada_por is null);

create or replace function flota.aceptar_invitacion(c text) returns uuid language plpgsql security definer set search_path = '' as $$
declare i flota.invitacion;
begin
  if auth.uid() is null then raise exception 'Inicia sesión para aceptar la invitación'; end if;
  select * into i from flota.invitacion where codigo = upper(trim(c)) for update;
  if i.codigo is null or i.usada_por is not null or i.vence < now() then raise exception 'Código no válido o vencido'; end if;
  insert into flota.conductor_vehiculo (vehiculo_id, usuario_id, autorizado_por) values (i.vehiculo_id, auth.uid(), i.creada_por)
    on conflict (vehiculo_id, usuario_id) do update set activo = true;
  update flota.invitacion set usada_por = auth.uid(), usada_en = now() where codigo = i.codigo;
  return i.vehiculo_id;
end $$;

-- Quitar conductor: también cierra su sesión activa en ese vehículo
create or replace function flota.quitar_conductor(v uuid, u uuid) returns void language plpgsql security definer set search_path = '' as $$
begin
  if not flota.es_dueno(v) then raise exception 'Solo el propietario'; end if;
  update flota.conductor_vehiculo set activo = false where vehiculo_id = v and usuario_id = u;
  update flota.sesion_servicio set fin = now() where vehiculo_id = v and conductor_id = u and fin is null;
end $$;

-- Pausar o reanudar el servicio del vehículo (avisa con un texto opcional)
create or replace function flota.pausar_servicio(v uuid, pausa boolean, aviso text default null) returns void language plpgsql security definer set search_path = '' as $$
begin
  if not flota.es_dueno(v) then raise exception 'Solo el propietario'; end if;
  update flota.vehiculo set en_pausa = pausa, aviso_pausa = case when pausa then left(aviso, 200) end where id = v;
  if pausa then
    update flota.sesion_servicio set fin = now() where vehiculo_id = v and fin is null;
    update flota.salida_programada set estado = 'suspendida' where vehiculo_id = v and estado = 'programada' and sale_en > now();
  end if;
end $$;

create or replace function flota.validar_horario(h bigint, ok boolean) returns void language plpgsql security definer set search_path = '' as $$
declare v uuid;
begin
  select vehiculo_id into v from flota.horario where id = h;
  if v is null or not flota.es_dueno(v) then raise exception 'Solo el propietario valida horarios'; end if;
  if ok then update flota.horario set validado = true where id = h; else delete from flota.horario where id = h; end if;
end $$;

-- ===== Permisos de la API =====
grant usage on schema flota to anon, authenticated, service_role;
grant select, insert, update, delete on all tables in schema flota to authenticated;
revoke insert, update, delete on flota.sesion_servicio from authenticated;
revoke insert, update, delete on flota.posicion from authenticated;
revoke insert, update, delete on flota.administrador from authenticated;
grant select on flota.en_servicio, flota.horario, flota.tarifa_servicio, flota.categoria_asiento, flota.salida_programada to anon;
-- Visitantes: solo columnas públicas (sin dueño, borrador ni conductor)
grant select (id, tipo, patente, capacidad, recorrido_id, zona, categoria, estado_verificacion, en_pausa, aviso_pausa) on flota.vehiculo to anon;
grant select (id, vehiculo_id, inicio, fin, sentido, cupos, completo, salida_informada, retraso_min) on flota.sesion_servicio to anon;
grant select on flota.posicion to anon;
grant all on all tables in schema flota to service_role;
grant usage on all sequences in schema flota to authenticated, service_role;
revoke execute on all functions in schema flota from public, anon;
grant execute on all functions in schema flota to authenticated, service_role;
grant execute on function flota.es_publico(flota.tipo_vehiculo), flota.es_admin(), flota.es_dueno(uuid), flota.es_conductor(uuid) to anon;
