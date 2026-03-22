# Cloudflare Pages — الإنتاج (Git + build على Cloudflare)

## المبدأ

متغيرات Vite (`VITE_*`) تُدمَج في الـ JS **عند `npm run build`**. إذا رفعت مجلد `dist` يدوياً بـ `wrangler pages deploy dist`، فالبناء يحدث على جهازك وليس على Cloudflare، و**لن تُستخدم** Environment Variables المعرفة في Pages (ما لم تكن نفس القيم في `.env` محلياً).

**الإنتاج الموصى به:** ربط المستودع بـ Cloudflare Pages والاعتماد على **build داخل Cloudflare** بعد كل `git push`.

---

## 1. ربط GitHub (أو Git)

1. Cloudflare Dashboard → **Workers & Pages** → **Create** → **Pages** → **Connect to Git**.
2. اختر المستودع والفرع **`main`** (أو الفرع الإنتاجي لديك).

---

## 2. إعدادات البناء (Build)

في **Settings** → **Builds & deployments** → **Build configuration**:

| الحقل | القيمة |
|--------|--------|
| **Build command** | `npm run build` |
| **Build output directory** | `dist` |
| **Root directory** | `/` (أو جذر المشروع إن كان monorepo) |

لا حاجة لأمر Deploy منفصل: Pages ينشر محتويات `dist` بعد نجاح الـ build.

---

## 3. متغيرات البيئة (Production)

في **Settings** → **Environment variables** → **Production**:

| Name | Value | ملاحظة |
|------|--------|--------|
| `VITE_SUPABASE_URL` | `https://<project-ref>.supabase.co` | من Supabase → Settings → API |
| `VITE_SUPABASE_ANON_KEY` | المفتاح anon | نفس المشروع |
| `VITE_USE_SUPABASE` | `true` | يجب أن يكون النص `true` حرفياً |

بعد تغيير أي متغير: نفّذ **Retry deployment** أو ادفع commit جديد حتى يُعاد الـ build ويُدمَج الـ bundle الجديد.

---

## 4. النشر الروتيني

```bash
git add .
git commit -m "Your message"
git push origin main
```

Cloudflare يسحب الشفرة، يشغّل `npm run build` مع متغيرات Production، وينشر `dist`.

---

## 5. رفع يدوي طارئ (غير موصى به للإنتاج)

للاختبار أو الطوارئ فقط (يستخدم **build محلي**؛ تأكد من وجود `.env` بنفس القيم أو لن تُحقن مفاتيح Supabase):

```bash
npm run pages:upload
```

---

## 6. استكشاف أخطاء قديمة

إذا كان المشروع مضبوطاً سابقاً على **Deploy command** مثل `npx wrangler deploy` بدون سياق Pages:

- لـ **Pages** مع Git: عطّل أو امسح Deploy command الفارغ، واعتمد فقط على **Build command** + **Output directory** كما أعلاه.
