/* Firdouse Heena storefront logic — vanilla JS, no build step. */
(() => {
  "use strict";

  const CART_KEY = "fh_cart_v1";
  const money = (n) => "₹" + Math.round(n).toLocaleString("en-IN");
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

  const state = {
    site: null,
    products: [],
    category: "All",
    search: "",
    cart: loadCart(),
    lastFocus: null,
  };

  /* ---------------- data ---------------- */
  function loadCart() {
    try {
      const raw = JSON.parse(localStorage.getItem(CART_KEY) || "[]");
      return Array.isArray(raw) ? raw.filter((l) => l && l.id && l.qty > 0) : [];
    } catch {
      return [];
    }
  }
  function saveCart() {
    try {
      localStorage.setItem(CART_KEY, JSON.stringify(state.cart));
    } catch {
      /* private mode: cart stays in memory for this session */
    }
  }

  function get(obj, path) {
    if (path === "instagram") path = "contact.instagram";
    return path.split(".").reduce((o, k) => (o == null ? o : o[k]), obj);
  }

  async function boot() {
    try {
      const [site, products] = await Promise.all([
        fetch("data/site.json").then((r) => r.json()),
        fetch("data/products.json").then((r) => r.json()),
      ]);
      state.site = site;
      state.products = Array.isArray(products) ? products : [];
    } catch (err) {
      console.error(err);
      $("#grid").innerHTML =
        '<p class="empty">Could not load the shop. Please refresh the page.</p>';
      return;
    }

    fillSiteText();
    $("#offerbar").textContent = state.site.offerBanner || "";
    $("#year").textContent = new Date().getFullYear();
    buildCategoryNav();
    buildFilterChips();
    render();
    wireEvents();
    updateCartUI();
    handleHash();
  }

  function fillSiteText() {
    $$("[data-site]").forEach((el) => {
      const val = get(state.site, el.dataset.site);
      if (typeof val !== "string") return;
      if (el.tagName === "IMG") el.src = val;
      else if (el.tagName === "A") el.href = val;
      else el.textContent = val;
    });
  }

  /* ---------------- catalogue rendering ---------------- */
  function categories() {
    const fromSite = Array.isArray(state.site.categories) ? state.site.categories : [];
    const used = [...new Set(state.products.map((p) => p.category))];
    const ordered = fromSite.filter((c) => used.includes(c));
    used.forEach((c) => { if (!ordered.includes(c)) ordered.push(c); });
    return ["All", ...ordered];
  }

  function buildCategoryNav() {
    const nav = $("#catnav");
    nav.innerHTML = "";
    categories().forEach((cat) => {
      const b = document.createElement("button");
      b.type = "button";
      b.textContent = cat;
      if (cat === state.category) b.setAttribute("aria-current", "true");
      b.addEventListener("click", () => setCategory(cat));
      nav.appendChild(b);
    });
  }

  function buildFilterChips() {
    const box = $("#filterChips");
    box.innerHTML = "";
    categories().forEach((cat) => {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "chip";
      b.textContent = cat;
      b.setAttribute("role", "tab");
      b.setAttribute("aria-selected", String(cat === state.category));
      b.addEventListener("click", () => setCategory(cat));
      box.appendChild(b);
    });
  }

  function setCategory(cat) {
    state.category = cat;
    $$("#catnav button").forEach((b) =>
      b.toggleAttribute("aria-current", b.textContent === cat)
    );
    $$("#filterChips .chip").forEach((b) =>
      b.setAttribute("aria-selected", String(b.textContent === cat))
    );
    render();
    $("#shop").scrollIntoView({ block: "start" });
  }

  function visibleProducts() {
    const q = state.search.trim().toLowerCase();
    return state.products.filter((p) => {
      if (state.category !== "All" && p.category !== state.category) return false;
      if (!q) return true;
      return (
        p.title.toLowerCase().includes(q) ||
        (p.category || "").toLowerCase().includes(q) ||
        (p.description || "").toLowerCase().includes(q)
      );
    });
  }

  function discount(p) {
    if (!p.mrp || p.mrp <= p.price) return 0;
    return Math.round(((p.mrp - p.price) / p.mrp) * 100);
  }

  function render() {
    const list = visibleProducts();
    const grid = $("#grid");
    grid.innerHTML = "";
    $("#emptyState").hidden = list.length > 0;
    $("#resultNote").textContent =
      `${list.length} product${list.length === 1 ? "" : "s"}` +
      (state.category === "All" ? "" : ` in ${state.category}`) +
      (state.search ? ` matching “${state.search}”` : "");

    list.forEach((p) => {
      const off = discount(p);
      const soldOut = typeof p.stock === "number" && p.stock <= 0;
      const card = document.createElement("article");
      card.className = "card";
      card.innerHTML = `
        <div class="card-media">
          <img src="${p.images?.[0] || "images/products/placeholder.svg"}" alt="${escapeAttr(p.title)}" loading="lazy" width="300" height="300" />
          <div class="card-badges">
            ${(p.badges || []).map((b) => `<span class="badge ${b.toLowerCase() === "new" ? "soft" : ""}">${escapeHtml(b)}</span>`).join("")}
            ${soldOut ? '<span class="badge out">Sold out</span>' : ""}
          </div>
        </div>
        <div class="card-body">
          <span class="card-cat">${escapeHtml(p.category || "")}</span>
          <h3 class="card-title"><button type="button" data-view="${escapeAttr(p.id)}">${escapeHtml(p.title)}</button></h3>
          <div class="price">
            <span class="now">${money(p.price)}</span>
            ${p.mrp && p.mrp > p.price ? `<span class="mrp">${money(p.mrp)}</span><span class="off">${off}% off</span>` : ""}
          </div>
          <button class="btn btn-primary" data-add="${escapeAttr(p.id)}" ${soldOut ? "disabled" : ""}>${soldOut ? "Sold out" : "Add to cart"}</button>
        </div>`;
      grid.appendChild(card);
    });
  }

  /* ---------------- product quick view ---------------- */
  function openProduct(id) {
    const p = state.products.find((x) => x.id === id);
    if (!p) return;
    const dlg = $("#productDialog");
    const imgs = p.images?.length ? p.images : ["images/products/placeholder.svg"];
    const off = discount(p);
    const soldOut = typeof p.stock === "number" && p.stock <= 0;
    $("#pdBody").innerHTML = `
      <img class="pd-media" id="pdMain" src="${imgs[0]}" alt="${escapeAttr(p.title)}" />
      ${imgs.length > 1 ? `<div class="pd-thumbs">${imgs.map((s, i) => `<img src="${s}" alt="View ${i + 1}" data-thumb="${s}" ${i === 0 ? 'aria-current="true"' : ""} />`).join("")}</div>` : ""}
      <span class="card-cat">${escapeHtml(p.category || "")}</span>
      <h2 id="pdTitle">${escapeHtml(p.title)}</h2>
      <div class="price">
        <span class="now">${money(p.price)}</span>
        ${p.mrp && p.mrp > p.price ? `<span class="mrp">${money(p.mrp)}</span><span class="off">${off}% off</span>` : ""}
      </div>
      <p class="muted">${escapeHtml(p.description || "")}</p>
      ${soldOut ? '<p class="form-error">Currently sold out.</p>' : `
      <div style="display:flex;gap:12px;align-items:center;flex-wrap:wrap">
        <div class="qty" role="group" aria-label="Quantity">
          <button type="button" data-step="-1" aria-label="Decrease">−</button>
          <input id="pdQty" type="number" value="1" min="1" max="99" inputmode="numeric" aria-label="Quantity" />
          <button type="button" data-step="1" aria-label="Increase">+</button>
        </div>
        <button class="btn btn-primary" id="pdAdd" data-add-detail="${escapeAttr(p.id)}">Add to cart</button>
      </div>`}
    `;
    dlg.setAttribute("aria-labelledby", "pdTitle");
    if (!dlg.open) dlg.showModal();
    if (location.hash !== `#/p/${id}`) history.replaceState(null, "", `#/p/${id}`);
  }

  /* ---------------- cart ---------------- */
  function cartLine(id) {
    return state.cart.find((l) => l.id === id);
  }
  function addToCart(id, qty = 1) {
    const p = state.products.find((x) => x.id === id);
    if (!p) return;
    const max = typeof p.stock === "number" ? p.stock : 99;
    const line = cartLine(id);
    const next = Math.min((line?.qty || 0) + qty, Math.max(1, max), 99);
    if (line) line.qty = next;
    else state.cart.push({ id, qty: next });
    saveCart();
    updateCartUI();
    openCart();
  }
  function setQty(id, qty) {
    const line = cartLine(id);
    if (!line) return;
    const p = state.products.find((x) => x.id === id);
    const max = Math.min(typeof p?.stock === "number" ? p.stock : 99, 99);
    line.qty = Math.max(1, Math.min(qty, Math.max(1, max)));
    saveCart();
    updateCartUI();
  }
  function removeLine(id) {
    state.cart = state.cart.filter((l) => l.id !== id);
    saveCart();
    updateCartUI();
  }
  function cartDetailed() {
    return state.cart
      .map((l) => {
        const p = state.products.find((x) => x.id === l.id);
        return p ? { ...p, qty: l.qty, lineTotal: p.price * l.qty } : null;
      })
      .filter(Boolean);
  }
  function subtotal() {
    return cartDetailed().reduce((s, l) => s + l.lineTotal, 0);
  }
  function shippingFor(sub) {
    const s = state.site.shipping || {};
    if (sub <= 0) return 0;
    if (s.freeAbove && sub >= s.freeAbove) return 0;
    return Number(s.flatRate || 0);
  }

  function updateCartUI() {
    const count = state.cart.reduce((s, l) => s + l.qty, 0);
    $("#cartCount").textContent = count;
    const lines = cartDetailed();
    const box = $("#cartItems");
    if (!lines.length) {
      box.innerHTML = '<p class="cart-empty">Your cart is empty.</p>';
    } else {
      box.innerHTML = lines
        .map(
          (l) => `
        <div class="citem">
          <img src="${l.images?.[0] || "images/products/placeholder.svg"}" alt="" />
          <div>
            <div class="ct">${escapeHtml(l.title)}</div>
            <div class="cp">${money(l.price)} each</div>
            <div class="qty" role="group" aria-label="Quantity for ${escapeAttr(l.title)}">
              <button type="button" data-cstep="-1" data-id="${escapeAttr(l.id)}" aria-label="Decrease">−</button>
              <input type="number" value="${l.qty}" min="1" max="99" data-cqty="${escapeAttr(l.id)}" aria-label="Quantity" />
              <button type="button" data-cstep="1" data-id="${escapeAttr(l.id)}" aria-label="Increase">+</button>
            </div>
            <button class="rm" data-remove="${escapeAttr(l.id)}">Remove</button>
          </div>
          <div class="ct">${money(l.lineTotal)}</div>
        </div>`
        )
        .join("");
    }
    const sub = subtotal();
    $("#cartSubtotal").textContent = money(sub);
    const ship = shippingFor(sub);
    const s = state.site.shipping || {};
    $("#shipNote").textContent = !lines.length
      ? ""
      : ship === 0
      ? s.freeAbove && sub >= s.freeAbove
        ? "Free shipping applied."
        : "Shipping calculated at checkout."
      : `+ ${money(ship)} shipping` +
        (s.freeAbove ? ` (free over ${money(s.freeAbove)})` : "");
    $("#checkoutBtn").disabled = lines.length === 0;
  }

  /* ---------------- drawer + dialog plumbing ---------------- */
  function openCart() {
    state.lastFocus = document.activeElement;
    $("#cartDrawer").classList.add("open");
    $("#cartDrawer").setAttribute("aria-hidden", "false");
    $("#drawerBackdrop").hidden = false;
    $("#cartClose").focus();
  }
  function closeCart() {
    $("#cartDrawer").classList.remove("open");
    $("#cartDrawer").setAttribute("aria-hidden", "true");
    $("#drawerBackdrop").hidden = true;
    if (state.lastFocus) state.lastFocus.focus();
  }

  /* ---------------- checkout ---------------- */
  function openCheckout() {
    const lines = cartDetailed();
    if (!lines.length) return;
    const sub = subtotal();
    const ship = shippingFor(sub);
    $("#coSummary").innerHTML =
      lines
        .map(
          (l) =>
            `<div class="li"><span>${escapeHtml(l.title)} × ${l.qty}</span><span>${money(l.lineTotal)}</span></div>`
        )
        .join("") +
      `<div class="li"><span>Shipping</span><span>${ship === 0 ? "Free" : money(ship)}</span></div>` +
      `<div class="li tot"><span>Total</span><span>${money(sub + ship)}</span></div>`;
    $("#checkoutError").hidden = true;
    closeCart();
    $("#checkoutDialog").showModal();
  }

  async function submitCheckout(e) {
    e.preventDefault();
    const form = e.target;
    const errBox = $("#checkoutError");
    const payBtn = $("#payBtn");
    errBox.hidden = true;

    if (!form.checkValidity()) {
      form.reportValidity();
      return;
    }
    if (typeof window.Razorpay !== "function") {
      showCheckoutError(
        "The secure payment library could not load. Check your connection or any ad-blocker and try again."
      );
      return;
    }

    const fd = new FormData(form);
    const customer = Object.fromEntries(fd.entries());
    const items = state.cart.map((l) => ({ id: l.id, qty: l.qty }));

    payBtn.disabled = true;
    payBtn.textContent = "Preparing…";
    let order;
    try {
      const res = await fetch("/api/create-order", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ items, customer }),
      });
      order = await res.json();
      if (!res.ok) throw new Error(order.error || "Could not start payment.");
    } catch (err) {
      showCheckoutError(err.message || "Could not start payment. Please retry.");
      payBtn.disabled = false;
      payBtn.textContent = "Pay securely";
      return;
    }

    const rzp = new window.Razorpay({
      key: order.key_id,
      order_id: order.order_id,
      amount: order.amount,
      currency: order.currency,
      name: state.site.brand,
      description: "Order payment",
      image: state.site.hero?.image,
      prefill: {
        name: customer.name,
        email: customer.email,
        contact: customer.phone,
      },
      notes: { address: `${customer.address}, ${customer.city} ${customer.pincode}` },
      theme: { color: "#7c2438" },
      modal: {
        ondismiss: () => {
          payBtn.disabled = false;
          payBtn.textContent = "Pay securely";
        },
      },
      handler: async (resp) => {
        try {
          const v = await fetch("/api/verify-payment", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify(resp),
          }).then((r) => r.json());
          if (!v.ok) throw new Error("We could not verify the payment. If money was debited, contact us with your payment ID.");
          orderComplete(resp.razorpay_payment_id);
        } catch (err) {
          showCheckoutError(err.message);
          payBtn.disabled = false;
          payBtn.textContent = "Pay securely";
        }
      },
    });
    rzp.on("payment.failed", (r) => {
      showCheckoutError(
        (r.error && r.error.description) || "Payment failed. Please try again."
      );
      payBtn.disabled = false;
      payBtn.textContent = "Pay securely";
    });
    rzp.open();
  }

  function showCheckoutError(msg) {
    const box = $("#checkoutError");
    box.textContent = msg;
    box.hidden = false;
  }

  function orderComplete(paymentId) {
    state.cart = [];
    saveCart();
    updateCartUI();
    const co = $("#checkoutDialog");
    if (co.open) co.close();
    $("#checkoutForm").reset();
    $("#payBtn").disabled = false;
    $("#payBtn").textContent = "Pay securely";
    $("#successPaymentId").textContent = paymentId || "—";
    $("#successDialog").showModal();
  }

  /* ---------------- events ---------------- */
  function wireEvents() {
    $("#searchForm").addEventListener("submit", (e) => e.preventDefault());
    $("#searchInput").addEventListener("input", (e) => {
      state.search = e.target.value;
      render();
    });

    document.body.addEventListener("click", (e) => {
      const t = e.target.closest("[data-view],[data-add],[data-add-detail],[data-thumb],[data-step],[data-remove],[data-cstep]");
      if (!t) return;
      if (t.dataset.view) openProduct(t.dataset.view);
      else if (t.dataset.add) addToCart(t.dataset.add, 1);
      else if (t.dataset.addDetail) {
        const q = parseInt($("#pdQty")?.value, 10) || 1;
        addToCart(t.dataset.addDetail, q);
        $("#productDialog").close();
      } else if (t.dataset.thumb) {
        $("#pdMain").src = t.dataset.thumb;
        $$("#productDialog .pd-thumbs img").forEach((i) =>
          i.toggleAttribute("aria-current", i === t)
        );
      } else if (t.dataset.step) {
        const inp = $("#pdQty");
        inp.value = Math.max(1, Math.min(99, (parseInt(inp.value, 10) || 1) + Number(t.dataset.step)));
      } else if (t.dataset.remove) {
        removeLine(t.dataset.remove);
      } else if (t.dataset.cstep) {
        const line = cartLine(t.dataset.id);
        if (line) setQty(t.dataset.id, line.qty + Number(t.dataset.cstep));
      }
    });

    $("#cartItems").addEventListener("change", (e) => {
      const inp = e.target.closest("[data-cqty]");
      if (inp) setQty(inp.dataset.cqty, parseInt(inp.value, 10) || 1);
    });

    $("#cartOpen").addEventListener("click", openCart);
    $("#cartClose").addEventListener("click", closeCart);
    $("#drawerBackdrop").addEventListener("click", closeCart);
    $("#checkoutBtn").addEventListener("click", openCheckout);
    $("#checkoutForm").addEventListener("submit", submitCheckout);

    $$("dialog .dialog-close[data-close], dialog [data-close]").forEach((b) =>
      b.addEventListener("click", (e) => e.target.closest("dialog").close())
    );
    $("#productDialog").addEventListener("close", () => {
      if (location.hash.startsWith("#/p/")) history.replaceState(null, "", location.pathname);
    });

    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && $("#cartDrawer").classList.contains("open")) closeCart();
    });

    window.addEventListener("hashchange", handleHash);
  }

  function handleHash() {
    const m = location.hash.match(/^#\/p\/(.+)$/);
    if (m) openProduct(decodeURIComponent(m[1]));
  }

  /* ---------------- escaping ---------------- */
  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  }
  function escapeAttr(s) {
    return escapeHtml(s);
  }

  if (document.readyState === "loading")
    document.addEventListener("DOMContentLoaded", boot);
  else boot();
})();
