# vercel-react-best-practices ومشروع Yourself

## ما الذي تفعله المهارة عمليًا؟

`vercel-react-best-practices` حزمة إرشادات لوكلاء البرمجة لمراجعة أو كتابة أو إعادة هيكلة تطبيقات **React وNext.js** بهدف تحسين الأداء. ملف المهارة يعرّف 70 قاعدة موزعة على ثمانية أقسام، مرتبة حسب الأثر: إزالة سلاسل الانتظار، تقليل حجم الحزمة، أداء الخادم، جلب البيانات في العميل، تقليل إعادة التصيير، أداء التصيير، أداء JavaScript، ثم الأنماط المتقدمة [1]. أما README العام للمستودع فيشرح أن المهارات تعليمات قابلة للتثبيت والاستخدام تلقائيًا، وأن مهارة React تُستخدم عند كتابة مكوّنات React أو صفحات Next.js أو تحسين جلب البيانات والحزمة [2].

عمليًا، ليست المهارة مكتبة تشغيلية ولا تتطلب تحويل المشروع إلى React. هي قائمة فحص للمراجعة، وتضم ملفات قواعد منفصلة تشرح المشكلة، المثال غير الجيد، والمثال المصحح. لذلك يمكن استعارة مبادئ المتصفح وطلبات الشبكة منها، مع تجاهل الأجزاء المرتبطة بدورة حياة React أو SSR/RSC.

## ما ينطبق على Yourself دون تغيير التقنية أو الهوية

المشروع الحالي هو HTML/CSS/JS مع طبقة Supabase في `config.js`، ويحمّل `config.js` ثم `script.js` في نهاية `index.html`. الشعار والألوان موجودة في HTML/CSS ولا تحتاج إلى تغيير كي تُطبّق التوصيات التالية.

1. **تجنب تسلسل طلبات Supabase المستقلة.** قاعدة `async-parallel` تصف `Promise.all()` كحل للعمليات التي لا تعتمد على بعضها، بدل انتظار كل طلب قبل بدء التالي [3]. عند فتح لوحة المستخدم، يمكن جمع استدعاءات مستقلة مثل الملف الشخصي وبيانات المستخدم وحالة المطوّر في `Promise.all()`، لكن لا يجوز توازي عمليات تعتمد على نتيجة سابقة أو عمليات كتابة قد تتعارض. يجب الحفاظ على معالجة الأخطاء ورسائل الواجهة الحالية.

2. **ابدأ الطلبات مبكرًا وانتظر متأخرًا عند الحاجة فقط.** هذا يترجم في `openUserSession` إلى عدم تأخير كل طلب بسبب طلب مستقل قبله. أولًا احصل على ما يلزم للتحقق من الحساب، ثم شغّل جلب payload وفحص الدور بالتوازي إذا لم تكن بينهما علاقة اعتماد. لا تغيّر سياسة الصلاحيات أو RLS؛ التوازي تحسين زمني وليس بديلًا عن التحقق على الخادم.

3. **أجّل الوظائف غير الحرجة.** قاعدة `bundle-defer-third-party` توصي بتأجيل التحليلات والتسجيل وتتبع الأخطاء لأنها لا ينبغي أن تمنع التفاعل الأولي [4]. في صفحة Yourself يمكن تحميل أداة تحليل أو تسجيل اختيارية بعد `DOMContentLoaded` أو `requestIdleCallback`، وعدم إدخالها في المسار الأولي. ينطبق ذلك على أدوات الطرف الثالث فقط، وليس على `config.js` أو `script.js` ما دامت الواجهة والمصادقة تحتاجهما.

4. **استخدم التحميل الشرطي للميزات الثقيلة.** قاعدة `bundle-conditional` تقترح تحميل الوحدة الكبيرة عند تفعيل الميزة فقط [5]. في Vanilla JS يمكن استخدام `import('./feature-module.js')` عند فتح صفحات مثل الحاسبة أو أدوات المطوّر أو محرر الصور، بدل تحميل كود ثقيل لكل زائر. لا تُطبّق ذلك على أجزاء يعتمد عليها تسجيل الدخول منذ البداية، ولا تغيّر ألوان أو شعار الواجهة.

5. **اجعل السكربتات غير حاجبة للتحليل.** قاعدة `rendering-script-defer-async` تفرق بين `defer` للسكريبتات التي تعتمد على DOM أو ترتيب تحميل، و`async` للسكريبتات المستقلة [6]. ملفات Yourself حاليًا في نهاية `body`، ولذلك لا تُضاف السمات آليًا بلا اختبار: `defer` مناسب غالبًا إن نُقلت السكربتات إلى `head` مع بقاء `config.js` قبل `script.js`، بينما `async` غير مناسب لهما بسبب الاعتماد والترتيب. أما سكربت تحليلات مستقل فيمكن تحميله `async`.

6. **استخدم مستمعات تمرير passive عندما لا يوجد `preventDefault()`.** القاعدة الرسمية توصي بـ`{ passive: true }` لمستمعي `touchstart` و`wheel` اللذين يراقبان أو يسجلان فقط، وتحذر من استخدامه للإيماءات التي تحتاج منع السلوك الافتراضي [7]. هذا تحسين اختياري إذا أضيف تمرير أو تتبع في Yourself، ولا ينبغي تطبيقه على مستمع يحتاج فعلًا إلى `preventDefault()`.

