# تصميم الـ Schema جدول بجدول – SARMS

وثيقة لبناء الـ schema من الصفر والعمل على كل جدول على حده: ماذا يحتوي، وما دوره، وكيف تنتقل البيانات بين الجداول.

---

## ترتيب البناء (حسب الاعتماديات)

يُبنى الترتيب من الجداول التي لا تعتمد على غيرها إلى التي تعتمد على أخرى:

| المرحلة | الجداول | السبب |
|--------|---------|--------|
| 1 | **ENUMs** | أنواع ثابتة تُستخدم في أعمدة الجداول |
| 2 | **zones**, **settings** | لا تعتمد على جداول أخرى (مفاتيح نصية) |
| 3 | **workers**, **equipment**, **inventory** | أساسية، يُشار إليها من جداول أخرى |
| 4 | **tasks** | يعتمد على zones فقط |
| 5 | **task_workers** | يربط tasks ↔ workers |
| 6 | **sessions** | يعتمد على workers و zones |
| 7 | **records**, **harvest_log** | سجلات عمليات/حصاد (لا FK لإبقاء المرونة) |
| 8 | **inventory_movements** | يعتمد على inventory |
| 9 | **faults**, **maintenance_plans** | يعتمدان على equipment |
| 10 | **resolved_tickets** | يعتمد على faults و maintenance_plans |

---

## 1) ENUMs (الأنواع الثابتة)

تُنشأ مرة واحدة وتُستخدم في أكثر من جدول.

| ENUM | القيم | الاستخدام |
|------|--------|-----------|
| task_status_enum | pending_approval, in_progress, completed, rejected | tasks.status |
| worker_role_enum | worker, engineer, admin | workers.role |
| worker_department_enum | farming, maintenance, inventory | workers.department, tasks.department_id, sessions.department_id |
| equipment_status_enum | active, under_maintenance, out_of_service | equipment.status |
| fault_severity_enum | low, medium, high, critical | faults.severity |
| inventory_category_enum | supplies, packaging, ppe, tools, other | inventory.category |
| record_type_enum | production, quality, inventory, fault_maintenance | records.record_type |
| maintenance_type_enum | preventive, corrective, inspection | maintenance_plans.type |
| quality_outcome_enum, record_severity_enum, priority_enum, task_type_enum, worker_status_enum | … | حسب الحاجة في الأعمدة |

---

## 2) zones

**الدور:** تعريف المناطق (Zone A, B, Inventory…) والدفعات. ثابتة نسبياً.

| العمود | النوع | الوصف |
|--------|-------|--------|
| id | TEXT PK | معرّف المنطقة (مثل a, b, inventory) |
| label_en, label_ar, label | TEXT | الاسم للعرض |
| icon | TEXT | أيقونة اختيارية |
| data | JSONB | حقول إضافية لاحقاً |

**من يربط بها:** tasks.zone_id, sessions.zone_id.

**انتقال البيانات:** التطبيق يقرأ zones عند التحميل ويستخدمها في قوائم الاختيار وعند إنشاء مهمة أو جلسة (يُخزّن zone_id في المهمة/الجلسة).

---

## 3) workers

**الدور:** العمال والمهندسين والأدمن – من يسجّل الدخول ويُنسب لهم المهام والسجلات.

| العمود | النوع | الوصف |
|--------|-------|--------|
| id | UUID PK | معرّف فريد |
| code | TEXT | عرض (W001, E001) |
| employee_id | TEXT | رقم الموظف / الدخول |
| full_name | TEXT | الاسم الكامل |
| role | worker_role_enum | worker | engineer | admin |
| department | worker_department_enum | farming | maintenance | inventory |
| status | worker_status_enum | active | inactive |
| temp_password, phone, email, … | TEXT / JSONB | بيانات إضافية |

**من يربط بها:** task_workers.worker_id, sessions.worker_id.

**انتقال البيانات:**  
- عند تعيين مهمة: يُضاف صف (أو أكثر) في **task_workers** (task_id, worker_id).  
- عند بدء تنفيذ: يُنشأ صف في **sessions** (worker_id, task من المهمة، zone، …).  
- عند إنهاء المهمة: يُنشأ صف في **records** أو **harvest_log** (worker كنص للعرض أو يمكن لاحقاً worker_id).

---

## 4) equipment

**الدور:** المعدات التي تُربط بها الأعطال وخطط الصيانة.

