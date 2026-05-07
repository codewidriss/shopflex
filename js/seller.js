

/* ═══════════════════════════════════════════
   SUPABASE CLIENT
═══════════════════════════════════════════ */
let _sb = null;
let _currentSellerId = null;

function getSb() {
  if (!_sb) _sb = supabase.createClient(CONFIG.SUPABASE_URL, CONFIG.SUPABASE_ANON_KEY);
  return _sb;
}

/* ═══════════════════════════════════════════
   LIVE PRODUCTS (from Supabase)
═══════════════════════════════════════════ */
let PRODUCTS = []; // populated from DB

let ORDERS = [];

/* ═══════════════════════════════════════════
   DASHBOARD CONTROLLER
═══════════════════════════════════════════ */
const Dash = {
  currentPage: 'overview',

  /* ── NAVIGATION ── */
  nav(page, btn) {
    // Pages
    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
    document.getElementById('page-' + page).classList.add('active');

    // Nav items
    document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
    if (btn) btn.classList.add('active');

    // Topbar title
    const titles = { overview:'Overview', products:'Products', orders:'Orders', messages:'Messages', analytics:'Analytics', settings:'Settings' };
    document.getElementById('topbar-title').innerHTML = `<span>Seller /</span> ${titles[page] || page}`;
    this.currentPage = page;
  },

  /* ── LOAD PRODUCTS FROM SUPABASE ── */
  async loadProducts() {
    const tbody = document.getElementById('products-tbody');
    tbody.innerHTML = `<tr><td colspan="7" style="text-align:center;padding:32px;color:var(--text-3)">Loading products…</td></tr>`;
    try {
      const { data, error } = await getSb()
        .from('products')
        .select('*')
        .eq('seller_id', _currentSellerId)
        .order('created_at', { ascending: false });
      if (error) throw error;
      PRODUCTS = (data || []).map(p => ({
        id:        p.id,
        name:      p.name,
        category:  p.category,
        price:     p.price,
        stock:     p.stock_quantity,
        sales:     p.sales_count || 0,
        revenue:   p.price * (p.sales_count || 0),
        image_url: p.image_url || null,
      }));
      this.renderProducts();
      this.renderTopProducts();
    } catch (e) {
      console.error('loadProducts:', e.message);
      tbody.innerHTML = `<tr><td colspan="7" style="text-align:center;padding:32px;color:var(--red)">Could not load products: ${e.message}</td></tr>`;
    }
  },

  /* ── PRODUCT TABLE ── */
  renderProducts(data = PRODUCTS) {
    const tbody = document.getElementById('products-tbody');
    if (!data.length) {
      tbody.innerHTML = `<tr><td colspan="7" style="text-align:center;padding:40px;color:var(--text-3)">No products yet — click <strong style="color:var(--accent)">Add Product</strong> to list your first item.</td></tr>`;
      return;
    }
    tbody.innerHTML = data.map(p => {
      let stockClass = 'stock-ok', stockLabel = `${p.stock} in stock`;
      if (p.stock === 0)     { stockClass = 'stock-out'; stockLabel = 'Out of stock'; }
      else if (p.stock <= 5) { stockClass = 'stock-low'; stockLabel = `Low (${p.stock})`; }
      const thumb = p.image_url
        ? `<img src="${p.image_url}" style="width:38px;height:38px;object-fit:cover;border-radius:8px;border:1px solid var(--border)" />`
        : `<div class="product-thumb">—</div>`;
      return `
      <tr>
        <td>
          <div class="product-cell">
            ${thumb}
            <div><div class="product-title">${p.name}</div></div>
          </div>
        </td>
        <td style="color:var(--text-2)">${p.category}</td>
        <td style="font-weight:600">RM ${p.price}</td>
        <td><span class="stock-badge ${stockClass}">${stockLabel}</span></td>
        <td style="color:var(--text-2)">${p.sales} sold</td>
        <td style="font-weight:600;color:var(--accent)">RM ${p.revenue.toLocaleString()}</td>
        <td>
          <div class="tbl-actions">
            <button class="tbl-btn danger" onclick="Dash.deleteProduct('${p.id}')">Delete</button>
          </div>
        </td>
      </tr>`;
    }).join('');
  },

  filterProducts(query) {
    const q = query.toLowerCase();
    this.renderProducts(PRODUCTS.filter(p => p.name.toLowerCase().includes(q) || p.category.toLowerCase().includes(q)));
  },

  filterByCategory(cat) {
    this.renderProducts(cat ? PRODUCTS.filter(p => p.category === cat) : PRODUCTS);
  },

  async deleteProduct(id) {
    if (!confirm('Delete this product?')) return;
    try {
      const { error } = await getSb().from('products').delete().eq('id', id);
      if (error) throw error;
      showToast('Product deleted', 'success');
      await this.loadProducts();
    } catch (e) {
      showToast('Delete failed: ' + e.message, 'error');
    }
  },

  /* ── ORDERS TABLE ── */
  /* ── LOAD ORDERS FROM SUPABASE ── */
  async loadOrders() {
    if (!_currentSellerId) return;
    const tbody = document.getElementById('orders-tbody');
    tbody.innerHTML = `<tr><td colspan="7" style="text-align:center;padding:32px;color:var(--text-3)">Loading orders…</td></tr>`;
    try {
      const { data, error } = await getSb()
        .from('orders')
        .select(`
          id, status, quantity, unit_price, total_price, payment_method, created_at,
          products(name, category),
          buyer:profiles!orders_buyer_id_fkey(full_name, email)
        `)
        .eq('seller_id', _currentSellerId)
        .order('created_at', { ascending: false });
      if (error) throw error;

      // Map DB rows to display shape
      ORDERS = (data || []).map(o => ({
        id:      '#' + o.id.slice(0, 8).toUpperCase(),
        rawId:   o.id,
        buyer:   o.buyer?.full_name || o.buyer?.email || 'Unknown',
        product: (o.products?.category || '📦') + ' ' + (o.products?.name || '—'),
        date:    new Date(o.created_at).toLocaleDateString('en-MY', { day:'2-digit', month:'short', year:'numeric' }),
        amount:  Number(o.total_price).toFixed(2),
        status:  o.status,
        payment: o.payment_method || '—',
      }));

      this.renderOrders(ORDERS);
      this.renderRecentOrders();

      // Update sidebar badge with pending count
      const pending = ORDERS.filter(o => o.status === 'pending').length;
      const badge = document.getElementById('orders-badge');
      if (badge) {
        badge.textContent = pending;
        badge.style.display = pending > 0 ? 'inline-flex' : 'none';
      }
    } catch(e) {
      tbody.innerHTML = `<tr><td colspan="7" style="text-align:center;padding:32px;color:var(--red)">Failed to load orders: ${e.message}</td></tr>`;
    }
  },

  renderOrders(data = ORDERS) {
    const tbody = document.getElementById('orders-tbody');
    if (!data.length) {
      tbody.innerHTML = `<tr><td colspan="7" style="text-align:center;padding:40px;color:var(--text-3)">No orders yet. Orders from buyers will appear here.</td></tr>`;
      return;
    }
    const statusMap = {
      pending:   'status-pending',
      shipped:   'status-shipped',
      delivered: 'status-delivered',
      cancelled: 'status-cancelled',
    };
    const paymentIcon = { FPX:'🏦', CREDIT_CARD:'💳', TNG:'📱', COD:'💵' };
    tbody.innerHTML = data.map(o => `
      <tr>
        <td style="font-weight:600;font-size:12px;color:var(--text-2)">${o.id}</td>
        <td>${o.buyer}</td>
        <td style="color:var(--text-2)">${o.product}</td>
        <td style="color:var(--text-3);font-size:12px">${o.date}</td>
        <td style="font-weight:600">RM ${o.amount}</td>
        <td><span title="${o.payment}">${paymentIcon[o.payment] || '💳'} <span style="font-size:11px;color:var(--text-3)">${o.payment}</span></span></td>
        <td><span class="status-pill ${statusMap[o.status] || ''}">${o.status.charAt(0).toUpperCase() + o.status.slice(1)}</span></td>
        <td>
          <div class="tbl-actions">
            ${o.status === 'pending'  ? `<button class="tbl-btn" onclick="Dash.markShipped('${o.rawId}')">Ship</button>` : ''}
            ${o.status === 'shipped'  ? `<button class="tbl-btn" onclick="Dash.markDelivered('${o.rawId}')">Delivered</button>` : ''}
          </div>
        </td>
      </tr>
    `).join('');
  },

  filterOrders(status, btn) {
    document.querySelectorAll('.otab').forEach(t => t.classList.remove('active'));
    if (btn) btn.classList.add('active');
    const filtered = status === 'all' ? ORDERS : ORDERS.filter(o => o.status === status);
    this.renderOrders(filtered);
  },

  async markShipped(orderId) {
    try {
      const { error } = await getSb().from('orders').update({ status:'shipped' }).eq('id', orderId);
      if (error) throw error;
      await this.loadOrders();
      showToast('Order marked as Shipped 🚚', 'success');
    } catch(e) { showToast('Failed: ' + e.message, 'error'); }
  },

  async markDelivered(orderId) {
    try {
      const { error } = await getSb().from('orders').update({ status:'delivered' }).eq('id', orderId);
      if (error) throw error;
      await this.loadOrders();
      showToast('Order marked as Delivered ✓', 'success');
    } catch(e) { showToast('Failed: ' + e.message, 'error'); }
  },

  /* ── OVERVIEW: RECENT ORDERS ── */
  renderRecentOrders() {
    const container = document.getElementById('recent-orders-list');
    if (!container) return;
    const recent = ORDERS.slice(0, 4);
    if (!recent.length) {
      container.innerHTML = `<div style="text-align:center;padding:40px;color:var(--text-3)">No orders yet</div>`;
      return;
    }
    const statusMap = { pending: 'status-pending', shipped: 'status-shipped', delivered: 'status-delivered', cancelled: 'status-cancelled' };
    container.innerHTML = recent.map(o => `
      <div class="order-row">
        <div class="order-icon">—</div>
        <div class="order-info">
          <div class="order-name">${o.product}</div>
          <div class="order-meta">${o.buyer} · ${o.id} · ${o.date}</div>
        </div>
        <div style="text-align:right">
          <div class="order-amount">RM ${o.amount}</div>
          <div class="status-pill ${statusMap[o.status] || ''}" style="margin-top:4px">${o.status.charAt(0).toUpperCase() + o.status.slice(1)}</div>
        </div>
      </div>
    `).join('');
  },

  /* ── OVERVIEW: TOP PRODUCTS ── */
  renderTopProducts() {
    const container = document.getElementById('top-products-list');
    if (!container) return;
    const sorted = [...PRODUCTS].sort((a, b) => b.revenue - a.revenue).slice(0, 5);
    if (!sorted.length) {
      container.innerHTML = `<div style="text-align:center;padding:40px;color:var(--text-3)">No products yet</div>`;
      return;
    }
    const maxRevenue = sorted[0].revenue || 1;
    container.innerHTML = sorted.map((p, i) => `
      <div class="product-rank-row">
        <div class="rank-num">${i + 1}</div>
        <div class="rank-img">—</div>
        <div class="rank-info">
          <div class="rank-name">${p.name}</div>
          <div class="rank-sales">${p.sales} sold</div>
        </div>
        <div class="rank-bar-wrap"><div class="rank-bar-fill" style="width:${Math.round(p.revenue/maxRevenue*100)}%"></div></div>
        <div class="rank-rev">RM ${p.revenue.toLocaleString()}</div>
      </div>
    `).join('');
  },

  /* ── REVENUE CHART ── */
  renderChart(containerId, heights) {
    const weeks = ['W1','W2','W3','W4','W5','W6','W7','W8'];
    const values = [1200,980,1450,1100,1680,1320,1890,4820];
    const container = document.getElementById(containerId);
    if (!container) return;
    const max = Math.max(...(heights || values));
    const data = heights || values;
    container.innerHTML = data.map((v, i) => `
      <div class="chart-bar-group">
        <div class="chart-bar ${i === data.length - 1 ? 'active' : ''}" style="height:${Math.round(v/max*100)}%">
          <div class="bar-tooltip">RM ${v.toLocaleString()}</div>
        </div>
        <div class="chart-label">${weeks[i]}</div>
      </div>
    `).join('');
  },

  /* ── MESSAGES ── */
  openChat(el, name, initial, lastMsg) {
    document.querySelectorAll('.convo-item').forEach(c => c.classList.remove('active'));
    el.classList.add('active');
    // Remove unread dot
    const dot = el.querySelector('.unread-dot');
    if (dot) dot.remove();
    document.getElementById('chat-av').textContent = initial;
    document.getElementById('chat-name').textContent = name;
    // Pre-populate chat with a greeting
    document.getElementById('chat-messages').innerHTML = `
      <div class="msg in">
        <div class="msg-bubble">Hi! ${lastMsg}</div>
        <div class="msg-time">Just now</div>
      </div>
    `;
  },

  sendMessage() {
    const input = document.getElementById('chat-input-field');
    const msg = input.value.trim();
    if (!msg) return;
    const wrap = document.getElementById('chat-messages');
    const now = new Date().toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'});
    const el = document.createElement('div');
    el.className = 'msg out';
    el.innerHTML = `<div class="msg-bubble">${msg}</div><div class="msg-time">${now}</div>`;
    wrap.appendChild(el);
    wrap.scrollTop = wrap.scrollHeight;
    input.value = '';
  },

  /* ── ADD PRODUCT MODAL ── */
  _pickedFile: null,

  openAddProduct() {
    this._pickedFile = null;
    // Reset form
    ['mp-name','mp-price','mp-stock','mp-desc'].forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });
    document.getElementById('mp-category').value = '';
    document.getElementById('mp-image-input').value = '';
    document.getElementById('img-preview').style.display = 'none';
    document.getElementById('img-upload-icon').textContent = '📷';
    document.getElementById('img-upload-text').textContent = 'Click to upload image';
    document.getElementById('img-upload-sub').textContent = 'PNG, JPG, WEBP up to 5MB';
    document.getElementById('modal-backdrop').classList.add('open');
  },

  closeModal() {
    document.getElementById('modal-backdrop').classList.remove('open');
  },

  handleImagePick(input) {
    const file = input.files[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) { showToast('Image must be under 5MB', 'error'); return; }
    this._pickedFile = file;
    // Show preview
    const reader = new FileReader();
    reader.onload = e => {
      const preview = document.getElementById('img-preview');
      preview.src = e.target.result;
      preview.style.display = 'block';
      document.getElementById('img-upload-icon').textContent = '✅';
      document.getElementById('img-upload-text').textContent = file.name;
      document.getElementById('img-upload-sub').textContent = (file.size / 1024).toFixed(0) + ' KB — click to change';
    };
    reader.readAsDataURL(file);
  },

  async submitProduct() {
    const name  = document.getElementById('mp-name').value.trim();
    const price = parseFloat(document.getElementById('mp-price').value);
    const stock = parseInt(document.getElementById('mp-stock').value);
    const cat   = document.getElementById('mp-category').value;
    const desc  = document.getElementById('mp-desc').value.trim();

    if (!name || isNaN(price) || isNaN(stock) || !cat) {
      showToast('Please fill in all required fields', 'error'); return;
    }
    if (price <= 0)  { showToast('Price must be greater than 0', 'error'); return; }
    if (stock < 0)   { showToast('Stock cannot be negative', 'error'); return; }

    // Disable button
    const btn = document.querySelector('.modal-footer .btn-primary');
    const origText = btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML = '<div class="btn-spin" style="display:inline-block;width:14px;height:14px;border:2px solid rgba(0,0,0,.3);border-top-color:#000;border-radius:50%;animation:spin .6s linear infinite"></div> Saving…';

    try {
      // 1. Upload image if provided
      let image_url = null;
      if (this._pickedFile) {
        const ext  = this._pickedFile.name.split('.').pop();
        const path = `products/${_currentSellerId}/${Date.now()}.${ext}`;
        const { error: upErr } = await getSb().storage
          .from('product-images')
          .upload(path, this._pickedFile, { upsert: true, contentType: this._pickedFile.type });
        if (upErr) throw new Error('Image upload failed: ' + upErr.message);
        const { data: urlData } = getSb().storage.from('product-images').getPublicUrl(path);
        image_url = urlData.publicUrl;
      }

      // 2. Insert product row
      const { error } = await getSb().from('products').insert({
        seller_id:      _currentSellerId,
        name,
        price,
        stock_quantity: stock,
        category:       cat,
        description:    desc,
        image_url,
        sales_count:    0,
      });
      if (error) throw error;

      this.closeModal();
      showToast(`"${name}" listed successfully! 🎉`, 'success');
      await this.loadProducts();

    } catch (e) {
      console.error('submitProduct:', e);
      showToast('Failed to add product: ' + e.message, 'error');
    } finally {
      btn.disabled = false;
      btn.innerHTML = origText;
    }
  },

  /* ── ANALYTICS ── */
  setPeriod(period, btn) {
    document.querySelectorAll('.period-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    const data = {
      '7d':  [320,280,410,380,490,420,380],
      '30d': [1200,980,1450,1100,1680,1320,1890,4820],
      '90d': [8200,9400,10200,11800,9600,12400,14200,16800],
      '1y':  [38000,42000,39000,51000,48000,56000,62000,58000],
    };
    this.renderChart('analytics-chart', data[period]);
    showToast(`Showing ${period} data`, 'info');
  },

  /* ── SETTINGS ── */
  saveProfile() {
    const name = document.getElementById('set-name').value.trim();
    if (name) {
      document.getElementById('seller-name-sb').textContent = name;
      document.getElementById('seller-first-name').textContent = name.split(' ')[0];
      document.getElementById('settings-name').textContent = name;
      document.getElementById('seller-avatar-sb').textContent = name[0].toUpperCase();
      document.getElementById('settings-avatar').textContent = name[0].toUpperCase();
    }
    showToast('Profile saved!', 'success');
  },

  /* ── LOGOUT ── */
  async logout() {
    try {
      if (typeof supabase !== 'undefined' && typeof CONFIG !== 'undefined') {
        const sb = supabase.createClient(CONFIG.SUPABASE_URL, CONFIG.SUPABASE_ANON_KEY);
        await sb.auth.signOut();
      }
    } catch(e) {}
    showToast('Signing out…', 'info');
    setTimeout(() => { window.location.href = 'index.html'; }, 800);
  },
};

