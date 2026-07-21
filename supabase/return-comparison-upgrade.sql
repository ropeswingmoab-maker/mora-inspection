-- Run this once in Supabase SQL Editor to prevent duplicate checkout or return
-- inspections for the same rental. If you already have duplicate test records,
-- delete the extras before running this index.
create unique index if not exists inspections_one_type_per_rental_idx
on public.inspections (rental_id, inspection_type);
