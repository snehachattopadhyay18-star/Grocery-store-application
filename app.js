/* ---------- state (nothing is stored in the browser) ---------- */
let products = [];
let cart = [];            // [{id, qty}] — the server's cart when logged in, in memory for guests
let user = null;
let activeCategory = "all";
let searchText = "";
let authMode = "signup";
let pendingCheckout = false;
let ordering = false;
let deliveryAddress = null;   // kept in memory only, cleared on logout

const $ = id => document.getElementById(id);
const money = n => "₹" + Number(n).toLocaleString("en-IN");
const esc = s => String(s).replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const findProduct = id => products.find(p => p.id === id);

const categories = [
  {key:"all", label:"🛒 All"}, {key:"Fruits", label:"🍎 Fruits"}, {key:"Vegetables", label:"🥕 Vegetables"},
  {key:"Dairy", label:"🥛 Dairy"}, {key:"Snacks", label:"🍪 Snacks"}, {key:"Beverages", label:"🥤 Beverages"}
];

/* ---------- helpers ---------- */
function imgFallback(img){ img.style.display = "none"; img.nextElementSibling.hidden = false; }

function toast(msg){
  const box = $("toasts");
  while (box.children.length >= 3) box.removeChild(box.firstChild);
  const t = document.createElement("div");
  t.className = "toast"; t.textContent = msg;
  box.appendChild(t);
  setTimeout(() => t.remove(), 2200);
}

function handleError(e){
  if (e.status === 401 && user) {
    setUser(null); cart = []; updateCart();
    toast("Session ended. Please log in again.");
  } else toast(e.message);
}

/* ---------- products ---------- */
async function loadProducts(){
  try {
    products = await api("/products");
  } catch (e) {
    $("productlist").innerHTML = `<div class="empty"><div style="font-size:48px">⚠️</div><p>${esc(e.message)}</p><button class="add" style="width:auto;padding:8px 22px" onclick="loadProducts()">Try again</button></div>`;
    return;
  }
  cart = cart.filter(it => findProduct(it.id));
  renderChips(); renderProducts(); buildPicks(); updateCart();
}

function renderChips(){
  $("chips").innerHTML = categories.map(c =>
    `<button class="chip ${c.key === activeCategory ? "on" : ""}" data-cat="${c.key}" aria-pressed="${c.key === activeCategory}">${c.label}</button>`).join("");
}

function qtyOf(id){ const it = cart.find(c => c.id === id); return it ? it.qty : 0; }

function actionHTML(p){
  const q = qtyOf(p.id), n = esc(p.name);
  if (q === 0) return p.stock > 0
    ? `<button class="add" data-action="inc">Add to cart</button>`
    : `<button class="add" disabled>Out of stock</button>`;
  return `<div class="step"><button data-action="dec" aria-label="Remove one ${n}">−</button><span>${q}</span><button data-action="inc" aria-label="Add one ${n}"${q >= p.stock ? " disabled" : ""}>+</button></div>`;
}

function cardHTML(p){
  return `<article class="product" data-id="${p.id}">
    <div class="thumb"><span class="tag ${esc(p.category)}">${esc(p.category)}</span>
      <img src="${esc(p.image)}" alt="${esc(p.name)}" loading="lazy" onerror="imgFallback(this)"><div class="fb" hidden>${esc(p.emoji)}</div></div>
    <div class="info"><h3>${esc(p.name)}</h3>
      <div class="pr"><span class="price">${money(p.price)}</span><span class="unit">${esc(p.unit)}</span></div>
      <div class="action">${actionHTML(p)}</div></div></article>`;
}

function renderProducts(){
  let list = products.slice();
  if (activeCategory !== "all") list = list.filter(p => p.category === activeCategory);
  if (searchText) list = list.filter(p => (p.name + " " + p.category).toLowerCase().includes(searchText));
  const sort = $("sortOption").value;
  if (sort === "name") list.sort((a, b) => a.name.localeCompare(b.name));
  else if (sort === "low") list.sort((a, b) => a.price - b.price);
  else if (sort === "high") list.sort((a, b) => b.price - a.price);

  $("resultCount").textContent = list.length + (list.length === 1 ? " product" : " products");
  $("productlist").innerHTML = list.length
    ? list.map(cardHTML).join("")
    : `<div class="empty"><div style="font-size:48px">🔎</div><p>No products match your search.</p><button class="add" style="width:auto;padding:8px 22px" onclick="clearFilters()">Clear search</button></div>`;
}

