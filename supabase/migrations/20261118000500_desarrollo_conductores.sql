-- VAMO · Conductores y dueños (etapas 2-3) en el esquema aislado «desarrollo».
-- No toca el esquema public: la app en producción no lee este esquema y no está expuesto en la API.
-- Cuando se apruebe, el mismo diseño se aplicará en public con migraciones solo aditivas.

create schema if not exists desarrollo;

create type desarrollo.tipo_vehiculo as enum ('auto', 'taxi', 'colectivo', 'bus', 'moto');
create type desarrollo.estado_verificacion as enum ('borrador', 'en_revision', 'verificado', 'rechazado', 'suspendido');
create type desarrollo.estado_documento as enum ('pendiente', 'aprobado', 'rechazado');

-- Personas de VAMO que revisan documentos
create table desarrollo.administrador (usuario_id uuid primary key);

-- Propietario (persona o empresa)
create table desarrollo.propietario (
  id uuid primary key default gen_random_uuid(),
  usuario_id uuid not null unique,
  nombre text not null,
  creado_en timestamptz not null default now()
);

create table desarrollo.vehiculo (
  id uuid primary key default gen_random_uuid(),
  propietario_id uuid not null references desarrollo.propietario(id),
  tipo desarrollo.tipo_vehiculo not null,
  patente text not null unique check (patente ~ '^[A-Z0-9]{5,8}$'),
  marca_modelo text not null,
  capacidad int not null check (capacidad between 1 and 80),
  estado_verificacion desarrollo.estado_verificacion not null default 'borrador',
  paso_borrador int not null default 1 check (paso_borrador between 1 and 3),
  borrador jsonb not null default '{}',
  recorrido_id text references public.recorrido(id),
  zona text,
  categoria text,
  dias smallint[] not null default '{1,1,1,1,1,0,0}',
  desde time, hasta time,
  creado_en timestamptz not null default now()
);

create table desarrollo.documento_vehiculo (
  id uuid primary key default gen_random_uuid(),
  vehiculo_id uuid not null references desarrollo.vehiculo(id) on delete cascade,
  tipo text not null,
  archivo text,                 -- ruta en el bucket privado (etapa 4)
  vence date,
  estado desarrollo.estado_documento not null default 'pendiente',
  revisado_por uuid, revisado_en timestamptz,
  unique (vehiculo_id, tipo)
);

-- Conductores autorizados por vehículo (invitación del propietario)
create table desarrollo.conductor_vehiculo (
  vehiculo_id uuid not null references desarrollo.vehiculo(id) on delete cascade,
  usuario_id uuid not null,
  autorizado_por uuid not null,
  activo boolean not null default true,
  creado_en timestamptz not null default now(),
  primary key (vehiculo_id, usuario_id)
);

create table desarrollo.tarifa_servicio (
  id bigint generated always as identity primary key,
  vehiculo_id uuid references desarrollo.vehiculo(id) on delete cascade,
  recorrido_id text references public.recorrido(id),
  categoria_asiento text,
  monto int not null check (monto > 0),
  check (vehiculo_id is not null or recorrido_id is not null)
);

create table desarrollo.categoria_asiento (
  id bigint generated always as identity primary key,
  vehiculo_id uuid not null references desarrollo.vehiculo(id) on delete cascade,
  nombre text not null,
  cantidad int not null check (cantidad > 0),
  unique (vehiculo_id, nombre)
);

