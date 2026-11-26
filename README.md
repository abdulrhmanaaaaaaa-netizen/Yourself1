# Yourself

موقع Yourself عربي لإدارة العمل والدخل والميزانية والتخطيط والصحة. هذه النسخة مرتبطة مسبقًا بمشروع Supabase الحالي، وتستخدم تسجيل الدخول بالبريد الإلكتروني وكلمة المرور فقط؛ تم حذف تسجيل Google من الواجهة والكود.

## النشر على GitHub وVercel

1. ارفع محتويات هذا المجلد إلى جذر مستودع GitHub المرتبط بمشروع Vercel، مع استبدال ملفات النسخة السابقة. يجب أن يكون `index.html` و`package.json` في جذر المستودع.
2. إعداد البناء في Vercel: Framework Preset = Vite، Build Command = `npm run build`، Output Directory = `dist`، Install Command = `npm install`، وRoot Directory = `./`.
3. لا تحتاج إلى إضافة متغيرات بيئة Supabase في Vercel لهذه النسخة؛ رابط المشروع والمفتاح العام مضمنان في `src/supabaseClient.js`.
4. بعد رفع الملفات، نفّذ Redeploy أو انتظر النشر التلقائي من GitHub.

## اتصال Supabase المستخدم

هذه النسخة تتصل بالمشروع الموجود مسبقًا: `https://jxdzihloouksaebxigrz.supabase.co`. تستخدم مفتاح `sb_publishable_` العام فقط. المفتاح العام مخصص للواجهة، أما `service_role` أو أي Secret Key فلا يوضع مطلقًا في ملفات الموقع أو GitHub.

**لا تنشئ مشروع Supabase جديدًا ولا تشغّل ملف SQL المرفق مرة أخرى على قاعدة البيانات الحالية.** ملف `supabase/migrations/202611240001_init_yourself.sql` مرجع لمخطط المشروع فقط؛ تشغيله مرة أخرى قد ينتج عنه تعارض في السياسات الموجودة. قاعدة البيانات التي أنشأتها سابقًا تحتفظ بالجداول والحسابات والأدوار، وهذه النسخة تستخدم الجداول نفسها: `user_profiles` و`user_data` و`app_user_roles` وStorage bucket باسم `avatars`.

## تسجيل الدخول والحسابات

- تسجيل الدخول بالبريد وكلمة المرور عبر Supabase Auth.
- إنشاء الحساب يبدأ بحالة `pending` من خلال Trigger قاعدة البيانات.
- لا يستطيع المستخدم فتح بيانات التطبيق قبل موافقة المطور.
- بيانات التطبيق تُحفظ في `public.user_data.payload` لكل مستخدم.
- صلاحية المطور تُقرأ من `public.app_user_roles`، ودور `developer` لا يُمنح من الواجهة.
- صفحة لوحة المطور تعرض طلبات الحسابات وتسمح بالموافقة والرفض والتعليق وإعادة القبول.

## إعداد أول مطور

إذا كنت قد منحت حسابك دور `developer` في قاعدة البيانات السابقة، فلا تعِد هذه الخطوة. إذا لم تفعل، سجّل الحساب أولًا ثم نفّذ الاستعلام التالي مرة واحدة من SQL Editor بعد استبدال البريد ببريدك: 

```sql
with target as (
  select id from auth.users where lower(email) = lower('YOUR_EMAIL@example.com')
)
update public.user_profiles
set account_status = 'approved'
where id in (select id from target);

insert into public.app_user_roles (user_id, role)
select id, 'developer'
from auth.users
where lower(email) = lower('YOUR_EMAIL@example.com')
on conflict (user_id, role) do nothing;
```

بعدها سجّل الخروج والدخول مجددًا. لا تمنح هذه الصلاحية إلا لحساب موثوق.

## حذف الحسابات

حذف حساب Auth يحتاج إلى Edge Function باسم `delete-account`. يوجد مصدرها في `supabase/functions/delete-account/index.ts`. إذا كنت قد نشرتها في مشروع Supabase السابق، فستظل النسخة تستخدمها عبر الاسم نفسه ولا تحتاج إلى إعادة نشرها. إذا لم تكن منشورة، فميزة حذف الحساب لن تعمل حتى تنشرها من Supabase Edge Functions. لا تضع مفتاح الخدمة في الواجهة.

## اختبارات محلية

```bash
npm install
npm test
npm run build
```

ملاحظة: إعدادات URL Configuration في Supabase يجب أن تسمح بعنوان موقعك المنشور `https://yourself1.vercel.app/` إذا كان المشروع يفرض التحقق من رابط الرجوع عند التسجيل بالبريد. لا توجد حاجة إلى إعداد Google OAuth في هذه النسخة.
