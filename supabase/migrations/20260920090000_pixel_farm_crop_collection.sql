-- Harvested-crop collection ("농작물" tab). Reuses pixel_farm_crops as-is: every harvest already
-- creates exactly one immutable row (planted once, harvested once, revision-CAS-protected — see
-- 20260917155631_pixel_tomato_farm.sql and 20260918090000_pixel_farm_crop_size.sql), so a
-- harvested crop already IS a real collection item with a stable id, size_score and harvested_at.
-- No new table, no new RPC: `select on public.pixel_farm_crops` is already granted to
-- authenticated with RLS scoped to `user_id = auth.uid()` (pixel_farm_crops_read), so the client
-- can list its own harvested rows directly.
--
-- The only addition is a lifecycle flag for future use (crop show/contest/sale), left at its only
-- legal value for now. Widening the CHECK later to add 'submitted'/'sold'/'exhibited' needs no
-- other change here — existing rows keep reading as 'stored'.
alter table public.pixel_farm_crops
  add column status text not null default 'stored' check (status in ('stored'));
