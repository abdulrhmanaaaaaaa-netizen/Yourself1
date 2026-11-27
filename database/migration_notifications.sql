-- Yourself: تحديث الإشعارات وواجهة المطور للمشروعات الموجودة مسبقًا.
-- شغّل هذا الملف مرة واحدة من Supabase Dashboard > SQL Editor.
-- يتطلب وجود user_profiles وapp_user_roles وuser_notifications والدالة is_current_user_developer().

begin;

do $$
begin
  if to_regclass('public.user_profiles') is null
     or to_regclass('public.app_user_roles') is null
     or to_regclass('public.user_notifications') is null then
    raise exception 'Yourself core tables are missing. Run supabase.sql first.';
  end if;
end;
$$;

-- PostgREST needs a dropped and recreated function when RETURNS TABLE gains a column.
drop function if exists public.admin_list_profiles();
create function public.admin_list_profiles()
returns table (
  id uuid,
  email text,
  full_name text,
  job_title text,
  account_status text,
  created_at timestamptz,
  is_developer boolean
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
    select p.id, p.email, p.full_name, p.job_title, p.account_status, p.created_at,
      exists (
        select 1 from public.app_user_roles r
        where r.user_id = p.id and r.role = 'developer'
      )
    from public.user_profiles p
    order by p.created_at desc;
end;
$$;

-- Reassert the private inbox permissions and developer-only insert policy.
alter table public.user_notifications enable row level security;
revoke all on public.user_notifications from public, anon, authenticated;
grant select, insert on public.user_notifications to authenticated;
grant update (read_at) on public.user_notifications to authenticated;
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

-- Every developer receives an in-app inbox item when a new Auth user applies.
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
    coalesce(
      nullif(new.raw_user_meta_data ->> 'full_name', ''),
      nullif(new.raw_user_meta_data ->> 'name', ''),
      'مستخدم Yourself'
    ),
    'pending'
  )
  on conflict (id) do update
    set email = excluded.email;

  insert into public.user_notifications (user_id, title, body)
  select r.user_id,
    'طلب تسجيل جديد',
    'وصل طلب انضمام جديد من ' || coalesce(nullif(new.email, ''), 'بريد غير متاح') || '، وهو الآن بانتظار المراجعة.'
  from public.app_user_roles r
  where r.role = 'developer';

  return new;
end;
$$;

-- Ensure the Auth trigger uses the updated fan-out function.
drop trigger if exists on_auth_user_created_yourself on auth.users;
create trigger on_auth_user_created_yourself
after insert on auth.users
for each row execute function public.handle_new_auth_user();

-- Notify the account owner whenever a developer approves or rejects the request.
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

  insert into public.user_notifications (user_id, title, body)
  values (
    target_user_id,
    case when new_status = 'approved' then 'تم قبول طلبك' else 'تم تحديث حالة طلبك' end,
    case when new_status = 'approved'
      then 'تمت الموافقة على حسابك. يمكنك الآن تسجيل الدخول واستخدام خدمات Yourself.'
      else 'لم تتم الموافقة على طلب الوصول في الوقت الحالي. يمكنك التواصل مع فريق الدعم للاستفسار.'
    end
  );
  return true;
end;
$$;

revoke all on function public.admin_list_profiles() from public, anon;
revoke all on function public.admin_set_profile_status(uuid, text) from public, anon;
grant execute on function public.admin_list_profiles() to authenticated;
grant execute on function public.admin_set_profile_status(uuid, text) to authenticated;

commit;
