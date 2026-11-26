# توافق نسخة Yourself مع مشروع Supabase السابق

هذه الحزمة مهيأة للاتصال بمشروع Supabase الحالي عبر `src/supabaseClient.js`.

الجداول المستخدمة: `public.user_profiles` و`public.user_data` و`public.app_user_roles`.

الحالة والصلاحيات: `user_profiles.account_status` بقيم `pending` و`approved` و`rejected`، والدور `developer` في `app_user_roles`.

بيانات التطبيق محفوظة في `user_data.payload`، والصور في Storage bucket `avatars`.

لا تشغّل ملف migration على المشروع الحالي مرة أخرى؛ هو مرجع بنية قاعدة البيانات التي أُنشئت سابقًا. لا تحتوي هذه النسخة على تسجيل دخول Google أو OAuth.
