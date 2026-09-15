/* Firdouse Heena — AI henna consultant chat widget. Vanilla JS, no build step. */
(() => {
  "use strict";

  const $ = (sel, root = document) => root.querySelector(sel);
  const esc = (s) =>
    String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

  const history = [];
  let busy = false;

  function mount() {
    const wrap = document.createElement("div");
    wrap.className = "fh-consultant";
    wrap.innerHTML = `
      <button class="fh-consultant-fab" type="button" aria-haspopup="dialog" aria-expanded="false" aria-controls="fhConsultantPanel">
        <span aria-hidden="true">🤍</span><span>Ask our Henna Expert</span>
      </button>
      <section id="fhConsultantPanel" class="fh-consultant-panel" role="dialog" aria-label="AI henna consultant" hidden>
        <header class="fh-consultant-head">
          <strong>Henna Consultant</strong>
          <button class="fh-consultant-close" type="button" aria-label="Close chat">&times;</button>
        </header>
        <div class="fh-consultant-log" id="fhConsultantLog" aria-live="polite"></div>
        <form class="fh-consultant-form" id="fhConsultantForm">
          <label class="visually-hidden" for="fhConsultantInput">Ask about a henna product or care tip</label>
          <input id="fhConsultantInput" type="text" placeholder="e.g. Best henna for a wedding next week?" autocomplete="off" maxlength="500" />
          <button type="submit" aria-label="Send">➤</button>
        </form>
      </section>`;
    document.body.appendChild(wrap);

    const fab = $(".fh-consultant-fab", wrap);
    const panel = $(".fh-consultant-panel", wrap);
    const log = $("#fhConsultantLog", wrap);
    const form = $("#fhConsultantForm", wrap);
    const input = $("#fhConsultantInput", wrap);

    function openPanel() {
      panel.hidden = false;
      fab.setAttribute("aria-expanded", "true");
      if (!log.children.length) {
        addBubble(
          "assistant",
          "Hi! I'm the Firdouse henna consultant. Tell me about your occasion, skin, or a care question and I'll help you pick the right product. 🌿"
        );
      }
      input.focus();
    }
    function closePanel() {
      panel.hidden = true;
      fab.setAttribute("aria-expanded", "false");
      fab.focus();
    }

    fab.addEventListener("click", () => (panel.hidden ? openPanel() : closePanel()));
    $(".fh-consultant-close", wrap).addEventListener("click", closePanel);
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && !panel.hidden) closePanel();
    });

    function addBubble(role, text) {
      const bubble = document.createElement("div");
      bubble.className = `fh-bubble fh-bubble-${role}`;
      bubble.textContent = text;
      log.appendChild(bubble);
      log.scrollTop = log.scrollHeight;
      return bubble;
    }

    function addRecommendations(recs) {
      if (!recs || !recs.length) return;
      const products = window.FH?.getProducts ? window.FH.getProducts() : [];
      const byId = new Map(products.map((p) => [p.id, p]));
      const box = document.createElement("div");
      box.className = "fh-bubble fh-bubble-assistant fh-recs";
      for (const rec of recs) {
        const product = byId.get(rec.id);
        const card = document.createElement("div");
        card.className = "fh-rec-card";
        const priceLabel = product ? window.FH.money(product.ratePerUnit * rec.size) : "";
        card.innerHTML = `
          <div class="fh-rec-title">${esc(rec.title)}</div>
          <div class="fh-rec-meta">${esc(rec.size)}${esc(rec.unit)} &middot; ${esc(priceLabel)}</div>`;
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "btn btn-primary fh-rec-btn";
        btn.textContent = "Add to cart";
        btn.addEventListener("click", () => {
          if (window.FH?.addToCart) window.FH.addToCart(rec.id, rec.size, 1);
          closePanel();
        });
        card.appendChild(btn);
        box.appendChild(card);
      }
      log.appendChild(box);
      log.scrollTop = log.scrollHeight;
    }

    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      const message = input.value.trim();
      if (!message || busy) return;

      addBubble("user", message);
      input.value = "";
      busy = true;
      const thinking = addBubble("assistant", "Thinking…");
      thinking.classList.add("fh-bubble-pending");

      let res, data;
      try {
        res = await fetch("api/consult", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ message, history }),
        });
        data = await res.json();
      } catch {
        data = null;
      }

      thinking.remove();
      busy = false;

      if (!res || !res.ok || !data?.reply) {
        addBubble("assistant", data?.error || "Sorry, something went wrong. Please try again.");
        return;
      }

      addBubble("assistant", data.reply);
      addRecommendations(data.recommendations);
      history.push({ role: "user", content: message });
      history.push({ role: "assistant", content: data.reply });
    });
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", mount);
  else mount();
})();
