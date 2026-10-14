import os
import sqlite3
import hashlib
import secrets
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Optional, List, Dict, Any

import jwt
from fastapi import FastAPI, HTTPException, Depends, Header, status
from fastapi.responses import HTMLResponse, FileResponse
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

# --------------------------------------------------------------------------
# Konfiguratsiya va Muhit o'zgaruvchilari
# --------------------------------------------------------------------------
BASE_DIR = Path(__file__).resolve().parent
PROJECT_ROOT = BASE_DIR.parent
FRONTEND_FILE = PROJECT_ROOT / "frontend" / "index.html"
if not FRONTEND_FILE.exists():
    FRONTEND_FILE = BASE_DIR / "frontend" / "index.html"

DB_FILE = BASE_DIR / "savob.db"

SAVOB_SECRET = os.getenv("SAVOB_SECRET", "savob_yoli_secret_jwt_key_2026_xayriya")
ADMIN_PASSWORD = os.getenv("ADMIN_PASSWORD", "admin12345")
PAYMENT_SECRET = os.getenv("PAYMENT_SECRET", "payment_webhook_secret_key_889977")
REQUIRED_APPROVALS = int(os.getenv("REQUIRED_APPROVALS", "2"))
PAYMENT_MODE = os.getenv("PAYMENT_MODE", "demo")
SEED_DEMO = os.getenv("SEED_DEMO", "1") == "1"

JWT_ALGORITHM = "HS256"
JWT_EXPIRATION_HOURS = 12
HASH_ITERATIONS = 200_000

# --------------------------------------------------------------------------
# FastAPI Ilovasi
# --------------------------------------------------------------------------
app = FastAPI(
    title="Savob yo'li — Shaffof xayriya platformasi API",
    description="Mahalla va davlat idoralari orqali tekshiriladigan shaffof xayriya platformasi",
    version="1.0.0"
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# --------------------------------------------------------------------------
# Parol va Xavfsizlik Funksiyalari
# --------------------------------------------------------------------------
def hash_password(password: str) -> str:
    """PBKDF2-HMAC-SHA256 yordamida parolni 200 000 marta iteratsiya bilan shifrlash."""
    salt = secrets.token_hex(16)
    key = hashlib.pbkdf2_hmac(
        "sha256",
        password.encode("utf-8"),
        salt.encode("utf-8"),
        HASH_ITERATIONS
    )
    return f"{salt}:{key.hex()}"

def verify_password(password: str, hashed: str) -> bool:
    """Parol to'g'riligini xavfsiz tekshirish."""
    try:
        salt, key_hex = hashed.split(":", 1)
        key = hashlib.pbkdf2_hmac(
            "sha256",
            password.encode("utf-8"),
            salt.encode("utf-8"),
            HASH_ITERATIONS
        )
        return secrets.compare_digest(key.hex(), key_hex)
    except Exception:
        return False

def create_jwt_token(data: dict) -> str:
    """12 soatlik JWT token yaratish."""
    payload = data.copy()
    expire = datetime.now(timezone.utc) + timedelta(hours=JWT_EXPIRATION_HOURS)
    payload.update({"exp": expire})
    return jwt.encode(payload, SAVOB_SECRET, algorithm=JWT_ALGORITHM)

def decode_jwt_token(token: str) -> dict:
    """JWT tokenni tekshirish va dekodlash."""
    try:
        return jwt.decode(token, SAVOB_SECRET, algorithms=[JWT_ALGORITHM])
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Sessiya muddati tugadi. Qaytadan kiring.")
    except jwt.PyJWTError:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Yaroqsiz token.")

# --------------------------------------------------------------------------
# Ma'lumotlar Bazasi (SQLite3)
# --------------------------------------------------------------------------
def get_db():
    conn = sqlite3.connect(DB_FILE)
    conn.row_factory = sqlite3.Row
    try:
        yield conn
    finally:
        conn.close()

def init_db():
    """Jadvallarni yaratish va dastlabki ma'lumotlarni kiritish."""
    conn = sqlite3.connect(DB_FILE)
    conn.row_factory = sqlite3.Row
    cursor = conn.cursor()

    # Foydalanuvchilar jadvali
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT UNIQUE NOT NULL,
        password_hash TEXT NOT NULL,
        role TEXT NOT NULL,
        org TEXT NOT NULL,
        full_name TEXT NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
    """)

    # Arizalar jadvali
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS applications (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        mahalla_user_id INTEGER NOT NULL,
        title TEXT NOT NULL,
        citizen_name TEXT NOT NULL,
        citizen_pinfl TEXT NOT NULL,
        category TEXT NOT NULL,
        target_amount INTEGER NOT NULL,
        description TEXT NOT NULL,
        address TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'pending',
        rejection_reason TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (mahalla_user_id) REFERENCES users(id)
    );
    """)

    # Tekshiruvlar (review) jadvali - UNIQUE(application_id, org)
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS reviews (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        application_id INTEGER NOT NULL,
        reviewer_user_id INTEGER NOT NULL,
        org TEXT NOT NULL,
        decision TEXT NOT NULL,
        comment TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(application_id, org),
        FOREIGN KEY (application_id) REFERENCES applications(id),
        FOREIGN KEY (reviewer_user_id) REFERENCES users(id)
    );
    """)

    # Xayriyalar jadvali
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS donations (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        application_id INTEGER NOT NULL,
        donor_name TEXT NOT NULL DEFAULT 'Anonim',
        amount INTEGER NOT NULL,
        comment TEXT,
        status TEXT NOT NULL DEFAULT 'paid',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (application_id) REFERENCES applications(id)
    );
    """)

    conn.commit()

    # SEED_DEMO
    if SEED_DEMO:
        seed_initial_data(cursor, conn)

    conn.close()