7. **وحّد المستمعات العامة بدل تكرارها.** قاعدة `client-event-listeners` تعرض مبدأ مستمع عام واحد مع سجل callbacks بدل إنشاء مستمع لكل مكوّن [8]. في JavaScript الحالي يمكن تطبيق الفكرة على مستمعات `resize` أو `keydown` أو `visibilitychange` المشتركة، مع إزالة التسجيل عند الحاجة. لا حاجة لإدخال SWR؛ المثال يستخدمه لأنه React، والمطلوب هنا هو مبدأ الاشتراك المركزي فقط.

8. **احفظ الحالة المحلية بحجم وإصدار واضحين.** فهرس المهارة يضم قاعدة `client-localstorage-schema` [1]. لدى المشروع مفاتيح `localStorage` و`sessionStorage` مثل `yfs_v17_pref` و`yourself_auth_v1`. الأفضل إبقاء البيانات الضرورية فقط، وإضافة ترحيل/إصدار عند تغيير شكلها، وعدم تخزين أسرار Supabase أو بيانات حساسة غير لازمة في التخزين المحلي. لا تُنقل جلسة المصادقة أو بنية البيانات الحالية بلا اختبار أمني.

9. **حسّن المسارات الساخنة في JavaScript بعد القياس.** قسم JavaScript يقترح `Map`/`Set` للبحث المتكرر، تجميع تغييرات DOM، الخروج المبكر، وتخزين قراءات التخزين المؤقتة [1]. يمكن تطبيق ذلك على قوائم الإشعارات أو الحسابات في لوحة المطوّر وعلى عمليات إعادة الرسم الكبيرة. هذه تحسينات منخفضة الأولوية؛ لا تستبدل بها وضوح الكود أو تغيّر الحسابات المالية قبل اختبار التكافؤ.

## ما لا ينطبق مباشرة والقيود

- قواعد `useState` و`useEffect` و`useMemo` و`Suspense` و`startTransition` و`React.cache()` و`next/dynamic` تخص React/Next.js، ولا ينبغي محاكاتها حرفيًا في HTML/JS.
- قواعد Server Components وSSR وRSC و`next/script` لا تنطبق على صفحة Yourself الحالية التي تعمل كواجهة HTML/JS مباشرة. استخدم المقابل الأصلي للمنصة: سمات HTML، `import()`، وجدولة المتصفح.
- لا تعالج المهارة أمن Supabase أو سياسات RLS أو تصميم قاعدة البيانات. أي توازي أو تأخير يجب ألا يكشف بيانات أو يتجاوز التحقق، ويجب إبقاء المفاتيح العامة فقط في الواجهة وعدم وضع أسرار في `config.js`.
- لا توصي المهارة بتغيير العلامة التجارية. لذلك تبقى الشعار والألوان والنصوص الحالية خارج نطاق التحسين، وتُقاس النتائج بأداء التحميل والاستجابة وصحة المصادقة.
- README يذكر وصفًا مختصرًا «40+ قاعدة»، بينما ملف `SKILL.md` وفهرس الأقسام الحاليان يصفان 70 قاعدة؛ اعتمد هذا التقرير على ملف المهارة والقواعد الرسمية الحالية في `main` عند التحقق التفصيلي [1] [2].

## خلاصة تنفيذية

الأولوية الآمنة لمشروع Yourself هي: قياس طلبات فتح الجلسة ثم توازي المستقلة منها، تأجيل أي تحليلات اختيارية، تحميل الميزات الثقيلة عند فتحها، ومراجعة مستمعات التمرير والمستمعات العامة. هذه تغييرات في توقيت التنفيذ وتنظيم JavaScript، وليست سببًا لتحويل HTML/CSS/JS إلى React أو لتعديل الشعار والألوان. ابدأ باختبارات المصادقة وحفظ البيانات بعد كل تغيير.

## References

[1]: https://github.com/vercel-labs/agent-skills/blob/main/skills/react-best-practices/SKILL.md "Vercel React Best Practices skill"
[2]: https://github.com/vercel-labs/agent-skills/blob/main/README.md "Vercel Agent Skills README"
[3]: https://github.com/vercel-labs/agent-skills/blob/main/skills/react-best-practices/rules/async-parallel.md "Promise.all for Independent Operations"
[4]: https://github.com/vercel-labs/agent-skills/blob/main/skills/react-best-practices/rules/bundle-defer-third-party.md "Defer Non-Critical Third-Party Libraries"
[5]: https://github.com/vercel-labs/agent-skills/blob/main/skills/react-best-practices/rules/bundle-conditional.md "Conditional Module Loading"
[6]: https://github.com/vercel-labs/agent-skills/blob/main/skills/react-best-practices/rules/rendering-script-defer-async.md "Use defer or async on Script Tags"
[7]: https://github.com/vercel-labs/agent-skills/blob/main/skills/react-best-practices/rules/client-passive-event-listeners.md "Use Passive Event Listeners for Scrolling Performance"
[8]: https://github.com/vercel-labs/agent-skills/blob/main/skills/react-best-practices/rules/client-event-listeners.md "Deduplicate Global Event Listeners"
