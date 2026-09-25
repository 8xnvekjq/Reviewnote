insert into public.pixel_item_catalog(item_id,category,slot,price,asset_key,display_name,tier,stackable) values
('top_blouse_black','avatar','top',120,'blouse_black','블랙 퍼프 블라우스',2,false),
('top_blouse_ivory','avatar','top',120,'blouse_ivory','아이보리 퍼프 블라우스',2,false),
('top_blouse_rose','avatar','top',120,'blouse_rose','로즈 퍼프 블라우스',2,false),
('bottom_bootcut_blue','avatar','bottom',120,'bootcut_blue','워싱 블루 부츠컷',2,false),
('bottom_bootcut_charcoal','avatar','bottom',120,'bootcut_charcoal','차콜 부츠컷',2,false),
('bottom_bootcut_cream','avatar','bottom',120,'bootcut_cream','크림 부츠컷',2,false)
on conflict(item_id) do update set price=excluded.price,asset_key=excluded.asset_key,display_name=excluded.display_name;
