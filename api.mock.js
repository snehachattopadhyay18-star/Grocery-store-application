/* ======================================================================
   api.mock.js - TEMPORARY stand-in for the real api.js
   Lets you see and test the whole page WITHOUT the backend.
   Everything is fake and lives only in this browser (localStorage).
   Before sharing or deploying, switch grosary.html back to api.js.
   ====================================================================== */

const MOCK_KEY = "mockGroceryDB";
const MOCK_DELAY = 150;   // pretend the network takes a moment

const MOCK_PRODUCTS = [
  {id:"p1",  name:"Apple",      image:"360_F_246698055_Vg3xmiBbRFD3evEsfnHCAXz8lX85nQV9.jpg", price:120, unit:"per kg",     category:"Fruits",     emoji:"🍎", stock:25},
  {id:"p2",  name:"Banana",     image:"banana-14586973852378912_l.jpg",                        price:60,  unit:"per dozen",  category:"Fruits",     emoji:"🍌", stock:40},
  {id:"p3",  name:"Orange",     image:"images.jpg",                                            price:80,  unit:"per kg",     category:"Fruits",     emoji:"🍊", stock:30},
  {id:"p4",  name:"Tomato",     image:"Tomato_je.jpg",                                         price:40,  unit:"per kg",     category:"Vegetables", emoji:"🍅", stock:50},
  {id:"p5",  name:"Potato",     image:"istockphoto-157430678-612x612.jpg",                     price:35,  unit:"per kg",     category:"Vegetables", emoji:"🥔", stock:60},
  {id:"p6",  name:"Carrot",     image:"istockphoto-1388403435-612x612.jpg",                    price:50,  unit:"per kg",     category:"Vegetables", emoji:"🥕", stock:3},
  {id:"p7",  name:"Milk",       image:"360_F_308503485_OdBhixJbzT3bdC60rghTKU7vRzk1NrDc.jpg",  price:60,  unit:"per litre",  category:"Dairy",      emoji:"🥛", stock:20},
  {id:"p8",  name:"Cheese",     image:"istockphoto-531048911-612x612.jpg",                     price:120, unit:"per pack",   category:"Dairy",      emoji:"🧀", stock:15},
  {id:"p9",  name:"Biscuits",   image:"360_F_224404329_KrZ69DD38fjb4zYKL01AKCy46zALlkWv.jpg",  price:30,  unit:"per packet", category:"Snacks",     emoji:"🍪", stock:80},
  {id:"p10", name:"Chips",      image:"360_F_1550681885_0fpGuXJXdI6ZTLRp0GOvZeBc1yj5uNnk.jpg", price:40,  unit:"per packet", category:"Snacks",     emoji:"🍟", stock:0},
  {id:"p11", name:"Juice",      image:"360_F_1389578123_nYTPkMvgBv2NROXZg6TQP5sK8Y42DcDJ.jpg", price:90,  unit:"per bottle", category:"Beverages",  emoji:"🧃", stock:18},
  {id:"p12", name:"Cold Drink", image:"1-liter-alcohol-free-sweet-and-fizzy-taste-branded-cold-drink-416.jpg", price:50, unit:"per bottle", category:"Beverages", emoji:"🥤", stock:22}
];

function mockLoad(){
  try { const d = JSON.parse(localStorage.getItem(MOCK_KEY)); if (d) return d; } catch (e) {}
  const stock = {}; MOCK_PRODUCTS.forEach(p => stock[p.id] = p.stock);
  return {users: [], session: null, carts: {}, stock};
}
function mockSave(db){ try { localStorage.setItem(MOCK_KEY, JSON.stringify(db)); } catch (e) {} }
function mockFail(status, message){ const e = new Error(message); e.status = status; throw e; }
function mockReset(){ localStorage.removeItem(MOCK_KEY); location.reload(); }   // run mockReset() in the console