/* ═══════════════════════════════════════════
   HELPERS
═══════════════════════════════════════════ */
function categoryEmoji(cat) {
  return '—';
}

/* ═══════════════════════════════════════════
   TOAST
═══════════════════════════════════════════ */
function showToast(msg, type = 'info') {
  const wrap = document.getElementById('toast-wrap');
  const el   = document.createElement('div');
  const icons = { success:'✓', error:'✕', info:'ℹ' };
  el.className = `toast toast-${type}`;
  el.innerHTML = `<span class="toast-icon">${icons[type]||'ℹ'}</span><span>${msg}</span>`;
  wrap.appendChild(el);
  setTimeout(() => {
    el.style.transition = 'opacity .3s, transform .3s';
    el.style.opacity = '0'; el.style.transform = 'translateX(16px)';
    setTimeout(() => el.remove(), 350);
  }, 3000);
}

/* ═══════════════════════════════════════════
   SESSION CHECK + BOOT
═══════════════════════════════════════════ */
async function boot() {
  try {
    const { data } = await getSb().auth.getSession();
    if (!data.session) { window.location.href = 'auth.html'; return; }

    _currentSellerId = data.session.user.id;

    // Fetch profile
    const { data: profile } = await getSb()
      .from('profiles').select('full_name, role').eq('id', _currentSellerId).single();
    if (profile) {
      if (profile.role !== 'seller' && profile.role !== 'admin') {
        window.location.href = 'dashboard-client.html'; return;
      }
      const name = profile.full_name || data.session.user.email;
      const initial = name[0].toUpperCase();
      document.getElementById('seller-name-sb').textContent = name;
      document.getElementById('seller-first-name').textContent = name.split(' ')[0];
      document.getElementById('seller-avatar-sb').textContent = initial;
      document.getElementById('settings-avatar').textContent = initial;
      document.getElementById('settings-name').textContent = name;
      document.getElementById('set-name').value = name;
      document.getElementById('set-email').value = data.session.user.email;
    }
  } catch(e) {
    console.warn('Session check failed, running in demo mode:', e.message);
  }

  // Load real data
  if (_currentSellerId) {
    await Dash.loadProducts();
    await Dash.loadOrders();
    OrderObserver.subscribe(_currentSellerId); // start realtime listener
  } else {
    Dash.renderProducts();
    Dash.renderOrders();
  }

  // Render overview sections with live data
  Dash.renderRecentOrders();
  Dash.renderTopProducts();
  Dash.renderChart('revenue-chart');
  Dash.renderChart('analytics-chart');
}

