# مقترح إعادة هيكلة قاعدة البيانات — كل حقل له عمود، الإضافيات في JSON فقط

## القاعدة
- **كل حقل مستخدم في التطبيق** → عمود مستقل في الجدول.
- **عمود `data` (JSONB)** → للإضافات المستقبلية أو حقول نادرة/مرنة فقط.

## Production-ready improvements (في schema-proposed.sql)

- **ENUM types**: `task_status_enum`, `priority_enum`, `worker_role_enum`, `worker_department_enum`, `equipment_status_enum`, `fault_severity_enum`, `inventory_category_enum`.
- **UUID primary keys**: workers, tasks, records, sessions, inventory, inventory_movements, equipment, faults, maintenance_plans. `zones` and `settings` keep TEXT/key.
- **Foreign keys**: tasks.zone_id → zones; sessions.worker_id → workers, sessions.zone_id → zones; inventory_movements.item_id → inventory; faults.equipment_id → equipment (ON DELETE SET NULL); maintenance_plans.equipment_id → equipment (ON DELETE CASCADE).
- **task_workers**: جدول ربط many-to-many (task_id, worker_id, assigned_at); تم إزالة `worker_ids` من `tasks`.
- **Indexes**: على الحقول المستخدمة في الفلترة والربط (status, zone_id, created_at, worker_id, item_id, …).
- **RLS**: مفعّل على كل الجداول مع سياسات تطوير بسيطة (read/write للـ anon).

---

## 1) جدول `workers` (العمال / المهندسون / المديرون)

| العمود | النوع | الوصف |
|--------|--------|--------|
| `id` | UUID PK | المعرّف (gen_random_uuid) |
| `employee_id` | TEXT | رقم الموظف (مثل w1, e1) |
| `full_name` | TEXT NOT NULL | الاسم الكامل |
| `phone` | TEXT | الجوال |
| `email` | TEXT | البريد |
| `nationality` | TEXT | الجنسية |
| `role` | worker_role_enum | worker \| engineer \| admin |
| `department` | worker_department_enum | farming \| maintenance \| inventory |
| `status` | TEXT NOT NULL | active \| inactive |
| `temp_password` | TEXT | كلمة مؤقتة (إن وُجدت) |
| `created_at` | TIMESTAMPTZ | تاريخ الإنشاء |
| `skills` | JSONB | مصفوفة المهارات (لأنها قائمة متغيرة) |
| `data` | JSONB | إضافات فقط — أي حقل جديد لاحقاً |

---

## 2) جدول `zones` (المناطق)

| العمود | النوع | الوصف |
|--------|--------|--------|
| `id` | TEXT PK | المعرّف (a, b, c, d, inventory) |
| `label_en` | TEXT | التسمية إنجليزي |
| `label_ar` | TEXT | التسمية عربي |
| `label` | TEXT | التسمية للعرض (مثل Zone A) |
| `icon` | TEXT | أيقونة (مثل squares-2x2, cube) |
| `data` | JSONB | إضافات فقط |

---

## 3) جدول `tasks` (المهام المعينة)

| العمود | النوع | الوصف |
|--------|--------|--------|
| `id` | UUID PK | المعرّف |
| `zone_id` | TEXT NOT NULL FK → zones.id | المنطقة |
| `batch_id` | TEXT NOT NULL | الدفعة |
| `task_type` | TEXT NOT NULL | farming \| maintenance |
| `department_id` | worker_department_enum | farming \| maintenance \| inventory |
| `task_id` | TEXT NOT NULL | نوع المهمة (harvesting, irrigation, …) |
| *(لا worker_ids — استخدم جدول task_workers)* | | |
| `priority` | priority_enum | low \| medium \| high |
| `estimated_minutes` | INTEGER | الدقائق المتوقعة |
| `notes` | TEXT | ملاحظات |
| `status` | task_status_enum | pending_approval \| in_progress \| completed \| rejected |
| `grid_row` | INTEGER | صف في شبكة الدفيئة |
| `grid_col` | INTEGER | عمود |
| `grid_side` | TEXT | left \| right |
| `flagged` | BOOLEAN DEFAULT false | معلم أم لا |
| `created_at` | TIMESTAMPTZ | تاريخ الإنشاء |
| `data` | JSONB | إضافات فقط |

