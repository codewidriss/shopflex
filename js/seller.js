

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
  currentConversationId: null,
  currentBuyerId: null,

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

    // Load messages when tab is opened
    if (page === 'messages') {
      this.loadConversations();
    }
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
        revenue:   parseFloat(((p.sales_count || 0) * p.price).toFixed(2)),
        image_url: p.image_url || null,
      }));
      this.renderProducts();
      this.renderTopProducts();
      await this.loadStats();
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
          products(name, image_url),
          buyer:profiles!orders_buyer_id_fkey(full_name, email)
        `)
        .eq('seller_id', _currentSellerId)
        .order('created_at', { ascending: false });
      if (error) throw error;

      ORDERS = (data || []).map(o => ({
        id:        '#' + o.id.slice(0, 8).toUpperCase(),
        rawId:     o.id,
        buyer:     o.buyer?.full_name || o.buyer?.email || 'Unknown',
        product:   o.products?.name || '—',
        image_url: o.products?.image_url || null,
        date:      new Date(o.created_at).toLocaleDateString('en-MY', { day:'2-digit', month:'short', year:'numeric' }),
        amount:    Number(o.total_price).toFixed(2),
        status:    o.status,
        payment:   o.payment_method || '—',
      }));

      this.renderOrders(ORDERS);
      this.renderRecentOrders();

      // Update order tab counts
      const counts = { all: ORDERS.length, pending: 0, paid: 0, shipped: 0, delivered: 0, cancelled: 0 };
      ORDERS.forEach(o => { if (counts[o.status] !== undefined) counts[o.status]++; });
      counts.pending += counts.paid; // treat paid same as pending for display
      const setTab = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };
      setTab('otab-all',       counts.all);
      setTab('otab-pending',   counts.pending);
      setTab('otab-shipped',   counts.shipped);
      setTab('otab-delivered', counts.delivered);
      setTab('otab-cancelled', counts.cancelled);

      // Update sidebar badge with pending count
      const badge = document.getElementById('orders-badge');
      if (badge) {
        badge.textContent = counts.pending;
        badge.style.display = counts.pending > 0 ? 'inline-flex' : 'none';
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
    tbody.innerHTML = data.map(o => {
      const thumb = o.image_url
        ? `<img src="${o.image_url}" style="width:32px;height:32px;object-fit:cover;border-radius:6px;border:1px solid var(--border);flex-shrink:0" />`
        : `<div style="width:32px;height:32px;background:var(--gray-100);border-radius:6px;display:flex;align-items:center;justify-content:center;font-size:14px;flex-shrink:0">📦</div>`;
      return `
      <tr>
        <td style="font-weight:600;font-size:12px;color:var(--text-2)">${o.id}</td>
        <td>${o.buyer}</td>
        <td style="color:var(--text-2)"><div style="display:flex;align-items:center;gap:8px">${thumb}<span>${o.product}</span></div></td>
        <td style="color:var(--text-3);font-size:12px">${o.date}</td>
        <td style="font-weight:600">RM ${o.amount}</td>
        <td><span title="${o.payment}">${paymentIcon[o.payment] || '💳'} <span style="font-size:11px;color:var(--text-3)">${o.payment}</span></span></td>
        <td><span class="status-pill ${statusMap[o.status] || ''}">${o.status.charAt(0).toUpperCase() + o.status.slice(1)}</span></td>
        <td>
          <div class="tbl-actions">
            ${o.status === 'pending' || o.status === 'paid' ? `<button class="tbl-btn" onclick="Dash.markShipped('${o.rawId}')">Ship</button>` : ''}
            ${o.status === 'shipped'  ? `<button class="tbl-btn" onclick="Dash.markDelivered('${o.rawId}')">Delivered</button>` : ''}
          </div>
        </td>
      </tr>`;
    }).join('');
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

  /* ── LOAD STATS ── */
  async loadStats() {
    if (!_currentSellerId) return;
    try {
      const now        = new Date();
      const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();

      const [ordersRes, productsRes] = await Promise.all([
        getSb().from('orders').select('total_price, status, created_at').eq('seller_id', _currentSellerId),
        getSb().from('products').select('id', { count: 'exact', head: true }).eq('seller_id', _currentSellerId),
      ]);

      const orders       = ordersRes.data  || [];
      const productCount = productsRes.count ?? 0;
      const monthOrders  = orders.filter(o => o.created_at >= monthStart);
      const revenue      = monthOrders.reduce((s, o) => s + Number(o.total_price), 0);
      const totalOrders  = orders.length;
      const pending      = orders.filter(o => o.status === 'pending').length;
      const totalRevenue = orders.reduce((s, o) => s + Number(o.total_price), 0);
      const avgOrder     = totalOrders > 0 ? (totalRevenue / totalOrders) : 0;

      const fmt = v => `RM ${v.toLocaleString('en-MY', { minimumFractionDigits:2, maximumFractionDigits:2 })}`;
      const set = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };

      // Overview stat cards
      set('stat-revenue',       fmt(revenue));
      set('stat-revenue-sub',   `${monthOrders.length} order${monthOrders.length !== 1 ? 's' : ''} this month`);
      set('stat-orders',        totalOrders);
      set('stat-orders-sub',    `${pending} pending`);
      set('stat-products',      productCount);
      set('stat-products-sub',  'active listings');
      set('stat-pending',       pending);
      set('stat-pending-sub',   pending > 0 ? 'Awaiting shipment' : 'All caught up ✓');

      // Revenue chart header
      set('stat-revenue-chart', fmt(revenue));

      // Analytics stat cards
      set('analytics-revenue',     fmt(totalRevenue));
      set('analytics-revenue-sub', `${monthOrders.length} this month`);
      set('analytics-orders',      totalOrders);
      set('analytics-orders-sub',  `${monthOrders.length} this month`);
      set('analytics-avg',         fmt(avgOrder));
      set('analytics-pending',     pending);
      set('analytics-pending-sub', pending > 0 ? 'Need shipment' : 'All fulfilled ✓');

      // Build live revenue chart from real monthly data (last 8 months)
      this.renderLiveChart(orders);

    } catch(e) {
      console.error('loadStats:', e.message);
    }
  },

  /* ── LIVE REVENUE CHART ── */
  renderLiveChart(orders) {
    // Group orders by month, last 8 months
    const now = new Date();
    const months = [];
    for (let i = 7; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      months.push({
        label: d.toLocaleString('en-MY', { month: 'short' }),
        year:  d.getFullYear(),
        month: d.getMonth(),
        total: 0,
      });
    }
    orders.forEach(o => {
      const d = new Date(o.created_at);
      const slot = months.find(m => m.year === d.getFullYear() && m.month === d.getMonth());
      if (slot) slot.total += Number(o.total_price);
    });

    const labels  = months.map(m => m.label);
    const heights = months.map(m => m.total);
    this.renderChart('revenue-chart',   heights, labels);
    this.renderChart('analytics-chart', heights, labels);
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
    container.innerHTML = recent.map(o => {
      const thumb = o.image_url
        ? `<img src="${o.image_url}" style="width:36px;height:36px;object-fit:cover;border-radius:8px;flex-shrink:0" />`
        : `<div class="order-icon" style="font-size:18px;width:36px;height:36px;background:var(--gray-100);border-radius:8px;display:flex;align-items:center;justify-content:center">📦</div>`;
      return `
      <div class="order-row">
        ${thumb}
        <div class="order-info">
          <div class="order-name">${o.product}</div>
          <div class="order-meta">${o.buyer} · ${o.id} · ${o.date}</div>
        </div>
        <div style="text-align:right">
          <div class="order-amount">RM ${o.amount}</div>
          <div class="status-pill ${statusMap[o.status] || ''}" style="margin-top:4px">${o.status.charAt(0).toUpperCase() + o.status.slice(1)}</div>
        </div>
      </div>`;
    }).join('');
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
    container.innerHTML = sorted.map((p, i) => {
      const thumb = p.image_url
        ? `<img src="${p.image_url}" style="width:32px;height:32px;object-fit:cover;border-radius:6px;flex-shrink:0" />`
        : `<div class="rank-img" style="background:var(--gray-100);border-radius:6px;width:32px;height:32px;display:flex;align-items:center;justify-content:center;font-size:14px">📦</div>`;
      return `
      <div class="product-rank-row">
        <div class="rank-num">${i + 1}</div>
        ${thumb}
        <div class="rank-info">
          <div class="rank-name">${p.name}</div>
          <div class="rank-sales">${p.sales} sold</div>
        </div>
        <div class="rank-bar-wrap"><div class="rank-bar-fill" style="width:${Math.round(p.revenue/maxRevenue*100)}%"></div></div>
        <div class="rank-rev">RM ${p.revenue.toLocaleString()}</div>
      </div>`;
    }).join('');
  },

  /* ── REVENUE CHART ── */
  renderChart(containerId, heights, labels) {
    const defaultLabels = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug'];
    const data   = heights || [0,0,0,0,0,0,0,0];
    const lbls   = labels  || defaultLabels;
    const max    = Math.max(...data, 1); // avoid division by zero
    const container = document.getElementById(containerId);
    if (!container) return;
    container.innerHTML = data.map((v, i) => `
      <div class="chart-bar-group">
        <div class="chart-bar ${i === data.length - 1 ? 'active' : ''}" style="height:${Math.round(v/max*100)}%">
          <div class="bar-tooltip">RM ${v.toLocaleString()}</div>
        </div>
        <div class="chart-label">${lbls[i] || ''}</div>
      </div>
    `).join('');
  },

  /* ── LOAD CONVERSATIONS FROM SUPABASE ── */
  async loadConversations() {
    const container = document.getElementById('convo-list-container');
    container.innerHTML = `<div style="padding:20px;text-align:center;color:var(--text-3);font-size:13px">Loading conversations…</div>`;
    try {
      // Fetch conversations for this seller
      const { data: conversations, error: convError } = await getSb()
        .from('conversations')
        .select('*, messages(content, created_at, sender_id)')
        .eq('seller_id', _currentSellerId)
        .order('updated_at', { ascending: false });
      
      if (convError) throw convError;

      if (!conversations || conversations.length === 0) {
        container.innerHTML = `<div style="padding:20px;text-align:center;color:var(--text-3);font-size:13px">No conversations yet</div>`;
        return;
      }

      // Fetch buyer info for each conversation
      const convoItems = [];
      for (const conv of conversations) {
        const { data: buyer, error: buyerError } = await getSb()
          .from('profiles')
          .select('id, full_name')
          .eq('id', conv.buyer_id)
          .single();

        const lastMsg = conv.messages && conv.messages.length > 0 
          ? conv.messages[conv.messages.length - 1]
          : null;

        const lastMsgPreview = lastMsg 
          ? lastMsg.content.substring(0, 40) + (lastMsg.content.length > 40 ? '…' : '')
          : 'No messages yet';

        const buyerName = buyer?.full_name || `Buyer #${conv.buyer_id.slice(0, 8)}`;
        const initial = buyerName.charAt(0).toUpperCase();

        convoItems.push({
          id: conv.id,
          buyer_id: conv.buyer_id,
          buyer_name: buyerName,
          initial: initial,
          last_message: lastMsgPreview,
          timestamp: conv.updated_at,
          unread: conv.unread_count || 0,
        });
      }

      // Render conversations
      container.innerHTML = convoItems.map((item, idx) => {
        const unreadDot = item.unread > 0 
          ? '<div class="unread-dot"></div>'
          : '';
        const timeStr = this.formatTime(new Date(item.timestamp));
        return `
        <div class="convo-item" onclick="Dash.openChat('${item.id}', '${item.buyer_id}', '${item.buyer_name}', '${item.initial}')">
          <div class="convo-av" style="background:linear-gradient(135deg,${this.getGradient(idx)}">${item.initial}</div>
          <div class="convo-meta">
            <div class="convo-name">${item.buyer_name}</div>
            <div class="convo-preview">${item.last_message}</div>
          </div>
          <div style="display:flex;flex-direction:column;align-items:flex-end;gap:4px">
            <div class="convo-time">${timeStr}</div>
            ${unreadDot}
          </div>
        </div>
        `;
      }).join('');
    } catch (e) {
      console.error('loadConversations:', e.message);
      container.innerHTML = `<div style="padding:20px;text-align:center;color:var(--red);font-size:13px">Error loading conversations: ${e.message}</div>`;
    }
  },

  /* ── OPEN CHAT & LOAD MESSAGES ── */
  async openChat(conversationId, buyerId, buyerName, initial) {
    // Update active state
    const clickedEl = event?.currentTarget;
    document.querySelectorAll('.convo-item').forEach(c => c.classList.remove('active'));
    if (clickedEl) clickedEl.classList.add('active');

    // Update chat header
    document.getElementById('chat-av').textContent = initial;
    document.getElementById('chat-name').textContent = buyerName;

    // Load messages
    const messagesContainer = document.getElementById('chat-messages');
    messagesContainer.innerHTML = `<div style="padding:20px;text-align:center;color:var(--text-3);font-size:13px">Loading messages…</div>`;

    // Store current conversation
    this.currentConversationId = conversationId;
    this.currentBuyerId = buyerId;

    try {
      const { data: messages, error: msgError } = await getSb()
        .from('messages')
        .select('*')
        .eq('conversation_id', conversationId)
        .order('created_at', { ascending: true });

      if (msgError) throw msgError;

      if (!messages || messages.length === 0) {
        messagesContainer.innerHTML = `<div style="padding:20px;text-align:center;color:var(--text-3);font-size:13px">No messages yet. Start the conversation!</div>`;
        return;
      }

      // Render messages
      messagesContainer.innerHTML = messages.map(msg => {
        const isSeller = msg.sender_id === _currentSellerId;
        const time = new Date(msg.created_at).toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'});
        return `
        <div class="msg ${isSeller ? 'out' : 'in'}">
          <div class="msg-bubble">${msg.content}</div>
          <div class="msg-time">${time}</div>
        </div>
        `;
      }).join('');

      messagesContainer.scrollTop = messagesContainer.scrollHeight;

      // Enable input
      document.getElementById('chat-input-field').disabled = false;
      document.querySelector('.send-btn').disabled = false;

      // Subscribe to new messages (real-time)
      this.subscribeToMessages(conversationId);
    } catch (e) {
      console.error('openChat:', e.message);
      messagesContainer.innerHTML = `<div style="padding:20px;text-align:center;color:var(--red);font-size:13px">Error loading messages: ${e.message}</div>`;
    }
  },

  /* ── SUBSCRIBE TO REAL-TIME MESSAGES ── */
  currentMessageSubscription: null,
  subscribeToMessages(conversationId) {
    // Unsubscribe from previous
    if (this.currentMessageSubscription) {
      this.currentMessageSubscription.unsubscribe();
    }

    // Subscribe to new messages
    this.currentMessageSubscription = getSb()
      .channel(`messages:conversation_id=eq.${conversationId}`)
      .on('postgres_changes', { 
        event: 'INSERT', 
        schema: 'public', 
        table: 'messages',
        filter: `conversation_id=eq.${conversationId}`
      }, (payload) => {
        const newMsg = payload.new;
        const isSeller = newMsg.sender_id === _currentSellerId;
        const time = new Date(newMsg.created_at).toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'});
        
        const msgEl = document.createElement('div');
        msgEl.className = `msg ${isSeller ? 'out' : 'in'}`;
        msgEl.innerHTML = `
          <div class="msg-bubble">${newMsg.content}</div>
          <div class="msg-time">${time}</div>
        `;
        
        document.getElementById('chat-messages').appendChild(msgEl);
        document.getElementById('chat-messages').scrollTop = document.getElementById('chat-messages').scrollHeight;
      })
      .subscribe();
  },

  /* ── SEND MESSAGE ── */
  async sendMessage() {
    const input = document.getElementById('chat-input-field');
    const content = input.value.trim();

    if (!content || !this.currentConversationId) return;

    try {
      // Insert message
      const { data: newMsg, error: msgError } = await getSb()
        .from('messages')
        .insert({
          conversation_id: this.currentConversationId,
          sender_id: _currentSellerId,
          content: content,
        })
        .select()
        .single();

      if (msgError) throw msgError;

      // Update conversation timestamp
      const { error: updateError } = await getSb()
        .from('conversations')
        .update({ updated_at: new Date().toISOString() })
        .eq('id', this.currentConversationId);

      if (updateError) throw updateError;

      // Clear input
      input.value = '';

      // Reload conversations to update timestamps
      this.loadConversations();
    } catch (e) {
      console.error('sendMessage:', e.message);
      showToast(`Error sending message: ${e.message}`, 'error');
    }
  },

  /* ── FILTER CONVERSATIONS ── */
  filterConversations(query) {
    const items = document.querySelectorAll('.convo-item');
    items.forEach(item => {
      const name = item.querySelector('.convo-name').textContent.toLowerCase();
      item.style.display = name.includes(query.toLowerCase()) ? 'flex' : 'none';
    });
  },

  /* ── HELPER: FORMAT TIME ── */
  formatTime(date) {
    const now = new Date();
    const diff = now - date;
    const mins = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);

    if (mins < 1) return 'Just now';
    if (mins < 60) return `${mins}m`;
    if (hours < 24) return `${hours}h`;
    if (days < 7) return `${days}d`;
    
    return date.toLocaleDateString();
  },

  /* ── HELPER: GET AVATAR GRADIENT ── */
  getGradient(idx) {
    const gradients = [
      '#059669, #10b981',
      '#7c3aed, #6d28d9',
      '#b45309, #d97706',
      '#0369a1, #0284c7',
      '#be185d, #db2777',
      '#0f766e, #14b8a6',
      '#7c2d12, #c2410c',
      '#4c1d95, #6d28d9',
    ];
    return gradients[idx % gradients.length];
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
  async setPeriod(period, btn) {
    document.querySelectorAll('.period-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');

    // Build real chart data for chosen period
    const periodDays = { '7d': 7, '30d': 30, '90d': 90, '1y': 365 };
    const days = periodDays[period] || 30;
    const since = new Date(Date.now() - days * 86400000).toISOString();

    try {
      const { data: orders } = await getSb()
        .from('orders')
        .select('total_price, created_at')
        .eq('seller_id', _currentSellerId)
        .gte('created_at', since);

      // Bucket into 8 equal segments
      const buckets = 8;
      const msPerBucket = (days * 86400000) / buckets;
      const now = Date.now();
      const heights = Array(buckets).fill(0);
      const labels  = Array(buckets).fill('');

      for (let i = 0; i < buckets; i++) {
        const bucketStart = new Date(now - (buckets - i) * msPerBucket);
        labels[i] = bucketStart.toLocaleDateString('en-MY', period === '1y' ? { month: 'short' } : { day: 'numeric', month: 'short' });
      }

      (orders || []).forEach(o => {
        const t = new Date(o.created_at).getTime();
        const idx = Math.min(Math.floor((t - (now - days * 86400000)) / msPerBucket), buckets - 1);
        if (idx >= 0) heights[idx] += Number(o.total_price);
      });

      this.renderChart('analytics-chart', heights, labels);
    } catch(e) {
      showToast('Could not load chart data', 'error');
    }
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
    await Dash.loadProducts(); // also calls loadStats internally
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