-- Sesión de servicio: inicio, fin, cupos. Una sola activa por vehículo (índice único parcial).
create table desarrollo.sesion_servicio (
  id uuid primary key default gen_random_uuid(),
  vehiculo_id uuid not null references desarrollo.vehiculo(id),
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
create unique index sesion_activa_unica on desarrollo.sesion_servicio (vehiculo_id) where fin is null;

create table desarrollo.posicion (
  sesion_id uuid primary key references desarrollo.sesion_servicio(id) on delete cascade,
  punto geography(point) not null,
  actualizado_en timestamptz not null default now()
);

create table desarrollo.horario (
  id bigint generated always as identity primary key,
  recorrido_id text not null references public.recorrido(id),
  vehiculo_id uuid references desarrollo.vehiculo(id) on delete cascade,
  dia_semana smallint not null check (dia_semana between 0 and 6),
  salida time not null,
  validado boolean not null default false,
  cargado_por uuid not null
);

create table desarrollo.salida_programada (
  id bigint generated always as identity primary key,
  vehiculo_id uuid not null references desarrollo.vehiculo(id) on delete cascade,
  conductor_id uuid,
  recorrido_id text references public.recorrido(id),
  sale_en timestamptz not null,
  estado text not null default 'programada' check (estado in ('programada', 'suspendida', 'realizada'))
);

-- ===== Funciones de apoyo (security definer, search_path fijo) =====
create or replace function desarrollo.es_admin() returns boolean language sql stable security definer set search_path = '' as
$$ select exists (select 1 from desarrollo.administrador where usuario_id = auth.uid()) $$;

create or replace function desarrollo.es_dueno(v uuid) returns boolean language sql stable security definer set search_path = '' as
$$ select exists (select 1 from desarrollo.vehiculo ve join desarrollo.propietario p on p.id = ve.propietario_id where ve.id = v and p.usuario_id = auth.uid()) $$;

create or replace function desarrollo.es_conductor(v uuid) returns boolean language sql stable security definer set search_path = '' as
$$ select exists (select 1 from desarrollo.conductor_vehiculo where vehiculo_id = v and usuario_id = auth.uid() and activo) $$;

create or replace function desarrollo.es_publico(t desarrollo.tipo_vehiculo) returns boolean language sql immutable as
$$ select t in ('taxi', 'colectivo', 'bus') $$;

-- El dueño no puede cambiar la verificación de su vehículo: solo un administrador
create or replace function desarrollo.proteger_verificacion() returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.estado_verificacion is distinct from coalesce(old.estado_verificacion, 'borrador')
     and not (new.estado_verificacion = 'en_revision' and coalesce(old.estado_verificacion, 'borrador') = 'borrador')
     and not desarrollo.es_admin()
     and current_setting('desarrollo.aprobando', true) is distinct from 'si' then
    raise exception 'Solo VAMO puede cambiar el estado de verificación';
  end if;
  return new;
end $$;
create trigger proteger_verificacion before insert or update on desarrollo.vehiculo for each row execute function desarrollo.proteger_verificacion();

-- Iniciar servicio: conductor autorizado, vehículo verificado si es servicio público, una sola sesión activa
create or replace function desarrollo.iniciar_servicio(v uuid, sentido text default null, acepta_gps boolean default false) returns uuid
language plpgsql security definer set search_path = '' as $$
declare ve desarrollo.vehiculo; s uuid;
begin
  select * into ve from desarrollo.vehiculo where id = v;
  if ve.id is null then raise exception 'Vehículo no encontrado'; end if;
  if not (desarrollo.es_conductor(v) or desarrollo.es_dueno(v)) then raise exception 'No estás autorizado para este vehículo'; end if;
  if desarrollo.es_publico(ve.tipo) and ve.estado_verificacion <> 'verificado' then raise exception 'El vehículo aún no está verificado'; end if;
  if exists (select 1 from desarrollo.sesion_servicio where vehiculo_id = v and fin is null) then raise exception 'Este vehículo ya tiene una sesión activa'; end if;
  insert into desarrollo.sesion_servicio (vehiculo_id, conductor_id, sentido, cupos, consentimiento_gps_en)
    values (v, auth.uid(), sentido, case when ve.tipo = 'colectivo' then ve.capacidad end, case when acepta_gps then now() end)
    returning id into s;
  return s;
end $$;

create or replace function desarrollo.finalizar_servicio(s uuid) returns void language plpgsql security definer set search_path = '' as $$
begin
  update desarrollo.sesion_servicio set fin = now() where id = s and fin is null and conductor_id = auth.uid();
  if not found then raise exception 'No hay una sesión activa tuya con ese id'; end if;
  delete from desarrollo.posicion where sesion_id = s;
end $$;

create or replace function desarrollo.actualizar_cupos(s uuid, n int) returns void language plpgsql security definer set search_path = '' as $$
declare cap int;
begin
  select ve.capacidad into cap from desarrollo.sesion_servicio ss join desarrollo.vehiculo ve on ve.id = ss.vehiculo_id
    where ss.id = s and ss.fin is null and ss.conductor_id = auth.uid();
  if cap is null then raise exception 'No hay una sesión activa tuya con ese id'; end if;
  if n < 0 or n > cap then raise exception 'Los cupos deben estar entre 0 y %', cap; end if;
  update desarrollo.sesion_servicio set cupos = n, completo = (n = 0) where id = s;
end $$;

create or replace function desarrollo.aprobar_documento(d uuid, aprobar boolean) returns void language plpgsql security definer set search_path = '' as $$
declare v uuid; t desarrollo.tipo_vehiculo; faltan int;
begin
  if not desarrollo.es_admin() then raise exception 'Solo administradores de VAMO'; end if;
  update desarrollo.documento_vehiculo set estado = case when aprobar then 'aprobado'::desarrollo.estado_documento else 'rechazado' end,
    revisado_por = auth.uid(), revisado_en = now() where id = d returning vehiculo_id into v;
  select count(*) into faltan from desarrollo.documento_vehiculo where vehiculo_id = v and estado <> 'aprobado';
  if faltan = 0 then perform set_config('desarrollo.aprobando', 'si', true); update desarrollo.vehiculo set estado_verificacion = 'verificado' where id = v; end if;
end $$;

create or replace function desarrollo.copiar_horario(rec text, v uuid, dia_origen smallint, dias_destino smallint[]) returns int
language plpgsql security definer set search_path = '' as $$
declare n int;
begin
  if not desarrollo.es_dueno(v) then raise exception 'Solo el propietario copia horarios'; end if;
  delete from desarrollo.horario where recorrido_id = rec and vehiculo_id = v and dia_semana = any(dias_destino);
  insert into desarrollo.horario (recorrido_id, vehiculo_id, dia_semana, salida, validado, cargado_por)
    select rec, v, d, h.salida, true, auth.uid() from desarrollo.horario h, unnest(dias_destino) d
    where h.recorrido_id = rec and h.vehiculo_id = v and h.dia_semana = dia_origen;
  get diagnostics n = row_count; return n;
end $$;

-- ===== RLS =====
alter table desarrollo.administrador enable row level security;
alter table desarrollo.propietario enable row level security;
alter table desarrollo.vehiculo enable row level security;
alter table desarrollo.documento_vehiculo enable row level security;
alter table desarrollo.conductor_vehiculo enable row level security;
alter table desarrollo.tarifa_servicio enable row level security;
alter table desarrollo.categoria_asiento enable row level security;
alter table desarrollo.sesion_servicio enable row level security;
alter table desarrollo.posicion enable row level security;
alter table desarrollo.horario enable row level security;
alter table desarrollo.salida_programada enable row level security;

create policy admin_ve on desarrollo.administrador for select using (usuario_id = auth.uid());
create policy propio on desarrollo.propietario for all using (usuario_id = auth.uid() or desarrollo.es_admin()) with check (usuario_id = auth.uid());

create policy dueno_gestiona on desarrollo.vehiculo for all
  using (desarrollo.es_dueno(id) or desarrollo.es_admin())
  with check (exists (select 1 from desarrollo.propietario p where p.id = propietario_id and p.usuario_id = auth.uid()) or desarrollo.es_admin());
create policy conductor_ve on desarrollo.vehiculo for select using (desarrollo.es_conductor(id));
-- Público: solo vehículos con sesión activa y, si son servicio público, verificados
create policy publico_en_servicio on desarrollo.vehiculo for select using (
  (not desarrollo.es_publico(tipo) or estado_verificacion = 'verificado')
  and exists (select 1 from desarrollo.sesion_servicio s where s.vehiculo_id = id and s.fin is null));

create policy docs_dueno on desarrollo.documento_vehiculo for select using (desarrollo.es_dueno(vehiculo_id) or desarrollo.es_admin());
create policy docs_dueno_sube on desarrollo.documento_vehiculo for insert with check (desarrollo.es_dueno(vehiculo_id) and estado = 'pendiente' and revisado_por is null);

create policy cv_dueno on desarrollo.conductor_vehiculo for all using (desarrollo.es_dueno(vehiculo_id)) with check (desarrollo.es_dueno(vehiculo_id) and autorizado_por = auth.uid());
create policy cv_conductor on desarrollo.conductor_vehiculo for select using (usuario_id = auth.uid());

create policy tarifa_dueno on desarrollo.tarifa_servicio for all using (vehiculo_id is not null and desarrollo.es_dueno(vehiculo_id)) with check (vehiculo_id is not null and desarrollo.es_dueno(vehiculo_id));
create policy tarifa_lectura on desarrollo.tarifa_servicio for select using (true);
create policy asientos_dueno on desarrollo.categoria_asiento for all using (desarrollo.es_dueno(vehiculo_id)) with check (desarrollo.es_dueno(vehiculo_id));
create policy asientos_lectura on desarrollo.categoria_asiento for select using (true);

-- Sesiones: se crean y cambian solo con las funciones; se leen las propias, las del dueño y las activas
create policy sesion_lectura on desarrollo.sesion_servicio for select using (conductor_id = auth.uid() or desarrollo.es_dueno(vehiculo_id) or fin is null);

-- Posición: la escribe solo el conductor de una sesión activa; se lee solo mientras la sesión está activa
create policy pos_escribe on desarrollo.posicion for insert with check (exists (select 1 from desarrollo.sesion_servicio s where s.id = sesion_id and s.fin is null and s.conductor_id = auth.uid()));
create policy pos_actualiza on desarrollo.posicion for update using (exists (select 1 from desarrollo.sesion_servicio s where s.id = sesion_id and s.fin is null and s.conductor_id = auth.uid()));
create policy pos_lectura on desarrollo.posicion for select using (exists (select 1 from desarrollo.sesion_servicio s where s.id = sesion_id and s.fin is null));

-- Horarios: el dueño los carga validados; el conductor autorizado solo como pendientes
create policy horario_dueno on desarrollo.horario for all using (vehiculo_id is not null and desarrollo.es_dueno(vehiculo_id)) with check (vehiculo_id is not null and desarrollo.es_dueno(vehiculo_id) and cargado_por = auth.uid());
create policy horario_conductor on desarrollo.horario for insert with check (vehiculo_id is not null and desarrollo.es_conductor(vehiculo_id) and not validado and cargado_por = auth.uid());
create policy horario_lectura on desarrollo.horario for select using (validado or cargado_por = auth.uid());

create policy salida_dueno on desarrollo.salida_programada for all using (desarrollo.es_dueno(vehiculo_id)) with check (desarrollo.es_dueno(vehiculo_id));
create policy salida_lectura on desarrollo.salida_programada for select using (true);

grant usage on schema desarrollo to authenticated;
grant select, insert, update, delete on all tables in schema desarrollo to authenticated;
revoke update, delete on desarrollo.sesion_servicio from authenticated;
revoke insert on desarrollo.sesion_servicio from authenticated;
grant execute on all functions in schema desarrollo to authenticated;
