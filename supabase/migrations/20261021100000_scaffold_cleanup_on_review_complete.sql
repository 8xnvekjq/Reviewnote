begin;

create schema if not exists private;

-- 복습이 O 세 개로 완료되는 순간 해당 오답의 손풀이 이미지만 정리한다.
create or replace function private.cleanup_scaffoldings_on_review_complete()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select count(*) from pg_catalog.jsonb_array_elements(
        case when pg_catalog.jsonb_typeof(new.reviews) = 'array' then new.reviews else '[]'::jsonb end
      ) as review(value) where value = '"O"'::jsonb) = 3
     and (select count(*) from pg_catalog.jsonb_array_elements(
        case when pg_catalog.jsonb_typeof(old.reviews) = 'array' then old.reviews else '[]'::jsonb end
      ) as review(value) where value = '"O"'::jsonb) <> 3 then
    delete from public.mistake_scaffoldings
    where mistake_id = new.id and caption = '✏️ 직접 손으로 쓴 풀이';
  end if;
  return new;
end;
$$;

-- 직접 호출은 막고, 권한 검사를 통과한 오답 수정의 트리거로만 실행한다.
revoke all on function private.cleanup_scaffoldings_on_review_complete() from public, anon, authenticated, service_role;

drop trigger if exists cleanup_scaffoldings_on_review_complete on public.mistakes;
create trigger cleanup_scaffoldings_on_review_complete
after update of reviews on public.mistakes
for each row execute function private.cleanup_scaffoldings_on_review_complete();

-- 이미 완료된 오답도 동일한 기준과 정확한 캡션으로 한 번 정리한다.
delete from public.mistake_scaffoldings as scaffolding
using public.mistakes as mistake
where scaffolding.mistake_id = mistake.id
  and scaffolding.caption = '✏️ 직접 손으로 쓴 풀이'
  and (select count(*) from pg_catalog.jsonb_array_elements(
    case when pg_catalog.jsonb_typeof(mistake.reviews) = 'array' then mistake.reviews else '[]'::jsonb end
  ) as review(value) where value = '"O"'::jsonb) = 3;

commit;
