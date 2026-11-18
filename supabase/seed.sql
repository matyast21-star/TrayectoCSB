-- Datos de EJEMPLO para el piloto (coordenadas aproximadas; tarifas y horarios no oficiales)
insert into localidad (id, nombre, comuna, centro, estado) values
 ('casablanca','Casablanca','Casablanca', st_makepoint(-71.4097,-33.3197)::geography,'piloto'),
 ('curacavi','Curacaví','Curacaví', st_makepoint(-71.1336,-33.4038)::geography,'proximamente'),
 ('valparaiso','Valparaíso','Valparaíso', st_makepoint(-71.6127,-33.0472)::geography,'proximamente'),
 ('vina','Viña del Mar','Viña del Mar', st_makepoint(-71.5518,-33.0245)::geography,'proximamente'),
 ('quilpue','Quilpué','Quilpué', st_makepoint(-71.4425,-33.0479)::geography,'proximamente'),
 ('santiago','Santiago','Santiago', st_makepoint(-70.6693,-33.4489)::geography,'destino');

insert into tarifa (localidad_id, clase, base, por_km, por_min, minimo) values
 ('casablanca','eco',900,650,110,2500),('curacavi','eco',900,650,110,2500),
 ('valparaiso','eco',1000,700,130,2800),('vina','eco',1000,700,130,2800),
 ('quilpue','eco',950,680,120,2600),('santiago','eco',1100,750,140,3000);
insert into tarifa (localidad_id, clase, bajada_bandera, por_200m) values ('casablanca','taxi',450,190);

insert into lugar (id, localidad_id, nombre, tipo, punto) values
 ('cb-plaza','casablanca','Plaza de Armas','plaza', st_makepoint(-71.4097,-33.3197)::geography),
 ('cb-term','casablanca','Terminal de buses','terminal', st_makepoint(-71.4043,-33.3215)::geography),
 ('cu-term','curacavi','Paradero Ruta 68 Curacaví','paradero', st_makepoint(-71.1293,-33.3993)::geography),
 ('va-term','valparaiso','Terminal Rodoviario Valparaíso','terminal', st_makepoint(-71.6127,-33.0472)::geography),
 ('vi-term','vina','Terminal de Viña','terminal', st_makepoint(-71.5518,-33.0245)::geography),
 ('qu-centro','quilpue','Centro de Quilpué','plaza', st_makepoint(-71.4425,-33.0479)::geography),
 ('st-paj','santiago','Terminal Pajaritos','terminal', st_makepoint(-70.7425,-33.4565)::geography),
 ('st-sur','santiago','Terminal Sur (Estación Central)','terminal', st_makepoint(-70.6870,-33.4540)::geography),
 ('st-air','santiago','Aeropuerto de Santiago (SCL)','aeropuerto', st_makepoint(-70.7858,-33.3930)::geography);