| العمود | النوع | الوصف |
|--------|-------|--------|
| id | UUID PK | معرّف فريد |
| code | TEXT | EQ001, EQ002 |
| name | TEXT | اسم المعدة |
| category, zone | TEXT | تصنيف ومنطقة (عرض) |
| status | equipment_status_enum | active | under_maintenance | out_of_service |
| last_inspection | DATE | آخر فحص |
| data | JSONB | إضافي |

**من يربط بها:** faults.equipment_id, maintenance_plans.equipment_id.

**انتقال البيانات:**  
- عند تسجيل عطل: يُنشأ صف في **faults** (equipment_id, وصف، severity، …).  
- عند جدولة صيانة: يُنشأ صف في **maintenance_plans** (equipment_id, planned_date, type، …).  
- عند حل تيكت: يُنشأ صف في **resolved_tickets** (fault_id أو maintenance_plan_id) ويُحدّث حالة المعدة إن لزم.

---

## 5) inventory

**الدور:** أصناف المخزون (مواد، تغليف، أدوات، …).

| العمود | النوع | الوصف |
|--------|-------|--------|
| id | UUID PK | معرّف فريد |
| code | TEXT | INV001 |
| name, category | TEXT / enum | الاسم والفئة |
| quantity, unit | NUMERIC, TEXT | الكمية والوحدة |
| min_qty, warning_qty | NUMERIC | تنبيه نقص |
| last_updated | TIMESTAMPTZ | آخر تحديث |
| data | JSONB | إضافي |

**من يربط بها:** inventory_movements.item_id.

**انتقال البيانات:**  
- عند إضافة صنف: صف جديد في **inventory** + صف في **inventory_movements** (نوع added).  
- عند تعديل الكمية: تحديث **inventory**.quantity + صف جديد في **inventory_movements** (قديم/جديد/السبب).

---

## 6) tasks

**الدور:** المهام المعرّفة من المهندس (أو العامل) – منطقة، دفعة، نوع المهمة، الحالة.

| العمود | النوع | الوصف |
|--------|-------|--------|
| id | UUID PK | معرّف فريد |
| code | TEXT | T001, T002 |
| zone_id | TEXT FK → zones | المنطقة |
| batch_id | TEXT | الدفعة |
| task_type, department_id, task_id | enum / TEXT | نوع المهمة والقسم ومعرّف النوع |
| status | task_status_enum | pending_approval | in_progress | completed | rejected |
| estimated_minutes, notes, grid_* | INTEGER, TEXT | تقدير الوقت وملاحظات وترتيب الشبكة |
| created_at, data | TIMESTAMPTZ, JSONB | وقت الإنشاء وإضافي |

**ملاحظة:** العمال المعيّنون للمهمة **ليسوا** داخل tasks؛ يُخزّنون في **task_workers**.

**انتقال البيانات:**  
- إنشاء مهمة: صف في **tasks** ثم صفوف في **task_workers** (واحد لكل عامل معيّن).  
- قبول المهمة (Set duration): تحديث tasks.status → in_progress + إنشاء **sessions** (جلسة لكل عامل معيّن، مع taskId في data).  
- إنهاء المهمة: تحديث tasks.status → completed من واجهة العامل أو Monitor؛ السجل يُضاف في **records** أو **harvest_log**.

---

## 7) task_workers

**الدور:** ربط many-to-many بين المهام والعمال (مهمة واحدة ← عدة عمال).

| العمود | النوع | الوصف |
|--------|-------|--------|
| task_id | UUID FK → tasks | المهمة |
| worker_id | UUID FK → workers | العامل |
| assigned_at | TIMESTAMPTZ | وقت التعيين |
| PRIMARY KEY (task_id, worker_id) | | |

**انتقال البيانات:**  
- عند التعيين من Assign Task: بعد إنشاء/تحديث المهمة، إدراج صفوف في task_workers من قائمة العمال المختارين.  
- عند القراءة: جلب task_workers ثم تجميع worker_ids لكل task_id وملء tasks.workerIds في التطبيق.

---

## 8) sessions

**الدور:** جلسات العمل النشطة (من يعمل على أي مهمة الآن – للمونيتور وإنهاء المهمة من واجهة العامل).

