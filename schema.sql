-- ============================================================
-- FleetDesk SaaS — database schema (Supabase / Postgres)
-- Run once in the Supabase SQL editor.
-- Multi-tenant: every business row belongs to an org; RLS
-- restricts access to org members only.
-- ============================================================

-- ---------- orgs (a fleet / company) ----------
create table if not exists orgs (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  plan text not null default 'free',          -- free | pro | enterprise
  stripe_customer_id text,                    -- Phase 2 billing
  created_at timestamptz not null default now()
);

-- ---------- org membership + roles ----------
create table if not exists org_members (
  org_id uuid not null references orgs(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'driver',        -- owner | admin | dispatcher | driver
  created_at timestamptz not null default now(),
  primary key (org_id, user_id)
);

-- ---------- user profiles ----------
create table if not exists profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text,
  created_at timestamptz not null default now()
);

-- ---------- trucks ----------
create table if not exists trucks (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references orgs(id) on delete cascade,
  unit_number text not null,
  vin text,
  year int,
  make text,
  model text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (org_id, unit_number)
);

-- ---------- trips ----------
create table if not exists trips (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references orgs(id) on delete cascade,
  truck_id uuid references trucks(id) on delete set null,
  date date not null,
  origin text,
  destination text,
  route text,                                  -- "TX, OK, NM"
  mileage numeric not null default 0,
  state_miles jsonb,                           -- {"TX": 600, "OK": 400}
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);
create index if not exists trips_org_date_idx on trips (org_id, date);

-- ---------- fuel purchases ----------
create table if not exists fuel_purchases (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references orgs(id) on delete cascade,
  truck_id uuid references trucks(id) on delete set null,
  date date not null,
  state char(2) not null,
  gallons numeric not null check (gallons > 0),
  price_per_gallon numeric,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);
create index if not exists fuel_org_date_idx on fuel_purchases (org_id, date);

-- ---------- IFTA quarterly filing snapshots (immutable audit record) ----------
create table if not exists ifta_filings (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references orgs(id) on delete cascade,
  year int not null,
  quarter text not null,                        -- Q1..Q4
  mpg numeric not null,
  totals jsonb not null,                        -- {taxDue, surcharge, credit, net}
  rows jsonb not null,                          -- per-state detail
  status text not null default 'draft',         -- draft | filed
  filed_at timestamptz,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  unique (org_id, year, quarter)
);

-- ============================================================
-- Row-level security
-- ============================================================

alter table orgs enable row level security;
alter table org_members enable row level security;
alter table profiles enable row level security;
alter table trucks enable row level security;
alter table trips enable row level security;
alter table fuel_purchases enable row level security;
alter table ifta_filings enable row level security;

-- helper: orgs the current user belongs to
create or replace function public.my_orgs()
returns setof uuid language sql security definer stable as $$
  select org_id from org_members where user_id = auth.uid();
$$;

-- orgs: visible to members
create policy "members read own orgs" on orgs
  for select using (id in (select public.my_orgs()));
create policy "owners update own org" on orgs
  for update using (
    id in (select org_id from org_members
           where user_id = auth.uid() and role in ('owner','admin'))
  );

-- org_members: members can see the roster; owners/admins manage it
create policy "members read roster" on org_members
  for select using (org_id in (select public.my_orgs()));
create policy "owners manage roster" on org_members
  for all using (
    org_id in (select org_id from org_members
               where user_id = auth.uid() and role in ('owner','admin'))
  );

-- profiles: users read all member profiles in shared orgs; edit own
create policy "read profiles in shared orgs" on profiles
  for select using (
    id in (select user_id from org_members
           where org_id in (select public.my_orgs()))
  );
create policy "users update own profile" on profiles
  for update using (id = auth.uid());

-- generic org-scoped table policies
do $$
declare t text;
begin
  foreach t in array array['trucks','trips','fuel_purchases','ifta_filings'] loop
    execute format('create policy "members read %I" on %I for select using (org_id in (select public.my_orgs()))', t, t);
    execute format('create policy "members write %I" on %I for insert with check (org_id in (select public.my_orgs()))', t, t);
    execute format('create policy "members update %I" on %I for update using (org_id in (select public.my_orgs()))', t, t);
    execute format('create policy "members delete %I" on %I for delete using (org_id in (select public.my_orgs()))', t, t);
  end loop;
end $$;

-- ============================================================
-- New-user bootstrap: profile + personal org, user becomes owner
-- ============================================================

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer as $$
declare new_org uuid;
begin
  insert into profiles (id, full_name)
  values (new.id, coalesce(new.raw_user_meta_data->>'full_name', ''))
  on conflict (id) do nothing;

  insert into orgs (name)
  values (coalesce(new.raw_user_meta_data->>'org_name',
          coalesce(new.raw_user_meta_data->>'full_name', 'My') || ' Fleet'))
  returning id into new_org;

  insert into org_members (org_id, user_id, role)
  values (new_org, new.id, 'owner');

  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
