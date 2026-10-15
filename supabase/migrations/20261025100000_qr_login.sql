begin;

create table if not exists private.qr_login_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  token_hash text not null unique,
  code_hash text not null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  used_at timestamptz
);
create index if not exists qr_login_tokens_user_created on private.qr_login_tokens(user_id, created_at);
create index if not exists qr_login_tokens_created on private.qr_login_tokens(created_at);
create unique index if not exists qr_login_tokens_code on private.qr_login_tokens(code_hash);
create table if not exists private.qr_login_failures (
  id bigserial primary key, ip text not null, at timestamptz not null default now()
);
create index if not exists qr_login_failures_ip_at on private.qr_login_failures(ip, at);
create index if not exists qr_login_failures_at on private.qr_login_failures(at);
alter table private.qr_login_tokens enable row level security;
alter table private.qr_login_failures enable row level security;
revoke all on private.qr_login_tokens, private.qr_login_failures from public, anon, authenticated;

create or replace function public.create_qr_login_token() returns json
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v_token text; v_code text; v_id uuid; v_expires timestamptz;
  v_alphabet constant text := '23456789ABCDEFGHJKMNPQRSTUVWXYZ';
  v_byte integer;
begin
  if v_uid is null then raise exception '로그인이 필요해요.'; end if;
  if private.is_current_user_admin() then raise exception '관리자는 사용할 수 없어요.'; end if;
  -- 같은 사용자의 동시 생성도 시간당 한도를 넘기지 못하게 한다.
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_uid::text, 0));
  delete from private.qr_login_tokens where created_at < now() - interval '1 day';
  delete from private.qr_login_failures where at < now() - interval '1 day';
  if (select count(*) from private.qr_login_tokens where user_id = v_uid and created_at > now() - interval '1 hour') >= 10 then
    raise exception '한 시간에 10번까지 만들 수 있어요.';
  end if;
  update private.qr_login_tokens set expires_at = least(expires_at, now()) where user_id = v_uid and used_at is null;
  v_token := rtrim(translate(encode(extensions.gen_random_bytes(32), 'base64'), '+/', '-_'), '=');
  loop
    v_code := '';
    -- 나머지 연산의 편향 없이 암호학적 난수를 문자로 바꾼다.
    while length(v_code) < 8 loop
      v_byte := get_byte(extensions.gen_random_bytes(1), 0);
      if v_byte < (256 / length(v_alphabet)) * length(v_alphabet) then
        v_code := v_code || substr(v_alphabet, (v_byte % length(v_alphabet)) + 1, 1);
      end if;
    end loop;
    exit when not exists (select 1 from private.qr_login_tokens where code_hash = encode(extensions.digest(v_code, 'sha256'), 'hex'));
  end loop;
  v_expires := now() + interval '60 seconds';
  insert into private.qr_login_tokens(user_id, token_hash, code_hash, expires_at)
    values (v_uid, encode(extensions.digest(v_token, 'sha256'), 'hex'), encode(extensions.digest(v_code, 'sha256'), 'hex'), v_expires)
    returning id into v_id;
  return json_build_object('id', v_id, 'token', v_token, 'code', v_code, 'expires_at', v_expires);
end;
$$;

create or replace function public.qr_login_token_status(p_id uuid) returns text
language sql stable security definer set search_path = '' as $$
  select coalesce((select case when used_at is not null then 'used' when expires_at <= now() then 'expired' else 'pending' end
    from private.qr_login_tokens where id = p_id and user_id = auth.uid()), 'expired');
$$;

create or replace function private.consume_qr_login(p_token_hash text, p_code_hash text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare v_uid uuid;
begin
  update private.qr_login_tokens as t set used_at = now()
    where (t.token_hash = p_token_hash or t.code_hash = p_code_hash)
      and t.used_at is null and t.expires_at > now()
      and not exists (select 1 from private.app_admins a where a.user_id = t.user_id)
    returning t.user_id into v_uid;
  return v_uid;
end;
$$;
create or replace function private.count_qr_login_failures(p_ip text, p_since timestamptz) returns bigint
language sql stable security definer set search_path = '' as $$
  -- p_ip가 null이면 모든 IP의 실패 수(x-forwarded-for는 꾸밀 수 있어 전체 상한도 둔다).
  select count(*) from private.qr_login_failures where (p_ip is null or ip = p_ip) and at >= p_since;
$$;
create or replace function private.insert_qr_login_failure(p_ip text) returns void
language sql security definer set search_path = '' as $$
  insert into private.qr_login_failures(ip) values (p_ip);
$$;

-- private 스키마를 Data API에 공개하지 않고 서비스 역할만 호출하는 진입점이다.
create or replace function public.consume_qr_login(p_token_hash text, p_code_hash text) returns uuid
language sql security definer set search_path = '' as $$ select private.consume_qr_login(p_token_hash, p_code_hash); $$;
create or replace function public.count_qr_login_failures(p_ip text, p_since timestamptz) returns bigint
language sql security definer set search_path = '' as $$ select private.count_qr_login_failures(p_ip, p_since); $$;
create or replace function public.insert_qr_login_failure(p_ip text) returns void
language sql security definer set search_path = '' as $$ select private.insert_qr_login_failure(p_ip); $$;

revoke all on function public.create_qr_login_token(), public.qr_login_token_status(uuid) from public, anon, authenticated, service_role;
grant execute on function public.create_qr_login_token(), public.qr_login_token_status(uuid) to authenticated;
revoke all on function private.consume_qr_login(text,text), private.count_qr_login_failures(text,timestamptz), private.insert_qr_login_failure(text),
  public.consume_qr_login(text,text), public.count_qr_login_failures(text,timestamptz), public.insert_qr_login_failure(text) from public, anon, authenticated, service_role;
grant usage on schema private to service_role;
grant execute on function private.consume_qr_login(text,text), private.count_qr_login_failures(text,timestamptz), private.insert_qr_login_failure(text),
  public.consume_qr_login(text,text), public.count_qr_login_failures(text,timestamptz), public.insert_qr_login_failure(text) to service_role;
commit;
