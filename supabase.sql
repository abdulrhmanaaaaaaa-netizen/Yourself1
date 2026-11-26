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

create table if not exists public.support_conversations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  subject text not null check (char_length(subject) between 1 and 120),
  status text not null default 'open' check (status in ('open', 'closed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.support_messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.support_conversations(id) on delete cascade,
  sender_id uuid not null references auth.users(id) on delete cascade,
  body text not null check (char_length(body) between 1 and 4000),
  created_at timestamptz not null default now()
);

create table if not exists public.user_notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null check (char_length(title) between 1 and 120),
  body text not null check (char_length(body) between 1 and 2000),
  created_at timestamptz not null default now(),
  read_at timestamptz
);

create index if not exists user_profiles_status_created_idx
  on public.user_profiles (account_status, created_at desc);
create index if not exists support_conversations_user_updated_idx
  on public.support_conversations (user_id, updated_at desc);
create index if not exists support_messages_conversation_created_idx
  on public.support_messages (conversation_id, created_at);
create index if not exists user_notifications_user_created_idx
  on public.user_notifications (user_id, created_at desc);

alter table public.user_profiles enable row level security;
alter table public.user_data enable row level security;
alter table public.app_user_roles enable row level security;
alter table public.support_conversations enable row level security;
alter table public.support_messages enable row level security;
alter table public.user_notifications enable row level security;

revoke all on public.user_profiles, public.user_data, public.app_user_roles, public.support_conversations, public.support_messages, public.user_notifications from public, anon, authenticated;
grant select on public.user_profiles to authenticated;
grant update (full_name, job_title, avatar_path) on public.user_profiles to authenticated;
grant select, insert, update, delete on public.user_data to authenticated;
grant select on public.app_user_roles to authenticated;
grant select, insert on public.support_conversations to authenticated;
grant select, insert on public.support_messages to authenticated;
grant select on public.user_notifications to authenticated;
grant insert on public.user_notifications to authenticated;
grant update (read_at) on public.user_notifications to authenticated;

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

drop policy if exists "profile_select_own" on public.user_profiles;
create policy "profile_select_own"
on public.user_profiles for select to authenticated
using (id = (select auth.uid()));

drop policy if exists "profile_update_own" on public.user_profiles;
create policy "profile_update_own"
on public.user_profiles for update to authenticated
using (id = (select auth.uid()))
with check (id = (select auth.uid()));

drop policy if exists "user_data_select_own_approved" on public.user_data;
create policy "user_data_select_own_approved"
on public.user_data for select to authenticated
using (user_id = (select auth.uid()) and (select public.is_approved_user()));

drop policy if exists "user_data_insert_own_approved" on public.user_data;
create policy "user_data_insert_own_approved"
on public.user_data for insert to authenticated
with check (user_id = (select auth.uid()) and (select public.is_approved_user()));

drop policy if exists "user_data_update_own_approved" on public.user_data;
create policy "user_data_update_own_approved"
on public.user_data for update to authenticated
using (user_id = (select auth.uid()) and (select public.is_approved_user()))
with check (user_id = (select auth.uid()) and (select public.is_approved_user()));

drop policy if exists "user_data_delete_own_approved" on public.user_data;
create policy "user_data_delete_own_approved"
on public.user_data for delete to authenticated
using (user_id = (select auth.uid()) and (select public.is_approved_user()));

drop policy if exists "role_select_own" on public.app_user_roles;
create policy "role_select_own"
on public.app_user_roles for select to authenticated
using (user_id = (select auth.uid()));

drop policy if exists "support_conversation_select_own_or_developer" on public.support_conversations;
create policy "support_conversation_select_own_or_developer"
on public.support_conversations for select to authenticated
using (user_id = (select auth.uid()) or (select public.is_current_user_developer()));

drop policy if exists "support_conversation_insert_own" on public.support_conversations;
create policy "support_conversation_insert_own"
on public.support_conversations for insert to authenticated
with check (user_id = (select auth.uid()));

drop policy if exists "support_message_select_participant_or_developer" on public.support_messages;
create policy "support_message_select_participant_or_developer"
on public.support_messages for select to authenticated
using (
  exists (
    select 1 from public.support_conversations c
    where c.id = conversation_id
      and (c.user_id = (select auth.uid()) or (select public.is_current_user_developer()))
  )
);

drop policy if exists "support_message_insert_as_self_in_allowed_conversation" on public.support_messages;
create policy "support_message_insert_as_self_in_allowed_conversation"
on public.support_messages for insert to authenticated
with check (
  sender_id = (select auth.uid())
  and exists (
    select 1 from public.support_conversations c
    where c.id = conversation_id
      and (
        (c.user_id = (select auth.uid()) and c.status = 'open')
        or (select public.is_current_user_developer())
      )
  )
);

