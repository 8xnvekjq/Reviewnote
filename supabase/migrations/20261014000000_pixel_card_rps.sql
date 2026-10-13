-- 천광명월 카드 가위바위보: 서버 판정, 비공개 제출, 포인트 정산.
begin;

create schema if not exists pixel_private;

create table public.pixel_card_rps_settings (
  singleton boolean primary key default true check (singleton),
  friend_stakes integer[] not null check (friend_stakes <@ array[10,20,50]),
  npc_entry integer not null check (npc_entry >= 0),
  npc_reward integer not null check (npc_reward >= 0),
  npc_daily_reward_wins integer not null check (npc_daily_reward_wins >= 0),
  updated_at timestamptz not null default now()
);
insert into public.pixel_card_rps_settings(singleton,friend_stakes,npc_entry,npc_reward,npc_daily_reward_wins)
values(true,array[10,20,50],10,20,5) on conflict(singleton) do nothing;

create table public.pixel_card_rps_matches (
  id uuid primary key default gen_random_uuid(),
  mode text not null check(mode in ('friend','npc')),
  status text not null check(status in ('invited','choosing','revealing','shootout','finished','declined','expired','cancelled')),
  player_a uuid not null references public.profiles(id) on delete cascade,
  player_b uuid references public.profiles(id) on delete cascade,
  stake integer not null default 0 check(stake >= 0), prize integer not null default 0 check(prize >= 0),
  state jsonb not null default '{"inventory":{"a":{"rock":3,"scissors":3,"paper":3},"b":{"rock":3,"scissors":3,"paper":3}},"rounds":[],"wins":{"a":0,"b":0},"shootout":[]}'::jsonb,
  deadline_at timestamptz, invite_expires_at timestamptz,
  winner_id text, end_reason text check(end_reason is null or end_reason in ('wins','shootout','timeout','left')),
  settled boolean not null default false,
  a_delta integer, b_delta integer,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(), finished_at timestamptz
);
create unique index pixel_card_rps_active_a on public.pixel_card_rps_matches(player_a) where status in ('invited','choosing','revealing','shootout');
create unique index pixel_card_rps_active_b on public.pixel_card_rps_matches(player_b) where player_b is not null and status in ('invited','choosing','revealing','shootout');
create index pixel_card_rps_invites on public.pixel_card_rps_matches(player_b,invite_expires_at) where status='invited';

create table pixel_private.card_rps_submissions (
  match_id uuid not null references public.pixel_card_rps_matches(id) on delete cascade,
  turn integer not null, side text not null check(side in ('a','b')), kind text not null check(kind in ('round','shootout')),
  cards text[] not null check(cards <@ array['rock','scissors','paper']), submitted_at timestamptz not null default now(),
  primary key(match_id,turn,side,kind)
);
create table pixel_private.card_rps_point_log (
  id bigint generated always as identity primary key, match_id uuid references public.pixel_card_rps_matches(id),
  user_id uuid not null references public.profiles(id), amount integer not null, reason text not null, created_at timestamptz not null default now()
);
create table pixel_private.card_rps_npc_wins (
  user_id uuid not null references public.profiles(id), kst_date date not null, wins integer not null default 0 check(wins>=0), primary key(user_id,kst_date)
);

alter table public.pixel_card_rps_settings enable row level security;
alter table public.pixel_card_rps_matches enable row level security;
alter table pixel_private.card_rps_submissions enable row level security;
alter table pixel_private.card_rps_point_log enable row level security;
alter table pixel_private.card_rps_npc_wins enable row level security;
create policy card_rps_settings_read on public.pixel_card_rps_settings for select to authenticated using(true);
create policy card_rps_match_participant_read on public.pixel_card_rps_matches for select to authenticated using(auth.uid()=player_a or auth.uid()=player_b);
revoke all on pixel_private.card_rps_submissions,pixel_private.card_rps_point_log,pixel_private.card_rps_npc_wins from public,anon,authenticated,service_role;
revoke insert,update,delete on public.pixel_card_rps_settings,public.pixel_card_rps_matches from public,anon,authenticated;
grant select on public.pixel_card_rps_settings,public.pixel_card_rps_matches to authenticated;

