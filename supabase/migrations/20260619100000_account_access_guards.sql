-- Migration 0017 — account access guards
-- Two safety guards on people, both enforced in the database (hidden UI buttons
-- are not security):
--   #44  An admin can never demote *their own* role away from admin — another
--        admin must do it, so the instance can never be left adminless via the UI.
--   #45  Archiving a person (status -> inactive) immediately revokes their
--        sign-in: their auth account is banned and any live sessions are dropped.
--        Reactivating (status -> active) restores it.

-- #44 — prevent self admin-demotion ------------------------------------------
-- Runs for everyone, including admins (so it is NOT folded into
-- protect_people_columns, which lets admins through). Direct DB connections and
-- Edge Functions (service role) bypass — they manage data deliberately.
create or replace function public.prevent_self_admin_demotion()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if coalesce((select auth.role()), 'service_role') = 'service_role' then
    return new;
  end if;
  if old.role = 'admin'
     and new.role is distinct from old.role
     and old.auth_user_id = (select auth.uid()) then
    raise exception 'You cannot change your own role from admin. Another admin must do it.'
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

create trigger people_prevent_self_admin_demotion
  before update on public.people
  for each row execute function public.prevent_self_admin_demotion();

-- #45 — sync sign-in access with archive status ------------------------------
-- An archived (inactive) person must not be able to sign in. We ban their auth
-- account (blocks new sign-ins and token refresh) and delete any live sessions
-- (forces logout once the short-lived access token expires). Security definer
-- so the trigger may touch the auth schema, like Supabase's own auth triggers.
create or replace function public.sync_signin_with_status()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.auth_user_id is null then
    return new;
  end if;
  if new.status = 'inactive' and old.status is distinct from 'inactive' then
    update auth.users set banned_until = 'infinity' where id = new.auth_user_id;
    delete from auth.sessions where user_id = new.auth_user_id;
  elsif new.status = 'active' and old.status is distinct from 'active' then
    update auth.users set banned_until = null where id = new.auth_user_id;
  end if;
  return new;
end;
$$;

create trigger people_sync_signin_with_status
  after update on public.people
  for each row execute function public.sync_signin_with_status();

-- Backfill: the trigger only fires on a status change, so enforce the rule for
-- anyone already archived before this migration (keeps existing instances correct
-- on upgrade). Re-runnable: banning an already-banned user is a no-op.
update auth.users u set banned_until = 'infinity'
from public.people p
where p.auth_user_id = u.id and p.status = 'inactive';

delete from auth.sessions s
using public.people p
where p.auth_user_id = s.user_id and p.status = 'inactive';
