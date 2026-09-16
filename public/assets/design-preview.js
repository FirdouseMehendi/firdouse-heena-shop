/* Firdouse Heena — henna design preview. Shows a real design photo from
   Firdouse's own portfolio, picked by style (see public/data/designs.json).
   Not AI-generated — real work, so what customers see is what she can do. */
(() => {
  "use strict";

  const $ = (sel, root = document) => root.querySelector(sel);
  let designs = null;

  async function loadDesigns() {
    if (designs) return designs;
    const res = await fetch("data/designs.json");
    designs = await res.json();
    return designs;
  }

  function mount() {
    const form = $("#designPreviewForm");
    if (!form) return;

    const styleSelect = $("#dp-style");
    const result = $("#designPreviewResult");
    const img = $("#designPreviewImg");
    const btn = form.querySelector('button[type="submit"]');
    const lastShown = {};

    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      if (btn.disabled) return;

      const style = styleSelect.value;

      btn.disabled = true;
      btn.textContent = "Loading…";
      result.hidden = true;

      try {
        const all = await loadDesigns();
        const pool = all[style] || [];
        if (!pool.length) throw new Error("No designs for this style yet");

        let pick = pool[Math.floor(Math.random() * pool.length)];
        if (pool.length > 1 && pick.src === lastShown[style]) {
          pick = pool[(pool.indexOf(pick) + 1) % pool.length];
        }
        lastShown[style] = pick.src;

        img.src = pick.src;
        img.alt = pick.alt;
        result.hidden = false;
        result.scrollIntoView({ behavior: "smooth", block: "nearest" });
      } catch {
        alert("Could not load a design preview right now. Please try again.");
      } finally {
        btn.disabled = false;
        btn.textContent = "Show me a design";
      }
    });
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", mount);
  else mount();
})();