create or replace function pixel_private.card_rps_error(p_code text) returns void language plpgsql volatile set search_path='' as $$
begin raise exception '%',p_code using errcode='P0001',hint=p_code; end $$;

create or replace function pixel_private.card_rps_adjust(p_match uuid,p_user uuid,p_amount integer,p_reason text) returns void
language plpgsql security definer set search_path='' as $$
declare v_bonus integer; v_adjust integer;
begin
  select coalesce(bonus_points,0),coalesce(point_adjustment,0) into v_bonus,v_adjust from public.profiles where id=p_user for update;
  if not found then perform pixel_private.card_rps_error('not_found'); end if;
  if p_amount<0 and greatest(0,v_bonus+v_adjust)<-p_amount then perform pixel_private.card_rps_error('not_enough_points'); end if;
  perform set_config('reviewnote.pixel_rpc','true',true);
  update public.profiles set point_adjustment=coalesce(point_adjustment,0)+p_amount where id=p_user;
  insert into pixel_private.card_rps_point_log(match_id,user_id,amount,reason) values(p_match,p_user,p_amount,p_reason);
end $$;

create or replace function pixel_private.card_rps_compare(a text,b text) returns integer language sql immutable strict set search_path='' as $$
 select case when a=b then 0 when (a='rock' and b='scissors') or (a='scissors' and b='paper') or (a='paper' and b='rock') then 1 else -1 end $$;

create or replace function pixel_private.card_rps_resolve_round(a text[],b text[]) returns jsonb language plpgsql immutable set search_path='' as $$
declare i integer:=1;j integer:=1;r integer; clashes jsonb:='[]'; result text;
begin
 while i<=cardinality(a) and j<=cardinality(b) loop
  r:=pixel_private.card_rps_compare(a[i],b[j]); result:=case when r=0 then 'draw' when r>0 then 'a' else 'b' end;
  clashes:=clashes||jsonb_build_array(jsonb_build_object('aIndex',i-1,'bIndex',j-1,'a',a[i],'b',b[j],'result',result));
  if r=0 then i:=i+1;j:=j+1; elsif r>0 then j:=j+1; else i:=i+1; end if;
 end loop;
 result:=case when i>cardinality(a) and j>cardinality(b) then 'draw' when i>cardinality(a) then 'b' else 'a' end;
 return jsonb_build_object('a',to_jsonb(a),'b',to_jsonb(b),'clashes',clashes,'winner',result);
end $$;

create or replace function pixel_private.card_rps_remove(inv jsonb,cards text[]) returns jsonb language plpgsql immutable set search_path='' as $$
declare h text; r jsonb:=inv;
begin foreach h in array cards loop r:=jsonb_set(r,array[h],to_jsonb(greatest(0,(r->>h)::int-1))); end loop; return r; end $$;

create or replace function pixel_private.card_rps_valid(inv jsonb,cards text[]) returns boolean language sql immutable set search_path='' as $$
 select cards <@ array['rock','scissors','paper'] and (cardinality(cards)>0 or coalesce((inv->>'rock')::int,0)+coalesce((inv->>'scissors')::int,0)+coalesce((inv->>'paper')::int,0)=0)
 and (select count(*) from unnest(cards)c where c='rock') <= (inv->>'rock')::int
 and (select count(*) from unnest(cards)c where c='scissors') <= (inv->>'scissors')::int
 and (select count(*) from unnest(cards)c where c='paper') <= (inv->>'paper')::int $$;

