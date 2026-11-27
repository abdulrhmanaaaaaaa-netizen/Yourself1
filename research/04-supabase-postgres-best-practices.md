# supabase-postgres-best-practices في مشروع Yourself

هذه المهارة هي حزمة إرشادات من Supabase لتحسين PostgreSQL، وليست مكتبة واجهة ولا تتطلب React. ملف `SKILL.md` يطلب الرجوع إليها قبل إنشاء أو تعديل الجداول والأعمدة، الترحيلات، سياسات RLS، الفهارس، الدوال والمشغلات، الاتصال والتوسّع، أو تشخيص البطء والأقفال وتسرب صفوف مستخدم إلى مستخدم آخر. وهي منظمة في ثمانية أقسام مرتبة حسب الأثر: أداء الاستعلامات، إدارة الاتصالات، الأمان وRLS، تصميم المخطط، التزامن والأقفال، أنماط الوصول، المراقبة والتشخيص، والميزات المتقدمة [1] [2].

## ما الذي تفعله عمليًا؟

تعمل كقائمة مراجعة عملية للوكيل أو المطوّر. كل قاعدة تشرح المشكلة، وتعرض SQL غير مناسبًا ثم SQL مصححًا، وقد تضيف خطة `EXPLAIN` أو ملاحظات خاصة بـSupabase. أمثلتها الأساسية هي:

- فهرسة أعمدة `WHERE` و`JOIN`، وفهرسة طرف المفتاح الأجنبي، حتى لا تتحول القراءة إلى مسح كامل للجدول [3]. عند وجود أكثر من شرط، يوضع عمود المساواة قبل عمود النطاق في الفهرس المركب، مثل `(status, created_at)` [4]. لا ينبغي إضافة فهارس عشوائيًا؛ يجب قياس خطة التنفيذ لأن الفهرس يسرّع القراءة لكنه يضيف كلفة للكتابة [13].
- استخدام pooler عند الحاجة بدل فتح اتصال PostgreSQL جديد لكل طلب. وضع المعاملة مناسب للاتصالات القصيرة وبيئات serverless، لكن Supabase ينبه إلى أن shared transaction pooler لا يدعم prepared statements وحالة الجلسة بالطريقة نفسها [5] [12]. وبالنسبة لواجهة المتصفح، توصي وثائق Supabase باستخدام Data API أو مكتبة JavaScript، لا سلسلة اتصال قاعدة البيانات [12].
- فرض عزل البيانات في قاعدة البيانات بواسطة RLS، مع منح الأدوار أقل صلاحيات ممكنة. يجب كتابة سياسة منفصلة لكل عملية عند الحاجة، واختبار السماح والمنع لـ`anon` و`authenticated` بدل الاعتماد على إخفاء عناصر الواجهة [6] [11].
- تحسين RLS بوضع الفهارس على الأعمدة التي تفلتر بها السياسة، ولفّ دوال مثل `auth.uid()` داخل `select` كي تُحسب مرة لكل statement بدل كل صف [7] [11].
- اختيار الأنواع الصحيحة: `bigint` أو UUID للمفاتيح حسب الحالة، `text` بدل حدّ `varchar` المصطنع، `timestamptz` للتواريخ، `boolean` للمنطق، و`numeric` للأموال الدقيقة [8].
- منع N+1 في JavaScript عبر جلب دفعة واحدة أو علاقة/استعلام واحد، واستخدام pagination بالمؤشر (keyset) بدل `OFFSET` عندما تكبر النتائج [9] [10]. واستخدام UPSERT ذري عندما يكون المطلوب insert-or-update بدل SELECT ثم INSERT/UPDATE المتسابق [14].
- استخدام `EXPLAIN (ANALYZE, BUFFERS)` لتشخيص الاستعلام الحقيقي بدل التخمين، ومراقبة المسح التسلسلي، الصفوف المستبعدة، الـbuffers، وحلقات Nested Loop [15].

## ما ينطبق على Yourself الآن