/* Same call style as the real one: api("/path", {method, body}) -> data or throws Error with .status */
async function api(path, options = {}){
  await new Promise(r => setTimeout(r, MOCK_DELAY));
  const method = (options.method || "GET").toUpperCase();
  const body = options.body || {};
  const db = mockLoad();

  const me = () => db.users.find(u => u.email === db.session);
  const needLogin = () => { if (!me()) mockFail(401, "Please log in first."); return me(); };
  const cartOf = u => (db.carts[u.email] = db.carts[u.email] || []);          // [{product_id, qty}]
  const stockOf = id => db.stock[id] ?? 0;
  const cartReply = u => ({items: cartOf(u).map(i => ({product_id: i.product_id, qty: i.qty}))});

  /* ---- products ---- */
  if (method === "GET" && path === "/products")
    return MOCK_PRODUCTS.map(p => ({...p, stock: stockOf(p.id)}));

  /* ---- auth ---- */
  if (method === "POST" && path === "/auth/signup") {
    const name = String(body.name || "").trim(), email = String(body.email || "").trim().toLowerCase(), password = String(body.password || "");
    if (!name || !email || !password) mockFail(400, "Please fill in all the fields.");
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) mockFail(400, "Please enter a valid email address.");
    if (password.length < 6) mockFail(400, "Password must be at least 6 characters.");
    if (db.users.some(u => u.email === email)) mockFail(409, "You already have an account. Please sign in.");
    db.users.push({name, email, password});          // fake: a real backend must hash passwords
    db.session = email; mockSave(db);
    return {user: {name, email}};
  }
  if (method === "POST" && path === "/auth/login") {
    const email = String(body.email || "").trim().toLowerCase();
    const u = db.users.find(x => x.email === email && x.password === String(body.password || ""));
    if (!u) mockFail(401, "Invalid email or password.");
    db.session = email; mockSave(db);
    return {user: {name: u.name, email: u.email}};
  }
  if (method === "GET" && path === "/auth/me") {
    const u = me(); if (!u) mockFail(401, "Not logged in.");
    return {name: u.name, email: u.email};
  }
  if (method === "POST" && path === "/auth/logout") { db.session = null; mockSave(db); return {ok: true}; }

  /* ---- cart (logged-in users) ---- */
  if (method === "GET" && path === "/cart") return cartReply(needLogin());

  if (method === "POST" && path === "/cart/items") {
    const u = needLogin(), id = String(body.product_id), change = Number(body.change) || 0;
    const p = MOCK_PRODUCTS.find(x => x.id === id); if (!p) mockFail(404, "Product not found.");
    const cart = cartOf(u), it = cart.find(c => c.product_id === id);
    const next = (it ? it.qty : 0) + change;
    if (next > stockOf(id)) mockFail(409, "Only " + stockOf(id) + " " + p.name + " in stock");
    if (next <= 0) db.carts[u.email] = cart.filter(c => c.product_id !== id);
    else if (it) it.qty = next; else cart.push({product_id: id, qty: next});
    mockSave(db); return cartReply(u);
  }
  if (method === "DELETE" && path.startsWith("/cart/items/")) {
    const u = needLogin(), id = decodeURIComponent(path.slice("/cart/items/".length));
    db.carts[u.email] = cartOf(u).filter(c => c.product_id !== id);
    mockSave(db); return cartReply(u);
  }

  /* ---- orders ---- */
  if (method === "POST" && path === "/orders") {
    const u = needLogin(), cart = cartOf(u);
    if (!cart.length) mockFail(400, "Your cart is empty.");
    const a = body.address;
    if (!a || !a.name || !a.phone || !a.line || !a.city || !a.pincode) mockFail(400, "Please add a delivery address.");
    for (const it of cart) {
      const p = MOCK_PRODUCTS.find(x => x.id === it.product_id);
      if (!p || it.qty > stockOf(it.product_id)) mockFail(409, "Some items are no longer in stock.");
    }
    let total = 0;
    const items = cart.map(it => {
      const p = MOCK_PRODUCTS.find(x => x.id === it.product_id);
      db.stock[p.id] -= it.qty; total += p.price * it.qty;
      return {product_id: p.id, name: p.name, price: p.price, qty: it.qty};
    });
    db.carts[u.email] = [];
    mockSave(db);
    return {order_number: "FG" + Math.random().toString(36).slice(2, 8).toUpperCase(), total, items, address: a};
  }

  mockFail(404, "Not found: " + method + " " + path);
}