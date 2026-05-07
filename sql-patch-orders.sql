-- ═══════════════════════════════════════════════════════════════
--  SHOPFLEX — SQL Patch: Orders + Order Items fix
--  Run this in Supabase → SQL Editor → New query → Run
--  Safe to run even if tables already exist (uses IF NOT EXISTS)
-- ═══════════════════════════════════════════════════════════════

-- ── 1. Fix the orders table ──────────────────────────────────────
-- Drop and recreate with all required columns including unit_price
-- and payment_method (needed by the Factory Pattern)

drop table if exists order_items cascade;
drop table if exists orders      cascade;

create table orders (
  id              uuid        primary key default gen_random_uuid(),
  buyer_id        uuid        not null references profiles(id) on delete restrict,
  seller_id       uuid        not null references profiles(id) on delete restrict,
  product_id      uuid        references products(id) on delete set null,
  quantity        integer     not null default 1 check (quantity > 0),
  unit_price      numeric     not null,              -- price per item at purchase time
  total_price     numeric     not null,              -- after discount
  payment_method  text        not null default 'FPX',-- e.g. FPX, CREDIT_CARD, TNG, COD
  delivery_name   text,
  delivery_addr   text,
  delivery_city   text,
  delivery_post   text,
  status          text        not null default 'pending'
                              check (status in ('pending','shipped','delivered','cancelled')),
  created_at      timestamptz not null default now()
);

create index orders_buyer_idx  on orders(buyer_id);
create index orders_seller_idx on orders(seller_id);
create index orders_status_idx on orders(status);

-- ── 2. Create order_items ────────────────────────────────────────
-- One row per product line within an order

create table order_items (
  id          uuid    primary key default gen_random_uuid(),
  order_id    uuid    not null references orders(id)   on delete cascade,
  product_id  uuid    references products(id)          on delete set null,
  seller_id   uuid    not null references profiles(id) on delete restrict,
  quantity    integer not null check (quantity > 0),
  unit_price  numeric not null,
  created_at  timestamptz not null default now()
);

create index order_items_order_idx on order_items(order_id);

-- ── 3. RLS for orders ────────────────────────────────────────────
alter table orders      enable row level security;
alter table order_items enable row level security;

-- Buyer sees their orders; seller sees orders for their products
create policy "orders: buyer or seller read"
  on orders for select
  using (buyer_id = auth.uid() or seller_id = auth.uid());

create policy "orders: buyer insert"
  on orders for insert
  with check (buyer_id = auth.uid());

create policy "orders: seller update status"
  on orders for update
  using (seller_id = auth.uid());

-- Order items: same participants
create policy "order_items: participant read"
  on order_items for select
  using (
    exists (
      select 1 from orders o
      where o.id = order_items.order_id
        and (o.buyer_id = auth.uid() or o.seller_id = auth.uid())
    )
  );

create policy "order_items: buyer insert"
  on order_items for insert
  with check (
    exists (
      select 1 from orders o
      where o.id = order_items.order_id
        and o.buyer_id = auth.uid()
    )
  );

-- ── 4. Enable realtime for orders ───────────────────────────────
alter publication supabase_realtime add table orders;

-- ── DONE ✓ ───────────────────────────────────────────────────────
-- Tables created / fixed: orders, order_items
-- All columns now match what dashboard-client.html inserts.
-- ─────────────────────────────────────────────────────────────────
