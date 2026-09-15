-- Reuse the existing catalog, purchase RPC and ownership ledger.
alter table public.pixel_item_catalog drop constraint pixel_item_catalog_category_check;
alter table public.pixel_item_catalog add constraint pixel_item_catalog_category_check check (category in ('avatar','furniture','pet'));
alter table public.pixel_item_catalog drop constraint pixel_item_catalog_slot_check;
alter table public.pixel_item_catalog add constraint pixel_item_catalog_slot_check check (slot in ('top','bottom','shoes','hair','eyes','furniture','pet'));
insert into public.pixel_item_catalog(item_id,category,slot,price,asset_key,display_name,tier,stackable)
values ('pet_dog','pet','pet',200,'dog','우리 집 강아지',2,false)
on conflict (item_id) do nothing;

create table public.pixel_pet_equipment (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  active_pet text check (active_pet is null or active_pet = 'pet_dog'),
  foreign key (user_id, active_pet) references public.pixel_item_ownership(user_id,item_id) on delete cascade
);
alter table public.pixel_pet_equipment enable row level security;
revoke all on public.pixel_pet_equipment from anon, authenticated;
grant select, insert, update on public.pixel_pet_equipment to authenticated;
create policy pet_read_own on public.pixel_pet_equipment for select to authenticated using (user_id = (select auth.uid()));
create policy pet_insert_own on public.pixel_pet_equipment for insert to authenticated with check (user_id = (select auth.uid()));
create policy pet_update_own on public.pixel_pet_equipment for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
comment on table public.pixel_pet_equipment is 'Private active companion only. Movement/animation never persisted or broadcast.';