المراجعة الحالية لمشروع Yourself (HTML/CSS/JavaScript أصلي، و`config.js` وطبقة `YSBackend` مع Supabase) تُظهر أن الأساس متوافق مع المهارة: `supabase.sql` يستخدم `timestamptz` و`jsonb` وقيود `check` ومفاتيح خارجية، يفعّل RLS لكل جداول `public`، يسحب الصلاحيات العامة، يمنح صلاحيات محددة، ويستخدم دوال `security definer` مع `search_path` ثابتًا. كما توجد فهارس على حالة الحساب وتاريخ الإنشاء، وعلى `user_id`/`updated_at` للمحادثات، وعلى `conversation_id`/التاريخ للرسائل، وعلى إشعارات المستخدم؛ وهذه اختيارات مناسبة لأنماط القراءة الموجودة [8] [3] [7].

التغييرات القابلة للتطبيق، دون تحويل المشروع إلى React ودون تغيير الشعار أو الألوان:

1. **أبقِ نموذج الأمان في قاعدة البيانات:** لا تضع `service_role` أو كلمة مرور PostgreSQL في `config.js` أو أي ملف عام. استمر باستخدام المفتاح Publishable/Data API من المتصفح، واجعل RLS والصلاحيات المصدر الفعلي للحماية، لا شروط JavaScript أو إخفاء أزرار لوحة المطوّر [11] [12].
2. **أضف اختبارات RLS إلى مسار قاعدة البيانات:** لكل جدول مكشوف مثل `user_profiles` و`user_data` و`support_*` و`user_notifications`، اختبر القراءة والكتابة المسموحة والمرفوضة للمستخدم العادي والمطوّر و`anon`. يمكن وضع الاختبارات في `supabase/tests/` وتشغيلها بـ`supabase test db` كما توصي وثائق Supabase [11]. هذا لا يغيّر واجهة HTML/CSS.
3. **استمر في نمط الفهارس الحالي وراجعه بالقياس:** لا تضف فهارس جديدة لمجرد التوقع. افحص الاستعلامات الفعلية مثل تحميل بيانات المستخدم، قائمة المحادثات، الرسائل، والإشعارات بـ`EXPLAIN` في بيئة آمنة. إذا ظهرت قائمة مطوّرين كبيرة، ففكّر في pagination بالمؤشر بدل تحميل كل الصفوف دفعة واحدة؛ الدالة الحالية `admin_list_profiles()` ترتب كل الملفات ولا تستقبل حدًا أو cursor.
4. **حسّن مسارات JavaScript ذات الحفظ المتكرر:** الكود الحالي يضع عمليات `saveUserPayload` في طابور، وهذا يمنع تنازع طلبات الحفظ داخل المتصفح. حافظ على ذلك، وفضّل UPSERT ذريًا على صف `user_data` ذي المفتاح `user_id` بدل أي نمط SELECT ثم INSERT. عند تعديل عدة عناصر، اجمع التغيير في طلب واحد بدل استدعاء Supabase داخل حلقة، خصوصًا للبيانات المتراكمة في `payload` [9] [14].
5. **حدّد حجم البيانات عند القراءة:** لا تعرض `payload` الكامل في لوحة المطوّر؛ الدالة الحالية تعيد مؤشرات آمنة مثل `has_app_data` و`app_data_updated_at`، وهو تطبيق جيد لمبدأ أقل إفصاح. إذا احتاجت صفحات الدعم سجلًا طويلًا، استخدم `limit` وcursor على `(created_at, id)` مع الفهرس الموافق بدل `OFFSET` العميق [10].
6. **راجع سياسات RLS عند كل ترحيل:** السياسات الحالية تستخدم نمط `(select auth.uid())` وتفصل `using` و`with check` في مواضع مهمة، وهو نمط أداء وأمان موصى به. ينبغي فحص أي سياسة قديمة باقية لأن سياسات PostgreSQL permissive تتحد بمنطق OR؛ لا يكفي إنشاء سياسة أضيق إذا ظلت سياسة قديمة واسعة [11].
7. **طبّق قاعدة least privilege على RPC والدوال:** حافظ على `revoke` من `public` و`anon`، وامنح التنفيذ لـ`authenticated` فقط عند الحاجة. أي دالة `security definer` جديدة يجب أن تثبت هوية المستدعي، وتثبت `search_path`، ولا تعرض بيانات خاصة أو تسمح بمعاملات غير محققة [7] [11].
8. **راقب الإنتاج قبل ضبط الاتصالات:** لا يحتاج تطبيق المتصفح نفسه إلى PostgreSQL pooler؛ يستخدم Data API. إذا أُضيف backend أو Edge Function لاحقًا، استخدم transaction pooler للطلبات القصيرة، واضبط السائق وفق قيود prepared statements، ولا ترفع عدد الاتصالات الافتراضي بلا دليل على وجود طوابير [12].
9. **افصل تغييرات البيانات عن العرض:** يمكن تنفيذ هذه التوصيات داخل ملفات SQL/الترحيلات وطبقة `YSBackend` فقط. لا حاجة إلى React أو bundler أو تعديل `index.html` أو `style.css` أو الشعار أو ألوان الثيم.

