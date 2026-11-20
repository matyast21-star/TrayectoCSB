-- Módulo 1: horarios reales por salida, operadores públicos, fuentes, excepciones por fecha y feriados.
-- Revisión previa (2026-11-19):
--   operador: 0 filas, solo política "dueno gestiona su operador". Se agregan columnas y una política de lectura
--             solo para operadores marcados publico = true (empresas de transporte, no personas).
--   recorrido: 14 filas (12 de ejemplo + C1, C2). Se relajan precio y duracion_min a NULL (tarifa no informada).
--   horario:   solo primera/última/frecuencia; se mantiene para frecuencias referenciales. Las salidas exactas
--              van en la tabla nueva "salida". Nada se borra; los recorridos de ejemplo se desactivan (activo = false).
--   lugar_publico y recorrido_publico: se reemplazan agregando columnas al final (sin quitar ninguna).
-- Escritura: solo administradores VAMO (flota.es_admin(), migración 20261119000000). Lectura pública sin registro.
set search_path = public, extensions;

create type estado_informacion as enum ('oficial_verificado', 'publicado_sin_verificar', 'referencial', 'incompleto', 'desactualizado');
create type tipo_dia as enum ('lv', 'sabado', 'domingo', 'feriado', 'sin_dia');  -- sin_dia: horario referencial sin días confirmados
create type tipo_excepcion as enum ('suspendida', 'modificada', 'extra', 'reanudada', 'reducida', 'aviso');

-- Fuentes: cada dato apunta a la suya para auditoría y actualización
create table fuente (
  id text primary key,
  titulo text not null,
  url text,
  tipo text not null default 'sitio' check (tipo in ('facebook', 'sitio', 'noticia', 'agregador', 'telefono', 'usuario', 'operador')),
  publicada_en date,
  verificada_en date,
  notas text,
  creado_en timestamptz not null default now()
);

-- Operadores: columnas públicas. slug y nombre normalizado evitan duplicados por variaciones de nombre.
alter table operador
  add column if not exists slug text unique,
  add column if not exists nombre_comercial text,
  add column if not exists alias text[] not null default '{}',
  add column if not exists categoria text not null default 'empresa' check (categoria in ('empresa', 'municipal', 'independiente', 'por_confirmar')),
  add column if not exists telefono text,
  add column if not exists sitio_url text,
  add column if not exists compra_url text,
  add column if not exists avisos_url text,
  add column if not exists oficinas jsonb not null default '[]',
  add column if not exists beneficios text,
  add column if not exists estado_info estado_informacion not null default 'publicado_sin_verificar',
  add column if not exists notas text,
  add column if not exists publico boolean not null default false,
  add column if not exists activo boolean not null default true;
create unique index if not exists operador_nombre_unico on operador (lower(translate(nombre_comercial, 'áéíóúüñÁÉÍÓÚÜÑ -.', 'aeiouunAEIOUUN'))) where nombre_comercial is not null;
create policy operadores_publicos_visibles on operador for select using (publico and activo);
create policy admin_gestiona_operadores on operador for all to authenticated using (flota.es_admin()) with check (flota.es_admin());

-- Recorridos: tarifa y duración pueden no estar informadas; trazado puede ser solo referencial
alter table recorrido alter column precio drop not null, alter column duracion_min drop not null;
alter table recorrido
  add column if not exists trazado_referencial boolean not null default false,
  add column if not exists estado_info estado_informacion,
  add column if not exists tarifa_nota text;
create policy admin_gestiona_recorridos on recorrido for all to authenticated using (flota.es_admin()) with check (flota.es_admin());
create policy admin_gestiona_paradas on parada_recorrido for all to authenticated using (flota.es_admin()) with check (flota.es_admin());
create policy admin_gestiona_horarios on horario for all to authenticated using (flota.es_admin()) with check (flota.es_admin());

-- Lugares: ningún punto es paradero oficial hasta verificarlo
alter table lugar
  add column if not exists verificado boolean not null default false,
  add column if not exists nota text;
create policy admin_gestiona_lugares on lugar for all to authenticated using (flota.es_admin()) with check (flota.es_admin());

create table recorrido_fuente (
  recorrido_id text not null references recorrido(id) on delete cascade,
  fuente_id text not null references fuente(id),
  primary key (recorrido_id, fuente_id)
);