def seed_initial_data(cursor, conn):
    """Demo hisoblar va arizalarni yaratish."""
    # Admin hisobi
    cursor.execute("SELECT id FROM users WHERE username = 'admin'")
    if not cursor.fetchone():
        cursor.execute("""
            INSERT INTO users (username, password_hash, role, org, full_name)
            VALUES (?, ?, ?, ?, ?)
        """, ('admin', hash_password(ADMIN_PASSWORD), 'admin', "Savob yo'li Ma'muriyati", 'Bosh Administrator'))
        print(f"[SEED] Admin yaratildi | Login: admin | Parol: {ADMIN_PASSWORD}")

    # Mahalla hisobi
    cursor.execute("SELECT id FROM users WHERE username = 'mahalla_chilonzor'")
    mahalla_row = cursor.fetchone()
    if not mahalla_row:
        cursor.execute("""
            INSERT INTO users (username, password_hash, role, org, full_name)
            VALUES (?, ?, ?, ?, ?)
        """, ('mahalla_chilonzor', hash_password('demo12345'), 'mahalla', "Chilonzor 7-mavze MFY", "Ergash Karimov (MFY Raisi)"))
        mahalla_id = cursor.lastrowid
    else:
        mahalla_id = mahalla_row["id"]

    # Reviewer 1 (Ijtimoiy himoya agentligi)
    cursor.execute("SELECT id FROM users WHERE username = 'rev_ijtimoiy'")
    rev1 = cursor.fetchone()
    if not rev1:
        cursor.execute("""
            INSERT INTO users (username, password_hash, role, org, full_name)
            VALUES (?, ?, ?, ?, ?)
        """, ('rev_ijtimoiy', hash_password('demo12345'), 'reviewer', "Ijtimoiy himoya milliy agentligi", "Nodira Rahimova (Katta inspektor)"))
        rev1_id = cursor.lastrowid
    else:
        rev1_id = rev1["id"]

    # Reviewer 2 (Soliq qo'mitasi)
    cursor.execute("SELECT id FROM users WHERE username = 'rev_soliq'")
    rev2 = cursor.fetchone()
    if not rev2:
        cursor.execute("""
            INSERT INTO users (username, password_hash, role, org, full_name)
            VALUES (?, ?, ?, ?, ?)
        """, ('rev_soliq', hash_password('demo12345'), 'reviewer', "Soliq qo'mitasi", "Rustam Qosimov (Yetakchi mutaxassis)"))
        rev2_id = cursor.lastrowid
    else:
        rev2_id = rev2["id"]

    # Namunaviy 1-ariza (Approved - 2 ta idora tasdiqlagan, xayriyalar tushgan)
    cursor.execute("SELECT id FROM applications WHERE title LIKE '%Operatsiya%'")
    if not cursor.fetchone():
        cursor.execute("""
            INSERT INTO applications (mahalla_user_id, title, citizen_name, citizen_pinfl, category, target_amount, description, address, status)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, (
            mahalla_id,
            "7 yoshli Jasurga yurak jarrohlik amaliyoti uchun ko'mak",
            "Jasurbek Aliyev",
            "51234567890123",
            "Davolanish",
            25000000,
            "Tug'ma yurak nuqsoni bilan kasallangan 7 yoshli Jasurbekka xorijiy mutaxassislar ishtirokida shoshilinch kardiojarrohlik amaliyoti talab etiladi. Oila 'Temir daftar'da ro'yxatda turadi, ota-onasining moddiy imkoniyati yetarli emas. Barcha tibbiy xulosalar MFY va idoralar tomonidan tekshirildi.",
            "Toshkent shahri, Chilonzor tumani, 7-mavze, 12-uy",
            "approved"
        ))
        app1_id = cursor.lastrowid

        # 2 ta tasdiq kiritish
        cursor.execute("""
            INSERT OR IGNORE INTO reviews (application_id, reviewer_user_id, org, decision, comment)
            VALUES (?, ?, ?, 'approve', ?)
        """, (app1_id, rev1_id, "Ijtimoiy himoya milliy agentligi", "Tibbiy dalillar va oilaning moddiy ahvoli to'liq tasdiqlandi."))

        cursor.execute("""
            INSERT OR IGNORE INTO reviews (application_id, reviewer_user_id, org, decision, comment)
            VALUES (?, ?, ?, 'approve', ?)
        """, (app1_id, rev2_id, "Soliq qo'mitasi", "Daromad manbalari va ko'chmas mulk bazasi tekshirildi. Yordamga muhtojligi tasdiqlandi."))

        # Namunaviy xayriyalar
        donations = [
            (app1_id, "Anvar Sobirov", 500000, "Alloh shifo bersin!"),
            (app1_id, "Anonim", 2000000, "Tezroq sog'ayib ketsin"),
            (app1_id, "Dilnoza M.", 300000, "Kichkintoyga sog'lik tilayman"),
            (app1_id, "Anonim", 5000000, "Savob yo'lida kichik hissamiz"),
            (app1_id, "Botir Qodirov", 1500000, "Xudo quvvat bersin!")
        ]
        for aid, donor, amt, comm in donations:
            cursor.execute("""
                INSERT INTO donations (application_id, donor_name, amount, comment, status)
                VALUES (?, ?, ?, ?, 'paid')
            """, (aid, donor, amt, comm))

    # Namunaviy 2-ariza (Pending - Navbatda turgan ariza, 1 ta tasdiq bilan)
    cursor.execute("SELECT id FROM applications WHERE title LIKE '%Nogironlar aravachasi%'")
    if not cursor.fetchone():
        cursor.execute("""
            INSERT INTO applications (mahalla_user_id, title, citizen_name, citizen_pinfl, category, target_amount, description, address, status)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, (
            mahalla_id,
            "1-guruh nogironi Fotima opaga elektr yuritmali aravacha",
            "Fotima Normatova",
            "69876543210987",
            "Reabilitatsiya",
            8500000,
            "I-guruh nogironligi bo'lgan yolg'iz nafaqaxo'r ayol harakatlanishi uchun maxsus elektr yuritmali reabilitatsiya aravachasiga muhtoj. Mahalladagi xatlovda muammo aniqlandi.",
            "Toshkent shahri, Chilonzor tumani, 7-mavze, 45-uy",
            "pending"
        ))
        app2_id = cursor.lastrowid

        # Faqat 1-idora tasdiqlagan (2-idoraning qarori kutilmoqda)
        cursor.execute("""
            INSERT OR IGNORE INTO reviews (application_id, reviewer_user_id, org, decision, comment)
            VALUES (?, ?, ?, 'approve', ?)
        """, (app2_id, rev1_id, "Ijtimoiy himoya milliy agentligi", "Nogironlik guruhi va reabilitatsiya ehtiyoji tasdiqlandi."))

    conn.commit()

