# اختبار Approve → `operations_log` (Supabase)

## 1) الإعداد (بدون تفعيل auto sync)

في `.env` (محليًا أو على الاستضافة):

```env
VITE_USE_SUPABASE=true
VITE_SUPABASE_URL=https://<project-ref>.supabase.co
VITE_SUPABASE_ANON_KEY=<anon-key>
```

ثم نفّذ في Supabase SQL Editor:

- `schema-consolidated.sql` (إن لم يكن مطبّقًا)
- `rpc-approve-task-complete.sql`

أعد تشغيل `npm run dev` بعد تغيير `.env`.

## 2) التحقق من التفعيل

عند فتح التطبيق، في **Console** يجب أن ترى:

- `[SARMS][supabase] backend status` مع:
  - `VITE_USE_SUPABASE: "true"`
  - `USE_SUPABASE_ACTIVE: true`
  - `urlHost` و `anonKeyConfigured: true`

إذا `USE_SUPABASE_ACTIVE` = `false`: راجع الـ URL والمفتاح أو إملاء `.env` وأعد البناء.

## 3) سير العمل للاختبار

1. إنشاء Task (يُكتب في Supabase عند `USE_SUPABASE_ACTIVE`).
2. إنشاء Session للعامل (يُحفظ صف `sessions` مع `data.clientId` = معرف الجلسة في الواجهة).
3. العامل يُنهي المهمة.
4. المهندس يضغط **Approve** (يُستدعى `approve_task_complete`).

في Console:

- `Calling RPC approve_task_complete` + الـ payload
- ثم إما `RPC success` أو `RPC error`

## 4) التحقق في Supabase

**Table Editor → `operations_log`**: يجب أن يظهر صف جديد بعد Approve ناجح.

**`tasks`**: `status` = `completed` للمهمة المعنية.

**`sessions`**: الجلسة المرتبطة تُحذف (DELETE داخل نفس الـ RPC).

## 5) تشخيص سريع

| الأعراض | التفسير المحتمل |
|--------|------------------|
| لا يظهر `Calling RPC approve_task_complete` | `USE_SUPABASE_ACTIVE` false، أو مسار الموافقة لم يضبط `pendingEngineerCompletionRef` (تأكد من تسلسل addRecord → completed → removeSession) |
| يظهر الاستدعاء ثم `RPC error` | صلاحيات، RPC غير منشور، أو تعارض بيانات (مثلاً `task_id` غير موجود في `tasks`) |
| `Cannot resolve DB session id` | الجلسة لم تُحفظ في Supabase أو `data.clientId` لا يطابق `sessionId` في الواجهة |