-- Una salida exacta. Las variantes de hora son un dato de la misma salida, no otro bus.
create table salida (
  id bigint generated always as identity primary key,
  recorrido_id text not null references recorrido(id) on delete cascade,
  sentido text not null check (sentido in ('ida', 'vuelta')),
  tipo_dia tipo_dia not null,
  hora time not null,                  -- hora de salida desde el primer punto del sentido
  variante_hora time,
  nota_variante text,
  estado_info estado_informacion not null default 'publicado_sin_verificar',
  fuente_id text references fuente(id),
  vigente_desde date,
  vigente_hasta date,
  observacion text,
  actualizado_en timestamptz not null default now(),
  unique (recorrido_id, sentido, tipo_dia, hora)
);
create index salida_recorrido_idx on salida (recorrido_id, sentido, tipo_dia);

-- Hora de paso o llegada por localidad (y lugar, si se conoce). Sin fila = no informado.
create table salida_paso (
  salida_id bigint not null references salida(id) on delete cascade,
  orden int not null,
  localidad_id text not null references localidad(id),
  lugar_id text references lugar(id),
  hora time,
  es_llegada boolean not null default false,
  primary key (salida_id, orden)
);

-- Cambios por fecha: nunca sobrescriben la salida base
create table excepcion_servicio (
  id bigint generated always as identity primary key,
  recorrido_id text not null references recorrido(id) on delete cascade,
  sentido text check (sentido in ('ida', 'vuelta')),
  salida_id bigint references salida(id) on delete cascade,   -- null = afecta al recorrido completo o es una salida extra
  fecha date not null,
  tipo tipo_excepcion not null,
  nueva_hora time,
  detalle text,
  fuente_id text references fuente(id),
  estado_info estado_informacion not null default 'publicado_sin_verificar',
  creado_por uuid default auth.uid(),
  creado_en timestamptz not null default now()
);
create index excepcion_fecha_idx on excepcion_servicio (recorrido_id, fecha);

-- Notas de programación incompleta (ej. «regreso pendiente de confirmación», «fin de semana sin programación completa»)
create table nota_horario (
  id bigint generated always as identity primary key,
  recorrido_id text not null references recorrido(id) on delete cascade,
  sentido text check (sentido in ('ida', 'vuelta')),
  tipo_dia tipo_dia,
  texto text not null,
  estado_info estado_informacion not null default 'incompleto',
  fuente_id text references fuente(id),
  orden int not null default 100
);

create table feriado (
  fecha date primary key,
  nombre text not null,
  fuente_id text references fuente(id)
);

-- RLS: lectura pública, escritura solo administradores
do $$ declare t text; begin
  foreach t in array array['fuente', 'recorrido_fuente', 'salida', 'salida_paso', 'excepcion_servicio', 'nota_horario', 'feriado'] loop
    execute format('alter table %I enable row level security', t);
    execute format('create policy lectura_publica on %I for select using (true)', t);
    execute format('create policy admin_gestiona on %I for all to authenticated using (flota.es_admin()) with check (flota.es_admin())', t);
    execute format('grant select on %I to anon, authenticated', t);
    execute format('grant insert, update, delete on %I to authenticated', t);
  end loop; end $$;
grant select on operador to anon;
grant select, insert, update, delete on operador, recorrido, parada_recorrido, horario, lugar to authenticated;

-- Vistas: se agregan columnas al final
create or replace view lugar_publico with (security_invoker = true) as
  select l.id, l.localidad_id, l.nombre, l.tipo, st_y(l.punto::geometry) as lat, st_x(l.punto::geometry) as lon, l.verificado, l.nota
  from lugar l where l.activo;