# --------------------------------------------------------------------------
# Avtorizatsiya Dependency
# --------------------------------------------------------------------------
def get_current_user(authorization: Optional[str] = Header(None)) -> dict:
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Tizimga kirish talab qilinadi (Token mavjud emas)."
        )
    token = authorization.split(" ")[1]
    return decode_jwt_token(token)

def require_role(allowed_roles: List[str]):
    def role_checker(user: dict = Depends(get_current_user)):
        if user.get("role") not in allowed_roles:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Ushbu amalni bajarish uchun ruxsat yo'q. Kerakli rol: {', '.join(allowed_roles)}"
            )
        return user
    return role_checker

# --------------------------------------------------------------------------
# Pydantic Modellari (v2)
# --------------------------------------------------------------------------
class LoginRequest(BaseModel):
    username: str = Field(..., min_length=3)
    password: str = Field(..., min_length=4)

class UserCreateRequest(BaseModel):
    username: str = Field(..., min_length=3)
    password: str = Field(..., min_length=6)
    role: str = Field(..., pattern="^(mahalla|reviewer)$")
    org: str = Field(..., min_length=3)
    full_name: str = Field(..., min_length=3)

class ApplicationCreateRequest(BaseModel):
    title: str = Field(..., min_length=5)
    citizen_name: str = Field(..., min_length=3)
    citizen_pinfl: str = Field(..., min_length=14, max_length=14)
    category: str = Field(..., min_length=2)
    target_amount: int = Field(..., gt=0)
    description: str = Field(..., min_length=10)
    address: str = Field(..., min_length=5)

