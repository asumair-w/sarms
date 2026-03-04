# برومبت: توحيد كروت General Reports مع مواصفات كروت Equipment / Monitor

## الهدف
تطبيق نفس مواصفات كروت صفحة Log Fault & Maintenance (Equipment) و Monitor على كروت المؤشرات الستة في صفحة **General Reports** (Reports & Analytics)، بحيث تكون الأبعاد والشكل مطابقة.

---

## المواصفات المرجعية (من InventoryEquipment.module.css / Monitor)

### 1. الكارد ككل (Card container)
- **min-height:** `72px`
- **padding:** `0` (المحتوى الداخلي له الـ padding وليس الكارد نفسه)
- **border:** `2px solid #e2e8f0` (أو لون الحد حسب الثيم؛ في Equipment يُستخدم ألوان مختلفة لكل نوع)
- **border-radius:** `12px`
- **background:** `#fff`
- **display:** `flex`, **flex-direction:** `column`, **overflow:** `hidden` (اختياري)

### 2. شريط العنوان (Title strip / Label)
- **padding:** `0.5rem 0.75rem 0.35rem`
- **font-size:** `0.85rem`
- **font-weight:** `700`
- **border-radius:** `10px 10px 0 0` (تقويس الزوايا العليا فقط لأن الكارد له radius 12px)
- **border-bottom:** `1px solid rgba(0, 0, 0, 0.06)` (أو لون فاتح مثل #e2e8f0)
- لون النص للعنوان: مثلاً `#64748b` أو حسب الثيم

### 3. جسم الكارد (Card body)
- **padding:** `0.75rem`
- **flex:** `1` و **display:** `flex`, **flex-direction:** `column`, **justify-content:** `center` (اختياري لمحاذاة المحتوى)

### 4. شبكة الكاردات (Grid)
- **شبكة أساسية:** عمودان (2 columns) مع **gap:** `0.75rem` أو `1rem`
- **من 768px:** يمكن 3 أعمدة مع **gap:** `1rem`
- **من 1024px:** 6 أعمدة (لأن الصفحة فيها 6 كروت) مع **gap:** `1rem`

---

## ما يُطبَّق على صفحة General Reports

الملفات المعنية:
- **JSX:** `src/pages/engineer/ReportsAnalytics.jsx` — كروت المؤشرات الستة داخل `.summaryCardsWrap` وكل كارد له class `summaryKpiCard` ويحتوي: `metricLabel`, `metricValue`, `metricUnit`, وربما `trendIndicator`.
- **CSS:** `src/pages/engineer/ReportsAnalytics.module.css` — تحديث `.summaryCardsWrap` و `.summaryKpiCard` والأنماط الداخلية.

### خطوات التطبيق

1. **هيكل الكارد (إن لزم):**  
   إذا كان المحتوى حالياً كلّه داخل نفس الـ div بدون فصل "عنوان" و "جسم"، يُفضّل إضافة غلاف (wrapper) للقيم والاتجاه مثل:
   - العنصر الأول: شريط العنوان (مثل `metricLabel`).
   - العناصر التالية أو غلاف واحد: **جسم الكارد** (القيمة + الوحدة + مؤشر الاتجاه) داخل عنصر واحد بـ class مثل `summaryKpiCardBody` حتى يُطبَّق عليه **padding: 0.75rem**.

2. **تحديث CSS للكارد:**
   - `.summaryKpiCard`: تطبيق `min-height: 72px`, `padding: 0`, `border: 2px solid #e2e8f0`, `border-radius: 12px`, `background: #fff`, وخصائص الـ flex المذكورة أعلاه. إزالة أي padding من الكارد نفسه.
   - العنصر الذي يعمل كـ "شريط عنوان" (مثلاً `.summaryKpiCard .metricLabel` أو أول ابن): تطبيق مواصفات شريط العنوان (padding, font-size, font-weight, border-radius, border-bottom).
   - منطقة الجسم (القيمة + الوحدة + الاتجاه): إما عبر class جديد مثل `.summaryKpiCardBody` مع `padding: 0.75rem` أو بتحديد العناصر الداخلية المتبقية وإعطائها padding جماعي (مثلاً من خلال wrapper مضاف في JSX).

3. **تحديث شبكة الكاردات:**
   - `.summaryCardsWrap`: توحيد الـ gap مع المرجع (مثلاً `0.75rem` للشاشات الصغيرة و `1rem` من 768px أو 1024px)، وعدد الأعمدة: 2 ثم 3 ثم 6 عند 1024px مع **gap: 1rem** في الشاشات الكبيرة.

4. **التحقق:**  
   بعد التعديل، مقارنة شكل وأبعاد كروت General Reports مع كروت صفحة Log Fault & Maintenance (Equipment) أو Monitor؛ يجب أن تكون متطابقة من ناحية الارتفاع الأدنى، السمك، التقويس، وحشو شريط العنوان وجسم الكارد.

---

## ملخص سريع للمواصفات

| العنصر           | المواصفة |
|------------------|----------|
| الكارد           | min-height: 72px, padding: 0, border: 2px solid, border-radius: 12px, background: #fff |
| شريط العنوان     | padding: 0.5rem 0.75rem 0.35rem, font-size: 0.85rem, font-weight: 700, border-radius: 10px 10px 0 0 |
| جسم الكارد       | padding: 0.75rem |
| شبكة الكاردات    | 2 cols → 3 → 6 مع gap 0.75rem / 1rem |

بعد تطبيق هذا البرومبت على كروت General Reports، تصبح الكروت مستوفية لمواصفات كروت الإيكوبمينت ومونيتور.
