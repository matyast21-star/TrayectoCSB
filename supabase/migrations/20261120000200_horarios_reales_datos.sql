-- Módulo 1 (datos): operadores, recorridos y horarios entregados por el equipo VAMO el 19-11-2026.
-- Todo queda como «publicado sin verificar», «referencial» o «incompleto» según la información disponible.
-- Nada se calcula, invierte ni completa. Los recorridos de ejemplo se desactivan (no se borran).
set search_path = public, extensions;

-- Localidad nueva
insert into localidad (id, nombre, comuna, region, centro, estado) values
  ('villa_alemana', 'Villa Alemana', 'Villa Alemana', 'Valparaíso', st_setsrid(st_makepoint(-71.3740, -33.0428), 4326)::geography, 'proximamente')
on conflict (id) do nothing;

-- Lugares: todos sin verificar; ninguno es paradero oficial
insert into lugar (id, localidad_id, nombre, tipo, punto, verificado, nota) values
  ('qu-chacao', 'quilpue', 'Canal Chacao, Quilpué', 'punto_salida', st_setsrid(st_makepoint(-71.4330, -33.0520), 4326)::geography, false, 'Ubicación aproximada. Punto exacto por verificar.'),
  ('va-villa', 'villa_alemana', 'Villa Alemana (paso)', 'paso', st_setsrid(st_makepoint(-71.3740, -33.0428), 4326)::geography, false, 'Paso por Villa Alemana; paradero no informado.'),
  ('cb-ref', 'casablanca', 'Casablanca (punto no informado)', 'referencia', st_setsrid(st_makepoint(-71.4097, -33.3197), 4326)::geography, false, 'Punto de salida o llegada en Casablanca no informado.'),
  ('va-ref', 'valparaiso', 'Valparaíso (punto no informado)', 'referencia', st_setsrid(st_makepoint(-71.6150, -33.0450), 4326)::geography, false, 'Punto en Valparaíso no informado.'),
  ('cb-muni', 'casablanca', 'Costado de la Municipalidad de Casablanca', 'punto_salida', st_setsrid(st_makepoint(-71.4090, -33.3192), 4326)::geography, false, 'Ubicación aproximada.'),
  ('va-congreso', 'valparaiso', 'Sector Congreso, Valparaíso', 'referencia', st_setsrid(st_makepoint(-71.6067, -33.0478), 4326)::geography, false, 'Ubicación aproximada.'),
  ('cb-pasarela', 'casablanca', 'Pasarela Chacabuco / Cruce Casablanca (Ruta 68)', 'referencia', st_setsrid(st_makepoint(-71.4165, -33.3070), 4326)::geography, false,
   'Punto de referencia, no paradero oficial. Cada empresa debe confirmar si recoge pasajeros aquí. Tarifa referencial informada al Terminal Rodoviario de Valparaíso: $3.000 a $3.500 (no aplica a todas las empresas).')
on conflict (id) do nothing;

