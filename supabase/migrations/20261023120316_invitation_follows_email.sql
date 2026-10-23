-- Migration 0070 — An invitation follows the person's email, and a managing
-- member's confirmation follows the manager. Found by `/code-review`.
-- Re-runnable.
--
-- accept-invitation creates the login from the person's email at the time the
-- link is used. An invitation sent to a mistyped address stayed live when the
-- admin corrected it, so whoever held the link signed up as the corrected
-- address. Now a change of email clears the unaccepted invitation (the trigger
-- 0069 added for a change of manager, generalised), and invitations.email
-- records where each one went so accept-invitation can refuse a link whose
-- address the person no longer has. Existing invitations have no address
-- recorded and are accepted as before.
--
-- managed_accepted_at outlived its manager: deleting the manager nulls
-- managed_by_person_id (on delete set null) but kept the stamp, so the next
-- manager assigned counted as already confirmed and was never invited. A
-- change of manager now clears it, unless the same statement sets it.

alter table public.invitations add column if not exists email text;

create or replace function public.clear_pending_invitation()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- invitations is admin-only under RLS; the caller has already been allowed
  -- to change this person, and only their unaccepted invitation goes.
  delete from public.invitations
  where person_id = new.id
    and accepted_at is null;
  return new;
end;
$$;

drop trigger if exists people_manager_clears_invitation on public.people;
create trigger people_manager_clears_invitation
  after update of managed_by_person_id on public.people
  for each row
  when (
    new.managed_by_person_id is not null
    and new.managed_by_person_id is distinct from old.managed_by_person_id
  )
  execute function public.clear_pending_invitation();

drop trigger if exists people_email_clears_invitation on public.people;
create trigger people_email_clears_invitation
  after update of email on public.people
  for each row
  when (new.email is distinct from old.email)
  execute function public.clear_pending_invitation();

drop function if exists public.clear_invitation_on_manager_change();

-- Fires for the referential `set null` too, which runs as an update of the
-- column.
create or replace function public.reset_manager_confirmation()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.managed_accepted_at is not distinct from old.managed_accepted_at then
    new.managed_accepted_at := null;
  end if;
  return new;
end;
$$;

drop trigger if exists people_manager_resets_confirmation on public.people;
create trigger people_manager_resets_confirmation
  before update of managed_by_person_id on public.people
  for each row
  when (new.managed_by_person_id is distinct from old.managed_by_person_id)
  execute function public.reset_manager_confirmation();

-- Stamps left behind by managers deleted before this release.
update public.people
set managed_accepted_at = null
where managed_by_person_id is null
  and managed_accepted_at is not null;