| العمود | النوع | الوصف |
|--------|-------|--------|
| id | UUID PK | معرّف الجلسة |
| code | TEXT | S001 |
| worker_id | UUID FK → workers | العامل |
| worker_name, department, task, zone, lines_area | TEXT | نسخ للعرض (denormalized) |
| zone_id | TEXT FK → zones | المنطقة |
| start_time | TIMESTAMPTZ | بداية الجلسة |
| expected_minutes | INTEGER | المدة المتوقعة (من المهندس) |
| assigned_by_engineer | BOOLEAN | هل الجلسة من تعيين المهندس |
| notes | JSONB | ملاحظات المهندس |
| data | JSONB | taskId, completedAt (مهم للعامل وإنهاء المهمة) |

**انتقال البيانات:**  
- عند "Accept + Set duration" في Assign Task: إنشاء جلسة (أو أكثر) لكل عامل معيّن، مع حفظ **taskId** في data.  
- عند إنهاء المهمة من العامل أو Monitor: تحديث المهمة (status completed) + إضافة **record** أو حصاد + تحديث session (completedAt في data) أو حذف الجلسة حسب التصميم الحالي.

---

## 9) records (سجل العمليات – Operations log)

**الدور:** سجلات الإنتاج/الجودة/المخزون/الأعطال (ما يُنشأ من إنهاء مهمة أو من Record Production) **ما عدا الحصاد**.

| العمود | النوع | الوصف |
|--------|-------|--------|
| id | UUID PK | معرّف السجل |
| code | TEXT | R001 |
| record_type | record_type_enum | production | quality | inventory | fault_maintenance |
| worker, department, task, zone, lines, lines_area | TEXT | للعرض |
| quantity, unit | NUMERIC, TEXT | الكمية والوحدة |
| date_time, created_at, duration, start_time | TIMESTAMPTZ, INTEGER | الوقت والمدة |
| notes, quality_outcome, severity | TEXT, enum | ملاحظات ونتيجة جودة وحدة |
| data | JSONB | source, engineerNotes, imageData (للفصل بين operations و harvest في العرض) |

**انتقال البيانات:**  
- من واجهة العامل أو Monitor عند "إنهاء المهمة": إذا **ليست** مهمة حصاد → إدراج صف في **records** (مع source غير harvest في data).  
- من صفحة Record Production: إدراج في **records**.

---

## 10) harvest_log (سجل الحصاد)

**الدور:** سجلات الحصاد فقط (من نموذج الحصاد أو إنهاء مهمة Harvest).

| العمود | النوع | الوصف |
|--------|-------|--------|
| مثل records | | نفس البنية؛ الفصل منطقياً في التطبيق (source = harvest) |

**انتقال البيانات:**  
- عند إنهاء مهمة "Harvest" من العامل أو Monitor: إدراج صف في **harvest_log** (وفي التطبيق نضع source = harvest_form عند الدمج مع state.records للعرض).

---

## 11) inventory_movements

**الدور:** حركات المخزون (إضافة صنف، زيادة/نقص كمية) لمعرفة من غيّر ماذا ومتى.

| العمود | النوع | الوصف |
|--------|-------|--------|
| id | UUID PK | معرّف الحركة |
| code | TEXT | IM001 |
| item_id | UUID FK → inventory | الصنف |
| old_quantity, new_quantity | NUMERIC | الكمية قبل وبعد |
| reason, movement_type | TEXT | السبب ونوع الحركة (added, updated, decreased) |
| changed_by | TEXT | من غيّر (اختياري) |
| created_at | TIMESTAMPTZ | وقت الحركة |
| data | JSONB | change_amount إلخ |

**انتقال البيانات:**  
- إضافة صنف جديد: تحديث **inventory** + إدراج حركة (نوع added).  
- تعديل كمية صنف: تحديث **inventory**.quantity + إدراج حركة (old_quantity, new_quantity, reason).

---

## 12) faults

**الدور:** أعطال المعدات (مفتوحة أو محلولة).

| العمود | النوع | الوصف |
|--------|-------|--------|
| id | UUID PK | معرّف العطل |
| code | TEXT | F001 |
| equipment_id | UUID FK → equipment | المعدة |
| equipment_name | TEXT | نسخ للعرض |
| category, severity | TEXT, enum | تصنيف العطل وحدة |
| stop_work | BOOLEAN | هل يوقف العمل |
| description | TEXT | وصف العطل |
| created_at | TIMESTAMPTZ | وقت التسجيل |
| data | JSONB | status, resolvedAt, resolutionNote, resolutionPhoto (أو في أعمدة لاحقاً) |

**انتقال البيانات:**  
- تسجيل عطل من صفحة الأعطال/الصيانة: إدراج في **faults**.  
- عند "Resolve": تحديث fault (status resolved، resolutionNote، …) + إدراج صف في **resolved_tickets** (ticket_type = fault, fault_id = id).

