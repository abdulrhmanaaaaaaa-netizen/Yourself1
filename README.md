# Yourself — نسخة مسطّحة بلا مكتبات واجهة

كل الملفات السبعة في هذا المجلد الجذر: `index.html` و`style.css` و`script.js` و`config.js` و`supabase.sql` و`delete-account.ts` وهذا الدليل. الموقع يستخدم JavaScript وFetch المدمجين في المتصفح؛ لا يحتاج npm أو Vite أو Supabase SDK أو مجلدات فرعية. الخطوط تعتمد خطوط النظام لتجنب طلب موارد خارجية.

## تشغيل الواجهة

قدّم هذا المجلد عبر HTTPS أو خادم محلي بسيط (لا تفتح `index.html` بصيغة `file://` لأن تسجيل الدخول يحتاج أصلًا ويبًا). للاختبار المحلي، شغّل `python3 -m http.server 8080` من هذا المجلد ثم افتح `http://localhost:8080`.

## إعداد Supabase

1. أنشئ مشروع Supabase جديدًا.
2. افتح `config.js` وضع **Project URL** في `supabaseUrl` والمفتاح العام **Publishable** أو **anon** في `supabasePublishableKey`. هذان مخصصان للواجهة العامة، وRLS تحمي بيانات المستخدمين.
3. نفّذ `supabase.sql` كاملًا في SQL Editor؛ ينشئ الجداول وRLS والأدوار وسلة الصور الخاصة.
4. فعّل Email من Authentication → Providers. الحسابات الجديدة تبدأ `pending` ولا تصل إلى بيانات التطبيق حتى اعتمادها.
5. أضف أصل الموقع الدقيق في Authentication → URL Configuration وRedirect URLs. وللتسجيل بـGoogle أنشئ Web OAuth client، ثم أدخل Client ID وClient Secret في مزود Google داخل إعدادات Supabase واضبط Callback URL الذي يعرضه Supabase.
6. بعد تسجيل أول حساب مطوّر وتأكيد بريده، شغّل الاستعلام التالي في SQL Editor بعد استبدال عنوان البريد:

```sql
with target as (
  select id from auth.users where lower(email) = lower('YOUR_EMAIL@example.com')
)
update public.user_profiles set account_status = 'approved'
where id in (select id from target);

insert into public.app_user_roles (user_id, role)
select id, 'developer' from auth.users
where lower(email) = lower('YOUR_EMAIL@example.com')
on conflict (user_id, role) do nothing;
```

## نشر حذف الحساب

انسخ `delete-account.ts` إلى `supabase/functions/delete-account/index.ts` داخل مشروع Supabase CLI، ثم انشره بالأمر `supabase functions deploy delete-account`. الوظيفة تستخدم Fetch القياسي فقط. خزّن `SUPABASE_SERVICE_ROLE_KEY` في Edge Function Secrets بلوحة Supabase، لا في `config.js` ولا HTML/JavaScript. تتطلب حذف حساب مستخدم آخر دور developer من قاعدة البيانات.

## حدود المفاتيح والأمان

لا أضع مفاتيح فعلية غير مقدمة، ولا يمكن كتابة بيانات Supabase أو Google نيابةً عنك دونها. رابط المشروع والمفتاح العام فقط صالحان لملف `config.js`. **مفتاح `service_role` وسر Google لا يوضعان أبدًا في ملفات الواجهة**؛ أي زائر يستطيع قراءتهما واستخدام صلاحياتهما. يبقي التطبيق رموز الجلسة في `sessionStorage` فقط ولا يخزن كلمات المرور. إعداد Google الحي يتطلب منك إدخال الأسرار في Supabase، لا إرسالها في المحادثة.