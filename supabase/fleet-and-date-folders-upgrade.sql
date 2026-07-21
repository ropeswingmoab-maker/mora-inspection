-- Add the MORA fleet. Each vehicle receives a permanent QR token automatically.
insert into public.vehicles (name, unit_number, active)
values
  ('War Pig', 'War Pig', true),
  ('Big Booty Judy', 'Big Booty Judy', true),
  ('Blackie', 'Blackie', true),
  ('R1', 'R1', true),
  ('R2', 'R2', true),
  ('R3', 'R3', true),
  ('R4', 'R4', true),
  ('Batmobile', 'Batmobile', true),
  ('Defender #1', 'Defender #1', true),
  ('Defender #2', 'Defender #2', true),
  ('Defender #3', 'Defender #3', true)
on conflict (unit_number) do update
set name = excluded.name,
    active = true;

-- Make sure every fleet vehicle has one blank rental ready for checkout.
insert into public.rentals (vehicle_id, customer_name, customer_last_name, status)
select v.id, 'Unassigned Customer', null, 'ready'
from public.vehicles v
where v.unit_number in (
  'War Pig', 'Big Booty Judy', 'Blackie', 'R1', 'R2', 'R3', 'R4',
  'Batmobile', 'Defender #1', 'Defender #2', 'Defender #3'
)
and not exists (
  select 1
  from public.rentals r
  where r.vehicle_id = v.id
    and r.status = 'ready'
);

-- Use this result to create and label each permanent vehicle QR code.
select name, unit_number, qr_token
from public.vehicles
where unit_number in (
  'War Pig', 'Big Booty Judy', 'Blackie', 'R1', 'R2', 'R3', 'R4',
  'Batmobile', 'Defender #1', 'Defender #2', 'Defender #3'
)
order by name;