## الحدود

- المهارة إرشاد عام؛ أرقام الأثر مثل `100–1000x` أو `5–10x` الواردة في بعض ملفات القواعد ليست ضمانًا لمشروع Yourself. يجب اعتماد القياس الفعلي وخطة التنفيذ وحجم البيانات.
- لم يُنفّذ SQL على قاعدة Supabase الحية ولم تُختبر جلسة مستخدم حقيقية في هذه المراجعة؛ التقرير يقيّم الملفات المحلية والمصادر الرسمية فقط.
- تخزين كل بيانات التطبيق في `user_data.payload` مريح للمشروع الحالي، لكنه قد يصبح عنق زجاجة مع نمو السجل أو الحاجة إلى تقارير واستعلامات جزئية. عندها ينبغي تطبيع الجداول أو إضافة أعمدة/فهارس مدروسة، لا تغيير الواجهة تلقائيًا.
- لا تستبدل فحوص العميل بالسياسات. تحقق JavaScript مفيد لتجربة الاستخدام، لكن الصلاحية والعزل يجب أن يظلا في Postgres/RLS.

## References

[1]: https://github.com/supabase/agent-skills "Supabase Agent Skills repository"
[2]: https://github.com/supabase/agent-skills/blob/main/skills/supabase-postgres-best-practices/SKILL.md "Supabase Postgres Best Practices skill"
[3]: https://github.com/supabase/agent-skills/blob/main/skills/supabase-postgres-best-practices/references/query-missing-indexes.md "Indexes on WHERE and JOIN columns"
[4]: https://github.com/supabase/agent-skills/blob/main/skills/supabase-postgres-best-practices/references/query-composite-indexes.md "Composite indexes"
[5]: https://github.com/supabase/agent-skills/blob/main/skills/supabase-postgres-best-practices/references/conn-pooling.md "Connection pooling"
[6]: https://github.com/supabase/agent-skills/blob/main/skills/supabase-postgres-best-practices/references/security-rls-basics.md "RLS basics"
[7]: https://github.com/supabase/agent-skills/blob/main/skills/supabase-postgres-best-practices/references/security-rls-performance.md "RLS performance"
[8]: https://github.com/supabase/agent-skills/blob/main/skills/supabase-postgres-best-practices/references/schema-data-types.md "Postgres data types"
[9]: https://github.com/supabase/agent-skills/blob/main/skills/supabase-postgres-best-practices/references/data-n-plus-one.md "Batch loading and N+1"
[10]: https://github.com/supabase/agent-skills/blob/main/skills/supabase-postgres-best-practices/references/data-pagination.md "Cursor-based pagination"
[11]: https://supabase.com/docs/guides/database/postgres/row-level-security "Supabase RLS guide and policy testing"
[12]: https://supabase.com/docs/guides/database/connecting-to-postgres "Supabase connection modes and Data API"
[13]: https://supabase.com/docs/guides/database/query-optimization "Supabase query optimization"
[14]: https://github.com/supabase/agent-skills/blob/main/skills/supabase-postgres-best-practices/references/data-upsert.md "Atomic UPSERT"
[15]: https://github.com/supabase/agent-skills/blob/main/skills/supabase-postgres-best-practices/references/monitor-explain-analyze.md "EXPLAIN ANALYZE diagnostics"
