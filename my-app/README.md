# Savob yo'li — Shaffof va Ishonchli Xayriya Platformasi (MVP)

> **G'oya:** Mahalla yordamga muhtoj fuqaro nomidan ariza beradi. Davlat idoralari (Ijtimoiy himoya milliy agentligi, Soliq qo'mitasi va h.k.) arizaning haqqoniyligini tekshiradi. Kamida 2 ta mustaqil idora tasdiqlagan arizalargina ommaviy sahifada e'lon qilinadi. Donorlar mablag'ni vositachilarsiz (bloger yoki uchinchi shaxslarsiz) 100% to'g'ridan-to'g'ri yuboradi va har bir to'lov ochiq shaffof daftarda aks etadi.

---

## 🚀 Texnologiyalar

- **Backend:** Python 3.9+, FastAPI, SQLite (`sqlite3`), PyJWT, Pydantic v2
- **Frontend:** 
  - **React (Vite):** `src/App.jsx` va zamonaviy `src/index.css` (Onest shrifti, modallar, progress barlar, shaffof daftar)
  - **Mustaqil HTML:** `frontend/index.html` (Build talab qilmaydigan Vanilla JS versiyasi, FastAPI uni `/` manzilida ham taqdim eta oladi)
- **Xavfsizlik:** PBKDF2-HMAC-SHA256 (200 000 iteratsiya + tuz), 12 soatlik JWT tokenlar, parametrli SQL so'rovlar, XSS himoyasi.

---

## 📁 Fayllar Tuzilmasi

```
my-app/
├── backend/
│   ├── main.py              # FastAPI server, ma'lumotlar bazasi, biznes qoidalari, API
│   ├── requirements.txt     # Python kutubxonalari
│   └── savob.db             # SQLite ma'lumotlar bazasi (avtomatik yaratiladi)
├── frontend/
│   └── index.html           # Yagona mustaqil Vanilla JS frontend fayli
├── src/
│   ├── App.jsx              # React 19 to'liq frontend komponenti
│   ├── index.css            # Platforma dizayn tizimi (Onest shrifti, ranglar palitrasi)
│   └── main.jsx
├── .env.example             # Muhit o'zgaruvchilari namunasi
├── vite.config.js           # Vite server va /api proksi sozlamalari
└── README.md                # Qo'llanma va hujjatlar
```

---

## 🛠️ Loyihani Ishga Tushirish

### 1. Backendni ishga tushirish (FastAPI)

Tizimda Python 3.9+ o'rnatilgan bo'lishi kerak:

```bash
# Virtual muhit yaratish va faollashtirish (ixtiyoriy, lekin tavsiya etiladi)
python -m venv venv
# Windows uchun:
venv\Scripts\activate
# Linux/Mac uchun:
source venv/bin/activate

# Kerakli paketlarni o'rnatish
pip install -r backend/requirements.txt

# Backend serverni ishga tushirish
uvicorn backend.main:app --reload --port 8000
```

> **Eslatma:** Backend ishga tushganda `SEED_DEMO=1` tufayli avtomatik tarzda namunaviy hisoblar va arizalar bazaga yoziladi.
> API hujjati (Swagger): `http://127.0.0.1:8000/docs`

### 2. Frontendni ishga tushirish (React)

Yangi terminal oching va `my-app` jildida:

```bash
# Kutubxonalarni o'rnatish (agar o'rnatilmagan bo'lsa)
npm install

# React dasturini ishga tushirish
npm run dev
```

Brauzerda oching: `http://localhost:5173/`

*(Vite orqali barcha `/api` so'rovlari avtomatik tarzda `http://127.0.0.1:8000` ga yo'naltiriladi).*

---

## 👥 Demo Hisoblar va Sinov Oqimi (Demo Flow)

Platformada 4 xil rol mavjud:

| Rol | Login | Parol | Tashkilot | Vazifasi |
| :--- | :--- | :--- | :--- | :--- |
| **Admin** | `admin` | `admin12345` | Savob yo'li Ma'muriyati | Yangi Mahalla va Tekshiruvchi idora hisoblarini ochish |
| **Mahalla** | `mahalla_chilonzor` | `demo12345` | Chilonzor 7-mavze MFY | Fuqaro nomidan yangi ariza yuborish, statusni kuzatish |
| **Tekshiruvchi 1** | `rev_ijtimoiy` | `demo12345` | Ijtimoiy himoya agentligi | Navbatdagi arizani tekshirish (tasdiqlash / rad etish) |
| **Tekshiruvchi 2** | `rev_soliq` | `demo12345` | Soliq qo'mitasi | Navbatdagi arizani tekshirish (kamida 2-tasdiq) |
| **Donor** | *(Kirishsiz)* | — | — | To'g'ridan-to'g'ri anonim yoki ochiq xayriya qilish |