---

## 13) maintenance_plans

**الدور:** خطط الصيانة/الفحص (مجدولة أو منجزة).

| العمود | النوع | الوصف |
|--------|-------|--------|
| id | UUID PK | معرّف الخطة |
| code | TEXT | MP001 |
| equipment_id | UUID FK → equipment | المعدة |
| equipment_name | TEXT | نسخ للعرض |
| planned_date | DATE | تاريخ مخطط |
| type | maintenance_type_enum | preventive | corrective | inspection |
| notes | TEXT | ملاحظات |
| created_at | TIMESTAMPTZ | وقت الإنشاء |
| data | JSONB | status, resolvedAt, resolutionNote إلخ |

**انتقال البيانات:**  
- جدولة صيانة: إدراج في **maintenance_plans**.  
- عند "Resolve": تحديث الخطة (status completed، resolvedAt، …) + إدراج في **resolved_tickets** (ticket_type = maintenance, maintenance_plan_id = id).

---

## 14) resolved_tickets

**الدور:** سجل التيكتات المحلّة (فاولت أو صيانة) – من حلّ ماذا ومتى.

| العمود | النوع | الوصف |
|--------|-------|--------|
| id | UUID PK | معرّف السجل |
| code | TEXT | RT001 |
| ticket_type | TEXT | 'fault' | 'maintenance' |
| fault_id | UUID FK → faults (nullable) | إن كان التيكت عطل |
| maintenance_plan_id | UUID FK → maintenance_plans (nullable) | إن كان التيكت صيانة |
| resolved_at | TIMESTAMPTZ | وقت الحل |
| resolved_by | TEXT | من حل (user id أو اسم) |
| notes, summary | TEXT | ملاحظات الحل وملخص التيكت |
| created_at, data | TIMESTAMPTZ, JSONB | إضافي |

**انتقال البيانات:**  
- من واجهة "Resolve" في Log Fault/Maintenance: بعد تحديث الـ fault أو الـ maintenance_plan، استدعاء **addResolvedTicket** الذي يكتب صفاً في **resolved_tickets**.

---

## 15) settings

**الدور:** إعدادات عامة (key-value) مثل batches_by_zone، default_batch، وجلسة المستخدم النشطة.

| العمود | النوع | الوصف |
|--------|-------|--------|
| key | TEXT PK | المفتاح (مثل sarms_batches_by_zone) |
| value | JSONB | القيمة |

**انتقال البيانات:**  
- التطبيق يقرأ/يكتب عند الحاجة (مثلاً عند تسجيل الدخول يكتب sarms_active_session_&lt;userId&gt; للطرد من جهاز آخر).

---

## مخطط مبسط لانتقال البيانات

```
zones ──────────────────────────────────────────────────────────┐
workers ──────┬──────────────────────────────────────────────────┤
             │                                                   │
             ▼                                                   ▼
      task_workers ◄── tasks ──────────────────────────────► sessions
             │            │                                      │
             │            │ (عند الإنهاء)                        │
             │            ▼                                      ▼
             │     records (operations)    أو    harvest_log ◄──┘
             │
equipment ────┬────► faults ──────────────► resolved_tickets
              │            (resolve)              ▲
              └────► maintenance_plans ───────────┘
                        (resolve)

inventory ────────────► inventory_movements
   (تحديد كمية / إضافة صنف)
```

---

## خطوات مقترحة للعمل جدول بجدول

1. **تثبيت ENUMs** ثم **zones** و **settings** – تشغيل السكربت لهذه الأجزاء والتحقق من الإنشاء.
2. **workers, equipment, inventory** – إنشاؤها والتحقق من الـ adapter (قراءة/كتابة).
3. **tasks** ثم **task_workers** – إنشاؤهما وربط التعيين في التطبيق.
4. **sessions** – إنشاؤها وربط "Accept + duration" وإنهاء المهمة.
5. **records** و **harvest_log** – إنشاؤهما وربط إنهاء المهمة وسجل الحصاد.
6. **inventory_movements** – ربطه مع inventory في الواجهة.
7. **faults** و **maintenance_plans** ثم **resolved_tickets** – ربط صفحة الأعطال/الصيانة وحل التيكت.

يمكن تقسيم ملف **schema-proposed.sql** إلى ملفات صغيرة (مثلاً `01-enums.sql`, `02-zones.sql`, …) وتشغيلها بالترتيب إذا أردت التحكم بكل مرحلة على حده.
