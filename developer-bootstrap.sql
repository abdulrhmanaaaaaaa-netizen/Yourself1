-- شغّل هذا الملف في SQL Editor بعد أن يسجل المطور نفسه من واجهة الموقع.
-- يفعّل فقط الحسابين المعروفين مسبقًا ويمنحهما دور developer.
-- لا ينشئ كلمات مرور ولا يفعّل أي مستخدم آخر.

begin;

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

commit;

select requested.email,
  case
    when u.id is null then 'NOT FOUND: sign up with this email first'
    when p.account_status = 'approved' and r.role = 'developer'
      then 'READY: developer can sign in'
    else 'CHECK: rerun developer-bootstrap.sql'
  end as result,
  p.account_status,
  r.role
from (values ('Haider@gmail.com'), ('Huang@gmail.com')) as requested(email)
left join auth.users u on lower(u.email) = lower(requested.email)
left join public.user_profiles p on p.id = u.id
left join public.app_user_roles r on r.user_id = u.id and r.role = 'developer'
order by requested.email;