class ReviewRequest(BaseModel):
    decision: str = Field(..., pattern="^(approve|reject)$")
    comment: str = Field(..., min_length=3)

class DonateRequest(BaseModel):
    donor_name: Optional[str] = "Anonim"
    amount: int = Field(..., ge=1000)
    comment: Optional[str] = None

# --------------------------------------------------------------------------
# API Yo'llari (Endpoints)
# --------------------------------------------------------------------------

@app.on_event("startup")
def startup_event():
    init_db()

@app.get("/", response_class=HTMLResponse)
def serve_index():
    """Asosiy veb sahifa (bitta index.html)."""
    if FRONTEND_FILE.exists():
        return FileResponse(FRONTEND_FILE)
    return HTMLResponse("<h2>Savob yo'li frontend fayli topilmadi. frontend/index.html mavjudligini tekshiring.</h2>")

@app.post("/api/login")
def login(req: LoginRequest, db: sqlite3.Connection = Depends(get_db)):
    cursor = db.cursor()
    cursor.execute("SELECT * FROM users WHERE username = ?", (req.username,))
    user = cursor.fetchone()

    if not user or not verify_password(req.password, user["password_hash"]):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Foydalanuvchi nomi yoki parol noto'g'ri."
        )

    token_data = {
        "sub": user["username"],
        "user_id": user["id"],
        "role": user["role"],
        "org": user["org"],
        "full_name": user["full_name"]
    }
    access_token = create_jwt_token(token_data)

    return {
        "access_token": access_token,
        "token_type": "bearer",
        "user": {
            "id": user["id"],
            "username": user["username"],
            "role": user["role"],
            "org": user["org"],
            "full_name": user["full_name"]
        }
    }

@app.post("/api/admin/users")
def create_user(
    req: UserCreateRequest,
    current_user: dict = Depends(require_role(["admin"])),
    db: sqlite3.Connection = Depends(get_db)
):
    """Admin yangi mahalla yoki reviewer hisobini yaratadi."""
    cursor = db.cursor()
    cursor.execute("SELECT id FROM users WHERE username = ?", (req.username,))
    if cursor.fetchone():
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Ushbu login band.")

    hashed = hash_password(req.password)
    cursor.execute("""
        INSERT INTO users (username, password_hash, role, org, full_name)
        VALUES (?, ?, ?, ?, ?)
    """, (req.username, hashed, req.role, req.org, req.full_name))
    db.commit()

    return {
        "success": True,
        "message": f"Yangi {req.role} muvaffaqiyatli yaratildi.",
        "user_id": cursor.lastrowid
    }

@app.get("/api/admin/users")
def list_users(
    current_user: dict = Depends(require_role(["admin"])),
    db: sqlite3.Connection = Depends(get_db)
):
    """Admin barcha hisoblar ro'yxatini ko'rishi mumkin."""
    cursor = db.cursor()
    cursor.execute("SELECT id, username, role, org, full_name, created_at FROM users ORDER BY id DESC")
    rows = cursor.fetchall()
    return [dict(r) for r in rows]