document.addEventListener('DOMContentLoaded', boot);

// ═══════════════════════════════════════════════════════════════
//  FACTORY PATTERN — Payment Gateway (Proper GoF structure)
//  CSE 6234 Software Design · Design Pattern 1
//
//  Following the standard Factory Method pattern:
//
//  «interface» IPaymentGateway   (Product interface)
//      ↑ FPXGateway              (Concrete Product A)
//      ↑ CreditCardGateway       (Concrete Product B)
//      ↑ TNGGateway              (Concrete Product C)
//      ↑ CODGateway              (Concrete Product D)
//
//  PaymentGatewayCreator         (Creator — abstract)
//      ↑ FPXGatewayCreator       (Concrete Creator A)
//      ↑ CreditCardGatewayCreator(Concrete Creator B)
//      ↑ TNGGatewayCreator       (Concrete Creator C)
//      ↑ CODGatewayCreator       (Concrete Creator D)
//
//  PaymentGatewayFactory         (Client — calls createGateway())
//
//  The Creator declares the factory method createGateway() that
//  returns an IPaymentGateway. Each Concrete Creator overrides
//  it to return its own Concrete Product. The client (Factory)
//  only depends on the Creator and Product interfaces — never
//  on any concrete class directly.
// ═══════════════════════════════════════════════════════════════

