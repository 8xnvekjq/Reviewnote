-- Two private plots. Only the authenticated action RPC may change lifecycle data.
create table public.pixel_farm_crops (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  plot_index smallint not null check (plot_index between 0 and 1),
  crop_type text not null default 'tomato' check (crop_type = 'tomato'),
  planted_at timestamptz not null,
  ready_at timestamptz not null,
  harvested_at timestamptz,
  care_count integer not null default 0 check (care_count >= 0),
  last_watered_on date,
  unique (user_id, id),
  check (ready_at > planted_at),
  check (harvested_at is null or harvested_at >= ready_at)
);
create unique index pixel_farm_one_live_crop on public.pixel_farm_crops(user_id, plot_index) where harvested_at is null;
create index pixel_farm_crop_history on public.pixel_farm_crops(user_id, harvested_at);
create table public.pixel_farm_plots (
  user_id uuid not null references public.profiles(id) on delete cascade,
  plot_index smallint not null check (plot_index between 0 and 1),
  revision bigint not null default 0 check (revision >= 0),
  crop_id uuid,
  primary key (user_id, plot_index),
  foreign key (user_id, crop_id) references public.pixel_farm_crops(user_id, id)
);
create index pixel_farm_plot_crop on public.pixel_farm_plots(user_id, crop_id);
create table public.pixel_farm_care (
  user_id uuid not null references public.profiles(id) on delete cascade,
  crop_id uuid not null,
  care_day date not null,
  watered_at timestamptz not null,
  primary key (crop_id, care_day),
  foreign key (user_id, crop_id) references public.pixel_farm_crops(user_id, id) on delete cascade
);
create index pixel_farm_care_owner on public.pixel_farm_care(user_id, crop_id);
alter table public.pixel_farm_plots enable row level security;
alter table public.pixel_farm_crops enable row level security;
alter table public.pixel_farm_care enable row level security;
revoke all on public.pixel_farm_plots, public.pixel_farm_crops, public.pixel_farm_care from public, anon, authenticated;
grant select on public.pixel_farm_plots, public.pixel_farm_crops, public.pixel_farm_care to authenticated;
create policy pixel_farm_plots_read on public.pixel_farm_plots for select to authenticated using ((select auth.uid()) = user_id);
create policy pixel_farm_crops_read on public.pixel_farm_crops for select to authenticated using ((select auth.uid()) = user_id);
create policy pixel_farm_care_read on public.pixel_farm_care for select to authenticated using ((select auth.uid()) = user_id);

create function public.get_pixel_farm() returns jsonb language plpgsql security invoker set search_path = '' as $$
declare u uuid := auth.uid(); t timestamptz := clock_timestamp(); result jsonb;
begin
  if u is null then raise exception 'Authentication required' using errcode = '42501'; end if;
  select jsonb_build_object('serverNow',t,'today',(t at time zone 'Asia/Seoul')::date,
    'harvestCount',(select count(*) from public.pixel_farm_crops where user_id=u and harvested_at is not null),
    'plots',jsonb_agg(jsonb_build_object('index',n,'revision',coalesce(p.revision,0),
      'crop',case when c.id is null then null else jsonb_build_object('id',c.id,'plantedAt',c.planted_at,
        'readyAt',c.ready_at,'careCount',c.care_count,'lastWateredOn',c.last_watered_on) end) order by n)) into result
    from generate_series(0,1) n
    left join public.pixel_farm_plots p on p.user_id=u and p.plot_index=n
    left join public.pixel_farm_crops c on c.user_id=u and c.id=p.crop_id;
  return result;
end $$;

-- Keep the privileged implementation outside the Data API's exposed schema.
create schema if not exists pixel_private;
revoke all on schema pixel_private from public, anon;
grant usage on schema pixel_private to authenticated;
create function pixel_private.farm_action(p_plot integer, p_action text, p_revision bigint)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  u uuid := auth.uid(); p public.pixel_farm_plots%rowtype; c public.pixel_farm_crops%rowtype;
  t timestamptz; day date; result text := 'ok';
begin
  if u is null then raise exception 'Authentication required' using errcode = '42501'; end if;
  if p_plot is null or p_plot not between 0 and 1 or p_action is null or p_action not in ('plant','water','harvest') or p_revision is null or p_revision < 0 then
    raise exception 'Invalid farm action' using errcode = '22023';
  end if;
  insert into public.pixel_farm_plots(user_id,plot_index) values(u,p_plot) on conflict do nothing;
  select * into p from public.pixel_farm_plots where user_id=u and plot_index=p_plot for update;
  -- Compare-and-swap makes retries and simultaneous devices harmless, including replanting.
  if p.revision <> p_revision then return public.get_pixel_farm() || jsonb_build_object('result','changed'); end if;
  t := clock_timestamp(); day := (t at time zone 'Asia/Seoul')::date;
  select * into c from public.pixel_farm_crops where user_id=u and id=p.crop_id;
  if p_action = 'plant' then
    if p.crop_id is not null then result := 'changed';
    else
      insert into public.pixel_farm_crops(user_id,plot_index,planted_at,ready_at)
        values(u,p_plot,t,t + interval '24 hours') returning * into c;
      update public.pixel_farm_plots set crop_id=c.id,revision=revision+1 where user_id=u and plot_index=p_plot;
    end if;
  elsif p.crop_id is null then result := 'changed';
  elsif p_action = 'water' then
    if c.last_watered_on = day then result := 'already_watered';
    elsif t >= c.ready_at then result := 'ready';
    else
      insert into public.pixel_farm_care(user_id,crop_id,care_day,watered_at) values(u,c.id,day,t);
      update public.pixel_farm_crops set care_count=care_count+1,last_watered_on=day where id=c.id;
      update public.pixel_farm_plots set revision=revision+1 where user_id=u and plot_index=p_plot;
    end if;
  elsif t < c.ready_at then result := 'growing';
  else
    update public.pixel_farm_crops set harvested_at=t where id=c.id;
    update public.pixel_farm_plots set crop_id=null,revision=revision+1 where user_id=u and plot_index=p_plot;
  end if;
  return public.get_pixel_farm() || jsonb_build_object('result',result);
end $$;
create function public.act_pixel_farm(p_plot integer, p_action text, p_revision bigint)
returns jsonb language sql security invoker set search_path = '' as $$
  select pixel_private.farm_action(p_plot,p_action,p_revision);
$$;
revoke all on function public.get_pixel_farm(), public.act_pixel_farm(integer,text,bigint), pixel_private.farm_action(integer,text,bigint) from public, anon, authenticated;
grant execute on function public.get_pixel_farm(), public.act_pixel_farm(integer,text,bigint), pixel_private.farm_action(integer,text,bigint) to authenticated;