@app.get("/api/stats")
def get_stats(db: sqlite3.Connection = Depends(get_db)):
    """Ochiq statistika: yig'ilgan summa, yordam berilgan oilalar, tasdiqlangan arizalar."""
    cursor = db.cursor()

    # Yig'ilgan mablag' (faqat paid xayriyalar)
    cursor.execute("SELECT COALESCE(SUM(amount), 0) as total FROM donations WHERE status = 'paid'")
    total_donated = cursor.fetchone()["total"]

    # Yordam berilgan (xayriya olgan) oilalar soni
    cursor.execute("SELECT COUNT(DISTINCT application_id) as families FROM donations WHERE status = 'paid'")
    helped_families = cursor.fetchone()["families"]

    # Tasdiqlangan barcha arizalar
    cursor.execute("SELECT COUNT(*) as count FROM applications WHERE status = 'approved'")
    approved_applications = cursor.fetchone()["count"]

    return {
        "total_donated": total_donated,
        "helped_families": helped_families,
        "approved_applications": approved_applications
    }

@app.get("/api/applications")
def get_applications(db: sqlite3.Connection = Depends(get_db)):
    """Ochiq sahifada faqat 'approved' arizalar ko'rinadi."""
    cursor = db.cursor()
    cursor.execute("""
        SELECT a.id, a.title, a.citizen_name, a.category, a.target_amount, a.description,
               a.address, a.created_at, u.org as mahalla_org,
               COALESCE((SELECT SUM(amount) FROM donations WHERE application_id = a.id AND status = 'paid'), 0) as collected_amount,
               (SELECT COUNT(*) FROM donations WHERE application_id = a.id AND status = 'paid') as donor_count
        FROM applications a
        JOIN users u ON a.mahalla_user_id = u.id
        WHERE a.status = 'approved'
        ORDER BY a.id DESC
    """)
    rows = cursor.fetchall()
    result = []
    for r in rows:
        app_dict = dict(r)
        # Ushbu arizani tasdiqlagan tashkilotlar
        cursor.execute("SELECT org FROM reviews WHERE application_id = ? AND decision = 'approve'", (r["id"],))
        approvals = [rev["org"] for rev in cursor.fetchall()]
        app_dict["approved_by"] = approvals
        result.append(app_dict)
    return result

@app.get("/api/applications/{app_id}")
def get_application_detail(app_id: int, db: sqlite3.Connection = Depends(get_db)):
    """Ariza batafsil sahifasi: kim tasdiqlagan, yig'ilgan summa, barcha xayriyalar ro'yxati."""
    cursor = db.cursor()
    cursor.execute("""
        SELECT a.*, u.org as mahalla_org,
               COALESCE((SELECT SUM(amount) FROM donations WHERE application_id = a.id AND status = 'paid'), 0) as collected_amount
        FROM applications a
        JOIN users u ON a.mahalla_user_id = u.id
        WHERE a.id = ?
    """, (app_id,))
    row = cursor.fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="Ariza topilmadi.")

    app_dict = dict(row)

    # Tasdiqlaganlar
    cursor.execute("""
        SELECT org, decision, comment, created_at
        FROM reviews
        WHERE application_id = ? AND decision = 'approve'
        ORDER BY id ASC
    """, (app_id,))
    app_dict["approvals"] = [dict(r) for r in cursor.fetchall()]

    # Barcha to'langan xayriyalar (shaffof ro'yxat)
    cursor.execute("""
        SELECT id, donor_name, amount, comment, created_at
        FROM donations
        WHERE application_id = ? AND status = 'paid'
        ORDER BY id DESC
    """, (app_id,))
    app_dict["donations"] = [dict(r) for r in cursor.fetchall()]

    return app_dict

