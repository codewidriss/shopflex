/**
 * js/auth.js — Shopflex authentication
 *
 * Handles:
 *  - Supabase client init
 *  - Sign up (with role stored in profiles table)
 *  - Sign in (+ admin shortcut)
 *  - Panel open/close/tab switching
 *  - Two-step signup flow
 *  - Password strength indicator
 *  - Session restore on page load
 */

// ── Supabase client ──────────────────────────
const _sb = supabase.createClient(
  CONFIG.SUPABASE_URL,
  CONFIG.SUPABASE_ANON_KEY
);

// ── State ─────────────────────────────────────
let _selectedRole = "client";
let _panelOpen    = false;

// ── Utility: toast ────────────────────────────
function showToast(msg, type = "info") {
  const wrap = document.getElementById("toast-wrap");
  const el   = document.createElement("div");
  const icons = { success: "✓", error: "✕", info: "ℹ" };
  el.className = `toast toast-${type}`;
  el.innerHTML = `<span class="toast-icon">${icons[type] || "ℹ"}</span><span>${msg}</span>`;
  wrap.appendChild(el);
  setTimeout(() => {
    el.style.transition = "opacity 0.3s, transform 0.3s";
    el.style.opacity    = "0";
    el.style.transform  = "translateY(8px)";
    setTimeout(() => el.remove(), 350);
  }, 3000);
}

// ── Utility: set button loading ───────────────
function setBtnLoading(id, on) {
  const btn     = document.getElementById(id);
  const label   = btn?.querySelector(".btn-label");
  const spinner = btn?.querySelector(".btn-spin");
  if (!btn) return;
  btn.disabled         = on;
  if (label)   label.style.opacity   = on ? "0" : "1";
  if (spinner) spinner.style.display = on ? "inline-block" : "none";
}