-- Fuentes
insert into fuente (id, titulo, url, tipo, publicada_en, notas) values
  ('brander-fb-grupo', 'Publicación de horarios Brander Bus (grupo de Facebook)', 'https://www.facebook.com/groups/3026967210683023/posts/26583231027963310/', 'facebook', null, 'Horarios publicados, pendientes de verificación.'),
  ('brander-fb-pagina', 'Página de referencia (Facebook)', 'https://www.facebook.com/ponceybrander/', 'facebook', null, 'El nombre de la página no implica necesariamente el nombre comercial del servicio.'),
  ('mirasur-fb', 'MiraSur (Facebook)', 'https://www.facebook.com/p/MiraSur-100054391306714/', 'facebook', null, null),
  ('mirasur-fb-grupo', 'Horarios Mira-Sur (grupo de Facebook)', 'https://www.facebook.com/groups/187196101861030/posts/2071593026754652/', 'facebook', null, null),
  ('mirasur-web', 'Transportes Mira-Sur: contacto', 'https://transportes-mirasur.webnode.cl/contactenos/', 'sitio', null, null),
  ('biobio-2026-06-09', 'BioBioChile: oficio a Seremi por fallas en bus Casablanca–Valparaíso', 'https://www.biobiochile.cl/noticias/nacional/region-de-valparaiso/2026/06/09/bassa-fa-oficia-a-seremi-de-transportes-por-fallas-en-servicio-de-bus-que-une-casablanca-valparaiso.shtml', 'noticia', '2026-06-09', 'Referencia histórica; no indica el estado actual del servicio.'),
  ('busescb-rome2rio', 'Rome2rio: Casablanca a Valparaíso en bus', 'https://www.rome2rio.com/es/Autob%C3%BAs/Casablanca-Regi%C3%B3n-de-Valpara%C3%ADso-Chile/Valpara%C3%ADso', 'agregador', null, 'Frecuencia aproximada; no es horario oficial.'),
  ('busescb-fb', 'Horarios Buses Casablanca (Facebook)', 'https://www.facebook.com/100036848216161/posts/horarios-buses-casablanca-martes-2403casablanca-valpara%C3%ADso-730-830-930-1030-1230/3065642273497900/', 'facebook', null, null),
  ('flixbus-ruta', 'FlixBus: Casablanca a Valparaíso', 'https://www.flixbus.cl/rutas-bus/casablanca-valparaiso-valparaiso', 'sitio', null, 'Horarios referenciales; consultar la fecha en FlixBus.'),
  ('kupos-cb-valpo', 'Kupos: buses Casablanca a Valparaíso', 'https://kupos.cl/es/buses/casablanca/valparaiso', 'agregador', null, null),
  ('muni-acercamiento', 'Municipalidad de Casablanca: buses de acercamiento', 'https://www.municipalidadcasablanca.cl/index.php?option=com_content&view=article&id=1202:buses-de-acercamiento&catid=11&Itemid=101', 'sitio', null, 'Vigencia, días, requisitos, tarifa y regreso sin confirmar.'),
  ('equipo-vamo-2026-11-19', 'Información entregada por el equipo VAMO', null, 'usuario', '2026-11-19', 'Datos recopilados por el equipo; pendientes de verificación con cada operador.')
on conflict (id) do nothing;

-- Operadores públicos (empresas, no personas). Buses Casablanca no se crea como empresa hasta verificar si es otro operador.
insert into operador (slug, razon_social, nombre_comercial, alias, tipo, categoria, telefono, sitio_url, compra_url, avisos_url, oficinas, beneficios, estado_info, notas, publico) values
  ('brander-bus', 'Brander Bus', 'Brander Bus', '{}', 'empresa_buses', 'empresa', '+56 9 5941 5257', 'https://www.facebook.com/ponceybrander/', null, null, '[]', null, 'publicado_sin_verificar',
   'El nombre de la página de referencia no implica necesariamente el nombre comercial.', true),
  ('mira-sur', 'Transportes Mira-Sur', 'Mira-Sur', '{"Transportes Mira-Sur","MiraSur"}', 'empresa_buses', 'empresa', '+56 9 8666 8381', 'https://transportes-mirasur.webnode.cl/contactenos/', null,
   'https://www.facebook.com/p/MiraSur-100054391306714/?locale=es_LA',
   '[{"nombre":"Oficina Casablanca","direccion":"Av. Portales 698, Casablanca","verificado":false},{"nombre":"Oficina Valparaíso","direccion":"Terminal Rodoviario, segundo piso, oficina 22","verificado":false}]',
   'Beneficio estudiantil disponible según condiciones informadas (TNE vigente o certificado de alumno regular del año en curso). Consultar tarifa y requisitos vigentes.',
   'publicado_sin_verificar', 'Transporte intercomunal Casablanca ↔ Valparaíso.', true),
  ('flixbus', 'FlixBus', 'FlixBus', '{}', 'empresa_buses', 'empresa', null, 'https://www.flixbus.cl/rutas-bus/casablanca-valparaiso-valparaiso', 'https://www.flixbus.cl/rutas-bus/casablanca-valparaiso-valparaiso', null, '[]', null,
   'referencial', 'Consulta disponibilidad y compra en el sitio de FlixBus.', true),
  ('turbus', 'Turbus', 'Turbus', '{"Tur Bus"}', 'empresa_buses', 'empresa', null, null, 'https://kupos.cl/es/buses/casablanca/valparaiso', null, '[]', null, 'referencial', null, true),
  ('condor-bus', 'Cóndor Bus', 'Cóndor Bus', '{"Condor Bus"}', 'empresa_buses', 'empresa', null, null, 'https://kupos.cl/es/buses/casablanca/valparaiso', null, '[]', null, 'referencial', null, true),
  ('muni-casablanca', 'Municipalidad de Casablanca', 'Municipalidad de Casablanca', '{}', 'empresa_buses', 'municipal', null,
   'https://www.municipalidadcasablanca.cl/index.php?option=com_content&view=article&id=1202:buses-de-acercamiento&catid=11&Itemid=101', null, null, '[]', null, 'incompleto', null, true)
