/* Firdouse Heena — AI henna design preview. Generates a design inspiration
   image via Pollinations' free, keyless image API (not a preview on the
   customer's actual hand — see the disclaimer text in index.html). */
(() => {
  "use strict";

  const $ = (sel, root = document) => root.querySelector(sel);

  function mount() {
    const form = $("#designPreviewForm");
    if (!form) return;

    const styleSelect = $("#dp-style");
    const occasionInput = $("#dp-occasion");
    const result = $("#designPreviewResult");
    const img = $("#designPreviewImg");
    const btn = form.querySelector('button[type="submit"]');

    form.addEventListener("submit", (e) => {
      e.preventDefault();
      if (btn.disabled) return;

      const style = styleSelect.value;
      const occasion = occasionInput.value.trim().slice(0, 120);
      const prompt = [
        "intricate traditional mehndi henna design",
        `${style} style`,
        occasion ? `for ${occasion}` : "",
        "dark brown henna paste pattern on hand and fingers, high detail, photorealistic, professional henna artist work",
      ]
        .filter(Boolean)
        .join(", ");

      const seed = Math.floor(Math.random() * 1e6);
      const url = `https://image.pollinations.ai/prompt/${encodeURIComponent(prompt)}?width=768&height=768&nologo=true&seed=${seed}`;

      btn.disabled = true;
      btn.textContent = "Generating…";
      result.hidden = true;

      const loader = new Image();
      loader.onload = () => {
        img.src = url;
        result.hidden = false;
        btn.disabled = false;
        btn.textContent = "Generate design";
        result.scrollIntoView({ behavior: "smooth", block: "nearest" });
      };
      loader.onerror = () => {
        btn.disabled = false;
        btn.textContent = "Generate design";
        alert("Could not generate a preview right now. Please try again.");
      };
      loader.src = url;
    });
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", mount);
  else mount();
})();