create or replace view recorrido_publico with (security_invoker = true) as
  select r.id, r.codigo, r.nombre, r.tipo, r.localidad_id, r.operador_nombre, r.color, r.descripcion,
         r.precio, r.duracion_min, r.tipo_horario, r.fuente_horario, r.frecuencia_aprox_min, r.permite_reportes, r.orden,
         st_asgeojson(r.trazado::geometry, 5)::json -> 'coordinates' as trazado,
         coalesce((select json_agg(json_build_object('lugar', p.lugar_id, 'orden', p.orden, 'min', p.minutos_desde_inicio, 'sentido', p.sentido) order by p.orden)
                   from parada_recorrido p where p.recorrido_id = r.id), '[]') as paradas,
         coalesce((select json_agg(json_build_object('tipo', h.tipo, 'sentido', h.sentido, 'dias', h.dias, 'primera', to_char(h.primera_salida, 'HH24:MI'), 'ultima', to_char(h.ultima_salida, 'HH24:MI'), 'cada', h.frecuencia_min, 'fuente', h.fuente))
                   from horario h where h.recorrido_id = r.id), '[]') as horarios,
         r.actualizado_en, r.operador_id, r.trazado_referencial, r.estado_info, r.tarifa_nota
  from recorrido r where r.activo;
grant select on lugar_publico, recorrido_publico to anon, authenticated;

create or replace view operador_publico with (security_invoker = true) as
  select id, slug, nombre_comercial, razon_social, alias, categoria, telefono, sitio_url, compra_url, avisos_url, oficinas, beneficios, estado_info, notas
  from operador where publico and activo;
grant select on operador_publico to anon, authenticated;

-- Tipo de día de una fecha (feriado gana sobre el día de la semana)
create or replace function tipo_dia_de(p_fecha date) returns tipo_dia language sql stable set search_path = public as $$
  select case when exists (select 1 from feriado f where f.fecha = p_fecha) then 'feriado'::tipo_dia
              when extract(isodow from p_fecha) = 7 then 'domingo'::tipo_dia
              when extract(isodow from p_fecha) = 6 then 'sabado'::tipo_dia
              else 'lv'::tipo_dia end $$;

-- Alternativas entre dos localidades para una fecha: identifica el sentido real por el orden de las paradas
-- (nunca usa la ida como vuelta), la hora en el punto de abordaje, las excepciones de esa fecha y las notas.
create or replace function alternativas(p_origen text, p_destino text, p_fecha date default ((now() at time zone 'America/Santiago')::date))
returns jsonb language plpgsql stable set search_path = public, extensions as $$
declare
  td tipo_dia := tipo_dia_de(p_fecha);
  res jsonb := '[]'::jsonb;
  r record; seq text[]; lug text[]; io int; idd int; sen text; inicio text; n int;
