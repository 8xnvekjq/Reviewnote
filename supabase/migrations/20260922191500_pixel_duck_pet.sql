-- Keep one active companion per user and the existing ownership FK/RLS.
alter table public.pixel_pet_equipment drop constraint pixel_pet_equipment_active_pet_check;
alter table public.pixel_pet_equipment add constraint pixel_pet_equipment_active_pet_check
  check (active_pet is null or active_pet in ('pet_dog','pet_duck'));
insert into public.pixel_item_catalog(item_id,category,slot,price,asset_key,display_name,tier,stackable)
values ('pet_duck','pet','pet',150,'duck','까딱 오리',2,false)
on conflict (item_id) do update set category=excluded.category,slot=excluded.slot,price=excluded.price,
  asset_key=excluded.asset_key,display_name=excluded.display_name,tier=excluded.tier,stackable=excluded.stackable;
