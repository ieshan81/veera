-- Run once in Supabase SQL Editor if your database was created before qr_target_url existed.
-- Note: optional staff/reference URL only; QR encoding uses plant_qr_codes.qr_value (deep link), not this column.
alter table public.plants add column if not exists qr_target_url text;
