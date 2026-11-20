-- Con «return=representation» el vehículo recién creado debe ser visible para su dueño en la misma sentencia
-- (es_dueno() no ve la fila que se está insertando).
create policy dueno_ve_propio on flota.vehiculo for select to authenticated
  using (exists (select 1 from flota.propietario p where p.id = propietario_id and p.usuario_id = auth.uid()));