@app.post("/api/applications/{app_id}/donate")
def donate(app_id: int, req: DonateRequest, db: sqlite3.Connection = Depends(get_db)):
    """Donor hisobsiz to'g'ridan-to'g'ri xayriya qiladi. Minimal 1000 so'm."""
    if req.amount < 1000:
        raise HTTPException(status_code=400, detail="Minimal xayriya summasi 1 000 so'm.")

    cursor = db.cursor()
    cursor.execute("SELECT status FROM applications WHERE id = ?", (app_id,))
    app_row = cursor.fetchone()
    if not app_row:
        raise HTTPException(status_code=404, detail="Ariza topilmadi.")
    if app_row["status"] != "approved":
        raise HTTPException(status_code=400, detail="Faqat tasdiqlangan arizalarga xayriya qilish mumkin.")

    donor_name = req.donor_name.strip() if req.donor_name and req.donor_name.strip() else "Anonim"
    initial_status = "paid" if PAYMENT_MODE == "demo" else "pending"

    cursor.execute("""
        INSERT INTO donations (application_id, donor_name, amount, comment, status)
        VALUES (?, ?, ?, ?, ?)
    """, (app_id, donor_name, req.amount, req.comment, initial_status))
    db.commit()
    donation_id = cursor.lastrowid

    if PAYMENT_MODE == "demo":
        return {
            "success": True,
            "donation_id": donation_id,
            "status": "paid",
            "message": "Xayriyangiz uchun tashakkur! Mablag' darhol hisobga olindi (Demo rejim)."
        }
    else:
        # TODO: Click / Payme / Uzum checkout integratsiyasi
        # checkout_url = f"https://checkout.paycom.uz/..."
        return {
            "success": True,
            "donation_id": donation_id,
            "status": "pending",
            "checkout_url": f"/api/payments/mock-checkout/{donation_id}",
            "message": "To'lov tizimiga yo'naltirilmoqda. Webhook orqali tasdiqlanadi."
        }

@app.post("/api/payments/confirm/{donation_id}")
def confirm_payment(
    donation_id: int,
    x_payment_secret: Optional[str] = Header(None, alias="X-Payment-Secret"),
    db: sqlite3.Connection = Depends(get_db)
):
    """To'lov webhooki: X-Payment-Secret bilan to'lovni 'paid' qiladi."""
    if not x_payment_secret or not secrets.compare_digest(x_payment_secret, PAYMENT_SECRET):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Maxfiy kalit noto'g'ri.")

    cursor = db.cursor()
    cursor.execute("SELECT id, status FROM donations WHERE id = ?", (donation_id,))
    donation = cursor.fetchone()
    if not donation:
        raise HTTPException(status_code=404, detail="Xayriya topilmadi.")

    cursor.execute("UPDATE donations SET status = 'paid' WHERE id = ?", (donation_id,))
    db.commit()

    return {"success": True, "message": "To'lov tasdiqlandi.", "donation_id": donation_id}

@app.post("/api/applications")
def create_application(
    req: ApplicationCreateRequest,
    current_user: dict = Depends(require_role(["mahalla"])),
    db: sqlite3.Connection = Depends(get_db)
):
    """Mahalla yangi ariza yuboradi."""
    cursor = db.cursor()
    cursor.execute("""
        INSERT INTO applications (
            mahalla_user_id, title, citizen_name, citizen_pinfl,
            category, target_amount, description, address, status
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending')
    """, (
        current_user["user_id"], req.title, req.citizen_name, req.citizen_pinfl,
        req.category, req.target_amount, req.description, req.address
    ))
    db.commit()
    app_id = cursor.lastrowid

    return {
        "success": True,
        "message": "Ariza muvaffaqiyatli topshirildi va tekshiruv navbatiga qo'shildi.",
        "application_id": app_id
    }

@app.get("/api/my/applications")
def get_my_applications(
    current_user: dict = Depends(require_role(["mahalla"])),
    db: sqlite3.Connection = Depends(get_db)
):
    """Mahalla o'zi yuborgan barcha arizalar holatini ko'radi."""
    cursor = db.cursor()
    cursor.execute("""
        SELECT a.*,
               (SELECT COUNT(*) FROM reviews WHERE application_id = a.id AND decision = 'approve') as approval_count,
               COALESCE((SELECT SUM(amount) FROM donations WHERE application_id = a.id AND status = 'paid'), 0) as collected_amount
        FROM applications a
        WHERE a.mahalla_user_id = ?
        ORDER BY a.id DESC
    """, (current_user["user_id"],))
    rows = cursor.fetchall()
    return [dict(r) for r in rows]

