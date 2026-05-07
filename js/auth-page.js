/**
 * js/auth-page.js
 * ─────────────────────────────────────────────
 * Shopflex — Dedicated auth page logic
 * Handles sign-in, sign-up (2 steps), role
 * selection, password strength, and Supabase.
 */

// ── Supabase client ───────────────────────────
const _sb = supabase.createClient(
  CONFIG.SUPABASE_URL,
  CONFIG.SUPABASE_ANON_KEY
);

// ── State ─────────────────────────────────────
let _role = "client"; // default signup role

// ── Toast ─────────────────────────────────────
function toast(msg, type = "info") {
  const wrap = document.getElementById("toast-wrap");
  const el   = document.createElement("div");
  const icons = { success: "+", error: "−", info: "i" };
  el.className = `toast toast-${type}`;
  el.innerHTML = `<span class="toast-icon">${icons[type]||"i"}</span><span>${msg}</span>`;
  wrap.appendChild(el);
  setTimeout(() => {
    el.style.transition = "opacity 0.3s, transform 0.3s";
    el.style.opacity = "0";
    el.style.transform = "translateY(8px)";
    setTimeout(() => el.remove(), 320);
  }, 3200);
}

// ── Button loading state ──────────────────────
function setLoading(id, on) {
  const btn     = document.getElementById(id);
  const label   = btn?.querySelector(".btn-label");
  const spinner = btn?.querySelector(".btn-spin");
  if (!btn) return;
  btn.disabled         = on;
  if (label)   label.style.opacity   = on ? "0" : "1";
  if (spinner) spinner.style.display = on ? "flex" : "none";
}

// ── Error display ─────────────────────────────
function showErr(msg) {
  const el   = document.getElementById("err-banner");
  const text = document.getElementById("err-text");
  text.textContent = msg;
  el.style.display = "flex";
  el.classList.remove("shake");
  void el.offsetWidth;
  el.classList.add("shake");
}
function clearErr() {
  const el = document.getElementById("err-banner");
  el.style.display = "none";
}