on conflict (slug) do nothing;

-- Recorridos (trazado referencial: línea aproximada entre localidades, no el recorrido exacto)
insert into recorrido (id, codigo, operador_id, operador_nombre, tipo, nombre, trazado, trazado_referencial, precio, duracion_min, localidad_id, color, descripcion, tipo_horario, fuente_horario, frecuencia_aprox_min, estado_info, tarifa_nota, orden)
select v.id, v.id, (select id from operador where slug = v.op), v.opn, 'interurbano', v.nombre, st_setsrid(st_geomfromtext(v.wkt), 4326)::geography, true, null, null, v.loc, v.color, v.descr,
       v.th::tipo_horario, v.fh, v.freq, v.ei::estado_informacion, v.tn, v.orden
from (values
  ('BR1', 'brander-bus', 'Brander Bus', 'Brander Bus · Quilpué – Villa Alemana – Casablanca', 'LINESTRING(-71.4330 -33.0520, -71.3740 -33.0428, -71.3700 -33.1000, -71.3950 -33.2000, -71.4097 -33.3197)', 'quilpue', '#7B2FF7',
   'Quilpué (Canal Chacao) → Villa Alemana → Casablanca. Las tres localidades no representan todos los paraderos.', 'programado', 'Horarios publicados, pendientes de verificación', null::int, 'publicado_sin_verificar', null, 10),
  ('MS1', 'mira-sur', 'Mira-Sur', 'Mira-Sur · Casablanca – Valparaíso', 'LINESTRING(-71.4097 -33.3197, -71.4700 -33.2500, -71.5500 -33.1500, -71.5900 -33.0900, -71.6127 -33.0472)', 'casablanca', '#FF007A',
   'Transporte intercomunal Casablanca ↔ Valparaíso. Hacia Casablanca sale del Terminal Rodoviario de Valparaíso.', 'programado', 'Horarios publicados, pendientes de verificación', null, 'publicado_sin_verificar', null, 11),
  ('BC1', null, 'Buses Casablanca (por verificar)', 'Buses Casablanca · Casablanca – Valparaíso', 'LINESTRING(-71.4097 -33.3197, -71.4700 -33.2500, -71.5500 -33.1500, -71.5900 -33.0900, -71.6150 -33.0450)', 'casablanca', '#00C8FF',
   'Denominación por verificar: podría ser un operador independiente o corresponder a otro servicio. Teléfono informado: (32) 274 1104.', 'estimado', 'Frecuencia aproximada, no oficial', 60, 'referencial', null, 12),
  ('FX1', 'flixbus', 'FlixBus', 'FlixBus · Casablanca – Valparaíso', 'LINESTRING(-71.4097 -33.3197, -71.4700 -33.2500, -71.5500 -33.1500, -71.5900 -33.0900, -71.6127 -33.0472)', 'casablanca', '#73D700',
   'Servicio interurbano. Disponibilidad y compra en el sitio de FlixBus.', 'sin_horario', 'Horarios referenciales; consultar la fecha', null, 'referencial', null, 13),
  ('TB1', 'turbus', 'Turbus', 'Turbus · Ruta 68 – Valparaíso', 'LINESTRING(-71.4165 -33.3070, -71.4700 -33.2500, -71.5500 -33.1500, -71.5900 -33.0900, -71.6127 -33.0472)', 'casablanca', '#1F2A44',
   'Posibles servicios interurbanos por Ruta 68. Abordaje en la pasarela por confirmar.', 'sin_horario', null, null, 'referencial', 'Tarifa referencial informada desde la pasarela: $3.000 a $3.500 (no confirmada para esta empresa).', 14),
  ('CD1', 'condor-bus', 'Cóndor Bus', 'Cóndor Bus · Ruta 68 – Valparaíso', 'LINESTRING(-71.4165 -33.3070, -71.4700 -33.2500, -71.5500 -33.1500, -71.5900 -33.0900, -71.6127 -33.0472)', 'casablanca', '#6B7280',
   'Posibles servicios interurbanos por Ruta 68. Abordaje en la pasarela por confirmar.', 'sin_horario', null, null, 'referencial', 'Tarifa referencial informada desde la pasarela: $3.000 a $3.500 (no confirmada para esta empresa).', 15),
  ('MU1', 'muni-casablanca', 'Municipalidad de Casablanca', 'Bus de acercamiento municipal · Casablanca – Congreso', 'LINESTRING(-71.4090 -33.3192, -71.4700 -33.2500, -71.5500 -33.1500, -71.5900 -33.0900, -71.6067 -33.0478)', 'casablanca', '#FFC107',
   'Costado de la Municipalidad de Casablanca → Sector Congreso, Valparaíso.', 'sin_horario', 'Hora publicada; vigencia sin confirmar', null, 'incompleto', 'Tarifa o gratuidad no confirmada.', 16)
) as v(id, op, opn, nombre, wkt, loc, color, descr, th, fh, freq, ei, tn, orden)
on conflict (id) do nothing;

