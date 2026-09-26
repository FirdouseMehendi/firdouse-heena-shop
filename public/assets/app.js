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
      return Array.isArray(raw)
        ? raw.filter((l) => l && l.id && l.qty > 0 && Number.isFinite(l.size))
        : [];
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
    fetch("/api/log-visit", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ path: location.pathname, referrer: document.referrer }),
    }).catch(() => {});
    $("#offerbar").textContent = state.site.offerBanner || "";
    $("#year").textContent = new Date().getFullYear();
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

  /* ---------------- variable pack sizes ---------------- */
  function sizesOf(p) {
    return Array.isArray(p.sizes) && p.sizes.length ? p.sizes : [p.defaultSize || 100];
  }
  function defaultSizeOf(p) {
    const s = sizesOf(p);
    return s.includes(p.defaultSize) ? p.defaultSize : s[0];
  }
  function unitPrice(p, size) {
    if (p.priceOverrides && p.priceOverrides[size] != null) return Number(p.priceOverrides[size]);
    return Math.round((Number(p.ratePerUnit) || 0) * size);
  }
  function mrpPrice(p, size) {
    if (p.mrpOverrides && p.mrpOverrides[size] != null) return Number(p.mrpOverrides[size]);
    return Math.round((Number(p.mrpPerUnit) || 0) * size);
  }
  function discountPct(p, size) {
    size = size || sizesOf(p)[0];
    const now = unitPrice(p, size);
    const mrp = mrpPrice(p, size);
    if (!mrp || mrp <= now) return 0;
    return Math.round((1 - now / mrp) * 100);
  }
  function sizeLabel(p, size) {
    if (p.sizeLabels && p.sizeLabels[size] != null) return p.sizeLabels[size];
    if (p.unit === "ml") return size >= 1000 ? `${size / 1000} L` : `${size} ml`;
    if (p.unit === "g") return size >= 1000 ? `${size / 1000} kg` : `${size} g`;
    if (p.unit === "pc") return size > 1 ? `Pack of ${size}` : "1 pc";
    if (p.unit === "kit") return "1 kit";
    if (p.unit === "pack") return "1 pack";
    return `${size} ${p.unit}`;
  }
  function rateLabel(p) {
    if (p.priceOverrides) return "choose size";
    if (p.unit === "ml") return `${money(Math.round((Number(p.ratePerUnit) || 0) * 1000))}/L`;
    if (p.unit === "g") return `${money(Math.round((Number(p.ratePerUnit) || 0) * 1000))}/kg`;
    if (p.unit === "pc" && Math.max(...(p.sizes || [1])) > 1) return `${money(Math.round(Number(p.ratePerUnit) || 0))}/pc`;
    return "flat price";
  }
  const MAX_QTY_PER_LINE = 10;
  function maxPacks(p, size) {
    if (typeof p.stockUnits !== "number") return MAX_QTY_PER_LINE;
    return Math.max(0, Math.min(MAX_QTY_PER_LINE, Math.floor(p.stockUnits / size)));
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
      const startSize = sizesOf(p)[0];
      const startPrice = unitPrice(p, startSize);
      const startMrp = mrpPrice(p, startSize);
      const pct = discountPct(p);
      const soldOut = typeof p.stockUnits === "number" && p.stockUnits <= 0;
      const card = document.createElement("article");
      card.className = "card";
      if (!soldOut) card.dataset.view = p.id;
      card.innerHTML = `
        <div class="card-media">
          <img src="${p.images?.[0] || "images/products/placeholder.svg"}" alt="${escapeAttr(p.title)}" loading="lazy" width="300" height="300" />
          <div class="card-badges">
            ${pct > 0 ? `<span class="badge sale">${pct}% OFF</span>` : ""}
            ${(p.badges || []).map((b) => `<span class="badge ${b.toLowerCase() === "new" ? "soft" : ""}">${escapeHtml(b)}</span>`).join("")}
            ${soldOut ? '<span class="badge out">Sold out</span>' : ""}
          </div>
          ${soldOut ? "" : `<button type="button" class="quick-view" data-view="${escapeAttr(p.id)}">View details</button>`}
        </div>
        <div class="card-body">
          <span class="card-cat">${escapeHtml(p.category || "")}</span>
          <h3 class="card-title"><button type="button" data-view="${escapeAttr(p.id)}">${escapeHtml(p.title)}</button></h3>
          <div class="price">
            ${pct > 0 ? `<span class="mrp">${money(startMrp)}</span>` : ""}
            <span class="now">${money(startPrice)}</span>
            <span class="onwards">${sizesOf(p).length > 1 ? `onwards &middot; ${escapeHtml(rateLabel(p))}` : escapeHtml(rateLabel(p))}</span>
          </div>
          <button class="btn btn-primary" data-view="${escapeAttr(p.id)}" ${soldOut ? "disabled" : ""}>${soldOut ? "Sold out" : "Select size"}</button>
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
    const soldOut = typeof p.stockUnits === "number" && p.stockUnits <= 0;
    const dSize = defaultSizeOf(p);
    $("#pdBody").innerHTML = `
      <img class="pd-media" id="pdMain" src="${imgs[0]}" alt="${escapeAttr(p.title)}" data-lightbox />
      ${imgs.length > 1 ? `<div class="pd-thumbs">${imgs.map((s, i) => `<img src="${s}" alt="View ${i + 1}" data-thumb="${s}" ${i === 0 ? 'aria-current="true"' : ""} />`).join("")}</div>` : ""}
      <span class="card-cat">${escapeHtml(p.category || "")}</span>
      <h2 id="pdTitle">${escapeHtml(p.title)}</h2>
      <p class="muted">${escapeHtml(p.description || "")}</p>
      ${soldOut ? '<p class="form-error">Currently sold out.</p>' : `
      <div class="pd-sizes" role="group" aria-label="Pack size">
        ${sizesOf(p).map((s) => `<button type="button" data-size="${s}" aria-pressed="${s === dSize}">${escapeHtml(sizeLabel(p, s))}</button>`).join("")}
      </div>
      <div class="pd-footer">
        <div class="pd-price">
          <span class="mrp" id="pdMrp">${discountPct(p) > 0 ? money(mrpPrice(p, dSize)) : ""}</span>
          <span class="now" id="pdPrice">${money(unitPrice(p, dSize))}</span>
          ${discountPct(p) > 0 ? `<span class="badge sale">${discountPct(p)}% OFF</span>` : ""}
          <span class="muted" id="pdUnit">for ${escapeHtml(sizeLabel(p, dSize))} &middot; ${escapeHtml(rateLabel(p))}</span>
        </div>
        <div style="display:flex;gap:12px;align-items:center;flex-wrap:wrap">
          <div class="qty" role="group" aria-label="Quantity">
            <button type="button" data-step="-1" aria-label="Decrease">−</button>
            <input id="pdQty" type="number" value="1" min="1" max="${Math.max(1, maxPacks(p, dSize))}" inputmode="numeric" aria-label="Quantity" />
            <button type="button" data-step="1" aria-label="Increase">+</button>
          </div>
          <button class="btn btn-primary" id="pdAdd" data-add-detail="${escapeAttr(p.id)}">Add to cart</button>
        </div>
      </div>`}
    `;
    dlg.dataset.pid = id;
    dlg.dataset.size = String(dSize);
    dlg.setAttribute("aria-labelledby", "pdTitle");
    if (!dlg.open) dlg.showModal();
    if (location.hash !== `#/p/${id}`) history.replaceState(null, "", `#/p/${id}`);
  }

  /* ---------------- cart ---------------- */
  function cartLine(id, size) {
    return state.cart.find((l) => l.id === id && l.size === size);
  }
  function addToCart(id, size, qty = 1) {
    const p = state.products.find((x) => x.id === id);
    if (!p || !sizesOf(p).includes(size)) return;
    const cap = Math.max(1, maxPacks(p, size));
    const line = cartLine(id, size);
    const next = Math.min((line?.qty || 0) + qty, cap);
    if (line) line.qty = next;
    else state.cart.push({ id, size, qty: next });
    saveCart();
    updateCartUI();
    openCart();
    fetch("/api/log-cart", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ productId: id, productTitle: p.title, size, qty }),
    }).catch(() => {});
  }
  function setQty(id, size, qty) {
    const line = cartLine(id, size);
    if (!line) return;
    const p = state.products.find((x) => x.id === id);
    const cap = p ? Math.max(1, maxPacks(p, size)) : 99;
    line.qty = Math.max(1, Math.min(qty, cap));
    saveCart();
    updateCartUI();
  }
  function removeLine(id, size) {
    state.cart = state.cart.filter((l) => !(l.id === id && l.size === size));
    saveCart();
    updateCartUI();
  }
  function cartDetailed() {
    return state.cart
      .map((l) => {
        const p = state.products.find((x) => x.id === l.id);
        if (!p) return null;
        const up = unitPrice(p, l.size);
        return {
          ...p,
          size: l.size,
          qty: l.qty,
          unitPrice: up,
          lineTotal: up * l.qty,
          label: `${p.title} — ${sizeLabel(p, l.size)}`,
        };
      })
      .filter(Boolean);
  }
  function subtotal() {
    return cartDetailed().reduce((s, l) => s + l.lineTotal, 0);
  }
  // Returns the zone shipping rate for a typed state name, or null if the
  // state is blank/unrecognised (caller shows "calculated at checkout").
  function ratePerKgForState(stateRaw) {
    const s = String(stateRaw || "").trim().toLowerCase();
    if (!s) return null;
    const zones = state.site.shipping?.zones || [];
    for (const zone of zones) {
      if ((zone.states || []).some((z) => s.includes(z) || z.includes(s))) return Number(zone.ratePerKg) || 0;
    }
    return Number(state.site.shipping?.defaultRatePerKg) || 0;
  }
  function cartWeightKg() {
    let grams = 0;
    state.cart.forEach((l) => {
      const p = state.products.find((x) => x.id === l.id);
      if (!p) return;
      const isWeightBased = p.unit === "g" || p.unit === "ml";
      const perUnitGrams = (isWeightBased ? l.size : 0) + (Number(p.packagingGrams) || 0);
      grams += perUnitGrams * l.qty;
    });
    return grams / 1000;
  }
  function shippingFor(sub, stateRaw) {
    if (sub <= 0) return 0;
    const ratePerKg = ratePerKgForState(stateRaw);
    if (ratePerKg == null) return null;
    const kg = cartWeightKg();
    const tier = kg > 0 ? Math.max(1, Math.round(kg)) : 0;
    return tier * ratePerKg;
  }

  function updateCartUI() {
    const count = state.cart.reduce((s, l) => s + l.qty, 0);
    const countEl = $("#cartCount");
    if (countEl.textContent !== String(count)) {
      countEl.textContent = count;
      countEl.classList.remove("bump");
      void countEl.offsetWidth; // restart the animation
      countEl.classList.add("bump");
    }
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
            <div class="ct">${escapeHtml(l.label)}</div>
            <div class="cp">${money(l.unitPrice)} each</div>
            <div class="qty" role="group" aria-label="Quantity for ${escapeAttr(l.label)}">
              <button type="button" data-cstep="-1" data-id="${escapeAttr(l.id)}" data-size="${l.size}" aria-label="Decrease">−</button>
              <input type="number" value="${l.qty}" min="1" max="99" data-cqty="${escapeAttr(l.id)}" data-size="${l.size}" aria-label="Quantity" />
              <button type="button" data-cstep="1" data-id="${escapeAttr(l.id)}" data-size="${l.size}" aria-label="Increase">+</button>
            </div>
            <button class="rm" data-remove="${escapeAttr(l.id)}" data-size="${l.size}">Remove</button>
          </div>
          <div class="ct">${money(l.lineTotal)}</div>
        </div>`
        )
        .join("");
    }
    const sub = subtotal();
    $("#cartSubtotal").textContent = money(sub);
    const ship = shippingFor(sub);
    $("#shipNote").textContent = !lines.length
      ? ""
      : ship > 0
      ? `+ ${money(ship)} shipping`
      : "Shipping calculated at checkout.";
    $("#checkoutBtn").disabled = lines.length === 0;
  }

  /* ---------------- drawer + dialog plumbing ---------------- */
  function openCart() {
    state.lastFocus = document.activeElement;
    $("#cartDrawer").classList.add("open");
    $("#cartDrawer").setAttribute("aria-hidden", "false");
    $("#drawerBackdrop").hidden = false;
    $("#cartClose").focus();
    lockScroll();
  }
  function closeCart() {
    $("#cartDrawer").classList.remove("open");
    $("#cartDrawer").setAttribute("aria-hidden", "true");
    $("#drawerBackdrop").hidden = true;
    if (state.lastFocus) state.lastFocus.focus();
    unlockScroll();
  }

  /* ---------------- checkout ---------------- */
  function renderCheckoutSummary() {
    const lines = cartDetailed();
    if (!lines.length) return;
    const sub = subtotal();
    const stateVal = $("#cf-state")?.value || "";
    const ship = shippingFor(sub, stateVal);
    const shipRow =
      ship == null
        ? `<div class="li"><span>Shipping</span><span class="muted">Enter your state below</span></div>`
        : `<div class="li"><span>Shipping</span><span>${money(ship)}</span></div>`;
    $("#coSummary").innerHTML =
      lines
        .map(
          (l) =>
            `<div class="li"><span>${escapeHtml(l.label)} × ${l.qty}</span><span>${money(l.lineTotal)}</span></div>`
        )
        .join("") +
      shipRow +
      `<div class="li tot"><span>Total</span><span>${money(sub + (ship || 0))}</span></div>`;
  }
  function openCheckout() {
    const lines = cartDetailed();
    if (!lines.length) return;
    renderCheckoutSummary();
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
    const items = state.cart.map((l) => ({ id: l.id, size: l.size, qty: l.qty }));

    payBtn.disabled = true;
    payBtn.textContent = "Preparing…";
    let order;
    try {
      const res = await fetch("/api/create-order", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ items, customer }),
        signal: AbortSignal.timeout(15000),
      });
      order = await res.json();
      if (!res.ok) throw new Error(order.error || "Could not start payment.");
    } catch (err) {
      const msg =
        err.name === "TimeoutError" || err.name === "AbortError"
          ? "This is taking too long. Please check your connection and try again."
          : err.message || "Could not start payment. Please retry.";
      showCheckoutError(msg);
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
      theme: { color: "#1a2d11" },
      modal: {
        ondismiss: () => {
          if (!$("#checkoutDialog").open) $("#checkoutDialog").showModal();
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
          fetch("/api/log-order", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              razorpay_order_id: order.order_id,
              razorpay_payment_id: resp.razorpay_payment_id,
              amount_paise: order.amount,
              items: order.lines,
              customer_name: customer.name,
              customer_phone: customer.phone,
              customer_email: customer.email,
            }),
          }).catch(() => {});
          orderComplete(resp.razorpay_payment_id, items);
        } catch (err) {
          if (!$("#checkoutDialog").open) $("#checkoutDialog").showModal();
          showCheckoutError(err.message);
          payBtn.disabled = false;
          payBtn.textContent = "Pay securely";
        }
      },
    });
    rzp.on("payment.failed", (r) => {
      if (!$("#checkoutDialog").open) $("#checkoutDialog").showModal();
      showCheckoutError(
        (r.error && r.error.description) || "Payment failed. Please try again."
      );
      payBtn.disabled = false;
      payBtn.textContent = "Pay securely";
    });
    $("#checkoutDialog").close();
    rzp.open();
  }

  function showCheckoutError(msg) {
    const box = $("#checkoutError");
    box.textContent = msg;
    box.hidden = false;
  }

  function orderComplete(paymentId, purchasedItems) {
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
    loadCareTips(purchasedItems);
  }

  async function loadCareTips(items) {
    const box = $("#careTips");
    const text = $("#careTipsText");
    if (!box || !text || !items || !items.length) return;
    box.hidden = false;
    text.textContent = "Getting your personalized care tips…";
    try {
      const res = await fetch("api/order-care", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ items }),
      });
      const data = await res.json();
      if (!res.ok || !data.tips) throw new Error();
      text.textContent = data.tips;
    } catch {
      box.hidden = true;
    }
  }

  /* ---------------- events ---------------- */
  /* Locks page scroll behind any open dialog/drawer, so the shop behind it never
     shows or scrolls through. Shared by every dialog, the cart drawer, and any future one. */
  let scrollLockCount = 0;
  let scrollLockY = 0;
  function lockScroll() {
    if (scrollLockCount++ > 0) return;
    scrollLockY = window.scrollY;
    document.body.style.position = "fixed";
    document.body.style.top = `-${scrollLockY}px`;
    document.body.style.left = "0";
    document.body.style.right = "0";
    document.body.style.width = "100%";
  }
  function unlockScroll() {
    if (--scrollLockCount > 0) return;
    scrollLockCount = 0;
    document.body.style.position = "";
    document.body.style.top = "";
    document.body.style.left = "";
    document.body.style.right = "";
    document.body.style.width = "";
    window.scrollTo(0, scrollLockY);
  }
  function wireDialogScrollLock() {
    document.querySelectorAll("dialog.dialog").forEach((dlg) => {
      new MutationObserver((muts) => {
        for (const m of muts) {
          if (m.attributeName !== "open") continue;
          if (dlg.hasAttribute("open")) lockScroll();
          else unlockScroll();
        }
      }).observe(dlg, { attributes: true });
    });
  }

  function wireEvents() {
    wireDialogScrollLock();
    $("#searchForm").addEventListener("submit", (e) => e.preventDefault());
    $("#searchInput").addEventListener("input", (e) => {
      state.search = e.target.value;
      render();
    });

    const searchToggle = $("#searchToggle");
    const searchForm = $("#searchForm");
    searchToggle.addEventListener("click", () => {
      const opening = searchForm.hidden;
      searchForm.hidden = !opening;
      searchToggle.setAttribute("aria-expanded", String(opening));
      if (opening) $("#searchInput").focus();
    });
    document.addEventListener("click", (e) => {
      if (!searchForm.hidden && !e.target.closest(".search-wrap")) {
        searchForm.hidden = true;
        searchToggle.setAttribute("aria-expanded", "false");
      }
    });

    document.body.addEventListener("click", (e) => {
      const t = e.target.closest("[data-view],[data-add-detail],[data-size],[data-thumb],[data-step],[data-remove],[data-cstep],[data-lightbox]");
      if (!t) return;
      if (t.dataset.lightbox !== undefined) {
        const lb = $("#imgLightbox");
        $("#lightboxImg").src = t.src;
        $("#lightboxImg").alt = t.alt;
        if (!lb.open) lb.showModal();
      } else if (t.dataset.remove) {
        removeLine(t.dataset.remove, parseInt(t.dataset.size, 10));
      } else if (t.dataset.cstep) {
        const size = parseInt(t.dataset.size, 10);
        const line = cartLine(t.dataset.id, size);
        if (line) setQty(t.dataset.id, size, line.qty + Number(t.dataset.cstep));
      } else if (t.dataset.view) openProduct(t.dataset.view);
      else if (t.dataset.size) {
        const dlg = $("#productDialog");
        const p = state.products.find((x) => x.id === dlg.dataset.pid);
        if (!p) return;
        const size = parseInt(t.dataset.size, 10);
        dlg.dataset.size = String(size);
        $$("#productDialog .pd-sizes button").forEach((b) =>
          b.setAttribute("aria-pressed", String(b === t))
        );
        $("#pdPrice").textContent = money(unitPrice(p, size));
        $("#pdMrp").textContent = discountPct(p) > 0 ? money(mrpPrice(p, size)) : "";
        $("#pdUnit").textContent = `for ${sizeLabel(p, size)} · ${rateLabel(p)}`;
        const inp = $("#pdQty");
        if (inp) {
          inp.max = String(Math.max(1, maxPacks(p, size)));
          if ((parseInt(inp.value, 10) || 1) > Number(inp.max)) inp.value = inp.max;
        }
      } else if (t.dataset.addDetail) {
        const dlg = $("#productDialog");
        const size = parseInt(dlg.dataset.size, 10) || 0;
        const q = parseInt($("#pdQty")?.value, 10) || 1;
        addToCart(t.dataset.addDetail, size, q);
        dlg.close();
      } else if (t.dataset.thumb) {
        $("#pdMain").src = t.dataset.thumb;
        $$("#productDialog .pd-thumbs img").forEach((i) =>
          i.toggleAttribute("aria-current", i === t)
        );
      } else if (t.dataset.step) {
        const inp = $("#pdQty");
        const cap = parseInt(inp.max, 10) || 99;
        inp.value = Math.max(1, Math.min(cap, (parseInt(inp.value, 10) || 1) + Number(t.dataset.step)));
      }
    });

    $("#cartItems").addEventListener("change", (e) => {
      const inp = e.target.closest("[data-cqty]");
      if (inp) setQty(inp.dataset.cqty, parseInt(inp.dataset.size, 10), parseInt(inp.value, 10) || 1);
    });

    $("#cartOpen").addEventListener("click", openCart);
    $("#cartClose").addEventListener("click", closeCart);
    $("#drawerBackdrop").addEventListener("click", closeCart);
    $("#checkoutBtn").addEventListener("click", openCheckout);
    $("#checkoutForm").addEventListener("submit", submitCheckout);
    $("#cf-state")?.addEventListener("input", renderCheckoutSummary);

    $$("dialog .dialog-close[data-close], dialog [data-close]").forEach((b) =>
      b.addEventListener("click", (e) => e.target.closest("dialog").close())
    );
    $("#imgLightbox").addEventListener("click", (e) => {
      if (e.target.id === "imgLightbox") e.target.close();
    });
    $("#lightboxImg").addEventListener("click", (e) => e.target.closest("dialog").close());
    $("#productDialog").addEventListener("close", () => {
      if (location.hash.startsWith("#/p/")) history.replaceState(null, "", location.pathname);
    });

    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && $("#cartDrawer").classList.contains("open")) closeCart();
    });

    window.addEventListener("hashchange", handleHash);

    const header = $(".site-header");
    window.addEventListener(
      "scroll",
      () => header.classList.toggle("is-scrolled", window.scrollY > 4),
      { passive: true }
    );

    if ("IntersectionObserver" in window) {
      const io = new IntersectionObserver(
        (entries) => {
          entries.forEach((entry) => {
            if (entry.isIntersecting) {
              entry.target.classList.add("in");
              io.unobserve(entry.target);
            }
          });
        },
        { threshold: 0.15 }
      );
      $$(".reveal").forEach((el) => io.observe(el));
    } else {
      $$(".reveal").forEach((el) => el.classList.add("in"));
    }
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

  /* ---------------- public hook for other widgets (AI consultant) ---------------- */
  window.FH = {
    addToCart,
    openProduct,
    getProducts: () => state.products,
    money,
  };

  if (document.readyState === "loading")
    document.addEventListener("DOMContentLoaded", boot);
  else boot();
})();