function clearFilters(){
  searchText = ""; activeCategory = "all"; $("searchBox").value = "";
  renderChips(); renderProducts();
}

function buildPicks(){
  const cards = products.map(p =>
    `<div class="pick"><div class="thumb"><img src="${esc(p.image)}" alt="${esc(p.name)}" loading="lazy" onerror="imgFallback(this)"><div class="fb" hidden>${esc(p.emoji)}</div></div>
      <b>${esc(p.name)}</b><small>${money(p.price)} ${esc(p.unit)}</small>
      <button class="add" onclick="changeQty('${p.id}',1)" aria-label="Add ${esc(p.name)} to cart">Add to cart</button></div>`).join("");
  $("mtrack").innerHTML = `<div class="mset">${cards}</div><div class="mset dup" aria-hidden="true" inert>${cards}</div>`;
}

$("chips").addEventListener("click", e => {
  const b = e.target.closest("[data-cat]"); if (!b) return;
  activeCategory = b.dataset.cat; renderChips(); renderProducts();
});
$("sortOption").addEventListener("change", renderProducts);
$("searchBox").addEventListener("input", e => { searchText = e.target.value.trim().toLowerCase(); renderProducts(); });

$("productlist").addEventListener("click", async e => {
  const b = e.target.closest("[data-action]"); if (!b || b.disabled) return;
  const id = b.closest(".product").dataset.id;
  await changeQty(id, b.dataset.action === "inc" ? 1 : -1);
  const card = document.querySelector(`.product[data-id="${id}"] .action`);
  const again = card && (card.querySelector(`[data-action="${b.dataset.action}"]:not([disabled])`) || card.querySelector("button"));
  if (again) again.focus();
});

/* ---------- cart ---------- */
function setCartFromServer(data){ cart = data.items.map(i => ({id: i.product_id, qty: i.qty})); }

async function loadServerCart(){
  setCartFromServer(await api("/cart"));
  updateCart();
}

async function changeQty(id, delta){
  const p = findProduct(id); if (!p) return;
  try {
    if (user) {
      setCartFromServer(await api("/cart/items", {method: "POST", body: {product_id: id, change: delta}}));
    } else {                                   // guest cart: kept in memory only
      const it = cart.find(c => c.id === id);
      const next = (it ? it.qty : 0) + delta;
      if (next > p.stock) { toast("Only " + p.stock + " " + p.name + " in stock"); return; }
      if (next <= 0) cart = cart.filter(c => c.id !== id);
      else if (it) it.qty = next;
      else cart.push({id, qty: next});
    }
  } catch (e) { handleError(e); return; }
  if (delta > 0) { toast(p.name + " added to cart ✓"); bump(); }
  updateCart();
}

async function removeItem(id){
  try {
    if (user) setCartFromServer(await api("/cart/items/" + id, {method: "DELETE"}));
    else cart = cart.filter(c => c.id !== id);
  } catch (e) { handleError(e); return; }
  updateCart();
}

function bump(){
  const b = $("cartCount"); b.classList.remove("bump"); void b.offsetWidth; b.classList.add("bump");
}

function cartTotalValue(){ return cart.reduce((s, it) => { const p = findProduct(it.id); return s + (p ? p.price * it.qty : 0); }, 0); }
function cartCountValue(){ return cart.reduce((s, it) => s + it.qty, 0); }

