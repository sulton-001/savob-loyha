import React, { useState, useEffect } from 'react';

const API_BASE = "/api";

export default function App() {
  // Avtorizatsiya holati
  const [user, setUser] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem("savob_user") || "null");
    } catch {
      return null;
    }
  });
  const [token, setToken] = useState(() => localStorage.getItem("savob_token") || null);

  // Umumiy statistika va arizalar
  const [stats, setStats] = useState({ total_donated: 0, helped_families: 0, approved_applications: 0 });
  const [applications, setApplications] = useState([]);
  const [loadingApps, setLoadingApps] = useState(true);

  // Filtrlash va qidiruv
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");

  // Modallar
  const [selectedApp, setSelectedApp] = useState(null); // Batafsil ko'rish
  const [loadingDetail, setLoadingDetail] = useState(false);

  const [donateApp, setDonateApp] = useState(null); // Xayriya qilish
  const [donateAmount, setDonateAmount] = useState("");
  const [donateDonorName, setDonateDonorName] = useState("");
  const [isAnonymous, setIsAnonymous] = useState(false);
  const [donateComment, setDonateComment] = useState("");
  const [submittingDonate, setSubmittingDonate] = useState(false);

  const [showLoginModal, setShowLoginModal] = useState(false);
  const [loginUsername, setLoginUsername] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  const [submittingLogin, setSubmittingLogin] = useState(false);

  const [showDashboard, setShowDashboard] = useState(false);

  // Dashboard holatlari
  const [adminUsers, setAdminUsers] = useState([]);
  const [newUsername, setNewUsername] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [newRole, setNewRole] = useState("mahalla");
  const [newOrg, setNewOrg] = useState("");
  const [newFullName, setNewFullName] = useState("");

  const [mahallaApps, setMahallaApps] = useState([]);
  const [appTitle, setAppTitle] = useState("");
  const [appCitizen, setAppCitizen] = useState("");
  const [appPinfl, setAppPinfl] = useState("");
  const [appCategory, setAppCategory] = useState("Davolanish");
  const [appTarget, setAppTarget] = useState("");
  const [appAddress, setAppAddress] = useState("");
  const [appDesc, setAppDesc] = useState("");

  const [reviewerQueue, setReviewerQueue] = useState([]);
  const [reviewComments, setReviewComments] = useState({});

  // Toast bildirishnoma
  const [toast, setToast] = useState({ message: "", isError: false });

  const showToast = (message, isError = false) => {
    setToast({ message, isError });
    setTimeout(() => setToast({ message: "", isError: false }), 3500);
  };

  const formatMoney = (amount) => {
    return Number(amount || 0).toLocaleString("uz-UZ") + " so'm";
  };

  // Dastlabki yuklash
  useEffect(() => {
    loadStats();
    loadApplications();
  }, []);

  const loadStats = async () => {
    try {
      const res = await fetch(`${API_BASE}/stats`);
      if (res.ok) {
        const data = await res.json();
        setStats(data);
      }
    } catch (e) {
      console.error("Statistika yuklanmadi", e);
    }
  };

  const loadApplications = async () => {
    setLoadingApps(true);
    try {
      const res = await fetch(`${API_BASE}/applications`);
      if (res.ok) {
        const data = await res.json();
        setApplications(data);
      }
    } catch (e) {
      console.error("Arizalar yuklanmadi", e);
    } finally {
      setLoadingApps(false);
    }
  };

  // Ariza tafsilotlarini yuklash
  const openAppDetail = async (appId) => {
    setLoadingDetail(true);
    setSelectedApp({ title: "Yuklanmoqda..." });
    try {
      const res = await fetch(`${API_BASE}/applications/${appId}`);
      if (res.ok) {
        const data = await res.json();
        setSelectedApp(data);
      } else {
        showToast("Ariza tafsilotlari topilmadi", true);
        setSelectedApp(null);
      }
    } catch {
      showToast("Tafsilotlarni yuklashda xatolik", true);
      setSelectedApp(null);
    } finally {
      setLoadingDetail(false);
    }
  };

  // Xayriya qilish
  const openDonate = (app) => {
    setDonateApp(app);
    setDonateAmount("");
    setDonateDonorName("");
    setIsAnonymous(false);
    setDonateComment("");
  };

  const submitDonation = async (e) => {
    e.preventDefault();
    const amountNum = parseInt(donateAmount, 10);
    if (!amountNum || amountNum < 1000) {
      showToast("Minimal xayriya summasi 1 000 so'm", true);
      return;
    }

    setSubmittingDonate(true);
    try {
      const res = await fetch(`${API_BASE}/applications/${donateApp.id}/donate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          amount: amountNum,
          donor_name: isAnonymous ? "Anonim" : (donateDonorName.trim() || "Anonim"),
          comment: donateComment.trim() || null
        })
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "Xayriya qabul qilinmadi");

      showToast(data.message || "Xayriyangiz uchun tashakkur!");
      setDonateApp(null);
      loadStats();
      loadApplications();
      if (selectedApp && selectedApp.id === donateApp.id) {
        openAppDetail(donateApp.id);
      }
    } catch (err) {
      showToast(err.message, true);
    } finally {
      setSubmittingDonate(false);
    }
  };

  // Login & Chiqish
  const handleLogin = async (e) => {
    e.preventDefault();
    setSubmittingLogin(true);
    try {
      const res = await fetch(`${API_BASE}/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: loginUsername.trim(), password: loginPassword.trim() })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "Kirishda xatolik");

      setUser(data.user);
      setToken(data.access_token);
      localStorage.setItem("savob_user", JSON.stringify(data.user));
      localStorage.setItem("savob_token", data.access_token);

      setShowLoginModal(false);
      showToast(`Xush kelibsiz, ${data.user.full_name}!`);
      openDashboard();
    } catch (err) {
      showToast(err.message, true);
    } finally {
      setSubmittingLogin(false);
    }
  };

  const handleLogout = () => {
    setUser(null);
    setToken(null);
    localStorage.removeItem("savob_user");
    localStorage.removeItem("savob_token");
    setShowDashboard(false);
    showToast("Tizimdan chiqildi.");
  };

  // Dashboard ochilganda tegishli ma'lumotlarni yuklash
  const openDashboard = () => {
    if (!user) {
      setShowLoginModal(true);
      return;
    }
    setShowDashboard(true);
    if (user.role === "admin") loadAdminUsers();
    if (user.role === "mahalla") loadMahallaApps();
    if (user.role === "reviewer") loadReviewerQueue();
  };

  const loadAdminUsers = async () => {
    try {
      const res = await fetch(`${API_BASE}/admin/users`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) setAdminUsers(await res.json());
    } catch (e) {
      console.error(e);
    }
  };

  const submitCreateUser = async (e) => {
    e.preventDefault();
    try {
      const res = await fetch(`${API_BASE}/admin/users`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          username: newUsername.trim(),
          password: newPassword.trim(),
          role: newRole,
          org: newOrg.trim(),
          full_name: newFullName.trim()
        })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail);

      showToast("Yangi foydalanuvchi muvaffaqiyatli yaratildi!");
      setNewUsername("");
      setNewPassword("");
      setNewOrg("");
      setNewFullName("");
      loadAdminUsers();
    } catch (err) {
      showToast(err.message, true);
    }
  };

  const loadMahallaApps = async () => {
    try {
      const res = await fetch(`${API_BASE}/my/applications`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) setMahallaApps(await res.json());
    } catch (e) {
      console.error(e);
    }
  };

  const submitMahallaApp = async (e) => {
    e.preventDefault();
    try {
      const res = await fetch(`${API_BASE}/applications`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          title: appTitle.trim(),
          citizen_name: appCitizen.trim(),
          citizen_pinfl: appPinfl.trim(),
          category: appCategory,
          target_amount: parseInt(appTarget, 10),
          address: appAddress.trim(),
          description: appDesc.trim()
        })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail);

      showToast("Ariza tekshiruv navbatiga muvaffaqiyatli topshirildi!");
      setAppTitle("");
      setAppCitizen("");
      setAppPinfl("");
      setAppTarget("");
      setAppAddress("");
      setAppDesc("");
      loadMahallaApps();
    } catch (err) {
      showToast(err.message, true);
    }
  };

  const loadReviewerQueue = async () => {
    try {
      const res = await fetch(`${API_BASE}/review/queue`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) setReviewerQueue(await res.json());
    } catch (e) {
      console.error(e);
    }
  };

  const handleReview = async (appId, decision) => {
    const comment = (reviewComments[appId] || "").trim();
    if (decision === "reject" && (!comment || comment.length < 5)) {
      showToast("Rad etish uchun batafsil sabab kiritish shart (kamida 5 belgi)!", true);
      return;
    }
    if (decision === "approve" && !comment) {
      showToast("Tasdiqlash xulosasini kiriting!", true);
      return;
    }

    try {
      const res = await fetch(`${API_BASE}/review/${appId}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ decision, comment })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail);

      showToast(data.message);
      loadReviewerQueue();
      loadStats();
      loadApplications();
    } catch (err) {
      showToast(err.message, true);
    }
  };

  // Filtrlangan arizalar
  const filteredApps = applications.filter((app) => {
    const matchCat = categoryFilter === "all" || app.category.toLowerCase() === categoryFilter.toLowerCase();
    const q = searchQuery.toLowerCase().trim();
    const matchSearch =
      !q ||
      app.title.toLowerCase().includes(q) ||
      app.citizen_name.toLowerCase().includes(q) ||
      app.description.toLowerCase().includes(q) ||
      (app.mahalla_org && app.mahalla_org.toLowerCase().includes(q));
    return matchCat && matchSearch;
  });

  return (
    <>
      {/* ---------------- Navbar ---------------- */}
      <header className="navbar">
        <div className="container nav-inner">
          <div className="brand" onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}>
            <div className="brand-icon">☪</div>
            <div className="brand-text">
              <h1>Savob yo'li</h1>
              <p>Shaffof xayriya platformasi</p>
            </div>
          </div>

          <div className="nav-actions">
            <span className="badge-demo">Demo rejim</span>
            {user ? (
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <button className="btn btn-teal" onClick={openDashboard}>
                  👤 {user.full_name} ({user.role === "admin" ? "Admin" : user.role === "mahalla" ? "Mahalla" : "Idora"})
                </button>
                <button className="btn btn-ghost" onClick={handleLogout} title="Chiqish">
                  Chiqish
                </button>
              </div>
            ) : (
              <button className="btn btn-outline" onClick={() => setShowLoginModal(true)}>
                Kirish
              </button>
            )}
          </div>
        </div>
      </header>

      {/* ---------------- Hero Section ---------------- */}
      <section className="hero-section">
        <div className="container">
          <div className="hero-pill">✓ Davlat idoralari va Mahalla kafolatida</div>
          <h2 className="hero-title">
            Har bir tiyin ochiq va shaffof: <span>Vositachisiz</span>, to'g'ridan-to'g'ri ko'mak
          </h2>
          <p className="hero-subtitle">
            Mahalla ehtiyojmand fuqaro nomidan ariza beradi. Davlat idoralari (Ijtimoiy himoya, Soliq) mustaqil tekshirib tasdiqlagach, xayriyalar vositachilarsiz 100% to'g'ridan-to'g'ri yetkaziladi.
          </p>
          <div className="hero-cta">
            <button
              className="btn btn-primary"
              onClick={() => document.getElementById("catalogSection")?.scrollIntoView({ behavior: "smooth" })}
            >
              Arizalarni ko'rish va xayriya qilish
            </button>
            <button className="btn btn-outline" onClick={() => setShowLoginModal(true)}>
              Mansabdorlar kirishi (Mahalla / Idora)
            </button>
          </div>
        </div>
      </section>

      {/* ---------------- 3 ta Jonli Statistika ---------------- */}
      <section className="stats-section">
        <div className="container">
          <div className="stats-grid">
            <div className="stat-card">
              <div className="stat-icon green">💰</div>
              <div className="stat-info">
                <h3>{formatMoney(stats.total_donated)}</h3>
                <p>Jami to'plangan xayriya</p>
              </div>
            </div>
            <div className="stat-card">
              <div className="stat-icon teal">👨‍👩‍👧‍👦</div>
              <div className="stat-info">
                <h3>{stats.helped_families} ta</h3>
                <p>Ko'mak olgan oilalar</p>
              </div>
            </div>
            <div className="stat-card">
              <div className="stat-icon orange">🛡️</div>
              <div className="stat-info">
                <h3>{stats.approved_applications} ta</h3>
                <p>Tasdiqlangan arizalar</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ---------------- Platforma Qanday Ishlaydi? ---------------- */}
      <section className="workflow-section">
        <div className="container">
          <div className="section-header">
            <h2>Shaffoflik qanday ta'minlanadi?</h2>
            <p>Firibgarlik va vositachilar ulushiga to'liq chek qo'yuvchi 4 bosqichli tizim</p>
          </div>
          <div className="flow-steps">
            <div className="flow-card">
              <div className="flow-num">1</div>
              <h4>Mahalla arizasi</h4>
              <p>Mahalla fuqarolar yig'ini (MFY) ehtiyojmand oilani o'rganib, uning nomidan rasmiy ariza kiritadi.</p>
            </div>
            <div className="flow-card">
              <div className="flow-num">2</div>
              <h4>Ko'p bosqichli tekshiruv</h4>
              <p>Kamida 2 ta mustaqil davlat idorasi (Ijtimoiy himoya, Soliq) moliyaviy va tibbiy holatni tekshirib tasdiqlaydi.</p>
            </div>
            <div className="flow-card">
              <div className="flow-num">3</div>
              <h4>Ommaviy e'lon</h4>
              <p>Faqat tekshiruvdan o'tgan arizalar saytda chiqadi. Har bir tasdiqlovchi idora ochiq ko'rsatiladi.</p>
            </div>
            <div className="flow-card">
              <div className="flow-num">4</div>
              <h4>Vositachisiz yordam</h4>
              <p>Donorlar ro'yxatdan o'tmasdan to'g'ridan-to'g'ri yuboradi. Har bir so'm shaffof daftarda aks etadi.</p>
            </div>
          </div>
        </div>
      </section>

      {/* ---------------- Arizalar Katalogi (Ommaviy sahifa) ---------------- */}
      <section className="catalog-section" id="catalogSection">
        <div className="container">
          <div className="section-header" style={{ textAlign: "left", marginBottom: 20 }}>
            <h2>Tasdiqlangan arizalar</h2>
            <p>Davlat idoralari tomonidan tekshirilib, yordamga muhtojligi tasdiqlangan holatlar</p>
          </div>

          {/* Filter va Qidiruv */}
          <div className="filter-bar">
            <div className="filter-tabs">
              {["all", "Davolanish", "Reabilitatsiya", "Operatsiya"].map((cat) => (
                <button
                  key={cat}
                  className={`filter-btn ${categoryFilter === cat ? "active" : ""}`}
                  onClick={() => setCategoryFilter(cat)}
                >
                  {cat === "all" ? "Barchasi" : cat}
                </button>
              ))}
            </div>
            <div className="search-box">
              <span style={{ marginRight: 6 }}>🔍</span>
              <input
                type="text"
                placeholder="Ariza yoki fuqaroni qidirish..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
          </div>

          {/* Arizalar ro'yxati */}
          {loadingApps ? (
            <div style={{ textAlign: "center", padding: 50, color: "var(--text-muted)" }}>
              Arizalar yuklanmoqda...
            </div>
          ) : filteredApps.length === 0 ? (
            <div style={{ textAlign: "center", padding: 60, background: "#fff", borderRadius: "var(--radius)", border: "1px dashed var(--border-color)" }}>
              <p style={{ fontSize: 16, color: "var(--text-muted)" }}>Hech qanday ariza topilmadi.</p>
            </div>
          ) : (
            <div className="apps-grid">
              {filteredApps.map((app) => {
                const percent = Math.min(100, Math.round((app.collected_amount / app.target_amount) * 100));
                return (
                  <div className="app-card" key={app.id}>
                    <div className="card-top">
                      <span className="card-category">{app.category}</span>
                      <h3 className="card-title">{app.title}</h3>
                      <div className="card-mahalla">
                        <span>🏛️ Mahalla kafili:</span> <strong>{app.mahalla_org}</strong>
                      </div>
                    </div>

                    <div className="card-body">
                      <p className="card-desc">{app.description}</p>

                      <div className="approvals-section">
                        <h5>Tekshirib tasdiqlagan idoralar:</h5>
                        <div className="approval-badges">
                          {app.approved_by && app.approved_by.length > 0 ? (
                            app.approved_by.map((org, idx) => (
                              <span className="badge-org" key={idx}>✓ {org}</span>
                            ))
                          ) : (
                            <span style={{ fontSize: 11, color: "var(--text-muted)" }}>Tekshiruv ma'lumoti</span>
                          )}
                        </div>
                      </div>

                      <div className="progress-box">
                        <div className="progress-stats">
                          <span className="collected">{formatMoney(app.collected_amount)}</span>
                          <span className="target">Kerak: {formatMoney(app.target_amount)}</span>
                        </div>
                        <div className="progress-bar-bg">
                          <div className="progress-bar-fill" style={{ width: `${percent}%` }}></div>
                        </div>
                        <div className="progress-footer">
                          <span>{percent}% yig'ildi</span>
                          <span>{app.donor_count || 0} ta xayriya</span>
                        </div>
                      </div>
                    </div>

                    <div className="card-actions">
                      <button className="btn btn-outline" onClick={() => openAppDetail(app.id)}>
                        Batafsil
                      </button>
                      <button className="btn btn-primary" onClick={() => openDonate(app)}>
                        Xayriya qilish
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </section>

      {/* ---------------- Modal: Ariza Batafsil & Shaffof Daftar ---------------- */}
      {selectedApp && (
        <div className="modal-backdrop">
          <div className="modal-window large">
            <div className="modal-header">
              <h3>{selectedApp.title}</h3>
              <button className="btn-close" onClick={() => setSelectedApp(null)}>&times;</button>
            </div>
            <div className="modal-content">
              {loadingDetail ? (
                <p>Yuklanmoqda...</p>
              ) : (
                <>
                  <div style={{ marginBottom: 16 }}>
                    <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
                      <span className="card-category">{selectedApp.category}</span>
                      <span style={{ fontSize: 12, color: "var(--text-muted)" }}>
                        Fuqaro: <strong>{selectedApp.citizen_name}</strong>
                      </span>
                    </div>
                    <p style={{ fontSize: 14, lineHeight: 1.6, marginBottom: 12 }}>{selectedApp.description}</p>
                    <div style={{ fontSize: 12, color: "var(--text-muted)" }}>📍 Manzil: {selectedApp.address}</div>
                    <div style={{ fontSize: 12, color: "var(--text-muted)" }}>
                      🏛️ Kafillik beruvchi MFY: <strong>{selectedApp.mahalla_org}</strong>
                    </div>
                  </div>

                  <div style={{ background: "#fafbfa", padding: 14, borderRadius: 10, border: "1px solid var(--border-color)", marginBottom: 18 }}>
                    <div className="progress-stats">
                      <span className="collected">{formatMoney(selectedApp.collected_amount)}</span>
                      <span className="target">
                        Reja: {formatMoney(selectedApp.target_amount)} (
                        {Math.min(100, Math.round((selectedApp.collected_amount / selectedApp.target_amount) * 100))}%)
                      </span>
                    </div>
                    <div className="progress-bar-bg" style={{ marginTop: 6 }}>
                      <div
                        className="progress-bar-fill"
                        style={{
                          width: `${Math.min(100, Math.round((selectedApp.collected_amount / selectedApp.target_amount) * 100))}%`
                        }}
                      ></div>
                    </div>
                  </div>

                  <div style={{ marginBottom: 18 }}>
                    <h4 style={{ fontSize: 14, fontWeight: 700, color: "var(--dark-green)", marginBottom: 10 }}>
                      🛡️ Rasmiy davlat idoralari xulosalari:
                    </h4>
                    {selectedApp.approvals && selectedApp.approvals.length > 0 ? (
                      selectedApp.approvals.map((a, i) => (
                        <div
                          key={i}
                          style={{
                            background: "var(--primary-light)",
                            padding: 12,
                            borderRadius: 8,
                            marginBottom: 8,
                            borderLeft: "4px solid var(--primary)"
                          }}
                        >
                          <div style={{ fontWeight: 700, color: "var(--dark-green)", fontSize: 13 }}>✓ {a.org}</div>
                          <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 4 }}>"{a.comment}"</div>
                        </div>
                      ))
                    ) : (
                      <p style={{ fontSize: 12, color: "var(--text-muted)" }}>Xulosalar mavjud emas</p>
                    )}
                  </div>

                  <div className="donations-ledger">
                    <h4 style={{ fontSize: 14, fontWeight: 700, color: "var(--dark-green)" }}>
                      📖 Shaffof xayriyalar daftari (Har bir to'lov):
                    </h4>
                    <div className="ledger-list">
                      {selectedApp.donations && selectedApp.donations.length > 0 ? (
                        selectedApp.donations.map((d) => (
                          <div className="ledger-item" key={d.id}>
                            <div>
                              <div className="ledger-donor">{d.donor_name}</div>
                              <div className="ledger-time">
                                {new Date(d.created_at).toLocaleString("uz-UZ")} {d.comment ? `— "${d.comment}"` : ""}
                              </div>
                            </div>
                            <div className="ledger-amount">+ {formatMoney(d.amount)}</div>
                          </div>
                        ))
                      ) : (
                        <p style={{ fontSize: 12, color: "var(--text-muted)", padding: "10px 0" }}>
                          Hozircha xayriyalar tushmagan. Birinchi bo'lib ko'mak bering!
                        </p>
                      )}
                    </div>
                  </div>
                </>
              )}
            </div>
            <div className="modal-footer">
              <button className="btn btn-ghost" onClick={() => setSelectedApp(null)}>Yopish</button>
              <button
                className="btn btn-primary"
                onClick={() => {
                  const target = selectedApp;
                  setSelectedApp(null);
                  openDonate(target);
                }}
              >
                Ushbu arizaga xayriya qilish
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ---------------- Modal: Xayriya Qilish ---------------- */}
      {donateApp && (
        <div className="modal-backdrop">
          <div className="modal-window">
            <div className="modal-header">
              <h3>Savobli xayriya qilish</h3>
              <button className="btn-close" onClick={() => setDonateApp(null)}>&times;</button>
            </div>
            <div className="modal-content">
              <p style={{ fontSize: 14, color: "var(--text-muted)", marginBottom: 18 }}>
                Ariza: <strong>{donateApp.title}</strong>
              </p>

              <form onSubmit={submitDonation}>
                <div className="form-group">
                  <label>Xayriya summasi (so'm)</label>
                  <input
                    type="number"
                    className="form-control"
                    min="1000"
                    step="1000"
                    placeholder="Minimal 1 000 so'm"
                    value={donateAmount}
                    onChange={(e) => setDonateAmount(e.target.value)}
                    required
                  />
                  <div className="quick-amounts">
                    {[10000, 50000, 100000, 500000].map((amt) => (
                      <button
                        type="button"
                        key={amt}
                        className={`quick-amt-btn ${parseInt(donateAmount, 10) === amt ? "selected" : ""}`}
                        onClick={() => setDonateAmount(amt.toString())}
                      >
                        {Number(amt).toLocaleString("uz-UZ")}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="form-group">
                  <label>Ismingiz</label>
                  <input
                    type="text"
                    className="form-control"
                    placeholder="Ismingizni kiriting"
                    disabled={isAnonymous}
                    value={isAnonymous ? "Anonim" : donateDonorName}
                    onChange={(e) => setDonateDonorName(e.target.value)}
                  />
                  <label style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 8, fontWeight: "normal", cursor: "pointer" }}>
                    <input
                      type="checkbox"
                      checked={isAnonymous}
                      onChange={(e) => setIsAnonymous(e.target.checked)}
                    />
                    <span>Anonim qolishni istayman (ism ko'rsatilmaydi)</span>
                  </label>
                </div>

                <div className="form-group">
                  <label>Ezgu tilak yoki izoh (ixtiyoriy)</label>
                  <input
                    type="text"
                    className="form-control"
                    placeholder="Masalan: Tezroq shifo topsin!"
                    value={donateComment}
                    onChange={(e) => setDonateComment(e.target.value)}
                  />
                </div>

                <div style={{ background: "var(--primary-light)", padding: 12, borderRadius: 8, fontSize: 12, color: "var(--dark-green)", marginBottom: 12 }}>
                  🛡️ <strong>Shaffoflik kafolati:</strong> Mablag'ingiz vositachilarsiz qabul qilinadi va darhol shaffof xayriyalar ro'yxatida ko'rinadi.
                </div>

                <div style={{ display: "flex", justifyContent: "flex-end", gap: 10 }}>
                  <button type="button" className="btn btn-ghost" onClick={() => setDonateApp(null)}>
                    Bekor qilish
                  </button>
                  <button type="submit" className="btn btn-primary" disabled={submittingDonate}>
                    {submittingDonate ? "Amalga oshirilmoqda..." : "Xayriyani tasdiqlash"}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* ---------------- Modal: Tizimga Kirish (Login) ---------------- */}
      {showLoginModal && (
        <div className="modal-backdrop">
          <div className="modal-window">
            <div className="modal-header">
              <h3>Mansabdorlar kirishi</h3>
              <button className="btn-close" onClick={() => setShowLoginModal(false)}>&times;</button>
            </div>
            <div className="modal-content">
              <p style={{ fontSize: 13, color: "var(--text-muted)", marginBottom: 16 }}>
                Mahalla xodimlari, tekshiruvchi davlat idoralari va ma'muriyat uchun xizmat maydoni.
              </p>

              {/* Demo tezkor to'ldirish tugmalari */}
              <div style={{ background: "#fdfaf0", border: "1px dashed var(--warning)", padding: 12, borderRadius: 8, marginBottom: 16 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: "var(--warning)", textTransform: "uppercase", marginBottom: 6 }}>
                  ⚡ Demo hisoblar (1 bosishda to'ldirish):
                </div>
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                  <button
                    type="button"
                    className="btn btn-ghost"
                    style={{ fontSize: 11, padding: "4px 8px", background: "#fff" }}
                    onClick={() => { setLoginUsername("admin"); setLoginPassword("admin12345"); }}
                  >
                    Admin
                  </button>
                  <button
                    type="button"
                    className="btn btn-ghost"
                    style={{ fontSize: 11, padding: "4px 8px", background: "#fff" }}
                    onClick={() => { setLoginUsername("mahalla_chilonzor"); setLoginPassword("demo12345"); }}
                  >
                    Mahalla
                  </button>
                  <button
                    type="button"
                    className="btn btn-ghost"
                    style={{ fontSize: 11, padding: "4px 8px", background: "#fff" }}
                    onClick={() => { setLoginUsername("rev_ijtimoiy"); setLoginPassword("demo12345"); }}
                  >
                    Ijtimoiy himoya
                  </button>
                  <button
                    type="button"
                    className="btn btn-ghost"
                    style={{ fontSize: 11, padding: "4px 8px", background: "#fff" }}
                    onClick={() => { setLoginUsername("rev_soliq"); setLoginPassword("demo12345"); }}
                  >
                    Soliq qo'mitasi
                  </button>
                </div>
              </div>

              <form onSubmit={handleLogin}>
                <div className="form-group">
                  <label>Foydalanuvchi nomi (Login)</label>
                  <input
                    type="text"
                    className="form-control"
                    required
                    placeholder="Loginni kiriting"
                    value={loginUsername}
                    onChange={(e) => setLoginUsername(e.target.value)}
                  />
                </div>
                <div className="form-group">
                  <label>Parol</label>
                  <input
                    type="password"
                    className="form-control"
                    required
                    placeholder="Parolni kiriting"
                    value={loginPassword}
                    onChange={(e) => setLoginPassword(e.target.value)}
                  />
                </div>
                <div style={{ display: "flex", justifyContent: "flex-end", gap: 10 }}>
                  <button type="button" className="btn btn-ghost" onClick={() => setShowLoginModal(false)}>
                    Bekor qilish
                  </button>
                  <button type="submit" className="btn btn-primary" disabled={submittingLogin}>
                    {submittingLogin ? "Kirilmoqda..." : "Kirish"}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* ---------------- Modal: Shaxsiy Kabinet / Boshqaruv Paneli ---------------- */}
      {showDashboard && user && (
        <div className="modal-backdrop">
          <div className="modal-window large">
            <div className="modal-header">
              <div>
                <h3>Boshqaruv paneli — {user.full_name}</h3>
                <p style={{ fontSize: 12, color: "var(--teal-accent)", fontWeight: 600 }}>
                  {user.org} ({user.role.toUpperCase()})
                </p>
              </div>
              <button className="btn-close" onClick={() => setShowDashboard(false)}>&times;</button>
            </div>

            <div className="modal-content">
              {/* ADMIN PANEL */}
              {user.role === "admin" && (
                <div>
                  <div style={{ background: "var(--bg-page)", padding: 18, borderRadius: "var(--radius)", marginBottom: 24, border: "1px solid var(--border-color)" }}>
                    <h4 style={{ marginBottom: 12, color: "var(--dark-green)" }}>
                      ➕ Yangi hisob yaratish (Mahalla yoki Tekshiruvchi idora)
                    </h4>
                    <form onSubmit={submitCreateUser}>
                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 12 }}>
                        <div>
                          <label style={{ fontSize: 12, fontWeight: 700 }}>Login</label>
                          <input
                            type="text"
                            className="form-control"
                            required
                            placeholder="masalan: mahalla_yunusobod"
                            value={newUsername}
                            onChange={(e) => setNewUsername(e.target.value)}
                          />
                        </div>
                        <div>
                          <label style={{ fontSize: 12, fontWeight: 700 }}>Parol (kamida 6 belgi)</label>
                          <input
                            type="password"
                            className="form-control"
                            required
                            minLength={6}
                            placeholder="Parol"
                            value={newPassword}
                            onChange={(e) => setNewPassword(e.target.value)}
                          />
                        </div>
                      </div>

                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 12 }}>
                        <div>
                          <label style={{ fontSize: 12, fontWeight: 700 }}>Rol</label>
                          <select
                            className="form-control"
                            value={newRole}
                            onChange={(e) => setNewRole(e.target.value)}
                          >
                            <option value="mahalla">Mahalla (MFY)</option>
                            <option value="reviewer">Tekshiruvchi davlat idorasi</option>
                          </select>
                        </div>
                        <div>
                          <label style={{ fontSize: 12, fontWeight: 700 }}>Tashkilot nomi</label>
                          <input
                            type="text"
                            className="form-control"
                            required
                            placeholder="Masalan: Yunusobod 3-mavze MFY"
                            value={newOrg}
                            onChange={(e) => setNewOrg(e.target.value)}
                          />
                        </div>
                      </div>

                      <div style={{ marginBottom: 14 }}>
                        <label style={{ fontSize: 12, fontWeight: 700 }}>Mas'ul shaxs F.I.Sh</label>
                        <input
                          type="text"
                          className="form-control"
                          required
                          placeholder="Masalan: Abdullayev Tohir"
                          value={newFullName}
                          onChange={(e) => setNewFullName(e.target.value)}
                        />
                      </div>

                      <button type="submit" className="btn btn-primary">Hisobni yaratish</button>
                    </form>
                  </div>

                  <h4 style={{ marginBottom: 10, color: "var(--dark-green)" }}>📋 Tizimdagi mavjud hisoblar</h4>
                  <div className="table-container">
                    <table className="data-table">
                      <thead>
                        <tr>
                          <th>ID</th>
                          <th>Login</th>
                          <th>Rol</th>
                          <th>Tashkilot</th>
                          <th>F.I.Sh</th>
                        </tr>
                      </thead>
                      <tbody>
                        {adminUsers.map((u) => (
                          <tr key={u.id}>
                            <td>#{u.id}</td>
                            <td><strong>{u.username}</strong></td>
                            <td><span className="status-badge status-approved">{u.role}</span></td>
                            <td>{u.org}</td>
                            <td>{u.full_name}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* MAHALLA PANEL */}
              {user.role === "mahalla" && (
                <div>
                  <div style={{ background: "var(--bg-page)", padding: 18, borderRadius: "var(--radius)", marginBottom: 24, border: "1px solid var(--border-color)" }}>
                    <h4 style={{ marginBottom: 12, color: "var(--dark-green)" }}>
                      📝 Yangi ariza yuborish (Ehtiyojmand fuqaro nomidan)
                    </h4>
                    <form onSubmit={submitMahallaApp}>
                      <div style={{ marginBottom: 12 }}>
                        <label style={{ fontSize: 12, fontWeight: 700 }}>Ariza sarlavhasi</label>
                        <input
                          type="text"
                          className="form-control"
                          required
                          placeholder="Masalan: Shoshilinch operatsiya uchun moddiy ko'mak"
                          value={appTitle}
                          onChange={(e) => setAppTitle(e.target.value)}
                        />
                      </div>

                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 12 }}>
                        <div>
                          <label style={{ fontSize: 12, fontWeight: 700 }}>Fuqaro F.I.Sh</label>
                          <input
                            type="text"
                            className="form-control"
                            required
                            placeholder="Fuqaro ismi"
                            value={appCitizen}
                            onChange={(e) => setAppCitizen(e.target.value)}
                          />
                        </div>
                        <div>
                          <label style={{ fontSize: 12, fontWeight: 700 }}>JShShIR (PINFL - 14 ta raqam)</label>
                          <input
                            type="text"
                            className="form-control"
                            required
                            minLength={14}
                            maxLength={14}
                            placeholder="51234567890123"
                            value={appPinfl}
                            onChange={(e) => setAppPinfl(e.target.value)}
                          />
                        </div>
                      </div>

                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 12 }}>
                        <div>
                          <label style={{ fontSize: 12, fontWeight: 700 }}>Toifa</label>
                          <select
                            className="form-control"
                            value={appCategory}
                            onChange={(e) => setAppCategory(e.target.value)}
                          >
                            <option value="Davolanish">Davolanish</option>
                            <option value="Operatsiya">Operatsiya</option>
                            <option value="Reabilitatsiya">Reabilitatsiya</option>
                            <option value="Uy-joy">Uy-joy ta'miri</option>
                            <option value="Ta'lim">Ta'lim</option>
                          </select>
                        </div>
                        <div>
                          <label style={{ fontSize: 12, fontWeight: 700 }}>Kerakli summa (so'm)</label>
                          <input
                            type="number"
                            className="form-control"
                            required
                            min="100000"
                            step="50000"
                            placeholder="10 000 000"
                            value={appTarget}
                            onChange={(e) => setAppTarget(e.target.value)}
                          />
                        </div>
                      </div>

                      <div style={{ marginBottom: 12 }}>
                        <label style={{ fontSize: 12, fontWeight: 700 }}>Yashash manzili</label>
                        <input
                          type="text"
                          className="form-control"
                          required
                          placeholder="Tuman, mavze, ko'cha, xonadon"
                          value={appAddress}
                          onChange={(e) => setAppAddress(e.target.value)}
                        />
                      </div>

                      <div style={{ marginBottom: 14 }}>
                        <label style={{ fontSize: 12, fontWeight: 700 }}>Muammo va holat tavsifi</label>
                        <textarea
                          className="form-control"
                          required
                          placeholder="Oilaning moddiy ahvoli, tibbiy xulosa va ehtiyoj sabablari haqida to'liq yozing..."
                          value={appDesc}
                          onChange={(e) => setAppDesc(e.target.value)}
                        />
                      </div>

                      <button type="submit" className="btn btn-primary">Arizani tekshiruvga topshirish</button>
                    </form>
                  </div>

                  <h4 style={{ marginBottom: 10, color: "var(--dark-green)" }}>📋 Mahalla tomonidan yuborilgan arizalar</h4>
                  <div className="table-container">
                    {mahallaApps.length === 0 ? (
                      <p style={{ padding: 15, color: "var(--text-muted)" }}>Siz hali ariza yubormagansiz.</p>
                    ) : (
                      <table className="data-table">
                        <thead>
                          <tr>
                            <th>ID</th>
                            <th>Sarlavha</th>
                            <th>Fuqaro</th>
                            <th>Kerakli summa</th>
                            <th>Holat</th>
                            <th>Tasdiqlar</th>
                            <th>Yig'ildi</th>
                          </tr>
                        </thead>
                        <tbody>
                          {mahallaApps.map((a) => {
                            let statusClass = "status-pending";
                            let statusText = "Kutilmoqda";
                            if (a.status === "approved") { statusClass = "status-approved"; statusText = "Tasdiqlandi"; }
                            if (a.status === "rejected") { statusClass = "status-rejected"; statusText = "Rad etildi"; }

                            return (
                              <tr key={a.id}>
                                <td>#{a.id}</td>
                                <td><strong>{a.title}</strong></td>
                                <td>{a.citizen_name}</td>
                                <td>{formatMoney(a.target_amount)}</td>
                                <td>
                                  <span className={`status-badge ${statusClass}`}>{statusText}</span>
                                  {a.rejection_reason && (
                                    <div style={{ fontSize: 11, color: "var(--danger)", marginTop: 4 }}>
                                      Sabab: {a.rejection_reason}
                                    </div>
                                  )}
                                </td>
                                <td><strong>{a.approval_count || 0}/2</strong> idora</td>
                                <td style={{ color: "var(--primary)", fontWeight: 700 }}>{formatMoney(a.collected_amount)}</td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    )}
                  </div>
                </div>
              )}

              {/* REVIEWER PANEL */}
              {user.role === "reviewer" && (
                <div>
                  <div style={{ background: "var(--teal-light)", padding: "14px 18px", borderRadius: "var(--radius)", marginBottom: 20, fontSize: 13, color: "var(--teal-accent)" }}>
                    🔍 <strong>Idora tekshiruvi:</strong> Sizning tashkilotingiz <strong>{user.org}</strong> nomidan arizalarning haqqoniyligini tekshirasiz. Kamida 2 ta mustaqil idora tasdiqlagan ariza ommaviy sahifaga chiqadi.
                  </div>

                  <h4 style={{ marginBottom: 12, color: "var(--dark-green)" }}>⏳ Ko'rib chiqish navbatidagi arizalar</h4>
                  {reviewerQueue.length === 0 ? (
                    <div style={{ padding: 40, textAlign: "center", background: "var(--bg-page)", borderRadius: "var(--radius)", border: "1px dashed var(--border-color)" }}>
                      <p style={{ color: "var(--text-muted)", fontSize: 14 }}>
                        🎉 Navbatda tekshirilmagan yangi arizalar yo'q. Barcha arizalar ko'rib chiqilgan!
                      </p>
                    </div>
                  ) : (
                    <div>
                      {reviewerQueue.map((a) => (
                        <div
                          key={a.id}
                          style={{
                            background: "#fff",
                            border: "1.5px solid var(--border-color)",
                            borderRadius: "var(--radius)",
                            padding: 20,
                            marginBottom: 16,
                            boxShadow: "var(--shadow-sm)"
                          }}
                        >
                          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 8 }}>
                            <span className="card-category">{a.category}</span>
                            <span className="status-badge status-pending">Hozirgi tasdiqlar: {a.current_approvals}/2</span>
                          </div>
                          <h3 style={{ fontSize: 18, color: "var(--dark-green)", marginBottom: 6 }}>{a.title}</h3>
                          <div style={{ fontSize: 13, color: "var(--text-muted)", marginBottom: 8 }}>
                            Fuqaro: <strong>{a.citizen_name}</strong> (JShShIR: {a.citizen_pinfl}) | MFY: <strong>{a.mahalla_org}</strong>
                          </div>
                          <div style={{ fontSize: 13, color: "var(--text-muted)", marginBottom: 10 }}>
                            Kerakli summa: <strong style={{ color: "var(--primary)", fontSize: 15 }}>{formatMoney(a.target_amount)}</strong> | Manzil: {a.address}
                          </div>
                          <p style={{ fontSize: 13, lineHeight: 1.6, color: "var(--text-main)", background: "#f9fbf9", padding: 12, borderRadius: 8, border: "1px solid #eef3ef", marginBottom: 14 }}>
                            {a.description}
                          </p>

                          <div style={{ borderTop: "1px solid var(--border-color)", paddingTop: 14 }}>
                            <label style={{ fontSize: 12, fontWeight: 700, color: "var(--dark-green)", display: "block", marginBottom: 6 }}>
                              Tashkilot xulosasi va dalillar (izoh):
                            </label>
                            <textarea
                              className="form-control"
                              style={{ minHeight: 60, marginBottom: 12 }}
                              placeholder="Tekshiruv natijasi, ma'lumotlar bazasi xulosasi yoki rad etish sababi..."
                              value={reviewComments[a.id] || ""}
                              onChange={(e) => setReviewComments({ ...reviewComments, [a.id]: e.target.value })}
                            />

                            <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
                              <button className="btn btn-danger" onClick={() => handleReview(a.id, "reject")}>
                                ✕ Rad etish
                              </button>
                              <button className="btn btn-primary" onClick={() => handleReview(a.id, "approve")}>
                                ✓ Tasdiqlash
                              </button>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ---------------- Toast Bildirishnoma ---------------- */}
      <div id="toast" className={toast.message ? "show" : ""} style={{ background: toast.isError ? "var(--danger)" : "var(--dark-green)" }}>
        {toast.message}
      </div>

      {/* ---------------- Footer ---------------- */}
      <footer>
        <div className="container">
          <p style={{ fontWeight: 700, color: "var(--dark-green)", marginBottom: 4 }}>
            "Savob yo'li" Ochiq Xayriya Tizimi — 2026
          </p>
          <p>Shaffoflik, xalq ishonchi va muhtojlarga to'g'ridan-to'g'ri ko'mak platformasi</p>
        </div>
      </footer>
    </>
  );
}
