-- 광장 presence에 auth uid를 노출하지 않고 카드 대결 상대를 찾는 단기 토큰.
begin;

create table pixel_private.card_rps_presence_tokens (
  token uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references public.profiles(id) on delete cascade,
  refreshed_at timestamptz not null default now()
);
alter table pixel_private.card_rps_presence_tokens enable row level security;
revoke all on pixel_private.card_rps_presence_tokens from public, anon, authenticated, service_role;

create function public.register_card_rps_presence() returns uuid
language plpgsql security definer set search_path='' as $$
declare u uuid := auth.uid(); result uuid;
begin
  if u is null then raise exception 'not authenticated'; end if;
  insert into pixel_private.card_rps_presence_tokens(user_id, token, refreshed_at)
  values (u, gen_random_uuid(), now())
  on conflict(user_id) do update set token=gen_random_uuid(), refreshed_at=now()
  returning token into result;
  return result;
end $$;

create function public.invite_card_rps_presence(p_token uuid, p_stake integer) returns jsonb
language plpgsql security definer set search_path='' as $$
declare opponent uuid;
begin
  select user_id into opponent from pixel_private.card_rps_presence_tokens
  where token=p_token and refreshed_at > now()-interval '12 hours';
  if opponent is null then perform pixel_private.card_rps_error('offline'); end if;
  return public.invite_card_rps(opponent,p_stake);
end $$;

revoke all on function public.register_card_rps_presence(), public.invite_card_rps_presence(uuid,integer) from public, anon;
grant execute on function public.register_card_rps_presence(), public.invite_card_rps_presence(uuid,integer) to authenticated;
commit;
