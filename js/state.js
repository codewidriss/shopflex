
/* ═══════════════════════════════════════════════════════
   STATE
═══════════════════════════════════════════════════════ */
let _sb, _user, _profile;
let _allProducts  = [];   // all fetched products
let _filteredProds = [];  // currently displayed
let _cart         = {};   // { productId: { product, qty } }
let _wishlist     = new Set();
let _allOrders    = [];
let _currentConvo = null;
let _checkoutStep = 1;

window._detailProduct = null;

/* ═══════════════════════════════════════════════════════
   TOAST
═══════════════════════════════════════════════════════ */
function showToast(msg, type='info') {
  const icons = { success:'✓', error:'✕', info:'ℹ' };
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  el.innerHTML = `<span class="toast-icon">${icons[type]||'ℹ'}</span><span>${msg}</span>`;
  document.getElementById('toast-wrap').appendChild(el);
  setTimeout(() => {
    el.style.transition = 'opacity .3s, transform .3s';
    el.style.opacity = '0'; el.style.transform = 'translateX(16px)';
    setTimeout(() => el.remove(), 350);
  }, 3000);
}

/* ═══════════════════════════════════════════════════════
   HELPERS
═══════════════════════════════════════════════════════ */
function relTime(d) {
  const s = (Date.now() - new Date(d)) / 1000;
  if (s < 60)   return 'now';
  if (s < 3600) return Math.floor(s/60) + 'm';
  if (s < 86400) return Math.floor(s/3600) + 'h';
  return Math.floor(s/86400) + 'd';
}
function updateBadges() {
  const cartCount = Object.values(_cart).reduce((s,i) => s + i.qty, 0);
  document.getElementById('sb-cart-count').textContent = cartCount;
  document.getElementById('cart-badge').textContent     = cartCount;
  document.getElementById('sb-wish-count').textContent  = _wishlist.size;
}
function closeDetailModal() { document.getElementById('detail-modal').classList.remove('open'); }
function closeCheckout()    { document.getElementById('checkout-modal').classList.remove('open'); _checkoutStep = 1; }