insert into parada_recorrido (recorrido_id, lugar_id, orden) values
  ('BR1', 'qu-chacao', 1), ('BR1', 'va-villa', 2), ('BR1', 'cb-ref', 3),
  ('MS1', 'cb-ref', 1), ('MS1', 'va-term', 2),
  ('BC1', 'cb-ref', 1), ('BC1', 'va-ref', 2),
  ('FX1', 'cb-ref', 1), ('FX1', 'va-term', 2),
  ('TB1', 'cb-pasarela', 1), ('TB1', 'va-term', 2),
  ('CD1', 'cb-pasarela', 1), ('CD1', 'va-term', 2),
  ('MU1', 'cb-muni', 1), ('MU1', 'va-congreso', 2)
on conflict do nothing;

insert into recorrido_fuente (recorrido_id, fuente_id) values
  ('BR1', 'brander-fb-grupo'), ('BR1', 'brander-fb-pagina'),
  ('MS1', 'mirasur-fb'), ('MS1', 'mirasur-fb-grupo'), ('MS1', 'mirasur-web'), ('MS1', 'biobio-2026-06-09'),
  ('BC1', 'busescb-rome2rio'), ('BC1', 'busescb-fb'),
  ('FX1', 'flixbus-ruta'), ('TB1', 'kupos-cb-valpo'), ('TB1', 'equipo-vamo-2026-11-19'), ('CD1', 'kupos-cb-valpo'), ('CD1', 'equipo-vamo-2026-11-19'),
  ('MU1', 'muni-acercamiento')
on conflict do nothing;

-- Brander Bus, lunes a viernes: salida Canal Chacao, paso Villa Alemana, llegada Casablanca
with v(hora, va, cb) as (values
  ('06:20', '06:50', '08:15'), ('07:25', '08:05', '09:35'), ('08:30', '09:05', '11:00'), ('10:25', '11:05', '12:35'), ('11:50', '12:35', '14:00'),
  ('13:10', '13:50', '16:00'), ('15:25', '16:05', '17:35'), ('16:30', '17:15', '18:30'), ('17:40', '18:35', '19:30')),
ins as (
  insert into salida (recorrido_id, sentido, tipo_dia, hora, estado_info, fuente_id)
  select 'BR1', 'ida', 'lv', v.hora::time, 'publicado_sin_verificar', 'brander-fb-grupo' from v
  on conflict do nothing returning id, hora)