function updateCart(){
  const count = cartCountValue(), total = cartTotalValue();
  $("cartCount").textContent = count; $("drawerCount").textContent = count;
  $("totalAmount").textContent = total.toLocaleString("en-IN"); $("cartTotal").textContent = total.toLocaleString("en-IN");
  $("dFoot").hidden = cart.length === 0;

  $("cartItems").innerHTML = cart.length ? cart.map(it => {
    const p = findProduct(it.id); if (!p) return "";
    return `<div class="ci" data-id="${p.id}">
      <div class="im"><img src="${esc(p.image)}" alt="${esc(p.name)}" onerror="imgFallback(this)"><div class="fb" hidden>${esc(p.emoji)}</div></div>
      <div class="nm"><b>${esc(p.name)}</b><small>${money(p.price)} ${esc(p.unit)}</small>
        <div class="step"><button data-action="dec" aria-label="Remove one ${esc(p.name)}">−</button><span>${it.qty}</span><button data-action="inc" aria-label="Add one ${esc(p.name)}"${it.qty >= p.stock ? " disabled" : ""}>+</button></div></div>
      <div class="sd"><b>${money(p.price * it.qty)}</b><br><button class="rm" data-action="remove">Remove</button></div></div>`;
  }).join("") : `<div class="emptyCart"><div>🧺</div><p>Your cart is empty.</p><button class="add" style="width:auto;padding:8px 22px" onclick="closeCart();location.hash='shop'">Browse products</button></div>`;

  document.querySelectorAll(".product").forEach(c => {
    const p = findProduct(c.dataset.id);
    if (p) c.querySelector(".action").innerHTML = actionHTML(p);
  });
}

$("cartItems").addEventListener("click", async e => {
  const b = e.target.closest("[data-action]"); if (!b || b.disabled) return;
  const id = b.closest(".ci").dataset.id, a = b.dataset.action;
  const p = findProduct(id);
  if (a === "remove") { await removeItem(id); if (p) toast(p.name + " removed"); return; }
  await changeQty(id, a === "inc" ? 1 : -1);
  const row = document.querySelector(`.ci[data-id="${id}"] [data-action="${a}"]`);
  if (row) row.focus();
});

function showCart(){
  $("drawer").classList.add("open"); $("overlay").classList.add("open");
  document.body.classList.add("lock");
}
function closeCart(){
  $("drawer").classList.remove("open"); $("overlay").classList.remove("open");
  document.body.classList.remove("lock");
}

/* ---------- payment / order ---------- */
function showPayment(){
  if (cart.length === 0) { toast("Please add items to your cart first."); return; }
  if (!user) {                       // browsing is open to everyone, ordering needs an account
    pendingCheckout = true;
    closeCart();
    openAuth("signin", "Please sign in or create an account to place your order.");
    return;
  }
  openAddress();                     // step 1: delivery address, then step 2: payment
}
function openPayment(){
  $("paymentTotal").textContent = cartTotalValue().toLocaleString("en-IN");
  $("delivTo").innerHTML = addressSummaryHTML();
  $("paymentModal").classList.add("show");
}
function closePayment(){ $("paymentModal").classList.remove("show"); }
function otherPayment(method){ toast(method + " is not available right now. Please choose Cash on Delivery."); }

/* ---------- delivery address ---------- */
const ADDR_FIELDS = ["addrName", "addrPhone", "addrLine", "addrLandmark", "addrCity", "addrPin"];

function openAddress(){
  const a = deliveryAddress || {};
  $("addrName").value = a.name || (user ? user.name : "");
  $("addrPhone").value = a.phone || "";
  $("addrLine").value = a.line || "";
  $("addrLandmark").value = a.landmark || "";
  $("addrCity").value = a.city || "";
  $("addrPin").value = a.pincode || "";
  $("addrError").textContent = "";
  closePayment();
  $("addressModal").classList.add("show");
  const first = ADDR_FIELDS.map($).find(f => !f.value && f.id !== "addrLandmark");
  setTimeout(() => (first || $("addrName")).focus(), 50);
}
function closeAddress(){ $("addressModal").classList.remove("show"); }

function saveAddress(){
  const name = $("addrName").value.trim().replace(/\s+/g, " ");
  const phone = $("addrPhone").value.replace(/[\s-]/g, "").replace(/^(\+91|0)/, "");
  const line = $("addrLine").value.trim().replace(/\s+/g, " ");
  const landmark = $("addrLandmark").value.trim();
  const city = $("addrCity").value.trim();
  const pincode = $("addrPin").value.trim();
  const bad = (msg, field) => { $("addrError").textContent = msg; $(field).focus(); };

  if (name.length < 2)              return bad("Please enter your full name.", "addrName");
  if (!/^[6-9]\d{9}$/.test(phone)) return bad("Please enter a valid 10-digit mobile number.", "addrPhone");
  if (line.length < 8)              return bad("Please enter your house / flat number, street and area.", "addrLine");
  if (city.length < 2)              return bad("Please enter your city.", "addrCity");
  if (!/^[1-9]\d{5}$/.test(pincode)) return bad("Please enter a valid 6-digit PIN code.", "addrPin");

  deliveryAddress = {name, phone, line, landmark, city, pincode};
  closeAddress();
  openPayment();
}

