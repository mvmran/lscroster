-- Migration 0058 — Whoever may delete a plan may delete its files.
-- Deleting a plan (or a whole service type) removed its attachment rows — the
-- foreign key cascades — but never the files: the app didn't try, and the
-- rows that said where they were were gone. Every such delete left its files
-- in the `plan-attachments` bucket for good. The app now removes them as part
-- of the delete.
--
-- That needs storage permission the deleter may not have: plans are deleted
-- with `create_delete_plans` (0045), but the bucket's files are managed only by
-- admins, coordinators and `attach_plan_files`. A member allowed to delete
-- plans could not remove the files of the plan they had just deleted. This
-- lets them delete (only delete) files in that bucket. It hands them nothing
-- they couldn't already do: deleting a plan takes its attachments with it.
--
-- Service types are deleted by admins and coordinators, who already manage
-- the bucket. Re-runnable.

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'storage' and tablename = 'objects'
      and policyname = 'Plan deleters remove plan attachment files'
  ) then
    create policy "Plan deleters remove plan attachment files"
      on storage.objects for delete
      to authenticated
      using (bucket_id = 'plan-attachments' and public.has_permission('create_delete_plans'));
  end if;
end $$;