### جدول `task_workers` (ربط المهام بالعمال)

| العمود | النوع | الوصف |
|--------|--------|--------|
| `task_id` | UUID FK → tasks.id | المهمة (ON DELETE CASCADE) |
| `worker_id` | UUID FK → workers.id | العامل (ON DELETE CASCADE) |
| `assigned_at` | TIMESTAMPTZ | وقت التعيين |
| **PK** | (task_id, worker_id) | مفتاح مركب |

---

## 4) جدول `records` (سجلات الإنتاج / الجودة / المخزون / الأعطال)

| العمود | النوع | الوصف |
|--------|--------|--------|
| `id` | UUID PK | المعرّف |
| `record_type` | TEXT NOT NULL | production \| quality \| inventory \| fault_maintenance |
| `worker` | TEXT | اسم العامل (أو المعرّف) |
| `department` | TEXT | القسم |
| `task` | TEXT | المهمة |
| `zone` | TEXT | المنطقة |
| `lines` | TEXT | الأسطر (مثل 1 – 20) |
| `lines_area` | TEXT | نطاق الأسطر (مثل 1–20) |
| `quantity` | NUMERIC(12,2) | الكمية |
| `unit` | TEXT | الوحدة (kg, boxes, …) |
| `date_time` | TIMESTAMPTZ | وقت الحدث |
| `created_at` | TIMESTAMPTZ | وقت إنشاء السجل |
| `duration` | INTEGER | المدة (دقيقة) |
| `start_time` | TIMESTAMPTZ | وقت البداية |
| `notes` | TEXT | ملاحظات |
| `quality_outcome` | TEXT | للجودة: pass \| conditional \| fail |
| `severity` | TEXT | للأعطال: low \| medium \| high |
| `data` | JSONB | إضافات فقط |

---

## 5) جدول `sessions` (جلسات العمل النشطة)

| العمود | النوع | الوصف |
|--------|--------|--------|
| `id` | UUID PK | المعرّف |
| `worker_id` | UUID NOT NULL FK → workers.id | معرّف العامل |
| `worker_name` | TEXT | اسم العامل (عرض) |
| `department` | TEXT | القسم (عرض) |
| `department_id` | TEXT NOT NULL | farming \| maintenance \| inventory |
| `task_type_id` | TEXT NOT NULL | farming \| maintenance \| inventory |
| `task` | TEXT | اسم المهمة (عرض) |
| `zone` | TEXT | اسم المنطقة (عرض) |
| `zone_id` | TEXT NOT NULL FK → zones.id | معرّف المنطقة |
| `lines_area` | TEXT | نطاق الأسطر |
| `start_time` | TIMESTAMPTZ NOT NULL | وقت البدء |
| `expected_minutes` | INTEGER NOT NULL | الدقائق المتوقعة |
| `flagged` | BOOLEAN DEFAULT false | معلم |
| `assigned_by_engineer` | BOOLEAN DEFAULT true | من المهندس أم لا |
| `notes` | JSONB | مصفوفة ملاحظات [{ at, text }] |
| `data` | JSONB | إضافات فقط |

---

## 6) جدول `inventory` (عناصر المخزون)

| العمود | النوع | الوصف |
|--------|--------|--------|
| `id` | UUID PK | المعرّف |
| `name` | TEXT NOT NULL | الاسم |
| `category` | inventory_category_enum | supplies \| packaging \| ppe \| tools \| other |
| `quantity` | NUMERIC(12,2) NOT NULL | الكمية الحالية |
| `unit` | TEXT NOT NULL | الوحدة |
| `min_qty` | NUMERIC(12,2) | الحد الأدنى |
| `warning_qty` | NUMERIC(12,2) | حد التحذير |
| `last_updated` | TIMESTAMPTZ | آخر تحديث |
| `data` | JSONB | إضافات فقط |

---

