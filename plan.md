# خطة إصدار Yourself

الإصدار يستخدم Vite وJavaScript modules وSupabase Auth بالبريد وكلمة المرور فقط، مع PostgreSQL/RLS وStorage. لا توجد مصادقة Google في هذا الإصدار.

يتم تضمين Project URL وPublishable Key العام لمشروع Supabase الحالي مباشرة في `src/supabaseClient.js` لتكون الحزمة جاهزة للبناء والنشر دون إضافة متغيرات بيئة إلى Vercel. لا تتضمن الحزمة أي مفاتيح خدمة أو أسرار إدارية.

تُحفظ البيانات في `public.user_data.payload` ويُقرأ الملف الشخصي من `public.user_profiles`، وتُقرأ صلاحية المطور من `public.app_user_roles`. لا حاجة إلى إنشاء قاعدة جديدة أو إعادة تشغيل migration على المشروع السابق.
