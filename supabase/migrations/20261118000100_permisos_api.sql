-- Permisos para la API (RLS sigue limitando qué filas ve cada usuario)
grant usage on schema public to anon, authenticated;
grant select on localidad, tarifa, lugar, recorrido, parada_recorrido, horario, posicion_vehiculo, vehiculo to anon, authenticated;
grant select, insert, update, delete on operador, vehiculo, conductor, posicion_vehiculo, plan_cobro to authenticated;
grant select, insert on viaje to authenticated;
grant select on pasaje, cargo_plataforma to authenticated;
grant execute on function vehiculos_cercanos(double precision, double precision, int, tipo_vehiculo) to anon, authenticated;
