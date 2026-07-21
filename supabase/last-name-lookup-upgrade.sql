-- Run this once in Supabase SQL Editor before using last-name lookup.

alter table public.rentals
add column if not exists customer_last_name text;

-- The access code is no longer used. Keep the column for compatibility, but make it optional.
alter table public.rentals
alter column access_code drop not null;

-- Populate existing rentals using the final word in customer_name.
update public.rentals
set customer_last_name = lower(regexp_replace(trim(customer_name), '^.*\\s', ''))
where customer_last_name is null
  and customer_name is not null;

alter table public.rentals
alter column customer_last_name set not null;

create index if not exists rentals_vehicle_last_name_status_idx
on public.rentals (vehicle_id, lower(customer_last_name), status);

-- The sample rental created by schema.sql is "Test Customer",
-- so its new checkout/return lookup name is: Customer
select customer_name, customer_last_name, status
from public.rentals
order by created_at desc;
