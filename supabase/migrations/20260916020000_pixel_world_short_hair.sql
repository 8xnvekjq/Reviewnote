-- PR #92 shipped 6 new short-hair catalog rows in client-side
-- src/features/pixel-room/shop/catalog.ts but never inserted them into the server's
-- pixel_item_catalog table, so usePixelShop.ts's server-catalog fetch (which replaces the
-- client-side initial list once it resolves, filtered down to rows that also exist client-side)
-- silently dropped all 6 from the shop after first load. This is the missing insert.
-- item_id/slot/asset_key here must match catalog.ts exactly or usePixelShop.ts's filter drops the row.
INSERT INTO public.pixel_item_catalog (item_id, category, slot, price, asset_key, display_name, tier, stackable)
VALUES
('hair_crop_blonde', 'avatar', 'hair', 100, 'crop_blonde', '블론드 숏컷', 1, false),
('hair_crop_black', 'avatar', 'hair', 100, 'crop_black', '블랙 숏컷', 1, false),
('hair_buzz', 'avatar', 'hair', 90, 'buzz', '까까머리', 1, false),
('hair_buzz_blonde', 'avatar', 'hair', 90, 'buzz_blonde', '블론드 까까머리', 1, false),
('hair_buzz_black', 'avatar', 'hair', 90, 'buzz_black', '블랙 까까머리', 1, false),
('hair_buzz_brown', 'avatar', 'hair', 90, 'buzz_brown', '브라운 까까머리', 1, false)
ON CONFLICT (item_id) DO UPDATE SET
  price = EXCLUDED.price, display_name = EXCLUDED.display_name, tier = EXCLUDED.tier;
