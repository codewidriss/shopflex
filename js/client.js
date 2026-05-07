// ─────────────────────────────────────────────
// INIT
// ─────────────────────────────────────────────
const grid = document.querySelector(".product-grid");
const cartCount = document.querySelector(".cart-count-badge");

let cart = [];

// ─────────────────────────────────────────────
// LOAD PRODUCTS
// ─────────────────────────────────────────────
async function loadProducts() {
  showSkeleton();

 const { data, error } = await _sb
    .from("products")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) {
    console.error("Error loading products:", error);
    grid.innerHTML = `<p style="color:red;">Failed to load products</p>`;
    return;
  }

  renderProducts(data);
}

// ─────────────────────────────────────────────
// SKELETON LOADER (FIXED)
// ─────────────────────────────────────────────
function showSkeleton() {
  grid.innerHTML = Array(8).fill(`
    <div class="product-card">
      <div class="product-img"></div>
      <div class="product-body">
        <div class="product-name">Loading...</div>
      </div>
    </div>
  `).join('');
}

// ─────────────────────────────────────────────
// RENDER PRODUCTS
// ─────────────────────────────────────────────
function renderProducts(products) {
  if (!products || products.length === 0) {
    grid.innerHTML = `<p>No products found</p>`;
    return;
  }

  grid.innerHTML = products.map(p => `
    <div class="product-card">
      <div class="product-img">${p.image || "—"}</div>
      
      <div class="product-body">
        <div class="product-cat">${p.category || "General"}</div>
        <div class="product-name">${p.name}</div>
        <div class="product-seller">Seller</div>

        <div class="product-footer">
          <div class="product-price">$${p.price}</div>
          
          <button class="add-to-cart-btn"
            onclick="addToCart('${p.id}', '${p.name}', ${p.price})">
            +
          </button>
        </div>
      </div>
    </div>
  `).join('');
}

// ─────────────────────────────────────────────
// CART SYSTEM (LOCAL)
// ─────────────────────────────────────────────
function addToCart(id, name, price) {
  const item = cart.find(i => i.id === id);

  if (item) {
    item.qty++;
  } else {
    cart.push({ id, name, price, qty: 1 });
  }

  updateCartUI();
}

// update cart badge
function updateCartUI() {
  const total = cart.reduce((sum, i) => sum + i.qty, 0);
  if (cartCount) cartCount.textContent = total;
}

// ─────────────────────────────────────────────
// WISHLIST (SUPABASE)
// ─────────────────────────────────────────────
async function addToWishlist(productId) {
  const user = (await supabase.auth.getUser()).data.user;

  if (!user) {
    alert("You must be logged in");
    return;
  }

  const { error } = await supabase.from("wishlist").insert({
    user_id: user.id,
    product_id: productId
  });

  if (error) {
    console.error(error);
  } else {
    alert("Added to wishlist ❤️");
  }
}

// ─────────────────────────────────────────────
// INIT LOAD
// ─────────────────────────────────────────────
loadProducts();