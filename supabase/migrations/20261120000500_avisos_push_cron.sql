-- VAMO · Avisos push cada minuto. Requiere la Edge Function «avisos-push» desplegada.
-- Secretos dentro de la base, sin acceso para anon/authenticated (RLS sin políticas + sin grants):
--   avisos_token se genera aquí; el par VAPID lo genera la función en su primera llamada (accion = 'iniciar').
create extension if not exists pg_net;
create extension if not exists pg_cron;
create table if not exists flota.config_privada (clave text primary key, valor text not null, creado_en timestamptz not null default now());
alter table flota.config_privada enable row level security;
grant usage on schema flota to service_role;
grant select, insert on flota.config_privada to service_role;
grant select on flota.evento_servicio to service_role;
grant select, insert, update, delete on public.alerta_pasajero, public.preferencia_pasajero, public.notificacion, public.suscripcion_push to service_role;
insert into flota.config_privada (clave, valor) values ('avisos_token', encode(extensions.gen_random_bytes(24), 'hex')) on conflict (clave) do nothing;

-- Solo la llama pg_cron (sesión «postgres»); desde la API (sesión «authenticator») se rechaza.
create or replace function flota.llamar_avisos_push(accion text default 'enviar') returns bigint language plpgsql security definer set search_path = '' as $$
declare r bigint;
begin
  if session_user not in ('postgres', 'supabase_admin') then raise exception 'No autorizado'; end if;
  select net.http_post(
    url := 'https://fryjiahvhjtuizgvtxtn.supabase.co/functions/v1/avisos-push',
    headers := jsonb_build_object('Content-Type', 'application/json'),
    body := jsonb_build_object('accion', accion, 'token', (select valor from flota.config_privada where clave = 'avisos_token')),
    timeout_milliseconds := 20000) into r;
  return r;
end $$;
select cron.schedule('vamo-avisos-push', '* * * * *', $$ select flota.llamar_avisos_push('enviar') $$);
