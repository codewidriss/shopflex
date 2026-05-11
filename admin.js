/* ═══════════════════════════════════════════
   INIT
═══════════════════════════════════════════ */
let _sb = null;
let ALL_USERS    = [];
let ALL_PRODUCTS = [];
let ALL_ORDERS   = [];

function getSb() {
  if (!_sb) _sb = supabase.createClient(CONFIG.SUPABASE_URL, CONFIG.SUPABASE_ANON_KEY);
  return _sb;
}

/* ═══════════════════════════════════════════
   TOAST
═══════════════════════════════════════════ */
function showToast(msg, type = 'info') {
  const wrap = document.getElementById('toast-wrap');
  const el = document.createElement('div');
  const icons = { success: '✓', error: '✕', info: 'ℹ' };
  el.className = `toast toast-${type}`;
  el.innerHTML = `<span class="toast-icon">${icons[type] || 'ℹ'}</span><span>${msg}</span>`;
  wrap.appendChild(el);
  setTimeout(() => {
    el.style.transition = 'opacity .3s, transform .3s';
    el.style.opacity = '0'; el.style.transform = 'translateX(12px)';
    setTimeout(() => el.remove(), 350);
  }, 3000);
}

/* ═══════════════════════════════════════════
   ADMIN CONTROLLER
═══════════════════════════════════════════ */
const Admin = {

  /* ── NAVIGATION ── */
  nav(page, btn) {
    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
    document.getElementById('page-' + page).classList.add('active');
    document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
    if (btn) btn.classList.add('active');
    const titles = { overview:'Overview', users:'User Management', products:'All Products', orders:'All Orders', analytics:'Analytics', settings:'Settings' };
    document.getElementById('topbar-title').innerHTML = `<span>Admin /</span> <strong>${titles[page] || page}</strong>`;
  },

  /* ── LOGOUT ── */
  logout() {
    if (!confirm('Log out of admin panel?')) return;
    window.location.href = 'index.html';
  },

  /* ── MODAL ── */
  openModal(id) { document.getElementById(id).classList.add('open'); },
  closeModal(id) { document.getElementById(id).classList.remove('open'); },

  /* ── LOAD ALL DATA ── */
  async loadAll() {
    await Promise.all([
      this.loadUsers(),
      this.loadProducts(),
      this.loadOrders(),
    ]);
    this.renderOverview();
    this.renderAnalytics();
  },

  /* ── USERS ── */
  async loadUsers() {
    try {
      const { data, error } = await getSb()
        .from('profiles')
        .select('id, full_name, email, role, phone, created_at')
        .order('created_at', { ascending: false });
      if (error) throw error;
      ALL_USERS = data || [];
      this.renderUsers(ALL_USERS);
      document.getElementById('badge-users').textContent = ALL_USERS.length;
    } catch(e) {
      showToast('Failed to load users: ' + e.message, 'error');
    }
  },

  renderUsers(users) {
    const tbody = document.getElementById('users-tbody');
    if (!users.length) {
      tbody.innerHTML = `<tr><td colspan="5" class="empty">No users found.</td></tr>`;
      return;
    }
    const colors = ['#16a34a','#3b82f6','#f59e0b','#8b5cf6','#ef4444','#06b6d4'];
    tbody.innerHTML = users.map((u, i) => {
      const initial = (u.full_name || u.email || '?')[0].toUpperCase();
      const color   = colors[i % colors.length];
      const role    = u.role || 'client';
      const pillCls = role === 'seller' ? 'pill-blue' : role === 'admin' ? 'pill-red' : 'pill-green';
      const date    = new Date(u.created_at).toLocaleDateString('en-MY', { day:'2-digit', month:'short', year:'numeric' });
      return `
      <tr>
        <td>
          <div class="user-cell">
            <div class="user-av" style="background:${color}">${initial}</div>
            <div>
              <div class="user-name">${u.full_name || '—'}</div>
              <div class="user-email">${u.email || '—'}</div>
            </div>
          </div>
        </td>
        <td><span class="pill ${pillCls}">${role.charAt(0).toUpperCase() + role.slice(1)}</span></td>
        <td style="color:var(--text-3)">${u.phone || '—'}</td>
        <td style="color:var(--text-3);font-size:12px">${date}</td>
        <td>
          <div class="tbl-actions">
            <button class="btn-sm" onclick="Admin.openEditUser('${u.id}','${(u.full_name||'').replace(/'/g,"\\'")}','${u.role||'client'}','${u.phone||''}')">Edit</button>
            <button class="btn-danger" onclick="Admin.deleteUser('${u.id}','${(u.full_name||u.email||'').replace(/'/g,"\\'")}')">Delete</button>
          </div>
        </td>
      </tr>`;
    }).join('');
  },

  filterUsers(q) {
    const s = q.toLowerCase();
    this.renderUsers(ALL_USERS.filter(u =>
      (u.full_name||'').toLowerCase().includes(s) ||
      (u.email||'').toLowerCase().includes(s)
    ));
  },

  filterUsersByRole(role) {
    this.renderUsers(role ? ALL_USERS.filter(u => u.role === role) : ALL_USERS);
  },

  openEditUser(id, name, role, phone) {
    document.getElementById('edit-user-id').value    = id;
    document.getElementById('edit-user-name').value  = name;
    document.getElementById('edit-user-role').value  = role;
    document.getElementById('edit-user-phone').value = phone;
    this.openModal('modal-edit-user');
  },

  async saveUser() {
    const id    = document.getElementById('edit-user-id').value;
    const name  = document.getElementById('edit-user-name').value.trim();
    const role  = document.getElementById('edit-user-role').value;
    const phone = document.getElementById('edit-user-phone').value.trim();
    if (!name) return showToast('Name is required', 'error');
    try {
      const { error } = await getSb().from('profiles').update({ full_name: name, role, phone }).eq('id', id);
      if (error) throw error;
      showToast('User updated', 'success');
      this.closeModal('modal-edit-user');
      await this.loadUsers();
    } catch(e) { showToast('Update failed: ' + e.message, 'error'); }
  },

  async deleteUser(id, name) {
    if (!confirm(`Delete user "${name}"? This cannot be undone.`)) return;
    try {
      const { error } = await getSb().from('profiles').delete().eq('id', id);
      if (error) throw error;
      showToast(`User "${name}" deleted`, 'success');
      await this.loadUsers();
      this.renderOverview();
    } catch(e) { showToast('Delete failed: ' + e.message, 'error'); }
  },

  openAddUser() { this.openModal('modal-add-user'); },

  async createUser() {
    const name  = document.getElementById('add-user-name').value.trim();
    const email = document.getElementById('add-user-email').value.trim().toLowerCase();
    const role  = document.getElementById('add-user-role').value;
    const pw    = document.getElementById('add-user-pw').value;
    if (!name || !email || !pw) return showToast('All fields are required', 'error');
    if (pw.length < 8) return showToast('Password must be at least 8 characters', 'error');
    try {
      const { data, error } = await getSb().auth.signUp({ email, password: pw });
      if (error) throw error;
      const { error: pErr } = await getSb().from('profiles').upsert(
        { id: data.user.id, email, full_name: name, role },
        { onConflict: 'id' }
      );
      if (pErr) throw pErr;
      showToast(`User "${name}" created`, 'success');
      this.closeModal('modal-add-user');
      ['add-user-name','add-user-email','add-user-pw'].forEach(id => document.getElementById(id).value = '');
      await this.loadUsers();
    } catch(e) { showToast('Create failed: ' + e.message, 'error'); }
  },

  /* ── PRODUCTS ── */
  async loadProducts() {
    try {
      const { data, error } = await getSb()
        .from('products')
        .select('id, name, category, price, stock_quantity, sales_count, image_url, created_at, profiles!products_seller_id_fkey(full_name)')
        .order('created_at', { ascending: false });
      if (error) throw error;
      ALL_PRODUCTS = data || [];
      this.renderProducts(ALL_PRODUCTS);
    } catch(e) {
      showToast('Failed to load products: ' + e.message, 'error');
    }
  },

  renderProducts(products) {
    const tbody = document.getElementById('products-tbody');
    if (!products.length) {
      tbody.innerHTML = `<tr><td colspan="7" class="empty">No products found.</td></tr>`;
      return;
    }
    tbody.innerHTML = products.map(p => {
      const stock = p.stock_quantity;
      let stockPill = `<span class="pill pill-green">${stock} in stock</span>`;
      if (stock === 0)    stockPill = `<span class="pill pill-red">Out of stock</span>`;
      else if (stock <=5) stockPill = `<span class="pill pill-orange">Low (${stock})</span>`;
      const thumb = p.image_url
        ? `<img src="${p.image_url}" style="width:34px;height:34px;object-fit:cover;border-radius:6px;border:1px solid var(--border)" />`
        : `<div style="width:34px;height:34px;background:var(--bg-3);border-radius:6px;display:flex;align-items:center;justify-content:center;font-size:14px">📦</div>`;
      return `
      <tr>
        <td><div style="display:flex;align-items:center;gap:10px">${thumb}<span style="font-weight:600;color:var(--text)">${p.name}</span></div></td>
        <td style="color:var(--text-3)">${p.profiles?.full_name || '—'}</td>
        <td><span class="pill pill-gray">${p.category || '—'}</span></td>
        <td style="font-weight:600">RM ${parseFloat(p.price).toFixed(2)}</td>
        <td>${stockPill}</td>
        <td style="color:var(--text-2)">${p.sales_count || 0} sold</td>
        <td>
          <div class="tbl-actions">
            <button class="btn-danger" onclick="Admin.deleteProduct('${p.id}','${(p.name||'').replace(/'/g,"\\'")}')">Delete</button>
          </div>
        </td>
      </tr>`;
    }).join('');
  },

  filterProducts(q) {
    const s = q.toLowerCase();
    this.renderProducts(ALL_PRODUCTS.filter(p =>
      (p.name||'').toLowerCase().includes(s) ||
      (p.category||'').toLowerCase().includes(s)
    ));
  },

  filterProductsByCategory(cat) {
    this.renderProducts(cat ? ALL_PRODUCTS.filter(p => p.category === cat) : ALL_PRODUCTS);
  },

  async deleteProduct(id, name) {
    if (!confirm(`Delete product "${name}"? This cannot be undone.`)) return;
    try {
      const { error } = await getSb().from('products').delete().eq('id', id);
      if (error) throw error;
      showToast(`Product "${name}" deleted`, 'success');
      await this.loadProducts();
    } catch(e) { showToast('Delete failed: ' + e.message, 'error'); }
  },

  /* ── ORDERS ── */
  async loadOrders() {
    try {
      const { data, error } = await getSb()
        .from('orders')
        .select(`
          id, status, total_price, payment_method, created_at,
          buyer:profiles!orders_buyer_id_fkey(full_name, email),
          seller:profiles!orders_seller_id_fkey(full_name),
          products(name, image_url)
        `)
        .order('created_at', { ascending: false });
      if (error) throw error;
      ALL_ORDERS = data || [];
      this.renderOrders(ALL_ORDERS);
      this._updateOrderTabs(ALL_ORDERS);
    } catch(e) {
      showToast('Failed to load orders: ' + e.message, 'error');
    }
  },

  renderOrders(orders) {
    const tbody = document.getElementById('orders-tbody');
    if (!orders.length) {
      tbody.innerHTML = `<tr><td colspan="9" class="empty">No orders found.</td></tr>`;
      return;
    }
    const statusPill = {
      pending:   'pill-orange', paid: 'pill-blue', processing: 'pill-purple',
      shipped:   'pill-blue',   delivered: 'pill-green', cancelled: 'pill-red'
    };
    const payIcon = { FPX:'🏦', CREDIT_CARD:'💳', TNG:'📱', COD:'💵' };
    tbody.innerHTML = orders.map(o => {
      const date   = new Date(o.created_at).toLocaleDateString('en-MY', { day:'2-digit', month:'short', year:'numeric' });
      const thumb  = o.products?.image_url
        ? `<img src="${o.products.image_url}" style="width:28px;height:28px;object-fit:cover;border-radius:5px;flex-shrink:0" />`
        : `<div style="width:28px;height:28px;background:var(--bg-3);border-radius:5px;font-size:12px;display:flex;align-items:center;justify-content:center">📦</div>`;
      const status = o.status || 'pending';
      return `
      <tr>
        <td style="font-family:monospace;font-size:11px;color:var(--text-3)">#${o.id.slice(0,8).toUpperCase()}</td>
        <td style="color:var(--text)">${o.buyer?.full_name || o.buyer?.email || '—'}</td>
        <td style="color:var(--text-3)">${o.seller?.full_name || '—'}</td>
        <td><div style="display:flex;align-items:center;gap:8px">${thumb}<span style="color:var(--text-2)">${o.products?.name || '—'}</span></div></td>
        <td style="font-weight:600">RM ${parseFloat(o.total_price).toFixed(2)}</td>
        <td style="font-size:12px">${payIcon[o.payment_method] || '💳'} ${o.payment_method || '—'}</td>
        <td style="color:var(--text-3);font-size:12px">${date}</td>
        <td><span class="pill ${statusPill[status] || 'pill-gray'}">${status.charAt(0).toUpperCase() + status.slice(1)}</span></td>
        <td>
          <div class="tbl-actions">
            <button class="btn-sm" onclick="Admin.openEditOrder('${o.id}','${o.status}')">Status</button>
            <button class="btn-danger" onclick="Admin.cancelOrder('${o.id}')">Cancel</button>
          </div>
        </td>
      </tr>`;
    }).join('');
  },

  filterOrders(status, btn) {
    document.querySelectorAll('.ftab').forEach(t => t.classList.remove('active'));
    if (btn) btn.classList.add('active');
    this.renderOrders(status === 'all' ? ALL_ORDERS : ALL_ORDERS.filter(o => o.status === status));
  },

  _updateOrderTabs(orders) {
    const counts = { all: orders.length, pending:0, paid:0, shipped:0, delivered:0, cancelled:0 };
    orders.forEach(o => { if (counts[o.status] !== undefined) counts[o.status]++; });
    Object.entries(counts).forEach(([k,v]) => {
      const el = document.getElementById('otab-' + k);
      if (el) el.textContent = v;
    });
  },

  openEditOrder(id, currentStatus) {
    document.getElementById('edit-order-id').value     = id;
    document.getElementById('edit-order-ref').value    = '#' + id.slice(0,8).toUpperCase();
    document.getElementById('edit-order-status').value = currentStatus;
    this.openModal('modal-order-status');
  },

  async saveOrderStatus() {
    const id     = document.getElementById('edit-order-id').value;
    const status = document.getElementById('edit-order-status').value;
    try {
      const { error } = await getSb().from('orders').update({ status }).eq('id', id);
      if (error) throw error;
      showToast('Order status updated to ' + status, 'success');
      this.closeModal('modal-order-status');
      await this.loadOrders();
    } catch(e) { showToast('Update failed: ' + e.message, 'error'); }
  },

  async cancelOrder(id) {
    if (!confirm('Cancel this order?')) return;
    try {
      const { error } = await getSb().from('orders').update({ status: 'cancelled' }).eq('id', id);
      if (error) throw error;
      showToast('Order cancelled', 'success');
      await this.loadOrders();
    } catch(e) { showToast('Failed: ' + e.message, 'error'); }
  },

  /* ── OVERVIEW ── */
  renderOverview() {
    const totalUsers    = ALL_USERS.length;
    const clients       = ALL_USERS.filter(u => u.role === 'client').length;
    const sellers       = ALL_USERS.filter(u => u.role === 'seller').length;
    const totalRevenue  = ALL_ORDERS.reduce((s, o) => s + Number(o.total_price), 0);
    const totalOrders   = ALL_ORDERS.length;
    const totalProducts = ALL_PRODUCTS.length;

    // Stat cards
    const set = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v; };
    set('ov-users',        totalUsers);
    set('ov-users-sub',    `${clients} clients · ${sellers} sellers`);
    set('ov-revenue',      `RM ${totalRevenue.toLocaleString('en-MY', { minimumFractionDigits:2, maximumFractionDigits:2 })}`);
    set('ov-revenue-sub',  `${totalOrders} orders total`);
    set('ov-orders',       totalOrders);
    set('ov-orders-sub',   `${ALL_ORDERS.filter(o=>o.status==='pending').length} pending`);
    set('ov-products',     totalProducts);
    set('ov-products-sub', 'active listings');
    set('ov-chart-total',  `RM ${totalRevenue.toLocaleString('en-MY', { minimumFractionDigits:2, maximumFractionDigits:2 })}`);

    // Role breakdown
    const breakdownEl = document.getElementById('role-breakdown');
    const max = Math.max(clients, sellers, 1);
    breakdownEl.innerHTML = `
      <div class="metric-item"><span class="metric-label">Clients (Buyers)</span><div class="metric-bar-wrap"><div class="metric-bar" style="width:${Math.round(clients/max*100)}%;background:var(--accent)"></div></div><span class="metric-val">${clients}</span></div>
      <div class="metric-item"><span class="metric-label">Sellers</span><div class="metric-bar-wrap"><div class="metric-bar" style="width:${Math.round(sellers/max*100)}%;background:var(--blue)"></div></div><span class="metric-val">${sellers}</span></div>`;

    // Recent users
    const recentUsersEl = document.getElementById('recent-users');
    const recent5 = ALL_USERS.slice(0, 5);
    const colors = ['#16a34a','#3b82f6','#f59e0b','#8b5cf6','#ef4444'];
    recentUsersEl.innerHTML = recent5.map((u, i) => {
      const initial = (u.full_name || u.email || '?')[0].toUpperCase();
      const role    = u.role || 'client';
      const pillCls = role === 'seller' ? 'pill-blue' : 'pill-green';
      const date    = new Date(u.created_at).toLocaleDateString('en-MY', { day:'2-digit', month:'short' });
      return `
      <div style="display:flex;align-items:center;gap:10px;padding:10px 16px;border-bottom:1px solid var(--border)">
        <div class="user-av" style="background:${colors[i%colors.length]};width:28px;height:28px;font-size:11px">${initial}</div>
        <div style="flex:1">
          <div style="font-size:13px;font-weight:600;color:var(--text)">${u.full_name || '—'}</div>
          <div style="font-size:11px;color:var(--text-3)">${u.email || '—'}</div>
        </div>
        <span class="pill ${pillCls}" style="font-size:10px">${role}</span>
        <span style="font-size:11px;color:var(--text-4)">${date}</span>
      </div>`;
    }).join('') || `<div class="empty">No users yet</div>`;

    // Recent orders
    const recentOrdersEl = document.getElementById('recent-orders');
    const recentO = ALL_ORDERS.slice(0, 5);
    const statusCol = { pending:'var(--orange)', paid:'var(--blue)', shipped:'var(--blue)', delivered:'var(--accent)', cancelled:'var(--red)' };
    recentOrdersEl.innerHTML = recentO.map(o => {
      const status = o.status || 'pending';
      return `
      <div style="display:flex;align-items:center;gap:10px;padding:10px 16px;border-bottom:1px solid var(--border)">
        <div style="width:8px;height:8px;border-radius:99px;background:${statusCol[status]||'var(--text-3)'};flex-shrink:0"></div>
        <div style="flex:1">
          <div style="font-size:13px;font-weight:600;color:var(--text)">${o.buyer?.full_name || '—'}</div>
          <div style="font-size:11px;color:var(--text-3)">${o.products?.name || '—'}</div>
        </div>
        <span style="font-size:13px;font-weight:700;color:var(--text)">RM ${parseFloat(o.total_price).toFixed(2)}</span>
      </div>`;
    }).join('') || `<div class="empty">No orders yet</div>`;

    // Overview chart
    this._renderChart('overview-chart', ALL_ORDERS);
  },

  /* ── ANALYTICS ── */
  renderAnalytics() {
    const totalRevenue  = ALL_ORDERS.reduce((s, o) => s + Number(o.total_price), 0);
    const totalOrders   = ALL_ORDERS.length;
    const avgOrder      = totalOrders > 0 ? totalRevenue / totalOrders : 0;
    const activeSellers = new Set(ALL_ORDERS.map(o => o.seller?.full_name)).size;
    const now           = new Date();
    const monthStart    = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
    const monthOrders   = ALL_ORDERS.filter(o => o.created_at >= monthStart);

    const set = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v; };
    const fmt = v => `RM ${v.toLocaleString('en-MY', { minimumFractionDigits:2, maximumFractionDigits:2 })}`;
    set('an-revenue',     fmt(totalRevenue));
    set('an-revenue-sub', `${monthOrders.length} orders this month`);
    set('an-orders',      totalOrders);
    set('an-orders-sub',  `${monthOrders.length} this month`);
    set('an-avg',         fmt(avgOrder));
    set('an-sellers',     activeSellers);
    set('an-sellers-sub', 'with at least 1 sale');

    // Top sellers
    const sellerRevMap = {};
    ALL_ORDERS.forEach(o => {
      const name = o.seller?.full_name || 'Unknown';
      sellerRevMap[name] = (sellerRevMap[name] || 0) + Number(o.total_price);
    });
    const topSellers = Object.entries(sellerRevMap).sort((a,b) => b[1]-a[1]).slice(0, 5);
    const maxRev = topSellers[0]?.[1] || 1;
    document.getElementById('top-sellers-list').innerHTML = topSellers.length
      ? topSellers.map(([name, rev], i) => `
          <div style="display:flex;align-items:center;gap:10px;padding:10px 16px;border-bottom:1px solid var(--border)">
            <span style="font-size:12px;font-weight:700;color:var(--text-3);width:16px">${i+1}</span>
            <div style="flex:1">
              <div style="font-size:13px;font-weight:600;color:var(--text)">${name}</div>
              <div style="margin-top:4px;height:3px;background:var(--bg-3);border-radius:99px;overflow:hidden"><div style="height:100%;width:${Math.round(rev/maxRev*100)}%;background:var(--accent);border-radius:99px"></div></div>
            </div>
            <span style="font-size:13px;font-weight:700;color:var(--accent)">RM ${rev.toLocaleString()}</span>
          </div>`)
        .join('')
      : `<div class="empty">No sales yet</div>`;

    // Payment method breakdown
    const payMap = {};
    ALL_ORDERS.forEach(o => { const m = o.payment_method || 'Unknown'; payMap[m] = (payMap[m]||0)+1; });
    const payMax = Math.max(...Object.values(payMap), 1);
    const payLabels = { FPX:'Online Banking (FPX)', CREDIT_CARD:'Credit / Debit Card', TNG:"Touch 'n Go eWallet", COD:'Cash on Delivery' };
    document.getElementById('payment-breakdown').innerHTML = Object.entries(payMap).length
      ? Object.entries(payMap).sort((a,b) => b[1]-a[1]).map(([k,v]) => `
          <div class="metric-item">
            <span class="metric-label">${payLabels[k]||k}</span>
            <div class="metric-bar-wrap"><div class="metric-bar" style="width:${Math.round(v/payMax*100)}%;background:var(--blue)"></div></div>
            <span class="metric-val">${v} orders</span>
          </div>`).join('')
      : `<div class="empty">No orders yet</div>`;

    // Analytics chart
    this._renderChart('analytics-chart', ALL_ORDERS, 30);
  },

  /* ── CHART ── */
  _renderChart(containerId, orders, days = 240) {
    const container = document.getElementById(containerId);
    if (!container) return;
    const buckets = 8;
    const now = Date.now();
    const msTotal = days * 86400000;
    const msPerBucket = msTotal / buckets;
    const heights = Array(buckets).fill(0);
    const labels  = [];

    for (let i = 0; i < buckets; i++) {
      const d = new Date(now - (buckets - i) * msPerBucket);
      labels.push(d.toLocaleString('en-MY', { month: 'short' }));
    }

    orders.forEach(o => {
      const t   = new Date(o.created_at).getTime();
      const idx = Math.min(Math.floor((t - (now - msTotal)) / msPerBucket), buckets - 1);
      if (idx >= 0) heights[idx] += Number(o.total_price);
    });

    const max = Math.max(...heights, 1);
    container.innerHTML = heights.map((v, i) => `
      <div class="chart-bar-group">
        <div class="chart-bar ${i === heights.length - 1 ? 'accent' : ''}" style="height:${Math.round(v/max*100)}%">
          <div class="bar-tip">RM ${v.toLocaleString()}</div>
        </div>
        <div class="chart-label">${labels[i]}</div>
      </div>`).join('');
  },

  async setPeriod(period, btn) {
    document.querySelectorAll('#page-analytics .btn-sm').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    const days = { '30d': 30, '90d': 90, '1y': 365 }[period] || 30;
    const since = new Date(Date.now() - days * 86400000).toISOString();
    const filtered = ALL_ORDERS.filter(o => o.created_at >= since);
    this._renderChart('analytics-chart', filtered, days);
  },

  /* ── GLOBAL SEARCH ── */
  globalSearch(q) {
    if (!q.trim()) return;
    const s = q.toLowerCase();
    const matchedUsers    = ALL_USERS.filter(u => (u.full_name||'').toLowerCase().includes(s) || (u.email||'').toLowerCase().includes(s));
    const matchedProducts = ALL_PRODUCTS.filter(p => (p.name||'').toLowerCase().includes(s));
    if (matchedUsers.length) {
      this.nav('users', document.querySelector('.nav-item:nth-child(2)'));
      this.renderUsers(matchedUsers);
    } else if (matchedProducts.length) {
      this.nav('products', document.querySelector('.nav-item:nth-child(3)'));
      this.renderProducts(matchedProducts);
    } else {
      showToast('No results found for "' + q + '"', 'info');
    }
  },

  /* ── SETTINGS ── */
  saveSettings() {
    showToast('Settings saved', 'success');
  },
};

/* ═══════════════════════════════════════════
   BOOT
═══════════════════════════════════════════ */
document.addEventListener('DOMContentLoaded', async () => {
  // Verify this is an admin session
  try {
    const { data } = await getSb().auth.getSession();
    if (data?.session) {
      const { data: profile } = await getSb()
        .from('profiles').select('role').eq('id', data.session.user.id).single();
      if (profile && profile.role !== 'admin') {
        window.location.href = profile.role === 'seller' ? 'dashboard-seller.html' : 'dashboard-client.html';
        return;
      }
    }
    // Allow admin shortcut (no session) — admin logged in via CONFIG bypass
  } catch(e) { /* admin shortcut — no session needed */ }

  // Load all data
  await Admin.loadAll();

  // Keyboard: Escape closes modals
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') {
      ['modal-edit-user','modal-add-user','modal-order-status'].forEach(id =>
        document.getElementById(id).classList.remove('open')
      );
    }
  });

  // Close modals on backdrop click
  document.querySelectorAll('.modal-backdrop').forEach(el => {
    el.addEventListener('click', e => { if (e.target === el) el.classList.remove('open'); });
  });
});