// ── Product Interface ─────────────────────────────────────────
class IPaymentGateway {
  get gatewayName() { throw new Error('gatewayName must be defined'); }
  async processPayment(amount, currency, details) {
    throw new Error('processPayment() must be implemented');
  }
  async refund(transactionId) {
    throw new Error('refund() must be implemented');
  }
}

// ── Concrete Products ─────────────────────────────────────────
class FPXGateway extends IPaymentGateway {
  get gatewayName() { return 'FPX (Online Banking)'; }
  async processPayment(amount, currency, details) {
    console.log(`[FPX] Processing RM${amount} — ref: ${details.orderRef}`);
    await _delay(600);
    return { success: true, transactionId: 'FPX-' + Date.now(), errorMessage: null };
  }
  async refund(transactionId) { return { success: true }; }
}

class CreditCardGateway extends IPaymentGateway {
  get gatewayName() { return 'Credit / Debit Card'; }
  async processPayment(amount, currency, details) {
    console.log(`[CARD] Charging RM${amount} — ref: ${details.orderRef}`);
    await _delay(800);
    return { success: true, transactionId: 'CARD-' + Date.now(), errorMessage: null };
  }
  async refund(transactionId) { return { success: true }; }
}

class TNGGateway extends IPaymentGateway {
  get gatewayName() { return "Touch 'n Go eWallet"; }
  async processPayment(amount, currency, details) {
    console.log(`[TNG] Wallet RM${amount} — ref: ${details.orderRef}`);
    await _delay(500);
    return { success: true, transactionId: 'TNG-' + Date.now(), errorMessage: null };
  }
  async refund(transactionId) { return { success: true }; }
}