function addressSummaryHTML(){
  const a = deliveryAddress; if (!a) return "";
  return `<b>${esc(a.name)}</b> · ${esc(a.phone)}<br>${esc(a.line)}${a.landmark ? ", " + esc(a.landmark) : ""}, ${esc(a.city)} - ${esc(a.pincode)}`;
}

$("addressModal").addEventListener("keydown", e => {
  if (e.key === "Enter" && e.target.tagName !== "TEXTAREA") saveAddress();
});

async function placeOrder(){
  if (!user) { closePayment(); showPayment(); return; }
  if (!deliveryAddress) { closePayment(); openAddress(); return; }
  if (ordering) return;
  ordering = true;
  try {
    const order = await api("/orders", {method: "POST", body: {payment_method: "COD", address: deliveryAddress}});
    const count = order.items.reduce((s, l) => s + l.qty, 0);
    $("sId").textContent = order.order_number;
    $("sItems").textContent = count + (count === 1 ? " item" : " items");
    $("sTotal").textContent = money(order.total);
    $("sAddr").textContent = deliveryAddress.name + ", " + deliveryAddress.city + " - " + deliveryAddress.pincode;
    cart = [];
    closePayment(); closeCart(); updateCart();
    $("successModal").classList.add("show");
    loadProducts();                  // refresh stock numbers
  } catch (e) {
    handleError(e);
    if (e.status === 409) {          // stock changed while the cart was open
      closePayment();
      await loadProducts();
      try { await loadServerCart(); } catch (err) {}
    }
  } finally { ordering = false; }
}
function closeSuccess(){ $("successModal").classList.remove("show"); }

document.addEventListener("keydown", e => {
  if (e.key !== "Escape") return;
  closeAuth(); closeAddress(); closePayment(); closeSuccess(); closeCart();
});

/* ---------- login / sign up ---------- */
function togglePw(){
  const i = $("authPassword"), show = i.type === "password";
  i.type = show ? "text" : "password"; $("pwToggle").textContent = show ? "Hide" : "Show";
}

function setAuthMode(mode){
  authMode = mode;
  $("authError").textContent = "";
  if (mode === "signin") {
    $("authTitle").textContent = "Welcome back, sign in to continue";
    $("authName").style.display = "none";
    $("authSubmit").textContent = "Sign in";
    $("authSwitch").innerHTML = "New here? <a href='#' onclick='toggleAuth();return false;'>Create an account</a>";
  } else {
    $("authTitle").textContent = "Create your account";
    $("authName").style.display = "block";
    $("authSubmit").textContent = "Sign up";
    $("authSwitch").innerHTML = "Already have an account? <a href='#' onclick='toggleAuth();return false;'>Sign in</a>";
  }
}
function openAuth(mode, msg){
  setAuthMode(mode || "signin");
  if (msg) $("authError").textContent = msg;
  $("authPage").classList.add("show");
  document.body.classList.add("lock");
  setTimeout(() => $("authEmail").focus(), 50);
}
function closeAuth(){
  $("authPage").classList.remove("show");
  document.body.classList.remove("lock");
  pendingCheckout = false;
}
function toggleAuth(){ setAuthMode(authMode === "signup" ? "signin" : "signup"); }

function setUser(u){
  user = u;
  if (!u) deliveryAddress = null;
  $("greetBox").hidden = !u; $("logoutBtn").hidden = !u; $("loginBtn").hidden = !!u;
  if (u) $("userName").textContent = u.name.split(" ")[0];
}

