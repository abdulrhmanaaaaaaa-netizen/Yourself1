# Yourself — نسخة ثابتة بدون مكتبات خارجية

هذه النسخة تستخدم HTML وCSS وJavaScript العادي فقط، وتتصل بمشروع Supabase السابق مباشرة عبر واجهات REST باستخدام `fetch` المدمج في المتصفح.

## الملفات

جميع ملفات الموقع موجودة في جذر الأرشيف، دون مجلد مشروع خارجي أو مجلد `src`:

- `index.html` — صفحة الموقع.
- `style.css` — التصميم.
- `script.js` — وظائف الموقع.
- `supabaseClient.js` — الاتصال بـSupabase عبر REST دون SDK.
- `calculator.js` — وظائف الآلة الحاسبة.
- `payroll.js` — حسابات الدخل وساعات العمل.
- `delete-account-edge-function.txt` — كود وظيفة الحذف الاختيارية لـSupabase Edge Functions.

لا يوجد `package.json` أو `package-lock.json` أو Vite أو npm dependencies أو مكتبة JavaScript خارجية. الخطوط تستخدم خطوط النظام بدل تحميل Google Fonts.

## النشر على GitHub وVercel

1. استخرج ZIP؛ ستجد الملفات مباشرة أمامك.
2. ارفع الملفات الستة الخاصة بالموقع إلى جذر مستودع GitHub نفسه، بجوار بعضها:
   `index.html`, `style.css`, `script.js`, `supabaseClient.js`, `calculator.js`, `payroll.js`.
3. لا ترفع `delete-account-edge-function.txt` إلى مجلد الموقع إذا كنت لا تريد إتاحته كملف عام؛ احتفظ به لنسخ كوده إلى Supabase فقط.
4. في Vercel اجعل Framework Preset هو `Other`، ولا تستخدم أمر Build أو Install؛ الموقع ثابت ويُخدم مباشرة من `index.html`.
5. أعد النشر بعد رفع الملفات.

## اتصال Supabase

تم إدراج رابط مشروع Supabase ومفتاح Publishable العام داخل `supabaseClient.js`:

- Project URL: `https://jxdzihloouksaebxigrz.supabase.co`
- المفتاح من نوع `sb_publishable_`، وهو مفتاح عام مخصص للواجهة.

لا تضع مطلقًا `service_role` أو `secret key` أو كلمة مرور قاعدة البيانات في ملفات الموقع. المفتاح العام لا يغني عن RLS؛ يجب أن تبقى سياسات قاعدة البيانات مفعّلة.

## إعدادات المصادقة المطلوبة

في Supabase → Authentication → URL Configuration:

- Site URL: `https://yourself1.vercel.app/`
- Redirect URLs: `https://yourself1.vercel.app/` و `https://yourself1.vercel.app/**`

فعّل Email Provider. هذه النسخة تستخدم البريد وكلمة المرور فقط، ولا تحتوي على تسجيل Google أو OAuth.

## حسابات المطوّرين

تستعمل النسخة نفس الجداول الموجودة في مشروع Supabase السابق:

- `user_profiles`
- `user_data`
- `app_user_roles`

لن تُنشأ قاعدة بيانات جديدة. لا تعِد تشغيل SQL القديم لمجرد نشر هذه الملفات. سجّل الدخول بالحساب الذي تم اعتماده ومنحه `developer` في `app_user_roles`.

تذكير: قد تحتاج إلى تسجيل الدخول مجددًا مرة واحدة؛ فالنسخة تستخدم مفتاح جلسة محليًا خاصًا بها، لكنها لا تغيّر كلمات المرور أو معرفات الحسابات في Supabase.

## تفعيل حذف الحساب

حذف حساب المستخدم، أو حذف حساب آخر من لوحة المطوّر، يحتاج إلى Edge Function اسمها `delete-account`:

1. افتح Supabase → Edge Functions.
2. أنشئ Function جديدة باسم `delete-account` باستخدام المحرر.
3. افتح `delete-account-edge-function.txt` وانسخ محتواه كاملًا إلى محرر الوظيفة.
4. انشر الوظيفة.

الوظيفة تستخدم `Deno.serve` و`fetch` المدمجين ولا تستورد أي SDK. تعتمد على متغيرات Supabase الافتراضية في بيئة Edge Functions، ومنها `SUPABASE_URL` و`SUPABASE_ANON_KEY` و`SUPABASE_SERVICE_ROLE_KEY`. لا تضع مفتاح الخدمة في ملفات الموقع.

إذا لم تنشر وظيفة الحذف، سيظل تسجيل الدخول، التسجيل، مزامنة البيانات، الصور، وصلاحيات لوحة المطوّر تعمل، لكن أزرار حذف الحساب لن تكتمل.
