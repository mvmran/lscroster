-- Migration 0069 — Setting a person's managing member clears their pending
-- invitation in the same write. Found by `/code-review`. Re-runnable.
--
-- The People page revoked the invitation through the invite function and then
-- set managed_by_person_id as a second request: when the second failed, the
-- person's emailed link was already dead and they were still unmanaged. A
-- trigger does both in one statement, for any caller.
--
-- From this release a person with a managing member is managed whether or not
-- they have an email of their own (invite, accept-invitation). Before it, the
-- invitation of such a person went to their own address — so a still-pending
-- one would now be accepted as the manager's confirmation, by whoever holds
-- the link. Those are removed below; the admin sends a fresh one.

create or replace function public.clear_invitation_on_manager_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- invitations is admin-only under RLS; the caller has already been allowed
  -- to change the manager, and only this person's unaccepted invitation goes.
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
  execute function public.clear_invitation_on_manager_change();

delete from public.invitations i
using public.people p
where p.id = i.person_id
  and p.email is not null
  and p.managed_by_person_id is not null
  and i.accepted_at is null;