begin
  for r in select rc.id, rc.nombre, rc.tipo, rc.precio, rc.tarifa_nota, rc.duracion_min, rc.tipo_horario, rc.frecuencia_aprox_min, rc.estado_info, rc.operador_nombre,
                  rc.trazado_referencial, rc.color, o.id as op_id, o.slug, o.nombre_comercial, o.categoria, o.telefono, o.sitio_url, o.compra_url, o.avisos_url,
                  o.oficinas, o.beneficios, o.estado_info as op_estado, o.notas as op_notas
           from recorrido rc left join operador o on o.id = rc.operador_id and o.publico and o.activo
           where rc.activo order by rc.orden, rc.id loop
    select array_agg(l.localidad_id order by p.orden), array_agg(l.id order by p.orden) into seq, lug
      from parada_recorrido p join lugar l on l.id = p.lugar_id
      where p.recorrido_id = r.id and (p.sentido is null or p.sentido = 'ida');
    continue when seq is null;
    io := array_position(seq, p_origen); idd := array_position(seq, p_destino);
    continue when io is null or idd is null or io = idd;
    n := array_length(seq, 1);
    if io < idd then sen := 'ida'; inicio := seq[1]; else sen := 'vuelta'; inicio := seq[n]; end if;
    res := res || jsonb_build_object(
      'recorrido_id', r.id, 'nombre', r.nombre, 'tipo', r.tipo, 'sentido', sen, 'tipo_dia', td,
      'operador', jsonb_build_object('id', r.op_id, 'slug', r.slug, 'nombre', coalesce(r.nombre_comercial, r.operador_nombre), 'categoria', coalesce(r.categoria, 'por_confirmar'),
                                     'telefono', r.telefono, 'sitio_url', r.sitio_url, 'compra_url', r.compra_url, 'avisos_url', r.avisos_url,
                                     'oficinas', r.oficinas, 'beneficios', r.beneficios, 'estado_info', r.op_estado, 'notas', r.op_notas),
      'precio', r.precio, 'tarifa_nota', r.tarifa_nota, 'duracion_min', r.duracion_min, 'tipo_horario', r.tipo_horario,
      'frecuencia_aprox_min', r.frecuencia_aprox_min, 'estado_info', r.estado_info, 'trazado_referencial', r.trazado_referencial, 'color', r.color,
      'abordaje', (select jsonb_build_object('id', l.id, 'nombre', l.nombre, 'localidad', l.localidad_id, 'verificado', l.verificado, 'nota', l.nota,
                                              'lat', st_y(l.punto::geometry), 'lon', st_x(l.punto::geometry)) from lugar l where l.id = lug[io]),
      'bajada', (select jsonb_build_object('id', l.id, 'nombre', l.nombre, 'localidad', l.localidad_id, 'verificado', l.verificado) from lugar l where l.id = lug[idd]),
      'desde_inicio', inicio = p_origen,
      'salidas', (select coalesce(jsonb_agg(jsonb_build_object(
            'id', s.id, 'tipo_dia', s.tipo_dia,
            'hora', to_char(case when inicio = p_origen then s.hora else ps.hora end, 'HH24:MI'),
            'hora_inicio', to_char(s.hora, 'HH24:MI'),
            'variante', to_char(s.variante_hora, 'HH24:MI'), 'nota_variante', s.nota_variante,
            'llegada', (select to_char(x.hora, 'HH24:MI') from salida_paso x where x.salida_id = s.id and x.localidad_id = p_destino limit 1),
            'estado_info', s.estado_info, 'observacion', s.observacion, 'fuente', s.fuente_id,
            'excepcion', (select jsonb_build_object('tipo', e.tipo, 'nueva_hora', to_char(e.nueva_hora, 'HH24:MI'), 'detalle', e.detalle, 'fuente', e.fuente_id, 'estado_info', e.estado_info)
                          from excepcion_servicio e where e.salida_id = s.id and e.fecha = p_fecha order by e.creado_en desc limit 1))
          order by case when s.tipo_dia = 'sin_dia' then 1 else 0 end, coalesce(case when inicio = p_origen then s.hora else ps.hora end, s.hora)), '[]'::jsonb)
        from salida s left join salida_paso ps on ps.salida_id = s.id and ps.localidad_id = p_origen
        where s.recorrido_id = r.id and s.sentido = sen and s.tipo_dia in (td, 'sin_dia')
          and (s.vigente_desde is null or s.vigente_desde <= p_fecha) and (s.vigente_hasta is null or s.vigente_hasta >= p_fecha)),
      'excepciones', (select coalesce(jsonb_agg(jsonb_build_object('tipo', e.tipo, 'nueva_hora', to_char(e.nueva_hora, 'HH24:MI'), 'detalle', e.detalle, 'fuente', e.fuente_id, 'estado_info', e.estado_info) order by e.nueva_hora nulls first), '[]'::jsonb)
        from excepcion_servicio e where e.recorrido_id = r.id and e.salida_id is null and e.fecha = p_fecha and (e.sentido is null or e.sentido = sen)),
      'notas', (select coalesce(jsonb_agg(jsonb_build_object('texto', nh.texto, 'estado_info', nh.estado_info, 'tipo_dia', nh.tipo_dia, 'fuente', nh.fuente_id) order by nh.orden, nh.id), '[]'::jsonb)
        from nota_horario nh where nh.recorrido_id = r.id and (nh.sentido is null or nh.sentido = sen) and (nh.tipo_dia is null or nh.tipo_dia = td)),
      'fuentes', (select coalesce(jsonb_agg(jsonb_build_object('id', f.id, 'titulo', f.titulo, 'url', f.url, 'tipo', f.tipo, 'publicada_en', f.publicada_en, 'verificada_en', f.verificada_en) order by f.id), '[]'::jsonb)
        from fuente f where f.id in (select rf.fuente_id from recorrido_fuente rf where rf.recorrido_id = r.id)));
  end loop;
  return jsonb_build_object('fecha', p_fecha, 'tipo_dia', td, 'origen', p_origen, 'destino', p_destino, 'alternativas', res);
end $$;
grant execute on function tipo_dia_de(date), alternativas(text, text, date) to anon, authenticated;
