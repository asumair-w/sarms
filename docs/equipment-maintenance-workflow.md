# ورك فلو موحد: Equipment & Maintenance

## الهدف
صفحة **واحدة** باسم **Equipment & Maintenance** تكون مدخل واحد لكل ما يخص:
- إدارة المعدات
- تسجيل الأعطال
- تسجيل خطط الصيانة
- عرض سجل الأعطال والخطط

بدون تكرار قوائم أو أزرار، وبدون صفحة "Log Fault" منفصلة.

---

## هيكل الصفحة (من الأعلى للأسفل)

### 1) رأس الصفحة
- **عنوان:** Equipment & Maintenance (أو المعدات والصيانة)
- **سطر توضيحي قصير:** "إدارة المعدات، تسجيل الأعطال وخطط الصيانة، ومتابعة السجل من مكان واحد."

---

### 2) ملخص سريع (Summary)
- **كروت KPI** (كما هي حالياً أو معدّلة قليلاً):
  - **Equipment:** Due soon، High activity (90d)
  - **High Failure Equipment:** X Devices، عتبة ≥2 في الشهر
  - (اختياري) **Open faults:** عدد الأعطال المفتوحة
  - (اختياري) **Upcoming maintenance:** عدد الخطط القادمة أو المتأخرة
- **السلوك:** الضغط على كارت يفتح بوب أب أو يفلتر الجدول/القسم المناسب (مثل ما هو الآن مع Equipment و High Failure).

---

### 3) إدارة المعدات (Manage Equipment)
- **قسم قابل للطي/توسيع** (مثل الحالي): "Manage Equipment" مع زر Expand/Collapse.
- **فلاتر:** Zone، Status، Next Inspection، Search، و(إن وُجد) فلتر High Failure.
- **جدول المعدات:**
  - أعمدة: Equipment name (مع أيقونة ⚠ إن كانت High Failure)، Assigned zone، Operational status، Last inspection، Service Cycle، **Actions**.
  - **Actions** لكل صف (قائمة منسدلة):
    - View History
    - Schedule Inspection / Mark Inspection Done
    - **Log fault** ← يفتح مودال تسجيل عطل لهذه المعدة مباشرة
    - **Plan maintenance** ← يفتح مودال خطة صيانة لهذه المعدة مباشرة
    - Edit
    - Delete
- **أزرار أعلى الجدول:** Export CSV، Add Equipment.
- **النتيجة:** المهندس يشوف كل المعدات ويسجل عطل أو خطة من نفس الصف بدون الخروج للصفحة الثانية.

---

### 4) تسجيل عطل / خطة صيانة (بدون قائمة معدات مكررة)
- **خيار أ – من الجدول فقط:**  
  تسجيل العطل وخطط الصيانة يتم **فقط** من أزرار "Log fault" و "Plan maintenance" في عمود Actions. لا يوجد قسم منفصل "قائمة معدات" لتسجيل العطل.
- **خيار ب – مع أزرار إضافية:**  
  فوق أو تحت جدول المعدات:
  - زر **"Log new fault"**: يفتح مودال؛ أول حقل فيه **اختيار المعدة من قائمة منسدلة** (نفس قائمة المعدات)، ثم Category، Severity، Stop work، Description.
  - زر **"Plan maintenance"**: مودال مع اختيار المعدة من قائمة منسدلة + Planned date، Type (preventive/corrective)، Notes.
- **النتيجة:** إما كل التسجيل من الجدول (خيار أ)، أو جدول + إمكانية التسجيل السريع من أي معدة عبر القائمة المنسدلة (خيار ب). في الحالتين لا توجد صفحة ثانية ولا قائمة معدات مكررة.

---

### 5) عرض سجل الأعطال والخطط (Faults & maintenance)
- **قسم ثابت تحت "Manage Equipment"** (أو تاب ثانٍ "Faults & plans" في نفس الصفحة).
- **عنوان:** "Faults & maintenance" أو "سجل الأعطال وخطط الصيانة".
- **سطر ملخص:**  
  "Open faults: X  |  Resolved (e.g. this month): Y  |  Upcoming / Overdue maintenance: Z"  
  (الأرقام تُحسب من نفس البيانات: faults، maintenancePlans).

#### 5.1 جدول الأعطال (Faults)
- أعمدة: Equipment، Type (Fault / Preventive alert)، Category، Severity، Status (Open / Resolved)، Stop work، Description، Created، **Actions**.
- **Actions لكل صف:**
  - **View:** فتح مودال يعرض تفاصيل العطل (وكذلك روابط سريعة للمعدة إن أردت).
  - **Resolve:** للعطل المفتوح فقط؛ يفتح مودال صغير (Resolution note + تاريخ) ثم تحديث الحالة إلى Resolved.
  - **Go to equipment:** انتقال لصف المعدة في جدول "Manage Equipment" (أو فتح View History لهذه المعدة) دون مغادرة الصفحة.
- **فلتر اختياري:** حسب المعدة، الحالة (Open/Resolved)، أو الفترة.

