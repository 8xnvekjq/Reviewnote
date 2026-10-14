-- 이미지 본문은 건드리지 않고 비공개 저장소와 접근 정책만 만든다.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('scaffolding-images', 'scaffolding-images', false, 10485760, array['image/webp', 'image/jpeg'])
on conflict (id) do update set public = false,
  file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

-- 학생 경로와 실제 오답 소유자를 함께 확인한다. 기존 관리자 판정을 그대로 사용한다.
create or replace function private.can_upload_scaffolding_image(object_name text)
returns boolean language sql stable security invoker set search_path = '' as $$
  select case when object_name ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(webp|jpg)$' then
     ((select auth.uid())::text = split_part(object_name, '/', 1)
      or (select private.is_current_user_admin()))
    and exists (select 1 from public.mistakes m
      where m.id = split_part(object_name, '/', 2)::uuid
        and m.user_id = split_part(object_name, '/', 1)::uuid)
    else false end;
$$;
revoke all on function private.can_upload_scaffolding_image(text) from public, anon;
grant execute on function private.can_upload_scaffolding_image(text) to authenticated;

create policy "스캐폴딩 이미지 읽기" on storage.objects for select to authenticated
using (bucket_id = 'scaffolding-images' and
  ((select auth.uid())::text = split_part(name, '/', 1) or (select private.is_current_user_admin())));
create policy "스캐폴딩 이미지 추가" on storage.objects for insert to authenticated
with check (bucket_id = 'scaffolding-images' and private.can_upload_scaffolding_image(name));
create policy "스캐폴딩 이미지 수정" on storage.objects for update to authenticated
using (bucket_id = 'scaffolding-images' and private.can_upload_scaffolding_image(name))
with check (bucket_id = 'scaffolding-images' and private.can_upload_scaffolding_image(name));
-- 오답/스캐폴딩 행 삭제 후에도 본인 경로의 남은 파일을 정리할 수 있다.
create policy "스캐폴딩 이미지 삭제" on storage.objects for delete to authenticated
using (bucket_id = 'scaffolding-images' and
  ((select auth.uid())::text = split_part(name, '/', 1) or (select private.is_current_user_admin())));

-- DB 트리거에서 storage.objects를 직접 지우면 실제 파일이 남으므로 자동 삭제는 하지 않는다.
-- 행 삭제 및 업로드 후 저장 실패로 남은 파일은 Storage API로 별도 정리해야 한다.

-- 큰 원본을 URL 필터에 넣지 않고 POST 본문으로 받는다. 기본키로 한 행만 처리한다.
create or replace function public.migrate_scaffolding_image(p_id uuid, p_original text, p_reference text)
returns boolean language plpgsql security invoker set search_path = '' as $$
declare changed integer;
begin
  if not (select private.is_current_user_admin()) then
    raise exception '관리자만 이미지 이동을 실행할 수 있습니다.';
  end if;
  if p_original not like 'data:image/%' or p_reference not like 'storage:scaffolding-images/%'
    or not private.can_upload_scaffolding_image(substr(p_reference, length('storage:scaffolding-images/') + 1)) then
    raise exception '이미지 이동 값이 올바르지 않습니다.';
  end if;
  update public.mistake_scaffoldings set image_url = p_reference
    where id = p_id and image_url = p_original
      and student_id = split_part(substr(p_reference, length('storage:scaffolding-images/') + 1), '/', 1)::uuid
      and mistake_id = split_part(substr(p_reference, length('storage:scaffolding-images/') + 1), '/', 2)::uuid;
  get diagnostics changed = row_count;
  return changed = 1;
end;
$$;
revoke all on function public.migrate_scaffolding_image(uuid, text, text) from public, anon;
grant execute on function public.migrate_scaffolding_image(uuid, text, text) to authenticated;