insert into salida_paso (salida_id, orden, localidad_id, lugar_id, hora, es_llegada)
select ins.id, x.orden, x.loc, x.lug, x.h::time, x.lleg
from ins join v on v.hora::time = ins.hora
cross join lateral (values (1, 'quilpue', 'qu-chacao', v.hora, false), (2, 'villa_alemana', 'va-villa', v.va, false), (3, 'casablanca', null, v.cb, true)) as x(orden, loc, lug, h, lleg);

-- Brander Bus, sábados: solo salida desde Canal Chacao (paso y llegada no informados: no se calculan)
insert into salida (recorrido_id, sentido, tipo_dia, hora, estado_info, fuente_id, observacion)
select 'BR1', 'ida', 'sabado', h::time, 'publicado_sin_verificar', 'brander-fb-grupo', 'Paso por Villa Alemana y llegada a Casablanca no informados.'
from unnest(array['08:30', '12:00', '15:30']) h on conflict do nothing;

-- Mira-Sur, Casablanca → Valparaíso, lunes a viernes (13 salidas; 3 con variante informada)
insert into salida (recorrido_id, sentido, tipo_dia, hora, variante_hora, nota_variante, estado_info, fuente_id)
select 'MS1', 'ida', 'lv', v.h::time, v.var::time, case when v.var is not null then 'Variante informada según temporada o programación; no confirmada para fechas concretas.' end,
       'publicado_sin_verificar', 'mirasur-fb-grupo'
from (values ('06:20', '06:30'), ('06:50', '07:10'), ('07:20', null), ('08:00', '08:15'), ('09:00', null), ('10:00', null), ('11:00', null),
             ('12:00', null), ('13:20', null), ('14:50', null), ('15:50', null), ('16:50', null), ('17:50', null)) as v(h, var)
on conflict do nothing;

-- Mira-Sur, Valparaíso (Terminal Rodoviario) → Casablanca, lunes a viernes (11 salidas; sin hora de llegada)
insert into salida (recorrido_id, sentido, tipo_dia, hora, estado_info, fuente_id)
select 'MS1', 'vuelta', 'lv', h::time, 'publicado_sin_verificar', 'mirasur-fb-grupo'
from unnest(array['08:20', '10:20', '11:55', '12:50', '13:50', '14:50', '16:20', '17:20', '18:20', '19:20', '20:00']) h on conflict do nothing;

-- FlixBus: horarios referenciales sin días confirmados
insert into salida (recorrido_id, sentido, tipo_dia, hora, estado_info, fuente_id, observacion)
select 'FX1', 'ida', 'sin_dia', h::time, 'referencial', 'flixbus-ruta', 'Horario referencial. Consulta en FlixBus si opera en la fecha elegida.'
from unnest(array['09:40', '13:40', '17:40', '21:40']) h on conflict do nothing;

-- Bus de acercamiento municipal: hora publicada, sin días ni vigencia confirmados
insert into salida (recorrido_id, sentido, tipo_dia, hora, estado_info, fuente_id, observacion)
values ('MU1', 'ida', 'sin_dia', '06:40', 'incompleto', 'muni-acercamiento', 'Vigencia, días de funcionamiento, requisitos, tarifa y regreso sin confirmar.')
on conflict do nothing;

