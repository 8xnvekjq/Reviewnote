-- 전역 설정: 단일 행, 직접 접근 금지.
create table pixel_private.world_override (
 id boolean primary key default true check (id = true),
 weather text check (weather in ('clear','cloudy','rain')),
 phase text check (phase in ('morning','day','evening','night')),
 expires_at timestamptz not null, set_by uuid, updated_at timestamptz not null default now()
);
alter table pixel_private.world_override enable row level security;
revoke all on pixel_private.world_override from public, anon, authenticated;
create or replace function public.admin_set_pixel_world_override(p_weather text, p_phase text, p_hours int default 3)
returns void language plpgsql security definer set search_path = '' as $$
begin
 if auth.uid() is null or not coalesce(private.is_current_user_admin(), false) then
  raise exception 'PIXEL_ADMIN_REQUIRED' using errcode = '42501';
 end if;
 if (p_weather is not null and p_weather not in ('clear','cloudy','rain')) or
    (p_phase is not null and p_phase not in ('morning','day','evening','night')) then
  raise exception 'PIXEL_OVERRIDE_INVALID' using errcode = '22023';
 end if;
 if p_weather is null and p_phase is null then delete from pixel_private.world_override where id = true; return; end if;
 -- 0은 오늘 끝까지, 나머지는 1~24시간으로 제한한다.
 insert into pixel_private.world_override (id,weather,phase,expires_at,set_by,updated_at)
 values (true,p_weather,p_phase,
  case when p_hours = 0 then ((now() at time zone 'Asia/Seoul')::date + 1)::timestamp at time zone 'Asia/Seoul'
       else now() + make_interval(hours => greatest(1,least(24,coalesce(p_hours,3)))) end,auth.uid(),now())
 on conflict (id) do update set weather=excluded.weather, phase=excluded.phase, expires_at=excluded.expires_at,
 set_by=excluded.set_by, updated_at=excluded.updated_at;
end $$;
revoke all on function public.admin_set_pixel_world_override(text,text,int) from public, anon;
grant execute on function public.admin_set_pixel_world_override(text,text,int) to authenticated;
create or replace function pixel_private.fish_clock(p_override_clock text, p_override_weather text,
  out kst_date date, out minutes integer, out phase text, out weather text)
language plpgsql stable security definer set search_path = '' as $$
declare
  t timestamp := now() at time zone 'Asia/Seoul';
  v_override pixel_private.world_override%rowtype;
  v_admin boolean := case when p_override_clock is not null or p_override_weather is not null then private.is_current_user_admin() else false end;
begin
  kst_date := t::date;
  minutes := extract(hour from t)::integer * 60 + extract(minute from t)::integer;
  select * into v_override from pixel_private.world_override where id = true and expires_at > now();
  if v_override.phase is not null then
    minutes := case v_override.phase when 'morning' then 480 when 'day' then 720 when 'evening' then 1110 else 1320 end;
  end if;
  if v_admin and p_override_clock ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' then
    minutes := split_part(p_override_clock, ':', 1)::integer * 60 + split_part(p_override_clock, ':', 2)::integer;
  end if;
  phase := pixel_private.fish_phase_for(minutes);
  weather := case when v_admin and p_override_weather in ('clear','cloudy','rain') then p_override_weather
                  else coalesce(v_override.weather, pixel_private.fish_weather_for(kst_date)) end;
end $$;

create or replace function public.get_pixel_world_clock()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare c record; o pixel_private.world_override%rowtype;
begin
 if auth.uid() is null then raise exception 'Authentication required' using errcode = '42501'; end if;
 select * into c from pixel_private.fish_clock(null,null);
 select * into o from pixel_private.world_override where id=true and expires_at>now();
 return jsonb_build_object('kstDate',c.kst_date,'minutes',c.minutes,'phase',c.phase,'weather',c.weather,
 'override',case when o.id is not null then jsonb_build_object('weather',o.weather,'phase',o.phase,'expiresAt',o.expires_at) else null end,'serverNow',now());
end $$;
revoke all on function public.get_pixel_world_clock() from public, anon;
grant execute on function public.get_pixel_world_clock() to authenticated;