// ── Auth object ───────────────────────────────
const Auth = {

  // ── Panel open / close ─────────────────────
  openPanel(tab = "login") {
    this.switchTab(tab);
    document.getElementById("auth-panel").classList.add("open");
    document.getElementById("auth-backdrop").classList.add("open");
    document.body.style.overflow = "hidden";
    _panelOpen = true;
    // Reset to step 1 if signup
    if (tab === "signup") this._resetSignup();
  },

  closePanel() {
    document.getElementById("auth-panel").classList.remove("open");
    document.getElementById("auth-backdrop").classList.remove("open");
    document.body.style.overflow = "";
    _panelOpen = false;
    this._clearError();
  },

  // ── Tab switching ──────────────────────────
  switchTab(tab) {
    document.getElementById("tab-login").classList.toggle("active", tab === "login");
    document.getElementById("tab-signup").classList.toggle("active", tab === "signup");
    document.getElementById("form-login").style.display  = tab === "login"  ? "flex" : "none";
    document.getElementById("form-signup").style.display = tab === "signup" ? "flex" : "none";
    this._clearError();
  },

  // ── Role picker ────────────────────────────
  pickRole(role, el) {
    _selectedRole = role;
    document.querySelectorAll(".role-card").forEach(c => {
      c.classList.remove("selected");
      c.querySelector(".role-check").style.display = "none";
    });
    el.classList.add("selected");
    el.querySelector(".role-check").style.display = "flex";
  },

  // ── Step navigation ────────────────────────
  goToStep2() {
    document.getElementById("signup-step-1").style.display = "none";
    document.getElementById("signup-step-2").style.display = "block";
    const badge = document.getElementById("selected-role-badge");
    badge.innerHTML = _selectedRole === "client"
      ? "🛍️ Shopping account"
      : "🏪 Seller account";
    // Focus name field
    setTimeout(() => document.getElementById("signup-name")?.focus(), 50);
  },

  backToStep1() {
    document.getElementById("signup-step-2").style.display = "none";
    document.getElementById("signup-step-1").style.display = "block";
  },

  _resetSignup() {
    document.getElementById("signup-step-1").style.display = "block";
    document.getElementById("signup-step-2").style.display = "none";
    // Reset role to client
    _selectedRole = "client";
    document.querySelectorAll(".role-card").forEach(c => {
      c.classList.remove("selected");
      c.querySelector(".role-check").style.display = "none";
    });
    const clientCard = document.querySelector('.role-card[data-role="client"]');
    if (clientCard) {
      clientCard.classList.add("selected");
      clientCard.querySelector(".role-check").style.display = "flex";
    }
    // Clear fields
    ["signup-name","signup-email","signup-password"].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.value = "";
    });
    const bar = document.getElementById("pw-strength");
    if (bar) bar.removeAttribute("data-level");
  },

  // ── Password strength ──────────────────────
  initPasswordStrength() {
    const input = document.getElementById("signup-password");
    const bar   = document.getElementById("pw-strength");
    if (!input || !bar) return;
    input.addEventListener("input", () => {
      const v = input.value;
      let level = 0;
      if (v.length >= 8)                       level++;
      if (/[A-Z]/.test(v))                     level++;
      if (/[0-9]/.test(v))                     level++;
      if (/[^A-Za-z0-9]/.test(v))             level++;
      bar.setAttribute("data-level", v.length ? level || 1 : "");
    });
  },

  // ── LOGIN ──────────────────────────────────
  async login(e) {
    e.preventDefault();
    const email = document.getElementById("login-email").value.trim().toLowerCase();
    const pw    = document.getElementById("login-password").value;
    this._clearError();

    // Admin shortcut — no Supabase call
    if (email === CONFIG.ADMIN_EMAIL.toLowerCase() && pw === CONFIG.ADMIN_PASSWORD) {
      this.closePanel();
      showToast("Welcome, Admin!", "success");
      this._redirectTo("admin");
      return;
    }

    setBtnLoading("btn-login", true);
    try {
      const { data, error } = await _sb.auth.signInWithPassword({ email, password: pw });
      if (error) throw error;

      // Fetch profile for role
      const { data: profile, error: pErr } = await _sb
        .from("profiles")
        .select("role, full_name")
        .eq("id", data.user.id)
        .single();
      if (pErr) throw pErr;

      this.closePanel();
      showToast(`Welcome back, ${profile.full_name || email}!`, "success");
      this._redirectTo(profile.role);
    } catch (err) {
      this._showError(this._friendly(err.message));
    } finally {
      setBtnLoading("btn-login", false);
    }
  },

  // ── SIGNUP ─────────────────────────────────
  async signup(e) {
    e.preventDefault();
    const name  = document.getElementById("signup-name").value.trim();
    const email = document.getElementById("signup-email").value.trim().toLowerCase();
    const pw    = document.getElementById("signup-password").value;
    this._clearError();

    if (!name)         return this._showError("Please enter your full name.");
    if (pw.length < 8) return this._showError("Password must be at least 8 characters.");

    setBtnLoading("btn-signup", true);
    try {
      // 1. Create Supabase auth user
      const { data, error } = await _sb.auth.signUp({ email, password: pw });
      if (error) throw error;

      // 2. Insert profile row with role
      const { error: pErr } = await _sb
        .from("profiles")
        .insert({ id: data.user.id, email, full_name: name, role: _selectedRole });
      if (pErr) throw pErr;

      this.closePanel();
      showToast(`Account created! Welcome, ${name} 🎉`, "success");
      this._redirectTo(_selectedRole);
    } catch (err) {
      this._showError(this._friendly(err.message));
    } finally {
      setBtnLoading("btn-signup", false);
    }
  },

  // ── REDIRECT AFTER AUTH ────────────────────
  _redirectTo(role) {
    // In a single-page setup this would call App.enterPortal(role).
    // For now we show a success state on the landing page.
    // You can replace this with: window.location.href = `/${role}.html`
    console.log("Redirecting to portal:", role);
    // Placeholder — replace with your routing logic:
    showToast(`Loading ${role} portal…`, "info");
  },

  // ── SESSION RESTORE ────────────────────────
  async restoreSession() {
    try {
      const { data } = await _sb.auth.getSession();
      if (!data.session) return;
      const { data: profile } = await _sb
        .from("profiles")
        .select("role, full_name")
        .eq("id", data.session.user.id)
        .single();
      if (profile) {
        showToast(`Welcome back, ${profile.full_name || data.session.user.email}!`, "success");
        this._redirectTo(profile.role);
      }
    } catch { /* silent */ }
  },

  // ── PASSWORD SHOW/HIDE ─────────────────────
  togglePw(inputId, btn) {
    const input = document.getElementById(inputId);
    if (!input) return;
    input.type = input.type === "password" ? "text" : "password";
    btn.style.opacity = input.type === "text" ? "1" : "0.5";
  },

  // ── ERROR HELPERS ──────────────────────────
  _showError(msg) {
    const el = document.getElementById("auth-error");
    el.textContent = msg;
    el.style.display = "block";
    el.classList.remove("shake");
    void el.offsetWidth; // reflow to restart animation
    el.classList.add("shake");
  },
  _clearError() {
    const el = document.getElementById("auth-error");
    if (el) { el.style.display = "none"; el.textContent = ""; }
  },
  _friendly(msg = "") {
    if (msg.includes("Invalid login credentials")) return "Incorrect email or password.";
    if (msg.includes("already registered"))        return "This email is already in use. Try signing in.";
    if (msg.includes("not confirmed"))             return "Please confirm your email first.";
    if (msg.includes("rate limit"))                return "Too many attempts — please wait a moment.";
    if (msg.includes("relation") && msg.includes("profiles")) return "Database table missing. Please run the SQL setup.";
    return msg || "Something went wrong. Please try again.";
  },
};

// ── Boot ───────────────────────────────────────
document.addEventListener("DOMContentLoaded", () => {
  // Navbar scroll effect
  window.addEventListener("scroll", () => {
    document.getElementById("navbar")
      .classList.toggle("scrolled", window.scrollY > 10);
  });

  // Keyboard: Escape closes panel
  document.addEventListener("keydown", e => {
    if (e.key === "Escape" && _panelOpen) Auth.closePanel();
  });

  // Init password strength listener when signup step 2 appears
  // (delegated since step 2 is hidden initially)
  document.getElementById("form-signup")
    .addEventListener("input", e => {
      if (e.target.id === "signup-password") Auth.initPasswordStrength();
    });

  // Try restoring session
  Auth.restoreSession();
});
