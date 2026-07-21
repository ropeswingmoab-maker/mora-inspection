create extension if not exists pgcrypto;

create table public.vehicles (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  unit_number text not null unique,
  qr_token text not null unique default encode(gen_random_bytes(16), 'hex'),
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table public.rentals (
  id uuid primary key default gen_random_uuid(),
  vehicle_id uuid not null references public.vehicles(id),
  customer_name text not null,
  customer_last_name text,
  access_code text,
  status text not null default 'ready' check (status in ('ready','active','completed','cancelled')),
  created_at timestamptz not null default now()
);

create index rentals_vehicle_last_name_status_idx on public.rentals(vehicle_id, lower(customer_last_name), status);

create table public.inspections (
  id uuid primary key,
  rental_id uuid not null references public.rentals(id),
  vehicle_id uuid not null references public.vehicles(id),
  inspection_type text not null check (inspection_type in ('checkout','return')),
  customer_name text not null,
  odometer text not null,
  fuel_level text not null,
  damage_notes text not null,
  photo_paths jsonb not null,
  submitted_at timestamptz not null default now()
);

alter table public.vehicles enable row level security;
alter table public.rentals enable row level security;
alter table public.inspections enable row level security;

insert into storage.buckets (id, name, public)
values ('inspection-photos', 'inspection-photos', false)
on conflict (id) do nothing;

-- The app accesses these tables and the private bucket only through the server-side service role.
-- No anonymous RLS policies are intentionally created.

-- Example vehicle and rental:
insert into public.vehicles (name, unit_number) values ('Can-Am Defender', '12');
insert into public.rentals (vehicle_id, customer_name)
select id, 'Test Customer' from public.vehicles where unit_number = '12';

-- Find the QR URL token after running this file:
select unit_number, qr_token from public.vehicles;