create or replace function pixel_private.card_rps_npc_cards(inv jsonb,opp jsonb,round_no integer,opp_wins integer) returns text[] language plpgsql volatile set search_path='' as $$
declare total integer:=(inv->>'rock')::int+(inv->>'scissors')::int+(inv->>'paper')::int; leftn integer:=greatest(1,4-round_no); n integer; out text[]:='{}'; work jsonb:=inv; owned text[]; h text;
begin
 if total=0 then return out; end if;
 n:=round(total::numeric/leftn+(random()*2-1)); if opp_wins=1 then n:=n+1+floor(random()*2)::int; end if; if leftn=1 then n:=total; end if; n:=greatest(1,least(total,n));
 for k in 1..n loop
  select array_agg(x) into owned from unnest(array['rock','scissors','paper'])x where (work->>x)::int>0;
  h:=owned[1+floor(random()*cardinality(owned))::int]; out:=out||h; work:=jsonb_set(work,array[h],to_jsonb((work->>h)::int-1));
 end loop; return out;
end $$;

create or replace function pixel_private.card_rps_settle(p_id uuid,p_winner text,p_reason text) returns void language plpgsql security definer set search_path='' as $$
declare m public.pixel_card_rps_matches%rowtype; day date:=(now() at time zone 'Asia/Seoul')::date;
begin
 select * into m from public.pixel_card_rps_matches where id=p_id for update;
 if m.settled then return; end if;
 update public.pixel_card_rps_matches set status='finished',winner_id=p_winner,end_reason=p_reason,settled=true,finished_at=now(),deadline_at=null,
  a_delta=case when mode='friend' then (case when p_winner=player_a::text then stake else -stake end) else (case when p_winner=player_a::text then prize-stake else -stake end) end,
  b_delta=case when mode='friend' then (case when p_winner=player_b::text then stake else -stake end) else null end,updated_at=now() where id=p_id;
 if m.mode='friend' then perform pixel_private.card_rps_adjust(p_id,p_winner::uuid,m.prize,'friend_prize');
 elsif p_winner=m.player_a::text and m.prize>0 then
  perform pixel_private.card_rps_adjust(p_id,m.player_a,m.prize,'npc_prize');
  insert into pixel_private.card_rps_npc_wins values(m.player_a,day,1) on conflict(user_id,kst_date) do update set wins=pixel_private.card_rps_npc_wins.wins+1;
 end if;
end $$;