class CODGateway extends IPaymentGateway {
  get gatewayName() { return 'Cash on Delivery'; }
  async processPayment(amount, currency, details) {
    console.log(`[COD] Collect RM${amount} on delivery — ref: ${details.orderRef}`);
    await _delay(200);
    return { success: true, transactionId: 'COD-' + Date.now(), errorMessage: null };
  }
  async refund(transactionId) {
    return { success: false, errorMessage: 'COD refunds must be processed manually.' };
  }
}

// ── Creator (abstract) ────────────────────────────────────────
// Declares the factory method. Also contains the core business
// logic that uses the product — separating creation from use.
class PaymentGatewayCreator {
  /** @returns {IPaymentGateway} — overridden by each Concrete Creator */
  createGateway() {
    throw new Error('createGateway() must be implemented by a Concrete Creator');
  }

  /** Core operation: uses the product without knowing its class */
  async initiatePayment(amount, currency, details) {
    const gateway = this.createGateway();          // factory method call
    console.log(`[Creator] Using gateway: ${gateway.gatewayName}`);
    return await gateway.processPayment(amount, currency, details);
  }
}

// ── Concrete Creators ─────────────────────────────────────────
class FPXGatewayCreator extends PaymentGatewayCreator {
  createGateway() { return new FPXGateway(); }
}
class CreditCardGatewayCreator extends PaymentGatewayCreator {
  createGateway() { return new CreditCardGateway(); }
}
class TNGGatewayCreator extends PaymentGatewayCreator {
  createGateway() { return new TNGGateway(); }
}
class CODGatewayCreator extends PaymentGatewayCreator {
  createGateway() { return new CODGateway(); }
}