@app.get("/api/review/queue")
def get_review_queue(
    current_user: dict = Depends(require_role(["reviewer"])),
    db: sqlite3.Connection = Depends(get_db)
):
    """Tekshiruvchi idora ko'rib chiqishi kerak bo'lgan pending arizalar navbati.
    Qoida: Ushbu tashkilot hali qaror bermagan arizalargina chiqadi."""
    reviewer_org = current_user.get("org")
    cursor = db.cursor()
    cursor.execute("""
        SELECT a.*, u.org as mahalla_org,
               (SELECT COUNT(*) FROM reviews WHERE application_id = a.id AND decision = 'approve') as current_approvals
        FROM applications a
        JOIN users u ON a.mahalla_user_id = u.id
        WHERE a.status = 'pending'
          AND a.id NOT IN (
              SELECT application_id FROM reviews WHERE org = ?
          )
        ORDER BY a.id ASC
    """, (reviewer_org,))
    rows = cursor.fetchall()
    return [dict(r) for r in rows]

@app.post("/api/review/{app_id}")
def submit_review(
    app_id: int,
    req: ReviewRequest,
    current_user: dict = Depends(require_role(["reviewer"])),
    db: sqlite3.Connection = Depends(get_db)
):
    """Tekshiruvchi idora arizaga xulosa beradi (approve yoki reject).
    Biznes qoidalari:
    1. Bitta idora bitta arizaga faqat 1 marta qaror beradi (UNIQUE application_id + org).
    2. Bitta rad etish (reject) darhol arizani rejected qiladi, sabab majburiy.
    3. Kamida REQUIRED_APPROVALS (masalan 2 ta) turli idoralar tasdiqlasa, ariza approved bo'ladi."""
    cursor = db.cursor()
    reviewer_org = current_user.get("org")
    reviewer_id = current_user.get("user_id")

    cursor.execute("SELECT status FROM applications WHERE id = ?", (app_id,))
    app_row = cursor.fetchone()
    if not app_row:
        raise HTTPException(status_code=404, detail="Ariza topilmadi.")
    if app_row["status"] != "pending":
        raise HTTPException(status_code=400, detail="Faqat kutilayotgan ('pending') arizalarni tekshirish mumkin.")

    # Avval qaror berilganmi?
    cursor.execute("SELECT id FROM reviews WHERE application_id = ? AND org = ?", (app_id, reviewer_org))
    if cursor.fetchone():
        raise HTTPException(status_code=400, detail=f"Sizning tashkilotingiz ({reviewer_org}) ushbu arizaga allaqachon xulosa bergan.")

    # Rad etish holati
    if req.decision == "reject":
        if not req.comment or len(req.comment.strip()) < 5:
            raise HTTPException(status_code=400, detail="Rad etish sababi majburiy va kamida 5 ta belgidan iborat bo'lishi kerak.")

        cursor.execute("""
            INSERT INTO reviews (application_id, reviewer_user_id, org, decision, comment)
            VALUES (?, ?, ?, 'reject', ?)
        """, (app_id, reviewer_id, reviewer_org, req.comment))

        cursor.execute("""
            UPDATE applications
            SET status = 'rejected', rejection_reason = ?, updated_at = CURRENT_TIMESTAMP
            WHERE id = ?
        """, (f"{reviewer_org}: {req.comment}", app_id))

        db.commit()
        return {"success": True, "message": "Ariza rad etildi.", "status": "rejected"}

    # Tasdiqlash holati (approve)
    cursor.execute("""
        INSERT INTO reviews (application_id, reviewer_user_id, org, decision, comment)
        VALUES (?, ?, ?, 'approve', ?)
    """, (app_id, reviewer_id, reviewer_org, req.comment))

    # Nechta turli idora tasdiqlaganini sanaymiz
    cursor.execute("""
        SELECT COUNT(DISTINCT org) as approval_count
        FROM reviews
        WHERE application_id = ? AND decision = 'approve'
    """, (app_id,))
    approval_count = cursor.fetchone()["approval_count"]

    new_status = "pending"
    if approval_count >= REQUIRED_APPROVALS:
        new_status = "approved"
        cursor.execute("""
            UPDATE applications
            SET status = 'approved', updated_at = CURRENT_TIMESTAMP
            WHERE id = ?
        """, (app_id,))

    db.commit()

    return {
        "success": True,
        "message": f"Ariza muvaffaqiyatli tasdiqlandi ({approval_count}/{REQUIRED_APPROVALS} ta idora tasdiqladi).",
        "current_approvals": approval_count,
        "required_approvals": REQUIRED_APPROVALS,
        "status": new_status
    }