-- Notas de programación incompleta
insert into nota_horario (recorrido_id, sentido, tipo_dia, texto, estado_info, fuente_id, orden) values
  ('BR1', 'ida', 'sabado', 'Sábados: salidas desde Canal Chacao a las 08:30, 12:00 y 15:30. Paso por Villa Alemana y llegada a Casablanca no informados.', 'incompleto', 'brander-fb-grupo', 10),
  ('BR1', 'ida', 'domingo', 'Domingos: sin servicio según la información publicada. Vigencia pendiente de verificación.', 'incompleto', 'brander-fb-grupo', 10),
  ('BR1', 'ida', 'feriado', 'Feriados: programación no informada.', 'incompleto', null, 10),
  ('BR1', 'vuelta', null, 'Horarios de regreso (Casablanca → Villa Alemana → Quilpué) pendientes de confirmación. VAMO no usa los horarios de ida para el regreso.', 'incompleto', null, 1),
  ('MS1', 'ida', 'sabado', 'Fines de semana: programación completa pendiente de confirmación. No se usan los horarios de lunes a viernes.', 'incompleto', null, 10),
  ('MS1', 'ida', 'domingo', 'Fines de semana: programación completa pendiente de confirmación. No se usan los horarios de lunes a viernes.', 'incompleto', null, 10),
  ('MS1', 'vuelta', 'sabado', 'Fines de semana: última salida reportada desde Valparaíso a las 19:20 (no garantizada todos los sábados). Programación completa pendiente de confirmación.', 'incompleto', 'equipo-vamo-2026-11-19', 10),
  ('MS1', 'vuelta', 'domingo', 'Fines de semana: última salida reportada desde Valparaíso a las 19:20 (no garantizada todos los domingos). Programación completa pendiente de confirmación.', 'incompleto', 'equipo-vamo-2026-11-19', 10),
  ('MS1', null, 'feriado', 'Feriados: se han informado horarios reducidos (ejemplo referencial: 13:50). No aplica necesariamente a todos los feriados.', 'referencial', 'equipo-vamo-2026-11-19', 10),
  ('MS1', null, null, 'El servicio ha presentado cambios de frecuencia y suspensiones repentinas según información pública. VAMO no consulta Facebook automáticamente: revisa los avisos de Mira-Sur antes de viajar.', 'referencial', 'biobio-2026-06-09', 50),
  ('BC1', 'ida', null, 'Frecuencia aproximada cada 60 minutos, desde alrededor de las 07:30 hasta cerca de las 22:00. No es un horario oficial: VAMO no genera salidas a partir de esta frecuencia.', 'referencial', 'busescb-rome2rio', 1),
  ('BC1', null, null, 'Por verificar si «Buses Casablanca» es un operador independiente o corresponde a otro servicio, por ejemplo Mira-Sur. Teléfono informado: (32) 274 1104.', 'referencial', 'busescb-fb', 2),
  ('BC1', 'vuelta', null, 'Horarios Valparaíso → Casablanca no informados.', 'incompleto', null, 3),
  ('FX1', null, null, 'No se asume que opere todos los días. Consulta disponibilidad por fecha y compra en el sitio de FlixBus.', 'referencial', 'flixbus-ruta', 1),
  ('FX1', 'vuelta', null, 'Horarios Valparaíso → Casablanca no informados.', 'incompleto', null, 2),
  ('TB1', null, null, 'Se informaron salidas a las 13:20 y 13:30 para Turbus o Cóndor Bus, sin saber a qué empresa corresponde cada una. Consulta horarios en Kupos.', 'referencial', 'equipo-vamo-2026-11-19', 1),
  ('CD1', null, null, 'Se informaron salidas a las 13:20 y 13:30 para Turbus o Cóndor Bus, sin saber a qué empresa corresponde cada una. Consulta horarios en Kupos.', 'referencial', 'equipo-vamo-2026-11-19', 1),
  ('TB1', 'vuelta', null, 'Horarios Valparaíso → Casablanca no informados.', 'incompleto', null, 2),
  ('CD1', 'vuelta', null, 'Horarios Valparaíso → Casablanca no informados.', 'incompleto', null, 2),
  ('MU1', 'ida', null, 'Hora publicada: 06:40. No es una salida diaria confirmada: vigencia, días, requisitos de acceso y tarifa o gratuidad sin confirmar.', 'incompleto', 'muni-acercamiento', 1),
  ('MU1', 'vuelta', null, 'Horario de regreso no informado.', 'incompleto', null, 2);

-- Feriados fijos próximos (el resto se carga desde el panel de administración)
insert into feriado (fecha, nombre) values
  ('2026-12-08', 'Inmaculada Concepción'), ('2026-12-25', 'Navidad'), ('2027-01-01', 'Año Nuevo')
on conflict do nothing;

-- Recorridos de ejemplo: se desactivan, no se borran (decisión del 19-11-2026)
update recorrido set activo = false, actualizado_en = now()
where activo and (operador_nombre ilike '%ejemplo%' or fuente_horario ilike '%ejemplo%');

-- C1 y C2 venían del seed de prueba (sin operador, tarifa y frecuencia estimadas): los reemplazan Brander Bus y Mira-Sur
update recorrido set activo = false, actualizado_en = now() where id in ('C1', 'C2') and operador_id is null and activo;