#### 5.2 جدول خطط الصيانة (Maintenance plans)
- أعمدة: Equipment، Planned date، Type (Preventive/Corrective)، Notes، **Actions**.
- **Actions:**  
  - **View:** تفاصيل الخطة.  
  - **Go to equipment:** نفس الفكرة أعلاه.
  - (مستقبلاً) **Mark done** أو **Reschedule** إذا أضيفت في النظام.
- **فلتر اختياري:** معدة، نوع، أو فترة (قادمة / متأخرة).

**النتيجة:** كل متابعة الأعطال والخطط من نفس الصفحة؛ لا حاجة لصفحة "Log Fault" منفصلة.

---

### 6) مودالات (نفس السلوك الحالي مع دمج المنطق)
- **View History (معدة):** كما هو الآن؛ يفتح من Actions في جدول المعدات.
- **Schedule Inspection / Mark Inspection Done:** من جدول المعدات.
- **Log fault:** يفتح من "Log fault" في Actions أو من زر "Log new fault"؛ المعدة إما محددة مسبقاً (من الصف) أو تُختار من القائمة المنسدلة.
- **Plan maintenance:** نفس الفكرة.
- **Resolve fault:** مودال صغير من جدول الأعطال.
- **Edit equipment / Add equipment:** كما هو الآن.

كل المودالات تبقى داخل نفس الصفحة؛ لا انتقال ل route آخر.

---

## ما الذي "يصير" في هذه الصفحة (سير العمل)

1. **الدخول:** المهندس يفتح **Equipment & Maintenance** من القائمة الجانبية (عنصر واحد بدل Inventory + Log Fault).
2. **نظرة سريعة:** يرى الملخص (Due soon، High Failure، Open faults، Upcoming maintenance).
3. **إدارة المعدات:** يوسّع "Manage Equipment"، يفلتر إن احتاج، يشوف الجدول. من أي صف يقدر:
   - عرض التاريخ (View History)
   - جدولة فحص أو تسجيل إنجاز الفحص
   - **تسجيل عطل** أو **خطة صيانة** للمعدة نفسها مباشرة
   - تعديل أو حذف المعدة
4. **تسجيل بدون اختيار من الجدول:** إن وُجد زر "Log new fault" أو "Plan maintenance"، يفتح المودال ويختار المعدة من القائمة المنسدلة ثم يكمّل الحقول.
5. **متابعة الأعطال والخطط:** ينزل لقسم "Faults & maintenance"، يشوف الجدولين، يفلتر إن احتاج، ويفعل:
   - View تفاصيل عطل أو خطة
   - Resolve للعطل المفتوح
   - Go to equipment للانتقال السريع لصف المعدة أو View History.
6. **لا مغادرة الصفحة:** كل العمليات أعلاه تحدث في نفس الـ route؛ لا انتقال لـ "Log Fault" ولا تكرار لقائمة المعدات في صفحة ثانية.

---

## التكامل مع بقية النظام

- **الرابط في القائمة (Nav):**
  - نستبدل عنصرين (مثلاً "Inventory" و "Log Fault") بعنصر واحد: **"Equipment & Maintenance"** (أو نبقى على "Inventory" ونوسع محتواها ليشمل كل ما سبق، حسب تسمية المنتج).
- **صفحة Inventory الحالية:**  
  إن أردنا الاحتفاظ بـ Stock و Harvest في مكان آخر، يمكن:
  - إما فصلهم في صفحة "Inventory" (Stock + Harvest فقط) وصفحة "Equipment & Maintenance" (كل ما وُصف أعلاه)،
  - أو الإبقاء على صفحة واحدة "Inventory" تحتوي: Summary (Stock، Harvest، Equipment، High Failure) ثم أقسام Manage Stock، Harvest، **Manage Equipment**، ثم **Faults & maintenance**.
- **صفحة Log Fault القديمة:** إما **حذفها** أو جعلها **إعادة توجيه (redirect)** إلى Equipment & Maintenance مع فتح أو تمييز قسم "Faults & maintenance".

---

## ملخص الفوائد

| قبل | بعد |
|-----|-----|
| مدخلان: Inventory (معدات) + Log Fault (أعطال/خطط) | مدخل واحد: Equipment & Maintenance |
| قائمة معدات في صفحتين | قائمة معدات مرة واحدة + أزرار التسجيل من الجدول أو من قائمة منسدلة |
| متابعة الأعطال في صفحة منفصلة | متابعة الأعطال والخطط في نفس الصفحة تحت جدول المعدات |
| ربط غير واضح بين المعدة والعطل | تسجيل عطل/خطة من صف المعدة مباشرة + روابط "Go to equipment" من جدول الأعطال |

بهذا يصير ورك فلو **Equipment & Maintenance** واضحاً: إدارة معدات، تسجيل أعطال وخطط، وعرض السجل من مكان واحد فقط، مع إمكانية تفصيل كل قسم (ملخص، جدول معدات، جداول أعطال/خطط، مودالات) حسب تنفيذ الواجهة لاحقاً.
