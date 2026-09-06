# بيننا — شات خاص بين شخصين

موقع شات بسيط لشخصين فقط، يعمل عبر سيرفر Node.js حقيقي مع حفظ دائم للبيانات
(الرسائل، الأسماء، الصور، الملفات) على القرص — لا تُفقد البيانات عند إغلاق المتصفح
أو إعادة تحميل الصفحة.

## المزايا
- محادثة لحظية بين طرفين (Socket.io) بدون تحديث الصفحة.
- دعم نص، روابط (تتحول تلقائيًا لروابط قابلة للنقر)، صور، وملفات.
- الرفع الفعلي للملفات يُخزَّن على السيرفر في مجلد `uploads/` (حتى ٢٠ ميجابايت لكل ملف).
- سجل المحادثة كاملاً يُحفظ في `data/messages.json` ويُستعاد تلقائيًا عند الدخول.
- مؤشر "يكتب الآن" ومؤشر اتصال بسيط.
- تصميم يدعم العربية RTL بالكامل.

## التشغيل محليًا

يتطلب [Node.js](https://nodejs.org) نسخة ١٨ فأعلى.

```bash
cd two-person-chat
npm install
npm start
```

ثم افتح `http://localhost:3000` من متصفحك (وعلى جهاز الطرف الآخر إذا كنتما على نفس الشبكة، استخدما عنوان IP الخاص بجهاز السيرفر بدلاً من localhost).

## هيكلة المشروع

```
two-person-chat/
├── server.js          # السيرفر: Express + Socket.io + رفع الملفات
├── package.json
├── render.yaml         # إعداد جاهز للنشر على Render (اختياري)
├── storage/            # كل البيانات الدائمة (يُنشأ تلقائيًا، مسارها قابل للتغيير عبر STORAGE_DIR)
│   ├── data/
│   │   ├── messages.json
│   │   └── names.json
│   └── uploads/         # الصور والملفات المرفوعة فعليًا
└── public/
    ├── index.html
    ├── style.css
    └── client.js
```

كل البيانات الدائمة موحّدة تحت مجلد واحد (`storage/`) حتى يكفي ربط **قرص دائم واحد**
بهذا المسار عند النشر. يمكن تغيير مكانه عبر متغير البيئة `STORAGE_DIR`.

## النشر على الإنترنت برابط دائم

للحصول على رابط دائم يستخدمه أنت وصاحبك، البيانات يجب أن تبقى محفوظة بين عمليات
إعادة التشغيل — وهذا يتطلب **قرص دائم (persistent disk)**. معظم المنصات تقدّم مستوى
مجاني، لكن بدون قرص دائم فيه (البيانات تُمسح كل فترة). الخيار الواقعي الأرخص هو
Render بخطته المدفوعة الأبسط (Starter، تبدأ من نحو 7$/شهر + أقل من دولار للقرص) —
تحقق من السعر الحالي على render.com/pricing لأنه قابل للتغيير.

### النشر على Render (الأسهل)
1. ارفع محتويات هذا المجلد إلى مستودع GitHub (حتى لو فارغ سوى بهذه الملفات).
2. أنشئ حساب على render.com واربطه بحساب GitHub.
3. اختر "New" → "Web Service" وحدد المستودع — Render سيكتشف أنه Node.js تلقائيًا.
4. Build Command: `npm install` — Start Command: `npm start`.
5. اختر خطة **Starter** (وليس Free) لأنها الوحيدة التي تدعم الأقراص الدائمة.
6. من تبويب "Disks" أضف قرصًا: Mount Path = `/var/data`، الحجم 1GB يكفي تمامًا.
7. من "Environment" أضف متغيّر: `STORAGE_DIR` = `/var/data`.
8. اضغط Deploy، وانتظر بضع دقائق — Render يعطيك رابطًا دائمًا مثل
   `https://two-person-chat.onrender.com` تشاركونه أنت وصاحبك.

(ملف `render.yaml` المرفق يحتوي هذا الإعداد جاهزًا إن كانت منصتك تدعم "Blueprints".)

### بدائل أخرى
- **Railway.app**: نفس الفكرة تقريبًا، أضف Volume واربطه بـ `/var/data` وضع
  متغير `STORAGE_DIR=/var/data`.
- **VPS خاص بك** (DigitalOcean, Hetzner...): الأرخص على المدى الطويل والأكثر تحكمًا:
  ```bash
  git clone <رابط مستودعك> && cd two-person-chat
  npm install --production
  npm install -g pm2
  pm2 start server.js --name two-person-chat
  pm2 save && pm2 startup
  ```
  ثم ضع Nginx أمامه كـ reverse proxy مع شهادة SSL مجانية عبر Let's Encrypt/Certbot.
- **Docker** (لأي منصة تدعمه):
  ```dockerfile
  FROM node:20-alpine
  WORKDIR /app
  COPY package*.json ./
  RUN npm install --production
  COPY . .
  EXPOSE 3000
  CMD ["node", "server.js"]
  ```
  ```bash
  docker build -t two-person-chat .
  docker run -p 3000:3000 -e STORAGE_DIR=/app/storage -v $(pwd)/storage:/app/storage two-person-chat
  ```

## ملاحظات مهمة
- **الوصول للموقع:** أي شخص يملك رابط الموقع يمكنه اختيار "الشخص الأول" أو
  "الشخص الثاني" والدخول — لا يوجد نظام تسجيل دخول بكلمة مرور حاليًا. إذا كنتما
  تريدان طبقة حماية إضافية، أخبرني وأضيف كلمة مرور بسيطة لدخول الصفحة.
- **حجم الرفع:** الحد الأقصى ٢٠ ميجابايت لكل صورة/ملف، معدّل `MAX_UPLOAD_MB` في
  `server.js` (وفي حال النشر خلف Nginx يجب أيضًا رفع `client_max_body_size`).
- **النسخ الاحتياطي:** بما أن البيانات ملفات JSON عادية داخل `data/` والملفات في
  `uploads/`، يكفي نسخ هذين المجلدين بشكل دوري كنسخة احتياطية.