create or replace function pixel_private.card_rps_view(p_id uuid,p_user uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare m public.pixel_card_rps_matches%rowtype; mine text; other text; a_name text;b_name text; s record;
begin
 select * into m from public.pixel_card_rps_matches where id=p_id and (player_a=p_user or player_b=p_user);
 if not found then perform pixel_private.card_rps_error('not_found'); end if;
 mine:=case when m.player_a=p_user then 'a' else 'b' end; other:=case mine when 'a' then 'b' else 'a' end;
 select coalesce(nickname,display_name,'친구') into a_name from public.profiles where id=m.player_a;
 if m.mode='npc' then b_name:='치즈'; else select coalesce(nickname,display_name,'친구') into b_name from public.profiles where id=m.player_b; end if;
 return jsonb_build_object('matchId',m.id,'mode',m.mode,'status',m.status,'stake',m.stake,'prize',m.prize,
  'me',jsonb_build_object('id',p_user,'nickname',case mine when 'a' then a_name else b_name end,'isNpc',false,'inventory',m.state->'inventory'->mine,'wins',(m.state->'wins'->>mine)::int,'submitted',exists(select 1 from pixel_private.card_rps_submissions x where x.match_id=m.id and x.turn=coalesce(jsonb_array_length(m.state->'rounds'),0)+1 and x.side=mine)),
  'opponent',jsonb_build_object('id',case when other='a' then m.player_a::text when m.mode='npc' then 'npc_mouse' else m.player_b::text end,'nickname',case other when 'a' then a_name else b_name end,'isNpc',m.mode='npc' and other='b','inventory',m.state->'inventory'->other,'wins',(m.state->'wins'->>other)::int,'submitted',exists(select 1 from pixel_private.card_rps_submissions x where x.match_id=m.id and x.turn=coalesce(jsonb_array_length(m.state->'rounds'),0)+1 and x.side=other)),
  'round',jsonb_array_length(m.state->'rounds')+1,'rounds',case mine when 'a' then m.state->'rounds' else (select coalesce(jsonb_agg(jsonb_build_object('a',x->'b','b',x->'a','clashes',(select coalesce(jsonb_agg(jsonb_build_object('aIndex',c->'bIndex','bIndex',c->'aIndex','a',c->'b','b',c->'a','result',case c->>'result' when 'a' then 'b' when 'b' then 'a' else 'draw' end)),'[]') from jsonb_array_elements(x->'clashes')c),'winner',case x->>'winner' when 'a' then 'b' when 'b' then 'a' else 'draw' end)),'[]') from jsonb_array_elements(m.state->'rounds')x) end,
  'shootout',case mine when 'a' then m.state->'shootout' else (select coalesce(jsonb_agg(jsonb_build_object('a',x->'b','b',x->'a','result',case x->>'result' when 'a' then 'b' when 'b' then 'a' else 'draw' end)),'[]') from jsonb_array_elements(m.state->'shootout')x) end,
  'deadlineAt',case when coalesce(m.deadline_at,m.invite_expires_at) is null then null else floor(extract(epoch from coalesce(m.deadline_at,m.invite_expires_at))*1000) end,'winnerId',m.winner_id,'endReason',m.end_reason,
  'pointDelta',case when m.status='finished' then case mine when 'a' then m.a_delta else m.b_delta end else null end);
end $$;

create or replace function pixel_private.card_rps_expire(p_id uuid) returns void language plpgsql security definer set search_path='' as $$
declare m public.pixel_card_rps_matches%rowtype; a_sub boolean;b_sub boolean;
begin select * into m from public.pixel_card_rps_matches where id=p_id for update; if not found then return; end if;
 if m.status='invited' and m.invite_expires_at<=now() then update public.pixel_card_rps_matches set status='expired',settled=true,a_delta=0,updated_at=now() where id=p_id; perform pixel_private.card_rps_adjust(p_id,m.player_a,m.stake,'invite_refund');
 elsif m.status in('choosing','shootout') and m.deadline_at<=now() then
  select exists(select 1 from pixel_private.card_rps_submissions where match_id=p_id and side='a' and turn=jsonb_array_length(m.state->'rounds')+1),exists(select 1 from pixel_private.card_rps_submissions where match_id=p_id and side='b' and turn=jsonb_array_length(m.state->'rounds')+1) into a_sub,b_sub;
  perform pixel_private.card_rps_settle(p_id,case when m.mode='npc' then 'npc_mouse' when a_sub and not b_sub then m.player_a::text when b_sub and not a_sub then coalesce(m.player_b::text,'npc_mouse') else case when random()<.5 then m.player_a::text else coalesce(m.player_b::text,'npc_mouse') end end,'timeout');
 end if; end $$;

create or replace function public.invite_card_rps(p_opponent uuid,p_stake integer) returns jsonb language plpgsql security definer set search_path='' as $$
declare u uuid:=auth.uid(); v_id uuid; allowed integer[];
begin if u is null then raise exception 'not authenticated'; end if; if u=p_opponent then perform pixel_private.card_rps_error('self'); end if;
 select friend_stakes into allowed from public.pixel_card_rps_settings where singleton; if not p_stake=any(allowed) then perform pixel_private.card_rps_error('not_found'); end if;
 if exists(select 1 from public.pixel_card_rps_matches where status in('invited','choosing','revealing','shootout') and (u in(player_a,player_b) or p_opponent in(player_a,player_b))) then perform pixel_private.card_rps_error('busy'); end if;
 insert into public.pixel_card_rps_matches(mode,status,player_a,player_b,stake,prize,invite_expires_at) values('friend','invited',u,p_opponent,p_stake,p_stake*2,now()+interval '30 seconds') returning pixel_card_rps_matches.id into v_id;
 perform pixel_private.card_rps_adjust(v_id,u,-p_stake,'friend_escrow'); return pixel_private.card_rps_view(v_id,u);
exception when unique_violation then perform pixel_private.card_rps_error('busy'); return null; end $$;

create or replace function public.respond_card_rps(p_match_id uuid,p_accept boolean) returns jsonb language plpgsql security definer set search_path='' as $$
declare u uuid:=auth.uid();m public.pixel_card_rps_matches%rowtype;
begin perform pixel_private.card_rps_expire(p_match_id); select * into m from public.pixel_card_rps_matches where id=p_match_id and player_b=u for update;
 if not found then perform pixel_private.card_rps_error('not_found'); end if; if m.status='expired' then return pixel_private.card_rps_view(p_match_id,u); end if; if m.status<>'invited' then perform pixel_private.card_rps_error('not_your_turn'); end if;
 if not p_accept then update public.pixel_card_rps_matches set status='declined',settled=true,a_delta=0,updated_at=now() where id=p_match_id;perform pixel_private.card_rps_adjust(p_match_id,m.player_a,m.stake,'invite_refund');
 else perform pixel_private.card_rps_adjust(p_match_id,u,-m.stake,'friend_escrow');update public.pixel_card_rps_matches set status='choosing',deadline_at=now()+interval '60 seconds',updated_at=now() where id=p_match_id; end if;
 return pixel_private.card_rps_view(p_match_id,u); end $$;

create or replace function public.cancel_card_rps_invite(p_match_id uuid) returns void language plpgsql security definer set search_path='' as $$
declare u uuid:=auth.uid();m public.pixel_card_rps_matches%rowtype;begin select * into m from public.pixel_card_rps_matches where id=p_match_id and player_a=u for update;if not found then perform pixel_private.card_rps_error('not_found');end if;if m.status<>'invited' then perform pixel_private.card_rps_error('not_your_turn');end if;update public.pixel_card_rps_matches set status='cancelled',settled=true,a_delta=0,updated_at=now() where id=p_match_id;perform pixel_private.card_rps_adjust(p_match_id,u,m.stake,'invite_refund');end $$;

create or replace function public.start_npc_card_rps() returns jsonb language plpgsql security definer set search_path='' as $$
declare u uuid:=auth.uid();v_id uuid;cfg public.pixel_card_rps_settings%rowtype;wins integer;pay boolean;
begin if exists(select 1 from public.pixel_card_rps_matches where status in('invited','choosing','revealing','shootout') and u in(player_a,player_b)) then perform pixel_private.card_rps_error('busy');end if;select * into cfg from public.pixel_card_rps_settings where singleton;select coalesce(n.wins,0) into wins from pixel_private.card_rps_npc_wins n where user_id=u and kst_date=(now() at time zone 'Asia/Seoul')::date;pay:=wins<cfg.npc_daily_reward_wins;
 insert into public.pixel_card_rps_matches(mode,status,player_a,stake,prize,deadline_at) values('npc','choosing',u,case when pay then cfg.npc_entry else 0 end,case when pay then cfg.npc_reward else 0 end,now()+interval '60 seconds') returning pixel_card_rps_matches.id into v_id;if pay then perform pixel_private.card_rps_adjust(v_id,u,-cfg.npc_entry,'npc_entry');end if;return pixel_private.card_rps_view(v_id,u);exception when unique_violation then perform pixel_private.card_rps_error('busy');return null;end $$;

create or replace function pixel_private.card_rps_submit(p_id uuid,p_cards text[],p_kind text) returns jsonb language plpgsql security definer set search_path='' as $$
declare u uuid:=auth.uid();m public.pixel_card_rps_matches%rowtype;side text;other text;v_turn integer;other_cards text[];rr jsonb;st jsonb;winner text;result integer;npc text[];
begin perform pixel_private.card_rps_expire(p_id);select * into m from public.pixel_card_rps_matches where id=p_id and u in(player_a,player_b) for update;if not found then perform pixel_private.card_rps_error('not_found');end if;side:=case when m.player_a=u then 'a' else 'b' end;other:=case side when 'a' then 'b' else 'a' end;v_turn:=jsonb_array_length(m.state->'rounds')+1;
 if (p_kind='round' and m.status<>'choosing') or (p_kind='shootout' and m.status<>'shootout') then perform pixel_private.card_rps_error('not_your_turn');end if;
 if p_kind='round' and not pixel_private.card_rps_valid(m.state->'inventory'->side,p_cards) then perform pixel_private.card_rps_error('invalid_cards');end if;if p_kind='shootout' and (cardinality(p_cards)<>1 or not p_cards[1]=any(array['rock','scissors','paper'])) then perform pixel_private.card_rps_error('invalid_cards');end if;
 insert into pixel_private.card_rps_submissions(match_id,turn,side,kind,cards) values(p_id,v_turn,side,p_kind,p_cards) on conflict do nothing;if not found then perform pixel_private.card_rps_error('not_your_turn');end if;
 if m.mode='npc' then if p_kind='round' then npc:=pixel_private.card_rps_npc_cards(m.state->'inventory'->'b',m.state->'inventory'->'a',v_turn,(m.state->'wins'->>'a')::int);else npc:=array[(array['rock','scissors','paper'])[1+floor(random()*3)::int]];end if;insert into pixel_private.card_rps_submissions values(p_id,v_turn,'b',p_kind,npc,now()) on conflict do nothing;end if;
 select x.cards into other_cards from pixel_private.card_rps_submissions x where x.match_id=p_id and x.turn=v_turn and x.side=other and x.kind=p_kind;if other_cards is null then return pixel_private.card_rps_view(p_id,u);end if;
 if side='b' then npc:=p_cards;p_cards:=other_cards;other_cards:=npc;end if;st:=m.state;
 if p_kind='round' then rr:=pixel_private.card_rps_resolve_round(p_cards,other_cards);st:=jsonb_set(st,'{rounds}',st->'rounds'||jsonb_build_array(rr));st:=jsonb_set(st,'{inventory,a}',pixel_private.card_rps_remove(st->'inventory'->'a',p_cards));st:=jsonb_set(st,'{inventory,b}',pixel_private.card_rps_remove(st->'inventory'->'b',other_cards));if rr->>'winner'<>'draw' then st:=jsonb_set(st,array['wins',rr->>'winner'],to_jsonb((st->'wins'->>(rr->>'winner'))::int+1));end if;
  if (st->'wins'->>'a')::int>=2 then winner:=m.player_a::text;elsif (st->'wins'->>'b')::int>=2 then winner:=coalesce(m.player_b::text,'npc_mouse');elsif jsonb_array_length(st->'rounds')>=3 or (((st->'inventory'->'a'->>'rock')::int+(st->'inventory'->'a'->>'scissors')::int+(st->'inventory'->'a'->>'paper')::int)=0 and ((st->'inventory'->'b'->>'rock')::int+(st->'inventory'->'b'->>'scissors')::int+(st->'inventory'->'b'->>'paper')::int)=0) then if (st->'wins'->>'a')::int<>(st->'wins'->>'b')::int then winner:=case when (st->'wins'->>'a')::int>(st->'wins'->>'b')::int then m.player_a::text else coalesce(m.player_b::text,'npc_mouse') end;else update public.pixel_card_rps_matches set state=st,status='shootout',deadline_at=now()+interval '60 seconds',updated_at=now() where id=p_id;return pixel_private.card_rps_view(p_id,u);end if;end if;
 else result:=pixel_private.card_rps_compare(p_cards[1],other_cards[1]);st:=jsonb_set(st,'{shootout}',st->'shootout'||jsonb_build_array(jsonb_build_object('a',p_cards[1],'b',other_cards[1],'result',case when result=0 then 'draw' when result>0 then 'a' else 'b' end)));if result<>0 then winner:=case when result>0 then m.player_a::text else coalesce(m.player_b::text,'npc_mouse') end;end if;end if;
 update public.pixel_card_rps_matches set state=st,deadline_at=now()+interval '60 seconds',updated_at=now() where id=p_id;if winner is not null then perform pixel_private.card_rps_settle(p_id,winner,case when p_kind='shootout' then 'shootout' else 'wins' end);end if;return pixel_private.card_rps_view(p_id,u);end $$;

create function public.submit_card_rps_cards(p_match_id uuid,p_cards text[]) returns jsonb language sql volatile security definer set search_path='' as $$select pixel_private.card_rps_submit(p_match_id,p_cards,'round')$$;
create function public.submit_card_rps_shootout(p_match_id uuid,p_hand text) returns jsonb language sql volatile security definer set search_path='' as $$select pixel_private.card_rps_submit(p_match_id,array[p_hand],'shootout')$$;
create function public.leave_card_rps(p_match_id uuid) returns jsonb language plpgsql volatile security definer set search_path='' as $$declare u uuid:=auth.uid();m public.pixel_card_rps_matches%rowtype;begin select * into m from public.pixel_card_rps_matches where id=p_match_id and u in(player_a,player_b);if not found then perform pixel_private.card_rps_error('not_found');end if;perform pixel_private.card_rps_settle(p_match_id,case when u=m.player_a then coalesce(m.player_b::text,'npc_mouse') else m.player_a::text end,'left');return pixel_private.card_rps_view(p_match_id,u);end$$;
create function public.get_card_rps_match(p_match_id uuid) returns jsonb language plpgsql volatile security definer set search_path='' as $$begin perform pixel_private.card_rps_expire(p_match_id);return pixel_private.card_rps_view(p_match_id,auth.uid());end$$;
create function public.get_active_card_rps() returns jsonb language plpgsql volatile security definer set search_path='' as $$declare u uuid:=auth.uid();v_id uuid;begin select m.id into v_id from public.pixel_card_rps_matches m where u in(m.player_a,m.player_b) and m.status in('invited','choosing','revealing','shootout') order by m.created_at desc limit 1;if v_id is null then return null;end if;perform pixel_private.card_rps_expire(v_id);if not exists(select 1 from public.pixel_card_rps_matches m where m.id=v_id and m.status in('invited','choosing','revealing','shootout')) then return null;end if;return pixel_private.card_rps_view(v_id,u);end$$;

revoke all on function public.invite_card_rps(uuid,integer),public.respond_card_rps(uuid,boolean),public.cancel_card_rps_invite(uuid),public.start_npc_card_rps(),public.submit_card_rps_cards(uuid,text[]),public.submit_card_rps_shootout(uuid,text),public.leave_card_rps(uuid),public.get_card_rps_match(uuid),public.get_active_card_rps() from public,anon;
grant execute on function public.invite_card_rps(uuid,integer),public.respond_card_rps(uuid,boolean),public.cancel_card_rps_invite(uuid),public.start_npc_card_rps(),public.submit_card_rps_cards(uuid,text[]),public.submit_card_rps_shootout(uuid,text),public.leave_card_rps(uuid),public.get_card_rps_match(uuid),public.get_active_card_rps() to authenticated;
revoke all on all functions in schema pixel_private from public,anon,authenticated,service_role;
do $$ begin
  alter publication supabase_realtime add table public.pixel_card_rps_matches;
exception when duplicate_object then null; when undefined_object then null;
end $$;
commit;
