-- Yourself: least-privilege schema for account profiles, app data, developer roles and private avatars.
-- Run this migration in a new Supabase project. Never expose service_role in the browser.

create table if not exists public.user_profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null default '',
  full_name text not null default '',
  job_title text not null default '',
  avatar_path text,
  account_status text not null default 'pending'
    check (account_status in ('pending', 'approved', 'rejected')),
  created_at timestamptz not null default now()
);

create table if not exists public.user_data (
  user_id uuid primary key references auth.users(id) on delete cascade,
  payload jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

create table if not exists public.app_user_roles (
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('developer')),
  granted_at timestamptz not null default now(),
  primary key (user_id, role)
);

create index if not exists user_profiles_status_created_idx
  on public.user_profiles (account_status, created_at desc);

alter table public.user_profiles enable row level security;
alter table public.user_data enable row level security;
alter table public.app_user_roles enable row level security;

revoke all on public.user_profiles, public.user_data, public.app_user_roles from public, anon;
grant select on public.user_profiles to authenticated;
grant update (full_name, job_title, avatar_path) on public.user_profiles to authenticated;
grant select, insert, update, delete on public.user_data to authenticated;
grant select on public.app_user_roles to authenticated;

create or replace function public.is_approved_user()
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select exists (
    select 1 from public.user_profiles p
    where p.id = (select auth.uid()) and p.account_status = 'approved'
  );
$$;

create or replace function public.is_current_user_developer()
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select exists (
    select 1 from public.app_user_roles r
    where r.user_id = (select auth.uid()) and r.role = 'developer'
  );
$$;

revoke all on function public.is_approved_user() from public, anon;
revoke all on function public.is_current_user_developer() from public, anon;
grant execute on function public.is_approved_user() to authenticated;
grant execute on function public.is_current_user_developer() to authenticated;

create policy "profile_select_own"
on public.user_profiles for select to authenticated
using (id = (select auth.uid()));

create policy "profile_update_own"
on public.user_profiles for update to authenticated
using (id = (select auth.uid()))
with check (id = (select auth.uid()));

create policy "user_data_select_own_approved"
on public.user_data for select to authenticated
using (user_id = (select auth.uid()) and (select public.is_approved_user()));

create policy "user_data_insert_own_approved"
on public.user_data for insert to authenticated
with check (user_id = (select auth.uid()) and (select public.is_approved_user()));

create policy "user_data_update_own_approved"
on public.user_data for update to authenticated
using (user_id = (select auth.uid()) and (select public.is_approved_user()))
with check (user_id = (select auth.uid()) and (select public.is_approved_user()));

create policy "user_data_delete_own_approved"
on public.user_data for delete to authenticated
using (user_id = (select auth.uid()) and (select public.is_approved_user()));

create policy "role_select_own"
on public.app_user_roles for select to authenticated
using (user_id = (select auth.uid()));

create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  insert into public.user_profiles (id, email, full_name, account_status)
  values (
    new.id,
    coalesce(new.email, ''),
    coalesce(nullif(new.raw_user_meta_data ->> 'full_name', ''), nullif(new.raw_user_meta_data ->> 'name', ''), 'مستخدم Yourself'),
    'pending'
  )
  on conflict (id) do update
    set email = excluded.email;
  return new;
end;
$$;

revoke all on function public.handle_new_auth_user() from public, anon, authenticated;
drop trigger if exists on_auth_user_created_yourself on auth.users;
create trigger on_auth_user_created_yourself
after insert on auth.users
for each row execute function public.handle_new_auth_user();

create or replace function public.admin_list_profiles()
returns table (
  id uuid,
  email text,
  full_name text,
  job_title text,
  account_status text,
  created_at timestamptz
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
    select p.id, p.email, p.full_name, p.job_title, p.account_status, p.created_at
    from public.user_profiles p
    order by p.created_at desc;
end;
$$;

create or replace function public.admin_set_profile_status(target_user_id uuid, new_status text)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  if not public.is_current_user_developer() then
    raise exception 'not_authorized' using errcode = '42501';
  end if;
  if new_status not in ('approved', 'rejected') then
    raise exception 'invalid_status' using errcode = '22023';
  end if;
  update public.user_profiles
  set account_status = new_status
  where id = target_user_id;
  if not found then
    raise exception 'profile_not_found' using errcode = 'P0002';
  end if;
  return true;
end;
$$;

revoke all on function public.admin_list_profiles() from public, anon;
revoke all on function public.admin_set_profile_status(uuid, text) from public, anon;
grant execute on function public.admin_list_profiles() to authenticated;
grant execute on function public.admin_set_profile_status(uuid, text) to authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('avatars', 'avatars', false, 2097152, array['image/jpeg','image/png','image/webp','image/avif'])
on conflict (id) do update set public = false, file_size_limit = 2097152,
  allowed_mime_types = array['image/jpeg','image/png','image/webp','image/avif'];

create policy "avatar_read_own_approved"
on storage.objects for select to authenticated
using (
  bucket_id = 'avatars'
  and (storage.foldername(name))[1] = (select auth.uid())::text
  and (select public.is_approved_user())
);

create policy "avatar_insert_own_approved"
on storage.objects for insert to authenticated
with check (
  bucket_id = 'avatars'
  and (storage.foldername(name))[1] = (select auth.uid())::text
  and (select public.is_approved_user())
);

create policy "avatar_update_own_approved"
on storage.objects for update to authenticated
using (
  bucket_id = 'avatars'
  and (storage.foldername(name))[1] = (select auth.uid())::text
  and (select public.is_approved_user())
)
with check (
  bucket_id = 'avatars'
  and (storage.foldername(name))[1] = (select auth.uid())::text
  and (select public.is_approved_user())
);

create policy "avatar_delete_own_approved"
on storage.objects for delete to authenticated
using (
  bucket_id = 'avatars'
  and (storage.foldername(name))[1] = (select auth.uid())::text
  and (select public.is_approved_user())
);