/* ═══════════════════════════════════════════════════════
   CLIENT CONTROLLER
═══════════════════════════════════════════════════════ */
const Client = {
  currentPage: 'browse',
  _orderFilter: 'all',
  _sortMode: 'newest',
  _catFilter: '',
  _searchQuery: '',

  /* ─ NAVIGATION ─ */
  nav(page, btn) {
    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
    document.getElementById('page-' + page).classList.add('active');
    document.querySelectorAll('.sb-item').forEach(i => i.classList.remove('active'));
    if (btn) btn.classList.add('active');
    const titles = { browse:'Browse', cart:'Cart', wishlist:'Wishlist', orders:'My Orders', messages:'Messages', account:'Account' };
    document.getElementById('topbar-title').textContent = titles[page] || page;
    this.currentPage = page;
    if (page === 'cart')      this.renderCart();
    if (page === 'wishlist')  this.renderWishlist();
    if (page === 'orders')    this.loadOrders();
    if (page === 'messages')  this.loadConversations();
  },

  /* ─ BROWSE ─ */
  async loadProducts() {
    if (!_sb) return;
    const { data, error } = await _sb
      .from('products')
      .select('id, name, image_url, category, price, stock_quantity, description, created_at, profiles!products_seller_id_fkey(id, full_name, store_name)')
      .gt('stock_quantity', 0)
      .order('created_at', { ascending: false });

    if (error) { showToast('Failed to load products', 'error'); return; }
    _allProducts = data || [];
    _filteredProds = [..._allProducts];
    this._applyFilters();
  },

  search(q) {
    this._searchQuery = q.toLowerCase().trim();
    this._applyFilters();
  },

  filterCat(cat, el) {
    this._catFilter = cat;
    document.querySelectorAll('.cat-pill').forEach(p => p.classList.remove('active'));
    el.classList.add('active');
    this._applyFilters();
  },

  sort(mode) {
    this._sortMode = mode;
    this._applyFilters();
  },

  _applyFilters() {
    let data = [..._allProducts];
    if (this._catFilter) data = data.filter(p => p.category === this._catFilter);
    if (this._searchQuery) data = data.filter(p =>
      p.name.toLowerCase().includes(this._searchQuery) ||
      (p.category||'').toLowerCase().includes(this._searchQuery) ||
      (p.profiles?.store_name||p.profiles?.full_name||'').toLowerCase().includes(this._searchQuery)
    );
    if (this._sortMode === 'price_asc')  data.sort((a,b) => a.price - b.price);
    if (this._sortMode === 'price_desc') data.sort((a,b) => b.price - a.price);
    if (this._sortMode === 'name')       data.sort((a,b) => a.name.localeCompare(b.name));
    _filteredProds = data;
    this.renderProducts(data);
  },

  renderProducts(data) {
    const grid = document.getElementById('product-grid');
    const count = document.getElementById('result-count');
    count.textContent = `${data.length} product${data.length !== 1 ? 's' : ''} found`;

    if (!data.length) {
      grid.innerHTML = `<div style="grid-column:1/-1"><div class="empty-state"><div class="empty-ico">🔍</div><div class="empty-title">No products found</div><div class="empty-sub">Try a different search or category.</div></div></div>`;
      return;
    }

    grid.innerHTML = data.map(p => {
      const sellerName = p.profiles?.store_name || p.profiles?.full_name || 'Seller';
      const inWish = _wishlist.has(p.id);
      const inCart = !!_cart[p.id];
      return `
      <div class="product-card" onclick="Client.openDetail('${p.id}')">
        <div class="product-img">
          ${p.stock_quantity <= 5 && p.stock_quantity > 0 ? `<div class="product-badge">Only ${p.stock_quantity} left</div>` : ''}
          ${p.image_url
            ? `<img src="${p.image_url}" alt="${p.name}" style="width:100%;height:100%;object-fit:cover;border-radius:inherit" />`
            : `<svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#ccc" stroke-width="1.5"><path d="M21 16V8a2 2 0 00-1-1.73l-7-4a2 2 0 00-2 0l-7 4A2 2 0 003 8v8a2 2 0 001 1.73l7 4a2 2 0 002 0l7-4A2 2 0 0021 16z"/></svg>`
          }
        </div>
        <div class="product-body">
          <div class="product-cat">${p.category || 'General'}</div>
          <div class="product-name">${p.name}</div>
          <div class="product-seller">by ${sellerName}</div>
          <div class="product-footer">
            <div class="product-price">RM ${parseFloat(p.price).toFixed(2)}</div>
            <button class="add-to-cart-btn ${inCart ? 'added' : ''}" onclick="event.stopPropagation();Client.addToCart(${JSON.stringify(p).replace(/"/g,'&quot;')})" title="Add to cart" id="atc-${p.id}">
              ${inCart
                ? `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><path d="M20 6L9 17l-5-5"/></svg>`
                : `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>`
              }
            </button>
          </div>
        </div>
      </div>`;
    }).join('');
  },

  openDetail(productId) {
    const p = _allProducts.find(x => x.id === productId);
    if (!p) return;
    window._detailProduct = p;

    document.getElementById('dm-title').textContent = p.name;
    const heroEl = document.getElementById('dm-emoji');
    heroEl.style.overflow = 'hidden';
    heroEl.innerHTML = p.image_url
      ? `<img src="${p.image_url}" alt="${p.name}" style="width:100%;height:100%;object-fit:cover" />`
      : `<svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="#ccc" stroke-width="1.5"><path d="M21 16V8a2 2 0 00-1-1.73l-7-4a2 2 0 00-2 0l-7 4A2 2 0 003 8v8a2 2 0 001 1.73l7 4a2 2 0 002 0l7-4A2 2 0 0021 16z"/></svg>`;
    document.getElementById('dm-cat').textContent    = p.category || '';
    document.getElementById('dm-name').textContent   = p.name;
    document.getElementById('dm-price').textContent  = `RM ${parseFloat(p.price).toFixed(2)}`;
    document.getElementById('dm-desc').textContent   = p.description || 'No description provided.';

    const stock = p.stock_quantity;
    const stockEl = document.getElementById('dm-stock');
    if (stock === 0)       stockEl.innerHTML = '<span style="color:var(--red);font-weight:600">⚠ Out of stock</span>';
    else if (stock <= 5)   stockEl.innerHTML = `<span style="color:var(--orange);font-weight:600">⚡ Only ${stock} left</span>`;
    else                   stockEl.innerHTML = `<span style="color:var(--green);font-weight:600">✓ ${stock} in stock</span>`;

    const seller = p.profiles;
    const sName = seller?.store_name || seller?.full_name || 'Seller';
    document.getElementById('dm-seller-av').textContent   = sName[0].toUpperCase();
    document.getElementById('dm-seller-name').textContent = sName;

    const inWish = _wishlist.has(p.id);
    const wishBtn = document.getElementById('dm-wish-btn');
    wishBtn.innerHTML = inWish
      ? `<svg width="14" height="14" viewBox="0 0 24 24" fill="var(--red)" stroke="var(--red)" stroke-width="2"><path d="M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 000-7.78z"/></svg> Saved`
      : `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 000-7.78z"/></svg> Save to Wishlist`;

    const cartBtn = document.getElementById('dm-cart-btn');
    if (stock === 0) {
      cartBtn.disabled = true; cartBtn.textContent = 'Out of Stock';
    } else {
      cartBtn.disabled = false;
      cartBtn.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/><path d="M1 1h4l2.68 13.39a2 2 0 001.99 1.61h9.72a2 2 0 001.99-1.61L23 6H6"/></svg> ${_cart[p.id] ? 'Add More to Cart' : 'Add to Cart'}`;
    }

    document.getElementById('detail-modal').classList.add('open');
  },

  /* ─ CART ─ */
  addToCart(p) {
    if (!p || p.stock_quantity === 0) return showToast('This item is out of stock', 'error');
    if (_cart[p.id]) {
      _cart[p.id].qty = Math.min(_cart[p.id].qty + 1, p.stock_quantity);
    } else {
      _cart[p.id] = { product: p, qty: 1 };
    }
    updateBadges();
    showToast(`${p.name} added to cart 🛒`, 'success');
    // Update button state in grid
    const btn = document.getElementById('atc-' + p.id);
    if (btn) {
      btn.classList.add('added');
      btn.innerHTML = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><path d="M20 6L9 17l-5-5"/></svg>`;
    }
  },

  updateQty(productId, delta) {
    if (!_cart[productId]) return;
    _cart[productId].qty += delta;
    if (_cart[productId].qty <= 0) {
      delete _cart[productId];
      // Reset grid button
      const btn = document.getElementById('atc-' + productId);
      if (btn) {
        btn.classList.remove('added');
        btn.innerHTML = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>`;
      }
    }
    updateBadges();
    this.renderCart();
  },

  renderCart() {
    const items = Object.values(_cart);
    const subEl = document.getElementById('cart-sub');
    const contentEl = document.getElementById('cart-content');

    if (!items.length) {
      subEl.textContent = '0 items';
      contentEl.innerHTML = `
        <div class="cart-empty">
          <div class="cart-empty-ico">🛒</div>
          <div class="cart-empty-title">Your cart is empty</div>
          <div class="cart-empty-sub">Browse the marketplace and add some items!</div>
          <button class="btn-primary" onclick="Client.nav('browse',null)">Browse Products</button>
        </div>`;
      return;
    }

    const subtotal = items.reduce((s, i) => s + i.product.price * i.qty, 0);
    subEl.textContent = `${items.length} item${items.length !== 1 ? 's' : ''}`;

    contentEl.innerHTML = `
      <div class="cart-layout">
        <div>
          <div class="cart-items">
            ${items.map(i => `
              <div class="cart-item">
                <div class="cart-item-emoji">
                  ${i.product.image_url
                    ? `<img src="${i.product.image_url}" alt="${i.product.name}" style="width:100%;height:100%;object-fit:cover;border-radius:10px" />`
                    : `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#ccc" stroke-width="1.5"><path d="M21 16V8a2 2 0 00-1-1.73l-7-4a2 2 0 00-2 0l-7 4A2 2 0 003 8v8a2 2 0 001 1.73l7 4a2 2 0 002 0l7-4A2 2 0 0021 16z"/></svg>`
                  }
                </div>
                <div class="cart-item-info">
                  <div class="cart-item-name">${i.product.name}</div>
                  <div class="cart-item-seller">by ${i.product.profiles?.store_name || i.product.profiles?.full_name || 'Seller'}</div>
                </div>
                <div class="qty-ctrl">
                  <button class="qty-btn" onclick="Client.updateQty('${i.product.id}',-1)">−</button>
                  <span class="qty-val">${i.qty}</span>
                  <button class="qty-btn" onclick="Client.updateQty('${i.product.id}',1)">+</button>
                </div>
                <div class="cart-item-price">RM ${(i.product.price * i.qty).toFixed(2)}</div>
                <button class="btn-danger" style="padding:6px 10px;margin-left:6px" onclick="Client.updateQty('${i.product.id}',-999)">
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a1 1 0 011-1h4a1 1 0 011 1v2"/></svg>
                </button>
              </div>`).join('')}
          </div>
        </div>
        <div class="order-summary">
          <div class="summary-title">Order Summary</div>
          <div class="summary-row"><span class="summary-label">Subtotal (${items.length} items)</span><span class="summary-val">RM ${subtotal.toFixed(2)}</span></div>
          <div class="summary-row"><span class="summary-label">Shipping</span><span class="summary-val">FREE</span></div>
          <hr class="summary-divider" />
          <div class="summary-row">
            <span class="summary-total-label">Total</span>
            <span class="summary-total-val">RM ${subtotal.toFixed(2)}</span>
          </div>
          <button class="checkout-btn" onclick="Client.openCheckout()">Proceed to Checkout</button>
        </div>
      </div>`;
  },

  /* ─ WISHLIST ─ */
  toggleWishlist(p) {
    if (!p) return;
    if (_wishlist.has(p.id)) {
      _wishlist.delete(p.id);
      showToast('Removed from wishlist', 'info');
    } else {
      _wishlist.add(p.id);
      showToast(`${p.name} saved to wishlist ❤️`, 'success');
    }
    updateBadges();
    if (this.currentPage === 'wishlist') this.renderWishlist();
    // Refresh detail button
    if (window._detailProduct?.id === p.id) this.openDetail(p.id);
  },

  renderWishlist() {
    const grid = document.getElementById('wishlist-grid');
    const items = _allProducts.filter(p => _wishlist.has(p.id));
    if (!items.length) {
      grid.innerHTML = `<div style="grid-column:1/-1"><div class="empty-state"><div class="empty-ico">🤍</div><div class="empty-title">Nothing saved yet</div><div class="empty-sub">Tap the heart on any product to save it here.</div><button class="btn-primary" onclick="Client.nav('browse',null)">Browse Products</button></div></div>`;
      return;
    }
    grid.innerHTML = items.map(p => `
      <div class="wishlist-card">
        <div class="wl-img">
          <button class="wl-remove" onclick="Client.toggleWishlist(${JSON.stringify(p).replace(/"/g,'&quot;')})">✕</button>
          ${p.image_url
            ? `<img src="${p.image_url}" alt="${p.name}" style="width:100%;height:100%;object-fit:cover;border-radius:inherit" />`
            : `<svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#ccc" stroke-width="1.5"><path d="M21 16V8a2 2 0 00-1-1.73l-7-4a2 2 0 00-2 0l-7 4A2 2 0 003 8v8a2 2 0 001 1.73l7 4a2 2 0 002 0l7-4A2 2 0 0021 16z"/></svg>`
          }
        </div>
        <div class="wl-body">
          <div class="wl-name">${p.name}</div>
          <div class="wl-price">RM ${parseFloat(p.price).toFixed(2)}</div>
          <button class="wl-add" onclick="Client.addToCart(${JSON.stringify(p).replace(/"/g,'&quot;')})">
            Add to Cart
          </button>
        </div>
      </div>`).join('');
  },

  /* ─ ORDERS ─ */
  async loadOrders() {
    if (!_sb || !_profile) return;
    document.getElementById('orders-list').innerHTML = '<div class="loading-state">Loading…</div>';
    const { data, error } = await _sb
      .from('orders')
      .select(`id, total_price, status, created_at,
               products(name, image_url),
               profiles!orders_seller_id_fkey(full_name, store_name)`)
      .eq('buyer_id', _profile.id)
      .order('created_at', { ascending: false });

    if (error) { showToast('Failed to load orders', 'error'); return; }
    _allOrders = data || [];

    // Counts
    const counts = { all: _allOrders.length, pending:0, shipped:0, delivered:0 };
    _allOrders.forEach(o => { if (counts[o.status] !== undefined) counts[o.status]++; });
    Object.keys(counts).forEach(k => {
      const el = document.getElementById('ocnt-' + k);
      if (el) el.textContent = counts[k];
    });
    document.getElementById('sb-order-count').textContent = counts.pending;

    this.renderOrders(this._orderFilter === 'all' ? _allOrders : _allOrders.filter(o => o.status === this._orderFilter));
  },

  renderOrders(data) {
    const el = document.getElementById('orders-list');
    if (!data.length) {
      el.innerHTML = `<div class="empty-state"><div class="empty-ico">📭</div><div class="empty-title">No orders here</div><div class="empty-sub">When you place orders, they'll appear here.</div><button class="btn-primary" onclick="Client.nav('browse',null)">Start Shopping</button></div>`;
      return;
    }
    const stepMap = { pending: 0, shipped: 1, delivered: 2, cancelled: -1 };
    const stepLabels = ['Placed','Shipped','Delivered'];
    el.innerHTML = data.map(o => {
      const step = stepMap[o.status] ?? 0;
      const sellerName = o.profiles?.store_name || o.profiles?.full_name || 'Seller';
      const trackHtml = o.status === 'cancelled'
        ? `<span class="pill pill-cancelled">Cancelled</span>`
        : `<div class="track-steps">
            ${stepLabels.map((lbl, i) => `
              ${i > 0 ? `<div class="track-line ${step >= i ? 'filled' : ''}"></div>` : ''}
              <div class="track-step ${step > i ? 'done' : step === i ? 'current' : ''}">
                <div class="track-step-dot">${step > i ? '✓' : ''}</div>
                <div class="track-step-label">${lbl}</div>
              </div>`).join('')}
          </div>`;
      return `
        <div class="order-card">
          <div class="order-card-head">
            <span class="order-id">#${o.id.substring(0,8).toUpperCase()}</span>
            <div style="display:flex;align-items:center;gap:10px">
              <span class="order-date">${new Date(o.created_at).toLocaleDateString('en-MY',{day:'2-digit',month:'short',year:'numeric'})}</span>
              <span class="pill pill-${o.status}">${o.status.charAt(0).toUpperCase()+o.status.slice(1)}</span>
            </div>
          </div>
          <div class="order-body">
            <div class="order-emoji">
              ${o.products?.image_url
                ? `<img src="${o.products.image_url}" alt="${o.products.name}" style="width:100%;height:100%;object-fit:cover;border-radius:10px" />`
                : `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#ccc" stroke-width="1.5"><path d="M21 16V8a2 2 0 00-1-1.73l-7-4a2 2 0 00-2 0l-7 4A2 2 0 003 8v8a2 2 0 001 1.73l7 4a2 2 0 002 0l7-4A2 2 0 0021 16z"/></svg>`
              }
            </div>
            <div class="order-info">
              <div class="order-name">${o.products?.name || '—'}</div>
              <div class="order-seller">Sold by ${sellerName}</div>
            </div>
            <div class="order-amt">RM ${parseFloat(o.total_price).toFixed(2)}</div>
          </div>
          <div class="order-foot">${trackHtml}</div>
        </div>`;
    }).join('');
  },

  filterOrders(status, btn) {
    document.querySelectorAll('.seg-btn').forEach(b => b.classList.remove('active'));
    if (btn) btn.classList.add('active');
    this._orderFilter = status;
    this.renderOrders(status === 'all' ? _allOrders : _allOrders.filter(o => o.status === status));
  },

  /* ─ CHECKOUT ─ */
  openCheckout() {
    if (!Object.keys(_cart).length) return showToast('Your cart is empty', 'error');
    _checkoutStep = 1;
    // Pre-fill from profile
    document.getElementById('co-name').value = _profile?.full_name || '';
    document.getElementById('co-addr').value = _profile?.address  || '';
    document.getElementById('checkout-modal').classList.add('open');
    this._renderCheckoutStep(1);
  },

  _renderCheckoutStep(step) {
    const bodyEl = document.getElementById('checkout-body');
    const footEl = document.getElementById('checkout-foot');
    // Update step dots
    [1,2,3].forEach(i => {
      const el = document.getElementById('cstep-' + i);
      el.className = 'cstep' + (i < step ? ' done' : i === step ? ' active' : '');
    });

    if (step === 1) {
      bodyEl.innerHTML = `
        <div class="fgroup"><label class="flabel">Full Name</label><input class="finput" id="co-name" value="${_profile?.full_name||''}" placeholder="Ahmad bin Ali" /></div>
        <div class="fgroup"><label class="flabel">Delivery Address</label><textarea class="ftextarea" id="co-addr" style="min-height:60px" placeholder="No. 12, Jalan…">${_profile?.address||''}</textarea></div>
        <div class="frow">
          <div class="fgroup" style="margin:0"><label class="flabel">City</label><input class="finput" id="co-city" placeholder="Kuala Lumpur" /></div>
          <div class="fgroup" style="margin:0"><label class="flabel">Postcode</label><input class="finput" id="co-post" placeholder="50450" /></div>
        </div>`;
      footEl.innerHTML = `<button class="btn-ghost" onclick="closeCheckout()">Cancel</button><button class="btn-primary" onclick="Client.checkoutNext()">Continue →</button>`;
    }
    if (step === 2) {
      const methods = [
        { key:'FPX',         emoji:'🏦', name:'Online Banking (FPX)',    desc:'Maybank, CIMB, RHB & more' },
        { key:'CREDIT_CARD', emoji:'💳', name:'Credit / Debit Card',     desc:'Visa, Mastercard, Amex' },
        { key:'TNG',         emoji:'📱', name:"Touch 'n Go eWallet",     desc:'Instant wallet payment' },
        { key:'COD',         emoji:'💵', name:'Cash on Delivery',        desc:'Pay when your order arrives' },
      ];
      bodyEl.innerHTML = `
        <div class="fgroup">
          <label class="flabel">Payment Method</label>
          <p style="font-size:11px;color:var(--text-4);margin:-2px 0 10px;display:flex;align-items:center;gap:5px">
            <span style="background:var(--blue-light);color:var(--blue);font-size:10px;font-weight:700;padding:2px 7px;border-radius:99px;text-transform:uppercase;letter-spacing:.04em">Factory Pattern</span>
            PaymentGatewayFactory creates the gateway at checkout
          </p>
          <div style="display:flex;flex-direction:column;gap:8px;margin-top:4px">
            ${methods.map((m,i) => `
              <label style="display:flex;align-items:center;gap:12px;padding:13px 14px;border:1.5px solid ${i===0?'var(--blue)':'var(--border)'};border-radius:10px;cursor:pointer;transition:border-color .15s,background .15s;background:${i===0?'var(--blue-light)':'var(--gray-50)'}" id="pm-label-${m.key}" onclick="selectPaymentMethod('${m.key}')">
                <input type="radio" name="pay" value="${m.key}" style="accent-color:var(--blue)" ${i===0?'checked':''} onchange="selectPaymentMethod('${m.key}')" />
                <span style="font-size:20px">${m.emoji}</span>
                <div>
                  <div style="font-size:14px;font-weight:600;color:var(--text)">${m.name}</div>
                  <div style="font-size:11px;color:var(--text-4);margin-top:1px">${m.desc}</div>
                </div>
                <span style="margin-left:auto;font-size:10px;font-weight:700;color:var(--text-4);font-family:monospace;background:var(--gray-100);padding:2px 7px;border-radius:6px">${m.key}</span>
              </label>`).join('')}
          </div>
        </div>`;
      footEl.innerHTML = `<button class="btn-ghost" onclick="Client._renderCheckoutStep(1);_checkoutStep=1">← Back</button><button class="btn-primary" onclick="Client.checkoutNext()">Review Order →</button>`;
    }
    if (step === 3) {
      const items = Object.values(_cart);
      const subtotal = items.reduce((s,i) => s + i.product.price * i.qty, 0);
      bodyEl.innerHTML = `
        <div style="background:var(--gray-50);border-radius:10px;padding:14px;margin-bottom:14px">
          ${items.map(i => `<div style="display:flex;justify-content:space-between;align-items:center;padding:6px 0;border-bottom:1px solid var(--border)">
            <span style="font-size:14px">${i.product.name} × ${i.qty}</span>
            <span style="font-weight:600;color:var(--text)">RM ${(i.product.price * i.qty).toFixed(2)}</span>
          </div>`).join('')}
          <div style="display:flex;justify-content:space-between;margin-top:10px">
            <span style="font-weight:700;color:var(--text)">Total</span>
            <span style="font-weight:700;font-size:16px;color:var(--blue)">RM ${subtotal.toFixed(2)}</span>
          </div>
        </div>
        <p style="font-size:12.5px;color:var(--text-4);text-align:center">By placing this order you agree to Shopflex's Terms of Service.</p>`;
      footEl.innerHTML = `<button class="btn-ghost" onclick="Client._renderCheckoutStep(2);_checkoutStep=2">← Back</button><button class="btn-primary" style="flex:1;justify-content:center" onclick="Client.placeOrder()">Place Order 🛒</button>`;
    }
  },

  checkoutNext() {
    _checkoutStep++;
    this._renderCheckoutStep(_checkoutStep);
  },

  async placeOrder() {
    if (!_sb || !_profile) return;
    const btn = document.querySelector('#checkout-foot .btn-primary');
    if (btn) { btn.disabled = true; btn.textContent = 'Processing payment…'; }

    const deliveryName = document.getElementById('co-name')?.value?.trim() || _profile.full_name || '';
    const deliveryAddr = document.getElementById('co-addr')?.value?.trim() || '';
    const deliveryCity = document.getElementById('co-city')?.value?.trim() || '';
    const deliveryPost = document.getElementById('co-post')?.value?.trim() || '';

    const selectedRadio    = document.querySelector('input[name="pay"]:checked');
    const paymentMethodKey = selectedRadio ? selectedRadio.value : 'FPX';

    try {
      const items = Object.values(_cart);
      if (!items.length) throw new Error('Your cart is empty.');

      // ── Factory Method Pattern ───────────────────────────────────
      // PaymentGatewayFactory.getCreator() returns a ConcreteCreator
      // typed as PaymentGatewayCreator (abstract) — placeOrder() never
      // references FPXCreator, CreditCardCreator, or any concrete class.
      const creator  = PaymentGatewayFactory.getCreator(paymentMethodKey);
      const subtotal = items.reduce((s,i) => s + i.product.price * i.qty, 0);
      const total    = parseFloat(subtotal.toFixed(2));

      // Creator's processOrder() calls createGateway() internally,
      // then calls processPayment() on the returned IPaymentGateway.
      if (btn) btn.textContent = 'Processing payment…';
      const payResult = await creator.processOrder(total, 'MYR', {
        orderRef:   `SF-${Date.now()}`,
        buyerId:    _profile.id,
        buyerEmail: _profile.email,
      });

      if (!payResult.success) {
        throw new Error(`Payment declined: ${payResult.errorMessage || 'Unknown error'}`);
      }

      if (btn) btn.textContent = 'Saving order…';

      // ── Group cart items by seller and insert orders ─────────────
      const bySeller = {};
      items.forEach(i => {
        const sid = i.product.seller_id || i.product.profiles?.id;
        if (!bySeller[sid]) bySeller[sid] = [];
        bySeller[sid].push(i);
      });

      for (const [sellerId, sellerItems] of Object.entries(bySeller)) {
        const sellerTotal = parseFloat(sellerItems.reduce((s,i) => s + i.product.price * i.qty, 0).toFixed(2));
        const firstItem   = sellerItems[0];

        const { data: order, error: oErr } = await _sb.from('orders').insert({
          buyer_id:       _profile.id,
          seller_id:      sellerId,
          product_id:     firstItem.product.id,
          quantity:       sellerItems.reduce((s,i) => s + i.qty, 0),
          unit_price:     firstItem.product.price,
          total_price:    sellerTotal,
          payment_method: paymentMethodKey,
          delivery_name:  deliveryName,
          delivery_addr:  deliveryAddr,
          delivery_city:  deliveryCity,
          delivery_post:  deliveryPost,
          status:         paymentMethodKey === 'COD' ? 'pending' : 'paid',
        }).select().single();
        if (oErr) throw oErr;

        const { error: iErr } = await _sb.from('order_items').insert(
          sellerItems.map(i => ({
            order_id:   order.id,
            product_id: i.product.id,
            seller_id:  sellerId,
            quantity:   i.qty,
            unit_price: i.product.price,
          }))
        );
        if (iErr) throw iErr;

        for (const i of sellerItems) {
          await _sb.from('products')
            .update({
              stock_quantity: Math.max(0, (i.product.stock_quantity || 0) - i.qty),
              sales_count: (i.product.sales_count || 0) + i.qty
            })
            .eq('id', i.product.id);
        }
      }

      _cart = {};
      updateBadges();
      closeCheckout();
      showToast(`Order placed via ${payResult.gatewayName}! 🎉`, 'success');
      setTimeout(() => this.nav('orders', null), 1200);

    } catch(e) {
      showToast('Order failed: ' + e.message, 'error');
      if (btn) { btn.disabled = false; btn.textContent = 'Place Order 🛒'; }
    }
  },

  /* ─ MESSAGES ─ */
  async loadConversations() {
    if (!_sb || !_profile) return;
    const { data, error } = await _sb
      .from('conversations')
      .select(`id, updated_at, unread_buyer,
               profiles!conversations_seller_id_fkey(id, full_name, store_name),
               messages(content, created_at, sender_id)`)
      .eq('buyer_id', _profile.id)
      .order('updated_at', { ascending: false });

    const listEl = document.getElementById('convo-list');
    if (error || !data?.length) {
      listEl.innerHTML = '<div class="empty-state" style="padding:20px"><div class="empty-ico" style="font-size:28px">💬</div><div class="empty-title" style="font-size:13px">No chats yet</div><div class="empty-sub" style="font-size:12px">Message a seller from a product page.</div></div>';
      return;
    }

    const colors = ['#007aff','#5856d6','#ff9500','#34c759','#ff3b30','#af52de'];
    listEl.innerHTML = data.map((c, i) => {
      const seller = c.profiles;
      const name = seller?.store_name || seller?.full_name || 'Seller';
      const lastMsg = (c.messages||[]).sort((a,b) => new Date(b.created_at)-new Date(a.created_at))[0];
      return `
      <div class="convo-item ${_currentConvo === c.id ? 'active' : ''}" onclick="Client.openChat('${c.id}','${name}','${colors[i%colors.length]}')">
        <div class="convo-av" style="background:${colors[i%colors.length]}">${name[0].toUpperCase()}</div>
        <div style="flex:1;min-width:0">
          <div class="convo-nm">${name}</div>
          <div class="convo-preview">${lastMsg?.content || 'No messages yet'}</div>
        </div>
        <div style="display:flex;flex-direction:column;align-items:flex-end;gap:4px">
          <div class="convo-time">${lastMsg ? relTime(lastMsg.created_at) : ''}</div>
          ${c.unread_buyer ? '<div class="unread-pip"></div>' : ''}
        </div>
      </div>`;
    }).join('');

    const unread = data.filter(c => c.unread_buyer).length;
    document.getElementById('sb-msg-count').textContent = unread;
  },

  async openChat(convoId, sellerName, color) {
    _currentConvo = convoId;
    document.querySelectorAll('.convo-item').forEach(e => e.classList.remove('active'));
    event?.currentTarget?.classList.add('active');

    document.getElementById('chat-head-av').textContent  = sellerName[0].toUpperCase();
    document.getElementById('chat-head-av').style.background = color;
    document.getElementById('chat-head-nm').textContent   = sellerName;
    document.getElementById('chat-head-status').textContent = '● Active';
    document.getElementById('chat-head-status').style.color = 'var(--green)';
    document.getElementById('chat-inp').disabled = false;

    const msgsEl = document.getElementById('chat-msgs');
    msgsEl.innerHTML = '<div class="loading-state">Loading…</div>';

    await _sb.from('conversations').update({ unread_buyer: false }).eq('id', convoId);

    const { data: msgs } = await _sb.from('messages').select('id,content,sender_id,created_at').eq('conversation_id', convoId).order('created_at', { ascending: true });

    if (!msgs?.length) { msgsEl.innerHTML = '<div class="empty-state"><div class="empty-ico">👋</div><div class="empty-title">Say hello!</div></div>'; return; }

    msgsEl.innerHTML = msgs.map(m => {
      const isOut = m.sender_id === _profile.id;
      const t = new Date(m.created_at).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'});
      return `<div class="msg ${isOut?'out':'in'}"><div class="msg-bbl">${m.content}</div><div class="msg-t">${t}</div></div>`;
    }).join('');
    msgsEl.scrollTop = msgsEl.scrollHeight;
  },

  async sendMsg() {
    const inp = document.getElementById('chat-inp');
    const content = inp.value.trim();
    if (!content || !_currentConvo || !_profile) return;
    inp.value = '';

    const { error } = await _sb.from('messages').insert({ conversation_id: _currentConvo, sender_id: _profile.id, content });
    if (error) return showToast('Send failed', 'error');

    await _sb.from('conversations').update({ updated_at: new Date().toISOString(), unread_seller: true }).eq('id', _currentConvo);

    const msgsEl = document.getElementById('chat-msgs');
    const t = new Date().toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'});
    const el = document.createElement('div');
    el.className = 'msg out';
    el.innerHTML = `<div class="msg-bbl">${content}</div><div class="msg-t">${t}</div>`;
    const empty = msgsEl.querySelector('.empty-state');
    if (empty) empty.remove();
    msgsEl.appendChild(el);
    msgsEl.scrollTop = msgsEl.scrollHeight;
  },

  async startChat(p) {
    if (!p || !_sb || !_profile) return;
    const sellerId = p.profiles?.id;
    if (!sellerId) return showToast('Seller info not available', 'error');

    // Check existing conversation
    const { data: existing } = await _sb.from('conversations').select('id').eq('buyer_id', _profile.id).eq('seller_id', sellerId).single();

    let convoId;
    if (existing) {
      convoId = existing.id;
    } else {
      const { data: created, error } = await _sb.from('conversations').insert({ buyer_id: _profile.id, seller_id: sellerId }).select().single();
      if (error) return showToast('Could not start chat: ' + error.message, 'error');
      convoId = created.id;
    }

    closeDetailModal();
    this.nav('messages', null);
    setTimeout(async () => {
      await this.loadConversations();
      const sellerName = p.profiles?.store_name || p.profiles?.full_name || 'Seller';
      this.openChat(convoId, sellerName, '#007aff');
    }, 200);
  },

  /* ─ ACCOUNT ─ */
  async saveProfile() {
    const name  = document.getElementById('acc-name').value.trim();
    const phone = document.getElementById('acc-phone').value.trim();
    if (!name) return showToast('Name is required', 'error');
    const { error } = await _sb.from('profiles').update({ full_name: name, phone }).eq('id', _profile.id);
    if (error) return showToast('Save failed: ' + error.message, 'error');
    _profile.full_name = name;
    document.getElementById('sb-name').textContent  = name;
    document.getElementById('sb-av').textContent    = name[0].toUpperCase();
    document.getElementById('acc-av').textContent   = name[0].toUpperCase();
    document.getElementById('acc-disp-name').textContent = name;
    showToast('Profile saved!', 'success');
  },

  async updatePassword() {
    const pw1 = document.getElementById('acc-pw1').value;
    const pw2 = document.getElementById('acc-pw2').value;
    if (!pw1 || pw1.length < 8) return showToast('Password must be at least 8 characters', 'error');
    if (pw1 !== pw2) return showToast('Passwords do not match', 'error');
    const { error } = await _sb.auth.updateUser({ password: pw1 });
    if (error) return showToast('Update failed: ' + error.message, 'error');
    showToast('Password updated!', 'success');
    document.getElementById('acc-pw1').value = '';
    document.getElementById('acc-pw2').value = '';
  },

  async logout() {
    try { await _sb?.auth.signOut(); } catch(e) {}
    showToast('Signing out…', 'info');
    setTimeout(() => window.location.href = 'index.html', 800);
  },
};

