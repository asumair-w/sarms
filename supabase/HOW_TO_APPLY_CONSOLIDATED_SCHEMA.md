# تطبيق الـ schema الموحّد (`schema-consolidated.sql`)

## ما هذا الملف؟
- **`supabase/schema-consolidated.sql`**: السكيمـا المتفق عليها في المراجعة (جداول + أنواع + علاقات + فهارس).
- **`supabase/schema-drop-consolidated.sql`**: حذف كامل للجداول والأنواع قبل إعادة الإنشاء (يحذف البيانات).

**لا يُفعّل RLS في هذا الملف** — يُفعل لاحقاً مع Supabase Auth وسياسات تدريجية.

## على Supabase (مشروع جديد أو إعادة بناء)
1. Dashboard → **SQL Editor** → استعلام جديد.
2. الصق محتوى **`schema-drop-consolidated.sql`** → **Run** (إن أردت مسح القديم).
3. استعلام جديد → الصق **`schema-consolidated.sql`** → **Run**.

## ملاحظات
- جدول **`workers.auth_user_id`** يشير إلى **`auth.users`** — يتطلب إنشاء المستخدمين في Auth وربط الصفوف بعد التطبيق.
- **`source_session_id`** في `operations_log` و **`source_ticket_id`** في `resolved_tickets` **بدون Foreign Key** إذا حُذفت الجلسة/التذكرة بعد الأرشفة.
- **`sessions.task_type_id`** نص ليدعم قيم الواجهة بما فيها `inventory`.

## الخطوة التالية بعد التثبيت
- Supabase Auth + تعبئة `workers.auth_user_id`
- تفعيل RLS جدولياً مع سياسات مرنة ثم تشديدها
