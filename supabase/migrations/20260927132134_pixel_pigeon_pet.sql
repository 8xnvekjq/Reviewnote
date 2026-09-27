-- Pigeon companion: same one-active-pet row, ownership FK and RLS as dog/duck/bear.
alter table public.pixel_pet_equipment drop constraint pixel_pet_equipment_active_pet_check;
alter table public.pixel_pet_equipment add constraint pixel_pet_equipment_active_pet_check
  check (active_pet is null or active_pet in ('pet_dog','pet_duck','pet_bear','pet_pigeon'));
insert into public.pixel_item_catalog(item_id,category,slot,price,asset_key,display_name,tier,stackable)
values ('pet_pigeon','pet','pet',180,'pigeon','구구 비둘기',2,false)
on conflict (item_id) do update set category=excluded.category,slot=excluded.slot,price=excluded.price,
  asset_key=excluded.asset_key,display_name=excluded.display_name,tier=excluded.tier,stackable=excluded.stackable;