const OrderObserver = {
  _channel: null,
  _unread: 0,

  subscribe(sellerId) {
    if (this._channel) return; // already subscribed

    console.log('[Observer] Subscribing to new orders for seller:', sellerId);

    this._channel = getSb()
      .channel('seller-orders-' + sellerId)
      .on('postgres_changes', {
        event:  'INSERT',
        schema: 'public',
        table:  'orders',
        filter: `seller_id=eq.${sellerId}`,
      }, payload => this._onNewOrder(payload.new))
      .subscribe(status => {
        console.log('[Observer] Realtime status:', status);
      });
  },

  async _onNewOrder(order) {
    console.log('[Observer] New order received:', order);

    // Fetch buyer name + product name for the notification
    let buyerName   = 'A buyer';
    let productName = 'your product';
    let payLabel    = PaymentGatewayFactory.labelFor(order.payment_method || 'FPX');

    try {
      const [buyerRes, productRes] = await Promise.all([
        getSb().from('profiles').select('full_name,email').eq('id', order.buyer_id).single(),
        getSb().from('products').select('name').eq('id', order.product_id).single(),
      ]);
      if (buyerRes.data)   buyerName   = buyerRes.data.full_name   || buyerRes.data.email;
      if (productRes.data) productName = productRes.data.name;
    } catch(e) { /* use defaults */ }

    // 1. Toast alert
    showToast(`🛒 New order from ${buyerName}!`, 'success');

    // 2. Push notification card to bell panel
    this._pushNotification({
      title:   `New order · RM ${Number(order.total_price).toFixed(2)}`,
      body:    `${buyerName} bought ${productName}`,
      sub:     `Paid via ${payLabel}`,
      time:    new Date().toLocaleTimeString('en-MY', { hour:'2-digit', minute:'2-digit' }),
      orderId: order.id,
    });

    // 3. Refresh orders & products to show updated stock/sales
    await Dash.loadOrders();
    await Dash.loadProducts();
  },

  _pushNotification({ title, body, sub, time, orderId }) {
    this._unread++;

    // Update badge
    const badge = document.getElementById('notif-badge');
    if (badge) {
      badge.textContent = this._unread;
      badge.style.display = 'inline-flex';
    }

    // Remove empty state
    const empty = document.getElementById('notif-empty');
    if (empty) empty.remove();

    // Build notification card
    const list = document.getElementById('notif-list');
    if (!list) return;

    const card = document.createElement('div');
    card.style.cssText = 'padding:14px 16px;border-bottom:1px solid var(--border);animation:notifSlide .3s ease;cursor:pointer';
    card.innerHTML = `
      <div style="display:flex;align-items:flex-start;gap:10px">
        <div style="width:36px;height:36px;background:rgba(52,211,153,.15);border-radius:8px;display:flex;align-items:center;justify-content:center;font-size:16px;flex-shrink:0">🛒</div>
        <div style="flex:1;min-width:0">
          <div style="font-size:13px;font-weight:600;color:var(--text);margin-bottom:2px">${title}</div>
          <div style="font-size:12px;color:var(--text-2);margin-bottom:2px">${body}</div>
          <div style="font-size:11px;color:var(--text-3)">${sub} · ${time}</div>
        </div>
        <span style="width:8px;height:8px;background:var(--accent);border-radius:50%;flex-shrink:0;margin-top:4px"></span>
      </div>`;
    card.onclick = () => {
      Dash.nav('orders', document.querySelector('[onclick*="orders"]'));
      NotifPanel.close();
    };
    list.insertBefore(card, list.firstChild);
  },

  clearAll() {
    this._unread = 0;
    const badge = document.getElementById('notif-badge');
    if (badge) badge.style.display = 'none';
    const list = document.getElementById('notif-list');
    if (list) list.innerHTML = `<div id="notif-empty" style="padding:2.5rem 1rem;text-align:center;color:var(--text-3);font-size:13px;line-height:1.6">No notifications yet.<br/>New orders will appear here in real time.</div>`;
  },

  unsubscribe() {
    if (this._channel) {
      getSb().removeChannel(this._channel);
      this._channel = null;
    }
  },
};

// ── Notification Panel UI ─────────────────────────────────────
const NotifPanel = {
  _open: false,

  toggle() {
    this._open ? this.close() : this.open();
  },
  open() {
    const panel = document.getElementById('notif-panel');
    if (panel) {
      panel.style.display = 'block';
      this._open = true;
      // Reset unread badge when opened
      OrderObserver._unread = 0;
      const badge = document.getElementById('notif-badge');
      if (badge) badge.style.display = 'none';
    }
  },
  close() {
    const panel = document.getElementById('notif-panel');
    if (panel) { panel.style.display = 'none'; this._open = false; }
  },
  clearAll() {
    OrderObserver.clearAll();
  },
};

// Close panel when clicking outside
document.addEventListener('click', e => {
  if (NotifPanel._open &&
      !e.target.closest('#notif-panel') &&
      !e.target.closest('#notif-bell-btn')) {
    NotifPanel.close();
  }
});
