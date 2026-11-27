-- Yourself: add a developer-only account directory and safe account details.
-- Run once on an existing project after the previous Yourself SQL setup.
-- This deliberately does NOT expose auth passwords or the private user_data.payload.

begin;

do $$
begin
  if to_regclass('public.user_profiles') is null
     or to_regclass('public.app_user_roles') is null
     or to_regclass('public.user_data') is null then
    raise exception 'Yourself core tables are missing. Run supabase.sql first.';
  end if;
end;
$$;

-- PostgREST cannot change the output shape of an existing table-returning RPC
-- with CREATE OR REPLACE, so drop and recreate it deliberately.
drop function if exists public.admin_list_profiles();
create function public.admin_list_profiles()
returns table (
  id uuid,
  email text,
  full_name text,
  job_title text,
  account_status text,
  created_at timestamptz,
  is_developer boolean,
  avatar_path text,
  has_app_data boolean,
  app_data_updated_at timestamptz
)
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $$
begin
  if not public.is_current_user_developer() then
    raise exception 'not_authorized' using errcode = '42501';
  end if;

  return query
    select
      p.id,
      p.email,
      p.full_name,
      p.job_title,
      p.account_status,
      p.created_at,
      exists (
        select 1 from public.app_user_roles r
        where r.user_id = p.id and r.role = 'developer'
      ) as is_developer,
      p.avatar_path,
      (d.user_id is not null) as has_app_data,
      d.updated_at as app_data_updated_at
    from public.user_profiles p
    left join public.user_data d on d.user_id = p.id
    order by p.created_at desc;
end;
$$;

revoke all on function public.admin_list_profiles() from public, anon;
grant execute on function public.admin_list_profiles() to authenticated;

-- A developer may view profile photographs through short-lived signed URLs.
-- This grants read access only; it does not grant upload, replacement or delete.
drop policy if exists "avatar_read_own_approved" on storage.objects;
drop policy if exists "avatar_read_self_or_developer" on storage.objects;
create policy "avatar_read_self_or_developer"
on storage.objects for select to authenticated
using (
  bucket_id = 'avatars'
  and (
    (
      (storage.foldername(name))[1] = (select auth.uid())::text
      and (select public.is_approved_user())
    )
    or (select public.is_current_user_developer())
  )
);

commit;

notify pgrst, 'reload schema';
