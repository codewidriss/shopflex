# Shopflex 🛍️

> Multi-portal e-commerce marketplace — CSE 6234 Software Design · Term 2610 · Multimedia University

A full-stack marketplace with three separate portals (Seller, Client, Admin), built with vanilla HTML/CSS/JS and Supabase as the backend. This README is your guide to running the project, understanding the codebase, and continuing the remaining design pattern implementations.

---

## Table of Contents

1. [Quick start](#1-quick-start)
2. [Project structure](#2-project-structure)
3. [Database setup](#3-database-setup)
4. [How authentication works](#4-how-authentication-works)
5. [The three portals](#5-the-three-portals)
6. [Design patterns implemented](#6-design-patterns-implemented)
7. [Design patterns remaining (your work)](#7-design-patterns-remaining-your-work)
8. [Key Supabase queries reference](#8-key-supabase-queries-reference)
9. [Common errors and fixes](#9-common-errors-and-fixes)
10. [Team notes](#10-team-notes)

---

## 1. Quick start

### Prerequisites
- [VS Code](https://code.visualstudio.com/) with the **Live Server** extension installed
- A browser (Chrome recommended)
- Access to the shared Supabase project (accept the invite email)

### Steps

```bash
# 1. Clone the repo
git clone <your-repo-url>
cd shopflex

# 2. Open in VS Code
code .

# 3. Right-click index.html → Open with Live Server
#    Opens at http://localhost:5500
```

> ⚠️ **Do NOT open HTML files by double-clicking them.** Supabase Auth requires HTTP (`http://localhost:...`), not the `file://` protocol. Always use Live Server or a local server.

The Supabase credentials are already in `js/config.js` — no setup needed if you accepted the team invite.

---

## 2. Project structure

```
shopflex/
├── index.html               ← Public landing page
├── auth.html                ← Sign in / Create account (2-step signup)
├── dashboard-seller.html    ← Seller portal
├── dashboard-client.html    ← Client (buyer) portal
├── dashboard-admin.html     ← Admin console
│
├── css/
│   ├── base.css             ← Design tokens, resets, animations, toasts
│   ├── landing.css          ← Landing page styles
│   ├── auth-page.css        ← Auth page styles
│   └── seller.css           ← Seller dashboard styles
│
├── js/
│   ├── config.js            ← Supabase URL + anon key + admin bypass
│   ├── auth.js              ← Landing page slide-in panel auth
│   ├── auth-page.js         ← auth.html logic (sign in, sign up, routing)
│   ├── seller.js            ← Seller dashboard + OrderObserver (Pattern 2)
│   ├── state.js             ← Client global state, helpers, boot()
│   ├── client.js            ← Client product grid, cart, orders, messages
│   └── dashboard-client.js  ← Factory Pattern + CheckoutService (Pattern 1)
│
└── supabase-setup.sql       ← Full database setup (run once in Supabase)
```

---

## 3. Database setup

The database is already set up on the shared Supabase project. **You don't need to run the SQL** unless you're working on a fresh project.

If you need to reset or create a new Supabase project:

1. Go to [supabase.com](https://supabase.com) → your project
2. Click **SQL Editor** → **New query**
3. Paste the contents of `supabase-setup.sql`
4. Click **Run**

### Tables overview

| Table | What it stores |
|-------|---------------|
| `profiles` | User info: name, role (`client`/`seller`/`admin`), phone |
| `products` | Listings created by sellers. Key cols: `price`, `stock_quantity`, `image_url`, `seller_id` |
| `cart_items` | Persistent cart. One row per `(user_id, product_id)` pair |
| `wishlist` | Saved products. Same structure as cart_items |
| `orders` | One row per product group per checkout. Has `unit_price`, `total_price`, `payment_method`, `status` |
| `order_items` | Line items within an order. Stores `unit_price` snapshot so price changes don't affect history |
| `conversations` | One row per buyer–seller pair. Unique constraint on `(buyer_id, seller_id)` |
| `messages` | Chat messages linked to a conversation |

### Important column notes

- **`products` has `image_url`** (a URL string), **NOT `emoji`**. If you see `column products_1.emoji does not exist`, your query is wrong. Use `image_url`.
- **`orders` requires `unit_price NOT NULL`**. Always pass `unit_price: product.price` when inserting.
- **`orders.transaction_id`** stores the payment gateway reference string. Add it if missing:
  ```sql
  ALTER TABLE orders ADD COLUMN IF NOT EXISTS transaction_id text;
  ```

---

## 4. How authentication works

```
User opens auth.html
        │
        ├─ Sign in → supabase.auth.signInWithPassword()
        │            → fetch profiles.role
        │            → redirect to correct dashboard
        │
        └─ Sign up → Step 1: pick role (client / seller)
                     Step 2: name, email, password
                     → supabase.auth.signUp()
                     → upsert profiles row with role
                     → redirect to correct dashboard
```

### Admin bypass
The admin never touches Supabase auth. In `auth-page.js`:
```js
if (email === CONFIG.ADMIN_EMAIL && password === CONFIG.ADMIN_PASSWORD) {
  // skip Supabase, go straight to dashboard-admin.html
}
```
Admin credentials: `admin@shopflex.com` / `ShopflexAdmin2610!`

### Session protection
Every dashboard runs this at boot:
```js
const { data: { session } } = await _sb.auth.getSession();
if (!session) { window.location.href = 'auth.html'; return; }
```
If the session doesn't match the portal role, the user is redirected to the correct one.

---

## 5. The three portals

### Seller portal (`dashboard-seller.html` + `js/seller.js`)

| Page | What it does |
|------|-------------|
| Overview | Revenue, order counts, top products chart |
| Products | Table of seller's listings. Delete product. Search/filter |
| Add Product | Form → inserts row into `products` table |
| Orders | Real Supabase query. Ship / Delivered buttons update `orders.status` |
| Messages | Conversation list → chat thread with buyers |
| Analytics | Revenue chart, category donut |
| Settings | Profile edit, notification toggles |

**Real-time:** `OrderObserver.subscribe(sellerId)` opens a Supabase Realtime channel. When a buyer places an order (`INSERT` on `orders` with `seller_id = currentSellerId`), the seller gets a bell notification and toast immediately without refreshing.

---

### Client portal (`dashboard-client.html` + `js/state.js` + `js/client.js` + `js/dashboard-client.js`)

| Page | What it does |
|------|-------------|
| Browse | Product grid from Supabase. Search, filter by category, sort |
| Cart | Persistent cart (Supabase `cart_items`). Qty controls |
| Wishlist | Saved products from Supabase `wishlist` table |
| My Orders | Orders from Supabase filtered by `buyer_id` |
| Messages | Chat with sellers. Real-time incoming message push |
| Account | Edit name, phone. Change password |

**Checkout flow (3 steps):**
1. Delivery info (name, address, city, postcode)
2. Payment method selection (FPX / Credit Card / TNG / COD)
3. Order review → `CheckoutService.checkout()` called → Factory Pattern runs

---

### Admin portal (`dashboard-admin.html`)

| Page | What it does |
|------|-------------|
| Overview | Platform GMV, user count, listings, recent orders |
| Users | All profiles. Approve/suspend accounts |
| Listings | All products across all sellers. Approve/pause/remove |
| All orders | Every order on the platform |

---

## 6. Design patterns implemented

### Pattern 1: Factory Method — Payment Gateway

**File:** `js/dashboard-client.js`

**Problem:** The checkout needs to support FPX, Credit Card, Touch 'n Go, and Cash on Delivery. Each has different logic. Without a pattern, checkout would have a giant `if/else` block and break every time a new method is added.

**Solution:** Factory Method pattern with a Creator layer.

```
IPaymentGateway              ← Product interface
    ↑ FPXBankTransferPayment ← Concrete Product A
    ↑ CreditCardPayment      ← Concrete Product B
    ↑ TNGWalletPayment       ← Concrete Product C
    ↑ CODPayment             ← Concrete Product D

PaymentGatewayCreator        ← Creator (abstract)
    createGateway()          ← the factory method
    processOrder()           ← someOperation() — uses IPaymentGateway only

    ↑ FPXCreator             ← Concrete Creator A → returns FPXBankTransferPayment
    ↑ CreditCardCreator      ← Concrete Creator B → returns CreditCardPayment
    ↑ TNGCreator             ← Concrete Creator C → returns TNGWalletPayment
    ↑ CODCreator             ← Concrete Creator D → returns CODPayment

PaymentGatewayFactory        ← Registry: maps 'FPX' → FPXCreator etc.
CheckoutService              ← Client: only calls PaymentGatewayFactory.getCreator()
```

**How checkout uses it:**
```js
// CheckoutService.checkout() — never names a concrete class
const creator = PaymentGatewayFactory.getCreator(paymentMethodKey); // e.g. 'FPX'
const result  = await creator.processOrder(total, 'MYR', { orderRef });
// creator.processOrder() calls this.createGateway() internally
// createGateway() returns the correct concrete product
// processOrder() calls gateway.processPayment() through the interface
```

**To add a new payment method (e.g. GrabPay):**
1. Create `class GrabPayPayment extends IPaymentGateway { ... }`
2. Create `class GrabPayCreator extends PaymentGatewayCreator { createGateway() { return new GrabPayPayment(); } }`
3. Call `PaymentGatewayFactory.register('GRABPAY', () => new GrabPayCreator())`
4. **No other file changes needed.**

---

### Pattern 2: Observer — Real-time Order Notifications

**Files:** `js/seller.js` (seller side), `js/state.js` (client side)

**Seller side — new order notification:**
```js
// Subject: Supabase Realtime (postgres_changes on orders INSERT)
// Observer: OrderObserver

OrderObserver.subscribe(sellerId);
// Opens WebSocket channel filtered to seller_id = currentSellerId
// When buyer places order → _onNewOrder(payload) fires automatically
// Effects: toast, bell badge, notification card, table refresh
```

**Client side — order status updates:**
```js
// Subject: Supabase Realtime (orders UPDATE)
// Observer: NotifCenter

_sb.channel('client-orders-' + profile.id)
  .on('postgres_changes', { event: 'UPDATE', table: 'orders',
      filter: `buyer_id=eq.${profile.id}` },
    payload => NotifCenter._onOrderUpdate(payload.new))
  .subscribe();
// Status changes (shipped, delivered, cancelled) push notification cards
```

---

## 7. Design patterns remaining (your work)

### Pattern 3: Strategy — Discount & Pricing

**This is the component to implement next.**

**Where it plugs in:** `js/dashboard-client.js` inside `CheckoutService.checkout()`

**Current code (hardcoded discount):**
```js
const grandTotal = subtotal * 0.80;  // ← replace this
```

**Target structure:**
```js
// Strategy interface
class IDiscountStrategy {
  apply(subtotal, cartItems) { throw new Error('Not implemented'); }
  getLabel()                  { throw new Error('Not implemented'); }
}

// Concrete strategies
class PercentageDiscount extends IDiscountStrategy { ... }  // e.g. 20% off
class FixedAmountDiscount extends IDiscountStrategy { ... } // e.g. RM 10 off
class BuyXGetYFree        extends IDiscountStrategy { ... } // buy 2 get 1 free
class BundleDiscount      extends IDiscountStrategy { ... } // phone+case = RM 50 off
class SeasonalPromotion   extends IDiscountStrategy { ... } // 12.12 sale

// Context
class PricingEngine {
  constructor(strategy) { this._strategy = strategy; }
  setStrategy(s)        { this._strategy = s; }
  calculate(subtotal, cartItems) { return this._strategy.apply(subtotal, cartItems); }
}
```

**Integration in CheckoutService:**
```js
const strategy   = DiscountStrategyFactory.get(request.promoCode || 'DEFAULT');
const engine     = new PricingEngine(strategy);
const grandTotal = engine.calculate(subtotal, items);
```

**UI hint:** Add a promo code input to the checkout step 3 (review) form. Pass the entered code to `checkout()` as `request.promoCode`. The strategy factory looks up the code and returns the correct strategy object.

---

## 8. Key Supabase queries reference

### Load seller's products
```js
const { data } = await _sb
  .from('products')
  .select('*')
  .eq('seller_id', sellerId)
  .order('created_at', { ascending: false });
```

### Load seller's orders (with buyer info)
```js
const { data } = await _sb
  .from('orders')
  .select(`
    id, status, quantity, unit_price, total_price, payment_method, created_at,
    products(name, image_url),
    buyer:profiles!orders_buyer_id_fkey(full_name, email)
  `)
  .eq('seller_id', sellerId)
  .order('created_at', { ascending: false });
```

### Load client products (with seller info)
```js
const { data } = await _sb
  .from('products')
  .select('id, name, image_url, category, price, stock_quantity, description, created_at, profiles!products_seller_id_fkey(id, full_name, store_name)')
  .gt('stock_quantity', 0)
  .order('created_at', { ascending: false });
```

### Insert an order
```js
await _sb.from('orders').insert({
  buyer_id:       profile.id,
  seller_id:      sellerId,
  product_id:     product.id,
  quantity:       qty,
  unit_price:     product.price,     // ← required, NOT NULL
  total_price:    discountedTotal,
  payment_method: 'FPX',             // ← from Factory Pattern selection
  transaction_id: result.transactionId,
  status:         'pending',
});
```

### Send a message
```js
await _sb.from('messages').insert({
  conversation_id: convoId,
  sender_id:       profile.id,
  content:         text,
});
// Also update the conversation's updated_at and unread flag:
await _sb.from('conversations')
  .update({ updated_at: new Date().toISOString(), unread_seller: true })
  .eq('id', convoId);
```

---

## 9. Common errors and fixes

| Error | Cause | Fix |
|-------|-------|-----|
| `column products_1.emoji does not exist` | Query selects `emoji` which doesn't exist | Change query to use `image_url` |
| `null value in column "unit_price"` | Order insert missing `unit_price` | Add `unit_price: product.price` to insert payload |
| `Database not ready. Please run the SQL setup first` | `profiles` table doesn't exist | Run `supabase-setup.sql` in Supabase SQL Editor |
| `relation "order_items" does not exist` | `order_items` table missing | Run the `sql-patch-orders.sql` patch file |
| Blank page / no redirect after login | Session restored but `profiles.role` mismatch | Check `profiles` row exists for this user in Supabase dashboard |
| Supabase auth not working | Opening `file://` instead of `http://` | Use Live Server — right-click HTML → Open with Live Server |
| `Unsupported payment method: "X"` | Payment key not in Factory registry | Add `PaymentGatewayFactory.register('X', () => new XCreator())` |

---

## 10. Team notes

### Who owns what

| Component | Pattern | Status |
|-----------|---------|--------|
| Payment gateway (FPX, Card, TNG, COD) | Factory Method | ✅ Done |
| Seller order notifications | Observer (seller side) | ✅ Done |
| Client order status notifications | Observer (client side) | ✅ Done |
| Discount & pricing strategies | Strategy | 🔲 Remaining |

### Branches suggestion
```
main          ← stable, working version
feature/strategy-discount    ← Strategy Pattern work
feature/admin-dashboard      ← Admin improvements
```

### Supabase shared project
Everyone connects to the **same** Supabase project. The credentials are already in `js/config.js`. You just need to accept the team invite email to see the database in the Supabase dashboard.

### To add a new page or feature
1. Look at how an existing page loads data (e.g., `Dash.loadOrders()` in `seller.js`)
2. Write your Supabase query in the same style
3. Render to a `<div id="...">` element in the HTML
4. Call your function from the `nav()` method when the user clicks the sidebar item

### Diagrams needed (for the report)
Your teammates will need to draw:
- **Use Case Diagram** — actors: Client, Seller, Admin. Use cases from Section 5 of the Word doc
- **Class Diagram** — focus on the Factory Pattern hierarchy (see Section 5.1.2 table)
- **Sequence Diagram** — checkout flow: Client → CheckoutService → Factory → Creator → Gateway → Supabase
- **ERD** — tables from Section 3 of the Word doc
- **Observer Sequence Diagram** — Buyer places order → Supabase INSERT → Realtime push → Seller bell notification

---

*Shopflex · CSE 6234 Software Design · Term 2610 · Multimedia University · 2026*
