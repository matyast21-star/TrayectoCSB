-- Avisos públicos de servicio suspendido por el dueño (solo vehículos verificados; sin datos del dueño)
create or replace view flota.avisos_servicio as
  select v.tipo, v.patente, v.recorrido_id, v.aviso_pausa
  from flota.vehiculo v
  where v.en_pausa and v.aviso_pausa is not null and v.estado_verificacion = 'verificado';
grant select on flota.avisos_servicio to anon, authenticated;
