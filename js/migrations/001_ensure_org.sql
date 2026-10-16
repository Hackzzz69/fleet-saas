-- FleetDesk migration 001: on-demand personal org creation.
-- Run once in the Supabase SQL editor. The app calls this when a user
-- signs in but has no org (e.g. the signup trigger didn't fire).

create or replace function public.ensure_personal_org()
returns uuid language plpgsql security definer as $$
declare
  uid uuid := auth.uid();
  oid uuid;
  em text;
begin
  if uid is null then
    raise exception 'not authenticated';
  end if;

  select org_id into oid
  from public.org_members
  where user_id = uid
  limit 1;

  if oid is not null then
    return oid;
  end if;

  select email into em from auth.users where id = uid;

  insert into public.orgs (name)
  values (coalesce(nullif(split_part(coalesce(em, ''), '@', 1), ''), 'My') || '''s Fleet')
  returning id into oid;

  insert into public.profiles (id)
  values (uid)
  on conflict (id) do nothing;

  insert into public.org_members (org_id, user_id, role)
  values (oid, uid, 'owner');

  return oid;
end $$;