### Sinov Ssenariysi:
1. **Donor sifatida xayriya qilish:** Asosiy sahifada tasdiqlangan birinchi arizaga `Xayriya qilish` tugmasini bosing, 50 000 so'm yuboring va `Batafsil` oynasidagi **Shaffof daftarda** to'lovingiz paydo bo'lganini ko'ring.
2. **Mahalla bo'lib kirish:** `Kirish` tugmasini bosing -> `Mahalla` demo tugmasini bosing -> Yangi ariza yuboring (ariza darhol `pending` holatga tushadi).
3. **Tekshiruvchi bo'lib kirish:** Chiqib, `Ijtimoiy himoya` sifatida kiring -> Navbatdagi arizani ko'rib, `Tasdiqlash` tugmasini bosing (1/2 tasdiq bo'ladi).
4. **2-Idora bo'lib kirish:** `Soliq qo'mitasi` sifatida kiring -> Xuddi shu arizani tasdiqlang -> Ariza avtomatik ravishda `approved` bo'lib, ommaviy sahifada e'lon qilinadi!

---

## 💳 To'lov Webhooki

`PAYMENT_MODE=demo` rejimida xayriya darhol `paid` bo'ladi.
Agar `PAYMENT_MODE=live` bo'lsa, to'lov tizimi (Payme/Click) tasdiq webhookini quyidagicha yuboradi:

```bash
curl -X POST "http://localhost:8000/api/payments/confirm/1" \
     -H "X-Payment-Secret: payment_webhook_secret_key_889977"
```

---

## 🔒 Productionga Chiqishdan Oldin Nazorat Ro'yxati (Pre-Production Checklist)

Haqiqiy foydalanishga topshirishdan oldin quyidagi talablar bajarilishi shart:

- [ ] **1. Haqiqiy to'lov tizimlari integratsiyasi:**
  - Payme Business, Click Merchant yoki Uzum Bank rasmiy shartnomasi va API integratsiyasi.
  - To'lov webhooklarida imzo (`signature` / `HMAC`) va idempotency tekshiruvi.
  - O'zbekiston Respublikasi Soliq qo'mitasining onlayn-NKM fiskal cheklarini avtomatlashtirish.
- [ ] **2. Mablag'ni xavfsiz chiqarish (Escrow / Payout mexanizmi):**
  - Mablag' to'g'ridan-to'g'ri kasalxona / klinika hisob raqamiga shartnoma asosida o'tkazilishi (naqd pul berilmasligi firibgarlikni oldini oladi).
  - 3 tomonlama dalolatnoma (MFY, Tibbiyot muassasasi, Platforma).
- [ ] **3. Ma'lumotlar bazasi (PostgreSQL):**
  - SQLite o'rniga PostgreSQL 15+ yoki MySQL 8+.
  - Connection pooling (`SQLAlchemy` yoki `asyncpg`) va muntazam avtomatik zaxira nusxalari (Backups).
- [ ] **4. HTTPS, SSL va Tarmoq xavfsizligi:**
  - Majburiy SSL sertifikati (Let's Encrypt / Cloudflare).
  - CORS cheklovlari (faqat rasmiy domen uchun ruxsat berish).
  - Rate limiting (DDoS va brute-force hujumlardan himoya, masalan `slowapi` orqali).
- [ ] **5. Hujjatlar yuklash va Fayllar xavfsizligi:**
  - Fuqaroning tibbiy epikrizlari va xulosalarini yuklash uchun Amazon S3 yoki Cloudflare R2 integratsiyasi.
  - Fayllarni antivirus tekshiruvidan o'tkazish (ClamAV) va faqat PDF/JPG formatlariga cheklov.
- [ ] **6. Shaxsiy ma'lumotlar xavfsizligi:**
  - Fuqaroning JShShIR (PINFL) va pasport ma'lumotlarini bazada AES-256 shifrlangan holda saqlash.
  - "Shaxsiy ma'lumotlar to'g'risida"gi O'zbekiston Respublikasi Qonuniga muvofiq serverlarni O'zbekiston hududida joylashtirish.
