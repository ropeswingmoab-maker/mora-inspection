-- Run once in Supabase SQL Editor.
-- The renter's last name is now captured during checkout, not preloaded from a reservation.

alter table public.rentals
add column if not exists customer_last_name text;

alter table public.rentals
alter column customer_last_name drop not null;

-- Clear the sample/preloaded names on rentals that have not started yet.
-- This does not change active or completed rental history.
update public.rentals
set customer_last_name = null
where status = 'ready';

create index if not exists rentals_vehicle_last_name_status_idx
on public.rentals (vehicle_id, lower(customer_last_name), status);

select id, customer_name, customer_last_name, status
from public.rentals
order by created_at desc;