async function submitAuth(){
  const name = $("authName").value.trim();
  const email = $("authEmail").value.trim().toLowerCase();
  const password = $("authPassword").value;
  const error = $("authError");

  if (email === "" || password === "" || (authMode === "signup" && name === "")) {
    error.textContent = "Please fill in all the fields."; return;
  }
  if (authMode === "signup" && password.length < 6) {
    error.textContent = "Password must be at least 6 characters."; return;
  }

  $("authSubmit").disabled = true;
  try {
    const guestCart = cart.slice();               // items added before logging in
    const data = authMode === "signup"
      ? await api("/auth/signup", {method: "POST", body: {name, email, password}})
      : await api("/auth/login", {method: "POST", body: {email, password}});
    await onLoggedIn(data.user, guestCart);
  } catch (e) {
    if (authMode === "signup" && e.status === 409) { setAuthMode("signin"); }
    error.textContent = e.message;
  } finally { $("authSubmit").disabled = false; }
}

async function onLoggedIn(u, guestCart){
  setUser(u);
  for (const g of guestCart) {                    // move guest items into the server cart
    try { await api("/cart/items", {method: "POST", body: {product_id: g.id, change: g.qty}}); } catch (e) {}
  }
  try { await loadServerCart(); } catch (e) {}
  $("authPassword").value = "";
  $("authPage").classList.remove("show"); document.body.classList.remove("lock");
  if (pendingCheckout) {                          // carry on with the order they were placing
    pendingCheckout = false;
    showCart(); showPayment();
  }
}

async function logout(){
  try { await api("/auth/logout", {method: "POST"}); } catch (e) {}
  setUser(null); cart = [];
  $("authName").value = ""; $("authEmail").value = ""; $("authPassword").value = "";
  updateCart(); closeCart();
  toast("You have been logged out");
}

$("authPage").addEventListener("keydown", e => { if (e.key === "Enter") submitAuth(); });

/* ---------- start ---------- */
async function restoreSession(){            // the login cookie keeps you signed in after refresh
  try {
    setUser(await api("/auth/me"));
    await loadServerCart();
  } catch (e) { setUser(null); }
}

(async function init(){
  renderChips();
  updateCart();
  await loadProducts();
  await restoreSession();
})();

/* ---------- hero slider (unchanged) ---------- */
function goCat(key){ activeCategory = key; renderChips(); renderProducts(); }

(function(){
  const hero = $("hero"), track = $("track"), dots = $("dots");
  const slides = [...track.children];
  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  let cur = 0, timer = null, startX = null;

  dots.innerHTML = slides.map((_, i) => `<button class="dot" data-i="${i}" aria-label="Go to slide ${i + 1}"></button>`).join("");

  function go(i){
    cur = (i + slides.length) % slides.length;
    track.style.transform = `translateX(-${cur * 100}%)`;
    slides.forEach((s, k) => {
      const on = k === cur;
      s.classList.toggle("active", on);
      s.setAttribute("aria-hidden", String(!on));
      s.querySelectorAll("a").forEach(a => a.tabIndex = on ? 0 : -1);
    });
    [...dots.children].forEach((d, k) => { d.classList.toggle("on", k === cur); d.setAttribute("aria-current", String(k === cur)); });
  }
  function stop(){ clearInterval(timer); timer = null; }
  function play(){ stop(); if (!reduce) timer = setInterval(() => go(cur + 1), 5500); }

  $("prevBtn").onclick = () => { go(cur - 1); play(); };
  $("nextBtn").onclick = () => { go(cur + 1); play(); };
  dots.addEventListener("click", e => { const b = e.target.closest("[data-i]"); if (b) { go(+b.dataset.i); play(); } });
  hero.addEventListener("mouseenter", stop);
  hero.addEventListener("mouseleave", play);
  hero.addEventListener("focusin", stop);
  hero.addEventListener("focusout", play);
  hero.addEventListener("touchstart", e => { startX = e.touches[0].clientX; stop(); }, {passive:true});
  hero.addEventListener("touchend", e => {
    if (startX !== null) { const dx = e.changedTouches[0].clientX - startX; if (Math.abs(dx) > 50) go(cur + (dx < 0 ? 1 : -1)); }
    startX = null; play();
  });
  document.addEventListener("visibilitychange", () => document.hidden ? stop() : play());

  go(0); play();
})();