## 7) جدول `inventory_movements` (سجل حركة المخزون)

| العمود | النوع | الوصف |
|--------|--------|--------|
| `id` | UUID PK | المعرّف |
| `item_id` | UUID NOT NULL FK → inventory.id | معرّف الصنف (ON DELETE RESTRICT) |
| `old_quantity` | NUMERIC(12,2) NOT NULL | الكمية قبل |
| `new_quantity` | NUMERIC(12,2) NOT NULL | الكمية بعد |
| `reason` | TEXT | السبب (Item Added, Manual Update, …) |
| `movement_type` | TEXT | added \| updated \| decreased |
| `changed_by` | TEXT | من قام بالتغيير (إن وُجد) |
| `created_at` | TIMESTAMPTZ | وقت الحركة |
| `data` | JSONB | إضافات فقط |

*(يمكن حساب `change_amount` في الاستعلام: new_quantity - old_quantity)*

---

## 8) جدول `equipment` (المعدات)

| العمود | النوع | الوصف |
|--------|--------|--------|
| `id` | UUID PK | المعرّف |
| `name` | TEXT NOT NULL | الاسم |
| `category` | TEXT | الفئة (Machinery, Conveyor, …) |
| `zone` | TEXT | المنطقة (A, B, C, …) |
| `status` | equipment_status_enum | active \| under_maintenance \| out_of_service |
| `last_inspection` | DATE | آخر تفتيش |
| `data` | JSONB | إضافات فقط |

---

## 9) جدول `faults` (الأعطال)

| العمود | النوع | الوصف |
|--------|--------|--------|
| `id` | UUID PK | المعرّف |
| `equipment_id` | UUID FK → equipment.id (ON DELETE SET NULL) | معرّف المعدة |
| `equipment_name` | TEXT | اسم المعدة (عرض) |
| `category` | TEXT NOT NULL | mechanical \| electrical \| operational \| other |
| `severity` | fault_severity_enum | low \| medium \| high \| critical |
| `stop_work` | BOOLEAN | أوقف العمل أم لا |
| `description` | TEXT | وصف العطل |
| `created_at` | TIMESTAMPTZ | تاريخ الإنشاء |
| `data` | JSONB | إضافات فقط |

---

## 10) جدول `maintenance_plans` (خطط الصيانة)

| العمود | النوع | الوصف |
|--------|--------|--------|
| `id` | UUID PK | المعرّف |
| `equipment_id` | UUID NOT NULL FK → equipment.id (ON DELETE CASCADE) | معرّف المعدة |
| `equipment_name` | TEXT | اسم المعدة (عرض) |
| `planned_date` | DATE NOT NULL | التاريخ المخطط |
| `type` | TEXT NOT NULL | preventive \| corrective \| inspection |
| `notes` | TEXT | ملاحظات |
| `created_at` | TIMESTAMPTZ | تاريخ الإنشاء |
| `data` | JSONB | إضافات فقط |

---

## 11) جدول `settings` (الإعدادات)

بدون تغيير:

| العمود | النوع | الوصف |
|--------|--------|--------|
| `key` | TEXT PK | المفتاح (مثل batches_by_zone) |
| `value` | JSONB | القيمة (كائن أو مصفوفة) |

---

## ملخص: ماذا في `data` فقط؟

- **workers**: أي حقل جديد نضيفه لاحقاً (مثلاً صورة، صلاحيات إضافية).
- **zones**: إضافات مستقبلية.
- **tasks**: إضافات مستقبلية.
- **records**: إضافات مستقبلية.
- **sessions**: إضافات مستقبلية.
- **inventory**: إضافات مستقبلية.
- **inventory_movements**: إضافات مستقبلية.
- **equipment**: إضافات مستقبلية.
- **faults**: إضافات مستقبلية.
- **maintenance_plans**: إضافات مستقبلية.

بهذا الشكل كل شيء أساسي له عمود، والـ JSON فقط للإضافات. إذا وافقت على هذا المقترح ننزل له على ملف `schema-proposed.sql` ثم نربطه بالتطبيق (قراءة/كتابة).