drop policy if exists "notification_select_own" on public.user_notifications;
create policy "notification_select_own"
on public.user_notifications for select to authenticated
using (user_id = (select auth.uid()));

drop policy if exists "notification_insert_developer_only" on public.user_notifications;
create policy "notification_insert_developer_only"
on public.user_notifications for insert to authenticated
with check ((select public.is_current_user_developer()));

drop policy if exists "notification_update_own_read_state" on public.user_notifications;
create policy "notification_update_own_read_state"
on public.user_notifications for update to authenticated
using (user_id = (select auth.uid()))
with check (user_id = (select auth.uid()));

create or replace function public.touch_support_conversation()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  update public.support_conversations
  set updated_at = now()
  where id = new.conversation_id;
  return new;
end;
$$;

revoke all on function public.touch_support_conversation() from public, anon, authenticated;
drop trigger if exists support_message_touches_conversation on public.support_messages;
create trigger support_message_touches_conversation
after insert on public.support_messages
for each row execute function public.touch_support_conversation();

create or replace function public.admin_set_support_status(target_conversation_id uuid, new_status text)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  if not public.is_current_user_developer() then
    raise exception 'not_authorized' using errcode = '42501';
  end if;
  if new_status not in ('open', 'closed') then
    raise exception 'invalid_status' using errcode = '22023';
  end if;
  update public.support_conversations
  set status = new_status, updated_at = now()
  where id = target_conversation_id;
  if not found then
    raise exception 'conversation_not_found' using errcode = 'P0002';
  end if;
  return true;
end;
$$;

revoke all on function public.admin_set_support_status(uuid, text) from public, anon;
grant execute on function public.admin_set_support_status(uuid, text) to authenticated;

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
  if exists (
    select 1 from public.app_user_roles r
    where r.user_id = target_user_id and r.role = 'developer'
  ) then
    raise exception 'developer_status_protected' using errcode = '42501';
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

drop policy if exists "avatar_read_own_approved" on storage.objects;
create policy "avatar_read_own_approved"
on storage.objects for select to authenticated
using (
  bucket_id = 'avatars'
  and (storage.foldername(name))[1] = (select auth.uid())::text
  and (select public.is_approved_user())
);

drop policy if exists "avatar_insert_own_approved" on storage.objects;
create policy "avatar_insert_own_approved"
on storage.objects for insert to authenticated
with check (
  bucket_id = 'avatars'
  and (storage.foldername(name))[1] = (select auth.uid())::text
  and (select public.is_approved_user())
);

drop policy if exists "avatar_update_own_approved" on storage.objects;
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

drop policy if exists "avatar_delete_own_approved" on storage.objects;
create policy "avatar_delete_own_approved"
on storage.objects for delete to authenticated
using (
  bucket_id = 'avatars'
  and (storage.foldername(name))[1] = (select auth.uid())::text
  and (select public.is_approved_user())
);

-- Developer accounts are bootstrapped below if they already exist in Auth.
-- Email confirmation is not required here; passwords are never handled by SQL.

-- ------------------------------------------------------------
-- 9. Bootstrap the two developer accounts, if they already exist in Auth.
--    This does not create users, set passwords, or expose secrets.
-- ------------------------------------------------------------
insert into public.user_profiles (id, email, full_name, account_status)
select
  u.id,
  coalesce(u.email, ''),
  coalesce(
    nullif(u.raw_user_meta_data ->> 'full_name', ''),
    nullif(u.raw_user_meta_data ->> 'name', ''),
    split_part(coalesce(u.email, ''), '@', 1)
  ),
  'approved'
from auth.users u
where lower(u.email) in (lower('Haider@gmail.com'), lower('Huang@gmail.com'))
on conflict (id) do update
set email = excluded.email,
    account_status = 'approved';

insert into public.app_user_roles (user_id, role)
select u.id, 'developer'
from auth.users u
where lower(u.email) in (lower('Haider@gmail.com'), lower('Huang@gmail.com'))
on conflict (user_id, role) do nothing;

-- Run result check: create missing accounts in Authentication first,
-- then rerun this complete SQL file to bootstrap them.
with requested(email) as (
  values ('Haider@gmail.com'), ('Huang@gmail.com')
)
select
  requested.email,
  case
    when u.id is null then 'NOT FOUND: create this Auth user first'
    when p.account_status = 'approved' and r.role = 'developer'
      then 'READY: approved developer'
    else 'CHECK: rerun this SQL file to grant the developer role'
  end as result,
  p.account_status,
  r.role
from requested
left join auth.users u on lower(u.email) = lower(requested.email)
left join public.user_profiles p on p.id = u.id
left join public.app_user_roles r on r.user_id = u.id and r.role = 'developer'
order by requested.email;

-- End of the single, complete Yourself setup for Supabase SQL Editor.