// ── Friendly Supabase errors ──────────────────
function friendly(msg = "") {
  if (msg.includes("Invalid login credentials"))  return "Incorrect email or password. Please try again.";
  if (msg.includes("already registered"))         return "This email is already in use — try signing in.";
  if (msg.includes("not confirmed"))              return "Please verify your email before signing in.";
  if (msg.includes("rate limit"))                 return "Too many attempts. Please wait a moment.";
  if (msg.includes("relation \"profiles\" does not exist")) return "Database not ready. Please run the SQL setup first.";
  return msg || "Something went wrong. Please try again.";
}
// ══ Page controller ═══════════════════════════
const Page = {

  // ── TAB SWITCH ────────────────────────────
  switchTab(tab) {
    clearErr();
    document.getElementById("tab-signin").classList.toggle("active", tab === "signin");
    document.getElementById("tab-signup").classList.toggle("active", tab === "signup");

    const si = document.getElementById("form-signin");
    const su = document.getElementById("form-signup");

    if (tab === "signin") {
      su.style.display = "none";
      si.style.display = "flex";
      si.classList.add("shown");
      document.title = "Shopflex — Sign in";
    } else {
      si.style.display = "none";
      su.style.display = "flex";
      su.classList.add("shown");
      document.title = "Shopflex — Create account";
      this._resetSignup();
    }
  },

  // ── ROLE PICKER ───────────────────────────
  pickRole(role, el) {
    _role = role;
    document.querySelectorAll(".rtile").forEach(t => {
      t.classList.remove("rtile-selected");
      const check = t.querySelector(".rc-check");
      check.style.opacity   = "0";
      check.style.transform = "scale(0)";
    });
    el.classList.add("rtile-selected");
    const check = el.querySelector(".rc-check");
    check.style.opacity   = "1";
    check.style.transform = "scale(1)";
  },

  // ── STEP NAVIGATION ───────────────────────
  nextStep() {
    document.getElementById("su-s1").style.display = "none";
    document.getElementById("su-s2").style.display = "block";
    // Update role pill
    const pill = document.getElementById("role-pill");
    pill.innerHTML = _role === "client"
      ? "🛍️ Shopping account"
      : "🏪 Seller account";
    // Animate step 2 in
    const s2 = document.getElementById("su-s2");
    s2.style.animation = "none";
    void s2.offsetWidth;
    s2.style.animation = "fadeUp 0.35s var(--ease) both";
    // Focus name
    setTimeout(() => document.getElementById("su-name")?.focus(), 60);
  },

  prevStep() {
    document.getElementById("su-s2").style.display = "none";
    document.getElementById("su-s1").style.display = "block";
    clearErr();
  },

  _resetSignup() {
    document.getElementById("su-s1").style.display = "block";
    document.getElementById("su-s2").style.display = "none";
    // Reset role to client
    _role = "client";
    document.querySelectorAll(".rtile").forEach(t => {
      t.classList.remove("rtile-selected");
      const check = t.querySelector(".rc-check");
      check.style.opacity = "0";
      check.style.transform = "scale(0)";
    });
    const clientTile = document.querySelector('.rtile[data-role="client"]');
    if (clientTile) {
      clientTile.classList.add("rtile-selected");
      const check = clientTile.querySelector(".rc-check");
      check.style.opacity = "1";
      check.style.transform = "scale(1)";
    }
    // Clear fields
    ["su-name","su-email","su-pw"].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.value = "";
    });
    this._setStrength("");
  },

  // ── PASSWORD STRENGTH ─────────────────────
  updateStrength(val) {
    this._setStrength(val);
  },

  _setStrength(val) {
    const row   = document.getElementById("strength-row");
    const fill  = document.getElementById("strength-fill");
    const label = document.getElementById("strength-lbl");
    if (!row) return;

    if (!val) {
      row.style.display = "none";
      return;
    }
    row.style.display = "flex";

    let score = 0;
    if (val.length >= 8)              score++;
    if (val.length >= 12)             score++;
    if (/[A-Z]/.test(val))           score++;
    if (/[0-9]/.test(val))           score++;
    if (/[^A-Za-z0-9]/.test(val))    score++;

    const levels = [
      { pct: "20%",  color: "#EF4444", text: "Weak",   txtColor: "#EF4444" },
      { pct: "40%",  color: "#F97316", text: "Fair",   txtColor: "#F97316" },
      { pct: "60%",  color: "#EAB308", text: "Good",   txtColor: "#CA8A04" },
      { pct: "80%",  color: "#22C55E", text: "Strong", txtColor: "#16A34A" },
      { pct: "100%", color: "#16A34A", text: "Great",  txtColor: "#15803D" },
    ];
    const lvl = levels[Math.min(score, 4)];
    fill.style.width      = lvl.pct;
    fill.style.background = lvl.color;
    label.textContent     = lvl.text;
    label.style.color     = lvl.txtColor;
  },

  // ── TOGGLE PASSWORD ────────────────────────
  togglePw(id, btn) {
    const input = document.getElementById(id);
    if (!input) return;
    const show = input.type === "password";
    input.type = show ? "text" : "password";
    btn.querySelector(".ico-show").style.display = show ? "none"  : "block";
    btn.querySelector(".ico-hide").style.display = show ? "block" : "none";
  },

  // ── FORGOT PASSWORD ────────────────────────
  async forgotPassword() {
    const email = document.getElementById("si-email").value.trim();
    if (!email) {
      showErr("Enter your email address first, then click 'Forgot password?'.");
      return;
    }
    try {
      const { error } = await _sb.auth.resetPasswordForEmail(email, {
        redirectTo: window.location.origin + "/auth.html"
      });
      if (error) throw error;
      toast("Password reset email sent! Check your inbox.", "success");
    } catch (err) {
      showErr(friendly(err.message));
    }
  },

  // ── LOGIN ──────────────────────────────────
  async login(e) {
    e.preventDefault();
    clearErr();

    const email = document.getElementById("si-email").value.trim().toLowerCase();
    const pw    = document.getElementById("si-pw").value;

    // Admin shortcut
    if (
      email === CONFIG.ADMIN_EMAIL.toLowerCase() &&
      pw    === CONFIG.ADMIN_PASSWORD
    ) {
      toast("Welcome, Admin!", "success");
      setTimeout(() => { window.location.href = "dashboard-admin.html"; }, 800);
      return;
    }

    setLoading("btn-signin", true);
    try {
      const { data, error } = await _sb.auth.signInWithPassword({ email, password: pw });
      if (error) throw error;

      // Load profile to get role
      const { data: profile, error: pErr } = await _sb
        .from("profiles")
        .select("role, full_name")
        .eq("id", data.user.id)
        .single();
      if (pErr) throw pErr;

      toast(`Welcome back, ${profile.full_name || email}! 👋`, "success");

      // Route based on role
      setTimeout(() => {
        const destinations = {
          seller: "dashboard-seller.html",
          client: "dashboard-client.html",
          admin:  "dashboard-admin.html",
        };
        window.location.href = destinations[profile.role] || "index.html";
      }, 900);

    } catch (err) {
      showErr(friendly(err.message));
    } finally {
      setLoading("btn-signin", false);
    }
  },

  // ── SIGN UP ────────────────────────────────
  async signup(e) {
    e.preventDefault();
    clearErr();

    const name  = document.getElementById("su-name").value.trim();
    const email = document.getElementById("su-email").value.trim().toLowerCase();
    const pw    = document.getElementById("su-pw").value;

    if (!name)          return showErr("Please enter your full name.");
    if (pw.length < 8)  return showErr("Password must be at least 8 characters.");

    setLoading("btn-signup", true);
    try {
      // 1. Create auth user
      const { data, error } = await _sb.auth.signUp({ email, password: pw });
      if (error) throw error;

      // 2. Insert profile row
    const { error: pErr } = await _sb
  .from("profiles")
  .upsert(
    { id: data.user.id, email, full_name: name, role: _role },
    { onConflict: 'id' }
  );
if (pErr) throw pErr;

      toast(`Welcome to Shopflex, ${name}!`, "success");

      // Route to the right dashboard
      setTimeout(() => {
        const destinations = {
          seller: "dashboard-seller.html",
          client: "dashboard-client.html",
        };
        window.location.href = destinations[_role] || "index.html";
      }, 1000);

    } catch (err) {
      showErr(friendly(err.message));
    } finally {
      setLoading("btn-signup", false);
    }
  },
};

// ── Boot ───────────────────────────────────────
document.addEventListener("DOMContentLoaded", async () => {
  // If user already signed in, redirect them
  try {
    const { data } = await _sb.auth.getSession();
    if (data.session) {
      const { data: profile } = await _sb
        .from("profiles")
        .select("role")
        .eq("id", data.session.user.id)
        .single();
      if (profile) {
        const destinations = {
          seller: "dashboard-seller.html",
          client: "dashboard-client.html",
          admin:  "dashboard-admin.html",
        };
        window.location.href = destinations[profile.role] || "index.html";
      }
    }
  } catch { /* not logged in, stay on page */ }

  // Keyboard shortcut
  document.addEventListener("keydown", e => {
    if (e.key === "Escape") clearErr();
  });
});