/* ═══════════════════════════════════════════════════════
   BOOT
═══════════════════════════════════════════════════════ */
async function boot() {
  try {
    _sb = supabase.createClient(CONFIG.SUPABASE_URL, CONFIG.SUPABASE_ANON_KEY);
  } catch(e) {
    showToast('Config not found — check js/config.js', 'error');
    return;
  }

  // Auth check
  const { data: { session } } = await _sb.auth.getSession();
  if (!session) { window.location.href = 'auth.html'; return; }
  _user = session.user;

  // Profile
  const { data: profile, error: pErr } = await _sb.from('profiles').select('*').eq('id', _user.id).single();
  if (pErr || !profile) { showToast('Profile not found', 'error'); return; }
  if (profile.role !== 'client') {
    window.location.href = 'dashboard-seller.html'; return;
  }
  _profile = profile;

  // Populate UI
  const name = profile.full_name || _user.email;
  document.getElementById('sb-name').textContent    = name;
  document.getElementById('sb-av').textContent      = name[0].toUpperCase();
  document.getElementById('acc-av').textContent     = name[0].toUpperCase();
  document.getElementById('acc-disp-name').textContent = name;
  document.getElementById('acc-name').value         = profile.full_name || '';
  document.getElementById('acc-email').value        = _user.email || '';
  document.getElementById('acc-phone').value        = profile.phone || '';

  // Load products on browse
  await Client.loadProducts();
  updateBadges();

  // Realtime: incoming messages
  _sb.channel('client-msgs')
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, async (payload) => {
      if (payload.new.sender_id !== _profile.id) {
        showToast('New message from seller! 💬', 'info');
        const badge = document.getElementById('sb-msg-count');
        badge.textContent = parseInt(badge.textContent || 0) + 1;
        if (Client.currentPage === 'messages') {
          Client.loadConversations();
          if (_currentConvo === payload.new.conversation_id) {
            const msgsEl = document.getElementById('chat-msgs');
            const t = new Date(payload.new.created_at).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'});
            const el = document.createElement('div');
            el.className = 'msg in';
            el.innerHTML = `<div class="msg-bbl">${payload.new.content}</div><div class="msg-t">${t}</div>`;
            msgsEl.appendChild(el);
            msgsEl.scrollTop = msgsEl.scrollHeight;
          }
        }
      }
    })
    .subscribe();

  // Realtime: order status updates
  _sb.channel('client-orders')
    .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'orders', filter: `buyer_id=eq.${_profile.id}` }, (payload) => {
      showToast(`Order status updated: ${payload.new.status} 📦`, 'info');
      if (Client.currentPage === 'orders') Client.loadOrders();
    })
    .subscribe();

  // Keyboard: Escape closes modals
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') { closeDetailModal(); closeCheckout(); }
  });
}

document.addEventListener('DOMContentLoaded', boot);
